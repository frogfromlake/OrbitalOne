#!/bin/bash
set -e

APP_NAME="orbitalone-tile-proxy-rust"
LOCAL_TILE_ROOT="tiles"
REMOTE_BASE="/data"
NEW_ROOT="${REMOTE_BASE}/tiles_new"
TARGET_ROOT="${REMOTE_BASE}/tiles"
BACKUP_ROOT="${REMOTE_BASE}/tiles_backup_$(date +%s)"

# ==== 1. Prepare new directory on server ====
echo "📤 Creating new directory $NEW_ROOT on Fly.io..."
fly ssh console -a "$APP_NAME" -C "
  rm -rf $NEW_ROOT
  mkdir -p $NEW_ROOT/day $NEW_ROOT/night
"

# ==== 2. Upload new tiles using SFTP ====
echo "📦 Uploading new day/night KTX2 tiles..."
fly ssh sftp put -a "$APP_NAME" --recursive "${LOCAL_TILE_ROOT}/day" "$NEW_ROOT/"
fly ssh sftp put -a "$APP_NAME" --recursive "${LOCAL_TILE_ROOT}/night" "$NEW_ROOT/"

echo "✅ Upload finished."

# ==== 3. Atomically swap new tiles into place (with backup) ====
echo "🔁 Swapping tiles on server with backup..."
fly ssh console -a "$APP_NAME" -C "
set -e
cd $REMOTE_BASE

if [ ! -d \"$NEW_ROOT/day\" ] || [ ! -d \"$NEW_ROOT/night\" ]; then
  echo '❌ New tiles not fully uploaded. Aborting!'
  exit 1
fi

if [ -d \"$TARGET_ROOT/day\" ] || [ -d \"$TARGET_ROOT/night\" ]; then
  echo '🗄️  Backing up old tiles to $BACKUP_ROOT'
  mkdir -p \"$BACKUP_ROOT\"
  [ -d \"$TARGET_ROOT/day\" ] && mv \"$TARGET_ROOT/day\" \"$BACKUP_ROOT/\" || true
  [ -d \"$TARGET_ROOT/night\" ] && mv \"$TARGET_ROOT/night\" \"$BACKUP_ROOT/\" || true
fi

mv \"$NEW_ROOT/day\" \"$TARGET_ROOT/\"
mv \"$NEW_ROOT/night\" \"$TARGET_ROOT/\"
rm -rf \"$NEW_ROOT\"

echo '✅ Tiles replaced! Old tiles are in $BACKUP_ROOT.'
"

echo "🎉 All done! Please test your app before deleting $BACKUP_ROOT."
