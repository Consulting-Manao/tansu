# Q3 progress report — SCF Public Goods Maintenance

Internal status against the four proposed deliverables of the [Tansu entry](https://scf-public-goods-maintenance.github.io/projects/tansu-decentralized-project-governance-on-stellar/)
in the SCF Public Goods Maintenance working group. Scope is D1–D4 only; the
retroactive deliverables P1–P5 are already accepted and are not revisited here.

Date: 2026-09-28 · Tree: `main` · Contract crate `tansu` 2.1.0 on `soroban-sdk 28.0.0`

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

On the feature side, D3 is complete: evidence is fully usable from the dApp,
commit endorsement shipped as a complete attest/revoke/finality system, the
discussions loop is closed end to end, governance is configured per project,
and the collateral question was settled by relying on NQG weight rather than
reworking deposits. Dependency currency, passkey wallets and the Radicle
migration (D4) are done, and the documentation was brought back in line with
the contract.

The quarter closed with a security round. A fresh pre-audit of the contracts
found one Critical and four High issues, and a series of fixes
([`f490db1`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/f490db1250085ba889cd049b70e585cec11f4684) to [`f8985ff`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/f8985ff045c7de78e6f9c30dc6d70eabf31722ef)) closed them. A second review of Tansu and its
executor after the fixes ([`55ace02`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/55ace02f5388f0fca9be52f99db3fd3c51df5764)) found no Critical or High issue left and
rates the contracts close to audit-ready.

Two D4 items are deliberately dropped rather than late, and the Nouns item is
postponed on their side. What remains open is what depends on others: SDF for
the NQG and NFT work, and the Registry team for the manager contract.

| Verdict   | Count |
| --------- | ----- |
| Done      | 15    |
| Partial   | 3     |
| Descoped  | 2     |
| Postponed | 1     |
| Ongoing   | 1     |

## D1 — Public Goods Award

| Item                    | Verdict                                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q3 round on Tansu       | **Done**                                                | [`testnet.tansu.dev/governance/?name=stellarpgq3`](https://testnet.tansu.dev/governance/?name=stellarpgq3), contract [`CBXKUSLQ…`](https://stellar.expert/explorer/testnet/contract/CBXKUSLQPVF35FYURR5C42BPYA5UOVDXX2ELKIM2CAJMCI6HXG2BHGZA): 19 anonymous proposals, 18 approved                                                                                                                                                                                                                                                                                                                                                                                                             |
| Program NQG score       | **Partial** — gated on SDF                              | `contract_membership.rs` `get_max_weight`, `set_nqg_contract` in `contract_tansu.rs`, `DataKey::NqgProjectKey` in `types.rs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| SCF NFT / Neurons       | **Partial** — contract and app rebuilt, sync still open | `stellar-membership` on Radicle; extraction commits [`07b55bd`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/07b55bda37b2f5408fa52d69113b98285b370f5c), [`f1631dc`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/f1631dcae8ed7a1978d58bd5fc06efa687ec861e), [`cb79dd6`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/cb79dd6b5ab3ab24658abe7cc1989d76372ec1b3), [`453f673`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/453f673a6b90314b8f60ad6adaaa2fdfc93913b5) |
| Mid-grant reviews       | **Done**                                                | Process worked out with the WG; AI assistance for the repetitive review work being added                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Nouns Builder alignment | **Postponed**                                           | Conditional item; calls held with the team                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Q3 round.** The same testnet stack as Q2 carried the Q3 program. The round
has 19 anonymous proposals with about twenty Pilot ballots each. The main vote
closed on 11 August with 17 projects approved and Stellarlight cancelled, and a
revised Stellarlight proposal was approved on 23 September. Nothing broke
during voting, which is the point worth making: Q2 surfaced computational-cost
problems in the anonymous setup and a collateral issue mid-vote, and neither
recurred. The testnet contract was then upgraded in place to the new version,
with a migration of the proposals to their new storage ([`575e2ae`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/575e2ae151f176eb1332f3eb9310311239122ae0),
[`f48aca4`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/f48aca48fe8e811b6b58480f54c98eadfbb5762f), [`7027798`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/7027798a94382da122cafddc94a58d408b676976)). The Q2 and Q3 rounds kept every proposal and
ballot, and stay browsable in the dApp.

The round approved 18 projects for a total of $453,000, with a median ask of
$16,500 (from $10,000 to $50,000). 22 Pilots voted, with a median of 17.5 voters
per proposal (from 15 to 20). Stellarlight is counted once, at its revised
budget. Amounts are the budgets in the proposals voted on.

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
`contracts/registry-tansu-manager/` ([`841dd84`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/841dd84790f3b8f2c8ae4fbf65ca10d5a9adab69), v0.1.1) is not deployed — the
deployed one is the Registry's. Since [`f490db1`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/f490db1250085ba889cd049b70e585cec11f4684), Tansu runs every outcome
through `tansu-executor`, a contract that holds nothing, so an outcome can no
longer act with Tansu's own authority. Pre-authorizations made higher up, as
the manager does, still reach the outcome, so the Registry flow keeps working.
The pre-audit leaves the manager's own findings, such as checking that the
target is its registry, to the Registry team, who own and deploy it. Our
`interact-stellar-registry` outcome template still hardcodes a wasm hash at
version `0.1.0`; with the Registry's own forms in place it may be better
retired than fixed.

The lifecycle is now documented from Tansu's side: the governance docs explain
when an outcome can call a contract directly and when it needs the manager
pattern, walk through propose → vote → `trigger` → execute, and point to the
Registry as the reference integration. The Registry documents publishing,
deploying and versioning on its side.

## D3 — Governance features

| Item                     | Verdict                               | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Evidence in dApp         | **Done**                              | `CommitEvidenceModal.tsx`, `EvidenceService.ts`, `EvidenceUploadFlow.ts` ([`c21688c`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/c21688cd3bbcaabd7974c4067583fb627dffce8f))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Endorsement of a commit  | **Done**                              | `attest` / `revoke_attestation` / finality in `contract_versioning.rs`, `AttestationCard.tsx` ([`6c47a83`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/6c47a833f591a6ae37affcc495933065b2e48da4))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Discussions              | **Done**                              | `DiscussionSection.tsx` + `ProposalService.resolveDiscussionCid` ([`844f8c1`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/844f8c19de4ceda4695ded88cac858b22de4a325)), fed by the PG Award workflow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Governance configuration | **Done**                              | Voting settings ([`2f97539`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/2f97539ab7fb2a2ee46573906495d82b4267131f), [`4ee9d62`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/4ee9d627fc6bf6411363248ba6b73c1f391bb890)), NQG per project ([`f0aef91`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/f0aef910d7fe48b2d6f74ba55479f6abe977f123)), token proposals ([`a9b9334`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/a9b9334c15a7fb5136e121830cf912ff7622c715)), queued threshold ([`258923e`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/258923e6d978724053a50c789932ac2a827e4628)), outcome executor ([`f490db1`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/f490db1250085ba889cd049b70e585cec11f4684)) |
| Collateral rework        | **Done** — resolved by relying on NQG | Voting collateral removed ([`526395e`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/526395e941a6e1ec3f573f66446952d9eb05c4f7)); rationale in `website/docs/developers/governance.mdx` "Spam and Sybil resistance"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

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
attester's weight, but finality counts maintainers, not weight. Since
[`258923e`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/258923e6d978724053a50c789932ac2a827e4628), a lower threshold waits out the same notice window as shorter
voting durations, so one maintainer can no longer lower the bar and finalize a
target alone. Notes, CIDs and commit hashes are also bounded and validated.
Rust tests and dApp surfaces on latest commit, commit history and evidence.

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

**Governance configuration.** Every part of this item is now per project:

- **Voting settings.** `min_voting_period`, `execute_delay` and the attestation
  threshold are project settings. Loosening any of them waits out a notice
  window, tightening applies at once ([`2f97539`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/2f97539ab7fb2a2ee46573906495d82b4267131f), [`4ee9d62`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/4ee9d627fc6bf6411363248ba6b73c1f391bb890), [`258923e`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/258923e6d978724053a50c789932ac2a827e4628)).
- **Weight mode.** A project's maintainers set its own NQG contract, read as a
  `u32` weight ([`f0aef91`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/f0aef910d7fe48b2d6f74ba55479f6abe977f123)). Several projects can each use their own, and a
  project without one uses badges. The single global NQG project key is gone.
- **Token weight.** Only maintainers can create a token-weighted proposal, and
  never on a project with NQG set ([`a9b9334`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/a9b9334c15a7fb5136e121830cf912ff7622c715)).
- **Outcome flow.** Outcomes run from `tansu-executor` instead of Tansu itself
  ([`f490db1`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/f490db1250085ba889cd049b70e585cec11f4684)). Each proposal is its own ledger entry with at most three
  outcomes, one per final status ([`840322c`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/840322cd3050ebea2160df4335596422c5695ca5)).

The per-project settings are documented, including the notice window
([`d3eac45`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/d3eac459a799d8d4186e4655afde669a3bf10a0e)). The dApp exposes only the finality threshold so far: the voting
period and delay are set through the contract, and the proposal form keeps its
own 25-hour minimum.

**Collateral — settled by design, not by a new mechanism.** Q2 showed that
locking collateral per ballot was the wrong lever: it made voting costly
without adding protection. The Merkle-based rework was
meant to make that lock cheaper; the better answer was to drop it. Voter
collateral was removed ([`526395e`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/526395e941a6e1ec3f573f66446952d9eb05c4f7)), and vote integrity now rests on weight: on
the Public Goods project a vote counts for the voter's NQG score, and a fresh
address has none. Reputation, not capital, decides who is heard, so spinning
up addresses buys nothing. The same holds for badges, which maintainers grant
to specific addresses, and weight-1 votes now take at most 20 of the 40 slots
of a proposal ([`720e640`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/720e640c1b43659c510cc51952cbf5ed15a4c9c9)). Token weight is the exception: balances are not
escrowed, so token proposals are restricted to maintainers and excluded from
NQG projects ([`a9b9334`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/a9b9334c15a7fb5136e121830cf912ff7622c715)). The collateral asset itself is now fixed at
deployment ([`f490db1`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/f490db1250085ba889cd049b70e585cec11f4684)).

Deposits stay only where something is created: 5 XLM to register a project (the
price of a unique name, not returned) and 5 XLM to create a proposal (returned
on execution, forfeited if revoked as spam). The model is documented in the
governance docs under "Spam and Sybil resistance".

## D4 — Maintenance, Security and Operations

| Item                           | Verdict      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependencies current           | **Done**     | `soroban-sdk 28.0.0` ([`7d9b274`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/7d9b2743ed91b98b3324506c15a9b6593cd0a78a)), Protocol 28 ([`30984c2`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/30984c2828ddddc3031c12c23102e22bbd30070b)), every dApp dependency on its latest release ([`90b7a62`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/90b7a626185fe1b708d5f19541176c959caa8e30), [`f07f86c`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/f07f86c0d6eb8c9264d7a51725ef6bbf77c05655)), `.github/dependabot.yml` across 4 ecosystems |
| Radicle                        | **Done**     | `rad` remote, `.radicle/` CI and release scripts, merged patch [`f737729`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/f73772921405f7dd8769c8964ffb1659bdbc9384), provider support [`e75becc`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/e75becc560c0a05c92d06baac61688d12051bf3d), `stellar-membership` Radicle-only                                                                                                                                                                                                                                                                                                                                     |
| Drips Wave                     | **Ongoing**  | 12 `Stellar Wave` issues closed this quarter, 47 in total, see below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Audit-bank prep                | **Done**     | Pre-audits `Audits/tansu-pre-audit-2026-09-26.md` ([`afcd58f`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/afcd58f3bd361a3b255226f8a76a7d0a07686d25), fixes [`ef1e095`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/ef1e095d44b5c20ed8c5561dec837291686710f2)) and `-2026-09-28.md` ([`55ace02`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/55ace02f5388f0fca9be52f99db3fd3c51df5764)), runbook `docs/operations.md` ([`51b3318`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/51b3318def2c34a4a8954760e768ae94928ca0b3))                   |
| Nido wallet / passkey accounts | **Done**     | [`c66c39c`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/c66c39c5c1f231470371f7c373cdffdd7fbd02bd), [`5c21a20`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/5c21a20a8223cb84eca2a78108b4435d3689d43a), [`95d3741`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/95d374155fba765fc79fb6fccf71ba68b084d7c7): Nido and GHOSTSIG in the wallet picker, Nido on testnet only                                                                                                                                                                                                                               |
| Result types                   | **Descoped** | See below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Storage / TTL                  | **Descoped** | See below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Audit-bank prep.** A fresh pre-audit reviewed both contracts line by line,
with a second reviewer trying to refute each finding. It lists 47 findings:
1 Critical, 4 High, 11 Medium, 21 Low and 10 Info. It has an entry-point map,
the trust model, and a readiness section naming what to fix before an external
audit. The fixes followed on `main`:

| Finding                                                                | Fix                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-01: outcome calls ran with Tansu's own authority                     | Outcomes run from `tansu-executor`, collateral asset fixed at deploy ([`f490db1`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/f490db1250085ba889cd049b70e585cec11f4684))                                                                                                                                     |
| H-01: one proposal could block new proposals of its project            | One ledger entry per proposal, at most three outcomes ([`840322c`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/840322cd3050ebea2160df4335596422c5695ca5))                                                                                                                                                    |
| H-02, H-03: shared member records, weight-1 votes filling the vote cap | Four badge kinds once each, at most 20 weight-1 votes ([`720e640`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/720e640c1b43659c510cc51952cbf5ed15a4c9c9))                                                                                                                                                    |
| M-03, M-10, I-01: global NQG key, wrapping NQG weight                  | NQG set per project, read as a `u32` ([`f0aef91`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/f0aef910d7fe48b2d6f74ba55479f6abe977f123))                                                                                                                                                                     |
| M-04, L-02: duplicate admins, revoking while paused                    | Duplicates rejected, admins revoke while paused ([`c49e4f4`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/c49e4f454c1795aba599169cabfdf6c72d94616f))                                                                                                                                                          |
| M-05, L-14, L-15, I-03: token choice, ballot size, empty proof         | Token proposals by maintainers only, ballots bounded, `proof` checked ([`a9b9334`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/a9b9334c15a7fb5136e121830cf912ff7622c715))                                                                                                                                    |
| M-06, M-07, L-05 to L-09: threshold, unbounded inputs                  | Lower thresholds queued, inputs bounded and validated ([`258923e`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/258923e6d978724053a50c789932ac2a827e4628))                                                                                                                                                    |
| L-19, I-04, I-05: incomplete events                                    | Events carry admins, maintainers and badges ([`9c5fd72`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/9c5fd72d365cd16f07e84bbad0053dbcd4b00873))                                                                                                                                                              |
| L-18, L-20, L-21: build and CI                                         | Executor in the Makefile, CI downloads pinned ([`b7ef81c`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/b7ef81c1e7de0f73600afe6a8a0b3ce695c06a3c), [`f8985ff`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/f8985ff045c7de78e6f9c30dc6d70eabf31722ef)) |

In total 27 findings are fixed and 3 partly. The manager findings went to the
Registry team, who own that contract, and the admin powers are handled by making
the admin a multisig account.

A second pre-audit then reviewed Tansu and its executor at [`f48aca4`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/f48aca48fe8e811b6b58480f54c98eadfbb5762f)
([`55ace02`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/55ace02f5388f0fca9be52f99db3fd3c51df5764)). It found 0 Critical, 0 High, 2 Medium, 11 Low and 12 Info, and
rates the contracts **close to audit-ready**. It treats the maintainers' powers
as the design of a permissioned DAO rather than as findings ([`2a64392`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/2a64392c4d42864b342650c981bff75ad116a324)). The
two Medium findings are the voting modes that rely on something the contract
does not check: token-weighted votes read the current balance, so tokens can
vote from several addresses (M-01), and anonymous ballots are validated off
chain (M-02). Before an external audit, each needs a fix or a documented rule.
The operations runbook covers roles, releases, setup, governance operations,
TTL, monitoring and incident response ([`51b3318`](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s/commits/51b3318def2c34a4a8954760e768ae94928ca0b3)).

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
- **Audit findings surfaced.** The docs state the open limits users and
  integrators need to know, with their mitigations: token-weighted voting,
  finality that can read as final without latching, off-chain validation of
  anonymous ballots, and outcomes that keep failing.

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
   cannot be completed unilaterally. Our side is in place: any project can now
   point at its own NQG contract. The dependency should be stated explicitly
   rather than reported as slippage.
2. **Remaining audit items.** The latest pre-audit has no Critical or High
   finding. Its two Medium findings need a decision before an external audit:
   token balances are not escrowed, so token-weighted proposals stay a
   maintainer-only mode, and anonymous ballot validity is checked off chain
   until a validity proof lands.
3. **Mid-grant reviews: evidence.** The process work is real but mostly
   non-public, and the AI layer is still landing. Reviewers will ask for
   something to look at; the AI layer running on actual reviews is that proof.
4. **Governance API ergonomics.** The Registry shipped on Tansu but called the
   integration an unsatisfying workaround. The executor now isolates outcome
   calls from Tansu's authority, but a contract that needs a signed call still
   needs its own gated manager. This is a design decision to make with the
   Registry team.

## Measures

| Deliverable | Stated measure                                       | Status                                                                                         |
| ----------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| D1          | Q3 vote on testnet                                   | **Met** — `stellarpgq3` on testnet.tansu.dev, 19 proposals, 18 approved                        |
| D1          | Mainnet NFT/NQG populated (conditional on SDF)       | Not met — gated on SDF; membership contract and app built and on testnet                       |
| D1          | Mid-grant template shipped or new process documented | **Met** — process worked out with the WG, AI layer for the repetitive work                     |
| D2          | Testnet demo: Tansu vote executes a registry action  | **Met** — proposal → vote → `trigger` → publish, replay-guard confirmed                        |
| D2          | Templates in dApp                                    | Partially met — 2 outcome templates, superseded by the Registry's own forms                    |
| D2          | Name resolution works                                | **Met** at proposal creation                                                                   |
| D3          | Evidence on project pages and management in the dApp | **Met**                                                                                        |
| D3          | Per-project config documented                        | **Met** — voting settings, NQG weight and threshold documented; the dApp exposes the threshold |
| D3          | Yes/no approach documented                           | **Met** — supermajority rule and approved / rejected / cancelled outcomes documented           |
| D3          | Better management of discussions and other artifacts | **Met** — GitHub thread to IPFS to proposal page, end to end                                   |
| D4          | Passkey-based account support                        | **Met** — Nido (smart accounts, testnet) and GHOSTSIG in the dApp                              |
| D4          | Result types consistency documented                  | Descoped                                                                                       |
| D4          | TTL strategy documented and applied                  | Descoped — stance recorded in the audit documents                                              |
| D4          | Runbook published, audit assessment addendum         | **Met** — runbook, and two pre-audits: the latest finds no Critical or High issue              |
| D4          | Dependencies up to date                              | **Met**                                                                                        |
| D4          | Radicle usage with patches and issues                | **Met**                                                                                        |
