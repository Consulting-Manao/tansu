# Tansu — Pre-Audit Security Report

| Field | Value |
|-------|-------|
| Subject | `contracts/tansu` (crate `tansu` 2.1.0), `contracts/tansu-executor` (crate 1.0.0) and `contracts/registry-tansu-manager` (crate 0.1.1) |
| Branch / commit | `main` at `f48aca4` |
| Soroban SDK | `soroban-sdk 28.0.0`, `soroban-env-host 28.0.2` (from `Cargo.lock`) |
| Protocol | 28 |
| Toolchain | Rust 1.95.0, edition 2024, target `wasm32v1-none`, `stellar-cli` 28.0.0 |
| Report type | Internal pre-audit, full mode |
| Date | 2026-09-28 |
| Tests | 185 Tansu tests and the manager's test pass |
| Method | Line-by-line read of every file in scope. Each finding was checked against the code; where a finding cites behaviour on testnet, it was observed there |
| Out of scope | Deployed contracts and their data, migrations between versions (`contract_migration.rs` is not compiled), the dApp, the IPFS worker, the Python service, external contracts beyond their interfaces |
| AI usage disclosure | Drafted with Claude Opus 5.5 from the sources at the commit above and the project documentation |

## 1. Summary

**What holds up.** Every privileged path loads its authority from storage before `require_auth`; no entry point trusts a caller-supplied role. Pause gates every state change except the admin's own calls. Proposal outcomes run from a separate executor contract that holds nothing and has no role, so an outcome never sees Tansu as its caller and cannot use Tansu's authority. Each proposal is its own ledger entry, and the entries every caller shares are bounded: badges are the four real kinds, each once; names, URLs, CIDs, notes and ballot strings have length limits; a proposal takes at most three outcomes. Weight-1 votes can take at most 20 of a proposal's 40 slots. The collateral must be a Stellar asset contract and is fixed at deployment. Loosening a project's voting durations or lowering its attestation threshold waits out a notice window, and each proposal snapshots its execute delay. Token arithmetic is checked. Anonymous-vote commitments are subgroup-checked. The attestation key is length-prefixed before hashing. The Git binding follows the SSHSIG signed-data layout. Hash-pinned contracts are re-checked on every call. Upgrades reject duplicate admins and use the SDK 28 `update_current_contract` API.

**What needs attention first.**

1. **A manager-run project gives its vote no protection (H-01).** The Registry manager is the project's sole maintainer, everyone votes with weight 1, and `trigger` is open to anyone, so one address can open, approve and apply a proposal that acts with the manager's authority.
2. **Maintainer powers are 1-of-N and immediate (M-01, M-02).** One maintainer can change every voting weight, remove votes after a vote closes, replace the maintainer set and, with that, finalize attestations alone.
3. **Two voting modes rely on something the contract does not check (M-03, M-04).** Token-weighted votes read the current balance, so the same tokens can vote from several addresses; anonymous ballots are not proven to encode one valid choice.

**Bottom line: close to audit-ready for Tansu itself.** The remaining Tansu findings are about how much a single maintainer or voter can do, and each has a small fix or a documented operating rule. The Registry manager needs its own round before it is audited.

| Severity | Count |
|---:|---:|
| Critical | 0 |
| High | 1 |
| Medium | 5 |
| Low | 12 |
| Info | 12 |

## 2. Trust model

- **Admins** (`AdminsConfig`) pause, set the executor, revoke any proposal and upgrade. Accepting an upgrade needs the threshold and the 24-hour timelock; every other admin call, including cancelling an upgrade, needs one admin. The constructor starts with one admin at threshold 1, and the runbook (`docs/operations.md`) expects that admin to be an account with native M-of-N multisig.
- **Maintainers** fully control their project, each acting alone: commits, evidence, badges, the project's NQG contract, sub-projects, the maintainer list, the anonymous-voting key, the attestation threshold, vote removal, conflict-of-interest lists, execution and revocation. M-of-N control of a project is expected to come from a multisig maintainer account.
- **Voting weights** come from badges, which maintainers set, from the project's NQG contract, which a maintainer chooses, or, for a proposal a maintainer opens with a token, from token balances. On badge-weighted projects anyone without a badge votes with weight 1.
- **The executor** runs outcome calls. It is trusted to hold nothing and to have no role in any contract; anyone may call it.
- **Anonymous ballots** are hidden from the public, not from the holder of the project's decryption key, who computes the tallies (documented).
- **Proposers** are anyone who pays the proposal deposit. **Voters** pay nothing.
- **Caller-supplied contracts** (proposal token, outcome targets, NQG contracts) are arbitrary code.
- **Storage rent**: the contract never extends TTLs and relies on automatic restoration of archived entries.

