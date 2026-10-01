// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Moments} from "../src/Moments.sol";

/// Stands in for the EIP-2935 history contract: 32-byte block number in, stored hash out,
/// revert outside its window (as the real one does).
contract MockHistory {
    mapping(uint256 => bytes32) public h;

    function set(uint256 n, bytes32 v) external {
        h[n] = v;
    }

    fallback(bytes calldata data) external returns (bytes memory) {
        uint256 n = abi.decode(data, (uint256));
        require(n < block.number && block.number - n <= 8191);
        return abi.encode(h[n]);
    }
}

contract MomentsTest is Test {
    Moments m;
    address artist = makeAddr("artist");
    address visitor = makeAddr("visitor");
    address other = makeAddr("other");
    uint256 piece;

    function setUp() public {
        vm.roll(1000);
        m = new Moments(artist);
        vm.prank(artist);
        piece = m.addPiece("reaction", "https://dnuke.art/parameters/?work=reaction", 8, 6500, 3, 0);
        vm.deal(visitor, 1 ether);
    }

    // ── iterations come from the chain ────────────────────────────────────────

    function test_iterationIsSha256OfSaltAndStartBlockhash() public view {
        (,,,,,,, bytes32 salt) = m.pieces(piece);
        uint64 e = m.currentEpoch(piece);
        assertEq(m.iteration(piece, e), sha256(abi.encode(salt, blockhash(uint256(e) * 8))));
        assertEq(salt, keccak256(abi.encode(address(m), piece)));
    }

    function test_epochsChangeEveryEpochBlocks() public {
        vm.roll(8 * 200 + 1);
        assertEq(m.currentEpoch(piece), 200);
        vm.roll(8 * 201);
        assertEq(m.currentEpoch(piece), 200, "an epoch starting at this block isn't live yet");
        vm.roll(8 * 201 + 1);
        assertEq(m.currentEpoch(piece), 201);
    }

    function test_iterationsDifferAcrossPiecesAndEpochs() public {
        vm.prank(artist);
        uint256 p2 = m.addPiece("drift", "https://x/?work=drift", 8, 1800, 3, 0);
        uint64 e = m.currentEpoch(piece);
        assertTrue(m.iteration(piece, e) != m.iteration(p2, e));
        assertTrue(m.iteration(piece, e) != m.iteration(piece, e - 1));
    }

    function test_futureEpochNotStarted() public {
        uint64 e = m.currentEpoch(piece) + 1;
        vm.expectRevert(Moments.NotStarted.selector);
        m.iteration(piece, e);
    }

    function test_expiredAfter256BlocksWithoutHistory() public {
        uint64 e = m.currentEpoch(piece);
        vm.roll(uint256(e) * 8 + 257);
        vm.expectRevert(Moments.Expired.selector);
        m.iteration(piece, e);
    }

    // With EIP-2935 the window is 8191 blocks, and the hash is the same one BLOCKHASH gave.
    function test_historyExtendsTheWindowWithTheSameHash() public {
        vm.etch(m.HISTORY(), address(new MockHistory()).code);
        uint64 e = m.currentEpoch(piece);
        uint256 start = uint256(e) * 8;
        bytes32 live = m.iteration(piece, e); // read through BLOCKHASH while it's fresh
        MockHistory(payable(m.HISTORY())).set(start, this.hashOf(start));
        vm.roll(start + 5000);
        assertEq(this.hashOf(start), bytes32(0), "past BLOCKHASH's reach");
        assertEq(m.iteration(piece, e), live, "history serves the same iteration");
        vm.prank(visitor);
        m.mint(piece, e, 7); // minted ~2.8 h later on Base
        vm.roll(start + 8192);
        vm.expectRevert(Moments.Expired.selector);
        m.iteration(piece, e);
    }

    // ── minting ───────────────────────────────────────────────────────────────

    function test_mintRecordsTheMoment() public {
        uint64 e = m.currentEpoch(piece);
        bytes32 it = m.iteration(piece, e);
        vm.prank(visitor);
        uint256 id = m.mint(piece, e, 3120);
        assertEq(m.ownerOf(id), visitor);
        (uint64 p, uint64 ep, uint32 step, bytes32 iter) = m.moments(id);
        assertEq(p, piece);
        assertEq(ep, e);
        assertEq(step, 3120);
        assertEq(iter, it);
    }

    function test_eachMomentOnlyOnce() public {
        uint64 e = m.currentEpoch(piece);
        vm.prank(visitor);
        m.mint(piece, e, 100);
        vm.prank(other);
        vm.expectRevert(Moments.AlreadyMinted.selector);
        m.mint(piece, e, 100);
        vm.prank(other);
        m.mint(piece, e, 101); // the next frame is a different moment
    }

    function test_iterationCap() public {
        uint64 e = m.currentEpoch(piece);
        vm.startPrank(visitor);
        m.mint(piece, e, 1);
        m.mint(piece, e, 2);
        m.mint(piece, e, 3);
        vm.expectRevert(Moments.IterationFull.selector);
        m.mint(piece, e, 4);
        vm.stopPrank();
    }

    function test_cannotMintExpiredOrFutureOrPastEnd() public {
        uint64 e = m.currentEpoch(piece);
        vm.startPrank(visitor);
        vm.expectRevert(Moments.StepOutOfRange.selector);
        m.mint(piece, e, 6501);
        vm.expectRevert(Moments.NotStarted.selector);
        m.mint(piece, e + 1, 0);
        vm.roll(uint256(e) * 8 + 300);
        vm.expectRevert(Moments.Expired.selector);
        m.mint(piece, e, 0);
        vm.stopPrank();
    }

    function test_priceAndWithdraw() public {
        vm.prank(artist);
        m.setPiece(piece, "https://dnuke.art/parameters/?work=reaction", 3, 0.001 ether, true);
        uint64 e = m.currentEpoch(piece);
        vm.startPrank(visitor);
        vm.expectRevert(Moments.WrongPrice.selector);
        m.mint(piece, e, 1);
        m.mint{value: 0.001 ether}(piece, e, 1);
        vm.stopPrank();
        vm.prank(visitor);
        vm.expectRevert();
        m.withdraw(payable(visitor));
        vm.prank(artist);
        m.withdraw(payable(artist));
        assertEq(artist.balance, 0.001 ether);
    }

    function test_onlyOwnerManagesPieces() public {
        vm.prank(visitor);
        vm.expectRevert();
        m.addPiece("x", "y", 8, 1, 1, 0);
        vm.prank(artist);
        m.setPiece(piece, "u", 3, 0, false);
        uint64 e = m.currentEpoch(piece);
        vm.prank(visitor);
        vm.expectRevert(Moments.PieceInactive.selector);
        m.mint(piece, e, 1);
    }

    // an external call, so BLOCKHASH is evaluated after vm.roll rather than reused from before it
    function hashOf(uint256 n) external view returns (bytes32) {
        return blockhash(n);
    }

    // ── metadata ──────────────────────────────────────────────────────────────

    function test_tokenURIPointsAtTheReplay() public {
        uint64 e = m.currentEpoch(piece);
        vm.prank(visitor);
        uint256 id = m.mint(piece, e, 42);
        string memory url = m.momentURL(id);
        string memory hashHex = vm.toString(m.iteration(piece, e));
        assertEq(url, string.concat("https://dnuke.art/parameters/?work=reaction&hash=", hashHex, "&step=42"));
        string memory json = m.tokenJSON(id);
        assertEq(m.tokenURI(id), string.concat("data:application/json;base64,", Base64.encode(bytes(json))));
        assertEq(vm.parseJsonString(json, ".animation_url"), url);
        assertEq(vm.parseJsonString(json, ".attributes[1].value"), hashHex);
        assertEq(vm.parseJsonUint(json, ".attributes[3].value"), 42);
    }
}
