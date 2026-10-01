// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {Moments} from "../src/Moments.sol";

/// Deploy Moments, owned by whoever signs, and optionally register a first piece.
///
///   PIECE_NAME=reaction PIECE_URL="https://dnuke.art/parameters/?work=reaction" \
///   EPOCH_BLOCKS=8 STEPS=6500 MAX_PER_ITERATION=3 PRICE_WEI=0 \
///   forge script script/Deploy.s.sol --rpc-url base_sepolia --account deployer --broadcast
///
/// The signing key stays in Foundry's encrypted keystore (`cast wallet import deployer
/// --interactive`); nothing here reads a raw private key.
contract Deploy is Script {
    function run() external returns (Moments moments) {
        vm.startBroadcast();
        // The owner is whoever is broadcasting. Not msg.sender: with `--account` and no
        // `--sender`, msg.sender in a script is Foundry's default address, not the signer.
        (, address deployer,) = vm.readCallers();
        moments = new Moments(deployer);
        string memory name = vm.envOr("PIECE_NAME", string(""));
        if (bytes(name).length > 0) {
            uint256 id = moments.addPiece(
                name,
                vm.envString("PIECE_URL"),
                uint64(vm.envOr("EPOCH_BLOCKS", uint256(8))),
                uint32(vm.envOr("STEPS", uint256(1000))),
                uint16(vm.envOr("MAX_PER_ITERATION", uint256(3))),
                uint96(vm.envOr("PRICE_WEI", uint256(0)))
            );
            console.log("piece %s: %s", id, name);
        }
        vm.stopBroadcast();
        console.log("Moments deployed at", address(moments));
        console.log("owner", moments.owner());
    }
}
