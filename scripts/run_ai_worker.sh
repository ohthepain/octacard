#!/usr/bin/env bash
set -euo pipefail

REPO="ohthepain/octacard"
PHONE="+46722651615"
LABEL="ai:fix"

ISSUE_JSON=$(gh issue list \
  --repo "$REPO" \
  --label "$LABEL" \
  --limit 1 \
  --json number,title,body,url)

COUNT=$(echo "$ISSUE_JSON" | jq length)

if [[ "$COUNT" -eq 0 ]]; then
  echo "No safe issues found."
  exit 0
fi

NUMBER=$(echo "$ISSUE_JSON" | jq -r '.[0].number')
TITLE=$(echo "$ISSUE_JSON" | jq -r '.[0].title')
BODY=$(echo "$ISSUE_JSON" | jq -r '.[0].body')
URL=$(echo "$ISSUE_JSON" | jq -r '.[0].url')

BRANCH="ai/fix-$NUMBER"

git checkout main
git pull
git checkout -B "$BRANCH"

PROMPT=$(cat <<EOF
Issue name: $TITLE

Repro steps:
$BODY

Please fix the issue or implement the issue feature.
Please write an integration test for playwright.
Please verify the fix using the test you created and always run the full integration test.
Do not confirm with me before running the test, and it’s okay to run the tests outside of sandbox restrictions.
If the fix is successful then: Please commit, push, and make a pull request.
EOF
)

echo "$PROMPT" > /tmp/ai_issue_prompt.txt

# Let Codex modify the repo
codex exec - < /tmp/ai_issue_prompt.txt

# codex apply --instructions /tmp/ai_issue_prompt.txt

# Run full integration test
npm run test:it

# Commit if there are uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
  echo "Committing changes..."
  git add -A
  git commit -m "AI: fix #$NUMBER – $TITLE"
else
  echo "No changes to commit (codex may have already committed)"
fi

# Push branch (create or update)
echo "Pushing branch $BRANCH..."
if git ls-remote --heads origin "$BRANCH" | grep -q "$BRANCH"; then
  echo "Branch already exists remotely, force pushing..."
  git push -f origin "$BRANCH"
else
  echo "Creating new branch on remote..."
  git push -u origin "$BRANCH"
fi

# Check if PR already exists
EXISTING_PR=$(gh pr list \
  --repo "$REPO" \
  --head "$BRANCH" \
  --json number,url \
  --jq '.[0].url' 2>/dev/null || echo "")

if [[ -n "$EXISTING_PR" && "$EXISTING_PR" != "null" ]]; then
  echo "PR already exists: $EXISTING_PR"
  PR_URL="$EXISTING_PR"
else
  # Create PR
  echo "Creating pull request..."
  PR_URL=$(gh pr create \
    --repo "$REPO" \
    --title "Fix #$NUMBER – $TITLE" \
    --body "Automated fix for #$NUMBER via Codex.

Original issue: $URL" \
    --base main \
    --head "$BRANCH" \
    --json url -q .url)
fi

echo "PR URL: $PR_URL"

# Notify via WhatsApp
if [[ -n "${WHATSAPP_NUMBER:-}" ]]; then
  openclaw message send \
    --target whatsapp:$WHATSAPP_NUMBER \
    --channel "whatsapp" \
    --message "🤖 PR ready for review:
$PR_URL"
else
  echo "WHATSAPP_NUMBER not set, skipping notification"
fi
