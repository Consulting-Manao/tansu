# Tansu — Pre-Audit Security Report

| Field | Value |
|-------|-------|
| Subject | `contracts/tansu` (crate `tansu` 2.1.0) and `contracts/registry-tansu-manager` (crate 0.1.1) |
| Branch / commit | `main` at `bf6cf54` (contract sources last changed in `07b55bd`) |
| Soroban SDK | `soroban-sdk 28.0.0`, `soroban-env-host 28.0.2` (from `Cargo.lock`) |
| Protocol | 28 |
| Toolchain | Rust 1.95.0, edition 2024, target `wasm32v1-none`, `stellar-cli` 28.0.0 |
| Report type | Internal pre-audit, full mode |
| Date | 2026-09-26 |
| Tests | 165 workspace tests pass on a fresh build |
| Method | Line-by-line read of each contract area by an independent reviewer, then a second reviewer who tried to refute every finding. Only findings that survived are listed, at the severity the second review settled on |
| Out of scope | Deployed contracts and their data, migrations between versions, the dApp, the IPFS worker, the Python service, external contracts beyond their interfaces |
| Fixes | `f490db1` to `f8985ff` on `main`, each finding's status in the [register](#4-findings-register). 185 Tansu tests and the manager's test pass after them |
| AI usage disclosure | Drafted with Claude Opus 5.5 from the sources at the commit above and the project documentation |

## 1. Summary

**What holds up.** Every privileged path loads its authority from storage before `require_auth`; no entry point trusts a caller-supplied role. Pause gates every state change. Upgrades are M-of-N with a 24-hour timelock and use the SDK 28 `update_current_contract` API. Storage keys are typed. Loosening a project's voting durations waits out a notice window, and each proposal snapshots its execute delay. Anonymous-vote commitments are subgroup-checked. The attestation key is length-prefixed before hashing. The Git binding follows the SSHSIG signed-data layout. Hash-pinned dependencies are re-checked on every call.

**What needs fixing first.**

1. **Outcome calls run with Tansu's own authority (C-01).** `execute` invokes whatever `(address, fn, args)` the proposer stored, and Tansu is the direct caller, so any contract that accepts Tansu as authorizer — including the collateral asset Tansu holds — treats the call as authorized by Tansu.
2. **Several shared ledger entries have no size or count bounds (H-01, H-02).** One input can push a shared entry to the network's 64 KB limit and permanently block later writes for other users.
3. **The voter cap is first-come and weight 1 is free (H-03, H-04).** On badge-weighted projects any address votes with weight 1, so fresh addresses can fill all 40 slots; on manager-run projects this also means the vote protects nothing.
4. **Single-key powers undercut the multi-party designs (M-01 to M-04, M-08).** One admin can cancel any upgrade or undo a pause; one maintainer can rewrite the maintainer set.

**Bottom line: not audit-ready.** None of the fixes is large; most are a bound, a check, or a snapshot.

| Severity | Count |
|---:|---:|
| Critical | 1 |
| High | 4 |
| Medium | 11 |
| Low | 21 |
| Info | 10 |

## 2. Trust model

- **Admins** (`AdminsConfig`) pause, configure the collateral and NQG contracts, and upgrade. Accepting an upgrade needs the threshold and the timelock; everything else, including cancelling an upgrade, needs one admin. The constructor starts with one admin at threshold 1.
- **Maintainers** fully control their project, each acting alone: commits, evidence, badges, sub-projects, the maintainer list, anonymous-voting key, attestation threshold, execution, vote removal, revocation.
- **Badge weights** are set by maintainers, so on badge-weighted projects the vote is bounded by maintainer trust.
- **Anonymous ballots** are hidden from the public, not from the decryption-key holder, who computes the tallies (documented).
- **Proposers** are anyone who pays the proposal deposit. **Voters** pay nothing.
- **Caller-supplied contracts** (proposal token, outcome targets) are arbitrary code.
- **Storage rent**: the contract never extends TTLs and relies on automatic restoration of archived entries.

