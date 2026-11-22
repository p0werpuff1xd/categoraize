#!/usr/bin/env bash
# T-FILE-2: is the attachment-filing LLM gated by the external-LLM consent?
# Static check (no Drive/OneDrive call, no LLM call). Run from the repo root.
set -u
cd "$(dirname "$0")/../../apps/web" || exit 2

echo "LLM call sites in document filing:"
grep -n "createGenerateObject\|createGenerateText" utils/ai/document-filing/*.ts | grep -v test

echo
echo "Callers of the filing engine / reply parser:"
grep -rln "processAttachment(\|parseFilingReply\|aiParseFilingReply" --include=*.ts utils app | grep -v test

echo
echo "Consent checks on the filing path (expected at least one if gated):"
files="utils/drive/filing-engine.ts utils/drive/process-filing-attachments.ts utils/drive/handle-filing-reply.ts utils/ai/document-filing/analyze-document.ts utils/ai/document-filing/parse-filing-reply.ts utils/actions/drive.ts app/api/user/drive/preview/route.ts"
hits=$(grep -n "isExternalLlmAllowed\|assertExternalLlmAllowed\|hasExternalLlmConsent" $files 2>/dev/null)
if [ -n "$hits" ]; then echo "$hits"; echo "RESULT: PASS (gated)"; else echo "(none)"; echo "RESULT: FAIL (filing LLM not gated by external-LLM consent)"; fi

echo
echo "Current gate in filing-engine.ts:"
grep -n "filingEnabled" utils/drive/filing-engine.ts
