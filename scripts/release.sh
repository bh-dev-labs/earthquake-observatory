#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
export GOCACHE="${GOCACHE:-/private/tmp/atlas-go-cache}"
export GOPATH="${GOPATH:-/private/tmp/atlas-go}"
npm ci
npm run build
npm test
go test ./...
go vet ./...
# Single source of truth: package.json. Go receives it through -ldflags.
version=$(node -p "require('./package.json').version")
ldflags="-s -w -X main.version=$version"
mkdir -p release
for target in darwin-arm64 darwin-amd64 windows-amd64; do
 os=${target%-*}; arch=${target#*-}
 folder="release/EarthquakeObservatory-$version-$target"
 mkdir -p "$folder"
 if [ "$os" = darwin ]; then
  app="$folder/Earthquake Observatory.app"
  mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
  CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" go build -trimpath -ldflags="$ldflags" -o "$app/Contents/MacOS/earthquake-observatory" ./cmd/observatory
  cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>earthquake-observatory</string><key>CFBundleIdentifier</key><string>local.earthquake.observatory</string><key>CFBundleName</key><string>Earthquake Observatory</string><key>CFBundleVersion</key><string>$version</string><key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/></dict></plist>
PLIST
  if command -v codesign >/dev/null 2>&1; then codesign --force --sign - "$app"; fi
 else
  CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" go build -trimpath -ldflags="$ldflags" -o "$folder/earthquake-observatory.exe" ./cmd/observatory
 fi
 cp README.md QUICKSTART.md LICENSE THIRD_PARTY_NOTICES.md RELEASE_NOTES.md "$folder/"
 mkdir -p "$folder/docs"
 cp -R docs/. "$folder/docs/"
 python3 scripts/archive.py "$folder"
done
python3 scripts/checksums.py
