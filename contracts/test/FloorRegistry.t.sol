// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {FloorRegistry} from "../src/FloorRegistry.sol";
import {FloorTypes} from "../src/FloorTypes.sol";
import {IReceiver} from "../src/interfaces/IReceiver.sol";

contract FloorRegistryTest is Test {
    address constant FORWARDER = address(0xF0);
    address constant ASSET = address(0xA55E7);
    FloorRegistry reg;

    function setUp() public {
        reg = new FloorRegistry(FORWARDER, address(0), bytes10(0)); // simulation mode: no metadata checks
    }

    function _report(address asset, uint8 grade, uint64 blk) internal pure returns (bytes memory) {
        FloorTypes.Update[] memory u = new FloorTypes.Update[](1);
        u[0] = FloorTypes.Update(asset, grade, blk, 100, keccak256(abi.encode(asset, grade, blk)));
        return abi.encode(u);
    }

    function test_onlyForwarderCanWrite() public {
        vm.expectRevert(abi.encodeWithSelector(FloorRegistry.NotForwarder.selector, address(this)));
        reg.onReport("", _report(ASSET, 3, 1));
    }

    function test_storesRating() public {
        vm.prank(FORWARDER);
        reg.onReport("", _report(ASSET, FloorTypes.BREACHED, 24908284));
        FloorTypes.Rating memory r = reg.ratingOf(ASSET);
        assertTrue(r.known);
        assertEq(r.grade, FloorTypes.BREACHED);
        assertEq(r.scanBlock, 24908284);
        assertEq(r.ruleVersion, 100);
    }

    function test_unratedAssetIsUnknownAndNotKnown() public view {
        FloorTypes.Rating memory r = reg.ratingOf(address(0xBEEF));
        assertFalse(r.known);
    }

    function test_staleReportIsIgnoredNoRollback() public {
        vm.startPrank(FORWARDER);
        reg.onReport("", _report(ASSET, FloorTypes.BREACHED, 200));
        reg.onReport("", _report(ASSET, FloorTypes.OK, 199)); // older scan cannot roll a grade back
        reg.onReport("", _report(ASSET, FloorTypes.OK, 200)); // same block cannot be replayed
        vm.stopPrank();
        assertEq(reg.ratingOf(ASSET).grade, FloorTypes.BREACHED);
        assertEq(reg.ratingOf(ASSET).scanBlock, 200);
    }

    function test_badGradeReverts() public {
        vm.prank(FORWARDER);
        vm.expectRevert(abi.encodeWithSelector(FloorTypes.BadGrade.selector, uint8(4)));
        reg.onReport("", _report(ASSET, 4, 1));
    }

    function test_batchReport() public {
        FloorTypes.Update[] memory u = new FloorTypes.Update[](3);
        for (uint160 i; i < 3; ++i) u[i] = FloorTypes.Update(address(i + 1), uint8(i), 10, 100, bytes32(uint256(i)));
        vm.prank(FORWARDER);
        reg.onReport("", abi.encode(u));
        for (uint160 i; i < 3; ++i) assertEq(reg.ratingOf(address(i + 1)).grade, uint8(i));
    }

    function test_supportsIReceiver() public view {
        assertTrue(reg.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(reg.supportsInterface(0x01ffc9a7)); // IERC165
        assertFalse(reg.supportsInterface(0xdeadbeef));
    }

    // ---- production mode: workflow metadata checks ----
    function _meta(bytes10 name, address owner, bool withReportId) internal pure returns (bytes memory) {
        bytes memory m = abi.encodePacked(bytes32(uint256(1)), name, owner);
        return withReportId ? bytes.concat(m, bytes2(0x0001)) : m;
    }

    function test_metadataChecks() public {
        address owner = address(0x0123);
        bytes10 name = bytes10("floor-rate");
        FloorRegistry prod = new FloorRegistry(FORWARDER, owner, name);
        vm.startPrank(FORWARDER);
        prod.onReport(_meta(name, owner, false), _report(ASSET, 1, 1)); // 62 bytes
        prod.onReport(_meta(name, owner, true), _report(ASSET, 2, 2)); // 64 bytes (prod forwarder)
        vm.expectRevert(abi.encodeWithSelector(FloorRegistry.UnexpectedWorkflow.selector, address(0x9999), name));
        prod.onReport(_meta(name, address(0x9999), false), _report(ASSET, 3, 3));
        vm.expectRevert(abi.encodeWithSelector(FloorRegistry.MetadataTooShort.selector, uint256(10)));
        prod.onReport(hex"00000000000000000000", _report(ASSET, 3, 4));
        vm.stopPrank();
        assertEq(prod.ratingOf(ASSET).grade, 2);
    }

    function test_zeroForwarderRejected() public {
        vm.expectRevert(FloorRegistry.ZeroForwarder.selector);
        new FloorRegistry(address(0), address(0), bytes10(0));
    }

    /// Fuzz: any sequence of reports leaves scanBlock equal to the max block seen, and grade from that report.
    function testFuzz_monotonic(uint64[8] memory blocks, uint8[8] memory grades) public {
        uint64 maxBlock;
        uint8 gradeAtMax;
        vm.startPrank(FORWARDER);
        for (uint256 i; i < 8; ++i) {
            uint8 g = grades[i] % 4;
            reg.onReport("", _report(ASSET, g, blocks[i]));
            if (i == 0 || blocks[i] > maxBlock) {
                maxBlock = blocks[i];
                gradeAtMax = g;
            }
        }
        vm.stopPrank();
        assertEq(reg.ratingOf(ASSET).scanBlock, maxBlock);
        assertEq(reg.ratingOf(ASSET).grade, gradeAtMax);
    }
}
