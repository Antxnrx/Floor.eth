// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {FloorRegistry} from "../src/FloorRegistry.sol";
import {FloorSentinel} from "../src/FloorSentinel.sol";
import {IVaultV2} from "../src/interfaces/IExternal.sol";

interface IVaultV2Factory {
    function createVaultV2(address owner, address asset, bytes32 salt) external returns (address);
}

interface IVaultV2Setup {
    function setCurator(address) external;
    function setIsSentinel(address, bool) external;
    function submit(bytes calldata) external;
    function increaseAbsoluteCap(bytes memory, uint256) external;
    function increaseRelativeCap(bytes memory, uint256) external;
}

/// Live Morpho loop on Ethereum Sepolia, no real money:
///   a real Morpho Vault V2 (official Sepolia VaultV2Factory, docs.morpho.org addresses page; code checked onchain)
///   with a cap on the id "collateralToken = rsETH", and FloorSentinel watching rsETH's Floor rating.
/// When the CRE workflow writes BREACHED for rsETH into FloorRegistry, `cast send <sentinel> "poke(address)" <rsETH>`
/// cuts that cap to 0. The broadcaster wallet is vault owner and curator (a demo vault; in production the vault's
/// own owner opts in with setIsSentinel).
///
///   FLOOR_REGISTRY=<registry> forge script script/MorphoSepolia.s.sol:MorphoSepolia \
///     --rpc-url https://ethereum-sepolia-rpc.publicnode.com --broadcast --account floor-deployer-2
contract MorphoSepolia is Script {
    address constant VAULT_V2_FACTORY = 0xb3fE2D5f8Af90f194B01db546397058Fcebb85D1; // Morpho VaultV2Factory (Sepolia)
    address constant USDC_SEPOLIA = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238; // Circle USDC (Sepolia)
    /// The rating key and the cap id both use mainnet rsETH's address: the CRE workflow rates that asset.
    address constant RSETH = 0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7;
    uint256 constant ABS_CAP = 1_000_000e6; // 1M USDC
    uint256 constant DEGRADED_REL_CAP = 0.1e18; // 10% ceiling when DEGRADED / UNKNOWN

    function run() external returns (address vault, FloorSentinel sentinel) {
        FloorRegistry registry = FloorRegistry(vm.envAddress("FLOOR_REGISTRY"));
        bytes memory idData = abi.encode("collateralToken", RSETH);

        vm.startBroadcast();
        (, address me,) = vm.readCallers(); // the broadcasting wallet (msg.sender of run() is not it in every context)
        vault = IVaultV2Factory(VAULT_V2_FACTORY).createVaultV2(me, USDC_SEPOLIA, bytes32("floor-sepolia-demo"));
        IVaultV2Setup v = IVaultV2Setup(vault);
        v.setCurator(me);
        sentinel = new FloorSentinel(registry, IVaultV2(vault), me);
        v.setIsSentinel(address(sentinel), true);
        // new vault: timelocks are 0, so submit + execute right away (one-time setup, Morpho docs)
        v.submit(abi.encodeCall(IVaultV2Setup.increaseAbsoluteCap, (idData, ABS_CAP)));
        v.submit(abi.encodeCall(IVaultV2Setup.increaseRelativeCap, (idData, 1e18)));
        v.increaseAbsoluteCap(idData, ABS_CAP);
        v.increaseRelativeCap(idData, 1e18);
        sentinel.watch(RSETH, idData, DEGRADED_REL_CAP);
        vm.stopBroadcast();

        console2.log("MorphoVaultV2 ", vault);
        console2.log("FloorSentinel ", address(sentinel));
        console2.log("cap id        ", vm.toString(keccak256(idData)));
        console2.log("absoluteCap   ", IVaultV2(vault).absoluteCap(keccak256(idData)));
    }
}
