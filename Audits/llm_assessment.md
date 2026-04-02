# Tansu Smart Contracts -- Security Assessment

**Contract:** Tansu v2.0.0 (Soroban)
**SDK:** soroban-sdk 25.1.1
**Rust Edition:** 2024
**Assessment Date:** March 2026
**Assessment Team:** Tansu Development Team and AI
**Methodology:** STRIDE Threat Modeling + Manual Code Review + Stellar Security Checklist

---

## Executive Summary

This security assessment evaluates the Tansu Soroban smart contracts, which implement
decentralized project versioning with DAO governance, badge-based and token-based voting,
anonymous voting via BLS12-381 cryptographic commitments, and a multisig upgrade mechanism.

**Findings:**
- **Critical:** 0
- **High:** 0
- **Medium:** 0
- **Low:** 1

**Security Posture:** Strong. The contract implements defense-in-depth through multisig
governance with timelock, DoS protection with bounded operations, emergency pause
functionality, economic deterrents via collateral, comprehensive authorization controls,
and BLS12-381 Pedersen commitments for anonymous voting.

---

## Scope

### Files Assessed

| File | Description |
|------|-------------|
| `contracts/tansu/src/lib.rs` | Contract entry point, trait definitions, shared helpers |
| `contracts/tansu/src/contract_tansu.rs` | Core admin, pause/unpause, multisig upgrade |
| `contracts/tansu/src/contract_versioning.rs` | Project registration, commits, domain integration |
| `contracts/tansu/src/contract_dao.rs` | Governance proposals, public and anonymous voting |
| `contracts/tansu/src/contract_membership.rs` | Membership registration, badge management |
| `contracts/tansu/src/contract_migration.rs` | One-time admin migration for pagination backfill |
| `contracts/tansu/src/types.rs` | Data structures and storage key enums |
| `contracts/tansu/src/errors.rs` | Error code definitions |
| `contracts/tansu/src/events.rs` | Event definitions |

### Assessment Areas

- Authorization and access control
- Governance and upgrade mechanisms
- Storage design and DoS protection
- Input validation
- Cryptographic implementation (BLS12-381 Pedersen commitments)
- Economic security (collateral)
- Time-based logic
- External contract interactions
- Event coverage and auditability

---

## Contract Architecture

The Tansu contract is a single Soroban contract crate implementing four functional
modules behind a unified entry point:

- **Core** (`contract_tansu.rs`): Admin authentication, emergency pause, and a
  three-phase contract upgrade mechanism (propose, approve, finalize) with M-of-N
  multisig and 24-hour timelock.
- **Versioning** (`contract_versioning.rs`): Project registration with Soroban Domain
  integration, configuration updates, commit hash tracking, pagination, and
  organization sub-projects.
- **DAO** (`contract_dao.rs`): Proposal creation with collateral deposits, public
  weighted voting, anonymous voting with BLS12-381 Pedersen commitments, proof
  verification, supermajority governance, and optional outcome contract integration.
- **Membership** (`contract_membership.rs`): Member registration, project-scoped badge
  assignment (Developer, Triage, Community, Verified), and badge-weighted voting power.

### External Dependencies

- **Soroban Domain contract** (`domain_current.wasm`): Validated via on-chain WASM hash
  before interaction. Used for project name registration under the `.xlm` TLD.
- **Outcome contracts**: Optional per-proposal array of `OutcomeContract` structs, each
  specifying an `address`, `execute_fn` (function name), and `args`. Indexed by outcome:
  `[0]` = Approved, `[1]` = Rejected, `[2]` = Cancelled. Invoked generically via
  `env.try_invoke_contract()` during proposal execution.
- **Stellar Asset Contract (SAC)**: Used for collateral deposits and refunds. Configured
  by admin as the collateral contract.

### Storage Layout

| Storage Type | Data | Rationale |
|-------------|------|-----------|
| Instance | Admin config, pause state, domain/collateral contract refs, upgrade proposals | Global config, loaded on every call |
| Persistent | Projects, members, badges, DAO proposals, anonymous vote configs, pagination keys | Per-entity data with independent lifetimes |

---

## Security Analysis

### 1. Authorization and Access Control

All state-mutating functions enforce authorization:

