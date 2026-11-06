// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {FloorRegistry} from "../../src/FloorRegistry.sol";
import {FloorTypes} from "../../src/FloorTypes.sol";

interface IMockKeystoneForwarder {
    function report(address receiver, bytes calldata rawReport, bytes calldata reportContext, bytes[] calldata signatures) external;
}

/// The real CRE simulation forwarder on Sepolia (MockKeystoneForwarder, verified on Sourcify) delivering a report to
/// FloorRegistry. Checks that our metadata parsing matches the forwarder's layout and documents its behaviour.
contract CreForwarderSepoliaTest is Test {
    IMockKeystoneForwarder constant FWD = IMockKeystoneForwarder(0x15fC6ae953E024d975e77382eEeC56A9101f9F88);
    address constant RSETH = 0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7;
    bytes32 constant REPORT_PROCESSED = keccak256("ReportProcessed(address,bytes32,bytes2,bool)");
    FloorRegistry reg;

    function setUp() public {
        vm.createSelectFork(vm.envOr("SEPOLIA_RPC_URL", string("https://sepolia.gateway.tenderly.co")));
        reg = new FloorRegistry(address(FWD), address(0), bytes10(0));
    }

    /// KeystoneForwarder raw report: version | executionId | timestamp | donId | donConfigVersion | workflowCid |
    /// workflowName | workflowOwner | reportId | report. The receiver gets metadata = bytes [45:109].
    function _raw(bytes32 execId, bytes10 name, address owner, bytes memory body) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(1), execId, uint32(1), uint32(1), uint32(1), bytes32(uint256(0xC1D)), name, owner, bytes2(0x0001), body);
    }

    function _body(uint8 grade, uint64 blk) internal pure returns (bytes memory) {
        FloorTypes.Update[] memory u = new FloorTypes.Update[](1);
        u[0] = FloorTypes.Update(RSETH, grade, blk, 100, keccak256("bundle"));
        return abi.encode(u);
    }

    function _deliver(bytes32 execId, bytes memory raw) internal returns (bool result) {
        vm.recordLogs();
        FWD.report(address(reg), raw, "", new bytes[](0));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == address(FWD) && logs[i].topics[0] == REPORT_PROCESSED) {
                result = abi.decode(logs[i].data, (bool)); // receiver, executionId and reportId are indexed
                assertEq(logs[i].topics[2], execId);
            }
        }
    }

    function test_forwarderDeliversReportToRegistry() public {
        bool ok = _deliver(bytes32(uint256(1)), _raw(bytes32(uint256(1)), bytes10("floor"), address(0xBEEF), _body(FloorTypes.BREACHED, 24908284)));
        assertTrue(ok);
        FloorTypes.Rating memory r = reg.ratingOf(RSETH);
        assertTrue(r.known);
        assertEq(r.grade, FloorTypes.BREACHED);
        assertEq(r.scanBlock, 24908284);
        assertEq(r.bundleHash, keccak256("bundle"));
    }

    /// The forwarder swallows a receiver revert: the transaction succeeds with result=false. So "the CRE write
    /// succeeded" is not proof the rating changed; the runbook reads ratingOf afterwards.
    function test_receiverRevertIsSilent() public {
        bool ok = _deliver(bytes32(uint256(2)), _raw(bytes32(uint256(2)), bytes10("floor"), address(0xBEEF), _body(9, 1))); // grade 9 is invalid
        assertFalse(ok);
        assertFalse(reg.ratingOf(RSETH).known);
    }

    /// The MOCK forwarder does not remember execution ids (the production one does): the same report can be
    /// delivered twice. FloorRegistry's monotonic scan block is what makes a replay harmless.
    function test_replayThroughMockIsHarmless() public {
        bytes memory raw = _raw(bytes32(uint256(3)), bytes10("floor"), address(0xBEEF), _body(FloorTypes.DEGRADED, 10));
        assertTrue(_deliver(bytes32(uint256(3)), raw));
        _deliver(bytes32(uint256(31)), _raw(bytes32(uint256(31)), bytes10("floor"), address(0xBEEF), _body(FloorTypes.BREACHED, 11)));
        assertTrue(_deliver(bytes32(uint256(3)), raw)); // accepted by the mock...
        assertEq(reg.ratingOf(RSETH).grade, FloorTypes.BREACHED); // ...but the older scan is ignored
        assertEq(reg.ratingOf(RSETH).scanBlock, 11);
    }

    /// An older scan block delivered later never rolls the rating back.
    function test_staleReportThroughForwarderIsIgnored() public {
        _deliver(bytes32(uint256(4)), _raw(bytes32(uint256(4)), bytes10("floor"), address(0xBEEF), _body(FloorTypes.BREACHED, 200)));
        _deliver(bytes32(uint256(5)), _raw(bytes32(uint256(5)), bytes10("floor"), address(0xBEEF), _body(FloorTypes.OK, 100)));
        assertEq(reg.ratingOf(RSETH).grade, FloorTypes.BREACHED);
    }

    /// Known limitation of the SIMULATION forwarder, asserted so it is never forgotten: it checks no signatures, so any
    /// address can deliver a report. Production KeystoneForwarder verifies DON signatures. The owner/name check in
    /// FloorRegistry does not help here, because the caller writes the metadata too.
    function test_simulationForwarderAcceptsAnyCaller() public {
        vm.prank(address(0xBAD));
        bool ok = _deliver(bytes32(uint256(6)), _raw(bytes32(uint256(6)), bytes10("x"), address(0xBAD), _body(FloorTypes.DEGRADED, 7)));
        assertTrue(ok);
    }

    /// Our metadata offsets match the forwarder: with an expected owner/name set, the right ones pass, wrong ones fail.
    function test_metadataLayoutMatchesForwarder() public {
        FloorRegistry strict = new FloorRegistry(address(FWD), address(0xBEEF), bytes10("floor"));
        bytes memory good = _raw(bytes32(uint256(7)), bytes10("floor"), address(0xBEEF), _body(FloorTypes.BREACHED, 1));
        FWD.report(address(strict), good, "", new bytes[](0));
        assertTrue(strict.ratingOf(RSETH).known);
        bytes memory badOwner = _raw(bytes32(uint256(8)), bytes10("floor"), address(0xBAD), _body(FloorTypes.OK, 2));
        FWD.report(address(strict), badOwner, "", new bytes[](0));
        assertEq(strict.ratingOf(RSETH).scanBlock, 1); // rejected
    }
}
