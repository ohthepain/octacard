#!/usr/bin/env bash
set -euo pipefail

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
STATE_FILE=".openclaw_last_github_check"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [[ -f "$STATE_FILE" ]]; then
  SINCE=$(cat "$STATE_FILE")
else
  SINCE="1970-01-01T00:00:00Z"
fi

ISSUES=$(gh issue list \
  --repo "$REPO" \
  --json number,title,body,createdAt,url \
  --limit 20)

NEW_ISSUES=$(echo "$ISSUES" | jq --arg since "$SINCE" '[.[] | select(.createdAt > $since)]')

if [[ "$NEW_ISSUES" == "[]" ]]; then
  echo "$NOW" > "$STATE_FILE"
  exit 0
fi

PROMPT=$(cat <<EOF
Repo: $REPO

Summarize these new issues (created after $SINCE):

Rules:
- For each issue: exactly 3 short bullets.
- Focus on problem, impact, and next action.

JSON:
$NEW_ISSUES
EOF
)

openclaw message send \
  --target whatsapp:+14152005168 \
  --channel "whatsapp" \
  --message "$PROMPT"

echo "$NOW" > "$STATE_FILE"
