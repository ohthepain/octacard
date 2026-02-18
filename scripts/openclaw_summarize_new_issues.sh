#!/usr/bin/env bash
set -euo pipefail

REPO="ohthepain/octacard"
STATE_FILE="$HOME/.openclaw_last_issue_check"
TMP_JSON="/tmp/openclaw_issues.json"
TMP_SUMMARY="/tmp/openclaw_summary.txt"

# Default: last 24h if never run
if [[ -f "$STATE_FILE" ]]; then
  SINCE="$(cat "$STATE_FILE")"
else
  SINCE="$(date -u -v-1d +"%Y-%m-%dT%H:%M:%SZ")"
fi

NOW="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Fetch issues created since last run
gh issue list \
  --repo "$REPO" \
  --state open \
  --search "created:>$SINCE" \
  --json number,title,body,url,author \
  > "$TMP_JSON"

COUNT=$(jq length "$TMP_JSON")

if [[ "$COUNT" -eq 0 ]]; then
  echo "NO_UPDATES"
  echo "$NOW" > "$STATE_FILE"
  exit 0
fi

PROMPT=$(cat <<EOF
Repo: $REPO

Only summarize issues created after: $SINCE

Rules:
- Summarize each issue in exactly 3 short bullets
- Focus on: problem, impact, next action
- Keep concise

JSON:
$(cat "$TMP_JSON")
EOF
)

# openclaw message send \
#   --target local \
#   --message "$PROMPT" \
#   > "$TMP_SUMMARY"

openclaw message send \
  --target whatsapp:$WHATSAPP_NUMBER \
  --channel "whatsapp" \
  --message "$TMP_SUMMARY"


cat "$TMP_SUMMARY"
echo "$NOW" > "$STATE_FILE"

