# IPFS Delegation Worker

Cloudflare Worker that verifies a Tansu transaction, checks the ledger would
accept it, and then uploads the CAR file to Filebase. Once Filebase succeeds,
it pins the resulting CID on Pinata in the background when Pinata pinning is
enabled.

## API

```json
POST /
{
  "cid": "<expected-root-cid>",
  "signedTxXdr": "<signed transaction xdr>",
  "car": "<base64-car-bytes>"
}
```

A request carries one proof: `signedTxXdr`, or `txHash` in its place.

- `signedTxXdr` is the envelope the dapp is about to send. The dapp uploads
  first and sends after, so the worker never sees it land: it simulates it
  instead (see below).
- `txHash` is a transaction a wallet already submitted. Smart-account wallets
  such as Nido submit through their own relayer, so the dapp has no envelope
  signed by its source and uploads once the transaction has landed.

The worker verifies the upload request by:

- for `signedTxXdr`, it checks the envelope is for `NETWORK_PASSPHRASE`, is
  signed by its source account, expires within the hour, and calls the
  `TANSU_CONTRACT_ID` contract with `cid` as an argument
- for `signedTxXdr`, it then simulates the envelope on `SOROBAN_RPC_URL` in
  enforce mode: the call must succeed with the authorizations it carries, as
  the ledger would run it now. A signature alone proves nothing, since anyone
  with a keypair can sign a call they never send
- for `txHash`, it fetches the transaction from Soroban RPC, checks it
  succeeded, and checks it calls `TANSU_CONTRACT_ID` with `cid` as an argument
- it checks the CAR (at most 50 MB) has exactly one root, equal to `cid`
- it uploads to Filebase with exponential backoff retries
- it can pin that CID on Pinata asynchronously with exponential backoff retries

A landed transaction is not simulated: it already paid for its CID, and the CAR
root must equal that CID.

Beyond the worker, put a Cloudflare rate-limiting rule on the custom domains
(Security → WAF) to bound the requests one address may send.

## Returns JSON

```json
{
  "success": true,
  "cid": "<cid>"
}
```

- If the request does not check out, or the ledger would refuse the call,
  `success` is `false` and the HTTP status is `400`.
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

`NETWORK_PASSPHRASE`, `TANSU_CONTRACT_ID` and `SOROBAN_RPC_URL` are plain
variables, not secrets: `wrangler.toml` sets them per environment, the contract
ids from `deployments/tansu-*`. All three are required: without
`SOROBAN_RPC_URL` no upload can be checked.

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

The upload script generates a CAR, simulates and signs a Tansu call recording
its CID (never submitted) with a new friendbot-funded testnet account, or the
one in `TEST_SIGNER_SECRET`, and sends the same JSON payload the dapp sends.
A successful local test confirms
the blocking Filebase upload path. When Pinata pinning is enabled, that step
runs asynchronously after the response is returned.

## Deployment

### Prerequisites

```bash
bunx wrangler login
```

### Security

All secrets are stored in Cloudflare Secrets. Set them with wrangler:

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
