# Fix for Helper App Warning

## Problem
Apple reviewers are seeing: "Octacard Helper (Renderer) differs from previously opened versions"

## Root Cause
The helper app bundle IDs are **NOT included in your provisioning profile**. This causes macOS to show the warning because helper apps aren't properly provisioned.

## Required Bundle IDs
Your provisioning profile must include ALL of these bundle IDs:

1. `com.thisco.octacard` (main app) ✓ Already included
2. `com.thisco.octacard.helper` ✗ MISSING
3. `com.thisco.octacard.helper.GPU` ✗ MISSING
4. `com.thisco.octacard.helper.Plugin` ✗ MISSING
5. `com.thisco.octacard.helper.Renderer` ✗ MISSING

## Steps to Fix

### 1. Create App IDs for Helper Apps
Go to [Apple Developer Portal](https://developer.apple.com/account/resources/identifiers/list):
- Navigate to Identifiers → App IDs
- Click the "+" button
- Create App IDs for each helper bundle ID:
  - `com.thisco.octacard.helper`
  - `com.thisco.octacard.helper.GPU`
  - `com.thisco.octacard.helper.Plugin`
  - `com.thisco.octacard.helper.Renderer`
- For each, select "App" type and enable "App Sandbox" capability

### 2. Update Provisioning Profile
- Go to Profiles → Your Mac App Store provisioning profile
- Edit the profile
- Add all the helper App IDs you just created
- Save and download the updated profile

### 3. Replace Provisioning Profile
- Replace the file at:
  `/Users/paulwilkinson/Library/MobileDevice/Provisioning Profiles/93b46b20-fb9b-46f9-b2a8-6980da1b10cc.provisionprofile`
- Or update the path in `electron-builder.yml` if using a different location

### 4. Rebuild and Resubmit
```bash
npm run bump:patch
npm run build:mas
```

Then upload the new `.pkg` file via Transporter.

## Verification
After updating the provisioning profile, run:
```bash
bash /tmp/check_provisioning.sh
```

All bundle IDs should show as "FOUND".

## Important Notes
- **This is critical** - Without all helper bundle IDs in the provisioning profile, macOS will always show the warning
- Apple reviewers will continue to reject until this is fixed
- The helper apps are essential for Electron apps and cannot be disabled
- Make sure the provisioning profile includes ALL helper bundle IDs before rebuilding

