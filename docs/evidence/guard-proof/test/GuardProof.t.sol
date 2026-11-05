// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Guards.sol";

interface ISafe {
    function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas,
        uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes memory signatures)
        external payable returns (bool);
    function setGuard(address guard) external;
    function enableModule(address module) external;
    function changeThreshold(uint256 t) external;
    function getOwners() external view returns (address[] memory);
    function getThreshold() external view returns (uint256);
    function VERSION() external view returns (string memory);
    function setup(address[] calldata owners, uint256 threshold, address to, bytes calldata data, address fallbackHandler,
        address paymentToken, uint256 payment, address payable paymentReceiver) external;
}

interface IProxyFactory {
    function createProxyWithNonce(address singleton, bytes memory initializer, uint256 salt) external returns (address);
}

interface IMultiSend { function multiSend(bytes memory txs) external payable; }
interface IOApp { function setDelegate(address d) external; function owner() external view returns (address); }

contract GuardProof is Test {
    // ---- Ethereum mainnet (verified with cast, see report) ----
    address constant EP = 0x1a44076050125825900e736c501f859c50fE728c;          // LayerZero EndpointV2
    address constant SEND_ULN = 0xbB2Ea70C9E858123480642Cf96acbcCE1372dCe1;    // SendUln302
    address constant RECV_ULN = 0xc02Ab410f0734EFa3F14628780e6e695156024C2;    // ReceiveUln302
    address constant OAPP = 0x85d456B2DfF1fd8245387C0BfB64Dfb700e98Ef3;        // Kelp rsETH OFT adapter
    address constant KELP_SAFE = 0xCbcdd778AA25476F203814214dD3E9b9c46829A1;   // Safe v1.3.0, 3-of-6, owner+delegate
    address constant MULTISEND_CALLONLY_130 = 0x40A2aCCbd92BCA938b02010E17A5b8929b49130D;
    address constant SAFE_141_SINGLETON = 0x41675C099F32341bf84BFc5382aF534df5C7461a;
    address constant SAFE_141_FACTORY = 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67;
    address constant LZ_DVN = 0x589dEDbD617e0CBcB916A9223F4d1300c294236b;      // LayerZero Labs DVN
    uint32 constant UNICHAIN = 30320;

    address owner0;

    function setUp() public {
        vm.createSelectFork(vm.envOr("RPC", string("https://ethereum-rpc.publicnode.com")), 26351000);
        owner0 = ISafe(KELP_SAFE).getOwners()[0];
        // test shortcut: make it 1-of-6 so a single pranked owner can sign (v=1 "msg.sender is owner" signature)
        vm.prank(KELP_SAFE);
        ISafe(KELP_SAFE).changeThreshold(1);
    }

    // ---------- helpers ----------
    function sig(address o) internal pure returns (bytes memory) {
        return abi.encodePacked(bytes32(uint256(uint160(o))), bytes32(0), uint8(1));
    }

    function exec(address safe, address o, address to, bytes memory data, uint8 op) internal returns (bool) {
        vm.prank(o);
        return ISafe(safe).execTransaction(to, 0, data, op, 0, 0, 0, address(0), payable(address(0)), sig(o));
    }

    function getGuard(address safe) internal view returns (address) {
        return address(uint160(uint256(vm.load(safe, 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8))));
    }

    function weak1DVN() internal pure returns (bytes memory) {
        address[] memory req = new address[](1);
        req[0] = LZ_DVN;
        return abi.encode(UlnConfig(15, 1, 0, 0, req, new address[](0)));
    }

    // looks like 3 DVNs, but quorum is "any 1 of 3"
    function fake3DVN() internal pure returns (bytes memory) {
        address[] memory opt = new address[](3); // ascending order required by ULN
        opt[0] = 0x380275805876Ff19055EA900CDb2B46a94ecF20D;
        opt[1] = LZ_DVN;
        opt[2] = 0xa4fE5A5B9A846458a70Cd0748228aED3bF65c2cd;
        return abi.encode(UlnConfig(15, type(uint8).max /*NIL = none required*/, 3, 1, new address[](0), opt));
    }

    function setConfigCalldata(bytes memory cfg) internal pure returns (bytes memory) {
        SetConfigParam[] memory ps = new SetConfigParam[](1);
        ps[0] = SetConfigParam(UNICHAIN, 2, cfg);
        return abi.encodeCall(IEndpointV2.setConfig, (OAPP, SEND_ULN, ps));
    }

    function effective(address lib) internal view returns (UlnConfig memory) {
        return abi.decode(IEndpointV2(EP).getConfig(OAPP, lib, UNICHAIN, 2), (UlnConfig));
    }

    function installGuard(address g) internal {
        assertTrue(exec(KELP_SAFE, owner0, KELP_SAFE, abi.encodeCall(ISafe.setGuard, (g)), 0));
        assertEq(getGuard(KELP_SAFE), g);
    }

    // ===================== (a) bricking =====================

    function test_a1_AlwaysRevertGuard_BricksSafe_IncludingItsOwnRemoval() public {
        installGuard(address(new AlwaysRevertGuard()));
        // removing the guard is itself a Safe tx -> checked by the guard -> reverts
        vm.prank(owner0);
        vm.expectRevert(bytes("guard: no"));
        ISafe(KELP_SAFE).execTransaction(KELP_SAFE, 0, abi.encodeCall(ISafe.setGuard, (address(0))), 0, 0, 0, 0, address(0), payable(address(0)), sig(owner0));
        // even a direct call is impossible: setGuard is `authorized` (msg.sender == safe)
        vm.prank(owner0);
        vm.expectRevert(bytes("GS031"));
        ISafe(KELP_SAFE).setGuard(address(0));
        // and the Safe can no longer manage LayerZero config at all (incident response blocked)
        vm.prank(owner0);
        vm.expectRevert(bytes("guard: no"));
        ISafe(KELP_SAFE).execTransaction(EP, 0, setConfigCalldata(weak1DVN()), 0, 0, 0, 0, address(0), payable(address(0)), sig(owner0));
    }

    function test_a2_v130_AcceptsGuardWithNoCode_TypoBricksSafe() public {
        // v1.3.0 setGuard has no ERC165 check (GuardManager.sol L34-41)
        address typo = address(0xdead);
        installGuard(typo);
        vm.prank(owner0);
        vm.expectRevert(); // high-level call to an address without code reverts
        ISafe(KELP_SAFE).execTransaction(KELP_SAFE, 0, abi.encodeCall(ISafe.setGuard, (address(0))), 0, 0, 0, 0, address(0), payable(address(0)), sig(owner0));
    }

    function test_a3_v141_ERC165CheckStopsTypo_ButNotABrokenGuard() public {
        address[] memory owners = new address[](1);
        owners[0] = owner0;
        bytes memory init = abi.encodeCall(ISafe.setup, (owners, 1, address(0), "", address(0), address(0), 0, payable(address(0))));
        address s = IProxyFactory(SAFE_141_FACTORY).createProxyWithNonce(SAFE_141_SINGLETON, init, 42);
        assertEq(ISafe(s).VERSION(), "1.4.1");
        // typo address rejected by GS300 -> inner call fails -> GS013
        vm.prank(owner0);
        vm.expectRevert(bytes("GS013"));
        ISafe(s).execTransaction(s, 0, abi.encodeCall(ISafe.setGuard, (address(0xdead))), 0, 0, 0, 0, address(0), payable(address(0)), sig(owner0));
        // but a guard that implements ERC165 and reverts still bricks it
        address g = address(new AlwaysRevertGuard());
        assertTrue(exec(s, owner0, s, abi.encodeCall(ISafe.setGuard, (g)), 0));
        vm.prank(owner0);
        vm.expectRevert(bytes("guard: no"));
        ISafe(s).execTransaction(s, 0, abi.encodeCall(ISafe.setGuard, (address(0))), 0, 0, 0, 0, address(0), payable(address(0)), sig(owner0));
    }

    // ===================== naive guard works on the happy path =====================

    function test_naive_BlocksDirectWeakSetConfig() public {
        installGuard(address(new NaiveFloorGuard(EP, 3)));
        vm.prank(owner0);
        vm.expectRevert(bytes("floor: too few DVNs"));
        ISafe(KELP_SAFE).execTransaction(EP, 0, setConfigCalldata(weak1DVN()), 0, 0, 0, 0, address(0), payable(address(0)), sig(owner0));
    }

    // ===================== (b) MultiSend delegatecall bypass =====================

    function test_b1_MultiSendDelegatecall_BypassesNaiveGuard() public {
        installGuard(address(new NaiveFloorGuard(EP, 3)));
        bytes memory inner = setConfigCalldata(weak1DVN());
        bytes memory batch = abi.encodePacked(uint8(0), EP, uint256(0), uint256(inner.length), inner);
        // outer tx: to = MultiSendCallOnly, operation = 1 (delegatecall). Guard only sees `to != endpoint`.
        assertTrue(exec(KELP_SAFE, owner0, MULTISEND_CALLONLY_130, abi.encodeCall(IMultiSend.multiSend, (batch)), 1));
        UlnConfig memory c = effective(SEND_ULN);
        assertEq(c.requiredDVNCount, 1, "route now 1 DVN");
        assertEq(c.requiredDVNs[0], LZ_DVN);
    }

    function test_b2_DelegatecallWipesGuardSlot_NoChangedGuardEvent() public {
        installGuard(address(new NaiveFloorGuard(EP, 3)));
        address wiper = address(new GuardSlotWiper());
        vm.recordLogs();
        assertTrue(exec(KELP_SAFE, owner0, wiper, abi.encodeCall(GuardSlotWiper.wipe, ()), 1));
        assertEq(getGuard(KELP_SAFE), address(0), "guard silently removed");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 changedGuard = keccak256("ChangedGuard(address)");
        for (uint256 i = 0; i < logs.length; i++) assertTrue(logs[i].topics[0] != changedGuard, "no ChangedGuard emitted");
    }

    // ===================== (c) module bypass (v1.3.0 / v1.4.1) =====================

    function test_c_ModuleTx_BypassesGuardEntirely() public {
        SimpleModule m = new SimpleModule();
        assertTrue(exec(KELP_SAFE, owner0, KELP_SAFE, abi.encodeCall(ISafe.enableModule, (address(m))), 0));
        installGuard(address(new AlwaysRevertGuard())); // even a guard that blocks EVERYTHING
        // module path never calls the guard (ModuleManager.execTransactionFromModule)
        assertTrue(m.exec(KELP_SAFE, EP, setConfigCalldata(weak1DVN())));
        assertEq(effective(SEND_ULN).requiredDVNCount, 1);
        // the same path also removes the guard (= the only unbrick route, and an attack route)
        assertTrue(m.exec(KELP_SAFE, KELP_SAFE, abi.encodeCall(ISafe.setGuard, (address(0)))));
        assertEq(getGuard(KELP_SAFE), address(0));
    }

    // ===================== (d) LZ delegate bypass =====================

    function test_d_SetDelegate_ThenDelegateCallsEndpointDirectly() public {
        installGuard(address(new NaiveFloorGuard(EP, 3)));
        address hot = makeAddr("hotWallet");
        // Safe (OApp owner) calls OApp.setDelegate(hot). Naive guard ignores it: to != endpoint
        assertTrue(exec(KELP_SAFE, owner0, OAPP, abi.encodeCall(IOApp.setDelegate, (hot)), 0));
        assertEq(IEndpointV2(EP).delegates(OAPP), hot);
        // hot wallet now configures LayerZero directly. Safe + guard are not in the call path.
        vm.prank(hot);
        IEndpointV2(EP).setConfig(OAPP, SEND_ULN, _ps(weak1DVN()));
        assertEq(effective(SEND_ULN).requiredDVNCount, 1);
    }

    // ===================== (e) semantic trap: "3 DVNs" that is really 1-of-3 =====================

    function test_e_OptionalThreshold_FakesThreeDVNs() public {
        installGuard(address(new NaiveFloorGuard(EP, 3)));
        assertTrue(exec(KELP_SAFE, owner0, EP, setConfigCalldata(fake3DVN()), 0));
        UlnConfig memory c = effective(SEND_ULN);
        assertEq(c.requiredDVNCount, 0);
        assertEq(c.optionalDVNThreshold, 1, "any single DVN can verify");
    }

    // ===================== (f) default inheritance: count 0 = LayerZero default =====================

    function test_f_DefaultForUnichain_IsOneDVN_LZDeadDVN() public view {
        // effective config of an OApp that never set anything = LZ default
        UlnConfig memory d = abi.decode(IEndpointV2(EP).getConfig(address(0xdEaD), SEND_ULN, UNICHAIN, 2), (UlnConfig));
        assertEq(d.requiredDVNCount, 1);
        assertEq(d.confirmations, 15);
    }

    // ===================== hardened post-state guard =====================

    function _routes() internal pure returns (PostStateFloorGuard.Route[] memory r) {
        r = new PostStateFloorGuard.Route[](2);
        r[0] = PostStateFloorGuard.Route(SEND_ULN, UNICHAIN);
        r[1] = PostStateFloorGuard.Route(RECV_ULN, UNICHAIN);
    }

    function _hardened() internal returns (PostStateFloorGuard g) {
        g = new PostStateFloorGuard(EP, OAPP, KELP_SAFE, 3, 15, _routes());
        installGuard(address(g));
    }

    function test_h1_Hardened_BlocksDirect_MultiSend_FakeThree_AndSetDelegate() public {
        _hardened();
        bytes memory inner = setConfigCalldata(weak1DVN());
        bytes memory batch = abi.encodePacked(uint8(0), EP, uint256(0), uint256(inner.length), inner);
        address hot = makeAddr("hotWallet");

        vm.startPrank(owner0);
        vm.expectRevert(bytes("floor: route weakened below floor"));
        ISafe(KELP_SAFE).execTransaction(EP, 0, inner, 0, 0, 0, 0, address(0), payable(address(0)), sig(owner0));
        vm.expectRevert(bytes("floor: route weakened below floor"));
        ISafe(KELP_SAFE).execTransaction(MULTISEND_CALLONLY_130, 0, abi.encodeCall(IMultiSend.multiSend, (batch)), 1, 0, 0, 0, address(0), payable(address(0)), sig(owner0));
        vm.expectRevert(bytes("floor: route weakened below floor"));
        ISafe(KELP_SAFE).execTransaction(EP, 0, setConfigCalldata(fake3DVN()), 0, 0, 0, 0, address(0), payable(address(0)), sig(owner0));
        vm.expectRevert(bytes("floor: delegate/library changed"));
        ISafe(KELP_SAFE).execTransaction(OAPP, 0, abi.encodeCall(IOApp.setDelegate, (hot)), 0, 0, 0, 0, address(0), payable(address(0)), sig(owner0));
        vm.stopPrank();
        assertEq(effective(SEND_ULN).requiredDVNCount, 4, "unchanged");
    }

    function test_h2_Hardened_DoesNotBrick_WhenLZDefaultDegradesExternally() public {
        // OApp currently inherits the LZ default on this route (simulate: point send config at DEFAULT)
        vm.prank(KELP_SAFE);
        IEndpointV2(EP).setConfig(OAPP, SEND_ULN, _ps(abi.encode(UlnConfig(0, 0, 0, 0, new address[](0), new address[](0)))));
        assertEq(effective(SEND_ULN).requiredDVNCount, 1, "already below floor via default");
        _hardened(); // installing while already in breach must not brick
        // unrelated tx (e.g. enabling a recovery module, paying a bill) still works
        assertTrue(exec(KELP_SAFE, owner0, KELP_SAFE, abi.encodeCall(ISafe.changeThreshold, (1)), 0));
        // a FIX that raises the route is allowed
        assertTrue(exec(KELP_SAFE, owner0, EP, setConfigCalldata(_strong4()), 0));
        assertEq(effective(SEND_ULN).requiredDVNCount, 4);
    }

    function test_h3_Hardened_RemovalAlwaysPossible_SoQuorumCanStillDoTwoStepWeakening() public {
        _hardened();
        assertTrue(exec(KELP_SAFE, owner0, KELP_SAFE, abi.encodeCall(ISafe.setGuard, (address(0))), 0));
        assertTrue(exec(KELP_SAFE, owner0, EP, setConfigCalldata(weak1DVN()), 0));
        assertEq(effective(SEND_ULN).requiredDVNCount, 1, "guard is a seatbelt, not a lock");
    }

    function test_h4_Hardened_StillBypassedByModules() public {
        SimpleModule m = new SimpleModule();
        assertTrue(exec(KELP_SAFE, owner0, KELP_SAFE, abi.encodeCall(ISafe.enableModule, (address(m))), 0));
        _hardened();
        assertTrue(m.exec(KELP_SAFE, EP, setConfigCalldata(weak1DVN())));
        assertEq(effective(SEND_ULN).requiredDVNCount, 1);
    }

    function test_h5_Hardened_CatchesDelegatecallThatWipesGuardThenWeakens() public {
        _hardened();
        address wiper = address(new GuardSlotWiper());
        bytes memory d = abi.encodeCall(GuardSlotWiper.wipeAndWeaken, (EP, OAPP, SEND_ULN, _ps(weak1DVN())));
        vm.prank(owner0);
        // Safe caches the guard address before execution, so the post-check still runs
        vm.expectRevert(bytes("floor: guard slot tampered"));
        ISafe(KELP_SAFE).execTransaction(wiper, 0, d, 1, 0, 0, 0, address(0), payable(address(0)), sig(owner0));
        // silent wipe alone is also blocked
        vm.prank(owner0);
        vm.expectRevert(bytes("floor: guard slot tampered"));
        ISafe(KELP_SAFE).execTransaction(wiper, 0, abi.encodeCall(GuardSlotWiper.wipe, ()), 1, 0, 0, 0, address(0), payable(address(0)), sig(owner0));
        assertEq(effective(SEND_ULN).requiredDVNCount, 4);
    }

    function test_gas_HardenedOverhead() public {
        _hardened();
        uint256 g0 = gasleft();
        exec(KELP_SAFE, owner0, KELP_SAFE, abi.encodeCall(ISafe.changeThreshold, (1)), 0);
        emit log_named_uint("gas for trivial Safe tx with hardened guard (2 routes)", g0 - gasleft());
    }

    function test_gas_Baseline_NoGuard() public {
        uint256 g0 = gasleft();
        exec(KELP_SAFE, owner0, KELP_SAFE, abi.encodeCall(ISafe.changeThreshold, (1)), 0);
        emit log_named_uint("gas for trivial Safe tx, no guard", g0 - gasleft());
    }

    function _strong4() internal view returns (bytes memory) {
        // re-use Kelp's original 4-DVN required set read at setUp fork block from the receive side? use send side snapshot
        address[] memory req = new address[](4);
        req[0] = 0x380275805876Ff19055EA900CDb2B46a94ecF20D;
        req[1] = LZ_DVN;
        req[2] = 0xa4fE5A5B9A846458a70Cd0748228aED3bF65c2cd;
        req[3] = 0xa59BA433ac34D2927232918Ef5B2eaAfcF130BA5;
        return abi.encode(UlnConfig(64, 4, 0, 0, req, new address[](0)));
    }

    function _ps(bytes memory cfg) internal pure returns (SetConfigParam[] memory ps) {
        ps = new SetConfigParam[](1);
        ps[0] = SetConfigParam(UNICHAIN, 2, cfg);
    }
}
