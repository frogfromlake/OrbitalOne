#!/bin/bash

# === Download Blue Marble Next Gen (Daytime) tiles ===
echo "Downloading Blue Marble (Day) tiles..."
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74368/world.topo.200406.3x21600x21600.A1.png
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74368/world.topo.200406.3x21600x21600.A2.png
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74368/world.topo.200406.3x21600x21600.B1.png
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74368/world.topo.200406.3x21600x21600.B2.png
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74368/world.topo.200406.3x21600x21600.C1.png
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74368/world.topo.200406.3x21600x21600.C2.png
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74368/world.topo.200406.3x21600x21600.D1.png
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74368/world.topo.200406.3x21600x21600.D2.png

# === Download Black Marble (Nighttime) 2016 tiles ===
echo "Downloading Black Marble (Night) tiles..."
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_A1.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_A2.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_B1.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_B2.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_C1.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_C2.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_D1.jpg
wget -c https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_D2.jpg

echo "✅ All downloads attempted. Now verifying files..."

# ========== Automated Corruption Check and Redownload ==========

redownloads=0

# --- PNG CHECK ---
for f in world*.png; do
  if ! pngcheck -q "$f"; then
    echo "❌ PNG error: $f – re-downloading..."
    wget -c "https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74368/$f"
    redownloads=1
  fi
done

# --- JPG CHECK ---
# Try jpeginfo, else fallback to identify (ImageMagick)
jpg_tool=""
if command -v jpeginfo >/dev/null; then
  jpg_tool="jpeginfo -c"
elif command -v identify >/dev/null; then
  jpg_tool="identify"
else
  echo "⚠️ Neither jpeginfo nor identify found; JPG integrity checks will be skipped."
fi

for f in BlackMarble_2016_*.jpg; do
  if [[ -n "$jpg_tool" ]]; then
    $jpg_tool "$f" >/dev/null 2>&1
    if [[ $? -ne 0 ]]; then
      echo "❌ JPG error: $f – re-downloading..."
      wget -c "https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/$f"
      redownloads=1
    fi
  fi
done

# If any were redownloaded, re-check them
if [[ $redownloads -eq 1 ]]; then
  echo "🔄 Re-running file checks after re-download..."

  for f in world*.png; do
    if ! pngcheck -q "$f"; then
      echo "❌ FINAL PNG error: $f – please check the source or network."
    fi
  done

  for f in BlackMarble_2016_*.jpg; do
    if [[ -n "$jpg_tool" ]]; then
      $jpg_tool "$f" >/dev/null 2>&1
      if [[ $? -ne 0 ]]; then
        echo "❌ FINAL JPG error: $f – please check the source or network."
      fi
    fi
  done
fi

echo "🎉 Download & verification complete."
