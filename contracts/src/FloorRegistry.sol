// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC165} from "@openzeppelin/contracts@5.3.0/utils/introspection/IERC165.sol";
import {IReceiver} from "./interfaces/IReceiver.sol";
import {IFloorRating} from "./interfaces/IFloorRating.sol";
import {FloorTypes} from "./FloorTypes.sol";

/// @title FloorRegistry
/// @notice Stores Floor ratings written by a Chainlink CRE workflow through the KeystoneForwarder.
/// @dev No owner, no upgrade path, no funds. The only writer is the immutable forwarder.
///      Optional workflow-owner / workflow-name checks are immutable; set them to zero for CRE simulation
///      (the simulation MockKeystoneForwarder supplies no metadata, per CRE docs).
contract FloorRegistry is IReceiver, IFloorRating {
    address public immutable forwarder;
    address public immutable expectedWorkflowOwner; // address(0) = not checked
    bytes10 public immutable expectedWorkflowName; // bytes10(0) = not checked

    mapping(address asset => FloorTypes.Rating) internal _ratings;

    event RatingUpdated(
        address indexed asset, uint8 oldGrade, uint8 newGrade, uint64 scanBlock, uint32 ruleVersion, bytes32 bundleHash
    );
    event StaleUpdateIgnored(address indexed asset, uint64 scanBlock, uint64 storedScanBlock);

    error NotForwarder(address caller);
    error MetadataTooShort(uint256 length);
    error UnexpectedWorkflow(address owner, bytes10 name);
    error ZeroForwarder();

    constructor(address forwarder_, address expectedWorkflowOwner_, bytes10 expectedWorkflowName_) {
        if (forwarder_ == address(0)) revert ZeroForwarder();
        forwarder = forwarder_;
        expectedWorkflowOwner = expectedWorkflowOwner_;
        expectedWorkflowName = expectedWorkflowName_;
    }

    /// @inheritdoc IReceiver
    /// @param metadata abi.encodePacked(bytes32 workflowId, bytes10 workflowName, address workflowOwner) (+2 bytes reportId in prod)
    /// @param report abi.encode(FloorTypes.Update[])
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (msg.sender != forwarder) revert NotForwarder(msg.sender);
        if (expectedWorkflowOwner != address(0) || expectedWorkflowName != bytes10(0)) {
            // Do not require exactly 62 bytes: production forwarders append a 2-byte reportId (CRE docs).
            if (metadata.length < 62) revert MetadataTooShort(metadata.length);
            bytes10 name = bytes10(metadata[32:42]);
            address owner = address(bytes20(metadata[42:62]));
            if (
                (expectedWorkflowOwner != address(0) && owner != expectedWorkflowOwner)
                    || (expectedWorkflowName != bytes10(0) && name != expectedWorkflowName)
            ) revert UnexpectedWorkflow(owner, name);
        }
        FloorTypes.Update[] memory updates = abi.decode(report, (FloorTypes.Update[]));
        for (uint256 i; i < updates.length; ++i) {
            _apply(updates[i]);
        }
    }

    /// @dev Monotonic per asset: a report pinned to an older or equal scan block is ignored (no rollback, no replay).
    function _apply(FloorTypes.Update memory u) internal {
        if (u.grade > FloorTypes.MAX_GRADE) revert FloorTypes.BadGrade(u.grade);
        FloorTypes.Rating storage r = _ratings[u.asset];
        if (r.known && u.scanBlock <= r.scanBlock) {
            emit StaleUpdateIgnored(u.asset, u.scanBlock, r.scanBlock);
            return;
        }
        uint8 old = r.known ? r.grade : FloorTypes.UNKNOWN;
        r.grade = u.grade;
        r.known = true;
        r.scanBlock = u.scanBlock;
        r.ruleVersion = u.ruleVersion;
        // forge-lint: disable-next-line(unsafe-typecast)
        r.updatedAt = uint64(block.timestamp); // safe: uint64 seconds lasts ~584 billion years
        r.bundleHash = u.bundleHash;
        emit RatingUpdated(u.asset, old, u.grade, u.scanBlock, u.ruleVersion, u.bundleHash);
    }

    /// @inheritdoc IFloorRating
    function ratingOf(address asset) external view override returns (FloorTypes.Rating memory) {
        return _ratings[asset];
    }

    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
