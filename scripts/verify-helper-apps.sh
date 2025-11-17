#!/bin/bash

# Script to verify helper apps and reproduce Apple's Gatekeeper warning
# Usage: ./scripts/verify-helper-apps.sh [path_to_app.app]

set -e

APP_PATH="${1:-release/mas-arm64/OctaCard.app}"
PROVISIONING_PROFILE="${PROVISIONING_PROFILE:-/Users/paulwilkinson/Library/MobileDevice/Provisioning Profiles/Octacard_Mac_Distribution.provisionprofile}"

# Expected bundle IDs from electron-builder.yml
MAIN_BUNDLE_ID="com.thisco.octacard.app"
HELPER_BUNDLE_ID="com.thisco.octacard.app.helper"
HELPER_GPU_BUNDLE_ID="com.thisco.octacard.app.helper.GPU"
HELPER_PLUGIN_BUNDLE_ID="com.thisco.octacard.app.helper.Plugin"
HELPER_RENDERER_BUNDLE_ID="com.thisco.octacard.app.helper.Renderer"

echo "=========================================="
echo "Helper App Verification Script"
echo "=========================================="
echo ""
echo "App path: $APP_PATH"
echo "Provisioning profile: $PROVISIONING_PROFILE"
echo ""

if [ ! -d "$APP_PATH" ]; then
    echo "❌ ERROR: App not found at $APP_PATH"
    echo "Build the app first with: npm run build:mas:arm64"
    exit 1
fi

# Function to check code signing status
check_code_signature() {
    local app_path="$1"
    local app_name="$2"
    
    echo "--- Checking $app_name ---"
    echo "Path: $app_path"
    
    if [ ! -d "$app_path" ]; then
        echo "❌ App not found"
        return 1
    fi
    
    # Get bundle ID (use plutil for binary plists, defaults for XML plists)
    local bundle_id=$(plutil -extract CFBundleIdentifier raw "$app_path/Contents/Info.plist" 2>/dev/null || defaults read "$app_path/Contents/Info.plist" CFBundleIdentifier 2>/dev/null || echo "NOT FOUND")
    echo "Bundle ID: $bundle_id"
    
    # Check code signature
    echo ""
    echo "Code Signature Status:"
    codesign -dv --verbose=4 "$app_path" 2>&1 | grep -E "(Authority|Identifier|Signature|valid)" || echo "⚠️  No signature found"
    
    # Verify signature
    echo ""
    echo "Signature Verification:"
    if codesign --verify --verbose=4 "$app_path" 2>&1; then
        echo "✅ Signature is valid"
    else
        echo "❌ Signature verification FAILED"
        codesign --verify --verbose=4 "$app_path" 2>&1
    fi
    
    # Check if signed for MAS
    echo ""
    echo "MAS Signing Check:"
    if codesign -d --entitlements - "$app_path" 2>&1 | grep -q "com.apple.security.app-sandbox"; then
        echo "✅ App Sandbox entitlement found (MAS requirement)"
    else
        echo "❌ App Sandbox entitlement NOT found"
    fi
    
    echo ""
    return 0
}

# Function to check provisioning profile
check_provisioning_profile() {
    local profile_path="$1"
    
    echo "=========================================="
    echo "Provisioning Profile Check"
    echo "=========================================="
    
    if [ ! -f "$profile_path" ]; then
        echo "❌ Provisioning profile not found at: $profile_path"
        echo ""
        echo "Available profiles:"
        ls -la "/Users/paulwilkinson/Library/MobileDevice/Provisioning Profiles/" 2>/dev/null || echo "No profiles found"
        return 1
    fi
    
    echo "Profile path: $profile_path"
    echo ""
    
    # Extract bundle IDs from provisioning profile
    echo "Bundle IDs in provisioning profile:"
    security cms -D -i "$profile_path" 2>/dev/null | plutil -extract Entitlements.application-identifier raw - 2>/dev/null || echo "Could not extract"
    
    echo ""
    echo "Checking for required bundle IDs:"
    
    # Check each bundle ID
    local profile_content=$(security cms -D -i "$profile_path" 2>/dev/null)
    
    check_bundle_in_profile() {
        local bundle_id="$1"
        local name="$2"
        
        # Provisioning profiles use wildcard format: TEAMID.bundle.id
        # So com.thisco.octacard.app becomes RPGSNMH65P.com.thisco.octacard.app
        local team_prefix="RPGSNMH65P."
        local search_pattern="${team_prefix}${bundle_id}"
        
        # Check for exact match
        if echo "$profile_content" | grep -q "\"$search_pattern\""; then
            echo "✅ $name ($bundle_id) - FOUND (exact match)"
            return 0
        fi
        
        # Check for wildcard match (e.g., RPGSNMH65P.com.thisco.octacard.*)
        local wildcard_pattern="${team_prefix}com.thisco.octacard.*"
        if echo "$profile_content" | grep -q "$wildcard_pattern"; then
            # Verify the bundle ID matches the wildcard pattern
            if [[ "$bundle_id" == com.thisco.octacard.* ]]; then
                echo "⚠️  $name ($bundle_id) - MATCHES WILDCARD (may not work for MAS)"
                echo "     Note: Mac App Store may require explicit bundle IDs instead of wildcards"
                return 0
            fi
        fi
        
        echo "❌ $name ($bundle_id) - NOT FOUND"
        return 1
    }
    
    local all_found=true
    check_bundle_in_profile "$MAIN_BUNDLE_ID" "Main App" || all_found=false
    check_bundle_in_profile "$HELPER_BUNDLE_ID" "Helper" || all_found=false
    check_bundle_in_profile "$HELPER_GPU_BUNDLE_ID" "Helper (GPU)" || all_found=false
    check_bundle_in_profile "$HELPER_PLUGIN_BUNDLE_ID" "Helper (Plugin)" || all_found=false
    check_bundle_in_profile "$HELPER_RENDERER_BUNDLE_ID" "Helper (Renderer)" || all_found=false
    
    echo ""
    if [ "$all_found" = true ]; then
        echo "✅ All bundle IDs found in provisioning profile"
    else
        echo "❌ Some bundle IDs are missing from provisioning profile"
        echo ""
        echo "ACTION REQUIRED:"
        echo "1. Go to https://developer.apple.com/account/resources/identifiers/list"
        echo "2. Create App IDs for missing helper bundle IDs"
        echo "3. Update your provisioning profile to include all helper App IDs"
        echo "4. Download and replace the provisioning profile"
    fi
    
    echo ""
    return 0
}

