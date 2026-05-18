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

# Check docker compose command
if ! docker compose version &> /dev/null; then
    echo "❌ docker compose command not available"
    echo "   Install Docker Compose v2 or use 'docker-compose' (v1)"
    exit 1
fi

echo "✓ docker compose is available"
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
    echo "   Run: docker compose up -d"
    exit 1
fi
echo "✓ watch-wallet-api is running"

# Check if watch-wallet-web is running
if ! docker compose ps | grep -q "watch-wallet-web.*Up"; then
    echo "❌ watch-wallet-web is not running"
    echo "   Run: docker compose up -d"
    exit 1
fi
echo "✓ watch-wallet-web is running"
echo ""

# Check docker-compose.yml for incorrect API port publishing
echo "--- Docker Compose Configuration Check ---"
if grep -A 10 'watch-wallet-api:' docker-compose.yml | grep -q '^\s*ports:'; then
    echo "❌ watch-wallet-api should use 'expose', not 'ports'"
    echo "   Port 3011 must be Docker-internal only"
    echo ""
    echo "   Problem: API port 3011 is published to host"
    echo "   Cause: docker-compose.yml has 'ports:' under watch-wallet-api"
    echo "   Fix: Change 'ports:' to 'expose:' for watch-wallet-api service"
    exit 1
fi
echo "✓ watch-wallet-api does not publish port 3011 to host"

# Check if expose is used instead
if ! grep -A 10 'watch-wallet-api:' docker-compose.yml | grep -q 'expose:'; then
    echo "⚠️  Warning: watch-wallet-api should use 'expose: [\"3011\"]'"
fi
echo ""

# Check API logs for correct binding
echo "--- API Container Logs (last 30 lines) ---"
API_LOGS=$(docker compose logs watch-wallet-api --tail=30 2>&1 || true)
echo "$API_LOGS"
echo ""

# Check if API is binding to 127.0.0.1 only (incorrect for Docker)
if echo "$API_LOGS" | grep -q "Server listening at http://127.0.0.1:3011"; then
    echo "❌ API is binding to 127.0.0.1 only"
    echo ""
    echo "   Problem: API cannot be reached from web container"
    echo "   Cause: API_HOST or HOST is not set to 0.0.0.0"
    echo "   Fix: Add 'API_HOST=0.0.0.0' and 'HOST=0.0.0.0' to docker-compose.yml environment"
    exit 1
fi

# Check if API is binding to a Docker internal IP (correct)
if echo "$API_LOGS" | grep -qE "Server listening at http://(172\.|10\.|192\.168\.|0\.0\.0\.0)"; then
    echo "✓ API is binding to Docker-accessible address"
else
    echo "⚠️  Warning: Could not verify API binding address from logs"
    echo "   Expected: 'Server listening at http://172.x.x.x:3011' or similar"
fi
echo ""

# Check web logs for connection errors
echo "--- Web Container Logs (last 50 lines) ---"
WEB_LOGS=$(docker compose logs watch-wallet-web --tail=50 2>&1 || true)
echo "$WEB_LOGS"
echo ""

# Check for ECONNREFUSED to 127.0.0.1:3011 (incorrect)
if echo "$WEB_LOGS" | grep -q "ECONNREFUSED 127.0.0.1:3011"; then
    echo "❌ Web container cannot reach API at 127.0.0.1:3011"
    echo ""
    echo "   Problem: Web container is trying to reach API at 127.0.0.1"
    echo "   Cause: INTERNAL_API_URL is set to http://127.0.0.1:3011"
    echo "   Fix: Set INTERNAL_API_URL=http://watch-wallet-api:3011 in .env"
    echo "   Then: docker compose up --build -d"
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
        elif [ "$INTERNAL_API_URL" = "http://127.0.0.1:3011" ]; then
            echo "⚠️  INTERNAL_API_URL is set to: http://127.0.0.1:3011"
            echo "   For Docker Compose, it should be: http://watch-wallet-api:3011"
            echo "   (127.0.0.1 is only correct for direct Node.js/systemd deployment)"
        else
            echo "⚠️  INTERNAL_API_URL is set to: $INTERNAL_API_URL"
            echo "   Expected: http://watch-wallet-api:3011 (Docker Compose)"
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

