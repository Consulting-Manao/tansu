.PHONY: help install prepare rust-lint clean testnet_reset contract_build contract_test contract_deploy contract_help pre_push_hook
.PHONY: radicle_ci radicle_release_candidate radicle_release radicle_register
.DEFAULT_GOAL := help
SHELL:=/bin/bash

ifndef network
   override network = testnet
endif

ifndef admin
   override admin = tansu-admin-$(network)
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

ifndef maintainer2
ifneq ($(network),mainnet)
   override maintainer2 = grogu
endif
endif

ifndef wasm
	override wasm = target/wasm32v1-none/release/tansu.wasm
endif

# The Stellar CLI image the contracts are released in, pinned by digest: stellar-cli
# 28.0.0, linux/arm64. The digest is written into each WASM's metadata (`bldimg`), so
# an independent rebuild uses the same image on the same architecture.
ifndef image
   override image = docker.io/stellar/stellar-cli@sha256:038a39c82927d7fa32066ed8fea9e44b402b0bdecf483450a2bbe2c7c0daba11
endif

# The container engine of the release build, as the Stellar CLI names it (`apple-container`
# or `docker`), and the resources the build gets: Apple's engine starts a container with
# 1 GiB, which the compiler outgrows.
ifndef engine
   override engine = apple-container
endif

ifndef build_flags
   override build_flags = --memory 4g --cpus 4
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
	cargo install --locked stellar-cli stellar-registry-cli

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

# `prepare` and `funds` create plaintext identity files: never for mainnet, whose
# identities live in the Stellar CLI secure store (`stellar keys add <name> --secure-store`).
# `$(error)` is expanded by `make -n` too, so a dry run is refused as well.
no_mainnet_keys:
	$(if $(filter mainnet,$(network)),$(error Refusing network=mainnet: this would create a plaintext admin key. Add mainnet identities by hand with `stellar keys add <name> --secure-store`))

# `grogu` is the default throwaway testnet identity, shared by every non-mainnet network.
prepare: no_mainnet_keys prepare-network  ## Setup network and generate addresses and add funds (never mainnet)
	stellar keys generate grogu --network $(network) && \
	stellar keys generate $(admin) --network $(network)

funds: no_mainnet_keys  ## Fund the grogu and admin identities (never mainnet)
	stellar keys fund grogu --network $(network) && \
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

contract_propose_upgrade:  ## Upload the release WASM given as wasm=<path> (paid by uploader=), propose it and show the proposal; the admin set is kept
	stellar contract invoke \
    	--source-account $(admin) \
    	--network $(network) \
    	--id $(tansu_id) \
    	-- \
    	propose_upgrade \
		--admin $(admin) \
		--new_wasm_hash $(shell stellar contract upload --source-account $(uploader) --network $(network) --wasm $(wasm))
	$(MAKE) contract_get_upgrade_proposal

contract_approve_upgrade:  ## Approve the current upgrade proposal
	stellar contract invoke \
    	--source-account $(admin) \
    	--network $(network) \
    	--id $(tansu_id) \
    	-- \
    	approve_upgrade \
		--admin $(admin)

contract_finalize_upgrade:  ## Execute the approved upgrade proposal, then show the hash of the code on-chain and its version
	stellar contract invoke \
    	--source-account $(admin) \
    	--network $(network) \
    	--id $(tansu_id) \
    	-- \
    	finalize_upgrade \
		--admin $(admin) \
		--accept true
	stellar contract fetch --id $(tansu_id) --network $(network) | shasum -a 256
	$(MAKE) contract_version

# The instance and the code of Tansu and of its executor, each to the maximum of 3,110,400
# ledgers (about 180 days). The code is the one on-chain now. "Rent on mainnet" in
# docs/operations.md has what it costs.
contract_extend:  ## Extend the TTL of the instance and the code of Tansu and of its executor to the maximum
	for id in $(tansu_id) $(executor_id); do \
		stellar contract extend --id $$id --network $(network) --source-account $(admin) --ledgers-to-extend 3110400 && \
		stellar contract extend --wasm-hash $$(stellar contract fetch --id $$id --network $(network) | shasum -a 256 | cut -d' ' -f1) \
			--network $(network) --source-account $(admin) --ledgers-to-extend 3110400 || exit; \
	done

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
	stellar tx new manage-data \
	--source-account $(owner) \
	--network $(network) \
	--data-name app.xlm_sh.ipfs \
	--data-value $$(printf %s '$(cid)' | xxd -p | tr -d '\n')

# --------- Radicle --------- #

# .radicle is the radicle-ci-cd submodule: git submodule update --init
radicle_push:
	git push rad main

# What CI checks once a Tansu WASM is in target/wasm32v1-none/release: the tests (the
# upgrade test installs that WASM and the registry manager's tests run it; the others run
# the same source natively), clippy, the format, and Trivy as .github/workflows/trivy-fs.yml.
ci_checks = cargo test && cargo clippy --all-targets --all-features -- -Dwarnings && cargo fmt --check && \
	trivy fs --exit-code 1 --ignore-unfixed --severity CRITICAL,HIGH --skip-dirs '**/node_modules,**/target,release,.claude' .

