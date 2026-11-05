// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal Morpho Vault V2 surface used by FloorSentinel (docs.morpho.org, vault-v2 README).
/// Cap decreases are callable by the curator or a sentinel and are not timelocked.
interface IVaultV2 {
    function absoluteCap(bytes32 id) external view returns (uint256);
    function relativeCap(bytes32 id) external view returns (uint256);
    function decreaseAbsoluteCap(bytes memory idData, uint256 newAbsoluteCap) external;
    function decreaseRelativeCap(bytes memory idData, uint256 newRelativeCap) external;
    function isSentinel(address account) external view returns (bool);
}

/// @notice Minimal Aave V3 surfaces used by AaveFreezeEnforcer.
interface IAavePoolConfigurator {
    function setReserveFreeze(address asset, bool freeze) external;
}

interface IAavePool {
    struct ReserveConfigurationMap {
        uint256 data;
    }
    function getConfiguration(address asset) external view returns (ReserveConfigurationMap memory);
}