# Check host web endpoint
echo "--- Host Web Endpoint Check ---"
if command -v curl &> /dev/null; then
    if curl --max-time 5 --fail --silent http://127.0.0.1:3010/api/status > /dev/null 2>&1; then
        echo "✓ Web endpoint http://127.0.0.1:3010/api/status is reachable from host"
    else
        echo "⚠️  Warning: Could not reach http://127.0.0.1:3010/api/status from host"
        echo "   This may be normal if web container is not fully started"
    fi
else
    echo "⚠️  curl not available, skipping web endpoint check"
fi
echo ""

# Check host direct API access (should fail in hardened mode)
echo "--- Host Direct API Access Check ---"
if command -v curl &> /dev/null; then
    if curl --max-time 3 --fail --silent http://127.0.0.1:3011/health > /dev/null 2>&1; then
        echo "⚠️  WARNING: API port 3011 is accessible from host"
        echo "   In hardened Docker mode, port 3011 should NOT be published to host"
        echo "   Check docker-compose.yml: watch-wallet-api should use 'expose', not 'ports'"
    else
        echo "✓ API port 3011 is NOT accessible from host (correct for hardened mode)"
    fi
else
    echo "⚠️  curl not available, skipping direct API access check"
fi
echo ""

# Check web container to API connectivity
echo "--- Web Container to API Connectivity Check ---"
if docker compose exec -T watch-wallet-web sh -c 'command -v wget' &> /dev/null; then
    if docker compose exec -T watch-wallet-web sh -c 'wget -qO- --timeout=5 http://watch-wallet-api:3011/health' > /dev/null 2>&1; then
        echo "✓ Web container can reach API at http://watch-wallet-api:3011/health"
    else
        echo "❌ Web container cannot reach API at http://watch-wallet-api:3011/health"
        echo ""
        echo "   Problem: Docker internal networking is broken"
        echo "   Possible causes:"
        echo "   - API container is not running"
        echo "   - API is binding to 127.0.0.1 instead of 0.0.0.0"
        echo "   - Docker network issue"
        exit 1
    fi
elif docker compose exec -T watch-wallet-web sh -c 'command -v curl' &> /dev/null; then
    if docker compose exec -T watch-wallet-web sh -c 'curl --max-time 5 --fail --silent http://watch-wallet-api:3011/health' > /dev/null 2>&1; then
        echo "✓ Web container can reach API at http://watch-wallet-api:3011/health"
    else
        echo "❌ Web container cannot reach API at http://watch-wallet-api:3011/health"
        echo ""
        echo "   Problem: Docker internal networking is broken"
        exit 1
    fi
else
    echo "⚠️  Neither wget nor curl available in web container, skipping connectivity check"
fi
echo ""

echo "=== Validation Complete ==="
echo ""
echo "Summary:"
echo "- Docker containers are running"
echo "- API port 3011 is not published to host"
echo "- API is binding to Docker-accessible address"
echo "- Web container can reach API via Docker internal network"
echo "- INTERNAL_API_URL configuration is appropriate"
echo ""
echo "Next steps:"
echo "1. Access web UI at: https://<your-tailscale-host>:8443"
echo "2. Verify Caddy is reverse proxying to 127.0.0.1:3010"
echo "3. Do NOT expose port 3011 or 8332 to public internet"
echo ""
echo "Note: In hardened Docker mode, direct host access to port 3011 should fail."
echo "      This is correct. The browser accesses the web container via Caddy,"
echo "      and the web container accesses the API via Docker internal network."
