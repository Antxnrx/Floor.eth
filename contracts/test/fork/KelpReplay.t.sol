// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {FloorRegistry} from "../../src/FloorRegistry.sol";
import {AaveFreezeEnforcer} from "../../src/AaveFreezeEnforcer.sol";
import {FloorTypes} from "../../src/FloorTypes.sol";
import {IAavePool, IAavePoolConfigurator} from "../../src/interfaces/IExternal.sol";

interface IACLManager {
    function addRiskAdmin(address) external;
}

interface IAavePoolFull {
    function getUserAccountData(address user)
        external
        view
        returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256, uint256, uint256, uint256 healthFactor);
    function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256);
    function liquidationCall(address collateral, address debt, address user, uint256 debtToCover, bool receiveAToken) external;
}

interface IERC20 {
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

/// Kelp rsETH, Apr 18 2026, replayed on an Ethereum mainnet fork with the attacker's REAL transactions (exact sender, target and calldata from chain).
/// Addresses: Aave V3 PoolAddressesProvider 0x2f39…4E9e resolved getPool/getPoolConfigurator/getACLManager/getACLAdmin
/// at block 24,908,300. Tx hashes read from blocks 24,908,301 and 24,908,307. Nothing is broadcast.
/// Caveat we state on stage: installing the enforcer uses the ACL admin (governance) via vm.prank, which in reality
/// needs an Aave governance vote.
contract KelpReplayTest is Test {
    address constant POOL = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    address constant CONFIGURATOR = 0x64b761D848206f447Fe2dd461b0c635Ec39EbB27;
    address constant ACL_MANAGER = 0xc2aaCf6553D20d1e9d78E365AAba8032af9c85b0;
    address constant ACL_ADMIN = 0x5300A1a15135EA4dc7aD5a167152C01EFc9b192A;
    address constant AAVE_ORACLE = 0x54586bE62E3c3580375aE3723C145253060Ca0C2;
    address constant RSETH = 0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7;
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant ATTACKER = 0x1F4C1c2e610f089D6914c4448E6F21Cb0db3adeF;
    // Tx hashes kept for reference; the replay uses their exact calldata from test/fork/kelp-attacker-txs.json.
    bytes32 constant SUPPLY_TX = 0x9a7df4837aa8ca1e22f3f40ffee2fa583e9f0e1e31c970c4d34070e01038057d; // block 24,908,301
    bytes32 constant DELEGATE_TX = 0x376711142668e3b92c3430651beb5aea362b045a08f0227c5add407e9cda5dcc; // block 24,908,305: approveDelegation to the WETH gateway
    bytes32 constant BORROW_TX = 0xdac71a69422da4436307ac962e5067c4838ac63da75379b2ee896f9a9f1bd0b5; // block 24,908,307
    /// bundleHash of our real pre-hack scan (packages/resolver/fixtures/rseth-24908284.json)
    bytes32 constant BUNDLE = 0x385b1ae424c9c5d46bb22a0081d358385a7dda8bd76f314baa42242acda86561;
    address constant FORWARDER = address(0xF0);
    /// Aave V3 custom error ReserveFrozen() = 0x6d305815 (observed from the live Pool on this fork, decoded via openchain).
    bytes4 constant RESERVE_FROZEN = 0x6d305815;

    FloorRegistry reg;
    AaveFreezeEnforcer enforcer;

    function setUp() public {
        // Fork at the attacker's supply tx: state is everything before it in block 24,908,301.
        vm.createSelectFork(vm.envOr("ETH_RPC_URL", string("https://eth.drpc.org")), SUPPLY_TX);
    }


    /// Replays one real attacker tx: same sender, target, value and calldata, at its original block and timestamp.
    function _replay(string memory name) internal returns (bool ok, bytes memory ret) {
        string memory j = vm.readFile("test/fork/kelp-attacker-txs.json");
        string memory k = string.concat(".", name);
        assertEq(vm.parseJsonAddress(j, string.concat(k, ".from")), ATTACKER, "fixture sender");
        address to = vm.parseJsonAddress(j, string.concat(k, ".to"));
        bytes memory data = vm.parseJsonBytes(j, string.concat(k, ".input"));
        uint256 value = vm.parseJsonUint(j, string.concat(k, ".value"));
        vm.roll(vm.parseJsonUint(j, string.concat(k, ".block")));
        vm.warp(vm.parseJsonUint(j, string.concat(k, ".timestamp")));
        vm.prank(ATTACKER);
        (ok, ret) = to.call{value: value}(data);
    }

    /// Pool.multicall bubbles the inner revert data; return its first 4 bytes.
    function _innerSelector(bytes memory err) internal pure returns (bytes4 sel) {
        if (err.length >= 4) sel = bytes4(err);
    }

    function _replayOk(string memory name) internal {
        (bool ok, bytes memory ret) = _replay(name);
        if (!ok) {
            emit log_named_bytes(string.concat(name, " reverted"), ret);
            fail();
        }
    }

    function _installFloorAndRateBreached() internal {
        reg = new FloorRegistry(FORWARDER, address(0), bytes10(0));
        enforcer = new AaveFreezeEnforcer(reg, IAavePool(POOL), IAavePoolConfigurator(CONFIGURATOR));
        vm.prank(ACL_ADMIN); // governance vote, simulated
        IACLManager(ACL_MANAGER).addRiskAdmin(address(enforcer));
        FloorTypes.Update[] memory u = new FloorTypes.Update[](1);
        u[0] = FloorTypes.Update(RSETH, FloorTypes.BREACHED, 24908284, 100, BUNDLE);
        vm.prank(FORWARDER);
        reg.onReport("", abi.encode(u));
        assertTrue(enforcer.poke(RSETH), "enforcer froze rsETH");
        assertTrue(enforcer.isFrozen(RSETH));
    }

    /// (A) Control: without Floor, the real attacker transactions succeed and the attacker borrows.
    function test_A_withoutFloor_attackerBorrows() public {
        uint256 before = ATTACKER.balance;
        _replayOk("SUPPLY");
        (uint256 coll,,,,,) = IAavePoolFull(POOL).getUserAccountData(ATTACKER);
        assertGt(coll, 0, "forged rsETH accepted as collateral");
        _replayOk("DELEGATE");
        _replayOk("BORROW");
        (, uint256 debt,,,,) = IAavePoolFull(POOL).getUserAccountData(ATTACKER);
        assertGt(debt, 0, "attacker has debt");
        assertGt(ATTACKER.balance + 0.01 ether, before + 0.9 ether, "attacker received ~0.98 ETH");
    }

    /// (B) With Floor: rsETH is BREACHED at block 24,908,284, the enforcer freezes it, both real txs fail.
    function test_B_withFloor_attackerBorrowsZero() public {
        _installFloorAndRateBreached();
        uint256 before = ATTACKER.balance;
        (bool okSupply, bytes memory errSupply) = _replay("SUPPLY");
        assertFalse(okSupply, "real supply tx must revert");
        assertEq(_innerSelector(errSupply), RESERVE_FROZEN, "reverts with Aave ReserveFrozen()");
        _replayOk("DELEGATE"); // harmless: a delegation approval moves nothing
        (bool okBorrow,) = _replay("BORROW");
        assertFalse(okBorrow, "real borrow tx must revert: no collateral");
        (uint256 coll, uint256 debt,,,,) = IAavePoolFull(POOL).getUserAccountData(ATTACKER);
        assertEq(coll, 0);
        assertEq(debt, 0, "$0 borrowed on Aave");
        assertLe(ATTACKER.balance, before, "no ETH gained");
    }

    /// (C) Bounded authority: after a freeze, repay and liquidation still work.
    function test_C_freezeNeverBlocksRepayOrLiquidation() public {
        _replayOk("SUPPLY");
        _replayOk("DELEGATE");
        _replayOk("BORROW");
        _installFloorAndRateBreached();

        // repay still works
        (, uint256 debtBefore,,,,) = IAavePoolFull(POOL).getUserAccountData(ATTACKER);
        deal(WETH, ATTACKER, 0.1 ether);
        vm.startPrank(ATTACKER);
        IERC20(WETH).approve(POOL, type(uint256).max);
        IAavePoolFull(POOL).repay(WETH, 0.1 ether, 2, ATTACKER);
        vm.stopPrank();
        (, uint256 debtAfter,,,,) = IAavePoolFull(POOL).getUserAccountData(ATTACKER);
        assertLt(debtAfter, debtBefore, "repay works on a frozen reserve");

        // liquidation still works: crash the rsETH oracle price so health factor < 1
        vm.mockCall(AAVE_ORACLE, abi.encodeWithSignature("getAssetPrice(address)", RSETH), abi.encode(uint256(1e6)));
        (,,,,, uint256 hf) = IAavePoolFull(POOL).getUserAccountData(ATTACKER);
        assertLt(hf, 1e18, "position is liquidatable");
        address liquidator = makeAddr("liquidator");
        deal(WETH, liquidator, 10 ether);
        vm.startPrank(liquidator);
        IERC20(WETH).approve(POOL, type(uint256).max);
        IAavePoolFull(POOL).liquidationCall(RSETH, WETH, ATTACKER, type(uint256).max, false);
        vm.stopPrank();
        assertGt(IERC20(RSETH).balanceOf(liquidator), 0, "liquidator seized frozen rsETH collateral");
    }

    /// Enforcer never acts on a non-BREACHED or unrated asset, and never unfreezes.
    function test_D_enforcerIsBounded() public {
        reg = new FloorRegistry(FORWARDER, address(0), bytes10(0));
        enforcer = new AaveFreezeEnforcer(reg, IAavePool(POOL), IAavePoolConfigurator(CONFIGURATOR));
        vm.prank(ACL_ADMIN);
        IACLManager(ACL_MANAGER).addRiskAdmin(address(enforcer));
        assertFalse(enforcer.poke(RSETH), "unrated: no action");
        FloorTypes.Update[] memory u = new FloorTypes.Update[](1);
        u[0] = FloorTypes.Update(RSETH, FloorTypes.DEGRADED, 1, 100, BUNDLE);
        vm.prank(FORWARDER);
        reg.onReport("", abi.encode(u));
        assertFalse(enforcer.poke(RSETH), "DEGRADED: no freeze");
        assertFalse(enforcer.isFrozen(RSETH));
    }
}
