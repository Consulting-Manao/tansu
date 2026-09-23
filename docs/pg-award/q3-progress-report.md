# Q3 progress report — SCF Public Goods Maintenance

Internal status against the four proposed deliverables of the [Tansu entry](https://scf-public-goods-maintenance.github.io/projects/tansu-decentralized-project-governance-on-stellar/)
in the SCF Public Goods Maintenance working group. Scope is D1–D4 only; the
retroactive deliverables P1–P5 are already accepted and are not revisited here.

Date: 2026-09-23 · Tree: `main` · Contract crate `tansu` 2.1.0 on `soroban-sdk 28.0.0-rc.1`

## Summary

Two results carry the quarter. The **Q3 Public Goods Award round ran on Tansu**
and went through without incident, which was the headline measure of D1. And the
**membership stack was rebuilt from scratch as a standalone project**,
[`stellar-membership`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:z4KRDyBiL6kP6n5FWP6kJWga6BXJV)
on Radicle — by a wide margin the largest single undertaking of the quarter and
the foundation the program will sit on going forward.

Tansu also picked up its **second real consumer**: the Stellar Registry governs
its root registry through a Tansu-DAO-gated manager contract, and their own UI
now composes Tansu proposals directly. That closes D2's measure and, more
importantly, produced the first outside feedback on the governance API.

On the feature side, D3 landed all its items but one: evidence is fully usable
from the dApp, commit endorsement shipped as a complete attest/revoke/finality
system, the discussions loop is closed end to end, and the collateral question
was settled by relying on NQG weight rather than reworking deposits. Dependency
currency and the Radicle migration (D4) are done, and the documentation was
brought back in line with the contract.

Two D4 items are deliberately dropped rather than late, and the Nouns item is
postponed on their side. The remaining real gap is closing the findings of the refreshed pre-audit,
one of them High.

| Verdict   | Count |
| --------- | ----- |
| Done      | 13    |
| Partial   | 5     |
| Descoped  | 2     |
| Postponed | 1     |
| Ongoing   | 1     |

## D1 — Public Goods Award

| Item                    | Verdict                                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q3 round on Tansu       | **Done**                                                | Round ran at [`testnet.tansu.dev/governance/?name=stellarpgq3`](https://testnet.tansu.dev/governance/?name=stellarpgq3); intake, discussion, on-chain vote and execution all completed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Program NQG score       | **Partial** — gated on SDF                              | `contract_membership.rs` `get_max_weight`, `set_nqg_contract` in `contract_tansu.rs`, `DataKey::NqgProjectKey` in `types.rs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| SCF NFT / Neurons       | **Partial** — contract and app rebuilt, sync still open | `stellar-membership` on Radicle; extraction commits [`07b55bd`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/07b55bda37b2f5408fa52d69113b98285b370f5c), [`f1631dc`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/f1631dcae8ed7a1978d58bd5fc06efa687ec861e), [`cb79dd6`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/cb79dd6b5ab3ab24658abe7cc1989d76372ec1b3), [`453f673`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/453f673a6b90314b8f60ad6adaaa2fdfc93913b5) |
| Mid-grant reviews       | **Done**                                                | Process worked out with the WG; AI assistance for the repetitive review work being added                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Nouns Builder alignment | **Postponed**                                           | Conditional item; calls held with the team                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Q3 round.** The same testnet stack as Q2 carried the Q3 program. Nothing broke
during voting, which is the point worth making: Q2 surfaced computational-cost
problems in the anonymous setup and a collateral issue mid-vote, and neither
recurred.

**The membership rebuild.** This is where most of the quarter went. The
membership contract was pulled out of this repository and rewritten as its own
project, developed on Radicle only — no GitHub remote at all, which is also the
strongest evidence for the D4 Radicle item. What it is now:

- a Soroban soulbound identity contract — one token per person, the token id
  _is_ the identity; on-chain record holds the role, verified Discord and GitHub
  ids and handles, the sha256 of a verified email (the same hash PG Atlas uses),
  a profile CID and DAOIP-5 project ids;
- a Hono API on Cloudflare Workers with an attester hot key that co-signs mint,
  account changes and recovery proposals;
- a rebuilt React dApp (TanStack Router and Query, Tailwind, Stellar Wallets
  Kit) with Discord and GitHub OAuth onboarding, profile management and key
  rotation;
- recovery by proving two of a member's accounts from a new address, with a
  7-day delay cancellable by the owner or an operator;
- an operator and admin surface: roles, projects, revocation, moving a
  membership, the operator set, pause and upgrade.

Roughly 30k lines across `contracts/`, `dapp/`, `worker/` and `shared/`, 61
commits in September alone, deployed on testnet, with its own audit pass whose
three accepted findings are written up under "Known limits" in the repository.

What remains on this item is the sync workflow against the source of truth and
the Neurons work — both need SDF on the other side, as does the PG-Award-specific
program scoring. Tansu's side of the NQG integration is in place: it reads a
per-member score from an external contract for one admin-configured project key,
scaled by 10^12 with a floor.

**Mid-grant reviews.** The grant review process was discussed and worked on
with the working group this quarter. Most of that work is not public: it
happened in WG calls rather than in a repository. The result is an AI layer
that takes over the repetitive parts of the review work, so reviewers keep
their time for judgement. That layer is being added now, and it is how the
process is run and shown complete.

## D2 — Stellar Registry

| Item                                   | Verdict                                | Evidence                                                                                                                                                                                                                              |
| -------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registry-tansu-manager`               | **Done**                               | [stellar-registry/contracts#5](https://github.com/stellar-registry/contracts/pull/5), merged 2026-06-08; verified live end to end on testnet                                                                                          |
| Proposals created from the Registry UI | **Done**                               | [stellar-registry/ui#67](https://github.com/stellar-registry/ui/pull/67) and [#68](https://github.com/stellar-registry/ui/pull/68), merged September 2026                                                                             |
| Proposal and outcome templates         | **Partial**                            | `dapp/src/constants/outcomeTemplates.ts` (2), `proposalTemplates.ts` (6); largely superseded by the Registry's own forms                                                                                                              |
| Registry name to address               | **Done at creation**, not at execution | `dapp/src/service/StellarRegistryService.ts`, wired in `OutcomeInput.tsx` ([`85e7a6b`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/85e7a6baba813a3cdb1287cea3726164329d4901)) |
| Contract lifecycle documentation       | **Done**                               | Tansu side: `website/docs/developers/governance.mdx` "Acting on other contracts"; Registry side: [stellarscaffold.org/docs/registry](https://stellarscaffold.org/docs/registry)                                                       |

**The measure is met.** The Tansu-DAO-gated registry manager merged in the
Registry's own repository and was verified live on testnet end to end: proposal →
vote → `trigger` → publish, with replay-guard rejection confirmed. `trigger(proposal_id)`
reads `Tansu.get_proposal`, requires exactly one outcome, pre-authorizes the
`(contract, fn, args)` triple via `authorize_as_current_contract`, then calls
`Tansu.execute` — so an approved DAO proposal executes a `registry.publish_hash`
or `registry.deploy` in a single transaction.

**The Registry UI now composes Tansu proposals directly.** This is the part that
matters most and it went further than the deliverable asked. From
[rgstry.xyz](https://stellar.rgstry.xyz), the governance forms build the on-chain
outcome from the registry contract's own spec, write `proposal.md` and
`outcomes.json`, pack them into an IPFS CAR, pin them through a same-origin
route, and sign and submit `create_proposal` with the connected wallet. They
generate and vendor TS bindings for both `tansu-client` and
`registry-manager-client` alongside their own registry client. "Add contract to
root registry" is merged; "add a wasm" is in review
([ui#71](https://github.com/stellar-registry/ui/pull/71)); subregistry creation
and owner changes follow. Mainnet routes to an issue in `stellar-registry/gov`
until the mainnet path is ready.

The practical consequence for us: Tansu is no longer only driven by its own dApp.
Another team builds proposals against the contract API from the outside, which is
the first real test of that API as a public interface.

**Their feedback, which we should act on.** The Registry team's own quarterly
page describes harnessing Tansu for governance as requiring "significant effort
and an unsatisfying technical workaround", and asks to collaborate on either
obsolescing the manager-contract pattern or turning it into something
first-class. The workaround exists because a Tansu proposal cannot itself carry
the authorization to act on a third-party contract — hence a per-consumer gated
manager. That is a direct input into the D3 outcome-flow rethink and should be
treated as the highest-value governance work for Q4.

**What is still ours to do.** The in-tree copy at
`contracts/registry-tansu-manager/` ([`841dd84`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/841dd84790f3b8f2c8ae4fbf65ca10d5a9adab69), v0.1.1) has coverage only on its
constructor, is not in `contract-release.yml`, has no Makefile target and is not
deployed — the deployed one is the Registry's. Our `interact-stellar-registry`
outcome template still hardcodes a wasm hash at version `0.1.0` and has drifted;
with the Registry's own forms in place it may be better retired than fixed. The
manager pattern also needs a guard: the audit (F-02) shows the manager will
sign any target an approved proposal names, not only its registry. That is a
one-line check, and it belongs in both copies of the contract.

The lifecycle is now documented from Tansu's side: the governance docs explain
when an outcome can call a contract directly and when it needs the manager
pattern, walk through propose → vote → `trigger` → execute, and point to the
Registry as the reference integration. The Registry documents publishing,
deploying and versioning on its side.

## D3 — Governance features

| Item                     | Verdict                               | Evidence                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence in dApp         | **Done**                              | `CommitEvidenceModal.tsx`, `EvidenceService.ts`, `EvidenceUploadFlow.ts` ([`c21688c`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/c21688cd3bbcaabd7974c4067583fb627dffce8f))                                                                                                                                          |
| Endorsement of a commit  | **Done**                              | `attest` / `revoke_attestation` / finality in `contract_versioning.rs`, `AttestationCard.tsx` ([`6c47a83`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/6c47a833f591a6ae37affcc495933065b2e48da4))                                                                                                                     |
| Discussions              | **Done**                              | `DiscussionSection.tsx` + `ProposalService.resolveDiscussionCid` ([`844f8c1`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/844f8c19de4ceda4695ded88cac858b22de4a325)), fed by the PG Award workflow                                                                                                                    |
| Governance configuration | **Partial**                           | Per-project overrides on-chain ([`2f97539`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/2f97539ab7fb2a2ee46573906495d82b4267131f), [`4ee9d62`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/4ee9d627fc6bf6411363248ba6b73c1f391bb890)); UI exposes one of them |
| Collateral rework        | **Done** — resolved by relying on NQG | Voting collateral removed ([`526395e`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/526395e941a6e1ec3f573f66446952d9eb05c4f7)); rationale in `website/docs/developers/governance.mdx` "Spam and Sybil resistance"                                                                                                      |

**Evidence.** Complete vertical slice. The "Code Finality" modal groups SBOM,
CVE and attestation records by kind, fetches the full append-only history per
kind and lets maintainers upload new evidence; the upload flow packs the file to
a CAR, simulates `set_evidence`, signs, uploads to IPFS and submits, with a hard
CID-mismatch check before the transaction goes out. CI records CIDs on-chain on
tags (`.github/workflows/sbom.yml`), the producer script lives in
`tools/evidence/`, and it is documented at `website/docs/developers/evidence.mdx`.
Each evidence entry is itself attestable.

**Endorsement.** Shipped as a full attestation system rather than a single
endorse call: `AttestationTarget` covers both a commit and an evidence artifact,
attestations carry weight and a note, there is a 24-hour revocation window, and
finality latches once the share of current maintainers who attested crosses a
per-project threshold (default 66%, floor 50%). Each attestation records the
attester's weight, but finality counts maintainers, not weight. The latch has a
gap (audit F-04): it is only written by `attest`, so maintainer changes or a
lowered threshold can make a target read as final without latching. Rust tests and dApp surfaces on latest commit, commit
history and evidence.

**Discussions — the loop is closed.** Both halves shipped this quarter. On our
side, the dApp renders a sanitized markdown thread and summary resolved from
IPFS, defaulting to the proposal's own immutable directory. On the producer
side, the Public Goods repository's `pg-award-proposal-onchain.yml` workflow was
upgraded to build `proposal_discussion.md` and `summary.md` from the GitHub
proposal thread and upload them to IPFS together with `proposal.md` and
`outcomes.json` when the proposal PR merges. So a PG Award proposal's GitHub
discussion travels with it on-chain and is read back on the Tansu proposal page
without anyone copying anything by hand. Worth noting the shape this settled on:
the integration is a workflow in the consuming repository writing to a known IPFS
layout, not Tansu calling the GitHub API — which keeps the dApp backend-free and
works the same for any forge.

**Governance configuration.** The contract side moved further than the deliverable
implies: `MinVotingPeriod`, `ExecuteDelay`, `ProposalExecuteDelay` and
`AttestationFinalityThreshold` are per-project, and loosening a governance
parameter waits out a notice window via `PendingGovernance` while tightening
applies immediately. The gap is the surface: `UpdateConfigModal.tsx` exposes only
the finality threshold, and the voting-period and delay overrides are reachable
only through `FlowService`; the proposal form also enforces its own 25-hour
minimum regardless of the project's setting. Membership policy is still global,
and the weight mode is a per-proposal `token_contract` argument rather than
per-project configuration. The per-project settings are now documented,
including the notice window. The outcome-flow half of this item now has a
concrete driver — see the Registry feedback under D2.

**Collateral — settled by design, not by a new mechanism.** Q2 showed that
locking collateral per ballot was the wrong lever: it made voting costly
without adding protection. The Merkle-based rework was
meant to make that lock cheaper; the better answer was to drop it. Voter
collateral was removed ([`526395e`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/526395e941a6e1ec3f573f66446952d9eb05c4f7)), and vote integrity now rests on weight: on
the Public Goods project a vote counts for the voter's NQG score, a fresh
address has none, and scores under the threshold count as zero. Reputation,
not capital, decides who is heard, so spinning up addresses buys nothing. The
same holds for badges, which maintainers grant to specific addresses. It does
not hold for token-weighted proposals, where balances are not locked (audit
F-01); the docs now say token results are advisory.

Deposits stay only where something is created: 5 XLM to register a project (the
price of a unique name, not returned) and 5 XLM to create a proposal (returned
on execution, forfeited if revoked as spam). The model is documented in the
governance docs under "Spam and Sybil resistance".

## D4 — Maintenance, Security and Operations

| Item                           | Verdict                                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependencies current           | **Done**                                     | `soroban-sdk 28.0.0-rc.1`, `@stellar/stellar-sdk ^17.0.1`, `.github/dependabot.yml` across 4 ecosystems ([`30984c2`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/30984c2828ddddc3031c12c23102e22bbd30070b))                                                                                                                                                                                                                                                                           |
| Radicle                        | **Done**                                     | `rad` remote, `.radicle/` CI and release scripts, merged patch [`f737729`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/f73772921405f7dd8769c8964ffb1659bdbc9384), provider support [`e75becc`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/e75becc560c0a05c92d06baac61688d12051bf3d), `stellar-membership` Radicle-only                                                                                                       |
| Drips Wave                     | **Ongoing**                                  | 12 `Stellar Wave` issues closed this quarter, 47 in total, see below                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Audit-bank prep                | **Partial** — refreshed, not yet audit-ready | `Audits/tansu-pre-audit-2026-09-23.md`, `docs/operations.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Nido wallet / passkey accounts | **Done**                                     | [`c66c39c`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/c66c39c5c1f231470371f7c373cdffdd7fbd02bd), [`5c21a20`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/5c21a20a8223cb84eca2a78108b4435d3689d43a), [`95d3741`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/95d374155fba765fc79fb6fccf71ba68b084d7c7): Nido and GHOSTSIG in the wallet picker, Nido on testnet only |
| Result types                   | **Descoped**                                 | See below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Storage / TTL                  | **Descoped**                                 | See below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Audit-bank prep.** The material was refreshed this week. A new pre-audit
covers `contracts/tansu` and `contracts/registry-tansu-manager` at [`fc4c010`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/fc4c010b6dd84b1e7949b266d4a8e6affb7709bb) on
`soroban-sdk 28.0.0-rc.1`, reconciles every July finding (the membership ones
moved out with the crate), and has an entry-point map, invariants and
reproduced findings. An operations runbook now exists alongside it: roles,
build verification, TTL management, admin and per-project operations, upgrade
and pause, monitoring, and incident response.

The verdict is honest and it is **not yet audit-ready**: 0 Critical, 1 High,
5 Medium, 8 Low, 8 Info. The ones that matter:

- **F-01 (High).** Token-weighted votes are not escrowed, so one balance can be
  moved and voted again from new addresses (reproduced: 100 tokens counted as
  500).
- **F-02.** The registry manager signs whatever an approved proposal names; it
  does not check that the target is its registry.
- **F-04.** Attestation finality only latches through `attest`, so maintainer
  changes or a lowered threshold can make targets read as final without it.
- **F-05.** Anonymous ballots are not proven well-formed (carried from July).
- **F-07.** An outcome that keeps failing leaves an approved proposal stuck and
  its deposit locked.

The audit calls F-01 to F-04 cheap to fix. Closing or formally accepting them is
what stands between this and an audit-bank application.

**Nido and GHOSTSIG.** Both passkey wallets are supported: there is no extension
to install, and the passkey is asked at each signature. A Nido account
is a passkey smart account (`C...`) whose wallet submits through Nido's own
relayer, so the dApp builds its transactions from a placeholder source, waits on
the hash the wallet returns, and uploads to IPFS once the transaction has
landed; the IPFS worker accepts that hash as proof. No contract change was
needed beyond requesting legacy address credentials in the bindings, so that
Nido can parse the authorization ([`95d3741`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/95d374155fba765fc79fb6fccf71ba68b084d7c7)). GHOSTSIG gives regular accounts
(`G...`) and works with the usual flow. A smart account covers the whole dApp
except donations, which are classic XLM payments. One open question is fees: the relayer's default cap is 0.1 XLM, and
votes already cost up to 0.067 XLM on testnet, growing with the proposal page,
so votes on busy pages may be refused. Worth noting the dependency shape: Nido
is built by the same studio as the Registry, so this is coordination rather
than cold integration work.

**Drips Wave.** Tansu kept taking part in the Stellar Waves on Drips this
quarter. Wave issues are tracked on the GitHub mirror, where Drips contributors
work. Twelve
`Stellar Wave` issues were closed since July, 47 in total. Several of them
delivered items of this report, for instance:

- [#15](https://github.com/Consulting-Manao/tansu/issues/15), [#26](https://github.com/Consulting-Manao/tansu/issues/26) and [#25](https://github.com/Consulting-Manao/tansu/issues/25): store SBOMs, CVE scans and
  release attestations as commit evidence (D3),
- [#215](https://github.com/Consulting-Manao/tansu/issues/215): discussions on proposals (D3),
- [#230](https://github.com/Consulting-Manao/tansu/issues/230) and [#232](https://github.com/Consulting-Manao/tansu/issues/232): outcome templates and contract name
  resolution through the Stellar Registry (D2),
- [#16](https://github.com/Consulting-Manao/tansu/issues/16): Git identity binding at member registration,
- [#85](https://github.com/Consulting-Manao/tansu/issues/85): marking and hiding malicious proposals,
- [#196](https://github.com/Consulting-Manao/tansu/issues/196): on-chain validation of CIDs and commit hashes,
- [#229](https://github.com/Consulting-Manao/tansu/issues/229): a downloadable voting receipt.

### Documentation refresh

Not a listed deliverable, but it underpins several measures. The website docs
had drifted from the contract and were checked page by page against the code:

- **Wrong facts corrected.** Voters were told they "must pay the required
  collateral deposit" (removed in [`526395e`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/526395e941a6e1ec3f573f66446952d9eb05c4f7)); project names were documented as
  15 lowercase characters (the rule is 4–30 letters and digits); registration
  collateral was described as forfeitable through governance (no such mechanism
  exists — it is simply not returned); proposals were said to be
  maintainer-only (any address can create one on-chain); the minimum title was
  given as 10 characters (it is 5); commit hashes as 40 characters only (64 for
  SHA-256 repositories is accepted); and the anonymous tally check was called a
  zero-knowledge proof (it opens an aggregate commitment).
- **Missing features documented.** A new Code Finality page (attestations,
  thresholds, latching, revocation), per-project governance settings and their
  notice window, conflict-of-interest lists, vote removal and proposal
  revocation, Git identity binding, the manager pattern for acting on other
  contracts, and the discussion producer path.
- **Collateral model rewritten** around NQG weight, see D3.
- **Audit findings surfaced.** The docs now state the open issues users and
  integrators need to know, with their mitigations: token-weighted voting is
  not Sybil-resistant (F-01), a manager contract must scope its authority
  (F-02), how finality can read as final without latching (F-04), malformed
  anonymous ballots (F-05), and failing outcomes (F-07).
- **Repository docs.** `README.md` and `AGENTS.md` (Storacha references, Astro
  version) brought up to date.

The site builds cleanly with no broken links or anchors.

## Descoped and postponed

**Result types across contract, SDK and dApp — descoped.** The contract uses
`panic_with_error!` throughout against a well-banded `ContractErrors` enum, and
the dApp already maps those codes with a lint gate keeping the mapping in sync.
Converting to `Result` returns would touch every entry point and every binding
for no behavioural gain and no user-visible improvement. Not doing it.

**Storage / TTL — descoped.** The contract deliberately does not extend TTL for
persistent entries; callers pay Soroban auto-restore costs. This is an accepted
design choice and it is already recorded in the audit documents; the new
runbook's "State and TTL management" section gives operators the practical
side. There is nothing left that justifies carrying it as a deliverable.

**Nouns Builder NQG alignment — postponed.** This was conditional on their grant
from the start. We held calls with the Nouns team to work through the topic and
support them, but they are not ready for the alignment work, so it moves out of
this round.

## At risk

1. **D1 items gated on SDF.** Program-level NQG scoring and the NFT/Neurons sync
   cannot be completed unilaterally. Our side is in place; the dependency should
   be stated explicitly rather than reported as slippage.
2. **Open audit findings.** The refreshed pre-audit says not yet audit-ready.
   F-01 matters beyond the audit: token-weighted votes can be multiplied, so
   token mode must stay advisory until escrow or snapshots land. NQG and badge
   weight, which the collateral decision relies on, are not affected.
3. **Mid-grant reviews: evidence.** The process work is real but mostly
   non-public, and the AI layer is still landing. Reviewers will ask for
   something to look at; the AI layer running on actual reviews is that proof.
4. **Governance API ergonomics.** The Registry shipped on Tansu but called the
   integration an unsatisfying workaround. Left alone, the next consumer writes
   another gated manager contract. This is a design decision to make, not a bug
   to fix.

## Measures

| Deliverable | Stated measure                                       | Status                                                                               |
| ----------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| D1          | Q3 vote on testnet                                   | **Met** — round ran on `stellarpgq3`                                                 |
| D1          | Mainnet NFT/NQG populated (conditional on SDF)       | Not met — gated on SDF; membership contract and app built and on testnet             |
| D1          | Mid-grant template shipped or new process documented | **Met** — process worked out with the WG, AI layer for the repetitive work           |
| D2          | Testnet demo: Tansu vote executes a registry action  | **Met** — proposal → vote → `trigger` → publish, replay-guard confirmed              |
| D2          | Templates in dApp                                    | Partially met — 2 outcome templates, superseded by the Registry's own forms          |
| D2          | Name resolution works                                | **Met** at proposal creation                                                         |
| D3          | Evidence on project pages and management in the dApp | **Met**                                                                              |
| D3          | Per-project config documented                        | **Met** — documented; only the finality threshold is exposed in the dApp             |
| D3          | Yes/no approach documented                           | **Met** — supermajority rule and approved / rejected / cancelled outcomes documented |
| D3          | Better management of discussions and other artifacts | **Met** — GitHub thread to IPFS to proposal page, end to end                         |
| D4          | Passkey-based account support                        | **Met** — Nido (smart accounts, testnet) and GHOSTSIG in the dApp                    |
| D4          | Result types consistency documented                  | Descoped                                                                             |
| D4          | TTL strategy documented and applied                  | Descoped — stance recorded in the audit documents                                    |
| D4          | Runbook published, audit assessment addendum         | **Met** — runbook in `docs/operations.md`, refreshed pre-audit; findings still open  |
| D4          | Dependencies up to date                              | **Met**                                                                              |
| D4          | Radicle usage with patches and issues                | **Met**                                                                              |