## 3. Entry points

| Area | State-changing entry points | Gate |
|------|----------------------------|------|
| Admin (`contract_tansu.rs`) | `pause`, `set_collateral_contract`, `set_nqg_contract`, `propose_upgrade`, `approve_upgrade`, `finalize_upgrade` | one admin each; upgrade acceptance needs threshold + timelock |
| Membership (`contract_membership.rs`) | `add_member`, `update_member` | the member |
| | `set_badges` | one maintainer |
| Versioning (`contract_versioning.rs`) | `register` | caller in its own maintainer list, deposit |
| | `update_config`, `commit`, `set_evidence`, `set_sub_projects`, `set_attestation_threshold`, `attest` | one maintainer |
| | `revoke_attestation` | the attester |
| DAO (`contract_dao.rs`) | `create_proposal`, `vote` | the caller, no role |
| | `anonymous_voting_setup`, `remove_vote`, `execute`, COI add/remove | one maintainer |
| | `revoke_proposal` | one maintainer or one admin |
| Manager (`registry-tansu-manager/src/lib.rs`) | `trigger` | **none** |

## 4. Findings register

| ID | Severity | Title | Location | Status |
|----|----------|-------|----------|--------|
| C-01 | Critical | Outcome calls run with Tansu's own authority | `contract_dao.rs:827-845` | Fixed `f490db1`: outcomes run from `tansu-executor`, which holds nothing |
| H-01 | High | One proposal can permanently block new proposals on its project | `contract_dao.rs:171-302`, `:516-519` | Fixed `840322c`: one entry per proposal, pages hold ids, at most 3 outcomes |
| H-02 | High | Any maintainer can fill another member's shared record to the entry limit | `contract_membership.rs:181-259` | Fixed `720e640`: four badge kinds, each once |
| H-03 | High | Fresh weight-1 addresses can fill the 40-vote cap | `contract_membership.rs:328-353`, `contract_dao.rs:590-592` | Fixed `720e640`: at most 20 weight-1 votes per proposal |
| H-04 | High | On a manager-run project the vote gives no protection | `registry-tansu-manager/src/lib.rs:100-141` | Not changed: manager out of this round |
| M-01 | Medium | One admin can cancel any upgrade and undo a pause | `contract_tansu.rs:37-56`, `:268-323` | Not changed: the admin is one account with native M-of-N multisig |
| M-02 | Medium | Collateral asset is 1-of-N configurable and not recorded per proposal | `contract_tansu.rs:96-112`, `contract_dao.rs:205-217`, `:757-767` | Fixed `f490db1`: collateral is a Stellar asset fixed at deploy |
| M-03 | Medium | `set_nqg_contract` can point any project's voting weights at any contract | `contract_tansu.rs:120-148` | Fixed `f0aef91`: NQG set per project by its maintainers |
| M-04 | Medium | Duplicate admins in a new config lock every later upgrade | `contract_tansu.rs:179-185` | Fixed `c49e4f4` |
| M-05 | Medium | The proposer chooses the token that decides every vote weight | `contract_dao.rs:179`, `:645-663` | Fixed `a9b9334`: maintainers only, never on an NQG project |
| M-06 | Medium | Attestation finality is not durable and one maintainer can latch it | `contract_versioning.rs:588-599`, `:641-686`, `:971-995` | Fixed `258923e`: lowering waits out the notice window |
| M-07 | Medium | Unbounded attestation notes and evidence CIDs fill per-target entries | `contract_versioning.rs:396-417`, `:719-777` | Fixed `258923e`: note 256 bytes, CID 128 bytes |
| M-08 | Medium | One maintainer can replace the maintainer set instantly | `contract_versioning.rs:231-244` | Not changed: M-of-N through a multisig maintainer account; a queue would block the handover to a contract maintainer |
| M-09 | Medium | Anonymous ballot validity is checked only off-chain | `contract_dao.rs:614-627`, `:1285-1316` | Not changed: documented; a validity proof is future work |
| M-10 | Medium | NQG voting power wraps when cast to `u32` | `contract_membership.rs:403-419` | Fixed `f0aef91`: NQG contracts answer a `u32` weight |
| M-11 | Medium | A manager as sole maintainer freezes project maintenance | `registry-tansu-manager/src/lib.rs:100-141` | Not changed: manager out of this round |
| L-01 | Low | Upgrade proposals never expire | `contract_tansu.rs:177`, `:279-286` | Not changed: multisig admin account |
| L-02 | Low | Admins cannot revoke a proposal while paused | `contract_dao.rs:493-501` | Fixed `c49e4f4` |
| L-03 | Low | New admins never prove they control their keys | `contract_tansu.rs:179-192`, `:288-291` | Not changed: multisig admin account |
| L-04 | Low | A tightening `update_config` drops a pending loosening | `contract_versioning.rs:258-294` | Not changed: fails safe, documented |
| L-05 | Low | Project names accept 0–3 characters and case variants | `contract_versioning.rs:96-107` | Fixed `258923e`: 4–30 characters; case kept, as the dApp shows names |
| L-06 | Low | Attestation commit hashes are not validated or normalized | `contract_versioning.rs:725-733`, `:832-840` | Fixed `258923e`: lowercase hex required; evidence existence not checked |
| L-07 | Low | `attest` depends on NQG for a weight it does not use | `contract_versioning.rs:735-739` | Fixed `f0aef91`: a failing NQG read gives weight 0 |
| L-08 | Low | Project URL, IPFS and sub-project keys are unbounded | `contract_versioning.rs:90-95`, `:546-563` | Fixed `258923e` |
| L-09 | Low | `add_member` stores an unverified Git key | `contract_membership.rs:49-73` | Fixed `258923e` |
| L-10 | Low | Duplicate badges inflate weight and can overflow | `contract_membership.rs:211-218`, `:342-346` | Fixed `720e640` |
| L-11 | Low | A project's badge holders share one entry | `contract_membership.rs:225-258` | Not changed: documented; at most four badges per holder |
| L-12 | Low | The anonymous-voting key can change during a vote | `contract_dao.rs:34-72` | Not changed: documented |
| L-13 | Low | A pause does not extend voting deadlines | `contract_dao.rs:561-581` | Not changed: documented |
| L-14 | Low | A removed voter can vote again; ballot strings are unbounded | `contract_dao.rs:413-424`, `:619-621` | Fixed `a9b9334` for ballot size, `840322c` for COI reads; voting again after removal is kept on purpose |
| L-15 | Low | `proof()` returns `true` for empty input | `contract_dao.rs:875-936` | Fixed `a9b9334` |
| L-16 | Low | A failing outcome leaves its proposal unexecutable | `contract_dao.rs:827-845` | Not changed: documented; a revoke clears the proposal |
| L-17 | Low | `trigger` does not check the configured registry | `registry-tansu-manager/src/lib.rs:38-41`, `:113-123` | Not changed: manager out of this round |
| L-18 | Low | The manager imports an unpinned Tansu WASM that CI never builds | `registry-tansu-manager/src/lib.rs:26-28` | Partly fixed `b7ef81c`: CI builds Tansu first; pinning and release are the manager's |
| L-19 | Low | Upgrade and config events omit admins and maintainers | `events.rs:7-22`, `:137-159` | Fixed `9c5fd72` |
| L-20 | Low | `make contract_propose_upgrade` rebuilds the WASM and hard-codes admins | `Makefile:128-137` | Fixed `b7ef81c` |
| L-21 | Low | SBOM and evidence jobs run unverified downloaded binaries with secrets | `.github/workflows/sbom.yml` | Fixed `b7ef81c` and `f8985ff` |
| I-01 | Info | Missing NQG key makes votes and attestations fail untyped | `contract_membership.rs:319-323` | Fixed `f0aef91`: no NQG set means badges |
| I-02 | Info | Ambiguous and untyped errors | `lib.rs:308`, `contract_tansu.rs`, `contract_membership.rs:401` | Partly fixed `f490db1`: the `unwrap` is gone; error codes unchanged |
| I-03 | Info | Token decimals arithmetic can overflow | `contract_dao.rs:649` | Fixed `a9b9334` |
| I-04 | Info | Membership events | `contract_membership.rs:62-66`, `:134-138` | Fixed `9c5fd72`: `MemberUpdated` |
| I-05 | Info | Event naming and topics | `events.rs` | Partly fixed `9c5fd72`: `BadgesUpdated` |
| I-06 | Info | `ProposalCreated` omits the outcome | `events.rs:69-110` | Not changed |
| I-07 | Info | Tests mock all auths | `tests/test_utils.rs:15-19` | Not changed |
| I-08 | Info | `trigger` has no test | `registry-tansu-manager/src/test.rs` | Not changed: manager out of this round |
| I-09 | Info | Comments and rustdoc contradict the code | multiple | Fixed `9c5fd72` for Tansu; manager and e2e comments unchanged |
| I-10 | Info | Dead migration module | `contract_migration.rs` | Not changed: kept for the future mainnet migration |

