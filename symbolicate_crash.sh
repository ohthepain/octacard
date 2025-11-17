#!/bin/bash

# Script to symbolicate macOS crash logs (.ips files)
# Usage: ./symbolicate_crash.sh <crash_log.ips> [path_to_app.app]

CRASH_LOG="$1"
APP_PATH="${2:-release/mas-arm64/OctaCard.app}"

if [ -z "$CRASH_LOG" ]; then
    echo "Usage: $0 <crash_log.ips> [path_to_app.app]"
    exit 1
fi

if [ ! -f "$CRASH_LOG" ]; then
    echo "Error: Crash log not found: $CRASH_LOG"
    exit 1
fi

echo "=== Crash Log Analysis ==="
echo "File: $CRASH_LOG"
echo ""

# Try to read as plist first
if plutil -lint "$CRASH_LOG" >/dev/null 2>&1; then
    echo "=== Crash Information ==="
    plutil -p "$CRASH_LOG" | grep -E "(crashReporterKey|exceptionType|exceptionMessage|terminationReason|signal|processPath|bundleIdentifier)" | head -20
    echo ""
    
    # Extract key information
    echo "=== Exception Type ==="
    plutil -extract crashReporterKey.exceptionType raw "$CRASH_LOG" 2>/dev/null || echo "Not found"
    echo ""
    
    echo "=== Exception Message ==="
    plutil -extract crashReporterKey.exceptionMessage raw "$CRASH_LOG" 2>/dev/null || echo "Not found"
    echo ""
    
    echo "=== Termination Reason ==="
    plutil -extract crashReporterKey.terminationReason raw "$CRASH_LOG" 2>/dev/null || echo "Not found"
    echo ""
    
    echo "=== Process Path ==="
    plutil -extract crashReporterKey.processPath raw "$CRASH_LOG" 2>/dev/null || echo "Not found"
    echo ""
    
    echo "=== Bundle Identifier ==="
    plutil -extract crashReporterKey.bundleIdentifier raw "$CRASH_LOG" 2>/dev/null || echo "Not found"
    echo ""
    
    # Try to symbolicate if we have the app
    if [ -d "$APP_PATH" ]; then
        echo "=== Attempting Symbolication ==="
        echo "Using app: $APP_PATH"
        
        # Find the binary
        BINARY_PATH="$APP_PATH/Contents/MacOS/OctaCard"
        if [ ! -f "$BINARY_PATH" ]; then
            # Try to find helper binaries
            BINARY_PATH=$(find "$APP_PATH/Contents/Frameworks" -name "*Helper*" -type f | head -1)
        fi
        
        if [ -f "$BINARY_PATH" ]; then
            echo "Binary found: $BINARY_PATH"
            echo ""
            echo "=== Stack Trace (if available) ==="
            # Extract addresses and try to symbolicate
            plutil -extract crashReporterKey.threads raw "$CRASH_LOG" 2>/dev/null | head -30
        else
            echo "Binary not found for symbolication"
        fi
    else
        echo "App not found at: $APP_PATH"
        echo "To symbolicate, provide the path to the .app bundle"
    fi
else
    echo "Error: File is not a valid plist or crash log format"
    echo "Trying to read as text..."
    cat "$CRASH_LOG" | head -100
fi

echo ""
echo "=== Full Crash Log (first 100 lines) ==="
plutil -p "$CRASH_LOG" 2>/dev/null | head -100 || cat "$CRASH_LOG" | head -100


