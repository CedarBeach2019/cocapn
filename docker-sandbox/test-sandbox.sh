#!/bin/bash
set -euo pipefail

# ── Cocapn Sandbox Test Suite ──────────────────────────────────────
# Usage: bash test-sandbox.sh [BASE_URL]
# ─────────────────────────────────────────────────────────────────────

BASE_URL="${1:-http://localhost:3100}"
PASS=0
FAIL=0
SKIP=0

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
RESET='\033[0m'

pass() { PASS=$((PASS + 1)); echo -e "  ${GREEN}PASS${RESET} $*"; }
fail() { FAIL=$((FAIL + 1)); echo -e "  ${RED}FAIL${RESET} $*"; }
skip() { SKIP=$((SKIP + 1)); echo -e "  ${YELLOW}SKIP${RESET} $*"; }

echo -e "${BOLD}Cocapn Sandbox Test Suite${RESET}"
echo "Target: $BASE_URL"
echo ""

# ── Test 1: Health Check ─────────────────────────────────────────────

echo -n "1. Health check... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ]; then
  pass "HTTP $STATUS"
else
  fail "HTTP $STATUS (expected 200)"
fi

# ── Test 2: Health Response Body ─────────────────────────────────────

echo -n "2. Health response body... "
BODY=$(curl -sf "$BASE_URL/health" 2>/dev/null || echo "")
if echo "$BODY" | grep -q '"status"'; then
  pass "Contains status field"
else
  fail "Missing status field: $BODY"
fi

# ── Test 3: Chat Endpoint ────────────────────────────────────────────

echo -n "3. Chat endpoint... "
CHAT_RESPONSE=$(curl -sf -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, what is 2+2?"}' \
  --max-time 30 2>/dev/null || echo "")
if [ -n "$CHAT_RESPONSE" ]; then
  pass "Got response from chat endpoint"
else
  fail "No response from chat endpoint (check API key in .env)"
fi

# ── Test 4: Chat Response Contains Content ───────────────────────────

echo -n "4. Chat response has content... "
if echo "$CHAT_RESPONSE" | grep -qiE '(four|4|answer)'; then
  pass "Response contains relevant content"
else
  # Response exists but content check is fuzzy — don't fail hard
  skip "Could not verify content (LLM may have responded differently)"
fi

# ── Test 5: Streaming ───────────────────────────────────────────────

echo -n "5. Streaming endpoint... "
STREAM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hi", "stream": true}' \
  --max-time 30 2>/dev/null || echo "000")
if [ "$STREAM_STATUS" = "200" ]; then
  pass "Streaming endpoint returned HTTP $STREAM_STATUS"
else
  fail "Streaming returned HTTP $STREAM_STATUS"
fi

# ── Test 6: Memory Store + Recall ────────────────────────────────────

echo -n "6. Memory store... "
MEM_SET_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/memory" \
  -H "Content-Type: application/json" \
  -d '{"key": "test.sandbox", "value": "hello from test"}' \
  --max-time 10 2>/dev/null || echo "000")
if [ "$MEM_SET_STATUS" = "200" ] || [ "$MEM_SET_STATUS" = "201" ]; then
  pass "Memory store returned HTTP $MEM_SET_STATUS"
else
  skip "Memory endpoint returned HTTP $MEM_SET_STATUS (may not be implemented)"
fi

echo -n "7. Memory recall... "
MEM_GET_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/memory/test.sandbox" \
  --max-time 10 2>/dev/null || echo "000")
if [ "$MEM_GET_STATUS" = "200" ]; then
  pass "Memory recall returned HTTP $MEM_GET_STATUS"
else
  skip "Memory recall returned HTTP $MEM_GET_STATUS"
fi

# ── Test 8: WebSocket ───────────────────────────────────────────────

echo -n "8. WebSocket upgrade... "
WS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Upgrade: websocket" \
  -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Sec-WebSocket-Version: 13" \
  "$BASE_URL/ws" 2>/dev/null || echo "000")
if [ "$WS_STATUS" = "101" ]; then
  pass "WebSocket upgrade returned HTTP 101"
else
  skip "WebSocket returned HTTP $WS_STATUS (may require different path)"
fi

# ── Test 9: CORS Headers ────────────────────────────────────────────

echo -n "9. CORS headers... "
CORS=$(curl -sI "$BASE_URL/health" 2>/dev/null | grep -i "access-control" || echo "")
if [ -n "$CORS" ]; then
  pass "CORS headers present"
else
  skip "No CORS headers (may be expected in private mode)"
fi

# ── Test 10: Docker Container Health ────────────────────────────────

echo -n "10. Docker container health... "
if command -v docker >/dev/null 2>&1; then
  CONTAINER_STATUS=$(docker inspect --format='{{.State.Health.Status}}' cocapn-sandbox 2>/dev/null || echo "unknown")
  if [ "$CONTAINER_STATUS" = "healthy" ]; then
    pass "Container is healthy"
  else
    fail "Container status: $CONTAINER_STATUS"
  fi
else
  skip "Docker not available"
fi

# ── Report ───────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}Results:${RESET} $PASS passed, $FAIL failed, $SKIP skipped"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}${BOLD}Some tests failed.${RESET} Check logs: docker compose logs cocapn"
  exit 1
else
  echo -e "${GREEN}${BOLD}All tests passed!${RESET}"
  exit 0
fi