## 3. Entry points

| Area | State-changing entry points | Gate |
|------|----------------------------|------|
| Admin (`contract_tansu.rs`) | `pause`, `set_executor`, `propose_upgrade`, `approve_upgrade`, `finalize_upgrade` | one admin each; upgrade acceptance needs threshold + timelock |
| Membership (`contract_membership.rs`) | `add_member`, `update_member` | the member |
| | `set_badges`, `set_nqg_contract` | one maintainer |
| Versioning (`contract_versioning.rs`) | `register` | caller in its own maintainer list, deposit |
| | `update_config`, `commit`, `set_evidence`, `set_sub_projects`, `set_attestation_threshold`, `attest` | one maintainer |
| | `revoke_attestation` | the attester |
| DAO (`contract_dao.rs`) | `create_proposal` | the caller, deposit; a token only from a maintainer |
| | `vote` | the caller, no role |
| | `anonymous_voting_setup`, `remove_vote`, `execute`, COI add/remove | one maintainer |
| | `revoke_proposal` | one maintainer or one admin |
| Executor (`tansu-executor/src/lib.rs`) | `run` | **none** (holds nothing) |
| Manager (`registry-tansu-manager/src/lib.rs`) | `trigger` | **none** |

## 4. Findings register

| ID | Severity | Title | Location |
|----|----------|-------|----------|
| H-01 | High | On a manager-run project the vote gives no protection | `registry-tansu-manager/src/lib.rs:100-141`, `contract_dao.rs:736-753` |
| M-01 | Medium | One maintainer can decide the result of a badge- or NQG-weighted vote | `contract_membership.rs:162-268`, `:366-390`, `contract_dao.rs:434-536`, `:808-817` |
| M-02 | Medium | One maintainer can replace the maintainer set instantly and finalize attestations alone | `contract_versioning.rs:240-321`, `:691-736`, `:1011-1035` |
| M-03 | Medium | Token-weighted votes read the current balance, so tokens can vote twice | `contract_dao.rs:724-735` |
| M-04 | Medium | Anonymous ballot validity is checked only off-chain | `contract_dao.rs:683-705`, `:880-893` |
| M-05 | Medium | A manager as sole maintainer freezes project maintenance | `registry-tansu-manager/src/lib.rs:94-99` |
| L-01 | Low | Admin powers outside the upgrade threshold | `contract_tansu.rs:53-72`, `:114-128`, `:261-318`, `contract_dao.rs:552-560` |
| L-02 | Low | Upgrade proposals never expire | `contract_tansu.rs:157`, `:272-279` |
| L-03 | Low | New admins never prove they control their keys | `contract_tansu.rs:159-177`, `:281-284` |
| L-04 | Low | A member's record grows with every project that gives it a badge | `contract_membership.rs:197-221` |
| L-05 | Low | A project's badge holders share one entry | `contract_membership.rs:223-258` |
| L-06 | Low | A failing refund or outcome leaves its proposal unexecutable | `contract_dao.rs:841-858`, `:916-946` |
| L-07 | Low | The anonymous-voting key can change during a vote | `contract_dao.rs:39-77` |
| L-08 | Low | A pause does not extend voting deadlines | `contract_dao.rs:643-650`, `:837-839` |
| L-09 | Low | A tightening `update_config` drops a pending loosening | `contract_versioning.rs:282-310` |
| L-10 | Low | Every registration rewrites the shared page of project keys | `contract_versioning.rs:152-174` |
| L-11 | Low | `trigger` does not check the configured registry | `registry-tansu-manager/src/lib.rs:38-41`, `:103-123` |
| L-12 | Low | The manager imports an unpinned Tansu WASM; the executor and manager have no release workflow | `registry-tansu-manager/src/lib.rs:26-28`, `.github/workflows/contract-release.yml` |
| I-01 | Info | Anyone can call the executor | `tansu-executor/src/lib.rs:23-25` |
| I-02 | Info | A removed voter can vote again; conflict-of-interest lists are unbounded | `contract_dao.rs:434-483`, `:1132-1169` |
| I-03 | Info | Attestations store a weight nothing reads | `contract_versioning.rs:782-800` |
| I-04 | Info | Evidence attestations are not tied to recorded evidence | `contract_versioning.rs:1127-1136` |
| I-05 | Info | Names differing only in case are different projects | `contract_versioning.rs:102-113` |
| I-06 | Info | Untyped panics and overloaded error codes | multiple |
| I-07 | Info | Event gaps | `events.rs` |
| I-08 | Info | Tests mock all auths; `trigger` has no test in its crate | `tests/test_utils.rs:15-19`, `registry-tansu-manager/src/test.rs` |
| I-09 | Info | Comments and rustdoc that contradict the code | multiple |
| I-10 | Info | One constant sets the upgrade timelock and the default execute delay | `types.rs:4`, `contract_tansu.rs:157`, `contract_dao.rs:376`, `:836` |
| I-11 | Info | The migration module is kept out of the build and has no test | `contract_migration.rs`, `lib.rs:8`, `:276-281` |
| I-12 | Info | A member cannot clear a Git binding | `contract_membership.rs:105-109` |

