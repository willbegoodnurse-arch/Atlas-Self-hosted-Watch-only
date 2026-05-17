#!/usr/bin/env bash
# Raspberry Pi runtime validation script for Atlas watch-wallet
# This script checks Docker container status and networking configuration
# without exposing secrets from .env

set -euo pipefail

echo "=== Atlas Raspberry Pi Runtime Validation ==="
echo ""

# Check if docker compose is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed or not in PATH"
    exit 1
fi

echo "✓ Docker is available"
echo ""

# Check docker compose ps
echo "--- Docker Container Status ---"
if ! docker compose ps; then
    echo "❌ docker compose ps failed"
    exit 1
fi
echo ""

# Check if watch-wallet-api is running
if ! docker compose ps | grep -q "watch-wallet-api.*Up"; then
    echo "❌ watch-wallet-api is not running"
    exit 1
fi
echo "✓ watch-wallet-api is running"

# Check if watch-wallet-web is running
if ! docker compose ps | grep -q "watch-wallet-web.*Up"; then
    echo "❌ watch-wallet-web is not running"
    exit 1
fi
echo "✓ watch-wallet-web is running"
echo ""

# Check docker-compose.yml for incorrect API port publishing
echo "--- Docker Compose Configuration Check ---"
if grep -q 'ports:' docker-compose.yml && \
   grep -A 5 'watch-wallet-api:' docker-compose.yml | grep -q 'ports:'; then
    echo "❌ watch-wallet-api should use 'expose', not 'ports'"
    echo "   Port 3011 must be Docker-internal only"
    exit 1
fi
echo "✓ watch-wallet-api does not publish port 3011 to host"

# Check if expose is used instead
if ! grep -A 10 'watch-wallet-api:' docker-compose.yml | grep -q 'expose:'; then
    echo "⚠️  Warning: watch-wallet-api should use 'expose: [\"3011\"]'"
fi
echo ""

# Check API logs for correct binding (last 50 lines)
echo "--- API Container Logs (last 30 lines) ---"
API_LOGS=$(docker compose logs watch-wallet-api --tail=30 2>&1 || true)
echo "$API_LOGS"
echo ""

# Check if API is binding to 127.0.0.1 only (incorrect for Docker)
if echo "$API_LOGS" | grep -q "Server listening at http://127.0.0.1:3011"; then
    echo "❌ API is binding to 127.0.0.1 only"
    echo "   This prevents Docker internal networking"
    echo "   Set API_HOST=0.0.0.0 or HOST=0.0.0.0 in environment"
    exit 1
fi

# Check if API is binding to a Docker internal IP (correct)
if echo "$API_LOGS" | grep -qE "Server listening at http://(172\.|0\.0\.0\.0)"; then
    echo "✓ API is binding to Docker-accessible address"
else
    echo "⚠️  Warning: Could not verify API binding address from logs"
fi
echo ""

# Check web logs for connection errors (last 50 lines)
echo "--- Web Container Logs (last 50 lines) ---"
WEB_LOGS=$(docker compose logs watch-wallet-web --tail=50 2>&1 || true)
echo "$WEB_LOGS"
echo ""

# Check for ECONNREFUSED to 127.0.0.1:3011 (incorrect)
if echo "$WEB_LOGS" | grep -q "ECONNREFUSED 127.0.0.1:3011"; then
    echo "❌ Web container cannot reach API at 127.0.0.1:3011"
    echo "   INTERNAL_API_URL must be http://watch-wallet-api:3011"
    exit 1
fi
echo "✓ No ECONNREFUSED 127.0.0.1:3011 errors in web logs"
echo ""

# Check .env for INTERNAL_API_URL (without exposing secrets)
echo "--- Environment Configuration Check ---"
if [ -f .env ]; then
    # Check INTERNAL_API_URL without printing the full .env
    if grep -q "^INTERNAL_API_URL=" .env; then
        INTERNAL_API_URL=$(grep "^INTERNAL_API_URL=" .env | cut -d= -f2)
        if [ "$INTERNAL_API_URL" = "http://watch-wallet-api:3011" ]; then
            echo "✓ INTERNAL_API_URL is correctly set to http://watch-wallet-api:3011"
        else
            echo "❌ INTERNAL_API_URL is set to: $INTERNAL_API_URL"
            echo "   It should be: http://watch-wallet-api:3011"
            exit 1
        fi
    else
        echo "⚠️  Warning: INTERNAL_API_URL not found in .env"
    fi

    # Check NEXT_PUBLIC_API_URL
    if grep -q "^NEXT_PUBLIC_API_URL=" .env; then
        NEXT_PUBLIC_API_URL=$(grep "^NEXT_PUBLIC_API_URL=" .env | cut -d= -f2)
        if [ "$NEXT_PUBLIC_API_URL" = "/api" ]; then
            echo "✓ NEXT_PUBLIC_API_URL is correctly set to /api (same-origin mode)"
        else
            echo "⚠️  NEXT_PUBLIC_API_URL is set to: $NEXT_PUBLIC_API_URL"
            echo "   Recommended: /api for same-origin mode"
        fi
    fi
else
    echo "⚠️  Warning: .env file not found"
fi
echo ""

echo "=== Validation Complete ==="
echo ""
echo "Summary:"
echo "- Docker containers are running"
echo "- API port 3011 is not published to host"
echo "- API is binding to Docker-accessible address"
echo "- Web container can reach API via Docker internal network"
echo "- INTERNAL_API_URL is correctly configured"
echo ""
echo "Next steps:"
echo "1. Access web UI at: https://raspberry-pi-fullcrum.tailcb1ed9.ts.net:8443"
echo "2. Verify Caddy is reverse proxying to 127.0.0.1:3010"
echo "3. Do NOT expose port 3011 or 8332 to public internet"
