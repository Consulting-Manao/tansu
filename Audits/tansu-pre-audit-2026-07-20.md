# Tansu — Pre-Audit Security Report

| Field | Value |
|-------|-------|
| Subject | `contracts/tansu` (crate `tansu` 2.0.2) + `contracts/scf-membership` (crate `scf-membership` 1.0.0) |
| Branch | `main` |
| Commit | `68ae3eced00fb815784f403d8ed56d5543c55af4` |
| Soroban SDK | `27.0.0` (workspace) |
| Toolchain | Rust edition 2024; local `rustc 1.95.0` |
| Report type | Internal pre-audit |
| Mode | full |
| Date | 2026-07-20 |
| Raven freshness | unavailable (auth skipped) |
| Scout | skipped (per request) |
| AI usage disclosure | Drafted with Cursor Grok 4.5 against local contract sources + prior May 2026 assessment; protocol notes from stellar-dev security checklist |

## 1. Executive summary

- **Strengths:** Consistent storage-loaded admin/maintainer auth; pause gates state mutators; M-of-N upgrade + 24h timelock on Tansu; typed storage keys; vote/proposal/page bounds; `overflow-checks = true` in release; empty maintainer lists now rejected; migration path disabled; new git-identity binding uses Ed25519 over address-bound message.
- **Material issues:** Anonymous ballots still lack on-chain well-formedness (carried Medium). `get_max_weight` hard-requires `NqgProjectKey` and bare-`expect`s if unset, so badge voting fails until admins configure NQG. SCF membership upgrade is single-admin / no timelock; mint does not enforce one-NFT-per-owner as docs claim.
- **Bottom line:** **Conditionally audit-ready** for Tansu if anonymous-voting trust assumptions and NQG deploy order are documented (or fixed). Close or accept SCF findings before treating that crate as audit-bank ready.

### Finding counts

| Severity | Count |
| ---: | ---: |
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 6 |
| Info | 5 |

## 2. Scope and evidence

### In scope

- `contracts/tansu/src/**` (excluding commented-out migration trait surface)
- `contracts/scf-membership/src/**`
- Tests under both crates as behavioral evidence

### Out of scope

- Dapp, workers, clients, wallets, indexers, deploy scripts, key custody
- Off-chain anonymous vote encryption / decryption / coordinator UX
- Formal verification of BLS12-381 or Soroban host semantics
- Scout / SARIF (skipped)
- Bytecode of any external NQG or collateral WASM beyond interface usage

### Trust assumptions

- **Admins** control pause, collateral/NQG registration, and upgrades (Tansu: threshold + timelock; SCF: single admin, instant WASM update).
- **Project maintainers** control commits, badges, anonymous config, execute/revoke, vote removal, COI, evidence, maintainer list (non-empty).
- **Proposers / voters** lock collateral; malicious content is operationally handled via revoke / `remove_vote` / slash.
- **NQG** and **proposal token** / **outcome** contracts may be hostile; fail-closed or maintainer review is assumed.
- Persistent TTL not extended on-chain; callers may pay auto-restore (accepted ops model).

### Delta vs May 2026 assessment (`Audits/tansu-soroban-security-assessment.md`)

| Prior | Status now |
|-------|------------|
| M-01 anonymous well-formedness | Still open |
| L-01 outcome allowlist | Still open |
| L-02 COI unbounded / prospective | Still open |
| L-03 empty maintainer list | **Partially fixed** (`MissingMaintainer`); capture via list replace remains |
| I-03 pagination migration duplicates | **Out of active surface** (`contract_migration` not wired) |
| Domain registration path | **Removed** from `register` (docs still mention domain) |
| SDK | 26 → **27** |
| New | Git identity, evidence history, NQG-required `get_max_weight`, SCF in scope |

## 3. Methodology

1. Entry-point and auth tracing
2. Storage / state-transition tracing
3. Asset-flow invariants (collateral, token votes, refunds, slash)
4. Privilege / governance boundary analysis
5. Test coverage gap review
6. CI / static controls (Scout skipped)
7. STRIDE + residual scoring

Severity: Critical, High, Medium, Low, Info. Likelihood/Impact: High / Medium / Low.

