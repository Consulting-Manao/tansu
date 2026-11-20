# Dependency updates on Radicle

Dependency maintenance uses a short-lived container and the existing `.radicle/ci.sh`
runner. There is no Dependabot configuration, GitHub token, hosted bot, Kubernetes
cluster or new service to administer. GitHub remains a mirror; unrelated deployment
and release workflows have not been removed.

## Propose an update

From a clean, reviewed commit on an update branch:

```sh
git submodule update --init
make dependency_update                       # Docker
make dependency_update dependency_engine=podman
```

The resolver image is built from `tools/dependencies/Dockerfile`. Its Bun, uv and
Rust versions are pinned; review those image tags when refreshing tooling.
`DEPENDENCY_IMAGE` overrides the local tag used when building the resolver.
This target requires a Docker-compatible CLI (Docker or Podman), Bash and Git.
It does not use the release target's `engine=apple-container` interface.

The container receives a read-only `git archive HEAD`, not the checkout, `.git`,
SSH agent, Radicle keys, Docker socket or host home directory. It runs as the invoking
user with a read-only root filesystem, temporary writable storage, dropped capabilities
and resource limits. Registry access is required. Bun lifecycle scripts are disabled;
Python metadata resolution can still run build backends inside the container.

Each successful run writes a new ignored `dependency-update-<sha>-*/` directory:

- `base.txt`: the exact source commit;
- `updates.patch`: an allowlisted patch of dependency files, including new Python locks;
- `summary.txt`: changed files, or an explicit no-update result;
- `policy.json`: compatibility holds and the fact that validation has not run.

A resolver failure (including a command exceeding 30 minutes) exits nonzero, without a completed patch or base marker. Read the
container log, correct the cause and rerun. No checkout is modified, commit created,
patch opened, transaction signed or branch pushed by this command. Do not apply a
patch whose base commit differs from the intended branch without reviewing the diff.

```sh
git apply --check dependency-update-<sha>-<suffix>/updates.patch
git apply dependency-update-<sha>-<suffix>/updates.patch
git diff
```

## Update policy and coverage

| Area                                | Resolution                                     | Deliberate limits                                                                                                                  |
| ----------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Rust workspace                      | `cargo update`, root `Cargo.lock`              | Declared semver and Rust compatibility constraints remain. A new Soroban major needs a separate contract review.                   |
| dApp, website, upload worker        | Bun updates manifests and text lockfiles       | Existing ranges, exact pins, overrides and patched dependencies remain; seven-day release age.                                     |
| Python service and pre-push package | `uv lock --upgrade`, one `uv.lock` per project | Declared Python support and dependency ranges remain; seven-day release age. The hook declares Python 3.12+, matching the service. |
| Three governance scripts            | `uv lock --script`, adjacent `.py.lock` files  | PEP 723 requirements remain; the scripts themselves are never executed by the updater.                                             |
| Pre-commit hooks                    | `pre-commit autoupdate`                        | Refresh revisions only; never run hooks or the on-chain pre-push action.                                                           |

The Python release-age setting is also stored in project and script metadata, so
ordinary `uv run`, `uv sync --locked` and `uv lock --check` use the same policy.

The updated Astro requires Node 22.23.4 or newer. The dApp must remain on TypeScript 6.0 while Astro check and typescript-eslint require
it. The Nido module stays patched until its upstream fix can replace the patch.
`dapp/packages/tansu/package.json` is generated and is preserved; upgrade its SDK or
TypeScript through `make contract_bindings`, not by editing generated files.

This is **latest compatible**, not an automatic major-version migration. Exact pins
(including the Docusaurus family), major upgrades, overrides, tool images and legacy
GitHub workflow action pins need explicit review. Use `bun outdated` in each Bun
project to inspect held versions. Cargo and pre-commit do not implement the Bun/uv
release-age policy; their candidates still require review and validation.

## Validate the reviewed candidate

```sh
make dependency_checks
# After human review and committing the candidate, with a configured rad remote:
make radicle_dependency_checks
```

The checks include updater tests, contract build/tests/Clippy/format, dApp lint/types/
unit tests/build, website checks/build, worker types/tests, Python tests and lock
consistency, and Trivy. They use frozen/locked dependencies. Install the project tools
and configure the dApp as described in CONTRIBUTING.md. Backend fixtures recreate
tables: start the disposable local `tansu_test` database from `docker-compose.yml`;
the check script forces this database and its test credentials on localhost. Set
`DEPENDENCY_TEST_DB_PORT` only when that disposable database uses another local port.
Full Playwright journeys are an additional testnet check (`cd dapp && bun run test`).

The Radicle target delegates recording, exit status and logs to the pinned CI
submodule. It requires the normal maintainer Radicle identity and `rad` remote on the
host; no identity enters the dependency resolver. A failed check remains a failed
Radicle job. Review the log before submitting a Radicle patch using the project's
normal contribution process. The updater never publishes candidates automatically.

## Weekly operation

Run `make dependency_update` weekly by hand, or from the existing CI host's cron/systemd
timer in a dedicated clean checkout. For example, a Linux cron entry can use `flock`
to prevent overlapping jobs:

```cron
0 6 * * 1 cd /srv/tansu-deps && flock -n /srv/tansu-deps-update.lock make dependency_update >> /srv/tansu-deps-update.log 2>&1
```

Keep that checkout synchronized with the reviewed Radicle main branch before each run.
This timer only produces candidates; a maintainer reviews/applies/commits one and runs
the Radicle validation target. Retain the artifacts needed for review and remove older
output directories according to the host's retention policy. No timer is installed
by this repository.

Resolver behavior follows the official [Bun update](https://bun.com/docs/pm/cli/update)
and [uv locking](https://docs.astral.sh/uv/concepts/projects/sync/) documentation.