"Documented" in a finding means the project documentation already describes the behaviour; the code has not changed. The status column gives the commit that fixes a finding, or why it stays. Findings below describe the code at the reviewed commit; their line numbers are from it.

What the fixes kept working: the public-goods award's anonymous NQG votes (commitments, conflicts of interest, removing a vote and voting again); the stellar-membership contract as sole maintainer of its project, which now serves its NQG to Tansu as a `u32` weight; the Stellar Registry manager, whose pre-authorization still reaches its target through the executor (`manager_authorization_reaches_the_target_through_the_executor`); and the dApp, whose bindings, error codes and proposal count follow the contract.

---

## 5. Critical

### C-01 — Outcome calls run with Tansu's own authority

`contract_dao.rs:827-845`; stored unvalidated at `:273-281`.

**Problem.** `execute` calls `env.try_invoke_contract` on the `OutcomeContract` the proposer stored. Nothing constrains the target, function or arguments. Because Tansu is the direct caller, any `require_auth` on the Tansu address inside that target succeeds. The collateral SAC holds all registration deposits and open proposal deposits under the Tansu address, and a project's voting durations can be as short as one second, so a proposal on a project someone controls can reach `execute` quickly — and an outcome slot runs for every terminal status, including `Cancelled`, which needs no votes.

