// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {FloorRegistry} from "../../src/FloorRegistry.sol";
import {FloorSentinel} from "../../src/FloorSentinel.sol";
import {FloorTypes} from "../../src/FloorTypes.sol";
import {IVaultV2} from "../../src/interfaces/IExternal.sol";
import {MorphoDemo} from "../../script/MorphoDemo.s.sol";

/// Runs the exact Sepolia script on a Sepolia fork, then plays the CRE write and the poke. Nothing is broadcast.
contract MorphoDemoSepoliaForkTest is Test {
    address constant RSETH = 0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7;
    address constant FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88; // CRE simulation forwarder (Sepolia)
    FloorRegistry reg;
    IVaultV2 vault;
    FloorSentinel sentinel;
    bytes32 id = keccak256(abi.encode("collateralToken", RSETH));

    function setUp() public {
        vm.createSelectFork(vm.envOr("SEPOLIA_RPC_URL", string("https://ethereum-sepolia-rpc.publicnode.com")));
        reg = new FloorRegistry(FORWARDER, address(0), bytes10(0));
        address v;
        (v, sentinel) = new MorphoDemo().runWith(reg, 0xb3fE2D5f8Af90f194B01db546397058Fcebb85D1, 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238);
        vault = IVaultV2(v);
    }

    function _creWrites(uint8 grade, uint64 blk) internal {
        FloorTypes.Update[] memory u = new FloorTypes.Update[](1);
        u[0] = FloorTypes.Update(RSETH, grade, blk, 100, bytes32(uint256(1)));
        vm.prank(FORWARDER);
        reg.onReport("", abi.encode(u));
    }

    function test_sepolia_setup() public view {
        assertTrue(vault.isSentinel(address(sentinel)));
        assertEq(vault.absoluteCap(id), 1_000_000e6);
        assertEq(vault.relativeCap(id), 1e18);
    }

    function test_sepolia_breachedCutsCap() public {
        assertFalse(sentinel.poke(RSETH) && false); // unrated: nothing to do
        _creWrites(FloorTypes.BREACHED, 24908284);
        assertTrue(sentinel.poke(RSETH));
        assertEq(vault.absoluteCap(id), 0);
        assertFalse(sentinel.poke(RSETH)); // idempotent
    }

    function test_sepolia_degradedLowersRelativeCap() public {
        _creWrites(FloorTypes.DEGRADED, 24908284);
        assertTrue(sentinel.poke(RSETH));
        assertEq(vault.relativeCap(id), 0.1e18);
        assertEq(vault.absoluteCap(id), 1_000_000e6);
    }
}
