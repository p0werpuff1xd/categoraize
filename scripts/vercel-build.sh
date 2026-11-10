#!/usr/bin/env bash
set -euo pipefail

unset PRIVATE_BUILD_TOKEN
export SKIP_TYPE_CHECK=true
export STANDALONE_BUILD=true
export VERCEL_STANDALONE=true
export DOCKER_BUILD=true

if [ "${VERCEL_ENV:-}" = "preview" ] && [ "${IS_OAUTH_PROXY_SERVER:-}" != "true" ]; then
  NEXT_PUBLIC_BASE_URL="https://${VERCEL_URL}" \
    turbo run build --concurrency=1 --force --filter='{apps/web}...'
else
  turbo run build --concurrency=1 --filter='{apps/web}...'
fi

echo "Packaging standalone build into Vercel Build Output API (1 function)..."
node scripts/package-vercel-standalone.mjs
