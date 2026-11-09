# IPFS Delegation Worker

Cloudflare Worker that verifies a landed Tansu transaction, checks the CAR is
exactly the content of the CID that transaction recorded, and uploads it to
Filebase. Once Filebase succeeds, it pins the resulting CID on Pinata in the
background when Pinata pinning is enabled.

## API

```json
POST /
{
  "cid": "<expected-root-cid>",
  "txHash": "<hash of the transaction that landed with the CID>",
  "car": "<base64-car-bytes>"
}
```

The dapp sends the transaction first and uploads after, so the proof is a
transaction that already paid for its CID. Smart-account wallets such as Nido
submit through their own relayer; their transactions are proven the same way.

The worker checks the upload request by:

- at most 10 requests a minute per address (`CF-Connecting-IP`, the
  `RATE_LIMIT` binding); past it the answer is `429`
- reading the body up to `MAX_CAR_BYTES` in base64 and no further
- fetching `txHash` from Soroban RPC (asked again a few times if the node does
  not know it yet), checking it succeeded, and checking it calls
  `TANSU_CONTRACT_ID` with `cid` as the CID argument of a function that records
  one (`CID_CALLS` in `src/index.ts`: `add_member`, `update_member`, `register`,
  `update_config`, `set_evidence`, `create_proposal`, `veto`). The CID anywhere
  else in the call does not count
- the address that authorized that call may have 50 CIDs and 100 MB pinned in a
  day (`src/quota.ts`, one `UploadQuota` Durable Object per address, reset a day
  after the first upload). It is the address in the call, not the transaction's
  source: a relayer pays for all its users' transactions. A CID already counted
  is free, so a retry is; a failed upload gives its share back; over the quota
  the answer is `429` with `Retry-After`
- only then is the CAR decoded (at most `MAX_CAR_BYTES`; `src/car.ts`). It is
  read block by block: one root, equal to `cid`; every block is raw or DAG-PB,
  hashed with SHA-256 and equal to its CID; every link leads to a block in the
  file and every block is linked from the root; at most 2048 blocks. What the
  root names is exactly what is pinned
- it asks the Filebase bucket whether `cid` is already pinned
  (`pin/ls`): if so it answers `{ success: true, alreadyPinned: true }` and
  uploads and counts nothing. An answer that is not clear counts as "not pinned"
- it uploads to Filebase with exponential backoff retries
- it can pin that CID on Pinata asynchronously with exponential backoff retries

`txHash` is checked with `getTransaction`, which only knows recent
transactions (the RPC's retention window): the upload has to follow the
transaction soon after it lands.

`GET /health` answers `200 {"ok":true}` when the Filebase bucket answers the
worker's token, else `503`. The dapp asks before it asks a wallet to sign, so
it does not send a transaction whose files it could not upload. The answer is
kept for 30 seconds.

## Returns JSON

```json
{
  "success": true,
  "cid": "<cid>"
}
```

- If the request does not check out, `success` is `false` and the HTTP status
  is `400`. If the RPC does not answer, it is `502`.
- If the address reached its quota, or asks too often, the HTTP status is
  `429`.
- If Filebase upload fails, `success` is `false` and the HTTP status is `502`.
- Pinata pinning is disabled by default.
- If enabled, Pinata pinning does not block the response. It runs after
  Filebase succeeds.
- Filebase retries 3 times with exponential backoff.
- When enabled, Pinata pin-by-CID retries 3 times with exponential backoff in
  the background.

## Development

Add your provider tokens to `.dev.vars`:

```bash
FILEBASE_TOKEN=<filebase_api_token>
ENABLE_PINATA_PINNING=false
PINATA_JWT=<optional_pinata_jwt>
PINATA_GROUP_ID=<optional_pinata_group_id>
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015
TANSU_CONTRACT_ID=CBXKUSLQPVF35FYURR5C42BPYA5UOVDXX2ELKIM2CAJMCI6HXG2BHGZA
```

`NETWORK_PASSPHRASE`, `TANSU_CONTRACT_ID`, `SOROBAN_RPC_URL` and
`MAX_CAR_BYTES` (bytes, 10 MB) are plain variables, not secrets:
`wrangler.toml` sets them per environment, the contract ids from
`deployments/tansu-*`. All are required: without `SOROBAN_RPC_URL` no upload
can be checked. `wrangler.toml` also binds the `UPLOAD_QUOTA` Durable Object and
the `RATE_LIMIT` rate limiter, per environment (the first deploy runs the
migration).

### Start the Worker

```bash
cd dapp/workers/ipfs-delegation
bun install
bun run dev
```

### Test the Worker

The checks, with Vitest:

```bash
cd dapp/workers/ipfs-delegation
bun run test
```

An upload, in another terminal while the worker runs, or against deployed
environments (see next section):

```bash
bun run test:upload
ENV=DEV bun run test:upload  # Use testnet environment
ENV=PROD bun run test:upload # Use production environment
```

The upload script generates a CAR, sends a Tansu call recording its CID from a
new friendbot-funded testnet account, or the one in `TEST_SIGNER_SECRET`, waits
for it to land, and sends the same JSON payload the dapp sends. It counts
against that account's quota. A successful local test confirms
the blocking Filebase upload path. When Pinata pinning is enabled, that step
runs asynchronously after the response is returned.

## Deployment

### Prerequisites

```bash
bunx wrangler login
```

### Security

All secrets are stored in Cloudflare Secrets. Each environment has its own
Filebase bucket, key and Pinata group, so abuse of testnet cannot exhaust or
get suspended what mainnet depends on; `.dev.vars` uses the testnet bucket. Set
them with wrangler:

```bash
# Development
bunx wrangler secret put FILEBASE_TOKEN --env testnet
bunx wrangler secret put ENABLE_PINATA_PINNING --env testnet
bunx wrangler secret put PINATA_JWT --env testnet
bunx wrangler secret put PINATA_GROUP_ID --env testnet

# Production
bunx wrangler secret put FILEBASE_TOKEN --env production
bunx wrangler secret put ENABLE_PINATA_PINNING --env production
bunx wrangler secret put PINATA_JWT --env production
bunx wrangler secret put PINATA_GROUP_ID --env production
```

### Development (Testnet)

```bash
bunx wrangler deploy --env testnet
```

Deploys to `https://ipfs-testnet.tansu.dev`

### Production (Mainnet)

```bash
bunx wrangler deploy --env production
```

Deploys to `https://ipfs.tansu.dev`