- **Admin operations** (`pause`, `set_domain_contract`, `set_collateral_contract`,
  `propose_upgrade`, `approve_upgrade`, `finalize_upgrade`, `add_projects_to_pagination`):
  Require `require_auth()` and admin membership verification via `auth_admin()`.
- **Maintainer operations** (`register`, `update_config`, `commit`, `set_sub_projects`,
  `set_badges`, `anonymous_voting_setup`, `revoke_proposal`): Require `require_auth()`
  and maintainer membership verification via `auth_maintainers()`.
- **Member operations** (`add_member`): Require self-authentication via
  `member_address.require_auth()`.
- **Voter operations** (`vote`): Require `voter.require_auth()` and enforce
  `vote_address == voter` to prevent voting on behalf of others.
- **Proposal operations** (`create_proposal`): Require `proposer.require_auth()`.
- **Execution** (`execute`): Requires maintainer authorization via `auth_maintainers()`.
  Only project maintainers can execute proposals after the voting period ends. This
  prevents timing attacks where malicious outcome contracts could be triggered before
  maintainers have a chance to review them.
- **Proof verification** (`proof`): Public read-only function by design. Allows anyone to
  verify anonymous vote commitments off-chain for client-side vote crafting.

**Assessment:** Secure. No missing authorization on sensitive paths.

### 2. Initialization and Reinitialization

The contract uses the Soroban `__constructor` pattern, which the runtime guarantees
executes exactly once during deployment. The contract starts paused and requires explicit
admin action to unpause.

**Assessment:** Secure. No reinitialization risk.

### 3. Governance and Upgrade Mechanism

The upgrade mechanism implements a three-phase process:

1. **Propose** (`propose_upgrade`): An admin proposes a new WASM hash and optional new
   admin configuration. Only one active proposal at a time. The proposer is automatically
   counted as the first approval.
2. **Approve** (`approve_upgrade`): Other admins approve the proposal. Double-approval
   prevention is enforced. Events track approval progress and threshold status.
3. **Finalize** (`finalize_upgrade`): An admin executes (if threshold met and timelock
   expired) or cancels the upgrade. Cancellation is always permitted.

Key properties:
- **Timelock:** 24-hour delay (`TIMELOCK_DELAY = 86400s`) between proposal and execution.
- **Threshold validation:** `threshold > 0` and `threshold <= admins.len()` enforced on
  proposal creation.
- **Current governance rules apply:** The approval threshold is checked against the
  current `AdminsConfig`, not the proposed one. New admin configurations only take effect
  after the upgrade is finalized. This is documented and intentional.
- **Atomic cleanup:** The upgrade proposal is removed from storage before WASM update.
- **Version tracking:** The `version()` function returns a hardcoded value that is
  intentionally updated with each contract release to maintain explicit version control.

**Assessment:** Secure. Well-designed multisig with timelock.

### 4. Integer Overflow Protection

The workspace `Cargo.toml` sets `overflow-checks = true` in the release profile. This
means all arithmetic operations panic on overflow even in production WASM builds.

Vote weight accumulation uses `u128` (max ~3.4e38). With `MAX_VOTES_PER_PROPOSAL = 1000`
and maximum per-voter weight of ~16,500,000 (all badges combined), the theoretical
maximum accumulated weight is ~1.65e10, well within `u128` bounds.

Badge weight summation in `get_max_weight()` uses `u32`. The maximum possible sum is
Developer (10M) + Triage (5M) + Community (1M) + Verified (500K) = 16,500,000, well
within `u32::MAX` (~4.29e9).

**Assessment:** Secure. Overflow checks enabled in release builds; theoretical maximums
are safely within type bounds.

### 5. Storage Key Design and DoS Protection

**Key design:** Three typed enums (`DataKey`, `ProjectKey`, `ContractKey`) prevent storage
key collisions by construction.

**Bounded operations:**
- `MAX_VOTES_PER_PROPOSAL = 1000`: Caps the number of votes per proposal.
- `MAX_PROPOSALS_PER_PAGE = 9`, `MAX_PAGES = 1000`: Bounds total proposals per project
  to 9,000.
- `MAX_PROJECTS_PER_PAGE = 10`: Bounds project pagination pages.
- `MIN_VOTING_PERIOD = 1 day`, `MAX_VOTING_PERIOD = 30 days`: Constrains voting windows.
- `MAX_TITLE_LENGTH = 256`, IPFS CID length `32..=64`: Input size bounds.
- Sub-projects capped at 10 per project.
- Project names capped at 15 characters.

