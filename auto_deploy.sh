#!/usr/bin/env bash
set -u

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR" || exit 1

BRANCH="main"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-8}"
LOG_FILE="${LOG_FILE:-autodeploy.log}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repository"
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Missing origin remote"
  exit 1
fi

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] auto_deploy started on branch $BRANCH with interval ${INTERVAL_SECONDS}s" | tee -a "$LOG_FILE"

while true; do
  if ! git diff --quiet || ! git diff --cached --quiet; then
    git add -A
    if ! git diff --cached --quiet; then
      TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
      git commit -m "auto: sync changes ${TS}" >/dev/null 2>&1
      if [ "$?" -eq 0 ]; then
        git push origin "$BRANCH" >/dev/null 2>&1
        if [ "$?" -eq 0 ]; then
          echo "[$TS] auto commit + push complete" | tee -a "$LOG_FILE"
        else
          echo "[$TS] push failed" | tee -a "$LOG_FILE"
        fi
      else
        echo "[$TS] commit skipped" | tee -a "$LOG_FILE"
      fi
    fi
  fi
  sleep "$INTERVAL_SECONDS"
done
