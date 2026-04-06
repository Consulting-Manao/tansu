# IPFS Delegation Worker

Cloudflare Worker that accepts CAR files and uploads them to IPFS via dual-provider pinning (Filebase + Pinata).

## API

```json
POST /
{
  "x-expected-cid": "<cid>",
  "Content-Type": "application/vnd.ipld.car"
}
```

## Returns JSON:

```json
{
  "success": true,
  "filebase": true,
  "pinata": true,
  "cid": "<cid>",
  "providers": {
    "filebase": { "ok": true, "name": "filebase" },
    "pinata": { "ok": true, "name": "pinata" }
  }
}
```

- If both providers fail, success is false and the HTTP status is 502.
- If one provider fails, the response still returns success: true but includes which provider failed.

## Development

Add your environment variables (create .env):

```bash
PUBLIC_DELEGATION_API_URL=""
FILEBASE_TOKEN=<filebase_api_token>
PINATA_JWT=<pinata_jwt>
ALLOWED_ORIGINS=*
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

## Deployment

### Prerequisites

```bash
bunx wrangler login
```

### Security

All secrets are stored in Cloudflare Secrets. Set secrets via wrangler (per environment):

```bash
# Development
bunx wrangler secret put FILEBASE_TOKEN --env testnet
bunx wrangler secret put PINATA_JWT --env testnet

# Production
bunx wrangler secret put FILEBASE_TOKEN --env production
bunx wrangler secret put PINATA_JWT --env production
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
