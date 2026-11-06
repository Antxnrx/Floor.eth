// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {FloorSentinel} from "../src/FloorSentinel.sol";
import {IVaultV2} from "../src/interfaces/IExternal.sol";
import {IFloorRating} from "../src/interfaces/IFloorRating.sol";

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

/// Live Morpho loop on a testnet, no real money: a real Morpho Vault V2 (official VaultV2Factory for the chain,
/// docs.morpho.org addresses page; code checked onchain) with a cap on the id "collateralToken = rsETH", and
/// FloorSentinel watching rsETH's Floor rating from FLOOR_RATING, which is FloorRegistry on the home chain or
/// FloorMirror (fed by CCIP) on a remote chain. When the rating is BREACHED, `cast send <sentinel> "poke(address)" <rsETH>`
/// cuts that cap to 0. The broadcaster wallet is vault owner and curator (a demo vault; in production the vault's own
/// owner opts in with setIsSentinel).
///
///   Sepolia (defaults):  FLOOR_RATING=<registry> forge script script/MorphoDemo.s.sol:MorphoDemo --rpc-url <sepolia> ...
///   Base Sepolia:        FLOOR_RATING=<mirror> VAULT_V2_FACTORY=0xE3a2CEbca662d99D0F279aF13a6bb8c9825D2ea0 \
///                        VAULT_ASSET=0x036CbD53842c5426634e7929541eC2318f3dCF7e forge script ... --rpc-url <base sepolia> ...
contract MorphoDemo is Script {
    address constant SEPOLIA_VAULT_V2_FACTORY = 0xb3fE2D5f8Af90f194B01db546397058Fcebb85D1; // Morpho VaultV2Factory (Sepolia)
    address constant SEPOLIA_USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238; // Circle USDC (Sepolia)
    /// The rating key and the cap id both use mainnet rsETH's address: the CRE workflow rates that asset.
    address constant RSETH = 0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7;
    uint256 constant ABS_CAP = 1_000_000e6; // 1M USDC
    uint256 constant DEGRADED_REL_CAP = 0.1e18; // 10% ceiling when DEGRADED / UNKNOWN

    function run() external returns (address vault, FloorSentinel sentinel) {
        return runWith(
            IFloorRating(vm.envAddress("FLOOR_RATING")),
            vm.envOr("VAULT_V2_FACTORY", SEPOLIA_VAULT_V2_FACTORY),
            vm.envOr("VAULT_ASSET", SEPOLIA_USDC)
        );
    }

    /// Tests call this directly (environment variables are process-wide and test suites run in parallel).
    function runWith(IFloorRating rating, address factory, address asset) public returns (address vault, FloorSentinel sentinel) {
        require(factory.code.length > 0 && asset.code.length > 0, "factory or asset has no code on this chain");
        bytes memory idData = abi.encode("collateralToken", RSETH);

        vm.startBroadcast();
        (, address me,) = vm.readCallers(); // the broadcasting wallet (msg.sender of run() is not it in every context)
        vault = IVaultV2Factory(factory).createVaultV2(me, asset, bytes32("floor-demo"));
        IVaultV2Setup v = IVaultV2Setup(vault);
        v.setCurator(me);
        sentinel = new FloorSentinel(rating, IVaultV2(vault), me);
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
