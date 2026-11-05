// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {ExtraArgsCodec} from "@chainlink/contracts-ccip/contracts/libraries/ExtraArgsCodec.sol";
import {IFloorRating} from "./interfaces/IFloorRating.sol";
import {FloorTypes} from "./FloorTypes.sol";

/// @title FloorBroadcaster
/// @notice Permissionless CCIP 2.0 relay of the registry's *current* ratings to a FloorMirror on another chain.
/// @dev Anyone can pay the fee and broadcast, but nobody can choose the content: it is read from the registry.
///      Fees are paid in native (msg.value); any excess is refunded. Holds no funds between calls.
contract FloorBroadcaster {
    IRouterClient public immutable router;
    IFloorRating public immutable registry;
    uint32 public constant GAS_LIMIT = 400_000;

    event Broadcast(bytes32 indexed messageId, uint64 indexed destChainSelector, address receiver, uint256 assets, uint256 fee);

    error NothingToBroadcast();
    error InsufficientFee(uint256 sent, uint256 required);
    error RefundFailed();

    constructor(IRouterClient router_, IFloorRating registry_) {
        router = router_;
        registry = registry_;
    }

    function buildMessage(address receiver, address[] calldata assets) public view returns (Client.EVM2AnyMessage memory) {
        FloorTypes.Update[] memory updates = new FloorTypes.Update[](assets.length);
        uint256 n;
        for (uint256 i; i < assets.length; ++i) {
            FloorTypes.Rating memory r = registry.ratingOf(assets[i]);
            if (!r.known) continue; // never broadcast an unrated asset as if it had a grade
            updates[n++] = FloorTypes.Update(assets[i], r.grade, r.scanBlock, r.ruleVersion, r.bundleHash);
        }
        if (n == 0) revert NothingToBroadcast();
        assembly {
            mstore(updates, n) // shrink to the rated entries
        }
        return Client.EVM2AnyMessage({
            receiver: abi.encode(receiver),
            data: abi.encode(updates),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            feeToken: address(0),
            // CCIP 2.0 extraArgs V3; finality 0 = wait for full finality (default).
            extraArgs: ExtraArgsCodec._getBasicEncodedExtraArgsV3(GAS_LIMIT, bytes4(0))
        });
    }

    function quote(uint64 destChainSelector, address receiver, address[] calldata assets) external view returns (uint256) {
        return router.getFee(destChainSelector, buildMessage(receiver, assets));
    }

    function broadcast(uint64 destChainSelector, address receiver, address[] calldata assets)
        external
        payable
        returns (bytes32 messageId)
    {
        Client.EVM2AnyMessage memory m = buildMessage(receiver, assets);
        uint256 fee = router.getFee(destChainSelector, m);
        if (msg.value < fee) revert InsufficientFee(msg.value, fee);
        messageId = router.ccipSend{value: fee}(destChainSelector, m);
        emit Broadcast(messageId, destChainSelector, receiver, abi.decode(m.data, (FloorTypes.Update[])).length, fee);
        if (msg.value > fee) {
            (bool ok,) = msg.sender.call{value: msg.value - fee}("");
            if (!ok) revert RefundFailed();
        }
    }
}