# A Radicle job of HEAD (`rad-job show $(git rev-parse HEAD)` lists its runs); the log goes
# to the rad-ci branch. It runs in the working tree: commit first.
radicle_ci:  ## Build, test, lint and scan HEAD as a Radicle job
	RADICLE_CI_CMD="make contract_build && $(ci_checks)" .radicle/ci.sh

# The candidate of a release, before any tag exists. main goes to Radicle, then one Radicle
# job of HEAD builds both contracts in the pinned image into release/<tag>/ and checks that
# build: its Tansu WASM replaces the local one for the tests, and Trivy also reads its SBOM.
# The job's log holds the build and the hashes of what was checked. To build again, move
# release/<tag>/ away. The build runs in engine= with build_flags= (see their defaults).
radicle_release_candidate:  ## Build tag=<vX.Y.Z> from HEAD in the pinned image and check that build, as a Radicle job; nothing is tagged
	git push rad main
	RADICLE_CI_CMD="STELLAR_CONTAINER_ENGINE='$(engine)' RELEASE_BUILD_FLAGS='$(build_flags)' STELLAR_IMAGE='$(image)' \
		RELEASE_PACKAGES='tansu tansu-executor' RELEASE_HOME_DOMAIN=tansu.dev .radicle/release.sh build '$(tag)' && \
		cat release/$(tag)/SHA256SUMS && \
		mkdir -p target/wasm32v1-none/release && cp release/$(tag)/tansu_v*.wasm target/wasm32v1-none/release/tansu.wasm && \
		$(ci_checks) && \
		trivy sbom --exit-code 1 --ignore-unfixed --severity CRITICAL,HIGH release/$(tag)/sbom.spdx.json" .radicle/ci.sh

# Once the candidate's job has succeeded and its log has been read. The tag goes to Radicle
# only: a v* tag pushed to GitHub starts sbom.yml, which records evidence on-chain. The
# publication refuses a bundle that is not the build of the tagged commit, registers and
# seeds every file of it, and needs `rad-artifact node start` running. If it stops midway,
# `.radicle/release.sh publish <tag>` takes it up again: the tag is already there.
radicle_release:  ## Tag HEAD as tag=<vX.Y.Z>, push the tag to Radicle and publish the checked build there
	git tag "$(tag)"
	git push rad "$(tag)"
	.radicle/release.sh publish "$(tag)"

# A Radicle job of the commit of tag=<vX.Y.Z>, run after the release job of a contract: its
# release WASM wasm=<path>, named <package>_v<version>.wasm, is published on the Stellar
# Registry as <package> at <version>.
radicle_register:  ## Publish the release WASM wasm=<path> of tag=<vX.Y.Z> on the Stellar Registry, as a Radicle job
	STELLAR_NETWORK=$(network) STELLAR_ACCOUNT=$(admin) .radicle/registry.sh $(wasm) $(tag) $(sign) $(dry)

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

# `maintainer2` is the second maintainer's identity: `grogu` off mainnet, and it must be
# given on mainnet (`make contract_register network=mainnet maintainer2=<identity>`).
# bafybeift4uou7f4qdrchrbwebxxvgf2ecmx56qqo6l2fyimmr4skb3iibi for salib
contract_register:
	$(if $(maintainer2),,$(error maintainer2 is required on mainnet: give the second maintainer's identity, e.g. maintainer2=<name>))
	stellar contract invoke \
    	--source-account $(admin) \
    	--network $(network) \
    	--id $(tansu_id) \
    	-- \
    	register \
    	--maintainer $(admin) \
    	--name tansu \
    	--maintainers '["$(shell stellar keys address $(admin))", "$(shell stellar keys address $(maintainer2))"]' \
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

# --------- Release --------- #

# The Tansu project on the network, whose releases are declared on-chain.
override tansu_key = 37ae83c06fde1043724743335ac2f3919307892ee6307cce8c0c63eaa549e156

# The commit of tag=<vX.Y.Z> becomes the latest commit of the project, and the
# provenance in release/<tag>/ becomes evidence of it. The maintainer of the project
# signs, as admin=<identity or address>; one without a local key adds
# sign=--sign-with-lab. Needs an unpaused contract.
contract_release:  ## Declare release tag=<vX.Y.Z> on Tansu: its commit and its attestations
	.radicle/release.sh verify "$(tag)"
	stellar contract invoke \
	--source-account $(admin) \
	--network $(network) \
	--id $(tansu_id) \
	$(sign) \
	-- \
	commit \
	--maintainer $(admin) \
	--project_key $(tansu_key) \
	--hash $$(git rev-parse '$(tag)^{commit}')
	TANSU_SIGN_ARGS='$(sign)' tools/evidence/publish.sh \
		--project-key $(tansu_key) \
		--commit-hash $$(git rev-parse '$(tag)^{commit}') \
		--kind attestation \
		--file "release/$(tag)/provenance.json" \
		--network $(network) \
		--contract-id $(tansu_id) \
		--source-account $(admin) \
		--maintainer $(admin)

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

