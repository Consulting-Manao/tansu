# Security Policy

## Reporting a vulnerability

Email [legal@consulting-manao.com](mailto:legal@consulting-manao.com?subject=SECURITY)
with the subject `SECURITY`. Please do not report a vulnerability in a public
issue, a patch or on Discord.

A useful report says:

- what is affected: the contract, the dApp, the IPFS upload worker, the events
  service or the website, and the version, commit or contract ID;
- how to reproduce it, ideally as a test or a script against testnet or a
  local network;
- what an attacker gains.

Do not try a vulnerability on mainnet, nor on the funds, projects or
accounts of other people. Please give us time to fix it before you publish
it.

## Scope

- The Tansu contract (`contracts/tansu`) as deployed on testnet and mainnet
- The dApp: [app.tansu.dev](https://app.tansu.dev) and
  [testnet.tansu.dev](https://testnet.tansu.dev)
- The IPFS upload worker (`dapp/workers/ipfs-delegation`)
- The events service (`tansu/`)
- The website: [tansu.dev](https://tansu.dev)

Wallets, Stellar itself, IPFS gateways and the git hosts the dApp reads from
are not ours: report to them directly.

The audits of Tansu and their open items are in [`Audits/`](Audits/README.md).

## Machine-readable contact

The dApp and the website serve this contact at `/.well-known/security.txt`
([RFC 9116](https://www.rfc-editor.org/rfc/rfc9116)). Both builds write it,
with an expiry a little under a year after the build.