"Documented" in a finding means the project documentation already describes the behaviour.

---

## 5. High

### H-01 — On a manager-run project the vote gives no protection

`registry-tansu-manager/src/lib.rs:100-141`; weights at `contract_dao.rs:736-753`.

**Problem.** The Registry manager is the sole maintainer of its Tansu project and pre-authorizes, with its own address, whatever outcome a proposal carries. `trigger` is callable by anyone. The manager has no call for badges or an NQG contract, so on its project every voter has weight 1 unless badges were set before the handover. Anyone can open a proposal whose single outcome calls a contract that trusts the manager, approve it from one address, and, once the voting period and execute delay have passed with no other vote, call `trigger`. The weight-1 cap of 20 slots only bounds how many addresses vote, not who.

**Impact.** Any action the manager is authorized for can be taken by anyone who pays the proposal deposit and waits out the project's durations. The only brake is a Tansu admin revoking the proposal in time.

**Fix.** Give the vote a membership: badges set by a party other than the manager, or an NQG contract with real weights, set before the handover. Restrict `trigger` to the approved outcome of an allowlisted target and function (see L-11), and consider a minimum turnout or a quorum of weighted votes before the manager authorizes anything.

## 6. Medium

### M-01 — One maintainer can decide the result of a badge- or NQG-weighted vote

`set_badges` at `contract_membership.rs:162-268`; `set_nqg_contract` at `:366-390`; `remove_vote` at `contract_dao.rs:434-536`; `execute` at `:808-817`.

**Problem.** Each of these calls needs one maintainer and applies at once, including while a proposal is open:
- `set_badges` sets any member's weight, the maintainer's own included, up to 16.5 million.
- `set_nqg_contract` points the project's weights at any contract, which can answer any `u32`, or clears it so everyone falls back to badges. A vote's weight is checked only when it is cast, so a switch during a vote gives different voters different rules.
- `remove_vote` works after the voting period ends, when the removed voter can no longer vote again.
- Only a maintainer can call `execute`, so a maintainer can also hold a result back.

**Impact.** On a project with several maintainers, any one of them can shape or override its vote. This matches the documented trust model ("maintainers fully control their project") but undercuts the DAO's claim that the vote decides.

**Fix.** Apply the existing notice window to weight changes (`set_nqg_contract`, and badge increases), or snapshot the weight source per proposal at creation. Forbid `remove_vote` after `voting_ends_at`, or restrict it to the conflict-of-interest case. Let anyone call `execute` once the delay has passed; the maintainer then only moderates.

### M-02 — One maintainer can replace the maintainer set instantly and finalize attestations alone

`update_config` at `contract_versioning.rs:240-321`; finality at `:691-736`, latched at `:1011-1035`.

**Problem.** `update_config` replaces the maintainer list at once, on one maintainer's authority. Attestation finality counts current maintainers, and `attest` latches finality the first time a target reaches the threshold. A maintainer who shrinks the list to themselves reaches 100% with a single attestation, and the latch survives when the list is restored. Lowering the threshold waits out a notice window, but shrinking the maintainer set achieves the same result without one.

**Impact.** One maintainer can take over a project and certify any commit or evidence as final, permanently.

**Fix.** Queue maintainer removals behind the same notice window as other loosening changes, or require the removed maintainers' consent. If removals must stay instant (a contract maintainer that must be installed at once, for example), compute finality against the maintainer set at the time of the first attestation, or never latch finality reached with fewer than a minimum number of maintainers. Document that M-of-N control of a project needs a multisig maintainer account.

### M-03 — Token-weighted votes read the current balance, so tokens can vote twice

`contract_dao.rs:724-735`.

**Problem.** A token-weighted vote passes if the voter's balance covers the weight when the vote is cast. Nothing locks or snapshots the balance, so after voting a holder can transfer the tokens to another address and vote again with the same weight. The 40-vote cap bounds the repetition, not the effect: 39 votes can carry the same tokens.

