// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Mirrors Morpho Vault V2 cap semantics relevant to FloorSentinel (vault-v2 README / docs):
///         decreases callable by curator or sentinel, must not increase; increases curator-only.
///         Also tracks token transfers so invariants can assert the sentinel never moves funds.
contract MockVaultV2 {
    address public curator;
    mapping(address => bool) public isSentinel;
    mapping(bytes32 => uint256) public absoluteCap;
    mapping(bytes32 => uint256) public relativeCap;
    uint256 public totalAssetsMoved; // any allocation/deallocation would bump this

    error Unauthorized();
    error NotDecreasing();

    constructor(address curator_) {
        curator = curator_;
    }

    function setIsSentinel(address a, bool v) external {
        if (msg.sender != curator) revert Unauthorized();
        isSentinel[a] = v;
    }

    function increaseAbsoluteCap(bytes memory idData, uint256 cap) external {
        if (msg.sender != curator) revert Unauthorized();
        bytes32 id = keccak256(idData);
        if (cap < absoluteCap[id]) revert NotDecreasing();
        absoluteCap[id] = cap;
    }

    function increaseRelativeCap(bytes memory idData, uint256 cap) external {
        if (msg.sender != curator) revert Unauthorized();
        bytes32 id = keccak256(idData);
        if (cap < relativeCap[id]) revert NotDecreasing();
        relativeCap[id] = cap;
    }

    function decreaseAbsoluteCap(bytes memory idData, uint256 cap) external {
        if (msg.sender != curator && !isSentinel[msg.sender]) revert Unauthorized();
        bytes32 id = keccak256(idData);
        if (cap > absoluteCap[id]) revert NotDecreasing();
        absoluteCap[id] = cap;
    }

    function decreaseRelativeCap(bytes memory idData, uint256 cap) external {
        if (msg.sender != curator && !isSentinel[msg.sender]) revert Unauthorized();
        bytes32 id = keccak256(idData);
        if (cap > relativeCap[id]) revert NotDecreasing();
        relativeCap[id] = cap;
    }
}
