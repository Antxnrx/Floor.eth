// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {FloorRegistry} from "../../src/FloorRegistry.sol";
import {FloorSentinel} from "../../src/FloorSentinel.sol";
import {FloorTypes} from "../../src/FloorTypes.sol";
import {IVaultV2} from "../../src/interfaces/IExternal.sol";

interface IVaultV2Factory {
    function createVaultV2(address owner, address asset, bytes32 salt) external returns (address);
}

interface IVaultV2Admin {
    function setCurator(address) external;
    function setIsSentinel(address, bool) external;
    function submit(bytes calldata) external;
    function increaseAbsoluteCap(bytes memory, uint256) external;
    function increaseRelativeCap(bytes memory, uint256) external;
    function isSentinel(address) external view returns (bool);
}

/// Real Morpho Vault V2 on a Base mainnet fork (factory from docs.morpho.org addresses page, code checked onchain).
/// Proves FloorSentinel's calls match the deployed vault's ABI and permissions. Nothing is broadcast.
contract MorphoBaseForkTest is Test {
    address constant FACTORY = 0x4501125508079A99ebBebCE205DeC9593C2b5857; // VaultV2Factory (Base)
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913; // USDC (Base)
    address constant TEST_COLLATERAL = address(0x7E57); // stand-in collateral id for our own test market
    address constant OWNER = address(0x0A11);
    address constant CURATOR = address(0xC0);
    address constant FORWARDER = address(0xF0);

    IVaultV2 vault;
    FloorRegistry reg;
    FloorSentinel sentinel;
    bytes idData = abi.encode("collateralToken", TEST_COLLATERAL);
    bytes32 id;

    function setUp() public {
        vm.createSelectFork(vm.envOr("BASE_RPC_URL", string("https://mainnet.base.org")));
        id = keccak256(idData);
        vault = IVaultV2(IVaultV2Factory(FACTORY).createVaultV2(OWNER, USDC, bytes32("floor-test")));
        reg = new FloorRegistry(FORWARDER, address(0), bytes10(0));
        sentinel = new FloorSentinel(reg, vault, CURATOR);

        IVaultV2Admin v = IVaultV2Admin(address(vault));
        vm.startPrank(OWNER);
        v.setCurator(CURATOR);
        v.setIsSentinel(address(sentinel), true);
        vm.stopPrank();

        // New vault: all timelocks are 0, so submit + execute in the same block (Morpho docs: one-time setup).
        vm.startPrank(CURATOR);
        v.submit(abi.encodeCall(IVaultV2Admin.increaseAbsoluteCap, (idData, 1_000_000e6)));
        v.submit(abi.encodeCall(IVaultV2Admin.increaseRelativeCap, (idData, 1e18)));
        vm.stopPrank();
        v.increaseAbsoluteCap(idData, 1_000_000e6);
        v.increaseRelativeCap(idData, 1e18);
        vm.prank(CURATOR);
        sentinel.watch(TEST_COLLATERAL, idData, 0.1e18);
    }

    function _rate(uint8 grade, uint64 blk) internal {
        FloorTypes.Update[] memory u = new FloorTypes.Update[](1);
        u[0] = FloorTypes.Update(TEST_COLLATERAL, grade, blk, 100, bytes32(0));
        vm.prank(FORWARDER);
        reg.onReport("", abi.encode(u));
    }

    function test_realVault_sentinelRoleIsSet() public view {
        assertTrue(IVaultV2Admin(address(vault)).isSentinel(address(sentinel)));
        assertEq(vault.absoluteCap(id), 1_000_000e6);
    }

    function test_realVault_breachedCutsAbsoluteCapToZero() public {
        _rate(FloorTypes.BREACHED, 1);
        assertTrue(sentinel.poke(TEST_COLLATERAL));
        assertEq(vault.absoluteCap(id), 0);
    }

    function test_realVault_degradedLowersRelativeCap() public {
        _rate(FloorTypes.DEGRADED, 1);
        assertTrue(sentinel.poke(TEST_COLLATERAL));
        assertEq(vault.relativeCap(id), 0.1e18);
        assertEq(vault.absoluteCap(id), 1_000_000e6);
    }

    function test_realVault_sentinelCannotRaiseCaps() public {
        // the sentinel role on the real vault cannot call the timelocked increase path
        vm.prank(address(sentinel));
        vm.expectRevert(abi.encodeWithSignature("DataNotTimelocked()")); // Morpho ErrorsLib
        IVaultV2Admin(address(vault)).increaseAbsoluteCap(idData, 2_000_000e6);
    }
}