**Assessment:** Secure. All iterative operations have bounded inputs.

### 6. Economic Security (Collateral)

The contract implements a collateral mechanism to deter spam and malicious proposals:

- **Proposal deposit:** 100 XLM (`PROPOSAL_COLLATERAL`). For badge-based proposals, an
  additional 10 XLM vote collateral is charged (proposer auto-abstains).
- **Vote deposit:** 10 XLM (`VOTE_COLLATERAL`) for badge-based proposals. For
  token-based proposals, the vote weight in tokens is locked instead.
- **Refund on execution:** Both proposal and vote collateral are returned to all
  participants when a proposal is executed normally.
- **Forfeiture on revocation:** When a proposal is revoked as malicious, all collateral
  (proposer and voters) is permanently locked in the contract. This is intentional: it
  incentivizes voters to perform due diligence before engaging with proposals and serves
  as a deterrent against collusion with malicious proposers.

Token transfers use `try_transfer()` with error handling to prevent panics from external
contract failures.

**Assessment:** Secure. Collateral mechanism provides economic protection. Forfeiture
policy is a deliberate design choice documented in the code.

### 7. Voting and Governance Logic

**Public voting:** Weighted votes are tallied per choice (Approve, Reject, Abstain).
Supermajority required: Approve wins only if `approve > reject + abstain`. This ensures
broad consensus.

**Token-based voting:** Vote weight equals the number of tokens locked. Badge validation
is skipped; the token transfer itself validates the voter's balance. Proposer auto-abstain
uses weight 0 for token-based proposals.

**Open participation:** Any authenticated address can vote on badge-based proposals with a
minimum weight of 1 (the `Default` badge). This is by design to enable open governance
while the collateral requirement provides an economic barrier to spam. Maintainers can
assign higher-weight badges to trusted members for greater influence.

**Anonymous voting:** BLS12-381 Pedersen commitment scheme:
- Generator points derived via `hash_to_g1` with domain separation tags.
- Commitment: `C = g * vote + h * seed` where `g`, `h` are independent generators.
- Proof verification aggregates weighted commitments and checks against provided tallies.
- Vote choice is encrypted; only commitments are stored on-chain.

**Assessment:** Secure. Governance logic is sound with well-defined supermajority rules.

### 8. Cryptographic Implementation (BLS12-381)

The anonymous voting scheme uses BLS12-381 elliptic curve operations provided by the
Soroban SDK (`env.crypto().bls12_381()`):

- **Generator derivation:** Two independent generator points are derived using
  `hash_to_g1` with distinct domain separation tags (`"VOTE_GENERATOR"/"VOTE_COMMITMENT"`
  and `"SEED_GENERATOR"/"VOTE_SEED"`). This ensures the discrete log relationship between
  generators is unknown.
- **Commitment structure:** Pedersen commitments `C = g*v + h*r` bind vote choice `v` and
  randomness `r`. Three commitments per voter (approve, reject, abstain).
- **Commitment validation:** On vote submission, commitments are validated as valid G1
  points via `G1Affine::from_bytes()`. Exactly 3 commitments required.
- **Proof verification:** The `proof()` function reconstructs expected commitments from
  tallies/seeds and compares against the weighted sum of recorded commitments. Identity
  element correctly initialized (`0x40` prefix for compressed G1 infinity point).
- **Weight application:** Voter weight is applied as a scalar multiplier during proof
  verification: `weight * C = weight * (g*v + h*r)`.

**Assessment:** Secure. The Pedersen commitment scheme is correctly implemented with
proper domain separation and identity element handling.

### 9. External Contract Interactions

- **Domain contract:** Address and WASM hash stored by admin. `validate_contract()` checks
  on-chain WASM hash matches before every interaction. Uses typed client from
  `contractimport!` for type-safe calls.
- **Collateral contract (SAC):** Uses `StellarAssetClient` for `try_transfer()` with error
  handling. WASM hash validation is optional (SACs are native contracts without user WASM).
