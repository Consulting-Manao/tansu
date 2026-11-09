# Audits: current state

Last updated: 2026-11-09. This page is the entry point: what has been assessed, what is open, where the reports are. Update it whenever an item is fixed or accepted, or a round is added.

## Where things stand

| | |
|---|---|
| Latest assessment | [2026-11-09 internal audit](2026-11-09-internal-audit.md) |
| Source assessed | git `5c474a7` plus two contract fixes that were uncommitted at the time |
| Scope | The whole repository: contracts, IPFS upload worker, dApp, events service, release tools, CI. A partial pass: eight areas were not examined |
| Result | No critical or high. 2 medium and 4 low confirmed, 6 leads that need a fact only the deployment shows |
| Fixed in code since | F-02 and F-06 in `140d9e9`; H-1 (partly) and H-2 in `302933a`. F-01 is accepted |

## Open items

Severity is the verified one. "Open" means no change in the code yet.

| ID | Severity | Area | What | Status |
|---|---|---|---|---|
| F-01 | Medium | Contract | `approve_upgrade` names no proposal: an admin's approval can move to a replacement upgrade | **Accepted, 2026-11-09:** the 24 h timelock lets another admin cancel. Depends on that timelock being in place |
| F-02 | Medium | dApp | User markdown inside `<pre>` keeps forbidden HTML (forms, meta refresh, base, styled overlays) | Fixed in `140d9e9` |
| F-03 | Low | dApp | The execute dialog previews the outcome from ballots that still exist, not the persistent tally | Open |
| F-04 | Low | dApp | A proposal id that did not exist yet is cached as missing and hidden from the lists once created | Open |
| F-05 | Low | dApp | A non-string `description` or `xdr` in `outcomes.json` crashes the proposal page | Open |
| F-06 | Low | dApp | `<img>` written as a block crashes the proposal page | Fixed in `140d9e9` |
| N-01 | Lead | Worker | An upload proof costs the caller nothing (a throwaway key's never-submitted envelope is accepted), so anyone can use the Filebase and Pinata credentials | Mitigated in `6b99457`, `314b5bd`, `13a8c00`, `0816a31`, not deployed yet: the dApp now sends the transaction first and the worker pins only for a landed hash (the old envelope proof stays, simulated and counted, until `app_prod` is current); a daily quota per source account; the bucket is asked first. Owner check: Cloudflare rate rules, a Filebase bucket per environment, Filebase and Pinata quotas |
| N-02 | Lead | Worker | A 1 MB CAR of tiny blocks needs about 180 MiB of memory before the root is compared | Owner check: isolate limit. Re-check against the new worker |
| N-03 | Lead | Worker | Only the CAR header root is checked; blocks are not hashed or required. Unverified | Owner check: Filebase and Pinata behaviour |
| N-04 | Lead | Contract | The registry manager's `trigger` reads every ballot: about 380 ballots or more may make a proposal impossible to run | Owner check: live ledger-entry limit, which projects a manager runs |
| N-05 | Lead | CI | The maintainer signing key and publishing credentials sit behind workflows any ref can start | Owner check: GitHub environments, secret scope, write access |
| N-06 | Lead | CI | A third-party action at `@main` runs in a job that can mint a GitHub OIDC token | Owner check: which services trust the OIDC identity |
| H-1 | Medium | Contract | A maintainer of many cheap projects can fill any member's single record to the ledger entry limit (first noted as L-04 in the [2026-09-28 pre-audit](2026-09-28-pre-audit.md)) | Mitigated in `302933a`, not closed: a member can remove a project from its own record, but re-adding costs the attacker one transaction. Structural fix: one entry per `(project, member)` |
| H-2 | Low | Contract | Every proposal id was permanent, so 9,000 proposals closed a project's governance | Fixed in `302933a`: the page cap is removed |

## Still to do

- Regenerate the bindings in `dapp/packages/tansu` with `make contract_bindings`: they carry the old `set_badges` and `get_dao` doc text (no signature changed).

## Assessments

One dated file per round, in this folder, newest first. Earlier rounds describe older code; their open items are not tracked above unless they appear there.

| Date | Report | Assessed | Findings (critical, high, medium, low, info) |
|---|---|---|---|
| 2026-11-09 | [Internal audit](2026-11-09-internal-audit.md) | The whole repository at `5c474a7` | 0, 0, 2, 4, 0; and 6 leads |
| 2026-09-28 | [Pre-audit](2026-09-28-pre-audit.md) | `tansu` 2.1.0, `tansu-executor` at `f48aca4` | 0, 0, 2, 11, 12 |
| 2026-09-26 | [Pre-audit](2026-09-26-pre-audit.md) | `tansu` 2.1.0, `registry-tansu-manager` at `bf6cf54` | 1, 4, 11, 21, 10; fixed in `f490db1` to `f8985ff` |
| 2026-07-20 | [Pre-audit](2026-07-20-pre-audit.md) | `tansu` 2.0.2, `scf-membership` 1.0.0 at `68ae3ec` | 0, 0, 2, 6, 5 |
| 2026-05 | [Soroban security assessment](2026-05-soroban-security-assessment.md) | `contracts/tansu` 2.0.0 | 0, 0, 1, 3, 3 |
