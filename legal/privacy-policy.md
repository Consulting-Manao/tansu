# Privacy Policy - Tansu

**Last Updated: 30 September 2026**

## 1. Introduction

Consulting Manao GmbH ("Company", "we", "us") operates the Tansu decentralized governance platform ("dApp", "Service") at app.tansu.dev and testnet.tansu.dev, and the Tansu website at tansu.dev. This Privacy Policy explains which personal data we process, for what purpose, and your rights under the General Data Protection Regulation (GDPR), the Austrian Data Protection Act (DSG) and the Austrian Telecommunications Act 2021 (TKG 2021).

**Universal Application**: This Privacy Policy applies to every user, wherever they live.

**Minimal Data Collection**: The dApp runs in your browser. It reads the Stellar blockchain, IPFS and git hosts directly, and writes to the Stellar blockchain through your wallet. Besides hosting the dApp and the website, we run two servers it calls: the upload service that puts your files on IPFS, and a Radicle seed node. We keep no user database, set no cookies and use no analytics or tracking.

**Note**: Reading our Terms of Service first will help you understand the terminology used in this Privacy Policy.

## 2. Data Controller

The controller for the processing described here is:

Consulting Manao GmbH  
Köppling 35  
8565 Söding-Sankt Johann  
Austria  
Email: legal@consulting-manao.com

## 3. Types of Data We Collect

We keep no user accounts. Data about you ends up in these places:

- On the Stellar blockchain (public and permanent): what you do through the dApp
- On IPFS (public): the files you upload
- In your browser: the entries listed in Section 12
- In the logs of the hosts your browser contacts (Section 6)

### 3.1 Data You Provide Directly

- The Stellar address (public key) of your wallet
- The member profile you choose to publish: name, description, links, picture and git identity
- The projects, proposals, votes and configuration files you submit
- The messages you send to legal@consulting-manao.com, including reports of illegal content

**User Responsibility**: You are responsible for ensuring uploaded content complies with privacy laws and does not contain personal data of others without consent.

### 3.2 Data Collected Automatically

**Blockchain Data** (publicly visible on the Stellar network):

- Transaction hashes and timestamps
- Smart contract interaction data
- Voting records and outcomes
- Badge assignments and voting weights

**Connection Data**: When your browser loads the dApp or the website, or requests data from a host listed in Section 6, that host receives your IP address, the address requested, the time and your browser's user agent.

**No Analytics**: Consulting Manao GmbH runs no analytics. The dApp and the website contain no analytics, advertising or tracking code.

**IPFS Data** (publicly accessible):

- Content Identifiers (CIDs) of uploaded content
- The content itself, its size and type

### 3.3 Data from Third-Party Services

**Git Hosts**: For a project page, the dApp reads the project's repository from the git host its configuration names (GitHub, GitLab, Bitbucket, Codeberg, Gitea or Radicle): the commit history with its authors as the host publishes them, and the README. To show whether a member's git identity is confirmed, it reads the public SSH keys that the member's GitHub or GitLab account lists.

**Stellar Network**: Account balances and operations from Horizon, and contract data from Soroban RPC.

## 4. Legal Basis for Processing

We process your personal data on the following legal grounds under the GDPR:

**Contract Performance (Article 6(1)(b))**: Providing the functions you use under the Terms of Service: reading and writing on the Stellar blockchain, uploading your files to IPFS, reading git hosts, and keeping your wallet connected.

**Legitimate Interest (Article 6(1)(f))**: Delivering the dApp and the website and keeping them secure and available (logs of our hosting providers and of the upload service), showing the list of wallets with their icons, loading the website's blog pictures, and answering your messages.

**Legal Obligation (Article 6(1)(c))**: Answering data protection requests, handling reports of illegal content under the Digital Services Act (Terms of Service Section 7), and keeping the records the law requires (Section 10).

We do not rely on consent (Article 6(1)(a)) for any processing. Storage on your device is covered by § 165(3) TKG 2021 (Section 12).

**No Automated Decision-Making**: We do not engage in automated decision-making or profiling with legal effects. All governance decisions are made by community members through voting.

## 5. How We Use Your Data

### 5.1 Service Provision

- **Membership**: Registering you as a member and showing your profile
- **Governance Operations**: Facilitating proposal creation, voting, and execution
- **Project Registration**: Managing project information and maintainer roles
- **Badge System**: Assigning and managing voting weights and permissions

