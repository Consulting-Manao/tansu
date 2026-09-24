# Tansu - dApp

A decentralized application built on Soroban for governance and voting, powered by [Astro](https://astro.build/).

## 🏗️ Project Structure

```text
.
├── src/                    # Source code for the dApp
│   ├── components/         # UI components
│   │   ├── layout/        # Page layouts and navigation
│   │   ├── page/          # Page-specific components
│   │   └── utils/         # Utility components
│   ├── layouts/            # Astro page layouts
│   ├── pages/              # Astro pages and routing
│   ├── contracts/          # Contract interfaces and SDKs
│   ├── service/            # Contract interaction services
│   ├── utils/              # Utility functions and helpers
│   └── types/              # TypeScript type definitions
├── packages/               # Reusable packages
│   └── tansu/             # Core governance utilities
├── public/                 # Static assets and icons
└── tests/                  # Playwright flows (*.spec.ts) and Vitest unit tests (unit/)
```

## 🚀 Getting Started

### Installation

1. **Clone the repository**:

   ```bash
   rad clone rad:zssaAF91kxuquZmZCV2SiK2FNX6s
   # git clone https://radicle.consulting-manao.com/zssaAF91kxuquZmZCV2SiK2FNX6s.git tansu
   cd tansu/dapp
   ```

2. **Install dependencies**:

   ```bash
   bun install
   ```

3. **Environment configuration**:

   ```bash
   cp .env.example .env
   ```

   All variables in `.env.example` are required. `PUBLIC_DELEGATION_API_URL` is used for IPFS upload flows.

See the [contributing guide](../CONTRIBUTING.md) for details about IPFS.

4. **Start development server**:

   ```bash
   bun dev
   ```

5. **Open your browser**: Navigate to `http://localhost:4321`

## Installable app and updates

`bun run build` also writes `dist/sw.js` (the `serviceWorker()` integration in `astro.config.mjs`). It precaches the pages, scripts, styles and images, so the app installs and opens offline. It leaves out the large XDR wasm, which the HTTP cache keeps instead.

The worker waits: a new deploy is offered by the "A new version is ready" card (`src/components/layout/UpdatePrompt.astro`, logic in `src/utils/serviceWorker.ts`), and a tab keeps its version until the user presses Reload. The app looks for a new `sw.js` every hour and whenever the tab comes back, since page changes through the ClientRouter never do. The service worker only registers in production builds: `bun dev` has none.

Links to a project, its proposals and a proposal come from `projectUrl`, `governanceUrl` and `proposalUrl` in `src/utils/urls.ts`. Their trailing slash is the URL Netlify serves without a redirect and the one the precache matches.

Icons: `bun run icons` renders `assets/icon.svg` and `assets/icon-maskable.svg` into the PNGs in `public/` (needs `rsvg-convert`).

## Data and caching

Every read is a [TanStack Query](https://tanstack.com/query) query, built by a factory next to its service: the contract (`projectQuery` in `src/service/ProjectService.ts`, `memberQuery` in `MemberService.ts`, `proposalQuery` in `ProposalService.ts`, ...), IPFS files (`ipfsQuery` in `src/utils/ipfsFunctions.ts`), git hosts (`commitHistoryQuery` in `RepositoryMetadataService.ts`, `contributionMetricsQuery`) and Horizon (`activityQuery` in `OnChainActivityService.ts`). `useProjectConfig` turns a project's `tansu.toml` into its display config. Islands are separate React roots, so there is no provider: components call `useQuery(options, queryClient)` with the one client in `src/service/queryClient.ts`, and other code calls `queryClient.query(options)`.

There is no copy of the current project: a page reads its name from the address (`projectNameFromUrl`) and asks the queries, which the project, governance and proposal pages share.

- **Keys** start with the domain, then the project key in hex, an address or a URL: `["project", key]`, `["proposal", key, id]`, `["member", address]`, `["ipfs", cid, path]`, `["repo", url, ...]`, `["activity", address]`. A write refreshes what it changed by prefix: `invalidateAfter(write, ...keys)` refetches them once the write settles, even if it failed, since it may have landed. The text files a project flow uploads go straight into their `ipfs` query: content under a CID never changes, and a gateway may not serve it yet.
- **Freshness** follows how often the data changes: 10 minutes for projects, badges and members, 5 for commits and evidence, 1 for proposals, attestations and on-chain activity, 60 for the anonymous voting setup and git hosts. IPFS files never go stale.
- **Errors** are errors, not missing data. `readResult` in `src/utils/contractErrors.ts` turns the contract's not-found errors into `null` and throws any other failure; a missing IPFS file is `null`, while a dead CID or a failed request throws. Failures are retried (git hosts only on network errors, rate limits and 5xx), never kept.
- **Persistence**: successful reads are kept in IndexedDB (`keyval-store`) for 7 days, so a page renders at once from the last visit, even offline, and refreshes in the background. A new build (`PUBLIC_BUILD`) or contract drops them. Voting power stays in memory.
- **Reads use `tansuReads`**, a client without a source account: a write sets one on the default client, and with it every read would fetch the account first.

**Writes** live next to the reads, in the same domain services (`registerProject`, `vote`, `setEvidence`, ...), and all land through `sendTransaction` in `src/service/TxService.ts`. It signs once with the connected wallet, uploads the call's IPFS content (the signed envelope authorizes the upload, or the transaction hash when the wallet submitted it itself, as Nido does), confirms the transaction, returns its result as the binding types it, and refetches the queries the call changed. A call is built from the signer's account with `tansuFor(address)`; a smart account's is built from an existing account, since its wallet relays it.

App-wide modals open with `openModal(name, props)` from `src/utils/modals.ts` and show in `ModalHost`, one at a time, closing on page change. A search is an address: `/?search=`, with `&member=true` for a member.

The wallet is one address: `connectedPublicKey` in `src/utils/store.ts`, restored from the last visit. `ConnectButton` follows the wallet when the user switches accounts in it, and the wallets kit only loads when a wallet is needed.

One cache sits outside TanStack Query, on purpose: `src/utils/ipfsMissCache.ts` remembers for 24 hours the IPFS URLs a gateway answered for good (no provider, or no such file), below every IPFS read, so a dead CID is asked once. A new build clears it with the query cache; uploading a CID clears its entries.

`queryClient.ts` waits for the restore at its top level, so islands render from it. A plain `<script>` must import query modules with `import()` inside its handler: a static import would delay the script past the first `astro:page-load`.

## Git Metadata Providers

The dapp fetches repository metadata directly from provider APIs in the browser.

- Supported public providers are GitHub, GitLab, Bitbucket, Codeberg, and Gitea.
- Repository metadata features are intentionally limited to those provider APIs.
- Access is unauthenticated only, so metadata is limited to public repositories and subject to provider CORS and rate
  limits.

## Testing

```bash
bun run lint        # prettier, eslint, knip (unused code) and the contract error mapping
bun run check       # astro check (TypeScript)
bun run test:unit   # Vitest: tests/unit/**/*.test.ts
bun run test        # Playwright flows: tests/*.spec.ts
```

CI runs all four. Unit tests read `.env.example`, not your local `.env`, so they behave the same on every machine.

The Playwright flows build the app and use it as a person would, against fakes in `tests/helpers/`:

- `chain.ts`: an in-memory Tansu contract behind a Soroban RPC;
- `web.ts`: the IPFS gateway, Horizon, the upload worker and GitHub;
- `wallet.ts`: a GHOSTSIG wallet that signs with a test key.

The build points at hosts that never resolve (`env.ts`), so a request no fake answers fails instead of reaching a network. Each test starts from `world()` in `app.ts` and fails on any page error.

TypeScript stays on 6.0: typescript-eslint and `astro check` do not support newer versions yet.

### Technology Stack

- **Framework**: [Astro](https://astro.build/) - Static site generator
- **UI Library**: [React](https://react.dev/) - Interactive components
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- **Language**: [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- **Package Manager**: [Bun](https://bun.sh/) - Fast JavaScript runtime
- **Testing**: [Playwright](https://playwright.dev/) for user flows, [Vitest](https://vitest.dev/) for units
- **Blockchain**: [Soroban](https://soroban.stellar.org/) - Stellar smart contracts

### Key Components

- **FlowProgressModal**: Standardized flow component for all user journeys
- **Contract Services**: Type-safe contract interaction layer
- **Data**: TanStack Query for every read, kept in IndexedDB; nanostores for the wallet
- **Wallet Integration**: Stellar Wallets Kit for secure wallet connections
- **IPFS Services**: Decentralized content storage and retrieval
- **Markdown**: one `Markdown` component renders what users wrote; raw HTML is limited to formatting tags
- **Legal pages**: `/terms/`, `/privacy/` and the terms modal are built from the root `legal/` files
