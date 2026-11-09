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

`bun run build` also writes `dist/sw.js` (the `serviceWorker()` integration in `astro.config.mjs`). It precaches the pages, scripts, styles, images and fonts, so the app installs and opens offline; WebAssembly (the XDR decoder of a proposal's raw transaction, the PDF receipt) is cached the first time a page uses it, not installed with the app. On Netlify each file is precached under the URL the pages load it with, `?dpl=<deploy>` included: the adapter stamps the deploy into every import without renaming files, and the CDN keeps a plain `/_astro/` URL on whichever deploy first served it. A worker that cached plain URLs could mix two deploys, and with them two copies of React. The adapter does not stamp the lists of files a lazy chunk preloads (`__vite__mapDeps`), so the build stamps them (`stampPreloads`): otherwise a dialog's first opening fetches its imports twice. The e2e server keeps `/_astro/` files the same way, so `tests/update.spec.ts` catches such a mix.

The worker waits: a new deploy is offered by the "A new version is ready" card (`src/components/layout/UpdatePrompt.astro`, logic in `src/utils/serviceWorker.ts`), and a tab keeps its version until the user presses Reload. The app looks for a new `sw.js` every hour and whenever the tab comes back, since page changes through the ClientRouter never do. The service worker only registers in production builds: `bun dev` has none.

Links to a project and its tabs, a proposal and a member come from `projectUrl(name, tab)`, `proposalUrl` and `memberUrl` in `src/utils/urls.ts`; `/governance/` only redirects old links to a project's Proposals tab. Their trailing slash is the URL Netlify serves without a redirect and the one the precache matches.

Art: `bun run art` writes the home hero's and the page bands' history art into `src/assets/art/` (`scripts/history-art.py`, Python 3, no packages); `src/styles/history-art.css` colours it for both themes.

Icons: `bun run icons` renders `assets/icon.svg` and `assets/icon-maskable.svg` into the PNGs in `public/` (needs `rsvg-convert`).

## Data and caching

Every read is a [TanStack Query](https://tanstack.com/query) query, built by a factory next to its service: the contract (`projectQuery` in `src/service/ProjectService.ts`, `memberQuery` in `MemberService.ts`, `proposalQuery` in `ProposalService.ts`, ...), IPFS files (`ipfsQuery` in `src/utils/ipfsFunctions.ts`), git hosts (`commitHistoryQuery` in `RepositoryMetadataService.ts`, `contributionMetricsQuery`) and Horizon (`activityQuery` in `OnChainActivityService.ts`). `useProjectConfig` turns a project's `tansu.toml` into its display config. Islands are separate React roots, so there is no provider: components call `useQuery(options, queryClient)` with the one client in `src/service/queryClient.ts`, and other code calls `queryClient.query(options)`.

There is no copy of the current project: a page reads its name from the address (`projectNameFromUrl`) and asks the queries, which the project and proposal pages and their islands share.

- **Keys** start with the domain, then the project key in hex, an address or a URL: `["project", key]`, `["proposal", key, id]`, `["member", address]`, `["ipfs", cid, path]`, `["repo", url, ...]`, `["activity", address]`. A write refreshes what it changed by prefix: `invalidateAfter(write, ...keys)` refetches them once the write settles, even if it failed, since it may have landed. The text files a project flow uploads go straight into their `ipfs` query: content under a CID never changes, and a gateway may not serve it yet.
- **Ledger reads**: a getter that only returns a storage entry is read from the ledger, not simulated (`src/service/ledger.ts`): the project, its badges, its last commit, its anonymous key, the proposal count and the proposals. A ledger read answers in a fraction of a second where a simulation takes seconds, and the reads asked for within 10 ms share one `getLedgerEntries` call. Lists read a proposal's summary (`proposalSummaryQuery`: its `Proposal` and `Voters` entries, who voted but not the ballots); the proposal page adds the ballots that still live (`proposalQuery`, equal to `get_proposal`). These readers depend on the contract's storage keys and types (`ProjectKey` in `contracts/tansu/src/types.rs`): a contract change to them changes the readers too.
- **Freshness** follows how often the data changes: 10 minutes for projects, badges and members, 5 for commits and evidence, 1 for proposals, attestations and on-chain activity, 60 for the anonymous voting setup and git hosts. IPFS files, and the summary of an executed proposal, never go stale.
- **Errors** are errors, not missing data. `readResult` in `src/utils/contractErrors.ts` turns the contract's not-found errors into `null` and throws any other failure; a missing IPFS file is `null`, while a dead CID or a failed request throws. Failures are retried (git hosts only on network errors, rate limits and 5xx), never kept.
- **Persistence**: successful reads are kept in IndexedDB (`keyval-store`) for 7 days, so a page renders at once from the last visit, even offline, and refreshes in the background. An absent answer (`null`) is not kept, since what is absent can be created; a missing proposal is, since ids are not reused. A new build (`PUBLIC_BUILD`) or contract drops them all. Voting power stays in memory.
- **Reads use `tansuReads`**, a client without a source account: a write sets one on the default client, and with it every read would fetch the account first.

**Writes** live next to the reads, in the same domain services (`registerProject`, `vote`, `setEvidence`, ...), and all land through `sendTransaction` in `src/service/TxService.ts`. A write with files first asks the upload worker whether Filebase answers (nothing is signed if it does not). It signs once with the connected wallet, sends and confirms the transaction (or only confirms it, when the wallet submitted it itself, as Nido does), uploads the call's IPFS content with the landed hash as proof, returns the result as the binding types it, and refetches the queries the call changed. If the upload fails after five tries the transaction stays on-chain: the error says so and carries `retry()`. A call is built from the signer's account with `tansuFor(address)`; a smart account's is built from an existing account, since its wallet relays it.

App-wide modals open with `openModal(name, props)` from `src/utils/modals.ts` and show in `ModalHost`: a new one opens on top of those open, and a page change closes them all. A success is a toast (`toast` from `src/components/ui`, shown by `ToastHost`). A search is an address: `/?search=`, with `&member=true` for a member.

The wallet is one address: `connectedPublicKey` in `src/utils/store.ts`, restored from the last visit. `ConnectButton` follows the wallet when the user switches accounts in it, and the wallets kit only loads when a wallet is needed.

One cache sits outside TanStack Query, on purpose: `src/utils/ipfsMissCache.ts` remembers for 24 hours the IPFS URLs a gateway answered for good (no provider, or no such file), below every IPFS read, so a dead CID is asked once; a file no gateway answered for within the deadline is remembered for an hour and stays an error, so a stalled CID costs one wait, not one per visit. A new build clears it with the query cache; uploading a CID clears its entries.

`queryClient.ts` waits for the restore at its top level, so islands render from it. A plain `<script>` must import query modules with `import()` inside its handler: a static import would delay the script past the first `astro:page-load`.

## Git Metadata Providers

The dapp fetches repository metadata directly from provider APIs in the browser.

- Supported public providers are GitHub, GitLab, Bitbucket, Codeberg, and Gitea.
- Each host and its provider are listed once, in `src/utils/editLinkFunctions.ts`, with the public Radicle seeds. Codeberg is read through the Gitea API.
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

The Playwright journeys build the app and use it as a person would, against **testnet**: the Tansu contract, Soroban RPC, Horizon, the IPFS upload worker and the git hosts are real. Only the wallet UI is faked. In `tests/helpers/`:

- `testnet.ts`: sets up what a journey starts from through the contract bindings (`registerProject`, `createProposal`, …), uploads through the real worker (`land()`) and reads the chain back (`read.*`);
- `wallet.ts`: a GHOSTSIG wallet that signs with a friendbot-funded key;
- `app.ts`: the fixtures (the wallet, the Terms accepted) and the rule that any page error fails the test;
- `serve.ts` and `env.ts`: serve `dist/` on port 4321, the origin the testnet upload worker accepts.

A journey that writes fails when the testnet upload worker or Filebase is down: check them before the code. `tests/kit.spec.ts` checks the kit page, with no wallet and no network.

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

- **UI kit**: `src/components/ui/` (every piece, on the design-system tokens of `src/styles/global.css`; `/kit/` shows them in light and dark); every write runs in its `FlowDialog`
- **Contract Services**: Type-safe contract interaction layer
- **Data**: TanStack Query for every read, kept in IndexedDB; nanostores for the wallet, the open dialogs and the toasts
- **Wallet Integration**: Stellar Wallets Kit for secure wallet connections
- **IPFS Services**: Decentralized content storage and retrieval
- **Markdown**: one `Markdown` component renders what users wrote; raw HTML is limited to formatting tags
- **Legal pages**: `/terms/`, `/privacy/`, `/impressum/` and the terms modal are built from the root `legal/` files; the modal's summary and the Terms' version (their date) are in `src/constants/terms-summary.json`, and the terms gate (`utils/terms.ts`) asks again when that version changes
