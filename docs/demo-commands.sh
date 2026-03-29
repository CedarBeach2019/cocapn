#!/bin/bash
# Cocapn demo script for asciinema recording
#
# Run: asciinema rec -c bash docs/demo-commands.sh

set -e

echo ""
echo "=== Cocapn Demo ==="
echo ""
echo "Creating cocapn instance..."
npx create-cocapn demo-agent

cd demo-agent

echo ""
echo "Starting bridge..."
echo ""

cocapn start &
BRIDGE_PID=$!

# Wait for bridge to be ready
sleep 3

echo ""
echo "Demo ready. Open http://localhost:3000"
echo ""
echo "--- Chat in the browser, then Ctrl+C to stop ---"
echo ""

wait $BRIDGE_PID