**Impact.** An outcome can spend anything Tansu holds or is authorized for. This is the one issue that puts the whole contract's balance at risk.

**Fix.** Never let Tansu be the authorizing caller of arbitrary code. Options, strongest first:
- Run outcomes from a separate executor contract that holds no assets and no roles, so its authority is worthless.
- Restrict outcomes to targets on a per-project allowlist set by maintainers.
- At minimum, reject outcomes that target the collateral contract. This closes the deposit pool, because Tansu's authority reaches only contracts it calls directly: a contract that Tansu calls cannot in turn spend Tansu's balance, since `execute` pre-authorizes nothing deeper. It remains a denylist, though. Any other token sent to Tansu, and any contract that gives Tansu a role, stays reachable by a direct outcome call, so prefer the first two options.

Add a test that an outcome calling `transfer` on the collateral asset with `from = Tansu` fails.

## 6. High

### H-01 — One proposal can permanently block new proposals on its project

`contract_dao.rs:171-302`, `:516-519`; `types.rs:78-82`.

**Problem.** Title and IPFS CID are bounded, but `outcome_contracts` and each `args: Vec<Val>` are not. Nine proposals share one `Dao(project, page)` entry, and the page is chosen by `proposal_id / 9`. A proposal large enough to bring the page near the 64 KB entry limit makes every later write to that page exceed it; the counter never advances, so every later proposal fails the same way. `revoke_proposal` clears the title and CID but keeps `outcome_contracts`, so it cannot shrink the page. Only indices 0–2 are ever used.

