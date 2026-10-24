#!/usr/bin/env bash
# Applies end-demo.patch to the Kenya-campaign-manager repo and pushes a branch.
# Run from anywhere inside your clone (e.g. the Codespace):  bash kcm-end-demo/apply.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PATCH="$HERE/end-demo.patch"
BRANCH="feat/end-demo"
cd "$(git rev-parse --show-toplevel)"
if [ -z "$(git config user.email || true)" ] || [ "$(git config user.email)" = "you@example.com" ]; then
  echo "Set your Git identity first, e.g.:"; echo '  git config user.name "Your Name"'; echo '  git config user.email "your-github-email"'; exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then echo "You have uncommitted changes. Commit or stash them first."; exit 1; fi
git checkout main
git pull --ff-only
git checkout -B "$BRANCH"
if ! git am "$PATCH"; then git am --abort || true; echo "The patch did not apply. Nothing was pushed. Send the message above to your developer."; exit 1; fi
git log --oneline -1
git push -u origin "$BRANCH" --force-with-lease
echo
echo "Done. Open the pull request and merge it:"
echo "  https://github.com/yrn-mwathi/Kenya-campaign-manager/pull/new/$BRANCH"
echo "Then delete the kcm-end-demo folder:  rm -rf \"$HERE\""
