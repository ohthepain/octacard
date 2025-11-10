# Next Steps: App Store Submission

## ✅ Completed

- [x] Apple Developer Account enrolled
- [x] App Group created: `group.com.thisco.mediaprocessing`
- [x] App ID configured: `com.thisco.octacard`
- [x] Entitlements configured

## 📋 Next Steps

### Step 1: Create App Icon (Required)

You need a 1024x1024px app icon. Create `build/icon.icns`:

**Option A: Using macOS tools**

```bash
cd build
# Create a 1024x1024px PNG named icon.png first, then:
mkdir icon.iconset
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
rm -rf icon.iconset
```

**Option B: Online converter**

- Create a 1024x1024px PNG
- Use https://cloudconvert.com/png-to-icns
- Save as `build/icon.icns`

### Step 2: Set Up Code Signing

Before building, you need to set environment variables. Find your Team ID in [Apple Developer Portal](https://developer.apple.com/account):

```bash
# Find your Team ID (looks like: ABC123DEF4)
# Then set this environment variable:
export APPLE_TEAM_ID="YOUR_TEAM_ID"
```

**Or create a `.env` file in the project root:**

```bash
APPLE_TEAM_ID=YOUR_TEAM_ID
```

**Important**: `.env` files should NOT have `export` statements. Just use:

```bash
APPLE_TEAM_ID=RPGSNMH65P
```

Not:

```bash
export APPLE_TEAM_ID=RPGSNMH65P  # ❌ Wrong - don't use export in .env
```

**Note**: You don't need to set `CSC_NAME` - electron-builder will automatically find the right certificate!

**Find your Team ID:**

1. Go to https://developer.apple.com/account
2. Click on your name (top right)
3. Your Team ID is displayed there

**Optional - If you need to manually specify certificate name:**

Only set `CSC_NAME` if electron-builder can't find your certificate automatically. If you do set it, use just the name without the prefix:

```bash
# Wrong (don't include the prefix):
export CSC_NAME="3rd Party Mac Developer Application: Your Name"

# Right (just the name):
export CSC_NAME="Your Name"
```

But usually, you don't need to set this at all - just `APPLE_TEAM_ID` is enough!

### Step 2.5: Create Mac App Distribution Certificate (Required)

**You need a valid "Mac App Distribution" certificate** for App Store submission. Your current certificates are expired.

1. Go to [Apple Developer Portal](https://developer.apple.com/account)
2. Navigate to **Certificates, Identifiers & Profiles**
3. Click **Certificates** → **+** (Create New)
4. Under **Software**, select **Mac App Distribution**
5. Click **Continue**
6. Follow the instructions to create a Certificate Signing Request (CSR):
   - Open **Keychain Access** app (Applications → Utilities)
   - Go to **Keychain Access** → **Certificate Assistant** → **Request a Certificate From a Certificate Authority**
   - Enter your email address
   - Select **"Saved to disk"**
   - Click **Continue** and save the `.certSigningRequest` file
7. Upload the CSR file in the Apple Developer Portal
8. Click **Continue** → **Download**
9. Double-click the downloaded `.cer` file to install it in Keychain

**Verify the certificate is installed:**

```bash
security find-identity -v -p codesigning | grep "Mac App Distribution"
```

You should see a certificate like: `"3rd Party Mac Developer Application: Your Name"` or `"Apple Distribution: Your Name"`

### Step 2.6: Create Mac App Installer Certificate (Also Required)

**You also need a "Mac Installer Distribution" certificate** to sign the installer package (.pkg file).

1. Go to [Apple Developer Portal](https://developer.apple.com/account)
2. Navigate to **Certificates, Identifiers & Profiles**
3. Click **Certificates** → **+** (Create New)
4. Under **Software**, select **Mac Installer Distribution**
5. Click **Continue**
6. Upload the same CSR file you used for the app certificate (or create a new one)
7. Click **Continue** → **Download**
8. Double-click the downloaded `.cer` file to install it in Keychain

**Verify both certificates are installed:**

```bash
security find-identity -v -p codesigning | grep -E "Mac Developer Application|Mac Installer"
```

You should see both:

- `"3rd Party Mac Developer Application: Your Name"`
- `"3rd Party Mac Developer Installer: Your Name"`

### Step 3: Create Provisioning Profile (May Be Optional)

**Short answer**: You might not need to manually install it, but it's **highly recommended** for reliability.

**electron-builder can automatically find/use provisioning profiles** if:

- Your App ID exists in Apple Developer Portal
- You have a Mac App Distribution certificate installed
- You have `APPLE_TEAM_ID` set

**However, it's safer to create it manually:**

1. Go to [Apple Developer Portal](https://developer.apple.com/account)
2. Navigate to **Certificates, Identifiers & Profiles**
3. Click **Profiles** → **+** (Create New)
4. Select **macOS App Store** distribution profile
5. Select your App ID: `com.thisco.octacard`
6. Select your **Mac App Distribution** certificate
7. Name it: "OctaCard App Store"
8. Click **Generate** → **Download**
9. Double-click the downloaded `.provisionprofile` file to install it

**If you skip this step**: electron-builder will try to automatically find/use a provisioning profile, but if it fails, your build will fail. Creating it manually ensures it works.

### Step 4: Build for App Store

```bash
# Build universal binary (recommended - supports both Intel and Apple Silicon)
npm run build:mas

# Or build for specific architecture:
npm run build:mas:arm64  # Apple Silicon only
npm run build:mas:x64    # Intel only
```

The built app will be in `release/mas/` directory as a `.pkg` file.

**If build fails:**

- Check that your Team ID and certificate name are correct
- Verify the provisioning profile is installed
- Make sure `build/icon.icns` exists

### Step 5: Test the Build Locally

```bash
# Test the built app
open release/mas/OctaCard.app

# Or install the .pkg
open release/mas/*.pkg
```

Test that:

- App launches correctly
- File operations work
- SD/CF card detection works
- Audio/video preview works

### Step 6: Create App in App Store Connect

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Click **My Apps** → **+** → **New App**
3. Fill in:
   - **Platform**: macOS
   - **Name**: OctaCard
   - **Primary Language**: English
   - **Bundle ID**: `com.thisco.octacard` (select from dropdown)
   - **SKU**: `octacard-001` (or any unique identifier)
4. Click **Create**

### Step 7: Upload Build

**Option A: Using Transporter App (Easiest - No Xcode Required) ⭐ RECOMMENDED**

1. Download **Transporter** from the Mac App Store (free)

   - Search for "Transporter" in App Store
   - Or visit: https://apps.apple.com/app/transporter/id1450874784

2. Open Transporter app
3. Sign in with your Apple ID (the one associated with your developer account)
4. Click **+** or drag and drop your `.pkg` file from `release/mas/`
5. Click **Deliver** - it will upload to App Store Connect
6. Wait for upload to complete (you'll see progress)

**Option B: Using Xcode Organizer**

1. Open Xcode (if you have it installed)
2. Go to **Window** → **Organizer**
3. Click **Distribute App**
4. Select **App Store Connect**
5. Choose your provisioning profile
6. Select the `.pkg` file from `release/mas/`
7. Follow the wizard to upload

**Option C: Using Command Line (notarytool)**

```bash
# First, update Command Line Tools if needed:
sudo softwareupdate --all --install --force

# Then upload:
xcrun notarytool submit release/mas/*.pkg \
  --apple-id your.email@example.com \
  --team-id YOUR_TEAM_ID \
  --password "app-specific-password" \
  --wait
```

**Create App-Specific Password (for command line only):**

1. Go to https://appleid.apple.com
2. Sign in → **App-Specific Passwords**
3. Generate a new password for "App Store Connect"
4. Use this password (not your Apple ID password)

**Note**: Transporter is the easiest option and doesn't require Xcode or command line tools!

### Step 8: Complete App Listing

In App Store Connect, complete:

1. **App Information**

   - Upload screenshots (required - at least one)
   - App description
   - Keywords (comma-separated)
   - Support URL
   - Marketing URL (optional)

2. **Pricing and Availability**

   - Set price (Free or Paid)
   - Select countries/regions

3. **App Privacy**

   - Answer: "Does your app collect data?" → **No** (if you don't collect user data)
   - If you collect data, specify what data and why

4. **Version Information**
   - Version number: `1.0.0` (must match package.json)
   - "What's New in This Version" description
   - Upload screenshots

### Step 9: Submit for Review

1. In App Store Connect, go to your app
2. Click **+ Version** or select your version
3. Select the build you uploaded (may take a few minutes to appear)
4. Complete **Review Information**:
   - Demo account (if needed)
   - Notes for reviewer
   - Contact information
5. Click **Submit for Review**

## ⏱️ Timeline

- **Build upload**: Usually processes within 10-30 minutes
- **Review**: Typically 24-48 hours
- **You'll receive email notifications** about status changes

## 🐛 Troubleshooting

### Build Errors

**"No identity found"**

- Check your `CSC_NAME` matches exactly: `security find-identity -v -p codesigning`
- Make sure you have "Mac App Distribution" certificate installed

**"Provisioning profile not found"**

- Download and install the provisioning profile
- Make sure it's linked to your App ID

**"Icon not found"**

- Create `build/icon.icns` (see Step 1)

### Upload Errors

**"Invalid bundle"**

- Check that Bundle ID matches exactly: `com.thisco.octacard`
- Verify entitlements are correct

**"Missing required icon"**

- Make sure `build/icon.icns` exists and is valid

## 📝 Quick Checklist

- [ ] App icon created (`build/icon.icns`)
- [ ] Code signing environment variables set
- [ ] Provisioning profile created and installed
- [ ] App built successfully (`npm run build:mas`)
- [ ] App tested locally
- [ ] App record created in App Store Connect
- [ ] Transporter app downloaded (or Xcode/command line ready)
- [ ] Build uploaded to App Store Connect
- [ ] Screenshots prepared
- [ ] App description written
- [ ] Privacy information completed
- [ ] App submitted for review

## ❓ Do I Need Xcode?

**Short answer: NO!** You have three options:

1. **Transporter App** (Recommended) - Free, no Xcode needed
2. **Xcode Organizer** - Only if you already have Xcode installed
3. **Command Line** - Requires updated Command Line Tools

You already have Command Line Tools installed, so you can use **Transporter** (easiest) or update your tools for command line upload.

Good luck! 🚀
