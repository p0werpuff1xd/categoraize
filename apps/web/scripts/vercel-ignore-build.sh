#!/usr/bin/env bash

set -euo pipefail

if [[ "${VERCEL_ENV:-}" != "preview" ]]; then
  echo "Non-preview environment; continue build."
  exit 1
fi

if [[ "${FORCE_VERCEL_PREVIEW_BUILD:-}" == "1" ]] || [[ "${FORCE_VERCEL_PREVIEW_BUILD:-}" == "true" ]]; then
  echo "FORCE_VERCEL_PREVIEW_BUILD is enabled; continue build."
  exit 1
fi

current_ref="${VERCEL_GIT_COMMIT_REF:-}"
if [[ "${current_ref}" == "main" ]] || [[ "${current_ref}" == "staging" ]]; then
  echo "Preview deployment for ${current_ref} is allowed; continue build."
  exit 1
fi

# Vercel does not provide a previous commit for the first deployment of a
# project. Let that deployment run so a newly connected project can bootstrap
# before the branch filter applies to later preview deployments.
if [[ -z "${VERCEL_GIT_PREVIOUS_SHA:-}" ]]; then
  echo "First preview deployment; continue build."
  exit 1
fi

echo "Skipping preview build for branch ${current_ref:-unknown}."
echo "Set FORCE_VERCEL_PREVIEW_BUILD=true to build manually."
exit 0
