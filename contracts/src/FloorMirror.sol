// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IFloorRating} from "./interfaces/IFloorRating.sol";
import {FloorTypes} from "./FloorTypes.sol";

/// @title FloorMirror
/// @notice CCIP 2.0 receiver: a remote-chain copy of FloorRegistry, written only by the home-chain FloorBroadcaster.
/// @dev State change on receive (ETHGlobal CCIP rule). Monotonic per asset; stale updates are skipped, not reverted,
///      so one stale entry can't block a batch (a reverted CCIP message needs manual execution).
///      Uses the default CCIP verifier with full finality (CCIPReceiver default getCCVsAndFinalityConfig).
contract FloorMirror is CCIPReceiver, IFloorRating {
    uint64 public immutable sourceChainSelector;
    address public immutable sourceSender;

    mapping(address asset => FloorTypes.Rating) internal _ratings;

    event MirrorUpdated(bytes32 indexed messageId, address indexed asset, uint8 grade, uint64 scanBlock, bytes32 bundleHash);
    event MirrorStaleSkipped(bytes32 indexed messageId, address indexed asset, uint64 scanBlock, uint64 storedScanBlock);

    error WrongSource(uint64 chainSelector, address sender);

    constructor(address router_, uint64 sourceChainSelector_, address sourceSender_) CCIPReceiver(router_) {
        sourceChainSelector = sourceChainSelector_;
        sourceSender = sourceSender_;
    }

    function _ccipReceive(Client.Any2EVMMessage memory m) internal override {
        address sender = abi.decode(m.sender, (address));
        if (m.sourceChainSelector != sourceChainSelector || sender != sourceSender) {
            revert WrongSource(m.sourceChainSelector, sender);
        }
        FloorTypes.Update[] memory updates = abi.decode(m.data, (FloorTypes.Update[]));
        for (uint256 i; i < updates.length; ++i) {
            FloorTypes.Update memory u = updates[i];
            if (u.grade > FloorTypes.MAX_GRADE) revert FloorTypes.BadGrade(u.grade);
            FloorTypes.Rating storage r = _ratings[u.asset];
            if (r.known && u.scanBlock <= r.scanBlock) {
                emit MirrorStaleSkipped(m.messageId, u.asset, u.scanBlock, r.scanBlock);
                continue;
            }
            r.grade = u.grade;
            r.known = true;
            r.scanBlock = u.scanBlock;
            r.ruleVersion = u.ruleVersion;
            // forge-lint: disable-next-line(unsafe-typecast)
            r.updatedAt = uint64(block.timestamp); // safe: uint64 seconds lasts ~584 billion years
            r.bundleHash = u.bundleHash;
            emit MirrorUpdated(m.messageId, u.asset, u.grade, u.scanBlock, u.bundleHash);
        }
    }

    /// @inheritdoc IFloorRating
    function ratingOf(address asset) external view override returns (FloorTypes.Rating memory) {
        return _ratings[asset];
    }
}