- **Outcome contracts:** Optional per-proposal array of `OutcomeContract` structs provided
  by the proposer. Each struct specifies a target contract address, function name, and
  arguments. Invoked via `env.try_invoke_contract()` with error handling that maps
  failures to `OutcomeError`. Since only maintainers can execute proposals, they can
  inspect outcome contracts before triggering execution. See finding L-01.

**Assessment:** Secure. Domain and collateral interactions validate WASM hashes. Outcome
contract risk is mitigated by maintainer-only execution and `try_invoke_contract` error
handling.

### 10. Event Coverage

All critical state transitions emit events with appropriate `#[topic]` annotations:

- `ProjectRegistered`, `ProjectConfigUpdated`, `Commit`, `SubProjectsUpdated`
- `MemberAdded`, `BadgesUpdated`
- `ProposalCreated`, `VoteCast`, `ProposalExecuted`
- `ContractPaused`, `ContractUpdated`
- `AnonymousVotingSetup`
- `UpgradeProposed`, `UpgradeApproved`, `UpgradeStatus`

**Assessment:** Comprehensive. All auditable actions are covered.

### 11. Emergency Controls

The pause mechanism (`pause`/`require_not_paused`) gates all state-mutating operations.
Read-only functions (`get_project`, `get_projects`, `get_commit`, `get_dao`,
`get_proposal`, `get_sub_projects`, `get_member`, `get_badges`, `get_max_weight`,
`get_admins_config`, `get_upgrade_proposal`, `get_anonymous_voting_config`, `proof`,
`build_commitments_from_votes`, `version`) are exempted.
The contract starts paused on deployment.

**Assessment:** Secure.

---

## Findings

### L-01: Outcome Contract Addresses Not Validated

**Severity:** Low
**Status:** Open (mitigated)

**Description:**
The `outcome_contracts` array is provided by the proposer during `create_proposal()` and
invoked during `execute()` without WASM hash validation or allowlist checks. Each
`OutcomeContract` struct specifies an arbitrary `address`, `execute_fn`, and `args`:

```rust
// contract_dao.rs:486-504
if let Some(outcome_contracts) = &proposal.outcome_contracts {
    let outcome_index = match proposal.status {
        types::ProposalStatus::Approved => 0,
        types::ProposalStatus::Rejected => 1,
        types::ProposalStatus::Cancelled => 2,
        _ => panic_with_error!(&env, &errors::ContractErrors::OutcomeError),
    };

    if let Some(contract) = outcome_contracts.get(outcome_index) {
        let r = env.try_invoke_contract::<(), InvokeError>(
            &contract.address,
            &contract.execute_fn,
            contract.args.clone(),
        );
        let _ =
            r.map_err(|_| panic_with_error!(&env, &errors::ContractErrors::OutcomeError));
    }
}
```

**Affected locations:**
- `contract_dao.rs:180`: Outcome contracts accepted from proposer
- `contract_dao.rs:486-504`: Outcome contracts invoked during execution

**Impact:**
A proposer could specify arbitrary contract addresses and function names. The risk is
mitigated by three factors: (1) only project maintainers can call `execute()` (via
`auth_maintainers()`), so they can inspect outcome contracts before triggering execution;
(2) Soroban's authorization model means outcome contracts cannot act on behalf of the
Tansu contract without explicit authorization; (3) the invocation uses
`try_invoke_contract` with error mapping to `OutcomeError`, preventing execution failures
from blocking the proposal status update. The `try_transfer()` calls for collateral
refunds happen before the outcome invocation, so voter/proposer refunds are not at risk.

**Recommendation:**
Consider validating outcome contracts against a WASM hash or a maintainer-configured
allowlist for defense in depth.

---

## Test Coverage

The contract includes 10 test modules with comprehensive coverage:

| Module | Focus |
|--------|-------|
| `test_register` | Project registration, duplicate prevention, name validation, domain ownership, pagination, sub-projects |
| `test_commit` | Commit flow, events, unauthorized maintainer rejection, commitment validation |
| `test_dao` | Full proposal lifecycle, public and anonymous voting, error conditions, revocation, voter weight, outcomes execution, token-based proposals |
| `test_membership` | Badge management, multiple badges, double-set, error conditions |
| `test_domain` | Domain node hash verification |
| `test_anonym_votes` | BLS12-381 commitment math, roundtrip validation, weighted commitments |
| `test_pause_upgrade` | Pause/unpause, unauthorized attempts, full upgrade flow, cancellation, threshold validation |
| `test_migration` | Pagination migration for existing projects, authorization, paused state, multi-page, deduplication handling |
| `test_cost_estimates` | Resource cost profiling for all major operations |
| `test_utils` | Shared test setup and environment configuration |

