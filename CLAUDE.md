# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Tansu — decentralized project governance on Stellar. Soroban smart contracts provide on-chain commit tracking, membership/badges, and DAO proposals with public and anonymous (commitment-based) voting. Monorepo:

- `contracts/` — Rust workspace (soroban-sdk): `contracts/tansu` (main contract) and `contracts/scf-membership` (NFT membership contract)
- `dapp/` — Astro + React + TypeScript frontend, Bun as package manager, deployed on Netlify
- `dapp/packages/tansu`, `dapp/packages/scf-membership` — TypeScript contract bindings **generated** from the WASM (do not hand-edit; regenerate with `make contract_bindings`)
- `dapp/workers/ipfs-delegation/` — Cloudflare worker for IPFS uploads via Filebase (has its own README)
- `tansu/` — Python package (`pip install -e .`-style hatch project): chain-event ingestion into Postgres (SQLAlchemy + Alembic) plus a FastAPI backend
- `website/` — Docusaurus documentation site
- `pre-commit/` — custom pre-push hook that records the commit hash on-chain
- `tools/evidence/` — publish SBOM/audit evidence artifacts to IPFS and record CIDs on-chain

## Commands

`make help` lists all Makefile targets. Makefile defaults: `network=testnet` (override with `network=mainnet` or anything else for local), contract IDs read from `.stellar/tansu_id-<network>`.

### Contracts (repo root)

```bash
make contract_build        # stellar contract build --optimize (target wasm32v1-none)
make contract_test         # cargo test (all contracts)
cargo test test_name       # single test; tests live in contracts/tansu/src/tests/
make rust-lint             # cargo clippy --all-targets --all-features -- -Dwarnings + cargo fmt
make contract_bindings     # regenerate TS bindings into dapp/packages/* (builds first)
```

### dApp (run from `dapp/`)

```bash
bun install
cp .env.example .env       # all variables are required
bun dev                    # dev server on http://localhost:4321
bun run build
bun run test               # Playwright e2e (tests/*.spec.ts)
bunx playwright test tests/governance-flows.spec.ts   # single e2e file
bun run test:unit          # vitest, includes tests/unit/**/*.test.ts
bunx vitest run tests/unit/utils/errorHandler.test.ts # single unit test
bun run lint               # prettier -c + eslint + ts-prune + validate-contract-errors
bun run format
bun run check              # astro check
```

Vitest resolves path aliases `types`, `utils`, `contracts`, `schemas`, `components` to `src/*`. `bun scripts/validate-contract-errors.js` keeps the dApp's contract-error mapping in sync with the Rust contract errors — run it (it's part of `lint`) after touching `contracts/tansu/src/errors.rs`.

### Python events service (`tansu/`)

```bash
docker compose up          # postgres + stellar/quickstart local network (repo root)
pytest                     # from tansu/; asyncio_mode=auto
```

### Linting / pre-commit

```bash
pre-commit install
pre-commit run --all-files
```

Hooks: zizmor (GitHub Actions), ruff + ruff-format (Python), clippy `-Dwarnings` + rustfmt (Rust), prettier + eslint + astro check (dApp), website format/lint. A pre-push stage hook records the commit hash on-chain.

## Architecture

### Main contract (`contracts/tansu/`)

One `Tansu` contract implementing four traits, one file per domain (all wired in `lib.rs`):

- `TansuTrait` (`contract_tansu.rs`) — admin config, pause, and a propose → approve → finalize **multi-admin upgrade flow** (not a simple owner upgrade)
- `MembershipTrait` (`contract_membership.rs`) — members with optional git identity (ed25519 pubkey + signature), per-project badges that determine voting weight (`get_max_weight`)
- `VersioningTrait` (`contract_versioning.rs`) — project registration (requires a 5 XLM collateral via the native-asset SAC), commit hash tracking, evidence records (SBOM/CVE artifacts as IPFS CIDs)
- `DaoTrait` (`contract_dao.rs`) — proposals with public or anonymous voting; anonymous votes use BLS12-381 commitments (`build_commitments_from_votes`, `proof`), tallies revealed at `execute` time; optional `outcome_contracts` invoked on execution

Cross-contract references (`ContractRef` in `types.rs`) carry an optional WASM hash validated against on-chain data before invocation (`validate_contract` in `lib.rs`). Maintainer authorization goes through `auth_maintainers` in `lib.rs`. Errors are a single `ContractErrors` enum in `errors.rs` (mirrored in the dApp — see validate-contract-errors above). Tests are integration-style in `src/tests/` with expected-cost snapshots in `test_snapshots/`.

### dApp (`dapp/`)

Astro pages with React islands; nanostores for state. All contract interaction goes through the service layer in `src/service/` (e.g. `TxService`, `ReadContractService`, `FlowService`, `ProposalService`, `walletService`) on top of the generated bindings in `dapp/packages/`. User journeys funnel through the `FlowProgressModal` flow component. Wallets via Stellar Wallets Kit. Repository metadata is fetched unauthenticated in the browser from public provider APIs (GitHub, GitLab, Bitbucket, Codeberg, Gitea) — no server proxy.

### Events pipeline (`tansu/`)

`src/tansu/events/` ingests Soroban contract events into Postgres (`ingest.py`, `consume.py`, SQLAlchemy models in `database/`, Alembic migrations in `alembic/`) and serves them through a FastAPI app (`app.py`, `routers/`).

## Workflow and conventions

- **Radicle is the primary forge; GitHub is a mirror.** Do not create GitHub issues or PRs unless explicitly asked.
- Trunk-based development: every change goes through a branch + review; squash-merge keeps history linear. `main` must stay green.
- All code changes need tests and documentation; human review is mandatory (see CONTRIBUTING.md for the AI tool-use policy).
- CONTRIBUTING.md is the canonical reference for deployment/release procedures (Python release via hatch + tag-triggered workflow, dApp via Netlify — staging `testnet.tansu.dev` tracks `main`, production `app.tansu.dev` tracks `app_prod` — contract releases on `v*` tags followed by the on-chain propose/approve/finalize upgrade flow).
