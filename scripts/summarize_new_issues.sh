#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
if [[ -f "$PROJECT_ROOT/.env" ]]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
fi

REPO="${REPO:-ohthepain/octacard}"
STATE_FILE=".openclaw_last_github_check"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "repo name: $REPO"
echo "state file: $STATE_FILE"
echo "now: $NOW"
if [[ -f "$STATE_FILE" ]]; then
  SINCE=$(cat "$STATE_FILE")
else
  SINCE="1970-01-01T00:00:00Z"
fi

echo "since: $SINCE"

ISSUES=$(gh issue list \
  --repo "$REPO" \
  --json number,title,body,createdAt,url \
  --limit 20)

echo "all issues: $ISSUES"

NEW_ISSUES=$(echo "$ISSUES" | jq --arg since "$SINCE" '[.[] | select(.createdAt > $since)]')

echo "new issues: $NEW_ISSUES"

if [[ "$NEW_ISSUES" == "[]" ]]; then
  echo "$NOW" > "$STATE_FILE"
  exit 0
fi

TITLES=$(echo "$NEW_ISSUES" | jq -r '.[] | "- \(.title)"')
MESSAGE=$(cat <<EOF
$REPO
New issues:
$TITLES
EOF
)

echo "sending message to whatsapp: $WHATSAPP_NUMBER"

openclaw message send \
  --target whatsapp:$WHATSAPP_NUMBER \
  --channel "whatsapp" \
  --message "$MESSAGE"

echo "$NOW" > "$STATE_FILE"
