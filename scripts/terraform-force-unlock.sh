#!/usr/bin/env bash
# Force-unlock Terraform state by fetching the lock ID from DynamoDB.
# Run from project root: ./scripts/terraform-force-unlock.sh [staging|production]

set -e
WORKSPACE="${1:-staging}"
cd "$(dirname "$0")/../terraform"

terraform workspace select "$WORKSPACE" 2>/dev/null || terraform workspace new "$WORKSPACE"

# Try LockID formats used by S3 backend with workspaces
BUCKET="octacard-tf-state"
KEY="terraform.tfstate"
for LOCK_ID_KEY in "${BUCKET}/env:/${WORKSPACE}/${KEY}" "env:/${WORKSPACE}/${KEY}"; do
  ITEM=$(aws dynamodb get-item \
    --table-name octacard-terraform-locks \
    --key "{\"LockID\":{\"S\":\"${LOCK_ID_KEY}\"}}" \
    --region eu-central-1 \
    --output json 2>/dev/null) || true

  if [ -n "$ITEM" ] && [ "$ITEM" != "{}" ]; then
    # Parse Info.S JSON to get ID
    LOCK_UUID=$(echo "$ITEM" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    item = d.get('Item', {})
    info = item.get('Info', {}).get('S', '{}')
    info_obj = json.loads(info) if isinstance(info, str) else info
    print(info_obj.get('ID', ''))
except: pass
" 2>/dev/null)
    if [ -n "$LOCK_UUID" ]; then
      echo "Force unlocking $LOCK_UUID"
      terraform force-unlock -force "$LOCK_UUID"
      exit 0
    fi
  fi
done

echo "No lock found for $WORKSPACE. State may already be unlocked."