**Fix.** Reject more than three outcomes and bound the serialized size of `args`. Clear `outcome_contracts` in `revoke_proposal`. Better, store outcomes under their own `Outcomes(project, id)` key.

### H-02 — Any maintainer can fill another member's shared record to the entry limit

`contract_membership.rs:181-259`; `types.rs:57-64`.

**Problem.** A member's badges for every project live in one `Member(address)` entry. `set_badges` accepts an unbounded, unchecked list and copies it into that entry, without the member's consent. Registering a project is open to anyone, so any project's maintainer can grow any member's record to the 64 KB limit. After that, no other project can grant that member badges and any update that grows the record fails.

**Fix.** Deduplicate by badge kind and cap the list at the four real badges. Better, store badges per `(member, project)` key so one project cannot affect another's data.

### H-03 — Fresh weight-1 addresses can fill the 40-vote cap

`contract_membership.rs:328-353`; `contract_dao.rs:18`, `:590-592`, `:654-661`.

**Problem.** On badge-weighted projects, `get_max_weight` returns 1 for any address, including non-members and members with an empty badge list. Voting is free and the cap is first-come, with the proposer's automatic abstain taking one slot. Fresh addresses can take every remaining slot and members then get `VoteLimitExceeded`. `remove_vote` frees the slot but does not block the address. The weight-1 rule and the cap are documented; filling the cap is not.

**Fix.** Return 0 weight for addresses without badges on badge-weighted projects (non-members cannot vote), or reserve slots for badge holders. Make `remove_vote` also exclude the address from the proposal.

### H-04 — On a manager-run project the vote gives no protection

`registry-tansu-manager/src/lib.rs:100-141`.

**Problem.** In the documented setup the manager is the project's only maintainer, and `trigger` is callable by anyone. The manager exposes no way to grant badges, so every voter has weight 1 (H-03), and `create_proposal` lets the proposer supply a token that decides every weight (M-05). "The vote is the only gate" (documented) therefore means no gate: whoever controls the first votes decides what the manager signs.

**Fix.** Have `trigger` reject token-weighted proposals and require a real weight source (a project-configured token, or badges the manager can manage through governance). Combine with L-17.

## 7. Medium

### M-01 — One admin can cancel any upgrade and undo a pause

`contract_tansu.rs:37-56`, `:268-323`. Documented.

`finalize_upgrade(accept: false)` deletes the proposal on one admin's call, even after threshold approval and the timelock. The admin set only changes through an accepted upgrade, so a single uncooperative key can prevent its own removal indefinitely. `pause` is 1-of-N in both directions, so the same key can undo an emergency pause.

**Fix.** Cancellation by the proposer, or by a threshold of rejections. Keep `pause(true)` 1-of-N but make unpausing a threshold action.

### M-02 — Collateral asset is 1-of-N configurable and not recorded per proposal

`contract_tansu.rs:96-112`; `lib.rs:324-331`; `contract_dao.rs:205-217`, `:757-767`.

One admin can set any contract as collateral, and with no pin nothing is checked. Deposits are taken in the asset current at creation and refunded in the asset current at execution, so a switch lets refunds pay out an asset that was never deposited.

**Fix.** Fix the native XLM SAC address at construction (it can be derived on-chain) and drop the setter, or require `Executable::StellarAsset` and record the asset per proposal.

### M-03 — `set_nqg_contract` can point any project's voting weights at any contract

`contract_tansu.rs:120-148`; `contract_membership.rs:319-326`.

One admin sets the NQG project key from any string, without checking the project exists, and may omit the hash pin. That project's weights then come from the configured contract; honest members below the 4M threshold get 0.

**Fix.** Put NQG changes behind the M-of-N path, require a pin, and check the project exists.

### M-04 — Duplicate admins in a new config lock every later upgrade