### 5.2 Platform Operations

- **Security**: Detecting and stopping attacks on the dApp, the website and the upload service
- **Support**: Answering your messages

### 5.3 Legal Compliance

- **Regulatory Requirements**: Complying with Austrian and EU law, including lawful requests of authorities

## 6. Data Sharing and Third-Party Services

### 6.1 Our Processors

These providers process data on our behalf, under our accounts:

- **Netlify, Inc.** (USA): hosts the dApp and the website
- **Cloudflare, Inc.** (USA): runs the upload service at ipfs.tansu.dev and ipfs-testnet.tansu.dev
- **Filebase, Inc.** (USA): stores the files you upload on IPFS
- **Pinata**: keeps a second copy of uploaded files, when configured

**Data Processing Terms**: These providers process data for us under their data processing terms (GDPR Article 28).

### 6.2 Hosts We Run

| Host | Run by | When | What it receives |
| --- | --- | --- | --- |
| app.tansu.dev, testnet.tansu.dev, tansu.dev | Netlify, for us | Every visit | Your IP address, the pages and files requested, your user agent |
| ipfs.tansu.dev, ipfs-testnet.tansu.dev | Cloudflare, for us | When you save a profile, project, proposal or other file | Your IP address, the files, and the signed transaction with your Stellar address |
| radicle.consulting-manao.com | Us: a Radicle seed node | The home page (Tansu's logo); the Tansu repository | Your IP address, the file requested |

### 6.3 Hosts Your Browser Calls Directly

The dApp and the website call these hosts directly from your browser. None of these calls is covered by a contract of ours. Each host sees your IP address and the request, works under its own privacy policy and may process data outside the EU. Section 14 of the Terms of Service links to the main ones.

| Host | Operator | When | What it receives besides your IP address |
| --- | --- | --- | --- |
| ipfs.filebase.io | Filebase, Inc. (public IPFS gateway) | When the dApp shows content stored on IPFS | The content requested |
| soroban-testnet.stellar.org, horizon-testnet.stellar.org | Stellar Development Foundation | testnet.tansu.dev: when it reads the blockchain or sends your transaction | Your Stellar address, the transactions you send |
| The Stellar RPC and Horizon servers configured for app.tansu.dev | Their providers | app.tansu.dev: when it reads the blockchain or sends your transaction | Your Stellar address, the transactions you send |
| api.github.com, raw.githubusercontent.com | GitHub, Inc. | A project on GitHub; a GitHub identity | The repository or account read |
| gitlab.com | GitLab Inc. | A project on GitLab; a GitLab identity | The repository or account read |
| api.bitbucket.org | Atlassian | A project on Bitbucket | The repository read |
| codeberg.org | Codeberg e.V. | A project on Codeberg | The repository read |
| gitea.com | The operator of gitea.com | A project on Gitea | The repository read |
| iris.radicle.network and the Radicle seed a project names | The seed's operator | A project on Radicle | The repository read |
| communityfund.stellar.org | Stellar Development Foundation | The home page (a featured project's logo) | The image requested |
| stellar.creit.tech, uni.onekey-asset.com, scopuly.com | Creit Technologies (Stellar Wallets Kit), OneKey, Scopuly | When the list of wallets opens | The wallet icons requested |
| Any host an author names | Its operator | When the dApp shows a project logo, or an image in a README, proposal or profile | The image requested |
| avatars.githubusercontent.com | GitHub, Inc. | Blog pages of the website | The author's picture |

**Wallets**: The wallet you connect (a browser extension, a hardware wallet or a web wallet such as Albedo, xBull, GhostSig or Nido) holds your keys and signs under its own privacy policy. A web wallet opens its own page.

### 6.4 Legal Requirements

We may disclose your data when required by law, including:

- Compliance with Austrian or EU legal obligations
- Response to valid legal requests from authorities
- Protection of our rights and the rights of other users
- Prevention of fraud or illegal activities

### 6.5 No Sale of Data

We do not sell, rent, or trade your personal data to third parties for commercial purposes.

## 7. Data Security

### 7.1 Security Measures

- **Encryption**: The dApp, the website and the upload service are served over HTTPS only
- **Wallet Approval**: Every transaction needs your approval in your wallet
- **Upload Checks**: The upload service accepts a file only with a signed Tansu transaction that names it, and keeps its storage credentials as Cloudflare secrets
- **No Framing**: No other site may embed the dApp in a frame

### 7.2 Blockchain Security

- **Non-Custodial**: We do not store or have access to your private keys
- **IPFS Storage**: Files you upload are stored on IPFS through Filebase
- **Public Transparency**: Blockchain transactions are publicly verifiable

### 7.3 Data Breach Response

In the event of a personal data breach, we:

- Notify the Austrian Data Protection Authority within 72 hours where GDPR Article 33 requires it
- Inform affected users without undue delay where GDPR Article 34 requires it
- Take immediate steps to contain and remediate the breach

## 8. Your Rights Under GDPR

You have the following rights regarding your personal data:

### 8.1 Right of Access (Article 15)

You can request information about the personal data we process about you, including:

- Categories of data processed
- Purposes of processing
- Recipients of your data
- Retention periods
- Your rights regarding the data

### 8.2 Right to Rectification (Article 16)

You can request correction of inaccurate or incomplete personal data.

### 8.3 Right to Erasure (Article 17)

You can request deletion of your personal data in certain circumstances, including:

- Data no longer necessary for original purposes
- Unlawful processing
- Objection to processing

**Technical Limitations**:

- **Blockchain Data**: Transactions on the Stellar network are permanent. Neither we nor anyone else can delete them.
- **IPFS Content**: We can remove the copy we store on Filebase. Copies that other IPFS nodes keep stay reachable by their CID; we cannot remove those.
- **On-Chain Unlinking**: We can remove IPFS CID references from our smart contracts (e.g., by revoking proposals), making content no longer discoverable through our dApp
- **CID Persistence**: The content remains accessible via its CID through IPFS gateways, which we cannot control or remove

**User Responsibility**: Before uploading content, consider that IPFS storage is permanent. Do not upload personal data or sensitive information unless you accept this permanence.

**Maintainer Options**: Project maintainers can revoke proposals to unlink content from our dApp, but this does not delete from IPFS.

### 8.4 Right to Restrict Processing (Article 18)

You can request limitation of data processing in certain situations.

### 8.5 Right to Data Portability (Article 20)

You can request a copy of the data you provided to us, in a structured, machine-readable format.

### 8.6 Right to Object (Article 21)

You can object, on grounds relating to your particular situation, to processing based on our legitimate interests (Article 6(1)(f)).

### 8.7 Rights Related to Automated Decision-Making (Article 22)

You have rights regarding automated decision-making, though our platform does not use automated decision-making for individual users.

### 8.8 Right to Lodge a Complaint (Article 77)

You can lodge a complaint with a supervisory authority, in particular in the EU member state where you live or work or where the alleged infringement took place. In Austria, this is the Austrian Data Protection Authority (Section 16).

## 9. Exercising Your Rights

To exercise your rights, contact us at:

**Email**: legal@consulting-manao.com  
**Subject**: Data Protection Request

We will respond to your request within one month (GDPR Article 12(3)). We may request verification of your identity to protect your privacy.

## 10. Data Retention and Deletion

| Data | Retention |
| --- | --- |
| Blockchain data | Permanent: the Stellar network keeps it |
| Files we store on Filebase | While the content is referenced on-chain, or until we remove it after a justified erasure request |
| Copies on other IPFS nodes | Outside our control |
| Access logs of Netlify | As Netlify's terms state |
| Logs of the upload service (Cloudflare Workers Logs) | Up to 7 days |
| Browser storage | See Section 12 |
| Messages to us | Until your request is settled; 7 years where they are business records (§ 132 BAO, § 212 UGB) |

**Deletion Limitations**: Blockchain data cannot be deleted, and IPFS data persists on nodes we do not control. See Terms of Service Section 7 for details.

## 11. International Data Transfers

### 11.1 Data Transfers

Our processors Netlify, Cloudflare and Filebase are in the USA. The hosts in Section 6.3 may process data outside the EU/EEA. The Stellar network and IPFS are global networks: their nodes, anywhere in the world, keep copies of public data.

### 11.2 Safeguards

- **Our Processors**: Transfers to our processors in the USA rely on the EU-US Data Privacy Framework or on standard contractual clauses, as their data processing terms provide.
- **Hosts Your Browser Calls Directly**: No contract of ours covers the calls in Section 6.3. Your browser makes them directly, and the hosts process your data under their own privacy policies.

## 12. Browser Storage and Tracking

### 12.1 No Cookies

The dApp, the website and the upload service set no cookies.

### 12.2 Storage on Your Device

The dApp and the libraries it uses store the following entries in your browser:

| Entry | Storage | Written by | Purpose | Lifetime |
| --- | --- | --- | --- | --- |
| `tansu_tos_accepted` | localStorage | dApp | That you accepted the Terms, when, and which version; a new version asks again | Until you clear the site's data |
| `publicKey` | localStorage | dApp | The address of your connected wallet, to restore the connection on your next visit | Until you disconnect or clear the site's data |
| `tansu_ipfs_misses_v1` | localStorage | dApp | IPFS addresses the gateway reported missing, so they are not requested again | 24 hours per entry |
| `tansu-queries` in the database `keyval-store` | IndexedDB | dApp | A copy of the public data the dApp read (projects, proposals, profiles, IPFS files, repository data), to show pages faster | 7 days; dropped when a new version of the dApp is released |
| `workbox-precache-v2-…` | Cache Storage | dApp's service worker | The dApp's own files, so it opens offline and each tab runs one version | Replaced when you reload to a new version |
| `@StellarWalletsKit/activeAddress`, `@StellarWalletsKit/selectedModuleId` | localStorage | Stellar Wallets Kit | The connected address and the wallet you chose | Until you clear the site's data |
| `@StellarWalletsKit/usedWalletsIds` | localStorage | Stellar Wallets Kit | The wallets you used, listed first next time | Until you clear the site's data |
| `@StellarWalletsKit/hardwareWalletPaths`, `@StellarWalletsKit/wcSessionPaths` | localStorage | Stellar Wallets Kit | The Ledger accounts you connected; WalletConnect sessions, which the dApp does not offer | Until you clear the site's data |
| `g2c:wallet-kit:address` | localStorage | Nido wallet module (testnet only) | The Nido smart account you connected | Until you clear the site's data |
| `albedo_session_<address>` | sessionStorage | Albedo wallet module | The session you granted in Albedo | Until the tab closes or the session expires |
| `LOBSTR_CONNECTION_KEY` | sessionStorage | LOBSTR wallet module | The connection to the LOBSTR extension | Until the tab closes |

The website stores one entry:

| Entry | Storage | Written by | Purpose | Lifetime |
| --- | --- | --- | --- | --- |
| `theme-d52` | localStorage | Docusaurus | The light or dark mode you picked | Until you clear the site's data |

A wallet extension keeps its own data in the extension, under its own privacy policy.

### 12.3 Legal Basis for Storage

No entry is sent to us or used to track you across websites. Each one is needed for the service you use, so storing it needs no consent under § 165(3) TKG 2021. The dApp cannot work without these entries. Clearing the site's data in your browser removes them; the dApp then asks you again to accept the Terms and to connect your wallet.

### 12.4 Third-Party Tracking

We do not use third-party tracking services.

## 13. Children's Privacy

Our services are not intended for children under 18. We do not knowingly collect personal data from children under 18. If we become aware that we have collected data from a child under 18, we delete what we can (Section 8.3).

## 14. Changes to This Privacy Policy

### 14.1 Updates

We may update this Privacy Policy to reflect:

- Changes in our data processing practices
- New legal requirements
- Platform feature updates
- Security improvements

### 14.2 Notification

We publish changes on this page and update the date at the top.

### 14.3 Applicable Version

The version published here applies from the day it is published.

## 15. Data Protection Officer

We are not required to appoint a Data Protection Officer (GDPR Article 37): our core activities involve no large-scale monitoring of people and no special categories of data. Privacy inquiries can be directed to legal@consulting-manao.com.

## 16. Supervisory Authority

You have the right to lodge a complaint with the Austrian Data Protection Authority:

**Österreichische Datenschutzbehörde**  
Barichgasse 40-42  
1030 Wien, Austria  
Website: [www.dsb.gv.at](https://www.dsb.gv.at)

## 17. Contact Information

For any questions about this Privacy Policy or our data practices:

**Consulting Manao GmbH**  
Köppling 35  
8565 Söding-Sankt Johann, Austria  
Commercial register (Firmenbuch): FN 571029z, Landesgericht für ZRS Graz  
VAT ID: ATU77780135  
Managing Director: Dr. DI Pamphile Tupui Christophe Roy

**Contact**:  
Email: legal@consulting-manao.com  
Website: [consulting-manao.com](https://consulting-manao.com)
