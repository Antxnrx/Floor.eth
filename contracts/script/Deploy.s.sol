// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {FloorRegistry} from "../src/FloorRegistry.sol";
import {FloorBroadcaster} from "../src/FloorBroadcaster.sol";
import {FloorMirror} from "../src/FloorMirror.sol";
import {FloorSentinel} from "../src/FloorSentinel.sol";
import {IVaultV2} from "../src/interfaces/IExternal.sol";

/// Home chain: FloorRegistry (CRE receiver) + FloorBroadcaster (CCIP sender).
/// Env: CRE_FORWARDER, CCIP_ROUTER, [CRE_WORKFLOW_OWNER], [CRE_WORKFLOW_NAME]
/// Dry run (no keys, no broadcast):  forge script script/Deploy.s.sol:DeployHome --rpc-url $RPC
/// Real:                              forge script script/Deploy.s.sol:DeployHome --rpc-url $RPC --broadcast --account <keystore>
contract DeployHome is Script {
    function run() external returns (FloorRegistry reg, FloorBroadcaster bc) {
        address forwarder = vm.envAddress("CRE_FORWARDER");
        address router = vm.envAddress("CCIP_ROUTER");
        address wfOwner = vm.envOr("CRE_WORKFLOW_OWNER", address(0));
        bytes10 wfName = bytes10(bytes(vm.envOr("CRE_WORKFLOW_NAME", string(""))));
        vm.startBroadcast();
        reg = new FloorRegistry(forwarder, wfOwner, wfName);
        bc = new FloorBroadcaster(IRouterClient(router), reg);
        vm.stopBroadcast();
        console2.log("FloorRegistry   ", address(reg));
        console2.log("FloorBroadcaster", address(bc));
    }
}

/// Remote chain: FloorMirror (CCIP receiver). Env: CCIP_ROUTER, SOURCE_CHAIN_SELECTOR, SOURCE_BROADCASTER
contract DeployMirror is Script {
    function run() external returns (FloorMirror mirror) {
        address router = vm.envAddress("CCIP_ROUTER");
        uint64 src = uint64(vm.envUint("SOURCE_CHAIN_SELECTOR"));
        address sender = vm.envAddress("SOURCE_BROADCASTER");
        vm.startBroadcast();
        mirror = new FloorMirror(router, src, sender);
        vm.stopBroadcast();
        console2.log("FloorMirror", address(mirror));
    }
}

/// Morpho Vault V2 enforcer. Env: FLOOR_RATING (registry or mirror), MORPHO_VAULT, CURATOR
/// After deploy, the vault OWNER must call vault.setIsSentinel(sentinel, true), and the curator calls watch(...).
contract DeploySentinel is Script {
    function run() external returns (FloorSentinel s) {
        address rating = vm.envAddress("FLOOR_RATING");
        address vault = vm.envAddress("MORPHO_VAULT");
        address curator = vm.envAddress("CURATOR");
        vm.startBroadcast();
        s = new FloorSentinel(FloorRegistry(rating), IVaultV2(vault), curator);
        vm.stopBroadcast();
        console2.log("FloorSentinel", address(s));
    }
}
