---
sidebar_position: 1
---

# Welcome to Tansu!

Tansu is a governance and versioning layer for open source projects, built on the Stellar blockchain. It brings transparency, security, and decentralized decision-making to software development by combining on-chain project tracking, a powerful DAO, and a flexible membership system.

## What is Tansu?

Tansu complements **git forges** (GitHub, GitLab, Codeberg, Gitea, Bitbucket, Radicle, and others) by providing:

- **On-chain project registration**: Projects are registered and tracked on Stellar, with commit hashes and metadata verifiable by anyone.
- **Decentralized Autonomous Organization (DAO)**: Every project gets its own DAO, enabling maintainers and contributors to propose, vote, and execute decisions transparently.
- **Flexible voting weight**: Badges by default; optional token-weighted proposals; NQG contract scores for the SCF Public Goods deployment.
- **Code finality**: Maintainers attest commits and supply-chain evidence (SBOMs, CVE scans), and a release becomes final once enough of them have.
- **Spam and Sybil resistance**: A 5 XLM deposit to register a project or create a proposal; votes count for earned weight, not for how many addresses someone controls.
- **Open, auditable governance**: All actions—adding maintainers, updating metadata, voting—are recorded on-chain.

## Distinction with git forges

Tansu does not replace your forge — it complements it. While GitHub, GitLab, Codeberg, and similar platforms excel at hosting code and managing change requests, Tansu brings on-chain governance, versioning, and decentralized decision-making. In other words, Tansu adds a transparent, auditable layer for project governance and commit verification, so you can build with confidence on open source.

## Key Features

- **Project versioning**: Track and verify the latest commit hash for any project, with links to the canonical code repository.
- **Supply-chain evidence**: Attach SBOMs, CVE scans and attestation bundles to a commit, stored on IPFS and anchored on-chain.
- **DAO proposals**: Submit, discuss, and vote on proposals (public or anonymous voting), with weighted votes (badges, tokens, or NQG scores), conflict-of-interest lists, and outcomes that can call other contracts.
- **Membership & badges**: Register as a member, bind your Git identity, earn badges for your contributions, and participate in governance.
- **Automated workflows**: Use Git hooks to sync commit hashes on-chain, and let the dApp handle signatures and wallet integration.
- **Anonymous voting**: Advanced cryptographic voting with BLS12-381 commitments for privacy-preserving governance.

## Learn More

- [Quick-Start on using the dApp](using_the_dapp.mdx): Step-by-step guide for end-users
- [Membership & Badges](developers/membership.mdx): How roles and voting power work
- [Governance & Proposals](developers/governance.mdx): DAO mechanics and proposal lifecycle
- [Code Finality](developers/code_finality.mdx): Attesting commits and evidence
- [On-chain architecture](developers/architecture.mdx): Smart contract and backend-less dApp details

Tansu is fully open source and under active development. Join us on [Radicle](https://radicle.network/nodes/radicle.consulting-manao.com/rad:zssaAF91kxuquZmZCV2SiK2FNX6s) and help shape the future of decentralized open source governance!
