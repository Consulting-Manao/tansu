# IPFS Delegation Worker

Cloudflare Worker that verifies a signed transaction and then uploads the raw
files to Filebase. Once Filebase succeeds, it pins the resulting CID on Pinata
in the background when Pinata pinning is enabled.

## API

```json
POST /
{
  "cid": "<expected-root-cid>",
  "signedTxXdr": "<signed transaction xdr>",
  "files": [
    {
      "name": "proposal.md",
      "type": "text/markdown",
      "content": "<base64-file-bytes>"
    }
  ]
}
```

The worker verifies the upload request by:

- it verifies the Stellar transaction signature from `signedTxXdr`
- it checks the transaction has at least one operation
- it recalculates the root CID from the uploaded files and checks it matches
- it uploads to Filebase with exponential backoff retries
- it can pin that CID on Pinata asynchronously with exponential backoff retries

## Returns JSON

```json
{
  "success": true,
  "cid": "<cid>"
}
```

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
```

### Start the Worker

```bash
cd dapp/workers/ipfs-delegation
bun install
bun run dev
```

### Test the Worker

In another terminal:

```bash
cd dapp/workers/ipfs-delegation
bun run test
```

Or against deployed environments (see next section):

```bash
ENV=DEV bun run test  # Use testnet environment
ENV=PROD bun run test # Use production environment
```

The test script generates a test file, calculates its directory CID locally,
signs a local Stellar test transaction, and submits the same JSON payload the
dapp sends. A successful local test confirms the blocking Filebase upload path.
When Pinata pinning is enabled, that step runs asynchronously after the
response is returned.

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
