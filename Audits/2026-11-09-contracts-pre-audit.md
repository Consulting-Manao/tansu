# Tansu contracts pre-audit, November 2026 (v4)

| | |
|---|---|
| Date | 2026-11-09 |
| Source | git `d3ce864`, clean tree for `contracts/`: `contracts/tansu` (version 4), `contracts/tansu-executor`, `contracts/registry-tansu-manager`. Built to the production 24 h upgrade timelock (`TIMELOCK_DELAY` in `types.rs`) |
| Scope | The Soroban contracts only. The dApp, the upload worker, the events service, CI, deployed state, data migrations and the Stellar protocol are out of scope |
| Method | Two independent runs. A staged security review (reconnaissance, one hunting wave of four hunters, a coverage critic, a fresh verifier for each candidate) and a separate vulnerability hunt (four units, ideas reviewed, a passing test required, a second model as final reviewer). Tests ran offline in a sandbox on a frozen copy; the contract wasm was built from the same source |
| Coverage | **Partial.** One hunting wave per method. Three coverage gaps the critic found are listed at the end |

## Summary

No critical or high finding. **One medium and one low** are confirmed, each reproduced by a passing test and re-run by a second reviewer. The medium was reached independently by both methods. The veto, the new `set_badges` self-removal branch, the 1,000-vote cap with scalar seeds, ballot lapse and the upgrade flow were attacked and held.

The vulnerability hunt rated the medium critical; that is overstated. Its own trace shows `execute` and the dApp are not affected, and the effect is limited to projects whose proposals the registry manager runs.

## Findings

| ID | Severity | Area | Finding | Status |
|---|---|---|---|---|
| F-07 | Medium | Contract, registry manager | `trigger` reads every ballot through `get_proposal`: past about 383 ballots the transaction exceeds the footprint limit, and a manager that is the only maintainer cannot clear the proposal | Open |
| F-08 | Low | Contract | One maintainer can make any attestation target permanently final by shrinking the maintainer list, attesting and restoring it | Open |

### F-07 (Medium): `trigger` cannot run a proposal with about 384 ballots

`Tansu.get_proposal` fills `vote_data.votes` with one temporary-entry read per voter (`contract_dao.rs:1167`, `get_all_votes` at `:1436`), up to the 1,000-voter cap. `registry-tansu-manager::trigger` (`lib.rs:104`) calls it only to read the outcome contract, in the same transaction as `Tansu.execute`. The footprint is the ballots plus about 17 other entries, which passes the 400-entry limit of the SDK's mainnet snapshot at 384 voters. A test with the real Tansu wasm: `trigger` succeeds at 380 and 383 ballots and fails at 384 with "total footprint ledger entries: 401 > 400" (the hunter's run also reached 390, 450 and 499).

Any funded address votes with weight 1 (up to 500 such votes per proposal), so an outsider who sees a registry proposal pass can add about 384 votes, at the cost of fees and ballot rent. Genuine turnout of that size has the same effect. In the documented set-up the manager is the project's only maintainer and has no function to remove a vote, veto, revoke or change maintainers, so only a Tansu admin's `revoke_proposal` clears the proposal, and it forfeits the deposit. `Tansu.execute` itself reads the persistent tally, not the ballots, so a human maintainer calling it directly is unaffected, and so is the dApp.

**Conditions the source cannot settle:** the live per-transaction footprint limit (400 in the SDK snapshot) and which projects have the manager as their only maintainer.
**Fix:** stop the transactional path from reading ballots. Add a Tansu getter that returns a proposal or only its `outcome_contracts` without ballots (stored proposals have an empty votes list), or have the manager read the proposal from `get_dao`, then redeploy the manager and add a regression test that triggers a proposal with 500 weight-1 ballots. Lowering `MAX_DEFAULT_WEIGHT_VOTES` alone, which the vulnerability hunt suggested, does not close it: badge holders and token voters still reach 384 ballots. `docs/operations.md` should also say that `get_proposal` and `proof` are not usable inside a transaction past about 380 ballots.

### F-08 (Low): attestation finality can be latched by one maintainer

The code comment on `set_attestation_threshold` says a loosening waits out a notice window, so that a maintainer cannot drop the bar and finalize targets alone. The other input of the same inequality, the maintainer list used as the denominator, is replaced at once by any single maintainer through `update_config` (`contract_versioning.rs:240`, stored at `:268`). `attest` (`:763`) calls `mark_finalized` (`:1033`), which writes `AttestationFinalized` the first time a target reads as final, and nothing removes it. One maintainer shrinks the list to itself, attests an arbitrary valid commit hash or evidence target (1 of 1), and restores the list. The target then stays final with 1 of 3 attested at the default 66 % threshold, `revoke_attestation` is refused for everyone (`:900`), and it survives the later removal of that maintainer. The test, with only the attacker's authorization mocked, gave `attested=1 total=3 is_final=true finalized_at=Some(10000)`. Replacing the list with the attacker's own addresses has the same effect (read from source, not run).

Impact is limited: it needs a rogue or compromised maintainer, who already holds broad documented powers, and no funds or votes are affected. It matters because consumers read `get_attestation_finality` as a maintainer quorum, and `docs/operations.md` documents the list replacement but not this composition. You may reasonably accept it as a documented maintainer power.
**Fix:** queue the removal or replacement of maintainers behind the same notice window as the threshold (min voting period plus execute delay), with a regression test in which one maintainer shrinks the list, attests and restores, and the target is not final. Changing only the latch (the largest maintainer count seen, or the list at the first attestation) stops the shrink variant but not the replacement variant. Documenting that finality assumes a trusted maintainer set is the alternative.

