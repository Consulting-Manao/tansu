# Operations runbook

This document describes how to configure and operate the Tansu Soroban contracts,
and how to respond to incidents. It covers `contracts/tansu` and
`contracts/registry-tansu-manager`. The dApp, the events service and the IPFS worker
are only covered where they affect on-chain operations.

## Networks and identities

The contract id of each network is stored in `.stellar/tansu_id-<network>`. This file
is the source of truth, and every `make` target reads the id from it. The targets use
two variables:

- `network` selects the network. It defaults to `testnet`, so production actions must
  pass `network=mainnet` explicitly. There is no confirmation prompt.
- `admin` selects the signing identity of the Stellar CLI. It defaults to
  `tansu-<network>`.

The contract also references two external contracts:

| Reference        | Value                                                                                     | Set with                  |
| ---------------- | ----------------------------------------------------------------------------------------- | ------------------------- |
| Collateral asset | Native XLM asset contract: `stellar contract id asset --asset native --network <network>` | `set_collateral_contract` |
| NQG contract     | `nqg_contract_id` and `nqg_wasm_hash` in the `Makefile`                                   | `set_nqg_contract`        |

When a reference carries a WASM hash, `validate_contract` checks it when the
reference is set and before each use. A call fails if the contract at that address
runs another WASM. Hence, the NQG hash is updated together with the NQG contract, and
never removed.

## Roles

| Role               | Authority                                                                                                                                                                                                                           | Key custody                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Deployer           | Upload and deploy the WASM                                                                                                                                                                                                          | Dedicated key, used only for deployment |
| Admin              | `pause`, `set_collateral_contract`, `set_nqg_contract`, the upgrade flow, `revoke_proposal` on any project                                                                                                                          | Hardware-backed, one key per admin      |
| Project maintainer | Everything scoped to one project: `commit`, `set_evidence`, `attest`, `set_badges`, `update_config`, `set_attestation_threshold`, `anonymous_voting_setup`, `execute`, `remove_vote`, `revoke_proposal`, conflict-of-interest lists | Chosen by each project                  |
| Proposer, voter    | `create_proposal`, `vote`                                                                                                                                                                                                           | End users                               |

The following rules apply to admins:

- The constructor makes the deployer the only admin, with a threshold of 1. Other
  admins and a higher threshold are added during the initial setup.
- The admin set only changes through an upgrade proposal, with
  `propose_upgrade(new_admins_config)`. There is no separate call to edit it.
- Accepting an upgrade requires the threshold of approvals. Cancelling it requires a
  single admin. An unplanned cancellation must therefore be investigated as a
  possible key compromise.
- Admin keys are hardware-backed. Stellar supports Shamir secret sharing through
  SEP-52, for instance with Trezor devices.

On the project side, any single maintainer can call `update_config`, which replaces
the maintainer list, and `set_attestation_threshold`. Projects that need stronger
guarantees keep their maintainer list small and monitor the corresponding events.

## Release and verification

Contract releases are built by `.github/workflows/contract-release.yml` when a `v*`
tag is pushed. The job runs in the `publish-contract` GitHub environment and attaches
build provenance to the artifact. A mainnet WASM is never built by hand.

The `publish-contract` environment is configured as follows:

- at least two required reviewers, with self-review disabled,
- a wait timer,
- deployments restricted to `main`, which is a protected branch.

Tags and releases are immutable. After a release, the build must show as verified on
Stellar.Expert. This check relies on SEP-55 build provenance.

The other workflows in `.github/workflows` run tests, linters, SBOM generation and
vulnerability scans. Their results are checked before tagging a release.

## Initial setup

A new deployment follows these steps:

1. Configure the network and identities with `make prepare network=<network>`.
2. Download the WASM from the release and deploy it with
   `make contract_deploy network=<network> wasm=<path>`. The deployment uses a fixed
   salt. Hence, deploying again with the same deployer key gives the same contract id
   and fails instead of creating a second contract.
