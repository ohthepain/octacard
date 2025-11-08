# Build Directory

This directory contains build resources for electron-builder.

## Required Files

### App Icon (`icon.icns`)

You need to create an app icon file named `icon.icns` in this directory.

**How to create an icon:**

1. Create a 1024x1024px PNG image of your app icon
2. Create an iconset directory:
   ```bash
   mkdir icon.iconset
   ```
3. Create multiple sizes (required by macOS):
   ```bash
   # Using sips (built into macOS)
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
   ```
4. Convert to .icns:
   ```bash
   iconutil -c icns icon.iconset
   ```
5. Move the resulting `icon.icns` to this directory

**Alternative:** Use online tools like:
- https://cloudconvert.com/png-to-icns
- https://iconverticons.com/online/

## Entitlements Files

- `entitlements.mas.plist` - Main entitlements for macOS App Store
- `entitlements.mas.inherit.plist` - Inherited entitlements for helper processes

These files define what your app can do (file access, network, etc.) and are required for App Store submission.

