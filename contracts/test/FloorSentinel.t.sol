// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {FloorRegistry} from "../src/FloorRegistry.sol";
import {FloorSentinel} from "../src/FloorSentinel.sol";
import {FloorTypes} from "../src/FloorTypes.sol";
import {IVaultV2} from "../src/interfaces/IExternal.sol";
import {MockVaultV2} from "./mocks/MockVaultV2.sol";

abstract contract SentinelBase is Test {
    address constant FORWARDER = address(0xF0);
    address constant CURATOR = address(0xC0);
    address constant ASSET = address(0xA55E7);
    bytes idData = abi.encode("collateralToken", ASSET);
    bytes32 id = keccak256(abi.encode("collateralToken", ASSET));
    FloorRegistry reg;
    MockVaultV2 vault;
    FloorSentinel sentinel;

    function _deploy() internal {
        reg = new FloorRegistry(FORWARDER, address(0), bytes10(0));
        vault = new MockVaultV2(CURATOR);
        sentinel = new FloorSentinel(reg, IVaultV2(address(vault)), CURATOR);
        vm.startPrank(CURATOR);
        vault.setIsSentinel(address(sentinel), true);
        vault.increaseAbsoluteCap(idData, 1_000_000e6);
        vault.increaseRelativeCap(idData, 1e18);
        sentinel.watch(ASSET, idData, 0.1e18);
        vm.stopPrank();
    }

    function _rate(uint8 grade, uint64 blk) internal {
        FloorTypes.Update[] memory u = new FloorTypes.Update[](1);
        u[0] = FloorTypes.Update(ASSET, grade, blk, 100, bytes32(0));
        vm.prank(FORWARDER);
        reg.onReport("", abi.encode(u));
    }
}

contract FloorSentinelTest is SentinelBase {
    function setUp() public {
        _deploy();
    }

    function test_breachedZeroesAbsoluteCap() public {
        _rate(FloorTypes.BREACHED, 1);
        assertTrue(sentinel.poke(ASSET));
        assertEq(vault.absoluteCap(id), 0);
        assertFalse(sentinel.poke(ASSET), "idempotent: second poke does nothing");
    }

    function test_degradedLowersRelativeCapOnly() public {
        _rate(FloorTypes.DEGRADED, 1);
        assertTrue(sentinel.poke(ASSET));
        assertEq(vault.relativeCap(id), 0.1e18);
        assertEq(vault.absoluteCap(id), 1_000_000e6, "absolute cap untouched");
    }

    function test_unknownTreatedAsDegraded() public {
        _rate(FloorTypes.UNKNOWN, 1);
        assertTrue(sentinel.poke(ASSET));
        assertEq(vault.relativeCap(id), 0.1e18);
    }

    function test_okAndUnratedDoNothing() public {
        assertFalse(sentinel.poke(ASSET), "unrated");
        _rate(FloorTypes.OK, 1);
        assertFalse(sentinel.poke(ASSET));
        assertEq(vault.absoluteCap(id), 1_000_000e6);
        assertEq(vault.relativeCap(id), 1e18);
    }

    function test_recoveryToOkNeverRaisesCaps() public {
        _rate(FloorTypes.BREACHED, 1);
        sentinel.poke(ASSET);
        _rate(FloorTypes.OK, 2);
        assertFalse(sentinel.poke(ASSET));
        assertEq(vault.absoluteCap(id), 0, "re-enable is the curator's job, never the sentinel's");
    }

    function test_relativeCapAlreadyLowerIsLeftAlone() public {
        vm.prank(CURATOR);
        vault.decreaseRelativeCap(idData, 0.05e18);
        _rate(FloorTypes.DEGRADED, 1);
        assertFalse(sentinel.poke(ASSET));
        assertEq(vault.relativeCap(id), 0.05e18, "never raised back to 10%");
    }

    function test_onlyCuratorCanWatch() public {
        vm.expectRevert(FloorSentinel.NotCurator.selector);
        sentinel.watch(ASSET, idData, 0);
    }

    function test_unwatchedAssetReverts() public {
        vm.expectRevert(abi.encodeWithSelector(FloorSentinel.NotWatched.selector, address(0xBEEF)));
        sentinel.poke(address(0xBEEF));
    }

    function test_invalidRelativeCapRejected() public {
        vm.prank(CURATOR);
        vm.expectRevert(abi.encodeWithSelector(FloorSentinel.InvalidRelativeCap.selector, uint256(2e18)));
        sentinel.watch(ASSET, idData, 2e18);
    }

    function test_sentinelHasNoFundsAndNoValue() public view {
        assertEq(address(sentinel).balance, 0);
    }
}

