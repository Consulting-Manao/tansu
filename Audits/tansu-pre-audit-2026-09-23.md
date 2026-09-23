# Tansu — Pre-Audit Security Report

| Field | Value |
|-------|-------|
| Subject | `contracts/tansu` (crate `tansu` 2.1.0) and `contracts/registry-tansu-manager` (crate `registry-tansu-manager` 0.1.1) |
| Branch | `main` |
| Commit | `4361ed9c9532350436f8ea61663cda95791f0254` (contract sources unchanged since `fc4c010`) |
| Soroban SDK | `28.0.0-rc.1`, resolving `soroban-env-host 28.0.2` and `stellar-xdr 28.0.0` |
| Protocol | 28 |
| Toolchain | Rust 1.95.0, edition 2024, target `wasm32v1-none`, `stellar-cli` 28.0.0 |
| Report type | Internal pre-audit |
| Mode | full |
| Date | 2026-09-23 |
| Tests | 165 workspace tests pass. Findings marked **Reproduced** were confirmed with local tests written for this report and removed afterwards |
| Static analysis | Not run in this pass |
| Raven freshness | Unavailable (`stellar-raven` MCP not authenticated) |
| AI usage disclosure | Drafted with Claude Opus 5.5 from a line-by-line read of the sources at the commit above, the project documentation, and the Soroban SDK and host sources. All reproductions ran against `Env::default()`; nothing touched a live network |

## 1. Executive summary

**What holds up.** Privileged paths load their authority from storage before calling `require_auth`, and no entry point trusts a caller-supplied role. Pause gates every state change. The admin upgrade path is M-of-N with a 24-hour timelock and already uses the SDK 28 `update_current_contract` API. Storage keys are typed throughout. Governance *loosening* waits out a notice window, and each proposal snapshots its execute delay at creation. Anonymous-vote commitments are subgroup-checked. The attestation key is length-prefixed before hashing, and the Git binding reproduces the SSHSIG signed-data layout exactly. Hash-pinned dependencies are re-validated on every call, so a pinned contract whose code changes is refused rather than run (reproduced).

**What needs fixing.** Two High issues, both reachable without any special role:

1. **A single proposal can shut its project's DAO.** `outcome_contracts` is unbounded and lives in a page entry shared by nine proposals. One ~64 KB proposal fills the page; every later proposal on it exceeds the network's 64 KB entry cap and is refused, and `revoke_proposal` does not shrink it.
2. **Token-weighted votes can be recast.** `vote` reads `balance()` and escrows nothing, so 100 tokens walked through five addresses cast 500 weight — and outcome contracts still execute on the result.

Five Medium issues follow: one admin can veto its own removal and every upgrade; the registry manager signs any call an approved proposal names; a deployment without an NQG key cannot vote or attest at all; attestation finality is neither durable nor independent of a single maintainer; and anonymous-ballot validity is checked only off-chain.

**Bottom line: not audit-ready at this commit.** Both High findings are small, local code changes, and most Medium findings are one guard or one snapshot each. Several are already described in the project's own documentation as known limitations; this report treats them as open until the code changes.

### Finding counts

| Severity | Count |
| ---: | ---: |
| Critical | 0 |
| High | 2 |
| Medium | 5 |
| Low | 13 |
| Info | 9 |

## 2. Scope and evidence

### In scope

- `contracts/tansu/src/`: `lib.rs`, `contract_tansu.rs`, `contract_membership.rs`, `contract_versioning.rs`, `contract_dao.rs`, `types.rs`, `errors.rs`, `events.rs`
- `contracts/registry-tansu-manager/src/`
- Tests in both crates, `Makefile` contract targets, `.github/workflows/{contract,contract-release,lint,sbom}.yml`

### Out of scope

- Existing deployments and their data, including any migration between contract versions (handled manually by the team)
- `contracts/tansu/src/contract_migration.rs`: present on disk but not compiled (see F-29)
- The dApp, the Cloudflare IPFS worker, the Python events service, wallets and key custody, except where they consume contract events
- Off-chain anonymous-vote encryption, decryption and tallying
- External contracts Tansu calls (NQG, collateral SAC, token contracts, outcome targets, the Stellar Registry) beyond their interfaces

### Trust assumptions

- **Admins** (`AdminsConfig`) pause the contract, set the collateral and NQG contracts, and upgrade it. Accepting an upgrade needs the threshold and the timelock; every other admin action, including cancelling an upgrade, needs one admin (see F-03). The constructor starts with one admin at threshold 1.
- **Maintainers** fully control their project: commits, evidence, badges, sub-projects, the maintainer list itself, anonymous-voting keys, the attestation threshold, execution, vote removal and revocation. Each of these is a single-maintainer action.
- **On badge-weighted projects, maintainers decide voting weight.** Any maintainer can grant any address the full badge set, and with duplicates (F-11) arbitrary weight up to `u32::MAX`. The DAO vote on such projects is therefore bounded by maintainer trust.
- **Anonymous voting** hides ballots from the public, not from whoever holds the decryption key. That holder sees every ballot and computes the tallies; the contract only checks that the tallies open the stored aggregate. The project's governance documentation states this model.
- **Proposers** are anyone who can pay the proposal deposit. **Voters** pay nothing.
- **Caller-supplied contracts** — the proposal token, outcome targets — are arbitrary code. The NQG contract is admin-supplied and may be hash-pinned.
- **Storage rent.** The contract never extends TTLs; it relies on Protocol 23+ automatic restoration of archived persistent entries (§8).

## 3. Methodology

1. Scope freeze on the commit, SDK and host versions above.
2. Entry-point and authorization tracing across the four Tansu traits and the manager contract.
3. Storage and state-transition tracing, including ledger-entry sizes against network caps.
4. Value-flow tracing: deposits, refunds, and token-weight checks.
5. Exhaustive branch walk per entry point (edge-case method), against the `stellar-audit` checklist: authorization → init and upgrade → cross-contract and tokens → arithmetic → storage and entry sizes → griefing → events and errors.
6. Local reproduction of every behavioural claim that could be reproduced, then STRIDE and severity scoring.

Severity: Critical, High, Medium, Low, Info. Likelihood and Impact: High, Medium, Low.

## 4. Entry-point map

State-changing entry points. Read-only getters are listed only where a finding concerns them.

### Tansu — admin (`contract_tansu.rs`)