3. Read the state back. `get_admins_config` must return the deployer as admin, and
   the contract must be paused, since the constructor ends by pausing it.
4. Set the collateral asset with `make contract_set_collateral_contract network=<network>`.
5. Set the NQG contract and the project using it with
   `make contract_set_nqg_contract network=<network>`. The project name is written in
   the target and must be checked first.
6. Add the other admins and raise the threshold with an upgrade proposal, see
   [Admin operations](#admin-operations).
7. Unpause with `make contract_unpause network=<network>` once every value read back
   matches the expected configuration.

Before a production deployment, the following is verified:

- the WASM hash matches the release artifact and its attestation,
- the release shows as verified on Stellar.Expert,
- the admin addresses and the threshold are confirmed out of band,
- the collateral asset id matches the native asset contract of the target network.

## Governance operations

Admin and maintainer actions go through `make` targets that wrap
`stellar contract invoke`. Each target signs with a single identity, given by
`admin=`.

### Admin operations

```bash
make contract_get_upgrade_proposal network=mainnet
make contract_propose_upgrade network=mainnet wasm=<released-wasm>
make contract_approve_upgrade network=mainnet admin=<other-admin>
make contract_finalize_upgrade network=mainnet
```

`contract_propose_upgrade` also passes a `new_admins_config`. The value written in
the target becomes the new admin set, so it must be compared with the intended set
before every use. `contract_finalize_upgrade` accepts the proposal. To cancel a
proposal instead, call the contract directly:

```bash
stellar contract invoke --source-account <admin> --network mainnet \
  --id "$(cat .stellar/tansu_id-mainnet)" \
  -- finalize_upgrade --admin "$(stellar keys address <admin>)" --accept false
```

The contract enforces the following flow:

1. `propose_upgrade` records the new WASM hash and the optional admin set. Only one
   proposal exists at a time, and the proposer's approval is counted.
2. `approve_upgrade` adds an approval. An admin cannot approve twice, and the
   threshold is taken from the current admin set.
3. `finalize_upgrade` with `accept: true` needs enough approvals and the end of the
   `TIMELOCK_DELAY`. It applies the admin set, then the new WASM.
4. `finalize_upgrade` with `accept: false` cancels the proposal. Any admin can do
   it, at any time.

A new admin list must not contain the same address twice. Duplicates count once when
approving, which can make the threshold impossible to reach.

### Project operations

| Action                         | Who                            | Notes                                                                                                                                |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `commit`                       | Maintainer                     | Full commit hash, 40 or 64 hexadecimal characters                                                                                    |
| `set_evidence`                 | Maintainer                     | `make contract_set_evidence` records evidence for the Tansu project itself. Other projects call `tools/evidence/publish.sh` directly |
| `attest`, `revoke_attestation` | Maintainer, resp. the attester | Revocation is possible during `ATTESTATION_REVOCATION_WINDOW` and before finality                                                    |
| `set_attestation_threshold`    | Maintainer                     | Applies immediately                                                                                                                  |
| `update_config`                | Maintainer                     | Replaces the maintainer list, metadata and governance settings                                                                       |
| `execute`                      | Maintainer                     | After `voting_ends_at` plus the project's execution delay                                                                            |
| `remove_vote`                  | Maintainer                     | Drops a vote from an active proposal                                                                                                 |
| `revoke_proposal`              | Maintainer or admin            | Closes the proposal and keeps the proposer's deposit                                                                                 |

The governance settings `min_voting_period` and `execute_delay` change in two ways.
A change that only lengthens them applies immediately. A change that shortens one of
them waits for a notice window equal to the current `min_voting_period` plus
`execute_delay`. Proposals keep the execution delay they had when they were created.

A change of the attestation threshold applies immediately and affects every target
of the project. It is announced to the maintainers before it is made.

### Checklist before a state change

- `network=mainnet` is passed and the network passphrase is the expected one.
- The contract id read from `.stellar/tansu_id-mainnet` is the expected one.
- The address of the signing identity is confirmed out of band.
- The signer's admin or maintainer role is read on-chain.
- The simulation is reviewed, including the decoded arguments.
- For an upgrade, the WASM hash matches the release artifact and its attestation.
- For an upgrade, the WASM hash of the previous release is at hand.

### Registry manager

`registry-tansu-manager` is deployed with `__constructor(tansu, project_key, registry)`.
It has no admin and no upgrade path, so these three values are fixed. Changing one of
them means deploying a new manager and moving the project's maintainer entry to it.

The manager must be a maintainer of the Tansu project it names. It then signs the call
given by the single outcome of an approved proposal. Hence, the outcome of every
proposal on that project is reviewed before voting ends, and not only its
description.

The scripts `contracts/registry-tansu-manager/e2e-*.sh` exercise a manager on testnet.

## Upgrade and pause

`pause` stops every state-changing call and leaves reads available. It can be called
again while the contract is already paused. Upgrades use the flow described in
[Admin operations](#admin-operations).

For an upgrade:

- pause first when the upgrade fixes an emergency,
- check that existing on-chain state satisfies any new validation rule, for instance
  that no project has more maintainers than a new maximum allows,
- verify the executable hash on-chain after finalizing,
- keep the previous WASM hash for a rollback. A rollback is a full upgrade, with its
  timelock.

## State and TTL

The contract does not extend the TTL of its entries. An archived entry is restored
automatically by the next transaction that touches it, which pays the restoration.
This also applies to the contract instance and the contract code.

An entry can be extended by hand with the Stellar CLI:

```bash
stellar contract extend \
  --id "$(cat .stellar/tansu_id-mainnet)" \
  --network mainnet \
  --source-account <identity> \
  --ledgers-to-extend <ledgers>
```

Without `--key` or `--key-xdr`, the command extends the contract instance. For a
persistent entry, add `--durability persistent` and the entry key. The transaction is
simulated and checked before submission.

Instance storage holds the pause flag, the admin set, the pending upgrade, the NQG
project key and the external contract references. Persistent storage holds projects,
members, badges, commits, evidence, proposals, votes, conflict-of-interest lists and
attestations. The first write to a dormant project costs more than usual, and scripted
operations must budget for it.

Limits and delays are constants in `contracts/tansu/src/types.rs`,
`contract_dao.rs` and `contract_versioning.rs`:

| Constant                                                               | Meaning                                                    |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| `TIMELOCK_DELAY`                                                       | Upgrade timelock, and default execution delay of proposals |
| `MIN_VOTING_PERIOD`, `MAX_VOTING_PERIOD`                               | Bounds of a proposal's voting period                       |
| `MAX_VOTES_PER_PROPOSAL`                                               | Maximum number of votes on a proposal                      |
| `MAX_PROPOSALS_PER_PAGE`, `MAX_PAGES`                                  | Storage layout of proposals                                |
| `MAX_EVIDENCE`                                                         | Evidence entries kept per project, commit and kind         |
| `MAX_ATTESTATIONS`, `MAX_MAINTAINERS`                                  | Attestations kept per target, maintainers per project      |
| `DEFAULT_FINALITY_THRESHOLD_PERCENT`, `MIN_FINALITY_THRESHOLD_PERCENT` | Default and lowest attestation threshold                   |
| `ATTESTATION_REVOCATION_WINDOW`                                        | Delay to revoke an attestation                             |
| `REGISTER_COLLATERAL`, `PROPOSAL_COLLATERAL`                           | Deposits to register a project and to create a proposal    |

## Monitoring

The events emitted by the contract are defined in `contracts/tansu/src/events.rs`.
The events service in `tansu/src/tansu/events/` stores them in Postgres. It reads them
with the RPC `getEvents` method, filtered on the contract id.

The following events raise an alert:

| Event                                                 | Reason                                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `ContractPaused`                                      | Any change of the pause state                                                    |
| `UpgradeProposed`, `UpgradeApproved`, `UpgradeStatus` | Every upgrade step, including cancellations                                      |
| `ContractUpdated`                                     | Change of the collateral or NQG reference                                        |
| `ProjectConfigUpdated`                                | Change of a project's maintainers or metadata                                    |
| `ProjectGovernanceUpdated`                            | Change of voting period or execution delay. `activates_at` gives when it applies |
| `AttestationThresholdSet`                             | Change of a project's finality threshold                                         |
| `ProposalExecuted` with status `Malicious`            | A proposal was revoked                                                           |
| `VoteRemoved`                                         | A maintainer removed a vote                                                      |

The following is also monitored:

- proposals still active after `voting_ends_at` plus the execution delay. Either
  nobody executed them, or execution fails,
- the XLM balance of the contract. Registration deposits accumulate, while proposal
  deposits leave again on execution,
- the TTL of entries of dormant projects,
- on token-weighted proposals, transfers of the voting token between voters during
  the voting period.

Events contain values supplied by the caller, such as titles, CIDs and addresses.
Amounts, assets and contract targets are therefore checked against on-chain state and
not taken from the event.

### Record of admin actions

Every mainnet admin action is recorded with the action, the signing address, the
transaction hash, a Stellar.Expert link and the state read back after submission.
Only verified outcomes are recorded. When a submission result is unclear, the
transaction is looked up by hash and its `status` field is read. The diagnostic events
of a Soroban transaction can contain the word `Error` even when it succeeded.

## Incident response

### Unexplained state change

1. Pause the contract if the extent of the change is unknown.
2. Read `get_admins_config` and `get_upgrade_proposal`.
3. Review the recent transactions authorized by admins.
4. Unpause once the state is understood and corrected.

### Admin key compromise

1. Pause the contract with another admin key.
2. Cancel any pending upgrade proposal with `finalize_upgrade(accept: false)`.
3. Propose a new admin set with `propose_upgrade`. The compromised key can still
   cancel this proposal during the timelock. In that case, propose it again.
4. Review every transaction authorized by admins since the suspected compromise.

### Maintainer key compromise

Admins cannot edit a project's maintainer list. The available actions are:

1. Pause the contract if the damage is ongoing and significant.
2. Revoke malicious proposals with `revoke_proposal`, which admins can call on any
   project.
3. Use a remaining maintainer key for `update_config`, `remove_vote` or `set_badges`.

If the attacker replaced the whole maintainer list, the project cannot be recovered.
It has to be registered again under a new name, since the project key is derived from
the name.

### Faulty deployment or upgrade

1. Pause the contract.
2. Propose an upgrade to the previous WASM hash and complete the approval flow.
3. Check the main reads, such as `get_admins_config`, `get_project`, `get_commit` and
   `get_attestation_finality`, before unpausing.

### Faulty external contract

- NQG. If the NQG contract returns wrong values, point `set_nqg_contract` to a
  correct contract. This call also sets the NQG project, which must be given again.
- Collateral asset. If transfers fail, `register`, `create_proposal` and `execute`
  fail with `CollateralError`. Pause the contract and set a correct asset with
  `set_collateral_contract`.
- Outcome contract. If an approved proposal's outcome keeps failing, the proposal
  cannot be executed. `revoke_proposal` closes it and keeps the proposer's deposit.
  When the proposer is not at fault, the decision and any off-chain compensation are
  recorded.

## Related documents

- [`CONTRIBUTING.md`](../CONTRIBUTING.md): development, release and deployment
  procedures
- [`tools/evidence/README.md`](../tools/evidence/README.md): publishing evidence
- `website/docs/developers/`: architecture, governance, membership, evidence and code
  finality