## What was attacked and held

- **Veto (new):** it needs a project maintainer and status `Active`; it, `execute` and `revoke_proposal` each leave `Active` or delete the proposal in the same call, so the deposit cannot be repaid twice; a veto and a revoke cannot both exist; the outcome call runs after the status write, so it cannot repeat the refund. Veto after the delay but before `execute` is allowed by the code (the doc comment says "during the vote and the execute delay") and is a documented maintainer power.
- **Page cap removed:** nine proposals of about 60 KB each read in one `get_dao` page cost 683 k instructions and 602 KB of memory.
- **`set_badges` self-removal (new):** it needs `maintainer == member`, an empty list and the member's own authorization; it cannot add badges, touch another member or leave `Member.projects` and `Badges` apart; weights are read at call time, so removing a badge changes no open proposal, attestation or voter. A member record filled to the 64 KiB limit (about 500 projects) still lets the member remove entries (9.1 to 9.6 M instructions).
- **Votes:** the 1,000-voter and 500 weight-1 caps hold and `remove_vote` undoes exactly what `vote` recorded; ballot lifetime stays inside the TTL cap; at 1,000 voters a vote costs 5.4 M instructions (public) and 17.9 M (anonymous), about 41 KB of writes; commitments are subgroup-checked, seeds are reduced by the host and the aggregate opening is unique below 2^128.
- **Membership:** the git binding signs address, key and identity in fixed-length order with the correct SSHSIG prefix and cannot be replayed without the member's authorization; an NQG failure reads as weight 0, never as high weight.
- **Admin and executor:** `set_executor` is a single-admin power as documented, and the executor cannot use Tansu's authority; the manager authorizes only outcome 0 and requires a single outcome, so a rejected or cancelled result runs nothing.
- The vulnerability hunt rejected 17 ideas at review, among them token-weight reuse (documented), the case-sensitivity of project names, `attest` on a target that was never recorded, and an upgrade to an unchecked wasm hash (an admin power behind the timelock).

## Hardening notes

Not findings; each is a code change you can take or leave.

- `register` accepts a `min_voting_period` and `execute_delay` of 1 second, which makes the notice window effectively zero for that project. If the F-08 fix reuses the window for maintainer changes, a floor above 1 second matters.
- `attest` reads `get_max_weight` only to store a weight nothing uses, so a pinned NQG hash that no longer matches makes `attest` panic for the whole project. Reading it with a fallback of 0 removes the dependency.
- The manager has no veto, revoke or tally path: an approved proposal whose outcome fails, or an anonymous proposal, can be closed only by an admin. The executor's address should be barred as a maintainer, because anyone can call `executor.run`.
- `refund_collateral` panics on a transfer failure, so a proposer whose classic account no longer exists keeps their own proposal from being executed or vetoed (`revoke_proposal` still closes it). Forfeited deposits and the registration collateral share one balance with no accounting.
- An unvoted proposal resolves to `Cancelled` and runs its slot-2 outcome: maintainers should veto unreviewed proposals. This matters for the permissionless manager.
- `tallies_to_result` adds `u128` values an anonymous opening can make huge, so a ballot encoding a large value reverts `execute` until the maintainers remove it; a checked add turns it into a clean error. A single maintainer can replace the anonymous public key during a vote.
- `create_proposal` does not bound outcome arguments, so nine large proposals can make one `get_dao` page too large to read until they are revoked.
- `set_executor` and the constructor accept an address that is not a contract; `propose_upgrade` accepts an unbounded admin list.
- A git binding cannot be cleared once set (an all-`None` update keeps it), carries no chain or contract identifier, and `BadgesUpdated` names the member as `maintainer` on the self-removal branch.
- Unbounded: `meta`, the anonymous public key, the conflict-of-interest list, the per-badge address lists and `Member.projects`. `LEDGER_SECONDS = 5` ties the ballot grace to the ledger close time.

## Not covered

The security review ran one wave, so three gaps the critic found were not examined:

- **Attestation pruning:** at the 25-attestation cap `attest` drops the attestations of former maintainers, a second way to remove a vouch that does not follow the rules binding `revoke_attestation` (`contract_versioning.rs:827`). Its interaction with F-08 was not checked.
- **The manager's full authorization chain:** manager, Tansu, executor, outcome. Only outcome 0 and a single outcome were checked; the authorized call was not compared field by field with the dispatched one, and the host's handling of the nested authorization was not tested.
- **`get_projects` and the read-only getters** no unit listed, including the unbounded conflict-of-interest list read inside `vote`.

Also: `approve_upgrade` is not bound to a proposal (accepted earlier on the strength of the 24 h timelock; not re-verified), and a maintainer filling a member's record is a known limit, mitigated by self-removal. One final review in the vulnerability hunt returned no verdict (the model timed out); it concerned the same issue as F-07. Anything that depends on the live network (footprint limit, deployed admin set, executor address, a testnet build with a zero timelock) is the owner's check.

## Method and limits

Reviewers worked on a frozen copy of the source and ran tests only inside an offline sandbox (no network, writes only to their own scratch). Local results come from the Rust test environment and the SDK's mainnet-limit snapshot, so they are lower bounds for the live network. The tests behind each item are kept with the run, not in this repository.
