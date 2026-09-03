#!/usr/bin/env bash
# End-to-end test of the registry-tansu-manager flow against testnet
# (or any configured stellar network via $NETWORK).
#
# The published + deployed payload is the registry contract's own wasm: the
# proposal deploys a *subregistry* (root = the root registry from step 1), which
# exercises the manager→registry deploy path against the registry's real
# 3-arg `__constructor(admin, manager, root)`.
#
# Flow:
#   1. Deploy a fresh root registry (admin as bootstrap manager).
#   2. Publish the registry wasm to that registry under the name `registry`.
#   3. Deploy a tansu-stub (stand-in for the Tansu DAO; implements
#      `get_proposal` + a Tansu-like `execute` that auto-invokes the outcome).
#   4. Deploy the registry-tansu-manager, pointing at the stub + registry.
#   5. Admin installs the manager on the registry.
#   6. Plant an `Approved` deploy-proposal on the stub (deploys a subregistry).
#   7. Call manager.trigger(proposal_id). The manager reads the proposal,
#      pre-authorizes the outcome (registry.deploy) via
#      `env.authorize_as_current_contract`, then calls stub.execute — which
#      auto-invokes the outcome. The registry's manager.require_auth() is
#      satisfied by the pre-authorization, so the deploy lands in one tx.
#   8. Verify: the registry resolves the deployed subregistry and it responds
#      to a read call (`manager()`).
#   9. Replay guard: second trigger(proposal_id) returns ProposalActive (#402).
#
# Usage: contracts/registry-tansu-manager/e2e-testnet.sh
# Env vars:
#   NETWORK          Stellar network alias (default: testnet; must be in `stellar network ls`).
#   RUN_ID           Suffix appended to ephemeral identities/aliases (default: epoch).
#   PROPOSAL_ID      Proposal id to use (default: 1).
#   PAYLOAD_VERSION  Version published for the registry payload (default: 0.1.0).
#   CONTRACT_NAME    Name the registry gives the deployed subregistry (default: subregistry-$RUN_ID).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WASM_DIR="$REPO_ROOT/target/stellar/local"

NETWORK="${NETWORK:-testnet}"
RUN_ID="${RUN_ID:-$(date +%s)}"
PROPOSAL_ID="${PROPOSAL_ID:-1}"
PAYLOAD_VERSION="${PAYLOAD_VERSION:-0.1.0}"
CONTRACT_NAME="${CONTRACT_NAME:-subregistry-${RUN_ID}}"
# 32-byte arbitrary project_key, hex-encoded. Tansu uses keccak256(name); we
# just need a stable 32-byte value the manager can store and the stub can key on.
PROJECT_KEY="aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899"

# The registry wasm is both the registry we stand up (step 1) and the payload
# the proposal publishes + deploys as a subregistry (steps 2, 7).
REGISTRY_WASM="$WASM_DIR/registry.wasm"
MANAGER_WASM="$WASM_DIR/registry_tansu_manager.wasm"
STUB_WASM="$WASM_DIR/tansu_stub.wasm"

for w in "$REGISTRY_WASM" "$MANAGER_WASM" "$STUB_WASM"; do
    if [ ! -f "$w" ]; then
        echo "❌ missing $w — run \`just build\` first" >&2
        exit 1
    fi
done

# Ensure the network alias exists locally. 
if ! stellar network ls 2>/dev/null | grep -qx "$NETWORK"; then
    echo "❌ stellar network '$NETWORK' is not configured; run \`stellar network add\` first" >&2
    exit 1
fi

ADMIN_ID="${ADMIN_ID:-e2e-admin-${RUN_ID}}"
AUTHOR_ID="${AUTHOR_ID:-e2e-author-${RUN_ID}}"
CALLER_ID="${CALLER_ID:-e2e-caller-${RUN_ID}}"

ensure_account() {
    local id="$1"
    if ! stellar keys ls 2>/dev/null | grep -qx "$id"; then
        echo "==> Generating + funding $id on $NETWORK"
        stellar keys generate --network "$NETWORK" --fund "$id" >/dev/null
    fi
}
ensure_account "$ADMIN_ID"
ensure_account "$AUTHOR_ID"
ensure_account "$CALLER_ID"

ADMIN_ADDR=$(stellar keys address "$ADMIN_ID")
AUTHOR_ADDR=$(stellar keys address "$AUTHOR_ID")

echo "==> Network:   $NETWORK"
echo "==> Run id:    $RUN_ID"
echo "==> Admin:     $ADMIN_ID ($ADMIN_ADDR)"
echo "==> Author:    $AUTHOR_ID ($AUTHOR_ADDR)"

# 1. Registry — root registry requires a manager at construction; bootstrap
#    with admin as the initial manager, then swap to the real manager contract
#    in step 5.
echo "==> Deploying registry"
REGISTRY_ID=$(stellar contract deploy --wasm "$REGISTRY_WASM" \
    --source "$ADMIN_ID" --network "$NETWORK" \
    --alias "registry-e2e-${RUN_ID}" \
    -- --admin "$ADMIN_ADDR" --manager "\"$ADMIN_ADDR\"")
echo "    registry: $REGISTRY_ID"

# 2. Upload the registry wasm and have admin-as-manager publish it on the
#    author's behalf under the name `registry`. With a manager set, the registry
#    requires manager auth for the first publish under a given wasm name; the
#    recorded author is still $AUTHOR_ADDR.
echo "==> Uploading registry.wasm (payload)"
PAYLOAD_HASH=$(stellar contract upload --wasm "$REGISTRY_WASM" \
    --source "$ADMIN_ID" --network "$NETWORK")
