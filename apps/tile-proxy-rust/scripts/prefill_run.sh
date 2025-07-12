#!/bin/bash
set -e
echo "Starting NASA tile prefill in background..."
/app/scripts/prefill_nasa_tiles.sh --allow-existing &
echo "Starting tile-proxy-rust server..."
exec /usr/local/bin/tile-proxy-rust