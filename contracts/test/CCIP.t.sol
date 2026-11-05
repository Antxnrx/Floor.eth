// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CCIPLocalSimulator} from "@chainlink/local/src/ccip/CCIPLocalSimulator.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {FloorRegistry} from "../src/FloorRegistry.sol";
import {FloorBroadcaster} from "../src/FloorBroadcaster.sol";
import {FloorMirror} from "../src/FloorMirror.sol";
import {FloorTypes} from "../src/FloorTypes.sol";

// CCIP 2.0 round trip on chainlink-local v0.3.1 (pins chainlink contracts-ccip 2.0.0):
// CRE report -> FloorRegistry -> FloorBroadcaster.ccipSend -> FloorMirror._ccipReceive (state change).
contract CCIPTest is Test {
    address constant FORWARDER = address(0xF0);
    address constant RSETH = 0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7;
    CCIPLocalSimulator sim;
    IRouterClient router;
    uint64 selector;
    FloorRegistry reg;
    FloorBroadcaster bc;
    FloorMirror mirror;

    function setUp() public {
        sim = new CCIPLocalSimulator();
        (selector, router,,,,,) = sim.configuration();
        reg = new FloorRegistry(FORWARDER, address(0), bytes10(0));
        bc = new FloorBroadcaster(router, reg);
        mirror = new FloorMirror(address(router), selector, address(bc));
    }

    function _rate(address asset, uint8 grade, uint64 blk) internal {
        FloorTypes.Update[] memory u = new FloorTypes.Update[](1);
        u[0] = FloorTypes.Update(asset, grade, blk, 100, keccak256("bundle"));
        vm.prank(FORWARDER);
        reg.onReport("", abi.encode(u));
    }

    function _assets(address a) internal pure returns (address[] memory xs) {
        xs = new address[](1);
        xs[0] = a;
    }

    function test_breachedRatingIsMirroredCrossChain() public {
        _rate(RSETH, FloorTypes.BREACHED, 24908284);
        assertFalse(mirror.ratingOf(RSETH).known);
        bc.broadcast{value: 1 ether}(selector, address(mirror), _assets(RSETH));
        FloorTypes.Rating memory m = mirror.ratingOf(RSETH);
        assertTrue(m.known);
        assertEq(m.grade, FloorTypes.BREACHED);
        assertEq(m.scanBlock, 24908284);
        assertEq(m.bundleHash, keccak256("bundle"));
    }

    function test_feeExcessIsRefunded() public {
        _rate(RSETH, FloorTypes.DEGRADED, 1);
        uint256 fee = bc.quote(selector, address(mirror), _assets(RSETH));
        uint256 before = address(this).balance;
        bc.broadcast{value: fee + 1 ether}(selector, address(mirror), _assets(RSETH));
        assertEq(before - address(this).balance, fee);
        assertEq(address(bc).balance, 0, "broadcaster holds no funds");
    }

    function test_unratedAssetsAreNeverBroadcast() public {
        vm.expectRevert(FloorBroadcaster.NothingToBroadcast.selector);
        bc.broadcast(selector, address(mirror), _assets(address(0xBEEF)));
    }

    function test_mirrorRejectsWrongSender() public {
        // A message to the mirror from any contract other than the configured broadcaster must not change state.
        FloorTypes.Update[] memory u = new FloorTypes.Update[](1);
        u[0] = FloorTypes.Update(RSETH, FloorTypes.OK, 9e9, 100, bytes32(0));
        Client.EVM2AnyMessage memory m = Client.EVM2AnyMessage({
            receiver: abi.encode(address(mirror)),
            data: abi.encode(u),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            feeToken: address(0),
            extraArgs: ""
        });
        // exact failure: the router wraps the mirror's WrongSource(selector, sender) in ReceiverError
        bytes memory inner = abi.encodeWithSelector(FloorMirror.WrongSource.selector, selector, address(this));
        vm.expectRevert(abi.encodeWithSignature("ReceiverError(bytes)", inner));
        router.ccipSend(selector, m);
        assertFalse(mirror.ratingOf(RSETH).known);
    }

    function test_mirrorRejectsDirectCalls() public {
        Client.Any2EVMMessage memory m;
        vm.expectRevert(abi.encodeWithSignature("InvalidRouter(address)", address(this)));
        mirror.ccipReceive(m);
    }

    function test_staleMirrorUpdateSkipped() public {
        _rate(RSETH, FloorTypes.BREACHED, 200);
        bc.broadcast{value: 1 ether}(selector, address(mirror), _assets(RSETH));
        // re-broadcasting the same (unchanged) rating is a no-op, not a revert
        bc.broadcast{value: 1 ether}(selector, address(mirror), _assets(RSETH));
        assertEq(mirror.ratingOf(RSETH).scanBlock, 200);
    }

    receive() external payable {}
}