`contract_tansu.rs:179-185`, `:229-230`. Documented.

The only check is `0 < threshold <= admins.len()`, and `len()` counts duplicates. Since one address can approve only once, a config like `[A, A, B]` at threshold 3 can never reach threshold again, and upgrades are the only way to change the admin set.

**Fix.** Reject duplicate admins, as `validate_maintainers` already does for maintainers.

### M-05 — The proposer chooses the token that decides every vote weight

`contract_dao.rs:179`, `:270`, `:645-663`. Partly documented.

Any proposer can set `token_contract`, which replaces badge or NQG weighting for that proposal. Weight is checked only against that contract's `decimals()` and `balance()`, and nothing is escrowed, so the same balance can also be moved and voted again. Maintainers still gate `execute`, except in the manager setup (H-04).

**Fix.** Make the voting token a project setting chosen by maintainers, reject token proposals on the NQG project, and escrow or snapshot balances.

### M-06 — Attestation finality is not durable and one maintainer can latch it

`contract_versioning.rs:588-599`, `:641-686`, `:779`, `:971-995`. Documented.

`is_final` is computed live from the current maintainer set and threshold, but only `attest` writes the permanent latch. One maintainer can lower the threshold immediately (voting durations wait out a notice window; this does not) or shrink the maintainer set, then attest, and the latch is permanent and blocks revocation. On projects with one or two maintainers, lowering the threshold alone is enough.

**Fix.** Queue threshold decreases behind the notice window, and re-evaluate or latch finality whenever the set or threshold changes.

### M-07 — Unbounded attestation notes and evidence CIDs fill per-target entries

`contract_versioning.rs:396-417`, `:719-777`.

`attest` stores `note` with no length check in the per-target list, and pruning is by count only. One large note makes every later attestation on that target exceed the entry limit, so it can never become final; the entry stays even after its author stops being a maintainer. `set_evidence` only rejects an empty CID, so a few large CIDs fill an evidence history the same way.

**Fix.** Bound `note` and `cid` lengths (a CID fits in about 100 bytes).

### M-08 — One maintainer can replace the maintainer set instantly

`contract_versioning.rs:231-244`, `:997-1013`. Documented.

`update_config` replaces the list on one maintainer's call; the caller need not stay in it. Shorter voting durations wait out a notice window, but removing every other maintainer takes effect at once, leaving them no chance to react. It is also the root of the second route in M-06.

**Fix.** Require the caller to stay in the list and put removals behind the same notice window.

### M-09 — Anonymous ballot validity is checked only off-chain

`contract_dao.rs:614-627`, `:1285-1316`. Documented.

`vote` checks the shape of a ballot (three commitments in G1, three strings each) but nothing proves it is one-hot or tied to its voter and proposal; `execute` only opens the weighted aggregate. An identical copy of another ballot is accepted. The executor must inspect every decrypted ballot and remove bad ones.

**Fix.** Verify a per-ballot validity proof on-chain (the host supports the pairings needed for Groth16), bound to voter and proposal.

### M-10 — NQG voting power wraps when cast to `u32`

`contract_membership.rs:403-419`.

`scaled.to_i128().unwrap() as u32` keeps the low 32 bits. A negative score becomes about 4.29 billion and passes the 4M filter; large scores wrap to arbitrary values. The repository's own NQG mock returns 1e22, which wraps to 1,410,065,408, so tests already run on a wrapped value.

**Fix.** Return 0 for non-positive values, clamp to `u32::MAX`, replace the `unwrap` with a checked conversion, and fix the mock.

### M-11 — A manager as sole maintainer freezes project maintenance

`registry-tansu-manager/src/lib.rs:100-141`. Partly documented.

With the manager as only maintainer, `update_config`, `set_badges`, `remove_vote`, `revoke_proposal` and COI management are unreachable, since outcomes cannot call back into Tansu. Proposals with no outcome, an empty list, several outcomes, or anonymous voting can never pass `trigger`, and only an admin can clear them.

