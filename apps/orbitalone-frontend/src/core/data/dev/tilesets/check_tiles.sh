#!/bin/bash

# CONFIGURATION
TILE_ROOT="tiles"          # Parent directory containing day/night
MODES=(day night)
ZOOM_MIN=5
ZOOM_MAX=7

# Optionally set KTX2CHECK to the path to ktx2check if you want deep checks
KTX2CHECK=$(which ktx2check 2>/dev/null)

echo "🔎 Checking for missing and corrupt .ktx2 files in $TILE_ROOT..."

MISSING=0
CORRUPT=0

for MODE in "${MODES[@]}"; do
  for Z in $(seq $ZOOM_MIN $ZOOM_MAX); do
    N=$((2 ** Z))
    for X in $(seq 0 $((N-1))); do
      for Y in $(seq 0 $((N-1))); do
        FILE="$TILE_ROOT/$MODE/$Z/$X/$Y.ktx2"
        if [[ ! -f "$FILE" ]]; then
          echo "❌ MISSING: $FILE"
          ((MISSING++))
        elif [[ ! -s "$FILE" ]]; then
          echo "❌ ZERO SIZE: $FILE"
          ((CORRUPT++))
        elif [[ -n "$KTX2CHECK" ]]; then
          # Run deep check if available
          if ! "$KTX2CHECK" "$FILE" >/dev/null 2>&1; then
            echo "❌ CORRUPT: $FILE (ktx2check failed)"
            ((CORRUPT++))
          fi
        fi
      done
    done
  done
done

echo "------------------------------------------------------------"
echo "Done. $MISSING missing, $CORRUPT corrupt tiles detected."
if [[ $MISSING -eq 0 && $CORRUPT -eq 0 ]]; then
  echo "✅ All tiles present and healthy!"
else
  echo "⚠️  Please re-build or re-compress the above files."
fi
