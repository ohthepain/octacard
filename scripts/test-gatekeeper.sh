#!/bin/bash

# Quick script to test Gatekeeper and reproduce Apple's warning
# Usage: ./scripts/test-gatekeeper.sh

set -e

APP_PATH="${1:-release/mas-arm64/OctaCard.app}"

if [ ! -d "$APP_PATH" ]; then
    echo "❌ App not found at $APP_PATH"
    echo "Build the app first with: npm run build:mas:arm64"
    exit 1
fi

echo "=========================================="
echo "Testing Gatekeeper Assessment"
echo "=========================================="
echo ""
echo "This will check if macOS will show the warning Apple reviewers see."
echo ""

# Remove quarantine attribute if present (allows testing)
echo "Removing quarantine attribute (for testing only)..."
xattr -d com.apple.quarantine "$APP_PATH" 2>/dev/null || echo "No quarantine attribute (this is fine)"

echo ""
echo "Running Gatekeeper assessment (spctl)..."
echo ""

# This is what Gatekeeper uses internally
if spctl --assess --verbose --type install "$APP_PATH" 2>&1; then
    echo ""
    echo "✅ PASSED: Gatekeeper assessment successful"
    echo "The app should NOT show warnings when opened"
else
    echo ""
    echo "❌ FAILED: Gatekeeper assessment failed"
    echo ""
    echo "This means macOS WILL show the warning:"
    echo "\"OctaCard Helper (GPU) differs from previously opened versions\""
    echo ""
    echo "To see the actual warning dialog:"
    echo "1. Remove any existing OctaCard installation"
    echo "2. Run: open \"$APP_PATH\""
    echo ""
    echo "To fix this issue, run:"
    echo "  ./scripts/verify-helper-apps.sh"
    echo ""
fi

echo ""
echo "Checking individual helper apps..."
echo ""

HELPER_APPS=(
    "Contents/Frameworks/OctaCard Helper.app"
    "Contents/Frameworks/OctaCard Helper (GPU).app"
    "Contents/Frameworks/OctaCard Helper (Plugin).app"
    "Contents/Frameworks/OctaCard Helper (Renderer).app"
)

for helper in "${HELPER_APPS[@]}"; do
    helper_path="$APP_PATH/$helper"
    if [ -d "$helper_path" ]; then
        helper_name=$(basename "$helper_path")
        echo "Checking $helper_name..."
        
        # Check signature
        if codesign --verify --verbose=4 "$helper_path" 2>&1 | grep -q "valid"; then
            echo "  ✅ Signature valid"
        else
            echo "  ❌ Signature INVALID"
            codesign --verify --verbose=4 "$helper_path" 2>&1 | head -5
        fi
        
        # Check bundle ID (use plutil for binary plists, defaults for XML plists)
        bundle_id=$(plutil -extract CFBundleIdentifier raw "$helper_path/Contents/Info.plist" 2>/dev/null || defaults read "$helper_path/Contents/Info.plist" CFBundleIdentifier 2>/dev/null || echo "NOT FOUND")
        echo "  Bundle ID: $bundle_id"
        echo ""
    fi
done

echo ""
echo "To see detailed verification, run:"
echo "  ./scripts/verify-helper-apps.sh"

