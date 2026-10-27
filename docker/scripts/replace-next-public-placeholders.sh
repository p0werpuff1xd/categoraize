#!/bin/sh
set -e

# Next.js inlines NEXT_PUBLIC_ values at build time. Docker images build with
# placeholder values, then this script swaps those placeholders for runtime envs.
# Scan the output once; the old implementation recursively scanned it once per
# placeholder, which made Cloud Run startup exceed its health-check timeout.

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
node "$SCRIPT_DIR/replace-next-public-placeholders.mjs"