| Function | Location | Class | Restriction | Notes |
|----------|----------|-------|-------------|-------|
| `__constructor` | `:13` | Init | Once | Paused, one admin, threshold 1 |
| `pause` | `:37` | Role | one admin | Pause and unpause are both 1-of-N (F-03) |
| `set_collateral_contract` | `:96` | Role | one admin | Optional WASM hash pin |
| `set_nqg_contract` | `:120` | Role | one admin | Sets the NQG project key too |
| `propose_upgrade` | `:161` | Role | one admin | Threshold checked, duplicates not (F-08) |
| `approve_upgrade` | `:216` | Role | one admin | Counts against the current config |
| `finalize_upgrade` | `:268` | Role | accept: threshold + timelock; **cancel: one admin** | F-03 |

### Tansu — membership (`contract_membership.rs`)

| Function | Location | Class | Restriction | Notes |
|----------|----------|-------|-------------|-------|
| `add_member` | `:27` | Public | `member_address.require_auth` | Optional Ed25519 Git binding |
| `update_member` | `:94` | Public | `member_address.require_auth` | Emits `MemberAdded` (F-23) |
| `set_badges` | `:181` | Role | `auth_maintainers` | Unbounded list, summed without dedup (F-11) |

### Tansu — versioning and attestation (`contract_versioning.rs`)

| Function | Location | Class | Restriction | Notes |
|----------|----------|-------|-------------|-------|
| `register` | `:69` | Public | caller must be in `maintainers` | Registration deposit |
| `update_config` | `:216` | Role | `auth_maintainers` | Replaces the whole maintainer list (F-13) |
| `commit` | `:311` | Role | `auth_maintainers` | 40/64-hex check |
| `set_evidence` | `:383` | Role | `auth_maintainers` | Append-only, 10 kept |
| `set_sub_projects` | `:546` | Role | `auth_maintainers` | Max 10, keys unchecked by design |
| `set_attestation_threshold` | `:588` | Role | `auth_maintainers` | Immediate, no notice window (F-06) |
| `attest` | `:713` | Role | `auth_maintainers` | Hash format unchecked (F-16) |
| `revoke_attestation` | `:821` | Public | `attester.require_auth` | Own vouch only, 24 h window |

### Tansu — DAO (`contract_dao.rs`)

| Function | Location | Class | Restriction | Notes |
|----------|----------|-------|-------------|-------|
| `anonymous_voting_setup` | `:34` | Role | `auth_maintainers` | Replaceable mid-vote (F-10) |
| `create_proposal` | `:171` | Public | `proposer.require_auth` | `outcome_contracts` unbounded (F-01) |
| `vote` | `:561` | Public | `voter.require_auth` | Token weight not escrowed (F-02) |
| `remove_vote` | `:384` | Role | `auth_maintainers` | Reverses the tally contribution |
| `revoke_proposal` | `:493` | Role | admin **or** maintainer | Marks `Malicious`; keeps outcomes |
| `execute` | `:718` | Role | `auth_maintainers` | Refund, tally, then outcome call |
| `add/remove_conflict_of_interest` | `:1012`, `:1063` | Role | `auth_maintainers` | Unbounded (F-20) |
| `build_commitments_from_votes` | `:116` | Public | none | Simulation-only by design |
| `proof` | `:875` | Public | none | Returns `true` on empty input (F-21) |

### registry-tansu-manager (`lib.rs`)

| Function | Location | Class | Restriction | Notes |
|----------|----------|-------|-------------|-------|
| `__constructor` | `:49` | Init | Once | Tansu address, project key, registry; no admin, no upgrade |
| `trigger` | `:100` | **Public** | **none** | Pre-authorizes the manager for `outcome_contracts[0]` (F-04) |

## 5. Context snapshot

- **Actors.** Admins; project maintainers; proposers; voters; manager contracts acting as maintainers; readers.
- **Storage.**
  - *Instance:* `Paused`, `AdminsConfig`, `UpgradeProposal`, `NqgProjectKey`, `ContractKey::{Collateral, Nqg}`.
  - *Persistent:* projects, project-key pages, members, badges, last commit, evidence, DAO pages (nine proposals each), per-voter votes, voter lists, running tallies, anonymous-vote config, COI lists, governance overrides and pending updates, per-proposal execute-delay snapshots, attestations, finality latches, thresholds.
  - *Temporary:* none.
- **Value flows.** Registration and proposal deposits move through the admin-configured collateral SAC; proposal deposits are refunded on `execute`. Token-weighted voting reads balances and moves nothing.
- **Invariants that should hold:**
  1. Every privileged mutator authenticates a storage-loaded admin or maintainer. **Holds.**
  2. At most one vote per `(project, proposal, voter)`. **Holds.**
  3. A voter's counted weight never exceeds what they hold. **Violated** for token proposals (F-02) and weakened by duplicate badges (F-11).
  4. Anyone may create a proposal on a project while the contract is unpaused. **Violated** after F-01.
  5. Anonymous `execute` accepts only tallies that open the stored aggregate. **Holds** — but per-ballot validity is not checked (F-07).
  6. Once final, an attestation target stays final. **Violated** (F-06).
  7. The admin set can be changed by threshold approval. **Violated**: one admin can veto (F-03), and duplicate admins can freeze it (F-08).
  8. The manager authorizes only calls to its configured registry. **Violated** (F-04).

## 6. STRIDE analysis

### Spoofing
- **Threat:** acting as an admin, maintainer, voter, or Git identity.
- **Controls:** storage-loaded `require_auth` throughout; voters can only vote as themselves; the Git binding signs `address ‖ pubkey ‖ identity` under the SSHSIG layout with namespace `tansu`.
- **Residual:** a Git identity string is not unique, and the link between the key and the forge account is off-chain (F-27).

### Tampering
- **Threat:** altering votes, weights, finality, outcomes, or code.
- **Controls:** running aggregate commitments; subgroup checks; maintainer-only execution; upgrade threshold and timelock; append-only evidence.
- **Residual:** token weight can be recast (F-02); badge weight can be inflated (F-11); anonymous ballots are unproven and unbound (F-07); finality moves with the maintainer set and threshold (F-06); the manager signs arbitrary targets (F-04).

### Repudiation
- **Controls:** 22 event types across every domain.
- **Residual:** events omit the maintainer list and the admin set they change, pruned attestations leave no trace, and `BadgesUpdated` has no project topic (F-23).

### Information disclosure
- Public votes and all weights are visible by design. Anonymous ballots are hidden from the public but visible to the decryption-key holder, and the key can be swapped mid-vote by one maintainer (F-10).

