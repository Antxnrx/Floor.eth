// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC165} from "@openzeppelin/contracts@5.3.0/utils/introspection/IERC165.sol";

/// @notice Chainlink CRE consumer interface (docs.chain.link/cre ... building-consumer-contracts).
/// The KeystoneForwarder calls onReport after verifying the DON signatures.
interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
