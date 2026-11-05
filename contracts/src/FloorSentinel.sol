// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IVaultV2} from "./interfaces/IExternal.sol";
import {IFloorRating} from "./interfaces/IFloorRating.sol";
import {FloorTypes} from "./FloorTypes.sol";

/// @title FloorSentinel
/// @notice Morpho Vault V2 enforcer. Set as the vault's Sentinel by the vault owner (`setIsSentinel`).
///         Anyone can `poke(asset)`; the action depends only on the Floor rating:
///           BREACHED            -> absolute cap of the watched id set to 0
///           DEGRADED / UNKNOWN  -> relative cap lowered to the configured ceiling (never raised)
///           OK / unrated        -> nothing
/// @dev Bounded authority by construction: the only vault functions this contract can call are
///      decreaseAbsoluteCap and decreaseRelativeCap. It never allocates, deallocates, revokes, or holds funds,
///      so it cannot move user money, block withdrawals, or touch liquidations (Morpho markets are separate).
///      `curator` can only register which id an asset maps to; it cannot trigger an action that the rating
///      does not justify, and cannot raise any cap.
contract FloorSentinel {
    IFloorRating public immutable rating;
    IVaultV2 public immutable vault;
    address public immutable curator;

    struct Watch {
        bytes idData; // e.g. abi.encode("collateralToken", token)
        uint256 degradedRelativeCap; // WAD (1e18 = 100%) ceiling applied when DEGRADED/UNKNOWN
        bool set;
    }

    mapping(address asset => Watch) internal _watch;

    event Watching(address indexed asset, bytes idData, uint256 degradedRelativeCap);
    event Enforced(address indexed asset, uint8 grade, bytes32 indexed id, string action, uint256 previous, uint256 next);

    error NotCurator();
    error NotWatched(address asset);
    error InvalidRelativeCap(uint256 cap);

    constructor(IFloorRating rating_, IVaultV2 vault_, address curator_) {
        rating = rating_;
        vault = vault_;
        curator = curator_;
    }

    function watch(address asset, bytes calldata idData, uint256 degradedRelativeCap) external {
        if (msg.sender != curator) revert NotCurator();
        if (degradedRelativeCap > 1e18) revert InvalidRelativeCap(degradedRelativeCap);
        _watch[asset] = Watch(idData, degradedRelativeCap, true);
        emit Watching(asset, idData, degradedRelativeCap);
    }

    function watched(address asset) external view returns (Watch memory) {
        return _watch[asset];
    }

    /// @return acted true if a cap was lowered.
    function poke(address asset) external returns (bool acted) {
        Watch memory w = _watch[asset];
        if (!w.set) revert NotWatched(asset);
        FloorTypes.Rating memory r = rating.ratingOf(asset);
        if (!r.known || r.grade == FloorTypes.OK) return false;

        bytes32 id = keccak256(w.idData);
        if (r.grade == FloorTypes.BREACHED) {
            uint256 cur = vault.absoluteCap(id);
            if (cur == 0) return false;
            vault.decreaseAbsoluteCap(w.idData, 0);
            emit Enforced(asset, r.grade, id, "absoluteCap->0", cur, 0);
            return true;
        }
        // DEGRADED or UNKNOWN
        uint256 rel = vault.relativeCap(id);
        if (rel <= w.degradedRelativeCap) return false;
        vault.decreaseRelativeCap(w.idData, w.degradedRelativeCap);
        emit Enforced(asset, r.grade, id, "relativeCap lowered", rel, w.degradedRelativeCap);
        return true;
    }
}
