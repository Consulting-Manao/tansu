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

## Git Metadata Providers

The dapp fetches repository metadata directly from provider APIs in the browser.

- Supported public providers are GitHub, GitLab, Bitbucket, Codeberg, and Gitea.
- Repository metadata features are intentionally limited to those provider APIs.
- Access is unauthenticated only, so metadata is limited to public repositories and subject to provider CORS and rate
  limits.

## Testing

```bash
bun run lint        # prettier, eslint, ts-prune and the contract error mapping
bun run check       # astro check (TypeScript)
bun run test:unit   # Vitest: tests/unit/**/*.test.ts
bun run test        # Playwright flows: tests/*.spec.ts
```

CI runs all four. Unit tests read `.env.example`, not your local `.env`, so they behave the same on every machine.

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
- **State Management**: Nanostores for reactive state management
- **Wallet Integration**: Stellar Wallets Kit for secure wallet connections
- **IPFS Services**: Decentralized content storage and retrieval
