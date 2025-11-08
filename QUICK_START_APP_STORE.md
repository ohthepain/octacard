# Quick Start: macOS App Store Submission

## Before You Begin

1. **Apple Developer Account** ($99/year)

   - Sign up at: https://developer.apple.com/programs/
   - Wait for approval (usually instant)

2. **Update package.json**

   - Edit `author.name` and `author.email`
   - Update `description` if needed

3. **Create App Icon**
   - Create `build/icon.icns` (see `build/README.md`)

## Build Commands

```bash
# Build for App Store (universal binary)
npm run build:mas

# Output will be in: release/mas/
```

## Code Signing Setup

Before building, set these environment variables:

```bash
export APPLE_TEAM_ID="YOUR_TEAM_ID"
export CSC_NAME="3rd Party Mac Developer Application: Your Name"
```

Find your Team ID in: https://developer.apple.com/account

## Next Steps

1. **Create App in App Store Connect**

   - Go to: https://appstoreconnect.apple.com
   - Create new macOS app
   - Bundle ID: `com.octacard.app`

2. **Upload Build**

   - Use Xcode Organizer or `notarytool`
   - See `APP_STORE_GUIDE.md` for details

3. **Complete App Store Listing**

   - Screenshots (required)
   - Description
   - Privacy information

4. **Submit for Review**

For detailed instructions, see `APP_STORE_GUIDE.md`
