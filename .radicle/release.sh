#!/usr/bin/env bash
# Build, verify, or publish a tagged release locally. See .radicle/README.md.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
exec python3 .radicle/release.py "$@"