### Denial of service
- **Controls:** caps on voters (40), proposals per page (9), pages (1,000), evidence (10), attestations (25), maintainers (25), sub-projects (10), title and CID lengths.
- **Residual:** one proposal can close its project's DAO (F-01); a failing outcome leaves a proposal unexecutable (F-14); the 9,000-proposal lifetime cap can be burned by outsiders (F-17); a missing NQG key blocks all voting (F-05); hostile token decimals trap `vote` (F-18); a pause silently expires voting and revocation windows (F-15).

### Elevation of privilege
- One admin can veto its own removal and undo a pause (F-03). One maintainer can replace the maintainer set (F-13) or force attestation finality (F-06). An approved proposal becomes an arbitrary call signed by the manager (F-04).

## 7. Findings register

| ID | Severity | Title | Location | Status |
|----|----------|-------|----------|--------|
| F-01 | High | One oversized proposal permanently closes its project's DAO | `contract_dao.rs:171-302`, `:516-519` | Open (**Reproduced**) |
| F-02 | High | Token-weighted votes are never escrowed, so one balance can be recast | `contract_dao.rs:646-653` | Open (**Reproduced**, documented) |
| F-03 | Medium | One admin can block its own removal and every upgrade | `contract_tansu.rs:37-56`, `:268-323` | Open (**Reproduced**) |
| F-04 | Medium | `trigger` lends the manager's authority to any target | `registry-tansu-manager/src/lib.rs:100-141` | Open (**Reproduced**, documented) |
| F-05 | Medium | A deployment without an NQG key cannot vote or attest | `contract_membership.rs:319-323` | Open (**Reproduced**) |
| F-06 | Medium | Attestation finality is not durable and one maintainer can force it | `contract_versioning.rs:588-599`, `:641-686`, `:971-995` | Open (documented) |
| F-07 | Medium | Anonymous ballot validity is checked only off-chain | `contract_dao.rs:614-627`, `:1285-1316` | Open (**Reproduced**, partly documented) |
| F-08 | Low | Duplicate admins freeze every future upgrade | `contract_tansu.rs:183` | Open (**Reproduced**) |
| F-09 | Low | A misspelled pin key is silently dropped under SDK 28 | `types.rs:11-14`, `lib.rs:321-329` | Open (**Reproduced**) |
| F-10 | Low | The anonymous-voting key can be swapped mid-vote | `contract_dao.rs:34-72` | Open (**Reproduced**) |
| F-11 | Low | Duplicate badges inflate weight, then trap | `contract_membership.rs:342-346` | Open (**Reproduced**) |
| F-12 | Low | NQG return values are not range-checked | `contract_membership.rs:403-419` | Open (**Reproduced**) |
| F-13 | Low | One maintainer can replace the whole maintainer set | `contract_versioning.rs:216-244` | Open (**Reproduced**) |
| F-14 | Low | A failing outcome leaves its proposal unexecutable | `contract_dao.rs:827-845` | Open (**Reproduced**, documented) |
| F-15 | Low | A pause silently expires voting and revocation windows | `contract_dao.rs:579`, `contract_versioning.rs:864-869` | Open (**Reproduced**) |
| F-16 | Low | `attest` accepts any string as a commit hash | `contract_versioning.rs:725-727` | Open (**Reproduced**) |
| F-17 | Low | Anyone can burn a project's 9,000-proposal lifetime cap | `contract_dao.rs:14-15`, `:283-289` | Open |
| F-18 | Low | `vote` traps on tokens with large `decimals()` | `contract_dao.rs:649` | Open (**Reproduced**) |
| F-19 | Low | The manager is built against an unpinned local Tansu artifact | `registry-tansu-manager/src/lib.rs:26-28`, `:49-55` | Open |
| F-20 | Low | Conflict-of-interest lists are unbounded | `contract_dao.rs:1012-1049` | Open |
| F-21 | Info | `proof()` returns `true` for empty input | `contract_dao.rs:875-936` | Open (**Reproduced**) |
| F-22 | Info | Reachable paths trap with untyped host errors | multiple | Open |
| F-23 | Info | Events omit the facts monitoring needs | `events.rs` | Open |
| F-24 | Info | Project names accept the empty string and case variants | `contract_versioning.rs:96-107` | Open (**Reproduced**) |
| F-25 | Info | Mainline build pins an SDK release candidate | `Cargo.toml` | Open |
| F-26 | Info | Code comments contradict the code | multiple | Open |
| F-27 | Info | Git identity binding: no uniqueness, no removal | `contract_membership.rs:27-141` | Open |
| F-28 | Info | `trigger` has no functional test | `registry-tansu-manager/src/test.rs` | Open |
| F-29 | Info | Dead migration module | `contract_migration.rs` | Open |

"Documented" means the project's own documentation describes the behaviour as a known limitation; the code is unchanged.

---

### F-01 — One oversized proposal permanently closes its project's DAO

| Field | Value |
|-------|-------|
| Severity | High |
| Likelihood | Medium |
| Impact | High |
| Location | `contracts/tansu/src/contract_dao.rs:171-302` (validation `:198-203`, page write `:296-302`), `:516-519` |
| Status | Open (**Reproduced**) |

**Description**
`create_proposal` bounds the title (5–256), the IPFS CID (32–64) and the voting window, but stores `outcome_contracts: Option<Vec<OutcomeContract>>` as given — any number of entries, each with an unbounded `args: Vec<Val>`. The proposal is appended to `ProjectKey::Dao(project_key, page)`, one persistent entry shared by nine consecutive proposals, and the page index is fixed by the proposal counter: `page = proposal_id / 9`.

Every contract-data entry is capped at 64 KB (65,536 bytes) on write. A proposal sized to leave the page just under that cap is accepted. The next proposal on the same page pushes the entry over the cap, the write is refused, and the counter does not advance — so every later attempt lands on the same page and is refused too. `revoke_proposal` redacts the title and CID but keeps `outcome_contracts`, so maintainers cannot shrink the page back.

**Impact**
Nobody can create another proposal on that project, permanently, without a contract upgrade. Existing proposals can still be voted on, executed, or revoked. Only indices 0–2 of `outcome_contracts` are ever read, so everything past three entries is dead weight.

**Likelihood**
Anyone who can pay one proposal deposit plus the write fees for about 64 KB. The attacker places the proposal anywhere but the last slot of a page. On a project where proposals are contested, this is cheap to do and cannot be undone from inside the contract.

