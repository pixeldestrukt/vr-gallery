#!/usr/bin/env bash
# A local chain for developing the mint flow: anvil with 1 s blocks (Base's are 2 s), Moments
# deployed from anvil's account 0 (so it lands at 0x5FbD…0aa3, which examples/chain expects), and
# drift registered as piece 1 with 4-block epochs. Ctrl-C stops the chain.
set -euo pipefail
export PATH="$PATH:$HOME/.foundry/bin"
cd "$(dirname "$0")/../contracts"
DEV=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 # anvil's account 0 — unlocked, so no key needed
PORT=${PORT:-8080}
anvil --block-time 1 --silent &
ANVIL=$!
trap 'kill $ANVIL' EXIT
until cast block-number >/dev/null 2>&1; do sleep 0.2; done
ADDR=$(forge create src/Moments.sol:Moments --broadcast --unlocked --from $DEV --constructor-args $DEV | awk '/Deployed to/ {print $3}')
cast send "$ADDR" "addPiece(string,string,uint64,uint32,uint16,uint96)" drift \
  "http://localhost:$PORT/viewer/?project=/examples/chain/gallery.yaml&work=drift-live" 4 1800 3 0 \
  --unlocked --from $DEV >/dev/null
echo "Moments at $ADDR · drift is piece 1 · anvil on :8545"
echo "open http://localhost:$PORT/viewer/?project=/examples/chain/gallery.yaml (with make serve running)"
wait $ANVIL
