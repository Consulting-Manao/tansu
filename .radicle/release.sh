#!/usr/bin/env bash
# Build and publish contract releases locally. See .radicle/README.md.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

command=${1:?Usage: release.sh build|verify|publish TAG [IMAGE]}
tag=${2:?Provide a release tag, e.g. v3.0.1}
[[ $tag =~ ^v[0-9][A-Za-z0-9.+_-]*$ ]] || { echo 'Invalid release tag' >&2; exit 1; }
revision=$(git rev-parse --verify "refs/tags/$tag^{commit}")
root=$PWD
output=$root/release/$tag
repository=rad:zssaAF91kxuquZmZCV2SiK2FNX6s
workflow=https://radicle.network/nodes/radicle.consulting-manao.com/$repository/tree/$(git rev-parse HEAD)/.radicle/release.sh

verify() {
    local expected actual
    (
        cd "$output"
        # Compare the complete file list too: never sign an extra, unchecked WASM.
        sha256sum source.tar build.log provenance.json ./*.wasm | diff -u SHA256SUMS -
        jq -e --arg tag "$tag" --arg revision "$revision" '
            .predicate.buildDefinition.externalParameters.tag == $tag and
            .predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit == $revision
        ' provenance.json >/dev/null
        jq -r '.subject[] | "\(.digest.sha256)  \(.name)"' provenance.json | sha256sum --check -
        # Check the archive against Git too, so a moved tag cannot reuse a build.
        expected=$(git -C "$root" archive --format=tar --prefix=source/ "$revision" | sha256sum)
        actual=$(sha256sum source.tar)
        [[ ${expected%% *} == "${actual%% *}" ]]
        jq -e --arg hash "${actual%% *}" \
            '.predicate.buildDefinition.resolvedDependencies[1].digest.sha256 == $hash' provenance.json >/dev/null
    )
}

build() {
    local image=${3:?Provide a trusted Stellar CLI image pinned by digest}
    local source source_hash platform toolchain metadata package version wasm
    [[ $image =~ ^(localhost(:[0-9]+)?|[^/@[:space:]]*[.:][^/@[:space:]]*)/[^@[:space:]]+@sha256:[0-9a-f]{64}$ ]] \
        || { echo 'Use an explicit registry and a sha256 image digest' >&2; exit 1; }
    # A multi-architecture index does not identify a reproducible build environment.
    docker manifest inspect "$image" | jq -e 'has("config") and has("layers") and (has("manifests") | not)' >/dev/null
    docker pull "$image"
    docker image inspect "$image" | jq -e '
        .[0].Config | .WorkingDir == "/source" and (.Entrypoint[-1] | endswith("stellar"))
    ' >/dev/null
    platform=$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}')
    toolchain=$(docker run --rm --entrypoint rustup "$image" show active-toolchain | cut -d ' ' -f1)
    mkdir -p "$root/release"
    mkdir "$output" # Refuse to overwrite a previous or incomplete build.
    git archive --format=tar --prefix=source/ --output="$output/source.tar" "$revision"
    source_hash=$(sha256sum "$output/source.tar")
    source_hash=${source_hash%% *}
    # EXIT traps run after Bash unwinds function locals; retain the cleanup path.
    temporary=$(mktemp -d)
    trap 'rm -rf "$temporary"' EXIT
    tar -xf "$output/source.tar" -C "$temporary"
    source=$temporary/source
    local -a container=(docker run --rm --platform "$platform" --user "$(id -u):$(id -g)"
        --volume "$source:/source" --env "RUSTUP_TOOLCHAIN=$toolchain")
    metadata=$("${container[@]}" --entrypoint cargo "$image" metadata --no-deps --format-version=1)
    : > "$output/build.log"
    for package in tansu tansu-executor; do
        version=$(jq -er --arg package "$package" '.packages[] | select(.name == $package) | .version' <<< "$metadata")
        local -a options=("--package=$package" --profile=release --locked --optimize)
        local -a meta=(--meta source_repo=github:Consulting-Manao/tansu --meta home_domain=tansu.dev
            --meta "bldimg=$image" --meta "source_sha256=$source_hash")
        for option in "${options[@]}"; do meta+=(--meta "bldopt=$option"); done
        "${container[@]}" "$image" contract build "${options[@]}" "${meta[@]}" 2>&1 | tee -a "$output/build.log"
        wasm=${package}_v${version}.wasm
        cp "$source/target/wasm32v1-none/release/${package//-/_}.wasm" "$output/$wasm"
    done
    (
        cd "$output"
        # The signed Radicle registration authenticates this statement and its subjects.
        jq -n --arg tag "$tag" --arg revision "$revision" --arg repository "$repository" \
            --arg workflow "$workflow" --arg image "$image" --arg platform "$platform" \
            --arg toolchain "$toolchain" --arg source_hash "$source_hash" \
            --arg tansu "$(sha256sum tansu_v*.wasm)" --arg executor "$(sha256sum tansu-executor_v*.wasm)" '
            def subject($sum): $sum | split("  ") | {name: .[1], digest: {sha256: .[0]}};
            {
                _type: "https://in-toto.io/Statement/v1",
                subject: [subject($tansu), subject($executor)],
                predicateType: "https://slsa.dev/provenance/v1",
                predicate: {
                    buildDefinition: {
                        buildType: $workflow,
                        externalParameters: {tag: $tag, image: $image, platform: $platform,
                            packages: ["tansu", "tansu-executor"],
                            options: ["--profile=release", "--locked", "--optimize"]},
                        internalParameters: {RUSTUP_TOOLCHAIN: $toolchain},
                        resolvedDependencies: [
                            {uri: $repository, digest: {gitCommit: $revision}},
                            {uri: "source.tar", digest: {sha256: $source_hash}}
                        ]
                    },
                    runDetails: {builder: {id: $workflow}, byproducts: [{name: "build.log"}]}
                }
            }' > provenance.json
        sha256sum source.tar build.log provenance.json ./*.wasm > SHA256SUMS
    )
    rm -rf "$temporary"
    trap - EXIT
    verify
    echo "Built $tag ($revision) in $output"
}

upload() {
    local response
    response=$(curl --silent --show-error --fail --connect-timeout 30 --max-time 600 \
        --config - --form "file=@$1;filename=$(basename "$1")" \
        'https://rpc.filebase.io/api/v0/add?cid-version=1' \
        <<< "header = \"Authorization: Bearer ${FILEBASE_TOKEN}\"") || return
    jq -ser 'last | .Hash | select(type == "string" and test("^b[a-z2-7]+$"))' <<< "$response"
}

publish() {
    verify
    [[ $(rad inspect --rid) == "$repository" ]] || { echo 'Publish from the Tansu Radicle repository' >&2; exit 1; }
    : "${FILEBASE_TOKEN:?Set FILEBASE_TOKEN to upload the release}"
    local log_url release file cid ipfs
    log_url=ipfs://$(upload "$output/build.log")
    if ! rad-job --no-sync show "$revision" >/dev/null; then rad-job --no-sync new "$revision"; fi
    run=$(rad-job --no-sync run "$revision" "$log_url")
    rc=0 # Keep the run and exit status available to the EXIT trap as well.
    trap 'rc=$?; if (( rc != 0 )); then rad-job --no-sync failed "$revision" "$run"; fi; exit "$rc"' EXIT
    # Use the commit: Radicle tags may only exist in a delegate's namespace.
    release=$(rad-artifact create "$revision" --no-input --no-announce)
    for file in "$output"/source.tar "$output"/build.log "$output"/provenance.json "$output"/*.wasm "$output"/SHA256SUMS; do
        if [[ $file == "$output/build.log" ]]; then ipfs=$log_url; else ipfs=ipfs://$(upload "$file"); fi
        cid=$(rad-artifact register "$file" --release "$release" --name "$tag/$(basename "$file")" \
            --json --no-input --no-announce | jq -er '.cid')
        rad-artifact location add "$ipfs" --release "$release" --cid "$cid" --no-input --no-announce
    done
    rad-job --no-sync succeeded "$revision" "$run"
    trap - EXIT
    rad sync --announce
    echo "Published $tag as Radicle release $release"
}

case $command in
    build) build "$@" ;;
    verify) verify ;;
    publish) publish ;;
    *) echo 'Usage: release.sh build|verify|publish TAG [IMAGE]' >&2; exit 1 ;;
esac