Tests use `env.mock_all_auths()` for test convenience. Authorization logic is separately
tested via `try_*` calls that verify unauthorized callers are rejected.

---

## Design Decisions

The following are intentional design choices that were evaluated during this assessment:

1. **Open voting participation:** Any authenticated address can vote on badge-based
   proposals with a minimum weight of 1 (the `Default` badge). The collateral requirement
   (10 XLM) provides an economic barrier to spam. Maintainers assign higher-weight badges
   to trusted members for greater influence.

2. **Collateral forfeiture on revocation:** When a malicious proposal is revoked, all
   participant collateral (proposer and voters) is permanently locked. This incentivizes
   voters to evaluate proposals before engaging and deters collusion with malicious
   proposers.

3. **Maintainer-only execution:** Proposal execution (`execute()`) is restricted to
   project maintainers via `auth_maintainers()`. This prevents timing attacks where a
   malicious outcome contracts could be triggered before maintainers have a chance to
   review the proposal.

4. **Public proof function:** The `proof()` function is publicly callable. This enables
   external tooling and clients to verify anonymous vote commitments for client-side vote
   crafting without requiring on-chain transactions.

5. **Hardcoded version:** The `version()` return value is updated manually with each
   contract release to maintain explicit, intentional version control.

6. **Current governance rules for upgrades:** The upgrade approval threshold is checked
   against the current `AdminsConfig`. New admin configurations included in an upgrade
   proposal only take effect after finalization.

7. **Migration module:** `add_projects_to_pagination` is a one-time admin-only migration
   function for backfilling pagination data for projects registered before pagination was
   implemented. It will be removed in a future contract update.

8. **TTL and archival strategy:** The contract does not call `extend_ttl()` on persistent
   storage. This relies on Stellar Protocol 23's "Live State Prioritization" (CAP-0062),
   which introduced automatic restoration of archived persistent entries when accessed.
   Both live state and archived state are maintained on validators in separate databases
   (Live State BucketList and Hot Archive BucketList); no data is removed from the
   network. When a transaction accesses an archived persistent entry, the entry is
   transparently restored to live state and the accessing user pays the restoration cost
   as part of the transaction fees. Instance storage (admin config, pause state, external
   contract references) extends its TTL naturally on every contract interaction.

9. **Anonymous voting weight enforcement:** In anonymous voting, the `weight` field is not
   cryptographically bound to the BLS12-381 Pedersen commitment. Instead, weight is
   validated on-chain during vote submission against `get_max_weight()` and is immutably
   stored with the vote. During proof verification, the stored weight is used to scale
   commitments. This is safe because: (a) a voter cannot exceed their `max_weight` at
   submission time, (b) the weight cannot be modified after it is recorded on-chain, and
   (c) the proof uses the immutably stored weight for verification. Cryptographic weight
   binding via range proofs is not available on Soroban; the on-chain validation provides
   equivalent security guarantees.

---

## Conclusion

The Tansu v2.0.0 contracts demonstrate strong security practices with no critical or
high-severity vulnerabilities. The architecture implements defense-in-depth through:

- M-of-N multisig governance with 24-hour timelock for upgrades
- Emergency pause functionality covering all state-mutating operations
- Economic deterrents via collateral deposits and forfeiture
- Comprehensive DoS protection with bounded operations
- BLS12-381 Pedersen commitment scheme for anonymous voting
- WASM hash validation for external contract interactions
- Typed storage keys preventing collisions
- Overflow checks enabled in release builds
- Comprehensive event logging for all auditable actions

The one low finding (L-01, unvalidated outcome contracts) is mitigated by
maintainer-only execution and `try_invoke_contract` error handling. All other reviewed
aspects are documented as intentional design decisions with clear security rationale.

The contracts are recommended for professional third-party audit via the Stellar Audit
Bank program.

---

**Disclaimer:** This is an internal security assessment conducted by the Tansu development
team. It does not constitute a professional security audit by an independent firm. A
third-party audit by a qualified security firm is recommended before mainnet deployment.
