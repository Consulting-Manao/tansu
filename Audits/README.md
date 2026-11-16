# Audits: current state

Last updated: 2026-11-10 (contracts and worker round added). This page is the entry point: what has been assessed, what is open, where the reports are. Update it whenever an item is fixed or accepted, or a round is added.

## Where things stand

| | |
|---|---|
| Latest assessment | [2026-11-10 pre-audit](2026-11-10-pre-audit.md) (contracts v4 and the rewritten upload worker, before the worker is deployed) |
| Source assessed | git `27311af`, clean tree |
| Scope | The Soroban contracts (the three areas the contracts round left: attestation pruning, the manager's authorization chain, the getters; plus a Soroban checklist) and the whole IPFS upload worker. A partial pass |
| Result | No critical, high or medium. 1 low confirmed (H-1, known, now with a test that defeats its mitigation). 3 worker leads reproduced locally that each need one deployment fact (N-07, N-08, N-09). The worker's proof, the pruning and the manager's chain held |
| Previous contracts round | [2026-11-09 contracts pre-audit](2026-11-09-contracts-pre-audit.md) at `d3ce864` (same contract source as now): 1 medium and 1 low confirmed (F-07, F-08), both open, not re-verified since |
| Previous whole-repository round | [2026-11-09 pre-audit](2026-11-09-pre-audit.md) at `5c474a7`: 2 medium and 4 low confirmed, 6 leads that need a fact only the deployment shows. Fixed in code since: F-02 and F-06 in `140d9e9`; H-1 (partly) and H-2 in `302933a`. F-01 is accepted |

## Open items

Severity is the verified one. "Open" means no change in the code yet.

| ID | Severity | Area | What | Status |
|---|---|---|---|---|
| F-01 | Medium | Contract | `approve_upgrade` names no proposal: an admin's approval can move to a replacement upgrade | **Accepted, 2026-11-09:** the 24 h timelock lets another admin cancel. Depends on that timelock being in place |
| F-02 | Medium | dApp | User markdown inside `<pre>` keeps forbidden HTML (forms, meta refresh, base, styled overlays) | Fixed in `140d9e9` |
| F-07 | Medium | Contract | `registry-tansu-manager::trigger` reads every ballot through `get_proposal`: past about 383 ballots the transaction exceeds the footprint limit and a manager that is the only maintainer cannot clear the proposal (confirmed the lead N-04) | Open. Fix: a getter without ballots, redeploy the manager. Owner check: the live footprint limit |
| F-08 | Low | Contract | One maintainer can make any attestation target permanently final: shrink the maintainer list, attest, restore it | Open. Owner may accept it as a documented maintainer power |
| F-03 | Low | dApp | The execute dialog previews the outcome from ballots that still exist, not the persistent tally | Open |
| F-04 | Low | dApp | A proposal id that did not exist yet is cached as missing and hidden from the lists once created | Open |
| F-05 | Low | dApp | A non-string `description` or `xdr` in `outcomes.json` crashes the proposal page | Open |
| F-06 | Low | dApp | `<img>` written as a block crashes the proposal page | Fixed in `140d9e9` |
| N-01 | Lead | Worker | An upload proof costs the caller nothing (a throwaway key's never-submitted envelope is accepted), so anyone can use the Filebase and Pinata credentials | Mitigated in `c9cf2f0`, `a3bc8be`, `19614ca`, `0b8f922`, not deployed yet: the dApp now sends the transaction first and the worker pins only for a landed hash (the old envelope proof stayed until `app_prod` was current); a daily quota; the bucket is asked first. Envelope proof removed in `89403ce` (and the CID positions of three functions corrected in the commit after it) (`app_prod` is current), which also counts the address that authorized the call (a relayer's users no longer share one quota) and rate-limits an address to 30 uploads a minute (`RATE_LIMIT`). Not deployed yet: deploy the worker (a rate-limit namespace per environment is created by the deploy). Owner check: a Filebase bucket per environment, Filebase and Pinata quotas |
| N-02 | Lead | Worker | A 1 MB CAR of tiny blocks needs about 180 MiB of memory before the root is compared | Fixed in `89403ce`, not deployed yet: the body is read up to the cap, the CAR is decoded after the transaction checks, block by block with at most 2048 blocks and no per-block structure (a 10 MB CAR of 225,000 tiny blocks is refused in 41 ms, no extra memory; it took 645 ms and 579 MB before), and the cap is 10 MB on both networks |
| N-03 | Lead | Worker | Only the CAR header root is checked; blocks are not hashed or required. Unverified | Fixed in `89403ce`, not deployed yet: every block must hash (SHA-256) to its CID, every link must lead to a block in the file and every block must be linked from the root (`src/car.ts`) |
| N-04 | Lead | Contract | The registry manager's `trigger` reads every ballot: about 380 ballots or more may make a proposal impossible to run | Confirmed as F-07 by a test (2026-11-09 contracts round); the live limit is still the owner's check |
| N-07 | Lead | Worker | A stranger can spend another address's daily upload quota: the quota is charged to the address in the landed call, a replay is free only when the Filebase pin check answers "pinned", that check fails open, and a CAR may repeat blocks up to 10 MB (2026-11-10 round, reproduced with `pin/ls` answering 503) | Open. Fix: refuse a CAR with a repeated block; when the pin check does not answer, accept only a recently landed transaction. Owner check: how often `pin/ls` fails or throttles |
| N-08 | Lead | Worker | `GET /health` has no rate limit and shares no probe in flight (50 concurrent requests made 50 Filebase calls); one 429 from Filebase reads as "down" for 30 s and the dApp then signs no write with files | Open. Fix: share the pending probe, rate-limit the route, count a 429 as an answer. Owner check: Filebase rate limits |
| N-09 | Lead | Worker | Decoding a CAR under the 10 MB cap ran out of a 128 MB heap under Node (base64 decode before the length check), and one block with 262,000 links ran out of 256 MB; N-02's fix does not cover these two paths, and an honest 10 MB upload takes the first | Open. Fix: check the base64 length first, decode into one array, cap links. Owner check: one 10 MB upload under `wrangler dev` |
| N-05 | Lead | CI | The maintainer signing key and publishing credentials sit behind workflows any ref can start | Owner check: GitHub environments, secret scope, write access |
| N-06 | Lead | CI | A third-party action at `@main` runs in a job that can mint a GitHub OIDC token | Owner check: which services trust the OIDC identity |
| H-1 | Low | Contract | A maintainer of many cheap projects can fill any member's single record to the ledger entry limit (first noted as L-04 in the [2026-09-28 pre-audit](2026-09-28-pre-audit.md)) | Open. Mitigated in `302933a`, not closed: a member can remove a project from its own record, but re-adding costs the attacker one transaction. Confirmed by a test in the 2026-11-10 round and rated low there (510 projects, 2,550 XLM not returned; another project's badge for the member then fails, and the removal loses to the re-add). Structural fix: one entry per `(project, member)` |
| H-2 | Low | Contract | Every proposal id was permanent, so 9,000 proposals closed a project's governance | Fixed in `302933a`: the page cap is removed |