# Function to check Gatekeeper assessment
check_gatekeeper() {
    local app_path="$1"
    
    echo "=========================================="
    echo "Gatekeeper Assessment"
    echo "=========================================="
    echo ""
    echo "This simulates what Apple reviewers see when they test your app."
    echo ""
    
    # Use spctl to assess the app (this is what Gatekeeper uses)
    echo "Running spctl assessment (Gatekeeper check):"
    echo ""
    
    if spctl --assess --verbose --type install "$app_path" 2>&1; then
        echo ""
        echo "✅ Gatekeeper assessment PASSED"
        echo "The app should not show warnings when opened"
    else
        echo ""
        echo "❌ Gatekeeper assessment FAILED"
        echo ""
        echo "This means macOS will show the warning:"
        echo "\"OctaCard Helper (GPU) differs from previously opened versions\""
        echo ""
        echo "Common causes:"
        echo "1. Helper apps not properly signed"
        echo "2. Bundle IDs not in provisioning profile"
        echo "3. Code signature inconsistencies"
        echo "4. Missing entitlements"
    fi
    
    echo ""
}

# Function to check all helper apps
check_all_helpers() {
    echo "=========================================="
    echo "Checking All Helper Apps"
    echo "=========================================="
    echo ""
    
    # Main app
    check_code_signature "$APP_PATH" "Main App (OctaCard.app)"
    echo ""
    
    # Helper apps
    check_code_signature "$APP_PATH/Contents/Frameworks/OctaCard Helper.app" "Helper"
    echo ""
    
    check_code_signature "$APP_PATH/Contents/Frameworks/OctaCard Helper (GPU).app" "Helper (GPU)"
    echo ""
    
    check_code_signature "$APP_PATH/Contents/Frameworks/OctaCard Helper (Plugin).app" "Helper (Plugin)"
    echo ""
    
    check_code_signature "$APP_PATH/Contents/Frameworks/OctaCard Helper (Renderer).app" "Helper (Renderer)"
    echo ""
}

# Function to reproduce the issue
reproduce_issue() {
    echo "=========================================="
    echo "How to Reproduce Apple's Issue"
    echo "=========================================="
    echo ""
    echo "To see the exact warning Apple reviewers see:"
    echo ""
    echo "1. Make sure you have a previous version of the app installed"
    echo "   (or remove any existing OctaCard installation first)"
    echo ""
    echo "2. Try to open the app:"
    echo "   open \"$APP_PATH\""
    echo ""
    echo "3. macOS will show the warning dialog if there's an issue"
    echo ""
    echo "4. Alternatively, use spctl to check:"
    echo "   spctl --assess --verbose --type install \"$APP_PATH\""
    echo ""
    echo "5. Check Console.app for Gatekeeper messages:"
    echo "   - Open Console.app"
    echo "   - Filter for 'Gatekeeper' or 'OctaCard'"
    echo "   - Try to open the app and watch for messages"
    echo ""
    echo "6. Check code signing details:"
    echo "   codesign -dv --verbose=4 \"$APP_PATH\""
    echo ""
}

# Run all checks
check_all_helpers
check_provisioning_profile "$PROVISIONING_PROFILE"
check_gatekeeper "$APP_PATH"
reproduce_issue

echo "=========================================="
echo "Summary"
echo "=========================================="
echo ""
echo "If you see '❌' errors above, those need to be fixed before submitting to Apple."
echo ""
echo "Common fixes:"
echo "1. Ensure all helper bundle IDs are in your provisioning profile"
echo "2. Rebuild the app after updating the provisioning profile"
echo "3. Verify all helper apps are properly signed"
echo ""
echo "To rebuild:"
echo "  npm run bump:patch"
echo "  npm run build:mas:arm64"
echo ""

