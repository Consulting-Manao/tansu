#!/usr/bin/env bash
# Export a dependency patch from a credential-free container; never modify the checkout.
set -euo pipefail
root=$(git rev-parse --show-toplevel)
cd "$root"
if [[ -n $(git status --porcelain) ]]; then
    echo "Review and commit changes before resolving dependencies of HEAD." >&2
    exit 1
fi
engine=${DEPENDENCY_ENGINE:-docker}
image=${DEPENDENCY_IMAGE:-tansu-dependency-updater:local}
command -v "$engine" >/dev/null
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
git archive --format=tar HEAD > "$scratch/source.tar"
sha=$(git rev-parse HEAD)
output=$(mktemp -d "$root/dependency-update-${sha:0:8}-XXXXXX")
# Only the resolver files enter the image build context, never credentials or the checkout.
"$engine" build --tag "$image" tools/dependencies
"$engine" run --rm --read-only --cap-drop=ALL --security-opt=no-new-privileges \
    --user "$(id -u):$(id -g)" --pids-limit=256 --memory=4g --cpus=2 \
    --tmpfs /tmp:rw,exec,nosuid,size=3g \
    --mount "type=bind,source=$scratch,target=/input,readonly" \
    --mount "type=bind,source=$output,target=/output" \
    "$image"
printf 'Base commit: %s\n' "$sha" > "$output/base.txt"
printf 'Review %s/updates.patch and summary.txt; nothing was committed or pushed.\n' "$output"