**Impact.** A token holder can multiply their weight up to the vote cap. Only a maintainer can open a token proposal, which limits where this applies but not who can exploit it.

**Fix.** Snapshot balances at creation (a token with checkpoints, read at `voting_ends_at` or creation), or lock the voted amount until the vote ends. Otherwise document that token-weighted votes suit only non-transferable or trusted-holder tokens.

### M-04 — Anonymous ballot validity is checked only off-chain

`vote` at `contract_dao.rs:683-705`; `execute` at `:880-893`.

**Problem.** An anonymous ballot holds three commitments, one per choice. The contract checks their structure and that they are in the subgroup, and at execution that the declared tallies and seeds match the weighted sum of all commitments. It does not check that each ballot encodes exactly one choice with a value of 1 and the others 0. A ballot that encodes other values changes the tallies by more than its weight, and the aggregate check still passes because it only binds the sum.

**Impact.** The result of an anonymous vote is only as sound as the key holder's off-chain check of each decrypted ballot before submitting the tallies. Documented.

**Fix.** Require a zero-knowledge proof with each ballot that every commitment opens to 0 or 1 and that the three sum to 1, verified on-chain, or document the off-chain check as a mandatory step of executing an anonymous proposal and have the dApp perform it.

### M-05 — A manager as sole maintainer freezes project maintenance

`registry-tansu-manager/src/lib.rs:94-99`.

**Problem.** The manager must be the project's only maintainer so that it can call `execute` directly, and it has no call for anything else. Once it is the sole maintainer, nobody can update the project's configuration, set badges or an NQG contract, remove a vote, add a conflict of interest, rotate the anonymous-voting key or revoke a proposal as a maintainer.

**Impact.** Every correction on the project needs a Tansu admin, and some (configuration, weights) are impossible.

**Fix.** Add maintainer pass-through calls to the manager behind its own governance, or let the manager share the project with a multisig maintainer that handles everything but execution.

## 7. Low