## Still to do

- Regenerate the bindings in `dapp/packages/tansu` with `make contract_bindings`: they carry the old `set_badges` and `get_dao` doc text (no signature changed).

## Assessments

One dated file per round, in this folder, newest first. Earlier rounds describe older code; their open items are not tracked above unless they appear there.

| Date | Report | Assessed | Findings (critical, high, medium, low, info) |
|---|---|---|---|
| 2026-11-10 | [Pre-audit](2026-11-10-pre-audit.md) | `contracts/` and the upload worker at `27311af` | 0, 0, 0, 1, 0; and 3 leads |
| 2026-11-09 | [Contracts pre-audit](2026-11-09-contracts-pre-audit.md) | `contracts/` at `d3ce864` (v4) | 0, 0, 1, 1, 0 |
| 2026-11-09 | [Pre-audit](2026-11-09-pre-audit.md) | The whole repository at `5c474a7` | 0, 0, 2, 4, 0; and 6 leads |
| 2026-09-28 | [Pre-audit](2026-09-28-pre-audit.md) | `tansu` 2.1.0, `tansu-executor` at `f48aca4` | 0, 0, 2, 11, 12 |
| 2026-09-26 | [Pre-audit](2026-09-26-pre-audit.md) | `tansu` 2.1.0, `registry-tansu-manager` at `bf6cf54` | 1, 4, 11, 21, 10; fixed in `f490db1` to `f8985ff` |
| 2026-07-20 | [Pre-audit](2026-07-20-pre-audit.md) | `tansu` 2.0.2, `scf-membership` 1.0.0 at `68ae3ec` | 0, 0, 2, 6, 5 |
| 2026-05-15 | [Pre-audit](2026-05-15-pre-audit.md) | `contracts/tansu` 2.0.0 (the first Soroban security assessment) | 0, 0, 1, 3, 3 |
