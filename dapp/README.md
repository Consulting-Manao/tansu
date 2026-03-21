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
├── tests/                  # End-to-end tests with Playwright
└── voting.ts               # Cryptographic voting utilities
```

## 🚀 Getting Started

### Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/Consulting-Manao/tansu.git
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

## Git Backends

The dapp now supports two interchangeable repository metadata backends.

### 1. Provider API mode via Cloudflare Worker

Use this when you want a pure Cloudflare deployment and your repositories live on supported providers.

- Set `PUBLIC_GIT_PROXY_URL` to your deployed worker URL.
- The worker currently supports GitHub, GitLab, Bitbucket, Codeberg, and Gitea.
- Provider tokens are optional but recommended to avoid low anonymous rate limits.
- Worker setup and token configuration are documented in [workers/git-proxy/README.md](./workers/git-proxy/README.md).

### 2. Local or container-backed git mode

If `PUBLIC_GIT_PROXY_URL` is unset, the frontend calls the Astro endpoint at `/api/git`.

- This mode shells out to the local `git` binary.
- It supports public `http://` and `https://` repositories, including hosts outside the built-in provider list.
- SSH repositories remain restricted to known hosts plus any hosts listed in `GIT_ALLOWED_HOSTS`.
- The endpoint rejects localhost, private IP space, and non-standard HTTP(S) ports to avoid turning the server into a private-network proxy.

### Choosing a mode

- Use the worker mode if you want a single Cloudflare deployment with provider APIs.
- Use the local/container mode if you need arbitrary public HTTP(S) git hosting.

## Validation

Verified in this workspace:

- `npx vitest run src/pages/api/git.test.ts src/utils/contractErrors.test.ts src/utils/errorHandler.test.ts src/utils/extractConfigData.test.ts`
- `npm test && npm run check` in [workers/git-proxy](./workers/git-proxy)

### Technology Stack

- **Framework**: [Astro](https://astro.build/) - Static site generator
- **UI Library**: [React](https://react.dev/) - Interactive components
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- **Language**: [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- **Package Manager**: [Bun](https://bun.sh/) - Fast JavaScript runtime
- **Testing**: [Playwright](https://playwright.dev/) - End-to-end testing
- **Blockchain**: [Soroban](https://soroban.stellar.org/) - Stellar smart contracts

### Key Components

- **FlowProgressModal**: Standardized flow component for all user journeys
- **Contract Services**: Type-safe contract interaction layer
- **State Management**: Nanostores for reactive state management
- **Wallet Integration**: Stellar Wallets Kit for secure wallet connections
- **IPFS Services**: Decentralized content storage and retrieval
