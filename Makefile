# vr-gallery — task runner. Node >=18, no build step, no dependencies.
# `make` with no target prints help. Override the port with e.g. `make serve PORT=9000`.
PORT ?= 8080
NODE := node

.DEFAULT_GOAL := help
.PHONY: help serve test art vendor chain contracts deploy

help: ## Show this help
	@echo "vr-gallery — targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-8s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "vars: PORT=$(PORT)   DEST=... (for vendor)"

serve: ## Serve the repo — open the printed URL for the demo room
	PORT=$(PORT) $(NODE) scripts/serve.mjs

test: ## Run the test suites (JS; see `make contracts` for Solidity)
	$(NODE) test/run.mjs

contracts: ## Build and test the Moments contract (needs Foundry)
	cd contracts && forge test

chain: ## Local chain for the mint flow: anvil + Moments + drift as piece 1
	PORT=$(PORT) scripts/dev-chain.sh

NET ?= base_sepolia
ACCOUNT ?= deployer
deploy: ## Deploy Moments: make deploy [NET=base_sepolia ACCOUNT=deployer PIECE_NAME=… PIECE_URL=… EPOCH_BLOCKS=… STEPS=…]
	cd contracts && forge script script/Deploy.s.sol --rpc-url $(NET) --account $(ACCOUNT) --broadcast

art: ## Regenerate the demo room's art from its recipes
	$(NODE) examples/demo/make-art.mjs

vendor: ## Vendor the viewer into a site (replaces DEST): make vendor DEST=../../dnewcome/dnuke.art/vr-gallery/engine
	@test -n "$(DEST)" || (echo "usage: make vendor DEST=<dir>"; exit 2)
	$(NODE) scripts/vendor.mjs $(DEST)
