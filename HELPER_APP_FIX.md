# Fix for Helper App Warning

## Problem

Apple reviewers are seeing: "OctaCard Helper (GPU) differs from previously opened versions"

## Clarification on App IDs vs Provisioning Profiles

There's a common confusion here:

- **Apple says**: MAS requires explicit App IDs for each bundle ID
- **Reality**: Provisioning profiles can only have ONE App ID
- **For Electron**: Use a wildcard App ID (`com.thisco.octacard.*`) that matches all bundle IDs

However, **the "differs from previously opened versions" error is usually NOT about App IDs** - it's about **code signing consistency** between builds.

## Root Cause

There's a conflict between Apple's requirements:

1. **Mac App Store requires explicit App IDs** for each bundle ID (main app + all helpers)
2. **Provisioning profiles can only have ONE App ID** per profile

For Electron apps with `electron-builder`, the standard solution is to:

- Create **explicit App IDs** for each bundle ID (for MAS compliance)
- Use a **single wildcard App ID** in the provisioning profile that matches all of them
- OR use the main app's explicit App ID and ensure helpers are properly configured

However, if Gatekeeper is still rejecting with "differs from previously opened versions", the issue is likely **code signing consistency** between builds, not the App ID configuration.

## Required Bundle IDs

All of these bundle IDs must be covered by your wildcard App ID:

1. `com.thisco.octacard.app` (main app)
2. `com.thisco.octacard.app.helper`
3. `com.thisco.octacard.app.helper.GPU`
4. `com.thisco.octacard.app.helper.Plugin`
5. `com.thisco.octacard.app.helper.Renderer`

**Note**: These bundle IDs match your `electron-builder.yml` configuration.

## Steps to Fix

**Important**: The "differs from previously opened versions" error is **most likely a code signing consistency issue**, not an App ID problem. Try the code signing fix first (Step 1).

### Step 1: Fix Invalid Provisioning Profile (CRITICAL - DO THIS FIRST!)

**⚠️ YOUR PROVISIONING PROFILE SHOWS AS "INVALID" IN APPLE DEVELOPER PORTAL!**

This is almost certainly the root cause. Even if your app signs locally, Apple's systems will reject it if the provisioning profile is invalid.

**Fix the Invalid Profile:**

