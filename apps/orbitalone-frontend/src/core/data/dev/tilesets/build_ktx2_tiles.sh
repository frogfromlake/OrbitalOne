#!/bin/bash
set -e

LOGFILE="build_ktx2_tiles.log"
exec > >(tee -a "$LOGFILE") 2>&1

# CONFIG
ZOOM="5-7"
DAY_DIR="tiles/day"
NIGHT_DIR="tiles/night"
TRANSCODED_FORMAT="ktx2"
MERGED_DAY="merged_day.vrt"
MERGED_NIGHT="merged_night.vrt"
DAY_TILESET_DIR="tileset/day"
NIGHT_TILESET_DIR="tileset/night"
GDAL2TILES="/opt/homebrew/bin/gdal2tiles.py"
PYTHON3BIN="/opt/homebrew/bin/python3"

# Tools
TOKTX=$(which toktx)
command -v gdalbuildvrt >/dev/null || {
  echo "❌ gdalbuildvrt not found"
  exit 1
}
[ -x "$TOKTX" ] || {
  echo "❌ toktx not found"
  exit 1
}
[ -x "$GDAL2TILES" ] || {
  echo "❌ gdal2tiles.py not found at $GDAL2TILES"
  exit 1
}
command -v mogrify >/dev/null || {
  echo "❌ mogrify (ImageMagick) not found. Please install ImageMagick."
  exit 1
}

# Directories
echo -e "\n📁 Creating folders..."
mkdir -p "$DAY_DIR" "$NIGHT_DIR"

# Bounds lookup
get_bounds_for_tile() {
  local key="$1"
  local col=${key:0:1}
  local row=${key:1:1}
  case "$col" in A) x=0 ;; B) x=1 ;; C) x=2 ;; D) x=3 ;; *) return 1 ;; esac
  case "$row" in 1) y=0 ;; 2) y=1 ;; *) return 1 ;; esac
  local lon_min=$((-180 + x * 90))
  local lon_max=$((lon_min + 90))
  local lat_max=$((90 - y * 90))
  local lat_min=$((lat_max - 90))
  echo "$lon_min $lat_max $lon_max $lat_min"
}

# --- Blue Marble VRT ---
echo -e "\n🌍 Building VRT for Blue Marble PNGs..."
rm -f "$MERGED_DAY"
mkdir -p vrt_tiles/day
VRT_DAY_INPUTS=()
for f in world*.png; do
  if [[ ! -f "$f" ]]; then
    echo "❌ PNG missing: $f"
    continue
  fi
  base=$(basename "$f" .png)
  key=$(echo "$base" | grep -oE '[A-D][12]$') || continue
  bounds=$(get_bounds_for_tile "$key") || continue
  vrt="vrt_tiles/day/$base.vrt"
  echo "🧭 Creating VRT for $f with bounds $bounds"
  gdal_translate -of VRT -a_ullr $bounds -a_srs EPSG:4326 "$f" "$vrt"
  VRT_DAY_INPUTS+=("$vrt")
done

gdalbuildvrt -a_srs EPSG:4326 "$MERGED_DAY" "${VRT_DAY_INPUTS[@]}"
[ -f "$MERGED_DAY" ] || { echo "❌ $MERGED_DAY not created! Aborting."; exit 1; }

# --- Black Marble VRT ---
echo -e "\n🌌 Building VRT for Black Marble JPEGs..."
rm -f "$MERGED_NIGHT"
mkdir -p vrt_tiles/night
VRT_NIGHT_INPUTS=()
for f in BlackMarble_2016_*.jpg; do
  if [[ ! -f "$f" ]]; then
    echo "❌ JPG missing: $f"
    continue
  fi
  base=$(basename "$f" .jpg)
  key=$(echo "$base" | grep -oE '[A-D][12]$') || continue
  bounds=$(get_bounds_for_tile "$key") || continue
  vrt="vrt_tiles/night/$base.vrt"
  echo "🧭 Creating VRT for $f with bounds $bounds"
  gdal_translate -of VRT -a_ullr $bounds -a_srs EPSG:4326 "$f" "$vrt"
  VRT_NIGHT_INPUTS+=("$vrt")
done

gdalbuildvrt -a_srs EPSG:4326 "$MERGED_NIGHT" "${VRT_NIGHT_INPUTS[@]}"
[ -f "$MERGED_NIGHT" ] || { echo "❌ $MERGED_NIGHT not created! Aborting."; exit 1; }

# --- Tiling ---
echo -e "\n🧱 Tiling $MERGED_DAY → $DAY_DIR ..."
"$PYTHON3BIN" "$GDAL2TILES" -z "$ZOOM" -r bilinear -w none -t "Blue Marble Day" "$MERGED_DAY" "$DAY_DIR"
[ "$(ls -A "$DAY_DIR")" ] || { echo "❌ No PNG tiles generated in $DAY_DIR. Aborting."; exit 1; }

echo -e "\n🧱 Tiling $MERGED_NIGHT → $NIGHT_DIR ..."
"$PYTHON3BIN" "$GDAL2TILES" -z "$ZOOM" -r bilinear -w none -t "Black Marble Night" "$MERGED_NIGHT" "$NIGHT_DIR"
[ "$(ls -A "$NIGHT_DIR")" ] || { echo "❌ No PNG tiles generated in $NIGHT_DIR. Aborting."; exit 1; }

# --- Vertical flip for Y-up KTX2 ---
echo -e "\n🌀 Flipping all PNG tiles vertically for Y-up KTX2..."
find "$DAY_DIR" -type f -name "*.png" -exec mogrify -flip {} +
find "$NIGHT_DIR" -type f -name "*.png" -exec mogrify -flip {} +

# --- Compression ---
compress_to_ktx2() {
  local DIR="$1"
  echo -e "\n🎛️ Compressing $DIR ..."
  find "$DIR" -type f \( -name "*.png" -o -name "*.jpg" \) -print0 | while IFS= read -r -d '' file; do
    local output="${file%.*}.ktx2"
    [ -f "$output" ] && echo "✅ Skipping $output" && continue
    echo "🧊 Compressing $file → $output"
    if ! "$TOKTX" --encode uastc --zcmp 19 --genmipmap "$output" "$file" >/dev/null; then
      echo "❌ Failed to compress $file"
    fi
  done
}

compress_to_ktx2 "$DAY_DIR"
compress_to_ktx2 "$NIGHT_DIR"

# Remove source PNGs after compression to KTX2
echo -e "\n🧽 Cleaning up original .png tiles..."
find "$DAY_DIR" -type f -name "*.png" -delete
find "$NIGHT_DIR" -type f -name "*.png" -delete

# Cleanup
echo -e "\n🧼 Cleaning up temporary VRT files..."
rm -f "$MERGED_DAY" "$MERGED_NIGHT"
rm -rf vrt_tiles

echo -e "\n✅ 3D Tilesets ready for 3DTilesRendererJS:"
echo "   📁 $DAY_TILESET_DIR"
echo "   📁 $NIGHT_TILESET_DIR"
