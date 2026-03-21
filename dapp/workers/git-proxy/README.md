# Git Proxy Worker

Cloudflare Worker that implements the dapp's existing git metadata API without shelling out to the `git` binary.

This is the provider-API backend. If you need arbitrary public `http://` or `https://` git repositories, leave `PUBLIC_GIT_PROXY_URL` unset in the dapp and use the local/container-backed Astro endpoint instead.

It supports the same POST actions as the current Astro endpoint:

- `history`
- `commit`
- `latest-hash`
- `readme`

The worker currently supports these public git hosts:

- GitHub
- GitLab
- Bitbucket
- Codeberg
- Gitea

Repository URLs for this worker must be either:

- `https://<supported-host>/<owner>/<repo>`
- `git@<supported-host>:<owner>/<repo>.git`

Unsupported hosts and arbitrary public git origins should use the local/container-backed backend.

## API

```json
POST /
{
  "action": "history",
  "repoUrl": "https://github.com/owner/repo",
  "page": 1,
  "perPage": 30
}
```

All responses are JSON and match the shape expected by `dapp/src/service/GithubService.ts`.

## Local development

```bash
cd dapp/workers/git-proxy
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

## Local checks

```bash
cd dapp/workers/git-proxy
npm test
npm run check
```

## Dapp wiring

Point the frontend at the worker URL:

```bash
PUBLIC_GIT_PROXY_URL=https://<your-worker>.workers.dev
```

If `PUBLIC_GIT_PROXY_URL` is not set, the dapp falls back to `/api/git` and uses the local `git` binary instead.

## Optional provider credentials

Public repositories work without tokens, but rate limits are much better with provider credentials.

- `GITHUB_TOKEN`: GitHub personal access token
- `GITLAB_TOKEN`: GitLab personal access token
- `BITBUCKET_USERNAME` and `BITBUCKET_APP_PASSWORD`: Bitbucket app password credentials
- `CODEBERG_TOKEN`: Codeberg token
- `GITEA_TOKEN`: Gitea personal access token

## Cloudflare deployment

```bash
cd dapp/workers/git-proxy
npm install
npx wrangler login
npx wrangler deploy
```

### CORS configuration

`CORS_ALLOWED_ORIGINS` is optional.

- If you do not set it, the worker uses the built-in defaults from `src/gitProxy.ts`.
- If you need a different allowlist, set it in `wrangler.toml` under `[vars]`.
- The value should be a comma-separated list of origins.

Example:

```toml
[vars]
CORS_ALLOWED_ORIGINS = "http://localhost:4321,https://app.tansu.dev,https://testnet.tansu.dev"
```

If you want different values per Cloudflare environment, define them in the corresponding Wrangler environment section instead of the shared top-level config.

If you want tokens stored as Cloudflare secrets:

```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put GITLAB_TOKEN
npx wrangler secret put BITBUCKET_USERNAME
npx wrangler secret put BITBUCKET_APP_PASSWORD
npx wrangler secret put CODEBERG_TOKEN
npx wrangler secret put GITEA_TOKEN
```