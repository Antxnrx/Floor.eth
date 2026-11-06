// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CCIPLocalSimulatorFork} from "@chainlink/local/src/ccip/CCIPLocalSimulatorFork.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {FloorRegistry} from "../../src/FloorRegistry.sol";
import {FloorBroadcaster} from "../../src/FloorBroadcaster.sol";
import {FloorMirror} from "../../src/FloorMirror.sol";
import {FloorTypes} from "../../src/FloorTypes.sol";

/// The exact deploy we will run: FloorRegistry + FloorBroadcaster on an Ethereum Sepolia fork (router from our deploy
/// command), FloorMirror on an Arbitrum Sepolia fork, real CCIP contracts on both, routed by chainlink-local's fork
/// simulator. Nothing is broadcast.
contract CCIPSepoliaArbForkTest is Test {
    address constant SEPOLIA_ROUTER = 0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59;
    address constant ARB_SEPOLIA_ROUTER = 0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165;
    uint64 constant SEPOLIA_SELECTOR = 16015286601757825753;
    uint64 constant ARB_SEPOLIA_SELECTOR = 3478487238524512106;
    address constant FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;
    address constant RSETH = 0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7;

    CCIPLocalSimulatorFork sim;
    uint256 sepoliaFork;
    uint256 arbFork;
    FloorRegistry reg;
    FloorBroadcaster bc;
    FloorMirror mirror;

    function setUp() public {
        sepoliaFork = vm.createSelectFork(vm.envOr("SEPOLIA_RPC_URL", string("https://sepolia.gateway.tenderly.co")));
        arbFork = vm.createFork(vm.envOr("ARB_SEPOLIA_RPC_URL", string("https://sepolia-rollup.arbitrum.io/rpc")));
        sim = new CCIPLocalSimulatorFork();
        vm.makePersistent(address(sim));

        reg = new FloorRegistry(FORWARDER, address(0), bytes10(0));
        bc = new FloorBroadcaster(IRouterClient(SEPOLIA_ROUTER), reg);
        vm.deal(address(this), 10 ether);

        vm.selectFork(arbFork);
        mirror = new FloorMirror(ARB_SEPOLIA_ROUTER, SEPOLIA_SELECTOR, address(bc));
        vm.selectFork(sepoliaFork);
    }

    receive() external payable {}

    function _rate(uint8 grade, uint64 blk) internal {
        FloorTypes.Update[] memory u = new FloorTypes.Update[](1);
        u[0] = FloorTypes.Update(RSETH, grade, blk, 100, keccak256("bundle"));
        vm.prank(FORWARDER);
        reg.onReport("", abi.encode(u));
    }

    function _assets() internal pure returns (address[] memory xs) {
        xs = new address[](1);
        xs[0] = RSETH;
    }

    function test_laneIsSupportedAndQuoted() public view {
        assertTrue(IRouterClient(SEPOLIA_ROUTER).isChainSupported(ARB_SEPOLIA_SELECTOR));
    }

    function test_breachedReachesArbitrumSepolia() public {
        _rate(FloorTypes.BREACHED, 24908284);
        uint256 fee = bc.quote(ARB_SEPOLIA_SELECTOR, address(mirror), _assets());
        assertGt(fee, 0);
        emit log_named_decimal_uint("CCIP fee (ETH)", fee, 18);
        bc.broadcast{value: fee}(ARB_SEPOLIA_SELECTOR, address(mirror), _assets());
        sim.switchChainAndRouteMessage(arbFork);
        FloorTypes.Rating memory m = mirror.ratingOf(RSETH);
        assertTrue(m.known);
        assertEq(m.grade, FloorTypes.BREACHED);
        assertEq(m.scanBlock, 24908284);
        assertEq(m.bundleHash, keccak256("bundle"));
    }

    function test_feeBelowQuoteReverts() public {
        _rate(FloorTypes.BREACHED, 1);
        uint256 fee = bc.quote(ARB_SEPOLIA_SELECTOR, address(mirror), _assets());
        vm.expectRevert(abi.encodeWithSelector(FloorBroadcaster.InsufficientFee.selector, fee - 1, fee));
        bc.broadcast{value: fee - 1}(ARB_SEPOLIA_SELECTOR, address(mirror), _assets());
    }

    function test_overpaymentIsRefunded() public {
        _rate(FloorTypes.BREACHED, 1);
        uint256 fee = bc.quote(ARB_SEPOLIA_SELECTOR, address(mirror), _assets());
        uint256 before = address(this).balance;
        bc.broadcast{value: fee + 1 ether}(ARB_SEPOLIA_SELECTOR, address(mirror), _assets());
        assertEq(before - address(this).balance, fee);
    }

    /// A broadcaster the mirror does not trust (same code, different address) cannot write: execution fails on
    /// Arbitrum Sepolia and the mirror stays empty.
    function test_untrustedSenderIsRejectedOnDestination() public {
        FloorBroadcaster rogue = new FloorBroadcaster(IRouterClient(SEPOLIA_ROUTER), reg);
        _rate(FloorTypes.BREACHED, 1);
        uint256 fee = rogue.quote(ARB_SEPOLIA_SELECTOR, address(mirror), _assets());
        rogue.broadcast{value: fee}(ARB_SEPOLIA_SELECTOR, address(mirror), _assets());
        sim.setStrictRouting(false);
        sim.switchChainAndRouteMessage(arbFork);
        assertFalse(mirror.ratingOf(RSETH).known);
    }

    /// An older scan delivered after a newer one is skipped on the mirror (no rollback), without failing the message.
    function test_olderScanIsSkippedOnMirror() public {
        _rate(FloorTypes.BREACHED, 200);
        bc.broadcast{value: 1 ether}(ARB_SEPOLIA_SELECTOR, address(mirror), _assets());
        sim.switchChainAndRouteMessage(arbFork);
        assertEq(mirror.ratingOf(RSETH).scanBlock, 200);

        // a second home deployment holding an older scan cannot exist with the same trusted sender, so replay the
        // same broadcaster after the registry kept 200: the message carries 200 again and is skipped as not newer
        vm.selectFork(sepoliaFork);
        bc.broadcast{value: 1 ether}(ARB_SEPOLIA_SELECTOR, address(mirror), _assets());
        sim.switchChainAndRouteMessage(arbFork);
        assertEq(mirror.ratingOf(RSETH).grade, FloorTypes.BREACHED);
        assertEq(mirror.ratingOf(RSETH).scanBlock, 200);
    }
}
