#!/usr/bin/env bash
# Run after reviewing and applying the update patch; never deploy or sign transactions.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
python3 -m unittest discover -s tools/dependencies/tests
make contract_build
cargo test --locked
cargo clippy --locked --all-targets --all-features -- -Dwarnings
cargo fmt --check
(
    cd dapp
    bun install --frozen-lockfile
    bun run lint
    bun run check
    bun run test:unit
    bun run build:lighthouse
)
(
    cd website
    bun install --frozen-lockfile
    bun run linter
    bun run typecheck
    bun run build
)
(
    cd dapp/workers/ipfs-delegation
    bun install --frozen-lockfile
    bunx --no-install tsc --noEmit -p tsconfig.json
    bun run test
)
(
    cd tansu
    uv sync --locked --all-extras
    # Existing fixtures drop/recreate tables. Always use the disposable local test DB,
    # never a developer's inherited production connection variables.
    POSTGRES_HOST=127.0.0.1 POSTGRES_PORT="${DEPENDENCY_TEST_DB_PORT:-5432}" \
        POSTGRES_DATABASE=tansu_test POSTGRES_USER=tansu_test POSTGRES_PASSWORD=tansu_test \
        uv run --locked pytest
)
uv lock --project pre-commit --check
for script in tools/check_conflicts.py tools/export_ballots.py tools/tally.py; do
    uv lock --script "$script" --check
done
trivy fs --exit-code 1 --ignore-unfixed --severity CRITICAL,HIGH \
    --skip-dirs '**/node_modules,**/target,release,.claude,dependency-update-*' .
