// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ---------- minimal interfaces (match deployed mainnet contracts) ----------
struct UlnConfig {
    uint64 confirmations;
    uint8 requiredDVNCount;
    uint8 optionalDVNCount;
    uint8 optionalDVNThreshold;
    address[] requiredDVNs;
    address[] optionalDVNs;
}

struct SetConfigParam {
    uint32 eid;
    uint32 configType;
    bytes config;
}

interface IEndpointV2 {
    function setConfig(address oapp, address lib, SetConfigParam[] calldata params) external;
    function getConfig(address oapp, address lib, uint32 eid, uint32 configType) external view returns (bytes memory);
    function delegates(address oapp) external view returns (address);
    function getSendLibrary(address sender, uint32 eid) external view returns (address);
    function getReceiveLibrary(address receiver, uint32 eid) external view returns (address, bool);
}

interface IERC165 {
    function supportsInterface(bytes4 id) external view returns (bool);
}

// Safe v1.3.0 / v1.4.1 Guard interface (same selectors)
interface ISafeGuard {
    function checkTransaction(
        address to, uint256 value, bytes memory data, uint8 operation,
        uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken,
        address payable refundReceiver, bytes memory signatures, address msgSender
    ) external;
    function checkAfterExecution(bytes32 txHash, bool success) external;
}

abstract contract GuardBase is ISafeGuard, IERC165 {
    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == type(ISafeGuard).interfaceId || id == 0x01ffc9a7; // 0xe6d7a83a | ERC165
    }
}

/// (a) a broken guard: reverts on everything. ERC165 check passes.
contract AlwaysRevertGuard is GuardBase {
    function checkTransaction(address, uint256, bytes memory, uint8, uint256, uint256, uint256, address, address payable, bytes memory, address) external pure {
        revert("guard: no");
    }
    function checkAfterExecution(bytes32, bool) external pure {}
}

/// Naive Floor guard: only inspects a direct CALL to the endpoint's setConfig and counts DVN addresses.
contract NaiveFloorGuard is GuardBase {
    address public immutable endpoint;
    uint256 public immutable minDVNs;
    constructor(address _endpoint, uint256 _min) { endpoint = _endpoint; minDVNs = _min; }

    function checkTransaction(address to, uint256, bytes memory data, uint8, uint256, uint256, uint256, address, address payable, bytes memory, address) external view {
        if (to != endpoint || data.length < 4) return;
        if (bytes4(data) != IEndpointV2.setConfig.selector) return;
        bytes memory args = new bytes(data.length - 4);
        for (uint256 i = 0; i < args.length; i++) args[i] = data[i + 4];
        (, , SetConfigParam[] memory ps) = abi.decode(args, (address, address, SetConfigParam[]));
        for (uint256 i = 0; i < ps.length; i++) {
            if (ps[i].configType != 2) continue;
            UlnConfig memory c = abi.decode(ps[i].config, (UlnConfig));
            // BUG (typical): counts DVN addresses instead of the effective quorum
            require(c.requiredDVNs.length + c.optionalDVNs.length >= minDVNs, "floor: too few DVNs");
        }
    }
    function checkAfterExecution(bytes32, bool) external pure {}
}

/// Hardened sketch: does NOT decode calldata. Snapshots effective LZ state before, re-reads it after,
/// and reverts ONLY if this Safe tx made a watched route worse (so external changes never brick the Safe).
contract PostStateFloorGuard is GuardBase {
    struct Route { address lib; uint32 eid; }
    IEndpointV2 public immutable ep;
    address public immutable oapp;
    address public immutable safe;
    uint8 public immutable minRequired;
    uint64 public immutable minConf;
    Route[] public routes;

    bytes32 private preHash; // snapshot of non-score state (delegate, libs)
    uint256[] private preScore;
    bool private allowGuardChange;
    bytes32 constant GUARD_SLOT = 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;
    bytes4 constant SET_GUARD = bytes4(keccak256("setGuard(address)"));

    function _guardSlot() internal view returns (address g) {
        (bool ok, bytes memory r) = safe.staticcall(abi.encodeWithSignature("getStorageAt(uint256,uint256)", uint256(GUARD_SLOT), 1));
        require(ok, "floor: getStorageAt");
        (bytes memory word) = abi.decode(r, (bytes));
        g = address(uint160(uint256(bytes32(word))));
    }

    constructor(address _ep, address _oapp, address _safe, uint8 _minReq, uint64 _minConf, Route[] memory _routes) {
        ep = IEndpointV2(_ep); oapp = _oapp; safe = _safe; minRequired = _minReq; minConf = _minConf;
        for (uint256 i = 0; i < _routes.length; i++) routes.push(_routes[i]);
    }

    function score(Route memory r) public view returns (uint256) {
        UlnConfig memory c = abi.decode(ep.getConfig(oapp, r.lib, r.eid, 2), (UlnConfig)); // EFFECTIVE config (defaults resolved)
        // effective quorum = all required + optional threshold
        uint256 q = uint256(c.requiredDVNCount) + uint256(c.optionalDVNThreshold);
        if (c.confirmations < minConf) return 0;
        return q;
    }

    function _structural() internal view returns (bytes32 h) {
        h = keccak256(abi.encode(ep.delegates(oapp)));
        for (uint256 i = 0; i < routes.length; i++) {
            (address rl, bool isDef) = ep.getReceiveLibrary(oapp, routes[i].eid);
            h = keccak256(abi.encode(h, ep.getSendLibrary(oapp, routes[i].eid), rl, isDef));
        }
    }

    // never reverts (fail-open on the pre-check; only takes a snapshot)
    function checkTransaction(address to, uint256, bytes memory data, uint8 op, uint256, uint256, uint256, address, address payable, bytes memory, address) external {
        if (msg.sender != safe) return;
        // the ONLY way to change the guard: a plain CALL to Safe.setGuard (never blocked)
        allowGuardChange = (to == safe && op == 0 && data.length >= 4 && bytes4(data) == SET_GUARD);
        delete preScore;
        for (uint256 i = 0; i < routes.length; i++) preScore.push(score(routes[i]));
        preHash = _structural();
    }

    function checkAfterExecution(bytes32, bool) external {
        if (msg.sender != safe) return;
        if (!allowGuardChange) require(_guardSlot() == address(this), "floor: guard slot tampered");
        require(_structural() == preHash, "floor: delegate/library changed");
        for (uint256 i = 0; i < routes.length; i++) {
            uint256 s = score(routes[i]);
            // block only a WORSENING that ends below the floor
            if (s < preScore[i] && s < minRequired) revert("floor: route weakened below floor");
        }
    }
}

/// Delegatecall payload that silently clears the Safe guard slot (no ChangedGuard event).
contract GuardSlotWiper {
    function wipe() external {
        assembly { sstore(0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8, 0) }
    }
    // runs in the Safe's context: wipe guard, then weaken LZ config as the Safe
    function wipeAndWeaken(address ep, address oapp, address lib, SetConfigParam[] calldata ps) external {
        assembly { sstore(0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8, 0) }
        IEndpointV2(ep).setConfig(oapp, lib, ps);
    }
}

/// Minimal Safe module
interface ISafeModuleExec {
    function execTransactionFromModule(address to, uint256 value, bytes memory data, uint8 operation) external returns (bool);
}
contract SimpleModule {
    function exec(address safe, address to, bytes calldata data) external returns (bool) {
        return ISafeModuleExec(safe).execTransactionFromModule(to, 0, data, 0);
    }
}