**Fix.** Let `trigger` execute without pre-authorization when there is nothing to sign, give the manager a governed path to these maintainer functions, and reject unexecutable proposals at creation.

## 8. Low

- **L-01 — Upgrade proposals never expire.** `executable_at` is fixed at proposal time and never lapses, so an approved but unfinalized proposal can be applied much later, and a proposal approved late gets no notice period. *Fix:* add an expiry and start the timelock at quorum.
- **L-02 — Admins cannot revoke while paused.** `revoke_proposal` checks the pause before the admin branch, but `docs/operations.md` tells admins to pause then revoke. *Fix:* skip the pause check on the admin path, or fix the runbook.
- **L-03 — New admins never prove their keys.** A mistyped address counts toward N, and a threshold equal to N becomes unreachable. *Fix:* require auth from newly added admins at finalize.
- **L-04 — A tightening `update_config` drops a pending loosening.** It removes `PendingGovernance` unconditionally, and a second loosening overwrites the first. This fails safe. *Fix:* merge per field and emit when a pending change is superseded.
- **L-05 — Names accept 0–3 characters and case variants.** An empty name registers, and `Tansu`/`tansu` are separate projects; `on_chain.mdx` says 4–30 characters. *Fix:* enforce 4–30 and lowercase before hashing.
- **L-06 — Attestation hashes are not validated.** `attest` and `revoke_attestation` only reject an empty string, and mixed-case hex splits state between case variants. `Evidence` targets are not checked against recorded evidence. *Fix:* reuse `is_valid_commit_hash`, lowercase, and check the evidence exists.
- **L-07 — `attest` depends on NQG for an unused weight.** A misconfigured NQG reverts attestations over a value finality never reads. *Fix:* drop the stored weight or make the lookup non-fatal.
- **L-08 — Project metadata is unbounded.** `url`, `ipfs` and sub-project keys have no length checks, and sub-projects accept duplicates and the project itself. *Fix:* bound them as proposals already do.
- **L-09 — `add_member` stores an unverified Git key.** With `git_identity = None`, a supplied `git_pubkey` is stored without a signature, contrary to the doc comment. *Fix:* require identity, key and signature together.
- **L-10 — Duplicate badges.** Summing without dedup lets one address reach any weight up to `u32::MAX`, and from 430 `Developer` badges the sum overflows and that member can no longer vote or attest. *Fix:* see H-02.
- **L-11 — One badge-holder entry per project.** All holders live in one entry, so around 1,500 holdings it hits the entry limit. *Fix:* key holders per project and badge.
- **L-12 — Voting key can change mid-vote.** Any maintainer can replace the public key during an open anonymous proposal, splitting ballots across keys. *Fix:* snapshot the key per proposal.
- **L-13 — Pause does not extend deadlines.** A pause across a voting window removes it, and `execute` then runs on partial votes. *Fix:* extend deadlines by paused time, or document it.
- **L-14 — Removed voters and ballot size.** `remove_vote` does not block the address; ballot strings have no length bound; COI calls load every vote to read one status. *Fix:* record removed voters, bound strings, read status only.
- **L-15 — `proof()` is vacuously true.** Empty tallies and seeds return `true`, and the helper trusts a caller-supplied `Proposal`. `execute` is unaffected. *Fix:* require three values each and load the proposal by id.
- **L-16 — Failing outcome blocks execute.** An outcome failure reverts the whole call, and the proposal stays active until someone revokes it as `Malicious`. Documented. *Fix:* record the status and emit `OutcomeFailed` instead of reverting.
- **L-17 — `trigger` ignores the registry.** The stored registry is never compared with the outcome target, so the manager signs for any contract that trusts it. Documented. *Fix:* require `oc.address == registry` and allowlist functions.
- **L-18 — Unpinned `contractimport!`.** The manager imports `target/.../tansu.wasm` with no hash, and `contract.yml` and the lint job never build it first, so CI compiles against a missing or cached WASM. The manager has no release workflow. *Fix:* build Tansu before the manager, pin the hash, add a release job.
- **L-19 — Events omit admins and maintainers.** Upgrade events omit the admin set, `ProjectConfigUpdated` omits the maintainer list, and `register` writes voting-duration overrides without `ProjectGovernanceUpdated`. The runbook relies on these for monitoring. *Fix:* add the fields.
- **L-20 — Makefile upgrade target.** `contract_propose_upgrade` depends on `contract_build`, so it overwrites or replaces the release WASM, and it always sends a hard-coded 1-of-2 admin set. *Fix:* drop the build dependency and the hard-coded config.
- **L-21 — CI supply chain.** `sbom.yml` pipes the Trivy installer from a mutable branch into a container that later uses `FILEBASE_TOKEN`, downloads `stellar-cli` without a checksum in a job holding `TANSU_SECRET_KEY`, and `stellar/actions/rust-cache@main` is unpinned. *Fix:* pin versions and verify checksums.