- **L-01 — Admin powers outside the upgrade threshold.** One admin can cancel any upgrade proposal, pause and unpause, set the executor, and revoke any proposal in any project, even while paused. With several admins configured, the upgrade threshold does not protect these. The runbook's single multisig admin account covers it. *Fix:* keep one admin that is a multisig account, or require the threshold for cancel, unpause and `set_executor`.
- **L-02 — Upgrade proposals never expire.** `executable_at` is fixed at proposal time and never lapses, so an approved but unfinalized upgrade can be applied much later, and one approved after `executable_at` gets no notice period. *Fix:* add an expiry, and start the timelock when the threshold is reached.
- **L-03 — New admins never prove their keys.** A mistyped address in a new `AdminsConfig` counts toward N, and a threshold equal to N becomes unreachable. *Fix:* require auth from newly added admins at finalize.
- **L-04 — A member's record grows with every project that gives it a badge.** Each project adds an entry to the member's record, and only that project's maintainers can remove it. Someone who registers several hundred projects (5 XLM each) and gives the same member a badge in each can push the record to the 64 KB entry limit, after which `set_badges` and `update_member` fail for that member. *Fix:* cap the number of projects per member, or key badges by `(member, project)` and keep an index for the profile.
- **L-05 — One badge-holder entry per project.** All holders of a project live in one `Badges` entry, so around 1,500 holdings it reaches the entry limit and `set_badges` fails for the project. Maintainer-controlled. *Fix:* key holders per project and badge kind, or cap them.
- **L-06 — A failing refund or outcome blocks `execute`.** `execute` refunds the proposer before tallying and runs the outcome after; if the refund fails (the proposer's account was removed) or the outcome call fails, the whole call reverts and the proposal stays active until a maintainer or admin revokes it, which deletes it. Documented for outcomes. *Fix:* record the status and emit an event instead of reverting, and let a failed refund stay claimable.
- **L-07 — Voting key can change mid-vote.** Any maintainer can replace the anonymous-voting public key while an anonymous proposal is open, splitting its ballots across two keys. *Fix:* snapshot the key per proposal.
- **L-08 — Pause does not extend deadlines.** A pause across a voting window removes it, and `execute` then runs on partial votes. Documented. *Fix:* extend deadlines by the paused time, or keep documenting it.
- **L-09 — A tightening `update_config` drops a pending loosening.** It removes `PendingGovernance` unconditionally, and a second loosening overwrites the first. This fails safe. *Fix:* merge per field and emit when a pending change is superseded.
- **L-10 — Every registration rewrites the shared page of project keys.** `register` appends to the last `ProjectKeys` page and rewrites `TotalProjects`. A registration simulated before another one lands declares too few write bytes and fails with `resource_limit_exceeded`; this was observed on testnet with two registrations a few seconds apart. *Fix:* add a margin to the write footprint on the client, or key the project list by index.
- **L-11 — `trigger` ignores the registry.** The stored registry is never compared with the outcome target, so the manager signs for any contract that trusts it. Documented. *Fix:* require `oc.address == registry` and allowlist functions.
- **L-12 — Unpinned import and missing releases.** The manager imports `target/.../tansu.wasm` with `contractimport!` and no `sha256`, so it compiles against whatever was built locally. Only `tansu` has a release workflow with build provenance; the executor and the manager are built and deployed from a local build. *Fix:* pin the imported hash, and release the executor and the manager through the same workflow.

## 8. Info

- **I-01 — Anyone can call the executor.** `run` has no access control, which is safe only because the executor holds nothing and has no role. A contract that trusted "calls from the executor" as calls from Tansu proposals could be driven by anyone. *Fix:* keep documenting it; integrators should use a pre-authorization, as the manager does.
- **I-02 — Removed votes and COI lists.** `remove_vote` does not bar the address, so a removed voter can vote again before the vote ends unless a maintainer adds it to the conflict-of-interest list; `add_conflict_of_interest` takes a list of any length and every vote reads it.
- **I-03 — Unused attestation weight.** `attest` stores the attester's weight, which finality never reads, and computing it calls the project's NQG contract, so a pinned NQG whose WASM changed makes `attest` revert.
- **I-04 — Evidence attestations.** An `Evidence(kind, cid)` target is checked for length only, not against evidence recorded with `set_evidence`.
- **I-05 — Case in names.** Names are 4 to 30 letters and digits with case kept, so `Tansu` and `tansu` are two projects. Intended; clients should make case differences visible.
- **I-06 — Errors.** `get_projects` panics with an untyped `expect`; tallies are read with `unwrap`; `UpgradeError` covers seven different failures; the upgrade timelock reuses `ProposalVotingTime`; a bad Git signature traps instead of returning `InvalidGitIdentity`.
- **I-07 — Events.** Adding and removing conflicts of interest emit the same event; `ProposalCreated` does not say whether the proposal carries an outcome; `ContractUpdated` for the executor carries no hash.
- **I-08 — Tests mock all auths.** Outside the attestation and executor suites, tests use `mock_all_auths`, so removing a `require_auth` would not fail them. `trigger` is exercised only through a mock manager in the Tansu tests; its own crate tests only the constructor.
- **I-09 — Stale comments.** The rustdoc above `get_voters` describes `get_all_votes`; `attest` still documents an "empty" hash as its only hash check; the `update_config` trait names the IPFS parameter `hash`; `set_sub_projects` does not document its key checks; `version()` returns 2 for crate 2.1.0.
- **I-10 — Shared constant.** `TIMELOCK_DELAY` is both the upgrade timelock and the default execute delay of proposals without an override, so changing one in a build changes the other, including for open proposals without a snapshot.
- **I-11 — Migration module.** `contract_migration.rs` is excluded from the build and enabled by hand for a migrating build; it has no test in the repository. *Fix:* keep a test behind a feature flag so the code cannot rot.
- **I-12 — Git binding.** `update_member` keeps the current Git identity when none is given, so a member cannot remove a binding.

## 9. Tests and CI

- 185 Tansu tests pass, with integration-style coverage of registration, attestation, the DAO, anonymous voting, upgrades, the executor and input bounds, and expected-cost snapshots.
- Priority tests to add: M-01 weight changes during an open vote; M-02 finality after shrinking the maintainer set; M-03 the same tokens voting twice; every branch of `trigger`; auth assertions outside the attestation suite.
- CI builds `tansu.wasm` before the manager, runs clippy with warnings as errors and rustfmt, pins its downloads with checksums and most third-party actions by commit (`actions/checkout` in `contract.yml` is pinned by tag), and scans the repository with Trivy. Releases of `tansu` go through a pinned workflow with provenance. Missing: a static-analysis gate, and releases of the executor and the manager.

## 10. Readiness

Before an external audit of Tansu: decide M-01 and M-02 (fix, or document the 1-of-N maintainer model with multisig maintainer accounts as the operating rule), and M-03 and M-04 (fix, or restrict the voting modes they affect). The Low and Info items are cheap and remove the easy comments an auditor would otherwise open with. The Registry manager (H-01, M-05, L-11, L-12) needs its own round first.

**Status: Tansu close to ready; the Registry manager not ready.**
