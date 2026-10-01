// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title Moments — mint the frame you caught.
/// @notice A live piece in vr-gallery runs one ITERATION after another. Each iteration's hash
/// comes from the chain, not from the viewer: for a piece with an epoch of E blocks, epoch e
/// starts at block e*E and its hash is sha256(salt, blockhash(e*E)). Nobody can know it
/// before that block exists, and nobody can pick it, so every viewer is watching the same
/// broadcast and a rare iteration is a real event.
///
/// A MOMENT is (piece, epoch, step): one frame of one iteration. `mint` recomputes the
/// iteration hash on-chain, so a moment can only be minted while its start block's hash is
/// still readable: the last 8191 blocks through the EIP-2935 history contract (~4.5 h on Base),
/// or the last 256 via BLOCKHASH where that contract doesn't exist. Long enough to catch a
/// frame in a headset and mint it later from a phone. Each moment mints only once, and each
/// iteration at most `maxPerIteration` times. The token stores the moment; replaying the hash
/// to the step with the piece's code reproduces the frame.
contract Moments is ERC721, Ownable {
    using Strings for uint256;

    /// EIP-2935: the system contract that serves the last 8191 block hashes (Pectra; live on
    /// Base and Base Sepolia). Same hashes as BLOCKHASH, a longer memory.
    address public constant HISTORY = 0x0000F90827F1C53a10cb7A02335B175320002935;
    uint256 public constant HISTORY_WINDOW = 8191;

    struct Piece {
        string name;
        string url; // gallery link to the work; the moment appends &hash=…&step=…
        uint64 epochBlocks; // iteration length, in blocks
        uint32 steps; // a piece's run length; steps beyond it are rejected
        uint16 maxPerIteration; // how many moments one iteration can yield
        uint96 price; // wei per mint
        bool active;
        bytes32 salt; // makes this piece's iterations its own
    }

    struct Moment {
        uint64 piece;
        uint64 epoch;
        uint32 step;
        bytes32 iteration;
    }

    uint256 public pieceCount;
    uint256 public totalMinted;
    mapping(uint256 => Piece) public pieces;
    mapping(uint256 => Moment) public moments;
    mapping(bytes32 => bool) public minted; // keccak(piece, epoch, step)
    mapping(uint256 => mapping(uint64 => uint16)) public mintedPerIteration;

    event PieceSet(uint256 indexed piece, string name);
    event MomentMinted(uint256 indexed tokenId, uint256 indexed piece, uint64 epoch, uint32 step, bytes32 iteration, address to);

    error UnknownPiece();
    error PieceInactive();
    error NotStarted();
    error Expired();
    error StepOutOfRange();
    error AlreadyMinted();
    error IterationFull();
    error WrongPrice();

    constructor(address owner_) ERC721("Moments", "MOMENT") Ownable(owner_) {}

    // ── pieces ────────────────────────────────────────────────────────────────

    function addPiece(string calldata name, string calldata url, uint64 epochBlocks, uint32 steps, uint16 maxPerIteration, uint96 price)
        external
        onlyOwner
        returns (uint256 id)
    {
        require(epochBlocks > 0 && maxPerIteration > 0, "bad piece");
        id = ++pieceCount;
        pieces[id] = Piece(name, url, epochBlocks, steps, maxPerIteration, price, true, keccak256(abi.encode(address(this), id)));
        emit PieceSet(id, name);
    }

    function setPiece(uint256 id, string calldata url, uint16 maxPerIteration, uint96 price, bool active) external onlyOwner {
        Piece storage p = _piece(id);
        p.url = url;
        p.maxPerIteration = maxPerIteration;
        p.price = price;
        p.active = active;
        emit PieceSet(id, p.name);
    }

    // ── iterations ────────────────────────────────────────────────────────────

    /// @notice The epoch whose iteration is live at the current block.
    function currentEpoch(uint256 piece) public view returns (uint64) {
        // blockhash(n) needs n < block.number, so an epoch starting at this very block isn't live yet
        // forge-lint: disable-next-line(unsafe-typecast) — block numbers are nowhere near 2^64
        return uint64((block.number - 1) / _piece(piece).epochBlocks);
    }

    /// @notice An iteration's hash. Reverts if it hasn't started or has left the window.
    function iteration(uint256 piece, uint64 epoch) public view returns (bytes32) {
        Piece storage p = _piece(piece);
        uint256 start = uint256(epoch) * p.epochBlocks;
        if (start >= block.number) revert NotStarted();
        bytes32 bh = _blockhash(start);
        if (bh == bytes32(0)) revert Expired();
        return sha256(abi.encode(p.salt, bh));
    }

    // ── minting ───────────────────────────────────────────────────────────────

    function mint(uint256 piece, uint64 epoch, uint32 step) external payable returns (uint256 tokenId) {
        Piece storage p = _piece(piece);
        if (!p.active) revert PieceInactive();
        if (msg.value != p.price) revert WrongPrice();
        if (step > p.steps) revert StepOutOfRange();
        bytes32 it = iteration(piece, epoch);
        bytes32 key = keccak256(abi.encode(piece, epoch, step));
        if (minted[key]) revert AlreadyMinted();
        if (mintedPerIteration[piece][epoch] >= p.maxPerIteration) revert IterationFull();

        minted[key] = true;
        mintedPerIteration[piece][epoch]++;
        tokenId = ++totalMinted;
        // forge-lint: disable-next-line(unsafe-typecast) — piece is a validated id <= pieceCount
        moments[tokenId] = Moment(uint64(piece), epoch, step, it);
        emit MomentMinted(tokenId, piece, epoch, step, it, msg.sender); // before _safeMint's external call
        _safeMint(msg.sender, tokenId);
    }

    function withdraw(address payable to) external onlyOwner {
        require(to != address(0), "zero address");
        (bool ok,) = to.call{value: address(this).balance}("");
        require(ok, "withdraw failed");
    }

    // ── metadata ──────────────────────────────────────────────────────────────

    /// @notice The moment's gallery link: open it and the piece replays to this exact frame.
    function momentURL(uint256 tokenId) public view returns (string memory) {
        _requireOwned(tokenId);
        Moment storage m = moments[tokenId];
        return string.concat(pieces[m.piece].url, "&hash=", uint256(m.iteration).toHexString(32), "&step=", uint256(m.step).toString());
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        return string.concat("data:application/json;base64,", Base64.encode(bytes(tokenJSON(tokenId))));
    }

    /// @notice The token's metadata, unencoded.
    function tokenJSON(uint256 tokenId) public view returns (string memory) {
        Moment storage m = moments[tokenId];
        Piece storage p = pieces[m.piece];
        string memory url = momentURL(tokenId);
        return string.concat(
            '{"name":"', p.name, unicode" — moment ", tokenId.toString(),
            '","description":"One frame of a live generative piece, caught while it ran. The hash came from the chain; replaying it to this step reproduces the frame.",',
            '"external_url":"', url, '","animation_url":"', url, '","attributes":[',
            '{"trait_type":"piece","value":"', p.name, '"},',
            '{"trait_type":"iteration","value":"', uint256(m.iteration).toHexString(32), '"},',
            '{"trait_type":"epoch","display_type":"number","value":', uint256(m.epoch).toString(), "},",
            '{"trait_type":"step","display_type":"number","value":', uint256(m.step).toString(), "}]}"
        );
    }

    function _blockhash(uint256 n) internal view returns (bytes32 h) {
        h = blockhash(n);
        if (h != bytes32(0) || block.number - n > HISTORY_WINDOW || HISTORY.code.length == 0) return h;
        (bool ok, bytes memory out) = HISTORY.staticcall(abi.encode(n));
        if (ok && out.length == 32) h = abi.decode(out, (bytes32));
    }

    function _piece(uint256 id) internal view returns (Piece storage p) {
        p = pieces[id];
        if (p.epochBlocks == 0) revert UnknownPiece();
    }
}