**Evidence**
- `contract_dao.rs:198-203` — no check on `outcome_contracts`
- `contract_dao.rs:284`, `:296-302` — shared page, index fixed by the counter
- `contract_dao.rs:516-519` — revocation keeps `outcome_contracts`
- `contract_dao.rs:828-836` — only indices 0, 1, 2 are used
- Reproduced with exact ledger-entry sizes: one proposal carrying a 64,300-byte argument left the page entry at **65,444 bytes**; after `revoke_proposal` it was **65,408 bytes**; the next ordinary `create_proposal` on the page was refused by the host with `invocation resource limits are exceeded: contract data entry … size: 65824 > 65536`

**Remediation**
Reject `outcome_contracts` longer than 3, and bound the serialized size of each entry's `args` (reject with `ProposalInputValidation`). Clear `outcome_contracts` in `revoke_proposal`. If large outcome payloads are ever needed, move them to their own `ProjectKey::Outcomes(project_key, proposal_id)` entry so one proposal can only ever affect itself.

---

### F-02 — Token-weighted votes are never escrowed, so one balance can be recast

| Field | Value |
|-------|-------|
| Severity | High |
| Likelihood | High |
| Impact | High |
| Location | `contracts/tansu/src/contract_dao.rs:646-653` |
| Status | Open (**Reproduced**; documented in `website/docs/developers/governance.mdx`) |

**Description**
On a proposal with `token_contract: Some(token)`, `vote` checks only `weight × 10^decimals ≤ balance(voter)`. It transfers nothing, snapshots nothing, and records nothing about which tokens have been counted.

**Impact**
The same balance can be moved to a fresh address and voted again, up to the 40-voter cap: up to 40× the true holding, while crowding out other voters. The governance documentation calls token-weighted results advisory — but the contract does not treat them that way: an `Approved` token proposal still invokes `outcome_contracts[0]`, including through a manager contract (F-04).

**Likelihood**
Any token holder, no role, only transaction fees.

**Evidence**
- `contract_dao.rs:646-653` — reads `balance()`, moves nothing
- Reproduced: 100 whole tokens voted from one address, forwarded to the next after each vote, cast **500 weight** across five addresses on one proposal

**Remediation**
Either escrow the weighted amount on `vote` and return it on `execute`/`remove_vote`, or score votes against a balance snapshot taken at `create_proposal`. Until then, refuse to invoke outcome contracts for token-weighted proposals, so that "advisory" is enforced by the code rather than by convention.

---

### F-03 — One admin can block its own removal and every upgrade

| Field | Value |
|-------|-------|
| Severity | Medium |
| Likelihood | Low |
| Impact | High |
| Location | `contracts/tansu/src/contract_tansu.rs:37-56`, `:268-323` (cancel branch `:310-322`) |
| Status | Open (**Reproduced**) |

**Description**
Admin-set changes ride exclusively on `propose_upgrade(new_admins_config)` → `finalize_upgrade(accept: true)`. But `finalize_upgrade(accept: false)` deletes the proposal on the word of **any one admin**, at any time — after threshold approvals, after the timelock. `pause` is also 1-of-N in both directions, as are `set_collateral_contract` and `set_nqg_contract`.

**Impact**
One compromised or rogue admin can cancel every proposal that would remove it, indefinitely, so the M-of-N threshold never actually protects the admin set. The same admin can unpause immediately after an honest emergency pause, and can re-point the collateral or NQG contract (the latter also changes which project uses NQG weights).

**Likelihood**
Needs a compromised or uncooperative admin key.

**Evidence**
- `contract_tansu.rs:310-322` — cancellation needs one `auth_admin`
- `contract_tansu.rs:37-56` — `pause(false)` needs one admin
- Reproduced: with admins `{a, b, c}` at 2-of-3, `a` proposed removing `c`, `b` approved, the timelock elapsed; `c` alone called `finalize_upgrade(false)` and the admin set stayed at three. `c` then undid a pause set by `a`

**Remediation**
Require threshold approval to cancel a proposal that is already at threshold (or let only the proposer cancel before any other approval). Make unpausing a threshold action while keeping pausing 1-of-N. Consider moving collateral and NQG changes onto the same propose/approve/finalize path.

---

### F-04 — `trigger` lends the manager's authority to any target

| Field | Value |
|-------|-------|
| Severity | Medium |
| Likelihood | Medium |
| Impact | High |
| Location | `contracts/registry-tansu-manager/src/lib.rs:100-141` (pre-authorization `:113-123`) |
| Status | Open (**Reproduced**; documented in `governance.mdx`, "Scope the manager's authority") |

**Description**
`trigger` requires no authorization. It reads `outcome_contracts[0]` from the proposal and calls `authorize_as_current_contract` for exactly that `(address, fn, args)`, then `Tansu::execute`. The configured `registry` (`lib.rs:65-67`) is never compared with `oc.address`.

**Impact**
An approved proposal becomes a call signed by the manager to any contract that trusts the manager's address — the registry it manages (the e2e scripts make it the registry manager via `set_manager`) or anything else. One target is out of reach: pointing the outcome back at Tansu fails with the host's re-entry guard, which is a host property rather than a control in this code.

**Likelihood**
Gated by the project's vote. The proposal's title and description are free text and need not describe the on-chain outcome, and on token-weighted projects the vote itself can be manufactured (F-02).

**Evidence**
- `lib.rs:100` — no `require_auth`
- `lib.rs:113-123` — pre-authorization over proposer-chosen values
- Reproduced: with the manager as sole maintainer, an approved proposal targeting an unrelated contract whose privileged function requires the manager's authorization ran from `trigger` called with `set_auths(&[])`; the configured registry was never consulted

**Remediation**

```rust
if oc.address != Self::registry(env) {
    return Err(Error::UnexpectedOutcomeTarget);
}
```

Also restrict `oc.execute_fn` to the registry functions the manager exists to call, and add the tests listed in F-28.

---

### F-05 — A deployment without an NQG key cannot vote or attest

| Field | Value |
|-------|-------|
| Severity | Medium |
| Likelihood | High |
| Impact | Medium |
| Location | `contracts/tansu/src/contract_membership.rs:319-323` |
| Status | Open (**Reproduced**) |

**Description**
`get_max_weight` unconditionally reads `DataKey::NqgProjectKey` with `.expect("NQG project key exists")`. Only `set_nqg_contract` writes that key; the constructor does not. Both `vote` (badge proposals) and `attest` call `get_max_weight`.

**Impact**
Until an admin configures NQG — even on a deployment that will never use it — every badge-weighted vote and every attestation traps with an untyped host error that clients cannot map.