/// @dev Handler: random grades, random pokes, random curator cap raises.
contract SentinelHandler is Test {
    FloorRegistry reg;
    FloorSentinel sentinel;
    MockVaultV2 vault;
    address asset;
    bytes idData;
    uint64 blk = 1;
    uint256 public raisesByNonCurator;
    uint256 public lastAbsBeforePoke;
    uint256 public lastAbsAfterPoke;
    uint256 public lastRelBeforePoke;
    uint256 public lastRelAfterPoke;
    uint8 public lastGrade;
    bool public lastKnown;

    constructor(FloorRegistry r, FloorSentinel s, MockVaultV2 v, address a, bytes memory d) {
        reg = r;
        sentinel = s;
        vault = v;
        asset = a;
        idData = d;
    }

    function rate(uint8 g) external {
        FloorTypes.Update[] memory u = new FloorTypes.Update[](1);
        u[0] = FloorTypes.Update(asset, g % 4, ++blk, 100, bytes32(0));
        vm.prank(address(0xF0));
        reg.onReport("", abi.encode(u));
    }

    function poke() external {
        bytes32 id = keccak256(idData);
        lastAbsBeforePoke = vault.absoluteCap(id);
        lastRelBeforePoke = vault.relativeCap(id);
        sentinel.poke(asset);
        lastAbsAfterPoke = vault.absoluteCap(id);
        lastRelAfterPoke = vault.relativeCap(id);
        FloorTypes.Rating memory r = reg.ratingOf(asset);
        lastGrade = r.grade;
        lastKnown = r.known;
    }

    function curatorRaises(uint256 abs, uint256 rel) external {
        bytes32 id = keccak256(idData);
        vm.startPrank(address(0xC0));
        vault.increaseAbsoluteCap(idData, vault.absoluteCap(id) + (abs % 1e12));
        vault.increaseRelativeCap(idData, vault.relativeCap(id) + (rel % 1e17) > 1e18 ? 1e18 : vault.relativeCap(id) + (rel % 1e17));
        vm.stopPrank();
    }

    function strangerTriesToRaise(uint256 cap) external {
        vm.prank(address(0xBAD));
        try vault.increaseAbsoluteCap(idData, cap) {
            raisesByNonCurator++;
        } catch {}
    }
}

contract FloorSentinelInvariantTest is StdInvariant, SentinelBase {
    SentinelHandler h;

    function setUp() public {
        _deploy();
        h = new SentinelHandler(reg, sentinel, vault, ASSET, idData);
        targetContract(address(h));
    }

    /// A poke never increases any cap.
    function invariant_pokeNeverRaisesCaps() public view {
        assertLe(h.lastAbsAfterPoke(), h.lastAbsBeforePoke());
        assertLe(h.lastRelAfterPoke(), h.lastRelBeforePoke());
    }

    /// After a poke on a BREACHED rating, the absolute cap is 0.
    function invariant_breachedMeansZeroCapAfterPoke() public view {
        if (h.lastKnown() && h.lastGrade() == FloorTypes.BREACHED) assertEq(h.lastAbsAfterPoke(), 0);
    }

    /// After a poke on OK, nothing changed.
    function invariant_okPokeIsNoop() public view {
        if (h.lastKnown() && h.lastGrade() == FloorTypes.OK) {
            assertEq(h.lastAbsAfterPoke(), h.lastAbsBeforePoke());
            assertEq(h.lastRelAfterPoke(), h.lastRelBeforePoke());
        }
    }

    /// The sentinel never holds value and only a curator can raise caps.
    function invariant_noFundsNoForeignRaises() public view {
        assertEq(address(sentinel).balance, 0);
        assertEq(h.raisesByNonCurator(), 0);
        assertEq(vault.totalAssetsMoved(), 0);
    }
}
