// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {FloorTypes} from "../FloorTypes.sol";

/// @notice Read interface shared by FloorRegistry (home chain) and FloorMirror (remote chains).
interface IFloorRating {
    function ratingOf(address asset) external view returns (FloorTypes.Rating memory);
}
