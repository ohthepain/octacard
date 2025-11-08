# macOS App Store Submission Guide

This guide will walk you through the process of submitting OctaCard to the macOS App Store.

## Prerequisites

1. **Apple Developer Account**

   - Enroll in the Apple Developer Program ($99/year)
   - Visit: https://developer.apple.com/programs/

2. **App Store Connect Access**

   - Log in to App Store Connect: https://appstoreconnect.apple.com
   - Create a new app record

3. **Code Signing Certificates**

   - You'll need a "Mac App Distribution" certificate
   - Create via Xcode or Apple Developer Portal

4. **Provisioning Profile**
   - Create an App Store provisioning profile for your app
   - Download and install it

## Step 1: Prepare Your App

### Update App Metadata

1. Edit `package.json` and update:

   - `author.name` - Your name or company name
   - `author.email` - Your email address
   - `description` - App description

2. Create app icon:
   - Create `build/icon.icns` file (512x512px minimum)
   - You can use tools like `iconutil` or online converters
   - Example: `iconutil -c icns icon.iconset`

### Configure Code Signing

Set environment variables before building:

```bash
# Your Apple Developer Team ID (found in Apple Developer Portal)
export APPLE_TEAM_ID="YOUR_TEAM_ID"

# Your code signing identity (usually "3rd Party Mac Developer Application: Your Name")
export CSC_NAME="3rd Party Mac Developer Application: Your Name"

# Path to your provisioning profile
export APPLE_PROVISIONING_PROFILE_PATH="path/to/your/profile.provisionprofile"
```

Or create a `.env` file:

```bash
APPLE_TEAM_ID=YOUR_TEAM_ID
CSC_NAME="3rd Party Mac Developer Application: Your Name"
APPLE_PROVISIONING_PROFILE_PATH=path/to/profile.provisionprofile
```

## Step 2: Build for App Store

### Build Universal Binary (Recommended)

```bash
npm run build:mas
```

This creates a universal binary supporting both Intel (x64) and Apple Silicon (arm64).

### Build for Specific Architecture

```bash
# Apple Silicon only
npm run build:mas:arm64

# Intel only
npm run build:mas:x64
```

The built app will be in `release/mas/` directory.

## Step 3: Create App Archive

1. Open Xcode
2. Go to **Window > Organizer**
3. Click **Distribute App**
4. Select **App Store Connect**
5. Follow the wizard to upload your `.pkg` file

Alternatively, use `altool` or `notarytool`:

```bash
# Using notarytool (recommended)
xcrun notarytool submit release/mas/*.pkg \
  --apple-id your.email@example.com \
  --team-id YOUR_TEAM_ID \
  --password "app-specific-password" \
  --wait
```

## Step 4: App Store Connect Setup

1. **Create App Record**

   - Log in to App Store Connect
   - Click **My Apps** > **+** > **New App**
   - Fill in:
     - Platform: macOS
     - Name: OctaCard
     - Primary Language: English
     - Bundle ID: com.octacard.app (must match electron-builder.yml)
     - SKU: octacard-001

2. **App Information**

   - Upload screenshots (required)
   - App description
   - Keywords
   - Support URL
   - Marketing URL (optional)

3. **Pricing and Availability**

   - Set price (Free or Paid)
   - Select countries/regions

4. **App Privacy**
   - Answer privacy questions
   - Describe data collection (if any)

## Step 5: Submit for Review

1. **Version Information**

   - Version number (must match package.json)
   - What's New in This Version
   - Upload screenshots

2. **Build Selection**

   - Select the build you uploaded
   - If no builds appear, wait a few minutes for processing

3. **Review Information**

   - Provide demo account if needed
   - Notes for reviewer
   - Contact information

4. **Submit for Review**
   - Review all information
   - Click **Submit for Review**

## Step 6: Review Process

- Apple typically reviews within 24-48 hours
- You'll receive email notifications about status changes
- If rejected, address issues and resubmit

## Troubleshooting

### Code Signing Issues

```bash
# Check your certificates
security find-identity -v -p codesigning

# Verify the app is signed correctly
codesign -dv --verbose=4 release/mas/OctaCard.app
```

### Entitlements Issues

- Ensure `build/entitlements.mas.plist` matches your app's needs
- Remove unnecessary entitlements if App Review rejects them
- Common required entitlements:
  - `com.apple.security.app-sandbox`
  - `com.apple.security.files.user-selected.read-write`

### Build Errors

- Ensure all dependencies are included in `files` section of `electron-builder.yml`
- Check that native modules are properly bundled
- Verify ffmpeg-static is included correctly

## Important Notes

1. **App Sandbox**: macOS App Store apps run in a sandbox. Ensure your app works with sandbox restrictions.

2. **File Access**: Use `com.apple.security.files.user-selected.read-write` for user-selected files.

3. **System Commands**: Some system commands (like `diskutil`) may not work in the sandbox. Your app has fallback logic, but test thoroughly.

4. **Hardened Runtime**: Not required for App Store (sandbox replaces it).

5. **Notarization**: Not required for App Store (handled by Apple during submission).

6. **Version Numbers**: Must follow semantic versioning (e.g., 1.0.0, 1.0.1).

7. **Testing**: Always test your app in a sandboxed environment before submission. You can test locally by running:
   ```bash
   # Build and test locally first
   npm run build:mas
   # Then test the built app
   open release/mas/OctaCard.app
   ```

## Resources

- [Apple Developer Documentation](https://developer.apple.com/documentation/)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [electron-builder Documentation](https://www.electron.build/)
- [App Sandbox Guide](https://developer.apple.com/documentation/security/app_sandbox)

## Quick Checklist

- [ ] Apple Developer Account enrolled
- [ ] App Store Connect app created
- [ ] Code signing certificates installed
- [ ] Provisioning profile created and installed
- [ ] App icon created (icon.icns)
- [ ] package.json metadata updated
- [ ] App built successfully (`npm run build:mas`)
- [ ] App tested in sandbox environment
- [ ] Screenshots prepared
- [ ] App description written
- [ ] Privacy information completed
- [ ] App submitted for review

Good luck with your submission! 🚀
