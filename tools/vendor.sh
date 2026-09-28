#!/usr/bin/env sh
# Rebuilds the vendored third-party files in vendor/ (only needed to upgrade them).
# Requires Node.js. Usage: sh tools/vendor.sh
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
cd "$TMP"
npm init -y >/dev/null
npm install --no-audit --no-fund katex@0.18.9 three@0.186.1 @fontsource-variable/manrope @fontsource/ibm-plex-mono esbuild >/dev/null
# KaTeX (ES module + CSS with woff2 fonts only)
npx esbuild node_modules/katex/dist/katex.mjs --minify --format=esm --outfile="$ROOT/vendor/katex/katex.min.mjs"
cp node_modules/katex/dist/fonts/*.woff2 "$ROOT/vendor/katex/fonts/"
node -e 'const fs=require("fs");let c=fs.readFileSync("node_modules/katex/dist/katex.min.css","utf8");c=c.replace(/src:([^;}]*)/g,(m,s)=>"src:"+s.split(",").filter(p=>p.includes(".woff2")).join(","));fs.writeFileSync(process.argv[1],c)' "$ROOT/vendor/katex/katex.min.css"
# three.js: tree-shaken bundle with OrbitControls and CSS2DRenderer
cp "$ROOT/tools/three-entry.js" ./three-entry.js
npx esbuild three-entry.js --bundle --minify --format=esm --legal-comments=none --outfile="$ROOT/vendor/three/three-lab.min.js"
# Fonts
cp node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2 node_modules/@fontsource-variable/manrope/files/manrope-latin-ext-wght-normal.woff2 "$ROOT/vendor/fonts/"
for w in 400 500 600; do
  cp node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-$w-normal.woff2 node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-ext-$w-normal.woff2 "$ROOT/vendor/fonts/"
done
rm -rf "$TMP"
echo "vendor/ updated"
