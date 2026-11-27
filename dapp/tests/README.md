# dApp test coverage and runtime

The release checks remain `bun run test:unit` and `bun run test`. The latter
builds the production app and exercises real testnet services; no journey is
excluded to meet a timing target. Four workers bound contention on the shared
contract and upload service. Keep accounts and project names isolated per test.

## What each browser journey protects

| File                 | Regression coverage                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browse.spec.ts`     | Search, project metadata and tabs, metrics, proposal content, Terms acceptance, mobile overflow                                                                     |
| `navigation.spec.ts` | Terms after a direct legal-page visit; an address payload renders as text, never executable markup                                                                  |
| `member.spec.ts`     | Join and edit a profile with a picture and signed git identity                                                                                                      |
| `project.spec.ts`    | Registration, duplicate names, stale-edit conflict, preserved config, badges and sub-projects                                                                       |
| `governance.spec.ts` | Public weighted voting, proposal creation, removal, revocation, veto evidence, normal and quorum execution                                                          |
| `proposal.spec.ts`   | Typed outcome arguments and slots, removed outcomes, filler calls and changed Registry names at execution                                                           |
| `anonymous.spec.ts`  | Key-file round trip, receipt, fresh key configuration, invalid ballots in reveal and execution, final on-chain result                                               |
| `donate.spec.ts`     | Correct recipient, amount and memo on the payment                                                                                                                   |
| `upload.spec.ts`     | No write when upload health fails; recovery after a landed transaction without losing its files                                                                     |
| `pwa.spec.ts`        | Offline navigation, font precaching and rendering, security contact                                                                                                 |
| `kit.spec.ts`        | Accessible names, keyboard/focus behavior, theme, phone layout and transaction feedback                                                                             |
| `update.spec.ts`     | One changed build across two installed tabs and one uninstalled tab; opt-in reload, deploy consistency, ClientRouter and full navigation to previously cached pages |

Unit tests retain the branches that are expensive or unsafe to enumerate through
testnet: transaction authorization and recovery, untrusted input, cryptographic
ballots and CSV/PDF receipts, ledger decoding, cache invalidation, provider errors,
and date/URL/config transformations. A browser happy path does not replace these
failure cases.

## Cleanup decisions

- The wallet fixture is lazy. Browsing, offline, fonts and update checks no longer
  request irrelevant Friendbot funding. Context-level error checks cover new tabs
  as well as the first page.
- The four overlapping deployment tests share one actual rebuild. Their checks
  for both service-worker modes, multiple tabs, mixed bundles and cached pages
  remain. This saves three production builds, rather than mocking a deployment.
- Outcome and anonymous-vote journeys execute once the sole maintainer has voted,
  using the real quorum rule. They do not wait for a redundant 120/180-second
  voting period. `governance.spec.ts` retains normal post-deadline execution and
  the two-maintainer quorum case.
- Outcome-execution scenarios prepare their ballots with real contract calls.
  They no longer repeat the public-voting UI three times; the governance journey
  retains that complete UI flow. Proposal windows leave ample time for live
  transactions without delaying quorum execution.
- Legal-entry and address-escaping checks have no dependency on project creation
  or uploads. The two project-browsing tests share setup without serial failure
  skipping. Update checks run last as a teardown project, including after failed
  testnet flows.
- The identical padded-signature assertion was removed: the retained known-byte
  signature case uses the same padded input and verifies the full decoded bytes.
- Upload recovery now requires an actual on-chain metadata CID (an error object
  was also truthy), keeps that CID after retry, and checks the recovered profile
  and image bytes. Address escaping also asserts rendered text and no injected
  image, rather than merely observing no alert.
- The assertion-free, normally skipped CSV export runner moved out of unit-test
  discovery to `bun run export:votes`. Its Vite resolver and live export behavior
  remain available explicitly; CSV and anonymous-vote unit coverage stays.

## Measuring and diagnosing

After installing dependencies and Chromium, run from `dapp/`:

```bash
bun run test:unit --reporter=json --outputFile=unit-results.json
bun run test --reporter=json > e2e-results.json
# Focus on local browser behavior while diagnosing a testnet outage:
bun run test tests/kit.spec.ts tests/navigation.spec.ts tests/pwa.spec.ts
bun run test --project=update --no-deps
```

The full browser run includes the initial build and the update rebuild. Record
wall time, failures and skips alongside the JSON report; a fast failing run is
not evidence that the complete suite meets the under-five-minute goal. Dependency
installation and browser downloads are separate setup costs. Do not commit reports
or traces.

The member journey executes the SSH-signing command printed by the app and needs
Bash and OpenSSH. It defaults to `/bin/bash`; on Windows, set `TANSU_E2E_BASH` to
Git Bash's executable (for example, `C:/Program Files/Git/bin/bash.exe`) and keep
Git's OpenSSH tools on `PATH`. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an
installed Chrome when a Playwright browser download is unavailable.

A testnet write depends on Friendbot, RPC, the IPFS worker and the gateway. For
example, upstream run [44515785312](https://github.com/Consulting-Manao/tansu/actions/runs/44515785312)
failed during uploads with HTTP 403/Cloudflare challenge responses before seven
journeys could reach their assertions. Keep those failures visible and resolve
service availability before comparing successful full-suite timings. Do not
replace the live services with success stubs or lower timeouts to manufacture a
passing performance result.