Fallback security refs: `~/.cursor/skills/stellar-dev/security.md`, [Stellar security docs](https://developers.stellar.org/docs/build/security-docs).

## 4. Entry-point map

### Tansu (`contracts/tansu`)

| Function | Location | Class | Restriction | Notes |
|----------|----------|-------|-------------|-------|
| `__constructor` | `contract_tansu.rs:11` | Init | Once | Starts paused; sole admin threshold 1 |
| `pause` | `contract_tansu.rs:35` | Role | `auth_admin` | Available while paused |
| `set_collateral_contract` | `contract_tansu.rs:94` | Role | `auth_admin` | Optional WASM hash via `validate_contract` |
| `set_nqg_contract` | `contract_tansu.rs:118` | Role | `auth_admin` | Sets global NQG + project key |
| `propose_upgrade` / `approve_upgrade` / `finalize_upgrade` | `contract_tansu.rs:159–319` | Role | `auth_admin` | Timelock 24h; cancel any admin |
| `add_member` / `update_member` | `contract_membership.rs` | Public | `member_address.require_auth` | Optional git sig |
| `set_badges` | `contract_membership.rs:181` | Role | `auth_maintainers` | |
| `register` / `update_config` / `commit` / `set_evidence` / `set_sub_projects` | `contract_versioning.rs` | Role | maintainer auth | Register: caller in maintainers list |
| `anonymous_voting_setup` | `contract_dao.rs:35` | Role | maintainers | Pause-gated |
| `create_proposal` | `contract_dao.rs:172` | Public | `proposer.require_auth` | Collateral lock |
| `vote` | `contract_dao.rs:550` | Public | `voter.require_auth` | Collateral / token lock |
| `remove_vote` / `execute` / COI mutators | `contract_dao.rs` | Role | maintainers | Execute after vote end + timelock |
| `revoke_proposal` | `contract_dao.rs:482` | Role | admin **or** maintainer | Slash path |
| `build_commitments_from_votes` / `proof` / getters | dao | Public | none / read | Helper surfaces |

### SCF Membership

| Function | Location | Class | Restriction | Notes |
|----------|----------|-------|-------------|-------|
| `__constructor` | `scf_token.rs:11` | Init | Once | Admin + NQG address immutable except upgrade |
| `upgrade` | `scf_token.rs:38` | Role | storage admin | Immediate WASM; no timelock |
| `mint` / `clawback` / `set_trait` | token/gov | Role | storage admin | Soulbound intent |
| `balance` / `owner_of` / traits / `governance` | | Public | read | NQG via cross-contract |

## 5. Context snapshot

- **Actors:** Admin (global), project maintainers, proposers, voters, SCF admin, public readers.
- **Storage:** Instance — pause, admins, upgrade proposal, collateral/NQG refs, NQG project key, SCF metadata. Persistent — projects, members, votes, tallies, DAO pages, evidence, COI, SCF NFT owner/balance/role.
- **Value flows:** Register / proposal / vote XLM collateral (configured SAC); optional proposal-token weight locks; refunds on successful `execute`; slash on revoke / `remove_vote`.
- **Invariants (must hold):**
  1. Privileged mutators authenticate storage-loaded admin or project maintainer.
  2. Proposal/vote collateral only leaves via execute refund or intentional slash.
  3. At most one vote record per `(project, proposal, voter)`.
  4. Execute only after `voting_ends_at + TIMELOCK_DELAY` and while status Active.
  5. Anonymous execute opens only match persisted aggregate commitments (not per-ballot validity).
  6. Maintainer list non-empty after `update_config`.
  7. SCF: only admin mints/claws/sets role; transfers not exposed (soulbound intent).

## 6. STRIDE analysis

### Spoofing
- **Threat:** Impersonate maintainer/admin/voter.
- **Controls:** `require_auth` on storage-checked roles; git binding signs address+pubkey+identity.
- **Residual:** Git uniqueness not enforced on-chain; host auth tree still depends on client correctness.

### Tampering
- **Threat:** Alter tallies, badges, outcomes, WASM.
- **Controls:** Aggregate commitments; maintainer execute; upgrade threshold+timelock (Tansu); pause.
- **Residual:** Malformed anonymous buckets; proposer-chosen tokens/outcomes; SCF instant upgrade.

### Repudiation
- **Controls:** Events on major transitions (register, vote, upgrade, badges, evidence, mint/set_trait).
- **Residual:** SCF clawback emits no event.

### Information disclosure
- Anonymous votes hide choices on-chain; encrypted strings are opaque. Public votes and weights are visible by design.

### Denial of service
- Vote cap 40; proposal/page bounds; pause. Residual: unbounded COI list (maintainer-paid); hostile token can block execute refunds until removal/revoke.

### Elevation of privilege
- Maintainer can replace maintainer set (non-empty). Admin threshold upgrades can rotate governance. SCF admin is full control.

## 7. Findings register

| ID | Severity | Title | Location | Status |
|----|----------|-------|----------|--------|
| F-01 | Medium | Anonymous commitments do not enforce well-formed ballots | `contract_dao.rs` vote/proof/execute | Open (prior M-01) |
| F-02 | Medium | `get_max_weight` requires NQG key and bare-panics if unset | `contract_membership.rs:315–326` | Open |
| F-03 | Low | Outcome hooks not allowlisted / hash-validated | `contract_dao.rs` create/execute | Open (prior L-01) |
| F-04 | Low | COI list unbounded; prospective only | `contract_dao.rs` COI + vote | Open (prior L-02) |
| F-05 | Low | Maintainer can replace entire maintainer set | `contract_versioning.rs:144–165` | Open (prior L-03 partial) |
| F-06 | Low | Badge weight sums duplicate entries in badge vec | `contract_membership.rs:342–346` | Open |
| F-07 | Low | SCF `mint` does not enforce one NFT per owner | `scf_token.rs:45–71` | Open |
| F-08 | Low | SCF `upgrade` is single-admin with no timelock | `scf_token.rs:38–42` | Open |
| F-09 | Info | Public `proof()` uses caller-supplied proposal metadata | `contract_dao.rs:908` | Open (prior I-01) |
| F-10 | Info | Token voting uses proposer-selected token by design | `contract_dao.rs` | Open (prior I-02) |
| F-11 | Info | Git identity strings not unique across members | `contract_membership.rs` | Open |
| F-12 | Info | `register` docs still reference removed domain flow | `contract_versioning.rs:17–18` | Open |
| F-13 | Info | SCF `set_trait` can write role for never-minted `token_id` | `scf_governance.rs:37–52` | Open |

---

### F-01 — Anonymous commitments do not enforce well-formed ballots

| Field | Value |
|-------|-------|
| Severity | Medium |
| Likelihood | Medium |
| Impact | Medium |
| Location | `contracts/tansu/src/contract_dao.rs` (`vote`, `proof_from_aggregates`, `anonymous_execute`); `types.rs` `AnonymousVote` |
| Status | Open |

**Description**
Anonymous votes require three G1 commitments in-subgroup and matching encrypted string lengths. There is no on-chain check that hidden values are one-hot / single-choice. Aggregate proof at execute only checks that supplied tallies/seeds open the stored aggregate.

**Impact**
A voter can commit multi-bucket or oversized numeric influence; weight multiplies the commitment. Mitigated by maintainer-only execute and `remove_vote` slash, but detection is off-chain/reactive.

**Likelihood**
Any anonymous voter; realistic if coordinator/UI does not screen ballots.

**Evidence**
- Commitment shape checks only: `contract_dao.rs:603–615`
- Aggregate open check: `proof_from_aggregates` / `commitment_checks_from_tallies_and_seeds`
- Prior assessment noted tests accepting non-one-hot constructions

**Remediation**
Add ballot validity proofs, or formally document + test maintainer review/`remove_vote` as the control until ZK exists.

---

### F-02 — `get_max_weight` requires NQG key and bare-panics if unset

| Field | Value |
|-------|-------|
| Severity | Medium |
| Likelihood | Medium |
| Impact | Medium |
| Location | `contracts/tansu/src/contract_membership.rs:315–326` |
| Status | Open |

**Description**
Every `get_max_weight` call loads `DataKey::NqgProjectKey` with `.expect("NQG project key exists")` before comparing to the project key. Constructor does not set this key. Until `set_nqg_contract` runs, badge-weight paths (and thus badge-based voting) trap with a bare panic rather than `panic_with_error!`.

**Impact**
Post-deploy footgun: registration and voting weight lookups fail for all projects until admins configure NQG (even if NQG is unused). Host panic harms fuzzability/client error handling.

**Likelihood**
High if deploy runbooks omit NQG setup; tests always call `set_nqg_contract` in harness (`test_utils.rs:63–67`), so CI hides the gap.

**Evidence**
- `get_max_weight` unconditional `.expect` on `NqgProjectKey`
- `__constructor` only sets pause + `AdminsConfig` (`contract_tansu.rs:11–25`)

**Remediation**
Treat missing NQG key as “no NQG project” (`None` → skip special case). Prefer `panic_with_error!` if a hard requirement is intentional, and set a sentinel in constructor or document mandatory `set_nqg_contract` before unpause.

---

### F-03 — Outcome hooks not allowlisted / hash-validated

| Field | Value |
|-------|-------|
| Severity | Low |
| Likelihood | Low |
| Impact | Medium |
| Location | `contract_dao.rs:172–182`, `860–877`; `types.rs` `OutcomeContract` |
| Status | Open |

**Description**
Proposers supply outcome address / symbol / args; `execute` `try_invoke_contract`s the matching status index. No WASM hash or allowlist.

**Impact**
Unexpected post-execution calls if maintainers execute a hostile proposal. Atomic tx still reverts on outcome failure after refunds are attempted (full rollback).

**Remediation**
Per-project allowlist or stored WASM hashes; or document outcomes as proposal content under maintainer review.

---

### F-04 — COI list unbounded; prospective only

| Field | Value |
|-------|-------|
| Severity | Low |
| Likelihood | Low |
| Impact | Low |
| Location | `contract_dao.rs:1045–1134`, `589–594` |
| Status | Open |

**Description**
Maintainers append COI addresses without a max length; membership is linear `contains`. Adding after a vote does not remove the existing vote.

**Remediation**
Cap list length; document prospective semantics; optionally call into `remove_vote` for retroactive enforcement.

---

### F-05 — Maintainer can replace entire maintainer set

| Field | Value |
|-------|-------|
| Severity | Low |
| Likelihood | Low |
| Impact | Medium |
| Location | `contract_versioning.rs:144–165` |
| Status | Open (empty list fixed) |

**Description**
`update_config` rejects empty `maintainers` (`MissingMaintainer`) but any current maintainer can replace the full set with an attacker-controlled non-empty list.

**Impact**
Project capture / lockout of honest maintainers. Admin pause/revoke remain, but admins do not become project maintainers.

**Remediation**
Multi-maintainer threshold, DAO approval for maintainer changes, or require caller remain in the new set.

---

### F-06 — Badge weight sums duplicate entries in badge vec

| Field | Value |
|-------|-------|
| Severity | Low |
| Likelihood | Low |
| Impact | Low |
| Location | `contract_membership.rs:342–346` |
| Status | Open |

**Description**
`get_max_weight` sums `project_badges.badges` without deduplication. A maintainer can pass `[Developer, Developer, …]` and inflate weight beyond the intended badge set. Project badge address lists use `contains` (once), so lists stay consistent while weight diverges.

**Impact**
Incorrect voting power if maintainers (or buggy clients) submit duplicates. Maintainers already control badges, so this is integrity/correctness more than external elevation.

**Remediation**
Deduplicate by badge kind before store, or sum unique kinds only; add a negative test.

---

### F-07 — SCF `mint` does not enforce one NFT per owner

| Field | Value |
|-------|-------|
| Severity | Low |
| Likelihood | Low |
| Impact | Low |
| Location | `contracts/scf-membership/src/scf_token.rs:45–71` |
| Status | Open |

**Description**
Docs/trait comments say soulbound membership is at most one token per owner. `mint` never checks `balance(to) == 0` and increments balance freely. Admin-only, so trust-bound, but violates stated invariant.

**Remediation**
Reject mint when `balance(to) != 0`; add test.

---

### F-08 — SCF `upgrade` is single-admin with no timelock

| Field | Value |
|-------|-------|
| Severity | Low |
| Likelihood | Low |
| Impact | High (if admin key compromised) |
| Location | `scf_token.rs:38–42` |
| Status | Open |

**Description**
Unlike Tansu’s propose/approve/finalize + 24h delay, SCF calls `update_current_contract_wasm` immediately after storage admin `require_auth`.

**Impact**
Compromised admin can instantly replace membership/governance logic.

**Remediation**
Align with Tansu upgrade pattern, or document single-admin instant upgrade as accepted risk.

---

### F-09 — Public `proof()` uses caller-supplied proposal metadata

| Field | Value |
|-------|-------|
| Severity | Info |
| Likelihood | Medium |
| Impact | Low |
| Location | `contract_dao.rs:908–968` |
| Status | Open |

**Description**
Helper takes a full `Proposal` from the caller while loading votes by `proposal.id`. Execution uses `proof_from_aggregates`, not this helper.

**Remediation**
Load canonical proposal from storage, or document as client-only helper.

---

### F-10 — Token voting uses proposer-selected token by design

| Field | Value |
|-------|-------|
| Severity | Info |
| Likelihood | Medium |
| Impact | Medium (if misinterpreted) |
| Location | `create_proposal` / `vote` / `execute` token branches |
| Status | Open |

**Description**
`token_contract: Option<Address>` is unconstrained. Weight locks/refunds use that contract’s `decimals()` at call time.

**Remediation**
UI/ops treat token as proposal payload; optional per-project allowlist later.

---

### F-11 — Git identity strings not unique across members

| Field | Value |
|-------|-------|
| Severity | Info |
| Likelihood | Medium |
| Impact | Low |
| Location | `contract_membership.rs` `add_member` / `update_member` |
| Status | Open |

**Description**
Ed25519 proof binds `(address, pubkey, identity)` but does not reserve `git_identity` globally. Two members can store the same identity string with different keys. Provider attestation that the key is on the Git account remains off-chain.

**Remediation**
Document off-chain uniqueness, or index `git_identity → Address` on-chain if exclusivity is required.

---

### F-12 — `register` docs still reference removed domain flow

| Field | Value |
|-------|-------|
| Severity | Info |
| Likelihood | High |
| Impact | Low |
| Location | `contract_versioning.rs:17–18` |
| Status | Open |

**Description**
Comments claim Soroban Domain registration; implementation only validates name, locks collateral, and stores the project.

**Remediation**
Update comments/docs to match collateral-only registration.

---

### F-13 — SCF `set_trait` can write role for never-minted `token_id`

| Field | Value |
|-------|-------|
| Severity | Info |
| Likelihood | Low |
| Impact | Low |
| Location | `scf_governance.rs:37–52` |
| Status | Open |

**Description**
`set_trait` does not call `owner_of`. Admin can create a `Role(token_id)` entry without an `Owner` entry, leaving inconsistent read paths (`trait_value("role")` vs `owner_of` / `nqg`).

**Remediation**
Require `owner_of(token_id)` (or equivalent) before setting traits.

---

## 8. Accepted constraints

- Persistent TTL not extended in-contract (auto-restore ops model).
- Scout not run this pass.
- Raven MCP not authenticated this pass.
- NQG fail-closed to zero voting power on invoke failure (`get_nqg`).
- Sub-project keys intentionally may not exist yet.

## 9. Test posture

**Covered:** register/commit/evidence, membership + git identity, public/anonymous/token DAO flows, COI, remove_vote, pause/upgrade, SCF lifecycle/governance, cost estimates.

**Gaps / high value:**
- `get_max_weight` / vote without `set_nqg_contract`
- Duplicate badge weight
- Empty vs capture maintainer updates (empty now covered by code; capture not)
- SCF double-mint to same owner; upgrade negative path
- Explicit maintainer review path for malformed anonymous ballots
- Harness uses `mock_all_auths` — rely on `try_*` negative tests for auth

## 10. CI and release integrity

- `.github/workflows/contract.yml`: `cargo build` + `cargo test`; pinned checkout action; `wasm32v1-none` target
- Release profile: `overflow-checks = true`, `panic = "abort"`, LTO
- Scout: not configured / skipped this review
- No `contractimport!` of foreign WASM in current tree (domain WASM gone)

## 11. Residual risk and Audit Bank readiness

**Close or explicitly accept before external audit:**
1. F-01 anonymous ballot validity story (crypto or ops control + tests)
2. F-02 NQG key optional / constructor default (deploy correctness)
3. Document token/outcome/maintainer/SCF-admin trust boundaries
4. SCF: soulbound mint invariant + upgrade policy (F-07, F-08)

**Optional cleanup:** F-03–F-06, F-09–F-13.

**Formal verification:** Not required for Audit Bank entry; consider later for anonymous voting math if you claim cryptographic ballot integrity.

**Status:** **conditionally ready** (Tansu) / **not ready** for SCF until upgrade + mint invariants are accepted or fixed.

## 12. References

- Sources: `contracts/tansu/src/*`, `contracts/scf-membership/src/*`, `Cargo.toml`, `.github/workflows/contract.yml`
- Prior: `Audits/tansu-soroban-security-assessment.md` (May 2026)
- Checklist: stellar-audit `checklist.md`; stellar-dev `security.md`
- https://developers.stellar.org/docs/build/security-docs
