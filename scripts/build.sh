#!/usr/bin/env sh
# Crée dist/dontfeed-<version>.zip, prêt à envoyer au Chrome Web Store et à addons.mozilla.org.
set -eu
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./manifest.json').version")
node test/core.test.js
mkdir -p dist
OUT="dist/dontfeed-$VERSION.zip"
rm -f "$OUT"
zip -qr "$OUT" manifest.json background.js content.js content.css popup.html popup.js \
  options.html options.js blocked.html blocked.js ui.css yt-main.js lib icons
echo "OK : $OUT"
