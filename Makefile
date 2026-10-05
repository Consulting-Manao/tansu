.PHONY: help install prepare rust-lint clean testnet_reset contract_build contract_test contract_deploy contract_help pre_push_hook
.DEFAULT_GOAL := help
SHELL:=/bin/bash

ifndef network
   override network = testnet
endif

ifndef admin
   override admin = tansu-$(network)
endif

# The account paying for the upload of a WASM, which anyone can do: it is
# about 1 XLM per KB on mainnet.
ifndef uploader
   override uploader = $(admin)
endif

# `send=no` simulates a call without sending it.
ifndef send
   override send = default
endif

ifndef wasm
	override wasm = target/wasm32v1-none/release/tansu.wasm
endif

ifndef executor_wasm
	override executor_wasm = target/wasm32v1-none/release/tansu_executor.wasm
endif

# The address is derived from the admin and this salt. A deployment that is
# not an upgrade needs a new one: `make contract_deploy salt=tansu-v3`.
ifndef salt
   override salt = tansu
endif

override tansu_id = $(shell cat deployments/tansu-$(network))

override collateral_contract_id = $(shell stellar contract id asset --asset native --network $(network))

override executor_id = $(shell cat deployments/tansu-executor-$(network) 2>/dev/null)

# Add help text after each target name starting with '\#\#'
help:   ## show this help
	@echo -e "Help for this makefile\n"
	@echo "Possible commands are:"
	@grep -h "##" $(MAKEFILE_LIST) | grep -v grep | sed -e 's/\(.*\):.*##\(.*\)/    \1: \2/'

install:  ## install Rust and Soroban-CLI
	# uv for the pre-push hook
	curl -LsSf https://astral.sh/uv/install.sh | sh && \
	uv tool install pre-commit --with pre-commit-uv && \
	# install Rust
	curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh && \
	# install Soroban and config
	rustup target add wasm32v1-none && \
	cargo install --locked stellar-cli

prepare-network:  ## Setup network
ifeq ($(network),testnet)
	stellar network add testnet \
		--rpc-url https://soroban-testnet.stellar.org:443 \
		--network-passphrase "Test SDF Network ; September 2015"
else ifeq ($(network),mainnet)
	stellar network add mainnet \
		--rpc-url https://rpc.lightsail.network/ \
		--network-passphrase "Public Global Stellar Network ; September 2015"
else
	stellar network add testnet-local \
		--rpc-url http://localhost:8000/soroban/rpc \
		--network-passphrase "Standalone Network ; February 2017"
endif

prepare: prepare-network  ## Setup network and generate addresses and add funds
	stellar keys generate grogu-$(network) --network $(network) && \
	stellar keys generate $(admin) --network $(network)

funds:
	stellar keys fund grogu-$(network) --network $(network) && \
	stellar keys fund $(admin) --network $(network)

rust-lint:
	cargo clippy --all-targets --all-features -- -Dwarnings
	cargo fmt -- --emit files