**Likelihood**
High for new deployments: `make testnet_reset` deploys, sets collateral, unpauses, registers and commits, but never calls `contract_set_nqg_contract`. The test harness always sets NQG (`test_utils.rs:63-67`), so CI does not see it.

**Evidence**
- Reproduced: on a contract set up exactly like `testnet_reset`, both `attest` and `vote` returned `Err(Ok(Error(Context, InvalidAction)))`

**Remediation**
Treat a missing key as "no NQG project":

```rust
let nqg_key: Option<Bytes> = env.storage().instance().get(&types::DataKey::NqgProjectKey);
if nqg_key.as_ref() == Some(&project_key) {
    return get_nqg(&env, member_address);
}
```

Add a test fixture that provisions only what the deploy playbook provisions.

---

### F-06 — Attestation finality is not durable and one maintainer can force it

| Field | Value |
|-------|-------|
| Severity | Medium |
| Likelihood | Medium |
| Impact | Medium |
| Location | `contracts/tansu/src/contract_versioning.rs:588-599`, `:641-686` (`is_final` at `:678`), `:971-995` |
| Status | Open (documented in `code_finality.mdx`, "Known limitation") |

**Description**
`is_final` is recomputed live from the current maintainer count and threshold; the latch that makes finality permanent is written only inside `attest`. Nothing re-evaluates on `update_config` or `set_attestation_threshold`. And unlike the voting settings, which queue a loosening behind a notice window, `set_attestation_threshold` applies a lower bar immediately.

**Impact**
Finality appears and disappears with maintainer churn. A single maintainer can lower the threshold to 50%, turn partially attested targets final at once, and thereby lock every other attester out of `revoke_attestation`. The project's own tests encode this behaviour: `lowering_the_threshold_into_finality_freezes_attestations` and `shrinking_the_maintainer_set_into_finality_freezes_attestations` in `tests/test_attestation.rs`.

**Remediation**
Latch finality wherever it can be reached — at the end of `update_config` and `set_attestation_threshold` for affected targets — or make `is_final` depend only on the latch. Route threshold decreases through `PendingGovernance` like the other governance settings.

---

### F-07 — Anonymous ballot validity is checked only off-chain

| Field | Value |
|-------|-------|
| Severity | Medium |
| Likelihood | Medium |
| Impact | Medium |
| Location | `contracts/tansu/src/contract_dao.rs:614-627`, `:1248-1316`; `types.rs:115-123` |
| Status | Open (**Reproduced**; well-formedness documented in `governance.mdx`) |

**Description**
`vote` accepts an anonymous ballot after checking three commitments in the G1 subgroup and three encrypted strings each. Two properties are left to the off-chain executor:

- **Well-formedness.** Nothing proves the committed vector is one-hot, so a ballot can weigh on several choices or carry an oversized value. An oversized value can also make the aggregate impossible to open with the `u128` tallies `execute` accepts, leaving the proposal unexecutable until the ballot is removed.
- **Binding.** A commitment is not tied to its voter or proposal on-chain. Another address can submit an identical ballot and it is accepted and aggregated. The documentation's replay protection lives inside the encrypted payload, so only the executor, after decrypting, can notice.

**Impact**
Ballot integrity depends on the executor inspecting every decrypted ballot and calling `remove_vote` where needed.

**Evidence**
- `contract_dao.rs:616-626` — structural checks only
- Reproduced: a second address submitted the first voter's commitments and encrypted fields verbatim and the vote was accepted

**Remediation**
Verify a per-ballot proof on-chain that the commitment opens to a one-hot vector and is bound to `(voter, project, proposal)`. The host provides BLS12-381 pairings as well as BN254 and Poseidon, so a Groth16 verifier is feasible. Until then, keep describing anonymous votes as procedurally rather than cryptographically enforced.

---

### F-08 — Duplicate admins freeze every future upgrade

| Field | Value |
|-------|-------|
| Severity | Low |
| Likelihood | Low |
| Impact | High |
| Location | `contracts/tansu/src/contract_tansu.rs:183` |
| Status | Open (**Reproduced**) |

**Description and impact.** `propose_upgrade` checks `0 < threshold ≤ admins.len()` but not uniqueness. `{threshold: 2, admins: [b, b]}` is accepted; afterwards `b` cannot approve twice (`AlreadyVoted`) and no proposal can ever reach threshold (`UpgradeError`). Since admin changes only happen through upgrades, the contract is frozen at its current code and admin set for good.

**Evidence.** Reproduced exactly as described.

**Remediation.** Reject duplicate admins with the same pairwise check `validate_maintainers` already uses.

---

### F-09 — A misspelled pin key is silently dropped under SDK 28

| Field | Value |
|-------|-------|
| Severity | Low |
| Likelihood | Low |
| Impact | Medium |
| Location | `contracts/tansu/src/types.rs:11-14`; `lib.rs:321-329`; `contract_tansu.rs:96`, `:120` |
| Status | Open (**Reproduced**) |

**Description.** Since SDK 28, a `contracttype` struct argument unpacks from a map that omits `Option` fields and carries unknown keys. `ContractRef { address, wasm_hash: Option<BytesN<32>> }` passed with a typo such as `wasmhash` now decodes as `wasm_hash: None`, and `validate_contract` skips the check.

**Impact.** An admin who meant to pin the NQG or collateral contract gets no pin and no error.

**Evidence.** Reproduced: the correctly spelled wrong pin was rejected with `ContractValidation`; the same map with `wasmhash` was accepted and stored unpinned.

**Remediation.** Make pinning explicit and unambiguous — for example an enum `Pin::None | Pin::Wasm(BytesN<32>)`, which unpacks as a vec and is not affected by lenient map unpacking — and emit the stored pin in `ContractUpdated`.

---

### F-10 — The anonymous-voting key can be swapped mid-vote

| Field | Value |
|-------|-------|
| Severity | Low |
| Likelihood | Low |
| Impact | Medium |
| Location | `contracts/tansu/src/contract_dao.rs:34-72` |
| Status | Open (**Reproduced**) |

**Description.** `anonymous_voting_setup` overwrites the project's public key at any time, by any single maintainer. Proposals do not snapshot it.

**Impact.** Ballots cast on one proposal can end up encrypted to different keys; if the earlier key's holder does not cooperate, the proposal cannot be tallied. A maintainer can also switch the key to one they hold.

**Evidence.** Reproduced: a second maintainer replaced the key while an anonymous proposal was `Active`.