echo "    hash:     $PAYLOAD_HASH"

echo "==> Publishing registry@$PAYLOAD_VERSION (author=$AUTHOR_ADDR, manager=$ADMIN_ID)"
stellar contract invoke --id "$REGISTRY_ID" \
    --source "$ADMIN_ID" --network "$NETWORK" \
    -- publish_hash \
    --wasm_name registry \
    --author "$AUTHOR_ADDR" \
    --wasm_hash "$PAYLOAD_HASH" \
    --version "$PAYLOAD_VERSION"

# 3. Tansu stub.
echo "==> Deploying tansu-stub"
TANSU_ID=$(stellar contract deploy --wasm "$STUB_WASM" \
    --source "$ADMIN_ID" --network "$NETWORK" \
    --alias "tansu-stub-${RUN_ID}")
echo "    stub:     $TANSU_ID"

# 4. Manager pointing at the stub + registry.
echo "==> Deploying registry-tansu-manager"
MANAGER_ID=$(stellar contract deploy --wasm "$MANAGER_WASM" \
    --source "$ADMIN_ID" --network "$NETWORK" \
    --alias "manager-e2e-${RUN_ID}" \
    -- \
    --tansu "$TANSU_ID" \
    --project_key "$PROJECT_KEY" \
    --registry "$REGISTRY_ID")
echo "    manager:  $MANAGER_ID"

# 5. Install the manager on the registry.
echo "==> Installing manager on registry"
stellar contract invoke --id "$REGISTRY_ID" \
    --source "$ADMIN_ID" --network "$NETWORK" \
    -- set_manager --new_manager "$MANAGER_ID"

# 6. Plant an Approved deploy-proposal on the stub. The outcome deploys a
#    subregistry: init = registry __constructor(admin, manager=None,
#    root=$REGISTRY_ID). `--manager` is omitted (None) so the deployed instance
#    defers to $REGISTRY_ID as root rather than auto-deploying `unverified`.
echo "==> Planting Approved deploy-proposal #$PROPOSAL_ID for contract '$CONTRACT_NAME'"
stellar contract invoke --id "$TANSU_ID" \
    --source "$ADMIN_ID" --network "$NETWORK" \
    -- set_deploy_proposal \
    --project_key "$PROJECT_KEY" \
    --proposal_id "$PROPOSAL_ID" \
    --registry "$REGISTRY_ID" \
    --wasm_name "registry" \
    --version "\"$PAYLOAD_VERSION\"" \
    --contract_name "$CONTRACT_NAME" \
    --admin "$ADMIN_ADDR" \
    --root "$REGISTRY_ID"

# 7. Drive the proposal via manager.trigger. The manager reads the proposal
#    from the stub, pre-authorizes the single outcome (registry.deploy) via
#    `env.authorize_as_current_contract`, then calls the stub's
#    `execute(...)`. The stub mimics real Tansu: auto-invokes the outcome via
#    XCC; the registry's `manager.require_auth()` is satisfied by the
#    pre-authorization, so the deploy lands in the same tx.
echo "==> Driving proposal via manager.trigger"
stellar contract invoke --id "$MANAGER_ID" \
    --source "$CALLER_ID" --network "$NETWORK" \
    -- trigger --proposal_id "$PROPOSAL_ID"

# 8. Verify the registry now resolves the deployed contract.
echo "==> Resolving deployed contract via registry"
DEPLOYED_RAW=$(stellar contract invoke --id "$REGISTRY_ID" \
    --source "$CALLER_ID" --network "$NETWORK" \
    -- fetch_contract_id --contract_name "$CONTRACT_NAME")
DEPLOYED="${DEPLOYED_RAW//\"/}"
echo "    deployed: $DEPLOYED"

# The deployed payload is a registry, not hello — prove it's live with a
# read-only `manager()` call (a subregistry deployed with manager=None returns
# null).
echo "==> Calling manager() on the deployed subregistry"
DEPLOYED_MANAGER=$(stellar contract invoke --id "$DEPLOYED" \
    --source "$CALLER_ID" --network "$NETWORK" \
    -- manager)
echo "    manager() = $DEPLOYED_MANAGER"

# 9. Replay guard — Tansu's own `if proposal.status != Active { panic }`
#    (mirrored by the stub as `Error::ProposalActive = 402`).
echo "==> Re-triggering proposal — must fail with ProposalActive"
REPLAY_OUT=$(stellar contract invoke --id "$MANAGER_ID" \
    --source "$CALLER_ID" --network "$NETWORK" \
    -- trigger --proposal_id "$PROPOSAL_ID" 2>&1 || true)
if grep -qE 'ProposalActive|Error\(Contract, ?#402\)' <<<"$REPLAY_OUT"; then
    echo "    ✓ replay rejected"
else
    echo "    ❌ replay was NOT rejected" >&2
    echo "----- replay attempt output -----" >&2
    echo "$REPLAY_OUT" >&2
    exit 1
fi

cat <<EOF

✅ E2E pass
   registry:    $REGISTRY_ID
   manager:     $MANAGER_ID
   stub:        $TANSU_ID
   subregistry: $DEPLOYED  ($CONTRACT_NAME)
EOF