clean:
	rm target/wasm32v1-none/release/*.wasm
	rm target/wasm32v1-none/release/*.d
	cargo clean

# --------- Events --------- #

events_test:
	echo 0

# --------- Fullstack --------- #

local-stack:  ## local stack
	docker compose up

# --------- CONTRACT BUILD/TEST/DEPLOY --------- #

contract_build:  ## Build the contracts; Tansu first, as registry-tansu-manager imports its WASM
	stellar contract build --optimize --package tansu
	stellar contract build --optimize
	@ls -l target/wasm32v1-none/release/*.wasm

contract_test:
	cargo test


# --contract-id $(tansu_id-$(network))
contract_bindings: contract_build  ## Create bindings
	stellar contract bindings typescript \
		--network $(network) \
		--wasm $(wasm) \
		--output-dir dapp/packages/tansu \
		--overwrite && \
	cd dapp/packages/tansu && \
	bun install --latest && \
	bun update --latest && \
	bun run build && \
	bun format

executor_deploy:  ## Deploy the executor running proposal outcomes from executor_wasm (no admin, no upgrade)
	id=$$(stellar contract deploy \
  		--wasm $(executor_wasm) \
  		--source-account $(admin) \
  		--network $(network)) && \
  	echo "$$id" > deployments/tansu-executor-$(network) && \
  	cat deployments/tansu-executor-$(network)

contract_deploy:  ## Deploy Soroban contract, with the native asset as collateral and the deployed executor
	id=$$(stellar contract deploy \
  		--wasm $(wasm) \
  		--source-account $(admin) \
  		--network $(network) \
  		--salt $(shell printf $(salt) | openssl sha256 | cut -d " " -f2) \
  		--inclusion-fee 200000000 \
  		--cost \
  		-- \
  		--admin $(admin) \
  		--collateral $(collateral_contract_id) \
  		--executor $(executor_id)) && \
  	echo "$$id" > deployments/tansu-$(network) && \
  	cat deployments/tansu-$(network)

contract_unpause:  ## Unpause the contract
	stellar contract invoke \
    	--source-account $(admin) \
    	--network $(network) \
    	--id $(tansu_id) \
    	-- \
    	pause \
		--admin $(admin) \
		--paused false

contract_pause:  ## Pause the contract
	stellar contract invoke \
	--source-account $(admin) \
	--network $(network) \
	--id $(tansu_id) \
	-- \
	pause \
	--admin $(admin) \
	--paused true

contract_cancel_upgrade:  ## Cancel the current upgrade proposal
	stellar contract invoke \
	--source-account $(admin) \
	--network $(network) \
	--id $(tansu_id) \
	-- \
	finalize_upgrade \
	--admin $(admin) \
	--accept false

contract_migrate:  ## Migrate the data of the contract running on mainnet before v3: project_keys='["<hex>"]'
	stellar contract invoke \
	--source-account $(admin) \
	--network $(network) \
	--id $(tansu_id) \
	--send $(send) \
	-- \
	migrate \
	--admin $(admin) \
	--project_keys '$(project_keys)'

contract_propose_upgrade:  ## Propose the release WASM given as wasm=<path>, uploaded by uploader=; the admin set is kept
	stellar contract invoke \
    	--source-account $(admin) \
    	--network $(network) \
    	--id $(tansu_id) \
    	-- \
    	propose_upgrade \
		--admin $(admin) \
		--new_wasm_hash $(shell stellar contract upload --source-account $(uploader) --network $(network) --wasm $(wasm))

contract_approve_upgrade:  ## Approve the current upgrade proposal
	stellar contract invoke \
    	--source-account $(admin) \
    	--network $(network) \
    	--id $(tansu_id) \
    	-- \
    	approve_upgrade \
		--admin $(admin)

contract_finalize_upgrade:  ## Execute the approved upgrade proposal
	stellar contract invoke \
    	--source-account $(admin) \
    	--network $(network) \
    	--id $(tansu_id) \
    	-- \
    	finalize_upgrade \
		--admin $(admin) \
		--accept true

contract_get_upgrade_proposal:  ## Get the current upgrade proposal
	stellar contract invoke \
    	--source-account $(admin) \
    	--network $(network) \
    	--id $(tansu_id) \
    	-- \
    	get_upgrade_proposal

# --------- dApp --------- #

# xlm.sh serves the dApp from the IPFS CID stored in a data entry of the account
# owning the Soroban Domain. The CID of a build is in the summary of the dApp
# IPFS workflow. The CLI takes the value in hexadecimal.
dapp_ipfs:  ## Point the dApp on xlm.sh at the IPFS CID given as cid=<cid>, signed by owner=<identity of the domain's account>
	@test -n "$(cid)" -a -n "$(owner)" || { echo "usage: make dapp_ipfs cid=<cid> owner=<identity> network=mainnet"; exit 1; }
	stellar tx new manage-data \
	--source-account $(owner) \
	--network $(network) \
	--data-name app.xlm_sh.ipfs \
	--data-value $$(printf %s '$(cid)' | xxd -p | tr -d '\n')

# --------- Radicle --------- #

radicle_push:
	git push rad main

radicle_ci:  ## Run test and register the results on Radicle
	.radicle/ci.sh

radicle_release:  ## Publish a release on Radicle
	.radicle/release.sh

# --------- Setup --------- #

contract_set_executor:  ## Point Tansu at the executor in deployments/tansu-executor-<network>
	stellar contract invoke \
    	--source-account $(admin) \
    	--network $(network) \
    	--id $(tansu_id) \
    	-- \
    	set_executor \
		--admin $(admin) \
		--executor $(executor_id)

contract_set_nqg_contract:  ## As maintainer of project_key=<hex>, weigh its votes with nqg=<contract id>
	stellar contract invoke \
    	--source-account $(admin) \
    	--network $(network) \
    	--id $(tansu_id) \
    	-- \
    	set_nqg_contract \
		--maintainer $(admin) \
		--project_key $(project_key) \
		--nqg_contract '{"address":"$(nqg)","wasm_hash":null}'

# --------- Testnet --------- #

testnet_reset:  ## Playbook for testnet reset
	make funds && \
	make contract_bindings && \
	make executor_deploy && \
	make contract_deploy && \
	make contract_unpause && \
	make contract_register && \
	make contract_commit

# --------- CONTRACT USAGE EXAMPLES --------- #

contract_help:
	stellar contract invoke \
    	--source-account $(admin) \
    	--network $(network) \
    	--id $(tansu_id) \
    	-- \
    	--help

contract_version:
	stellar contract invoke \
    	--source-account $(admin) \
    	--network $(network) \
    	--id $(tansu_id) \
    	-- \
    	version

# bafybeift4uou7f4qdrchrbwebxxvgf2ecmx56qqo6l2fyimmr4skb3iibi for salib
contract_register:
	stellar contract invoke \
    	--source-account $(admin) \
    	--network $(network) \
    	--id $(tansu_id) \
    	-- \
    	register \
    	--maintainer $(admin) \
    	--name tansu \
    	--maintainers '["$(shell stellar keys address $(admin))", "$(shell stellar keys address grogu-$(network))"]' \
    	--url https://radicle.network/nodes/radicle.consulting-manao.com/rad%3AzssaAF91kxuquZmZCV2SiK2FNX6s \
    	--ipfs bafybeicnbbhyc4vhbuokk57lrmg4hkbvkmtcp6p3ubaptbus6kl2idthki

contract_commit:
	stellar contract invoke \
    	--source-account $(admin) \
    	--network $(network) \
    	--id $(tansu_id) \
    	-- \
    	commit \
    	--maintainer $(admin) \
    	--project_key 37ae83c06fde1043724743335ac2f3919307892ee6307cce8c0c63eaa549e156 \
    	--hash bc4d84f2b00501ce6c176d797371f65799838720

contract_get_commit:
	stellar contract invoke \
    	--source-account $(admin) \
    	--network $(network) \
    	--id $(tansu_id) \
    	-- \
    	get_commit \
    	--project_key 37ae83c06fde1043724743335ac2f3919307892ee6307cce8c0c63eaa549e156

contract_get_max_weight:
	stellar contract invoke \
    	--source-account $(admin) \
    	--network $(network) \
    	--id $(tansu_id) \
    	-- \
    	get_max_weight \
    	--project_key 37ae83c06fde1043724743335ac2f3919307892ee6307cce8c0c63eaa549e156 \
    	--member_address $(admin)

# Generate an artifact, upload it to IPFS, and record its CID on-chain.
# Requires FILEBASE_TOKEN (or TANSU_IPFS_UPLOAD_COMMAND) in the environment.
# Override kind/commit/file on the command line, e.g.
#   make contract_set_evidence kind=cve file=artifacts/trivy-results.json
ifndef kind
   override kind = sbom
endif
ifndef commit
   override commit = bc4d84f2b00501ce6c176d797371f65799838720
endif
ifndef file
   override file = artifacts/sbom.cyclonedx.json
endif

contract_set_evidence:  ## Upload an evidence artifact to IPFS and record its CID on-chain
	tools/evidence/publish.sh \
		--project-key 37ae83c06fde1043724743335ac2f3919307892ee6307cce8c0c63eaa549e156 \
		--commit-hash $(commit) \
		--kind $(kind) \
		--file $(file) \
		--network $(network) \
		--contract-id $(tansu_id) \
		--source-account $(admin) \
		--maintainer $(admin)

contract_get_evidence:  ## Read the stored evidence history for a commit and kind
	stellar contract invoke \
    	--source-account $(admin) \
    	--network $(network) \
    	--id $(tansu_id) \
    	-- \
    	get_evidence \
    	--project_key 37ae83c06fde1043724743335ac2f3919307892ee6307cce8c0c63eaa549e156 \
    	--commit_hash $(commit) \
    	--kind Sbom

# --------- Hook --------- #

pre_push_hook:
	TANSU_CONTRACT_ID=$(tansu_id) \
	TANSU_PROJECT_KEY=37ae83c06fde1043724743335ac2f3919307892ee6307cce8c0c63eaa549e156 \
	uv run --with soroban pre-commit/tansu_pre_push.py

# --------- NQG --------- #

nqg:  ## Voting weight of the admin identity from the NQG contract nqg=<contract id>
	stellar contract invoke \
	  --source-account $(admin) \
	  --network $(network) \
	  --id $(nqg) \
	  -- \
	  get_voting_power \
	  --user $(admin)