**Remediation.** Snapshot the key into the proposal at `create_proposal` (clients encrypt to the proposal's key), or refuse key changes while any anonymous proposal on the project is active.

---

### F-11 — Duplicate badges inflate weight, then trap

| Field | Value |
|-------|-------|
| Severity | Low |
| Likelihood | Low |
| Impact | Medium |
| Location | `contracts/tansu/src/contract_membership.rs:181-268`, `:342-346` |
| Status | Open (**Reproduced**) |

**Description.** `set_badges` stores the list as given, with no length bound, and `get_max_weight` sums it without deduplication. The project-side badge lists use `contains`, so the two views diverge.

**Impact.** 429 `Developer` badges yield weight 4,290,000,000; one more overflows `u32` and every weight lookup for that member traps.

**Remediation.** Deduplicate by kind in `set_badges` (at most four real badges), or sum distinct kinds only.

---

### F-12 — NQG return values are not range-checked

| Field | Value |
|-------|-------|
| Severity | Low |
| Likelihood | Low |
| Impact | Medium |
| Location | `contracts/tansu/src/contract_membership.rs:403-419` |
| Status | Open (**Reproduced**) |

**Description.** `scaled.to_i128().unwrap() as u32` panics when the value does not fit in `i128`, and otherwise truncates. A negative score wraps to a very large `u32` and passes the `> 4_000_000` gate. The function fails closed only when the call itself fails.

**Evidence.** Reproduced: an NQG returning −1 (after scaling) produced weight **4,294,967,295**.

**Remediation.** Return 0 for non-positive values, clamp to `u32::MAX`, and replace the `unwrap` with a checked conversion.

---

### F-13 — One maintainer can replace the whole maintainer set

| Field | Value |
|-------|-------|
| Severity | Low |
| Likelihood | Low |
| Impact | Medium |
| Location | `contracts/tansu/src/contract_versioning.rs:216-244` |
| Status | Open (**Reproduced**) |

**Description and impact.** `update_config` validates the new list (non-empty, ≤ 25, no duplicates) but does not require the caller to stay in it. One maintainer can hand the project to anyone, or lock everyone out by mistake. Admins cannot restore a maintainer list, and the project key is `keccak256(name)`, so a captured project cannot be re-registered under its name.

**Evidence.** Reproduced: after one maintainer replaced the list, the other's `commit` failed with `UnauthorizedSigner`.

**Remediation.** Require the caller to remain in the new list. For projects that want it, add a maintainer threshold for changes to the list.

---

### F-14 — A failing outcome leaves its proposal unexecutable

| Field | Value |
|-------|-------|
| Severity | Low |
| Likelihood | Medium |
| Impact | Medium |
| Location | `contracts/tansu/src/contract_dao.rs:827-845` |
| Status | Open (**Reproduced**; documented in `governance.mdx`) |

**Description.** An outcome failure becomes `panic_with_error!(OutcomeError)`, reverting the status change. Retrying replays the same failure.

**Impact.** The vote's result can never be recorded, and the proposal stays `Active` forever. The only way to close it is `revoke_proposal`, which records it as `Malicious` even when the failure lies entirely with the target (paused, upgraded, or refusing the call).

**Evidence.** Reproduced: `execute` → `OutcomeError` (#403), status still `Active`.

**Remediation.** Keep the terminal status and publish an `OutcomeFailed` event instead of panicking, or let a maintainer execute without the outcome after a failure.

---

### F-15 — A pause silently expires voting and revocation windows

| Field | Value |
|-------|-------|
| Severity | Low |
| Likelihood | Medium |
| Impact | Low |
| Location | `contracts/tansu/src/contract_dao.rs:579`; `contract_versioning.rs:864-869` |
| Status | Open (**Reproduced**) |

**Description and impact.** `vote` and `revoke_attestation` are pause-gated, but `voting_ends_at` and the 24-hour revocation window keep running. A pause longer than the remaining window removes the right to vote or revoke, and the vote result stands on whatever was cast before.

**Evidence.** Reproduced: after a 31-hour pause, revocation failed with `AttestationRevocationExpired` and voting with `ProposalVotingTime`.

**Remediation.** Record paused time and extend deadlines by it, or document the behaviour in the pause procedure.

---

### F-16 — `attest` accepts any string as a commit hash

| Field | Value |
|-------|-------|
| Severity | Low |
| Likelihood | Medium |
| Impact | Low |
| Location | `contracts/tansu/src/contract_versioning.rs:725-727`, `:832-834` |
| Status | Open (**Reproduced**) |

**Description and impact.** `commit` and `set_evidence` require 40 or 64 hex characters; `attest` and `revoke_attestation` only reject the empty string. A typo becomes a finalizable target, and each distinct string opens a new persistent entry.

**Evidence.** Reproduced: `attest` accepted `"definitely not a commit"`, which `commit` rejects with `InvalidCommitHash`.

**Remediation.** Call `is_valid_commit_hash` in both attestation paths.

---

### F-17 — Anyone can burn a project's 9,000-proposal lifetime cap

| Field | Value |
|-------|-------|
| Severity | Low |
| Likelihood | Low |
| Impact | Medium |
| Location | `contracts/tansu/src/contract_dao.rs:14-15`, `:283-289` |
| Status | Open |

**Description and impact.** Proposal ids never recycle, and `page ≥ MAX_PAGES` (9 × 1,000) is permanent. Anyone can spend the budget one proposal deposit at a time; after 9,000 the project can never propose again. F-01 reaches the same end far more cheaply.

**Remediation.** Fix F-01 first. Then either recycle page capacity for closed proposals or make the cap per active proposal rather than per lifetime.

---

### F-18 — `vote` traps on tokens with large `decimals()`

| Field | Value |
|-------|-------|
| Severity | Low |
| Likelihood | Low |
| Impact | Low |
| Location | `contracts/tansu/src/contract_dao.rs:649` |
| Status | Open (**Reproduced**) |

**Description and impact.** `(weight as i128) * 10_i128.pow(decimals())` overflows for `decimals() ≥ 39`, and the product can overflow earlier for large weights. The proposal-chosen token makes the proposal unvotable, with an untyped error.

**Evidence.** Reproduced with a token reporting 39 decimals: `Err(Ok(Error(Context, InvalidAction)))`.

**Remediation.** Use `checked_pow` and `checked_mul`, map failure to `VoterWeight`, and reject tokens above 18 decimals at `create_proposal`.

---

### F-19 — The manager is built against an unpinned local Tansu artifact

| Field | Value |
|-------|-------|
| Severity | Low |
| Likelihood | Low |
| Impact | Medium |
| Location | `contracts/registry-tansu-manager/src/lib.rs:26-28`, `:49-55` |
| Status | Open |

**Description and impact.** `contractimport!` reads `target/wasm32v1-none/release/tansu.wasm`, whatever was built last, and the Tansu address is stored bare. Tansu's own pattern for external contracts — `ContractRef` with a hash checked at each use — is not applied, so after a Tansu upgrade the manager may decode proposals against a stale type spec, with no upgrade path of its own.

**Remediation.** Import a released, hash-identified Tansu WASM, and store Tansu as a `ContractRef` validated in `trigger`.

---

### F-20 — Conflict-of-interest lists are unbounded

| Field | Value |
|-------|-------|
| Severity | Low |
| Likelihood | Low |
| Impact | Low |
| Location | `contracts/tansu/src/contract_dao.rs:1012-1049`, `:600-605` |
| Status | Open |

**Description and impact.** Maintainers can append without limit, and every `vote` scans the list. Adding an address after it has voted does not remove its vote (documented).

**Remediation.** Cap the list at the voter cap (40).

---

### F-21 — `proof()` returns `true` for empty input

| Field | Value |
|-------|-------|
| Severity | Info |
| Likelihood | Medium |
| Impact | Low |
| Location | `contracts/tansu/src/contract_dao.rs:875-936` |
| Status | Open (**Reproduced**) |

The public helper compares with `zip`, which stops at the shorter side, so empty tallies and seeds return `true`. It also reads `status` and `public_voting` from a caller-supplied `Proposal` instead of storage. `execute` uses a separate, length-checked path and is unaffected, but clients calling `proof` as a pre-flight check get a false positive. **Fix:** require exactly three tallies and seeds, and load the proposal by id.

---

### F-22 — Reachable paths trap with untyped host errors

| Field | Value |
|-------|-------|
| Severity | Info |
| Likelihood | Medium |
| Impact | Low |
| Location | multiple |
| Status | Open |

| Location | Expression | Reached when |
|----------|-----------|--------------|
| `contract_membership.rs:323` | `.expect("NQG project key exists")` | NQG never set (F-05) |
| `contract_membership.rs:416` | `.to_i128().unwrap()` | NQG out of range (F-12) |
| `contract_membership.rs:346` | `.sum::<u32>()` | duplicate badges (F-11) |
| `contract_membership.rs:401` | `ed25519_verify` | bad Git signature (no `InvalidGitIdentity`) |
| `lib.rs:308` | `.unwrap()` in `retrieve_contract` | collateral never set |
| `contract_dao.rs:649` | `10_i128.pow(..)` | large token decimals (F-18) |
| `contract_versioning.rs:498` | `.expect("Invalid project key")` | listed key without entry |
| `contract_dao.rs:432`, `:679`, `:1299` | `.unwrap()` on tallies | tallies entry missing |

**Fix:** map each to a `ContractErrors` variant via `panic_with_error!`; clients and fuzzers can then tell a guard from a crash.

---

### F-23 — Events omit the facts monitoring needs

| Field | Value |
|-------|-------|
| Severity | Info |
| Likelihood | High |
| Impact | Low |
| Location | `contracts/tansu/src/events.rs` |
| Status | Open |

- `UpgradeProposed` and `UpgradeStatus` omit the admin set the upgrade installs — the most sensitive part of the proposal.
- `ProjectConfigUpdated` omits the new maintainer list.
- `BadgesUpdated` has no `#[topic]` for the project, unlike every other project-scoped event; `tansu/src/tansu/events/ingest.py:37` reads `event.topic[1]` as the project key.
- Pruning stale attestations at capacity emits nothing, although the code says history is recoverable from events.
- `update_member` publishes `MemberAdded`.
- Under SDK 28, event fields that are `None` are omitted from the data map: `MemberAdded.git_identity`, `ProposalCreated.token_contract`, `ContractUpdated.wasm_hash`, and both `ProjectGovernanceUpdated` overrides. Consumers must treat absent keys as `None`, or the events need `#[contractevent(sparse = false)]`.

---

### F-24 — Project names accept the empty string and case variants

| Field | Value |
|-------|-------|
| Severity | Info |
| Likelihood | Medium |
| Impact | Low |
| Location | `contracts/tansu/src/contract_versioning.rs:96-107` |
| Status | Open (**Reproduced**) |

The name loop accepts zero characters, and upper and lower case hash to different keys: `""`, `"Tansu"` and `"tansu"` register as three projects. The documentation calls the registration deposit "the price of a unique on-chain name". **Fix:** require at least one character and normalize to lower case before hashing.

---

### F-25 — Mainline build pins an SDK release candidate

| Field | Value |
|-------|-------|
| Severity | Info |
| Likelihood | High |
| Impact | Low |
| Location | `Cargo.toml` (`soroban-sdk = { version = "28.0.0-rc.1" }`) |
| Status | Open |

`28.0.0` is released, and the differences from `rc.1` are limited to spec-static visibility, testutils, and the custom-account migration note — nothing that changes this contract's behaviour. The RC string is embedded in the WASM metadata (`rssdkver`), which is what verifiers and auditors see. The build also imports two host functions that only exist from Protocol 28 (`sparse_map_new_from_linear_memory`, `sparse_map_unpack_to_linear_memory`), so it cannot run on a network or quickstart image below Protocol 28. **Fix:** move to `28.0.0`.

---

### F-26 — Code comments contradict the code

| Field | Value |
|-------|-------|
| Severity | Info |
| Likelihood | High |
| Impact | Low |
| Location | multiple |
| Status | Open |

| Location | Comment says | Code does |
|----------|--------------|-----------|
| `contract_versioning.rs:42` | registers the name in a domain contract | no domain contract exists |
| `contract_versioning.rs:48` | name max 15 characters | rejects above 30 (`:97`) |
| `contract_versioning.rs:817` | `revoke_attestation` requires a maintainer | only `attester.require_auth()` (`:830`) |
| `contract_versioning.rs:797-801` | finality "is never cleared" | see F-06 |
| `contract_dao.rs:225-226` | abstain weight 0 "to not block a vote from proposer" | the proposer can never vote on their own proposal (`AlreadyVoted`) |
| `contract_tansu.rs:339-341` | contract version | returns `2` for crate 2.1.0 |

---

### F-27 — Git identity binding: no uniqueness, no removal

| Field | Value |
|-------|-------|
| Severity | Info |
| Likelihood | Medium |
| Impact | Low |
| Location | `contracts/tansu/src/contract_membership.rs:27-141`, `:385-402` |
| Status | Open |

The signature proves the caller holds `git_pubkey` and chose `git_identity`. It does not reserve the identity — two members can claim `github:alice` — and nothing on-chain ties the key to that forge account. `update_member` can replace a binding but never clear it. **Fix:** document these as off-chain checks, or index `git_identity → Address` and reject collisions; allow clearing.

---

### F-28 — `trigger` has no functional test

| Field | Value |
|-------|-------|
| Severity | Info |
| Likelihood | High |
| Impact | Medium |
| Location | `contracts/registry-tansu-manager/src/test.rs` |
| Status | Open |

The crate's only test checks that the constructor stores three values. `trigger` — the contract's reason to exist, and the function that signs calls — has no test: not the success path, not `NoOutcomeContracts`, not `MultipleOutcomes`, not the target check F-04 calls for. **Fix:** add those four tests, plus one on a proposal that is not yet executable.

---

### F-29 — Dead migration module

| Field | Value |
|-------|-------|
| Severity | Info |
| Likelihood | Low |
| Impact | Low |
| Location | `contracts/tansu/src/contract_migration.rs`; `lib.rs:8`, `:274-276` |
| Status | Open |

The module is commented out in `lib.rs` and references a `MigrationTrait` that no longer exists, so it would not compile if re-enabled. **Fix:** delete it, or move it out of `src/` if it is kept for reference.

---

## 8. Accepted constraints

- **No TTL management.** The contract never extends TTLs and relies on Protocol 23+ automatic restoration during simulation. Low-traffic projects pay restoration on their next write. If TTL management is added, `extend_ttl_with_limits` lets the contract cap what callers can be charged.
- **The decryption-key holder sees every anonymous ballot**, as documented.
- **Sub-project keys are unvalidated**, deliberately, to allow reserving names.
- **Outcomes cannot target Tansu itself**: the host rejects re-entry, which makes any such proposal unexecutable (F-14).

## 9. Test posture

**Well covered.** 165 tests pass. Attestations alone have 60, including capacity, pruning, revocation windows and the finality edge cases in F-06. Registration and governance overrides (32), DAO flows including anonymous voting, COI, vote removal, token proposals and timelock snapshots (20), membership and Git binding (14), commit and evidence validation (18), pause and upgrade (8), and cost snapshots (8).

**Missing, in priority order:**

| Gap | Finding |
|-----|---------|
| `create_proposal` with oversized `outcome_contracts`, then another proposal on the page | F-01 |
| Token weight moved between addresses during a vote | F-02 |
| One admin cancelling a threshold-approved proposal; unpause by a different admin | F-03 |
| Every branch of `trigger`, including an unrelated target | F-04, F-28 |
| `vote` and `attest` with no NQG key | F-05 |
| Duplicate admins, duplicate badges, negative NQG score | F-08, F-11, F-12 |
| Key change during an anonymous proposal; duplicated ballot | F-07, F-10 |
| Caller dropping out of the maintainer list | F-13 |

**Harness notes.** `test_utils.rs` uses `mock_all_auths()`, so authorization is covered only where tests use `try_*` negatives, and it always sets NQG, which is what hides F-05. The SDK 28 test host enforces the network's per-entry size cap, which is what made F-01 reproducible — size-sensitive paths can be tested directly.

## 10. CI and release integrity

- **Tests:** `contract.yml` runs `cargo build` and `cargo test` on pushes to `main` and on pull requests touching `contracts/**`, with `actions/checkout` pinned and `persist-credentials: false`.
- **Lint:** `lint.yml` runs `pre-commit` (zizmor, clippy `-Dwarnings`, rustfmt, ruff, prettier, eslint, astro check) and builds the website and dApp.
- **Release:** `contract-release.yml` fires on `v*` tags behind the `publish-contract` environment and builds through `stellar-expert/soroban-build-workflow` pinned to commit `88068ec5…`, with `id-token: write` and `attestations: write` for provenance. SDK 28 needs `stellar-cli` 25.2.0 or newer for spec shaking; the release workflow's CLI version should be checked against that before the next tag.
- **Profile:** `overflow-checks = true`, `panic = "abort"`, LTO, `codegen-units = 1`, `opt-level = "z"`.
- **SBOM and evidence:** `sbom.yml` produces SPDX and CycloneDX with Trivy on tags and records the CID through `set_evidence`.
- **Gaps:** no static-analysis gate on pull requests; no Rust advisory scan of `Cargo.lock`; no release workflow or provenance for `registry-tansu-manager`; the manager imports an unpinned local artifact (F-19).

## 11. Residual risk and readiness

**Fix before an external audit:**

1. **F-01** — bound `outcome_contracts` and clear it on revocation.
2. **F-02** — escrow or snapshot token weight, or stop executing outcomes on token-weighted proposals.
3. **F-03** and **F-08** — make cancellation and unpausing threshold actions; reject duplicate admins.
4. **F-04** — check the outcome target against the configured registry.
5. **F-05** — treat a missing NQG key as "no NQG project".
6. **F-06** — latch finality on every path and queue threshold decreases.

**Worth doing alongside:** F-09 through F-16. Most are one guard or one snapshot each.

**Informational:** F-17 through F-29.

**Formal verification.** Not needed for audit entry. Worth considering for the anonymous-vote arithmetic once a ballot-validity proof exists (F-07), since that is when the contract would first claim cryptographic ballot integrity.

**Status: not ready.** With F-01 to F-06 fixed and covered by the tests in §9, the Tansu contract would be in good shape for external review. `registry-tansu-manager` should wait on F-04, F-19 and F-28.

## 12. References

- Sources at the commit above: `contracts/tansu/src/*`, `contracts/registry-tansu-manager/src/*`, `Cargo.toml`, `Cargo.lock`, `Makefile`, `.github/workflows/*.yml`
- Project documentation: `website/docs/developers/{governance,code_finality,membership,evidence,architecture}.mdx`, `docs/operations.md`
- SDK 28 migration notes: `soroban-sdk-28.0.0-rc.1/src/_migrating/v28_*.rs`
- Host 28.0.2: `host/invocation_metering.rs` (per-entry size enforcement)
- [Stellar security documentation](https://developers.stellar.org/docs/build/security-docs)
- [Soroban Audit Bank](https://stellar.org/grants-and-funding/soroban-audit-bank)
