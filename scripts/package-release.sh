#!/usr/bin/env bash
# Build the React bundle and assemble a clean tarball under dist/ that users
# can download, unzip, and run with ./start.sh — no Vite, no dev tooling.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

VERSION=$(node -p "require('./package.json').version")
NAME="sf-org-analyzer-v${VERSION}"
OUT_DIR="$SCRIPT_DIR/dist"
STAGE_DIR="$OUT_DIR/$NAME"

echo "▸ Cleaning previous build…"
rm -rf "$OUT_DIR"
mkdir -p "$STAGE_DIR"

echo "▸ Installing client dependencies…"
(cd client && npm ci)

echo "▸ Building client bundle…"
(cd client && npm run build)

echo "▸ Staging files into $STAGE_DIR…"
# Server, build artefact, scripts, docs — nothing else.
cp -R server "$STAGE_DIR/"
mkdir -p "$STAGE_DIR/client"
cp -R client/dist "$STAGE_DIR/client/dist"
cp package.json package-lock.json start.sh stop.sh README.md "$STAGE_DIR/"
chmod +x "$STAGE_DIR/start.sh" "$STAGE_DIR/stop.sh"

echo "▸ Creating tarball…"
TARBALL="$OUT_DIR/${NAME}.tar.gz"
(cd "$OUT_DIR" && tar -czf "${NAME}.tar.gz" "$NAME")

# Optional zip for Windows users
if command -v zip &>/dev/null; then
  ZIPFILE="$OUT_DIR/${NAME}.zip"
  (cd "$OUT_DIR" && zip -qr "${NAME}.zip" "$NAME")
  echo "✓ Done."
  echo "  Tarball: $TARBALL"
  echo "  Zip:     $ZIPFILE"
else
  echo "✓ Done."
  echo "  Tarball: $TARBALL"
fi

SIZE=$(du -h "$TARBALL" | cut -f1)
echo "  Size:    $SIZE"
echo ""
echo "  Users unpack and run:"
echo "    tar -xzf ${NAME}.tar.gz"
echo "    cd ${NAME}"
echo "    ./start.sh"
