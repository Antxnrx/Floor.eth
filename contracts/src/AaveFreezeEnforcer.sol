// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IAavePool, IAavePoolConfigurator} from "./interfaces/IExternal.sol";
import {IFloorRating} from "./interfaces/IFloorRating.sol";
import {FloorTypes} from "./FloorTypes.sol";

/// @title AaveFreezeEnforcer
/// @notice Freezes an Aave V3 reserve when its Floor rating is BREACHED. Needs a risk-admin role on the
///         PoolConfigurator, which only Aave governance can grant (on our fork we impersonate governance and say so).
/// @dev Freeze on Aave = no new supply/borrow of that asset; repay, withdraw and liquidations keep working.
///      This contract can only freeze, never unfreeze (re-enable stays with governance), and holds no funds.
contract AaveFreezeEnforcer {
    IFloorRating public immutable rating;
    IAavePool public immutable pool;
    IAavePoolConfigurator public immutable configurator;

    /// @dev ReserveConfiguration bit 57 = frozen (Aave V3 ReserveConfiguration.sol, FROZEN_START_BIT_POSITION).
    uint256 internal constant FROZEN_BIT = 57;

    event Frozen(address indexed asset, uint64 scanBlock, bytes32 bundleHash);

    constructor(IFloorRating rating_, IAavePool pool_, IAavePoolConfigurator configurator_) {
        rating = rating_;
        pool = pool_;
        configurator = configurator_;
    }

    function isFrozen(address asset) public view returns (bool) {
        return (pool.getConfiguration(asset).data >> FROZEN_BIT) & 1 == 1;
    }

    /// @return acted true if the reserve was frozen by this call.
    function poke(address asset) external returns (bool acted) {
        FloorTypes.Rating memory r = rating.ratingOf(asset);
        if (!r.known || r.grade != FloorTypes.BREACHED || isFrozen(asset)) return false;
        configurator.setReserveFreeze(asset, true);
        emit Frozen(asset, r.scanBlock, r.bundleHash);
        return true;
    }
}
