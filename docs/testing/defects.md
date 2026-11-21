# Defects found by component testing (Prompt A)

| ID | Severity | Status | Component | Found by | Summary |
|---|---|---|---|---|---|
| D-01 | Low | Open | C1 language detection | C1-05 (xfail) | English stems inside Filipino hyphen forms (`i-submit … slides`) are not counted, so a Taglish email is detected as `tl` instead of `mixed`. |
| D-02 | Low | Open | C1 language detection | C1-09 (xfail) | German text is detected as `en` because it shares short function words; the detector has no "other language" class beyond too-short input. |
| D-03 | Medium | Open | C2 classifier | C2-01, 03, 06, 12, 18 (xfail) | With description-only (zero-shot) centroids, 5 of 24 fixtures rank the wrong category first. The 4 Filipino misses score below 0.35 and stay uncategorized (safe). The English work email is accepted as promotions at 0.37 (wrong label shown). Learned (Rocchio) centroids correct this after feedback; a better description set or the learned model is the fix. |
| D-04 | Low | **Fixed** | C11 feedback buttons | C11-14 | The "Rate this priority" buttons had no offline state: offline, the rating showed as saved and then failed. Fixed with `utils/categoraize/rating-state.ts` (idle → saving → saved / error / offline) used by `TriageDetail.tsx`; offline sends nothing, shows a toast and keeps the buttons. |
| D-05 | Medium | **Fixed** | C12 data export | C12-10 | "Download my data" left out 5 of the 14 CategorAIze tables: privacy settings, sender learning rows, category learning rows, deadline alerts and notifications. Fixed in `utils/categoraize/data-export.ts`; vectors and email excerpts (`sourceText`) stay out, as the export notes promise. Against the old code C12-10 fails and lists exactly those 5 tables. |

Severity: High = data loss, a security hole or a wrong action on the user's
mail; Medium = wrong result shown to the user or a privacy right not fully met;
Low = degraded quality with a safe fallback.

Open defects are strict xfails: when one is fixed, its test starts to pass, the
run turns red, and the xfail marker and this table must be updated together.
