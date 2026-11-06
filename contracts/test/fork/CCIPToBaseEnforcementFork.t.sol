// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CCIPLocalSimulatorFork} from "@chainlink/local/src/ccip/CCIPLocalSimulatorFork.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {FloorRegistry} from "../../src/FloorRegistry.sol";
import {FloorBroadcaster} from "../../src/FloorBroadcaster.sol";
import {FloorMirror} from "../../src/FloorMirror.sol";
import {FloorSentinel} from "../../src/FloorSentinel.sol";
import {FloorTypes} from "../../src/FloorTypes.sol";
import {IVaultV2} from "../../src/interfaces/IExternal.sol";
import {MorphoDemo} from "../../script/MorphoDemo.s.sol";

/// "Detected on Ethereum, protection fires on Base, one CCIP hop, no human."
/// Ethereum Sepolia fork: FloorRegistry + FloorBroadcaster. Base Sepolia fork: FloorMirror, a real Morpho Vault V2
/// (official Base Sepolia factory) and a FloorSentinel that reads the MIRROR. Real CCIP contracts on both, routed by
/// chainlink-local's fork simulator. Nothing is broadcast.
contract CCIPToBaseEnforcementForkTest is Test {
    address constant SEPOLIA_ROUTER = 0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59;
    address constant BASE_SEPOLIA_ROUTER = 0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93;
    uint64 constant SEPOLIA_SELECTOR = 16015286601757825753;
    uint64 constant BASE_SEPOLIA_SELECTOR = 10344971235874465080;
    address constant FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;
    address constant RSETH = 0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7;
    address constant BASE_VAULT_FACTORY = 0xE3a2CEbca662d99D0F279aF13a6bb8c9825D2ea0;
    address constant BASE_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    CCIPLocalSimulatorFork sim;
    uint256 sepoliaFork;
    uint256 baseFork;
    FloorRegistry reg;
    FloorBroadcaster bc;
    FloorMirror mirror;
    IVaultV2 vault;
    FloorSentinel sentinel;
    bytes32 id = keccak256(abi.encode("collateralToken", RSETH));

    function setUp() public {
        sepoliaFork = vm.createSelectFork(vm.envOr("SEPOLIA_RPC_URL", string("https://sepolia.gateway.tenderly.co")));
        baseFork = vm.createFork(vm.envOr("BASE_SEPOLIA_RPC_URL", string("https://sepolia.base.org")));
        sim = new CCIPLocalSimulatorFork();
        vm.makePersistent(address(sim));
        reg = new FloorRegistry(FORWARDER, address(0), bytes10(0));
        bc = new FloorBroadcaster(IRouterClient(SEPOLIA_ROUTER), reg);
        vm.deal(address(this), 10 ether);

        vm.selectFork(baseFork);
        mirror = new FloorMirror(BASE_SEPOLIA_ROUTER, SEPOLIA_SELECTOR, address(bc));
        address v;
        (v, sentinel) = new MorphoDemo().runWith(mirror, BASE_VAULT_FACTORY, BASE_USDC);
        vault = IVaultV2(v);
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

    function _send() internal {
        bc.broadcast{value: 1 ether}(BASE_SEPOLIA_SELECTOR, address(mirror), _assets());
        sim.switchChainAndRouteMessage(baseFork);
    }

    function test_laneSepoliaToBaseSepoliaIsSupported() public view {
        assertTrue(IRouterClient(SEPOLIA_ROUTER).isChainSupported(BASE_SEPOLIA_SELECTOR));
    }

    function test_setupOnBase() public {
        vm.selectFork(baseFork);
        assertTrue(vault.isSentinel(address(sentinel)));
        assertEq(address(sentinel.rating()), address(mirror));
        assertEq(vault.absoluteCap(id), 1_000_000e6);
        assertFalse(sentinel.poke(RSETH)); // nothing has arrived over CCIP yet: unrated, no action
    }

    function test_breachedOnEthereumCutsCapOnBase() public {
        _rate(FloorTypes.BREACHED, 24908284);
        uint256 fee = bc.quote(BASE_SEPOLIA_SELECTOR, address(mirror), _assets());
        emit log_named_decimal_uint("CCIP fee Sepolia -> Base Sepolia (ETH)", fee, 18);
        _send();
        assertEq(mirror.ratingOf(RSETH).grade, FloorTypes.BREACHED);
        assertTrue(sentinel.poke(RSETH));
        assertEq(vault.absoluteCap(id), 0);
        assertFalse(sentinel.poke(RSETH)); // idempotent
    }

    function test_degradedOnEthereumLowersRelativeCapOnBase() public {
        _rate(FloorTypes.DEGRADED, 1);
        _send();
        assertTrue(sentinel.poke(RSETH));
        assertEq(vault.relativeCap(id), 0.1e18);
        assertEq(vault.absoluteCap(id), 1_000_000e6);
    }

    /// Recovery on Ethereum (OK at a newer scan) reaches Base but never raises the cap the sentinel cut.
    function test_recoveryNeverRaisesCapOnBase() public {
        _rate(FloorTypes.BREACHED, 10);
        _send();
        assertTrue(sentinel.poke(RSETH));
        vm.selectFork(sepoliaFork);
        _rate(FloorTypes.OK, 11);
        _send();
        assertEq(mirror.ratingOf(RSETH).grade, FloorTypes.OK);
        assertFalse(sentinel.poke(RSETH));
        assertEq(vault.absoluteCap(id), 0);
    }

    /// A broadcaster the mirror does not trust cannot make Base act.
    function test_untrustedSenderCannotTriggerBase() public {
        FloorBroadcaster rogue = new FloorBroadcaster(IRouterClient(SEPOLIA_ROUTER), reg);
        _rate(FloorTypes.BREACHED, 1);
        rogue.broadcast{value: 1 ether}(BASE_SEPOLIA_SELECTOR, address(mirror), _assets());
        sim.setStrictRouting(false);
        sim.switchChainAndRouteMessage(baseFork);
        assertFalse(mirror.ratingOf(RSETH).known);
        assertFalse(sentinel.poke(RSETH));
        assertEq(vault.absoluteCap(id), 1_000_000e6);
    }
}
