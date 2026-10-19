#!/usr/bin/env bash
# cargo install radicle-job --locked

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

rad_ci_branch=rad-ci
rid=$(rad inspect --rid)
node=${RADICLE_LOG_NODE:-iris.radicle.xyz}
sha=$(git rev-parse HEAD)
keep=90
date=$(date -u +%F)
log=.radicle/ci/${date}_${sha}.log

rad_push_url=$(git config --get remote.rad.pushurl)
rad_namespace=${rad_push_url##*/}
uri=https://radicle.network/nodes/$node/$rid/remotes/$rad_namespace/tree/$rad_ci_branch/$log

git fetch rad

# new worktree with orphan branch to run CI and create log
ci_worktree_dir=$(mktemp -d)
git worktree add --detach "$ci_worktree_dir" HEAD

(
  cd "$ci_worktree_dir"
  git checkout --orphan "radicle-ci-$$"
  git rm -rf . >/dev/null
  git clean -fd

  # restore prior logs; absent branch is the first-run case, a failed restore is not
  if git rev-parse --verify --quiet "refs/remotes/rad/$rad_ci_branch" >/dev/null; then
    git checkout "rad/$rad_ci_branch" -- .radicle/ci \
      || echo "[ci] WARNING: $rad_ci_branch exists but restoring prior logs failed; archive may be overwritten" >&2
  else
    echo "[ci] no existing $rad_ci_branch on rad; starting fresh log archive"
  fi
  mkdir -p .radicle/ci

  # prune logs older than $keep days using the YYYY-MM-DD filename prefix
  cutoff=$(date -u -v-"$keep"d +%F 2>/dev/null || date -u -d "$keep days ago" +%F)
  for f in .radicle/ci/*.log; do
    [ -e "$f" ] || continue
    d=$(basename "$f"); [[ ${d%%_*} < $cutoff ]] && rm -f "$f"
  done
)

# Rad job entry
if ! rad-job show $sha >/dev/null; then rad-job new $sha; fi
run=$(rad-job run $sha $uri)

# CI job itself
{ cargo test; } 2>&1 | tee -a "$ci_worktree_dir/$log"

# outcome
rc=${PIPESTATUS[0]}
if [ $rc -eq 0 ]; then status=succeeded; else status=failed; fi
rad job $status $sha $run

# save log to branch, then cleanup branch and worktree
(
  cd "$ci_worktree_dir"
  git add -f .radicle/ci
  git commit --no-verify -m "ci $status ${sha:0:7}"
  git push --force rad "HEAD:refs/heads/$rad_ci_branch"
  git update-ref -d "refs/heads/radicle-ci-$$" 2>/dev/null || true
)
git worktree remove -f "$ci_worktree_dir"

echo "[ci] $status $uri"
exit $rc