## 9. Info

- **I-01 — Missing NQG key.** `get_max_weight` `.expect`s the NQG key, so every vote and attestation fails untyped until `set_nqg_contract` runs; NQG can never be turned off. *Fix:* treat a missing key as "no NQG project".
- **I-02 — Errors.** `retrieve_contract` unwraps; `UpgradeError` covers five conditions; the timelock reuses `ProposalVotingTime`; a bad Git signature traps instead of `InvalidGitIdentity`.
- **I-03 — Decimals.** `10_i128.pow(decimals())` overflows at 39 and the product earlier, as an untyped trap.
- **I-04 — Membership events.** `update_member` emits `MemberAdded`, and the key is not in the event.
- **I-05 — Event hygiene.** `BadgesUpdated` has no project topic and only a count; add and remove COI share one event; with SDK 28 sparse events an unpinned `ContractUpdated` shows only as a missing field.
- **I-06 — `ProposalCreated`** omits whether the proposal carries an executable outcome.
- **I-07 — Tests mock all auths.** Only attestation tests assert who must authorize; removing a `require_auth` elsewhere would not fail the suite. The fixture never uses a single maintainer or a contract maintainer.
- **I-08 — `trigger` untested.** The manager's only test checks its constructor; the e2e scripts need WASMs this repo does not build.
- **I-09 — Stale comments.** `register` rustdoc mentions a domain contract and a 15-character limit; `revoke_attestation` rustdoc misstates when finality latches and who may revoke; the manager and e2e comments describe flows and collateral amounts the code does not have.
- **I-10 — Dead module.** `contract_migration.rs` is not compiled and would not compile if re-enabled. *Fix:* delete it.

## 10. Tests and CI

- 165 tests pass; attestation (60) and registration (32) are well covered.
- Priority tests to add: C-01 outcome targeting the collateral asset; H-01 oversized outcomes; H-02 oversized badge list; H-03 cap filling; M-01 cancellation by one admin; M-04 duplicate admins; M-06 threshold drop then attest; M-10 negative NQG score; every branch of `trigger`.
- CI runs build, tests, clippy and rustfmt; releases go through a pinned build workflow with provenance. Missing: a static-analysis gate, a Rust advisory scan, and building `tansu.wasm` before the manager.

After the fixes, 185 Tansu tests pass, with a regression test for each fixed finding (`test_executor.rs`, `test_inputs.rs` and the existing suites). CI builds `tansu.wasm` before the manager and pins its downloads and actions.

## 11. Readiness

Fix before an external audit: **C-01, H-01 to H-04, M-01, M-04, M-06, M-07**. Then the other Medium findings, most of which are one check each. The Low and Info items are cheap and remove the easy comments an auditor would otherwise open with.

**Status at the reviewed commit: not ready.** After the fixes, every finding on that list is fixed except H-04 (manager, out of this round) and M-01 (handled by a multisig admin account). The remaining open items are the manager findings, the documented trade-offs, and the Info items marked not changed.
