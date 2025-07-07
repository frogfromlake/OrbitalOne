#!/bin/bash

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG_DIR/tile_prefill.log"
}

log "🚀 Starting NASA BunnyCDN tile prefill script..."

# === FLAGS ===
IS_TEST=0
if [[ "$1" == "--test" ]]; then
  IS_TEST=1
fi

# === PATHS ===
if [[ $IS_TEST -eq 1 ]]; then
  BASE_DIR="./test_tiles"
  LOG_DIR="./test_logs"
  ZOOM_START=5
  ZOOM_END=5
else
  BASE_DIR="/data/tiles"
  LOG_DIR="/data/logs"
  ZOOM_START=5
  ZOOM_END=7
fi

mkdir -p "$LOG_DIR"

# === CONFIG ===
MAX_RETRIES=8
RETRY_BASE_DELAY=3  # seconds
BATCH_SLEEP_EVERY=200
BATCH_SLEEP_SECONDS=2
CONCURRENT_FETCHES=30

# BunnyCDN Tile URLs
BUNNY_DAY_BASE="https://orbitalone-tiles.b-cdn.net/day"
BUNNY_NIGHT_BASE="https://orbitalone-tiles.b-cdn.net/night"

# === SAFETY CHECK: Abort if any Z5–Z7 day/night tiles already exist (unless --allow-existing) ===
ALLOW_EXISTING=0
if [[ "$1" == "--allow-existing" ]]; then
  ALLOW_EXISTING=1
fi

for set in "day" "night"; do
  for ((z=ZOOM_START; z<=ZOOM_END; z++)); do
    if compgen -G "$BASE_DIR/$set/$z/*/*.ktx2" > /dev/null && [[ $ALLOW_EXISTING -eq 0 ]]; then
      log "❌ ABORTED: Existing tiles detected in $set/$z. Use --allow-existing to continue."
      exit 1
    fi
  done
done

fetch_tile() {
  local set=$1 z=$2 x=$3 y=$4
  local base_url
  if [[ $set == "day" ]]; then
    base_url="$BUNNY_DAY_BASE"
  else
    base_url="$BUNNY_NIGHT_BASE"
  fi
  local url="${base_url}/${z}/${x}/${y}.ktx2"
  local tile_path="${BASE_DIR}/${set}/${z}/${x}/${y}.ktx2"

  # Never overwrite existing tiles
  if [[ -f "$tile_path" ]]; then
    log "🛑 Skipped existing $set/$z/$x/$y"
    return
  fi

  mkdir -p "$(dirname "$tile_path")"

  for ((attempt=1; attempt<=MAX_RETRIES; attempt++)); do
    http_code=$(curl -s -o "$tile_path" -w "%{http_code}" --connect-timeout 15 --max-time 30 "$url")

    if [[ "$http_code" == "200" ]]; then
      log "✅ Saved $set/$z/$x/$y"
      return
    elif [[ "$http_code" == "403" || "$http_code" == "429" ]]; then
      delay=$((RETRY_BASE_DELAY * attempt + RANDOM % 2))
      log "🛑 Rate limited $set/$z/$x/$y — HTTP $http_code, retrying in ${delay}s..."
      sleep $delay
    else
      log "⚠️  Skipped $set/$z/$x/$y — HTTP $http_code"
      return
    fi
  done

  log "❌ Failed $set/$z/$x/$y after $MAX_RETRIES retries"
}

# === MAIN LOOP ===
count=0
for set in "day" "night"; do
  for ((z=ZOOM_START; z<=ZOOM_END; z++)); do
    max_tile=$((2 ** z))
    for ((x=0; x<max_tile; x++)); do
      for ((y=0; y<max_tile; y++)); do
        fetch_tile "$set" "$z" "$x" "$y" &
        ((count++))

        if (( count % CONCURRENT_FETCHES == 0 )); then
          wait  # throttle to CONCURRENT_FETCHES
        fi

        if (( count % BATCH_SLEEP_EVERY == 0 )); then
          log "⏳ Pausing for $BATCH_SLEEP_SECONDS seconds to reduce pressure..."
          sleep $BATCH_SLEEP_SECONDS
        fi
      done
    done
  done
done

wait
log "🟡 NASA BunnyCDN tile prefill complete. Sleeping to keep container alive..."
sleep infinity