1. Go to [Apple Developer Portal](https://developer.apple.com/account/resources/profiles/list) → Profiles
2. Find "Octacard macOS App Store" (shows as "Invalid")
3. Check why it's invalid:
   - Certificate expired or revoked?
   - App ID deleted or changed?
   - Profile needs regeneration?
4. **Regenerate the profile:**
   - Click "Edit" (or create new if needed)
   - Select the wildcard App ID (`com.thisco.octacard.*`)
   - Select your "3rd Party Mac Developer Application" certificate
   - Set type to "Mac App Store"
   - Save and download
5. Replace the provisioning profile:
   ```bash
   cp ~/Downloads/Octacard_Mac_Distribution.provisionprofile \
      "/Users/paulwilkinson/Library/MobileDevice/Provisioning Profiles/"
   ```
6. Clean rebuild:
   ```bash
   npm run clean
   npm run build:mas:arm64
   ```
7. Verify signature:
   ```bash
   codesign -dvvv "release/mas-arm64/OctaCard.app" | grep -E "(Signature|Authority|TeamIdentifier)"
   ```
   Should show:
   - `Authority=3rd Party Mac Developer Application: Paul Wilkinson (RPGSNMH65P)`
   - `TeamIdentifier=RPGSNMH65P`
   - **NOT** `Signature=adhoc`

### Step 2: Understanding spctl Rejection (Important Note)

**`spctl` rejecting locally is NORMAL for MAS apps!**

When you run `./scripts/test-gatekeeper.sh` and see "rejected", this is **expected** because:

- MAS apps are only fully validated when installed from the App Store
- Local `spctl` checks are stricter and may reject apps not installed via MAS
- Your app might work fine when submitted to Apple

**However**, if Apple reviewers are seeing the error, the issue is real. The most likely cause is:

- **Invalid provisioning profile** (Step 1 above)
- Code signing inconsistencies between builds

### Step 3: Fix Code Signing Consistency

If Step 1 shows proper signing but Apple still rejects:

```bash
# Clean build to ensure consistent signing
npm run clean
npm run build:mas:arm64

# Verify all components are signed correctly
codesign --verify --deep --strict --verbose=4 "release/mas-arm64/OctaCard.app"
```

### Step 4: Verify App ID Configuration

If Steps 1-3 don't work, check your App ID setup:

**Option A: Wildcard App ID (Standard for Electron)**

1. Go to [Apple Developer Portal](https://developer.apple.com/account/resources/identifiers/list)
2. Navigate to Identifiers → App IDs
3. Verify you have: `com.thisco.octacard.*` (wildcard)
4. If not, create it:

   - Click "+" → Select "App" type
   - Enter: `com.thisco.octacard.*`
   - Enable "App Sandbox"
   - Register

5. Update Provisioning Profile:
   - Go to Profiles → Your Mac App Store provisioning profile
   - Edit → Select the wildcard App ID (`com.thisco.octacard.*`)
   - Set to "Mac App Store" distribution
   - Save and download

**Option B: Explicit Main App ID (If Wildcard Doesn't Work)**

1. Create explicit App ID: `com.thisco.octacard.app` (not wildcard)
2. Update provisioning profile to use this explicit App ID
3. Helper apps should inherit from main app's provisioning (electron-builder handles this)

### 3. Replace Provisioning Profile

- Replace the file at:
  `/Users/paulwilkinson/Library/MobileDevice/Provisioning Profiles/Octacard_Mac_Distribution.provisionprofile`
- Or update the path in `electron-builder.yml` if using a different location
- **Important**: The profile should use the wildcard App ID (`com.thisco.octacard.*`) which will match all your bundle IDs

### 4. Rebuild and Resubmit

```bash
npm run bump:patch
npm run build:mas
```

Then upload the new `.pkg` file via Transporter.

## Verification

After updating the provisioning profile, run:

```bash
./scripts/verify-helper-apps.sh
```

All bundle IDs should show as "⚠️ MATCHES WILDCARD" (this is correct for MAS with a wildcard App ID).

Also test Gatekeeper assessment:

```bash
./scripts/test-gatekeeper.sh
```

This should show "✅ PASSED" instead of "❌ FAILED".

## Important Notes

- **Provisioning profiles can only have ONE App ID** - you cannot add multiple App IDs to a single profile
- **For Electron apps**, `electron-builder` typically uses a wildcard App ID that matches all bundle IDs
- **The "differs from previously opened versions" error** usually indicates **code signing consistency issues**, not App ID problems:
  - Helper apps signed differently between builds
  - Different certificates or provisioning profiles used
  - Entitlements changed between builds
- **Solution**: Ensure consistent code signing:
  - Always use the same certificate and provisioning profile
  - Clean build before rebuilding: `npm run clean && npm run build:mas:arm64`
  - Don't mix development and distribution certificates
- The helper apps are essential for Electron apps and cannot be disabled

## How to Reproduce the Issue Locally

To see the exact warning Apple reviewers see:

```bash
# Quick test
./scripts/test-gatekeeper.sh

# Detailed verification
./scripts/verify-helper-apps.sh

# Manual Gatekeeper check
spctl --assess --verbose --type install release/mas-arm64/OctaCard.app
```

If `spctl` rejects the app, macOS will show the warning dialog when opening it.

See `REPRODUCE_GATEKEEPER_ISSUE.md` for more details.

## Troubleshooting

If you've verified the wildcard App ID is correct but Gatekeeper still rejects:

### 1. Try a More Specific Wildcard Pattern

If `com.thisco.octacard.*` doesn't work, try `com.thisco.octacard.app.*`:

- This is more specific and should still match all your bundle IDs
- Update the App ID in Developer Portal
- Regenerate the provisioning profile

### 2. Check Code Signing Consistency

The "differs from previously opened versions" error often means:

- Helper apps are being signed differently between builds
- Make sure you're using the same certificate and provisioning profile
- Clean build before rebuilding:
  ```bash
  npm run clean
  npm run build:mas:arm64
  ```

### 3. Verify Entitlements Match

All helper apps must have matching entitlements:

```bash
# Check entitlements for each helper app
codesign -d --entitlements - "release/mas-arm64/OctaCard.app/Contents/Frameworks/OctaCard Helper (GPU).app"
```

### 4. Check if Issue is Gatekeeper Cache

macOS may be caching old signatures:

```bash
# Clear Gatekeeper cache (requires admin)
sudo spctl --master-disable
sudo spctl --master-enable
```

### 5. Alternative: Use Explicit App ID Pattern

If wildcards continue to fail, you may need to:

- Change your bundle IDs to match a single explicit App ID pattern
- Or contact Apple Developer Support about MAS wildcard limitations
