# Component (unit) test plan — CategorAIze

Scope: Prompt A of the capstone test campaign (SE + IAS + ML). Every component is
tested on its own, with real code and small hand-made fixtures. System and
end-to-end tests (Playwright) are Prompt B and are not part of this plan.

## 1. Deliverables

| File | What it is |
|---|---|
| `docs/testing/TEST_PLAN.md` | This plan |
| `docs/testing/component_tests.md` | Results per component, **generated** from the test runs |
| `docs/testing/traceability.csv` | Requirement → test case → result → defect, **generated** |
| `docs/testing/defects.md` | Defect list (ID, severity, status, test) |
| `docs/testing/coverage/` | pytest-cov (`nlp/`) and Vitest v8 (`web/`) HTML/XML/JSON reports |
| `docs/testing/results/` | Raw JUnit XML and psql output the report is built from |

One command reruns everything and rebuilds the report:

```bash
powershell -ExecutionPolicy Bypass -File scripts/testing/run-component-tests.ps1 -WithRestore
```

`scripts/testing/make_component_report.py` reads only the files in
`docs/testing/results/` and `docs/testing/coverage/`; no result is typed by hand.

## 2. Tools

| Layer | Tool | Where |
|---|---|---|
| NLP service (`fastapi_core`) | pytest, pytest-cov, FastAPI `TestClient` (httpx) | `fastapi_core/tests/component/test_cNN_*.py` |
| Web pure logic and components | Vitest (Node 24), Testing Library + jsdom, v8 coverage | `apps/web/**/*.test.ts(x)` |
| Database security (IAS) | psql scripts run as the runtime role, inside a transaction that is rolled back | `scripts/db/test-rls.sql`, `scripts/db/test-erasure.sql` |
| Backup/restore | `scripts/backup/restore-test.ps1` (scratch container, never the live DB) | `docs/testing/results/backup-report.md` |

Each pytest case records `input`, `expected` and `actual` as JUnit properties
through the `case` fixture (`fastapi_core/tests/conftest.py`). Case IDs are the
pytest param id (`C3-01 bukas`) or the `tc=` argument; Vitest cases carry the ID
in the test title (`C11-14 offline: …`). Older web tests written before this
campaign keep their titles and get IDs from their file (`C11-PII01`, `C12-DEL03`).

## 3. Data and determinism

- **No real user email anywhere.** NLP fixtures are short fictional emails written
  for these tests (English, Filipino and Taglish). Web fixtures are synthetic rows.
  The DB scripts copy the local test tenant's rows into a second fake tenant
  (`example.invalid` addresses) and roll everything back.
- **Dataset splits:** the dev split is used only where a test reproduces a tuned
  number (C4 dev span F1 against `eval/results/B4_dev.json`). The test split is
  not touched by component tests; it is reserved for the final evaluation.
- **Fixed seeds:** the tagger training determinism test uses seed 13 and checks
  two runs give identical weights; discovery and Rocchio are deterministic by
  construction and tested for it (C8 isolation case, C9 determinism cases).
- **Time:** date tests pass an explicit `received_at` in Asia/Manila, so the
  results do not depend on the machine clock.

## 4. Components and what is checked

| # | Component | Main cases | Requirement IDs |
|---|---|---|---|
| C1 | Language detection, normalizer | en/tl/mixed/unknown, ALL CAPS, emoji, empty, other language; paki-, po/opo, time glosses | R-01.1, R-01.2 |
| C2 | Category classifier (zero-shot SBERT, 0.35) | one case per category × language (24); threshold boundary 0.35 / 0.3499; tie order; empty, 50k chars, HTML-only, unknown language, oversize → 422 | R-02.1–R-02.3 |
| C3 | Date normalizer and resolver | bukas, mamaya, ngayon, weekdays, alas-dos ng hapon, month names, next Wednesday; month/year rollover; 23:59 / 00:01; Manila offset; ambiguous never counts | R-03.1, R-03.2 |
| C4 | Bi-LSTM-CRF tagger | BIO round trip, adjacent and overlapping spans, stray I-, no-span email, dev span F1, tagging and training determinism | R-04.1, R-04.2 |
| C5 | Priority model and guardrails | VIP+task ≥ P4, promotions ≤ P2, override wins, missing calendar never lowers, ambiguous date never raises, why-list, rules fallback | R-05.1 |
| C6 | Register classifier | formal/neutral/casual × en/mixed/tl | R-06.1 |
| C7 | Calendar conflict | start inclusive, end exclusive, multi-day, timezone, missing/empty calendar, date-only | R-07.1 |
| C8 | Rocchio (α 0.20, β 0.15) | hand-computed example, unit norms, per-user isolation, same-category 422 | R-08.1 |
| C9 | Discovery | ids + vectors only (text rejected), deterministic incl. shuffled input, unit centroids | R-09.1 |
| C10 | API layer | every `/api/v1` route: 401 no key, 401 wrong key, 422 malformed; no content in logs; no DB/token access; stateless; health check | R-10.1–R-10.3 |
| C11 | Web logic | badge P1–P5 and states; filter/sort; rating state machine (idle, saving, saved, error, offline); consent gate and external-AI opt-out; PII masking; AES-256-GCM round trip and tamper; audit writer | R-11.1–R-11.7 |
| C12 | IAS | RLS two tenants; export complete and idempotent; erasure complete and idempotent; token revocation; backup restore dry run and tamper refusal | R-12.1–R-12.4 |

### Notes on how some requirements are tested

- **RLS "using two JWTs" (C12).** The app does not use Supabase JWTs for data
  access: the server connects as the runtime role `categoraize_app` (no
  BYPASSRLS) and sets the tenant per transaction with
  `set_config('app.current_user_id', …)` (`utils/categoraize/tenant.ts`). The
  RLS script therefore tests the two tenants the same way the app does: two
  tenant contexts on the runtime role, plus "no context" and "empty context",
  which must see nothing.
- **Consent gate (C11).** `app/(app)/layout.tsx` redirects to `/consent` when
  `hasAcceptedCurrentTerms()` is false; that function is unit-tested (current,
  withdrawn, old version, another user's row). **Opt-out:** the shared models are
  never trained on user mail (see the data policy), so the opt-out that exists is
  the external-AI one: with it off nothing is sent to an external LLM and the
  local service still answers (features tests `C11-OPT*`).
- **Erasure (C12).** `deleteUser()` is unit-tested with mocks (`C12-DEL*`); the
  database half — that the cascade really empties every CategorAIze table and
  that a second delete is a no-op — is `scripts/db/test-erasure.sql`.

## 5. Entry and exit criteria

- Entry: the NLP venv and the web `node_modules` are installed; for C12 database
  checks the local Docker Postgres (`inbox-zero-services-db-1`) is running.
- Exit: no FAIL; every XFAIL is linked to an open defect in `defects.md` (strict
  xfail: if the code starts passing, the case turns into a FAIL); line coverage
  ≥ 80 % for `fastapi_core/app` and ≥ 70 % for the new web logic.

## 6. Defect handling

A failing case that shows a real bug is either fixed (and listed in
`defects.md` as Fixed, with the test that would have caught it) or kept as a
strict xfail with a defect ID when the fix is a model change outside this
campaign. Production behaviour was changed only to fix bugs found here.
