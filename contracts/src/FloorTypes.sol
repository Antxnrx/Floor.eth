// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Shared types. Grade codes match `GRADES` in @floor/core (OK=0, DEGRADED=1, UNKNOWN=2, BREACHED=3).
library FloorTypes {
    uint8 internal constant OK = 0;
    uint8 internal constant DEGRADED = 1;
    uint8 internal constant UNKNOWN = 2;
    uint8 internal constant BREACHED = 3;
    uint8 internal constant MAX_GRADE = 3;

    /// @dev Two storage slots. `known=false` means the asset has never been rated.
    struct Rating {
        uint8 grade;
        bool known;
        uint64 scanBlock; // source-chain block the scan was pinned to (monotonic per asset)
        uint32 ruleVersion; // rule pack version, e.g. 0.1.0 => 100
        uint64 updatedAt; // block.timestamp when stored on this chain
        bytes32 bundleHash; // keccak256 of the canonical evidence bundle (docs/20)
    }

    /// @dev One update inside a report or a CCIP message.
    struct Update {
        address asset;
        uint8 grade;
        uint64 scanBlock;
        uint32 ruleVersion;
        bytes32 bundleHash;
    }

    error BadGrade(uint8 grade);
}
