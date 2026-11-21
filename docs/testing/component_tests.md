# Component (unit) test results

Generated 2026-11-19 17:09 UTC by `scripts/testing/make_component_report.py` from the JUnit XML and psql output
in `docs/testing/results/`. Do not edit by hand: rerun `scripts/testing/run-component-tests.ps1`.

XFAIL = a strict expected failure tied to an open defect in `defects.md`; it turns into a FAIL
if the code starts passing, so the defect list cannot go stale.

## Totals

| Component | Cases | Pass | Fail | XFAIL (known defect) | Skip |
|---|---:|---:|---:|---:|---:|
| C1 Language detection and normalizer | 15 | 13 | 0 | 2 | 0 |
| C2 Category classifier (zero-shot SBERT, threshold 0.35) | 32 | 27 | 0 | 5 | 0 |
| C3 Date normalizer and resolver | 25 | 25 | 0 | 0 | 0 |
| C4 Bi-LSTM-CRF tagger | 12 | 12 | 0 | 0 | 0 |
| C5 Priority model and guardrails | 16 | 16 | 0 | 0 | 0 |
| C6 Register classifier | 9 | 9 | 0 | 0 | 0 |
| C7 Calendar conflict | 13 | 13 | 0 | 0 | 0 |
| C8 Rocchio feedback (alpha 0.20, beta 0.15) | 10 | 10 | 0 | 0 | 0 |
| C9 Discovery (clustering) | 6 | 6 | 0 | 0 | 0 |
| C10 API layer | 37 | 37 | 0 | 0 | 0 |
| C11 Web app logic | 93 | 93 | 0 | 0 | 0 |
| C12 IAS: RLS, export/erasure, backup/restore | 44 | 44 | 0 | 0 | 0 |
| **All** | **312** | **305** | **0** | **7** | **0** |

## Coverage

| Scope | Line coverage | Target |
|---|---:|---:|
| NLP service `fastapi_core/app` (pytest-cov) | 95.0% | 80% |
| New web logic (Vitest v8) | 93.2% | 70% |

HTML reports: `docs/testing/coverage/nlp/html/index.html`, `docs/testing/coverage/web/index.html`.

## C1. Language detection and normalizer

| ID | Case | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| C1-01 | English | Please send the quarterly report before the meeting tomorro… | en | en | PASS |
| C1-02 | Filipino with po | Pakipadala po ang ulat bago ang pulong bukas. Salamat po. | tl | tl | PASS |
| C1-03 | Taglish | Paki-send naman yung report bago ang meeting bukas, thanks! | mixed | mixed | PASS |
| C1-04 | ALL CAPS Filipino | PAKI-SUBMIT PO ANG REQUIREMENTS BUKAS | tl | tl | PASS |
| C1-05 | hyphenated form and emoji | i-submit mo na yung slides ngayon 🙏🔥 | mixed | tl | XFAIL (known defect D-01) |
| C1-06 | too short | ok | unknown | unknown | PASS |
| C1-07 | empty |  | unknown | unknown | PASS |
| C1-08 | emoji only | 😂😂😂 🙏 | unknown | unknown | PASS |
| C1-09 | other language | Bitte senden Sie den Bericht bis morgen an das Team. | unknown | en | XFAIL (known defect D-02) |
| C1-10 | paki- request prefix becomes please | Pakipadala po ang ulat | contains 'please send' | please send the report | PASS |
| C1-11 | po/opo particles dropped, salamat glossed | Opo, salamat po | contains 'thanks' | , thanks | PASS |
| C1-12 | ALL CAPS time words glossed | BUKAS NG UMAGA | contains 'tomorrow' | tomorrow of morning | PASS |
| C1-13 | hyphenated i- form kept intact | i-submit bukas | contains 'i-submit' | i-submit tomorrow | PASS |
| C1-14 | test_normalizer_keeps_particles_when_asked | Salamat po | contains 'po' | thanks po | PASS |
| C1-15 | test_particles_po_opo_are_removed | Opo, salamat po | no 'po' or 'opo' tokens | , thanks | PASS |

Sources: `fastapi_core/tests/component/test_c01_language_normalizer.py`

## C2. Category classifier (zero-shot SBERT, threshold 0.35)

| ID | Case | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| C2-01 | work_tasks en | [en] Report review: Hi, please review the Q4 sales report a… | top-ranked = work_tasks | top-ranked = promotions (0.37); chosen = promotions | XFAIL (known defect D-03) |
| C2-02 | work_tasks mixed | [mixed] Report review: Hi, paki-review naman ng Q4 sales re… | top-ranked = work_tasks | top-ranked = work_tasks (0.37); chosen = work_tasks | PASS |
| C2-03 | work_tasks tl | [tl] Pagsusuri ng ulat: Pakisuri po ang ulat ng benta para … | top-ranked = work_tasks | top-ranked = personal (0.14); chosen = None | XFAIL (known defect D-03) |
| C2-04 | meetings en | [en] Meeting invite: Can we schedule a meeting on Thursday … | top-ranked = meetings | top-ranked = meetings (0.65); chosen = meetings | PASS |
| C2-05 | meetings mixed | [mixed] Meeting tayo: Pwede ba tayong mag-meeting sa Thursd… | top-ranked = meetings | top-ranked = meetings (0.52); chosen = meetings | PASS |
| C2-06 | meetings tl | [tl] Pulong: Maaari ba tayong magpulong sa Huwebes, alas-do… | top-ranked = meetings | top-ranked = personal (0.30); chosen = None | XFAIL (known defect D-03) |
| C2-07 | school en | [en] Assignment deadline: Class, your assignment is due on … | top-ranked = school | top-ranked = school (0.53); chosen = school | PASS |
| C2-08 | school mixed | [mixed] Assignment: Class, ang assignment niyo ay due sa Mo… | top-ranked = school | top-ranked = school (0.48); chosen = school | PASS |
| C2-09 | school tl | [tl] Takdang-aralin: Klase, ang inyong takdang-aralin ay ip… | top-ranked = school | top-ranked = school (0.34); chosen = None | PASS |
| C2-10 | job_search en | [en] Interview invitation: Thank you for applying for the D… | top-ranked = job_search | top-ranked = job_search (0.57); chosen = job_search | PASS |
| C2-11 | job_search mixed | [mixed] Interview invite: Salamat sa pag-apply sa Data Anal… | top-ranked = job_search | top-ranked = job_search (0.57); chosen = job_search | PASS |
| C2-12 | job_search tl | [tl] Paanyaya sa panayam: Salamat sa inyong aplikasyon bila… | top-ranked = job_search | top-ranked = school (0.24); chosen = None | XFAIL (known defect D-03) |
| C2-13 | finance_billing en | [en] Invoice due: Your invoice of PHP 2,500 is due on Novem… | top-ranked = finance_billing | top-ranked = finance_billing (0.41); chosen = finance_billi… | PASS |
| C2-14 | finance_billing mixed | [mixed] Invoice due: Due na ang invoice mo na PHP 2,500 sa … | top-ranked = finance_billing | top-ranked = finance_billing (0.38); chosen = finance_billi… | PASS |
| C2-15 | finance_billing tl | [tl] Bayarin: Ang inyong bayarin na PHP 2,500 ay dapat baya… | top-ranked = finance_billing | top-ranked = finance_billing (0.29); chosen = None | PASS |
| C2-16 | promotions en | [en] Big sale: Flash sale! Get 50% off on all shoes this we… | top-ranked = promotions | top-ranked = promotions (0.43); chosen = promotions | PASS |
| C2-17 | promotions mixed | [mixed] Big sale: Flash sale! 50% off sa lahat ng shoes thi… | top-ranked = promotions | top-ranked = promotions (0.43); chosen = promotions | PASS |
| C2-18 | promotions tl | [tl] Malaking diskwento: Malaking diskwento! 50% bawas sa l… | top-ranked = promotions | top-ranked = personal (0.28); chosen = None | XFAIL (known defect D-03) |
| C2-19 | alerts en | [en] Security alert: We detected a new sign-in to your acco… | top-ranked = alerts | top-ranked = alerts (0.56); chosen = alerts | PASS |
| C2-20 | alerts mixed | [mixed] Security alert: May bagong sign-in sa account mo mu… | top-ranked = alerts | top-ranked = alerts (0.47); chosen = alerts | PASS |
| C2-21 | alerts tl | [tl] Babala sa seguridad: May bagong pag-login sa iyong acc… | top-ranked = alerts | top-ranked = alerts (0.30); chosen = None | PASS |
| C2-22 | personal en | [en] Family dinner: Hi anak, we are having a family dinner … | top-ranked = personal | top-ranked = personal (0.42); chosen = personal | PASS |
| C2-23 | personal mixed | [mixed] Family dinner: Hi anak, may family dinner tayo sa S… | top-ranked = personal | top-ranked = personal (0.42); chosen = personal | PASS |
| C2-24 | personal tl | [tl] Hapunan ng pamilya: Anak, may salu-salo ang pamilya sa… | top-ranked = personal | top-ranked = personal (0.32); chosen = None | PASS |
| C2-25 | test_threshold_boundary_is_inclusive | top similarity 0.35, threshold 0.35 | chosen = a | chosen = a | PASS |
| C2-26 | test_below_threshold_is_uncategorized | top similarity 0.3499, threshold 0.35 | uncategorized (None) | chosen = None | PASS |
| C2-27 | test_ranking_ties_are_deterministic | two identical centroids b, a | order a, b (id tie-break) | ["a", "b"] | PASS |
| C2-28 | empty email | empty subject and body | 200, 8 ranked categories, 384-d embedding | {"status": 200, "language": "unknown", "ranked": 8, "embedd… | PASS |
| C2-29 | very long body | very long body (~70k chars) | 200, 8 ranked categories, 384-d embedding | {"status": 200, "language": "en", "ranked": 8, "embedding_d… | PASS |
| C2-30 | HTML-only body | HTML-only body | 200, 8 ranked categories, 384-d embedding | {"status": 200, "language": "unknown", "ranked": 8, "embedd… | PASS |
| C2-31 | unknown language | unsupported language | 200, 8 ranked categories, 384-d embedding | {"status": 200, "language": "unknown", "ranked": 8, "embedd… | PASS |
| C2-32 | test_body_over_the_size_limit_is_rejected | body of 50,001 characters | 422 | 422 | PASS |

Sources: `fastapi_core/tests/component/test_c02_classifier.py`

## C3. Date normalizer and resolver

| ID | Case | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| C3-01 | bukas | 'bukas' received 2026-11-16T09:00:00+08:00 | {"resolved": "2026-11-17", "ambiguous": false} | {"resolved": "2026-11-17", "ambiguous": false} | PASS |
| C3-02 | mamaya | 'mamaya' received 2026-11-16T09:00:00+08:00 | {"resolved": "2026-11-16", "ambiguous": false} | {"resolved": "2026-11-16", "ambiguous": false} | PASS |
| C3-03 | ngayon | 'ngayon' received 2026-11-16T09:00:00+08:00 | {"resolved": "2026-11-16", "ambiguous": false} | {"resolved": "2026-11-16", "ambiguous": false} | PASS |
| C3-04 | Lunes | 'Lunes' received 2026-11-16T09:00:00+08:00 | {"resolved": "2026-11-23", "ambiguous": false} | {"resolved": "2026-11-23", "ambiguous": false} | PASS |
| C3-05 | Martes | 'Martes' received 2026-11-16T09:00:00+08:00 | {"resolved": "2026-11-17", "ambiguous": false} | {"resolved": "2026-11-17", "ambiguous": false} | PASS |
| C3-06 | Miyerkules | 'Miyerkules' received 2026-11-16T09:00:00+08:00 | {"resolved": "2026-11-18", "ambiguous": false} | {"resolved": "2026-11-18", "ambiguous": false} | PASS |
| C3-07 | Huwebes | 'Huwebes' received 2026-11-16T09:00:00+08:00 | {"resolved": "2026-11-19", "ambiguous": false} | {"resolved": "2026-11-19", "ambiguous": false} | PASS |
| C3-08 | Biyernes | 'Biyernes' received 2026-11-16T09:00:00+08:00 | {"resolved": "2026-11-20", "ambiguous": false} | {"resolved": "2026-11-20", "ambiguous": false} | PASS |
| C3-09 | Sabado | 'Sabado' received 2026-11-16T09:00:00+08:00 | {"resolved": "2026-11-21", "ambiguous": false} | {"resolved": "2026-11-21", "ambiguous": false} | PASS |
| C3-10 | Linggo | 'Linggo' received 2026-11-16T09:00:00+08:00 | {"resolved": "2026-11-22", "ambiguous": false} | {"resolved": "2026-11-22", "ambiguous": false} | PASS |
| C3-11 | alas-dos ng hapon | 'alas-dos ng hapon' received 2026-11-16T09:00:00+08:00 | {"resolved": "2026-11-16T14:00:00+08:00", "ambiguous": fals… | {"resolved": "2026-11-16T14:00:00+08:00", "ambiguous": fals… | PASS |
| C3-12 | bukas ng alas-dos ng hapon | 'bukas ng alas-dos ng hapon' received 2026-11-16T09:00:00+0… | {"resolved": "2026-11-17T14:00:00+08:00", "ambiguous": fals… | {"resolved": "2026-11-17T14:00:00+08:00", "ambiguous": fals… | PASS |
| C3-13 | Disyembre 5 | 'Disyembre 5' received 2026-11-16T09:00:00+08:00 | {"resolved": "2026-12-05", "ambiguous": false} | {"resolved": "2026-12-05", "ambiguous": false} | PASS |
| C3-14 | next Wednesday | 'next Wednesday' received 2026-11-16T09:00:00+08:00 | {"resolved": "2026-11-25", "ambiguous": false} | {"resolved": "2026-11-25", "ambiguous": false} | PASS |
| C3-15 | sometime next week | 'sometime next week' received 2026-11-16T09:00:00+08:00 | {"resolved": null, "ambiguous": true} | {"resolved": null, "ambiguous": true} | PASS |
| C3-16 | sa susunod na linggo | 'sa susunod na linggo' received 2026-11-16T09:00:00+08:00 | {"resolved": null, "ambiguous": true} | {"resolved": null, "ambiguous": true} | PASS |
| C3-17 | bukas (month rollover, received Nov 30) | 'bukas' received 2026-11-30T10:00:00+08:00 | {"resolved": "2026-12-01", "ambiguous": false} | {"resolved": "2026-12-01", "ambiguous": false} | PASS |
| C3-18 | bukas (year rollover, received Dec 31) | 'bukas' received 2026-12-31T10:00:00+08:00 | {"resolved": "2027-01-01", "ambiguous": false} | {"resolved": "2027-01-01", "ambiguous": false} | PASS |
| C3-19 | Enero 3 (received Dec 20, next year) | 'Enero 3' received 2026-12-20T10:00:00+08:00 | {"resolved": "2027-01-03", "ambiguous": false} | {"resolved": "2027-01-03", "ambiguous": false} | PASS |
| C3-20 | bukas (received 23:59) | 'bukas' received 2026-11-16T23:59:00+08:00 | {"resolved": "2026-11-17", "ambiguous": false} | {"resolved": "2026-11-17", "ambiguous": false} | PASS |
| C3-21 | ngayon (received 00:01) | 'ngayon' received 2026-11-17T00:01:00+08:00 | {"resolved": "2026-11-17", "ambiguous": false} | {"resolved": "2026-11-17", "ambiguous": false} | PASS |
| C3-22 | test_manila_offset_is_fixed_all_year | UTC offset of Asia/Manila in every month of 2026 | {8.0} (no DST) | [8.0] | PASS |
| C3-23 | test_ambiguous_date_never_counts_as_conflict | 'sometime next week' with a two-week busy block | no conflict | false | PASS |
| C3-24 | test_ambiguous_date_never_raises_urgency | deadline proximity of 'sometime next week' | 0.0 | 0.0 | PASS |
| C3-25 | test_utc_received_at_resolves_in_manila_time | 'bukas' received 2026-11-16T16:30Z (00:30 in Manila) | ["2026-11-18"] | ["2026-11-18"] | PASS |

Sources: `fastapi_core/tests/component/test_c03_dates.py`

## C4. Bi-LSTM-CRF tagger

| ID | Case | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| C4-01 | Please send the report tomorro | Please send the report tomorrow. | [["TASK", "send the report"], ["DATE", "tomorrow"]] | [["TASK", "send the report"], ["DATE", "tomorrow"]] | PASS |
| C4-02 | Paki-send ang slides bukas ng | Paki-send ang slides bukas ng 9 AM. | [["TASK", "Paki-send ang slides"], ["DATE", "bukas ng 9 AM"… | [["TASK", "Paki-send ang slides"], ["DATE", "bukas ng 9 AM"… | PASS |
| C4-03 | Submit the form Friday | Submit the form Friday | [["TASK", "Submit the form"], ["DATE", "Friday"]] | [["TASK", "Submit the form"], ["DATE", "Friday"]] | PASS |
| C4-04 | I-submit ang ulat bago mag-Biy | I-submit ang ulat bago mag-Biyernes. | [["TASK", "I-submit ang ulat"], ["DATE", "Biyernes"]] | [["TASK", "I-submit ang ulat"], ["DATE", "Biyernes"]] | PASS |
| C4-05 | Thanks for the update, see you | Thanks for the update, see you around. | [] | [] | PASS |
| C4-06 | test_adjacent_same_label_spans_stay_separate | tags B-TASK I-TASK B-TASK I-TASK | two TASK spans | [["TASK", 0, 11], ["TASK", 12, 22]] | PASS |
| C4-07 | test_overlapping_input_spans_produce_no_overlap | TASK 'review the contract' overlapping DATE 'contract today' | decoded spans never overlap | [["TASK", "review the"], ["DATE", "contract today"]] | PASS |
| C4-08 | test_stray_inside_tag_starts_a_span | tags I-TASK I-TASK O | one TASK span 'send it' | [["TASK", 0, 7]] | PASS |
| C4-09 | test_no_span_email_yields_no_spans | Thanks for the photos from the weekend, they look great. | [] | [] | PASS |
| C4-10 | test_tagging_is_deterministic | same text tagged 3 times (tagger v6) | identical output | [["TASK", 0, 24], ["DATE", 25, 39], ["TASK", 41, 62], ["DAT… | PASS |
| C4-11 | test_dev_span_f1_matches_the_recorded_evaluation | dev split (30 emails), tagger v6 | 0.4583 | 0.4583 | PASS |
| C4-12 | test_training_is_deterministic_with_a_fixed_seed | two 2-epoch trainings on 24 train emails, seed 13 | identical weights | true | PASS |

Sources: `fastapi_core/tests/component/test_c04_tagger.py`

## C5. Priority model and guardrails

| ID | Case | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| C5-01 | VIP with task raised to P4 | {"model_level": 2, "vip": true, "task": true, "category": n… | {"level": 4, "guardrails": ["vip_floor"]} | {"level": 4, "guardrails": ["vip_floor"]} | PASS |
| C5-02 | VIP without task not raised | {"model_level": 2, "vip": true, "task": false, "category": … | {"level": 2, "guardrails": []} | {"level": 2, "guardrails": []} | PASS |
| C5-03 | promotion capped at P2 | {"model_level": 5, "vip": false, "task": true, "category": … | {"level": 2, "guardrails": ["promotion_cap"]} | {"level": 2, "guardrails": ["promotion_cap"]} | PASS |
| C5-04 | promotion cap beats VIP floor | {"model_level": 5, "vip": true, "task": true, "category": "… | {"level": 2, "guardrails": ["promotion_cap"]} | {"level": 2, "guardrails": ["promotion_cap"]} | PASS |
| C5-05 | manual override wins over VIP floor | {"model_level": 4, "vip": true, "task": true, "category": n… | {"level": 1, "guardrails": ["manual_override"]} | {"level": 1, "guardrails": ["manual_override"]} | PASS |
| C5-06 | manual override wins over promotion cap | {"model_level": 1, "vip": false, "task": true, "category": … | {"level": 5, "guardrails": ["manual_override"]} | {"level": 5, "guardrails": ["manual_override"]} | PASS |
| C5-07 | test_endpoint_vip_with_task_is_at_least_p4 | VIP sender, task 'send the budget file' | level >= 4 | 4 | PASS |
| C5-08 | test_endpoint_override_always_wins | override_priority 1..5 for a VIP director with a task | [1, 2, 3, 4, 5] | [1, 2, 3, 4, 5] | PASS |
| C5-09 | test_endpoint_promotion_capped | promotional email from a VIP with a deadline | level <= 2 | 2 | PASS |
| C5-10 | test_missing_calendar_never_lowers_learned_priority | same email with calendar None / [] / busy all Friday | None >= [] and None >= busy | {"none": 3, "empty": 3, "busy": 3} | PASS |
| C5-11 | test_missing_calendar_never_lowers_rule_priority | rule priority with calendar None vs [] | equal (missing data is not 'free') | {"none": 4, "empty": 4} | PASS |
| C5-12 | test_ambiguous_date_never_raises_urgency | 'sometime next week' vs no date | same level, proximity 0 | {"vague": [3, 0.0], "no_date": [3, 0.0]} | PASS |
| C5-13 | test_why_list_returns_top_three_distinct_factors | learned priority for a manager's task email | 3 distinct factors | ["sender role", "has a task", "email content (embedding)"] | PASS |
| C5-14 | test_why_list_is_sorted_by_strength | contributions of the why-list | descending by absolute value | [1.6671, 0.6316, 0.5428] | PASS |
| C5-15 | test_rules_fallback_when_no_model | no priority model file; VIP with task | source rules, level >= 4 | ["rules", 4] | PASS |
| C5-16 | test_vip_without_task_is_not_floored_by_endpoint | VIP sender, FYI email with no task | no vip_floor guardrail | [false, []] | PASS |

Sources: `fastapi_core/tests/component/test_c05_priority.py`

## C6. Register classifier

| ID | Case | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| C6-01 | en formal | [en] Dear Ms. Santos, kindly review the attached proposal a… | formal | formal (source rules) | PASS |
| C6-02 | en neutral | [en] Hi Ana, the meeting moved to 3 PM tomorrow. Please bri… | neutral | neutral (source rules) | PASS |
| C6-03 | en casual | [en] hey lol can u send the pics later?? thx 😂 | casual | casual (source rules) | PASS |
| C6-04 | mixed formal | [mixed] Good morning po, Ma'am. Kindly i-send po ang final … | formal | formal (source rules) | PASS |
| C6-05 | mixed neutral | [mixed] Team, na-move ang sprint planning sa Thursday 2 PM.… | neutral | neutral (source rules) | PASS |
| C6-06 | mixed casual | [mixed] uy pre, tara kain tayo mamaya haha 🍜 | casual | casual (source rules) | PASS |
| C6-07 | tl formal | [tl] Magandang umaga po. Mangyaring ipasa po ang inyong mga… | formal | formal (source rules) | PASS |
| C6-08 | tl neutral | [tl] Inilipat ang pulong sa Huwebes, alas-dos ng hapon. Pak… | neutral | neutral (source rules) | PASS |
| C6-09 | tl casual | [tl] uy bes musta na? kape tayo bukas haha 😄 | casual | casual (source rules) | PASS |

Sources: `fastapi_core/tests/component/test_c06_register.py`

## C7. Calendar conflict

| ID | Case | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| C7-01 | deadline inside a busy block | {"dates": ["2026-11-17T14:00:00+08:00"], "busy": [["2026-11… | true | true | PASS |
| C7-02 | deadline exactly at the start (inclusive) | {"dates": ["2026-11-17T13:00:00+08:00"], "busy": [["2026-11… | true | true | PASS |
| C7-03 | deadline exactly at the end (exclusive) | {"dates": ["2026-11-17T15:00:00+08:00"], "busy": [["2026-11… | false | false | PASS |
| C7-04 | deadline one minute before the start | {"dates": ["2026-11-17T12:59:00+08:00"], "busy": [["2026-11… | false | false | PASS |
| C7-05 | multi-day busy block covers day 2 | {"dates": ["2026-11-18T10:00:00+08:00"], "busy": [["2026-11… | true | true | PASS |
| C7-06 | busy block given in UTC, same instant | {"dates": ["2026-11-17T14:00:00+08:00"], "busy": [["2026-11… | true | true | PASS |
| C7-07 | busy block in UTC that is a different Manila hour | {"dates": ["2026-11-17T14:00:00+08:00"], "busy": [["2026-11… | false | false | PASS |
| C7-08 | calendar data missing (None) | {"dates": ["2026-11-17T14:00:00+08:00"], "busy": null} | false | false | PASS |
| C7-09 | calendar connected but empty | {"dates": ["2026-11-17T14:00:00+08:00"], "busy": []} | false | false | PASS |
| C7-10 | date-only deadline never conflicts | {"dates": ["2026-11-17"], "busy": [["2026-11-17T00:00:00+08… | false | false | PASS |
| C7-11 | ambiguous date (no value) never conflicts | {"dates": [null], "busy": [["2026-11-16T00:00:00+08:00", "2… | false | false | PASS |
| C7-12 | one of several dates conflicts | {"dates": ["2026-11-17T09:00:00+08:00", "2026-11-18T14:00:0… | true | true | PASS |
| C7-13 | test_endpoint_reports_conflict_only_with_calendar_data | deadline tomorrow 3 PM Manila; busy 06:00-08:00 UTC (14:00-… | {"with_busy": [true, true], "no_calendar": [false, false]} | {"with_busy": [true, true], "no_calendar": [false, false]} | PASS |

Sources: `fastapi_core/tests/component/test_c07_calendar.py`

## C8. Rocchio feedback (alpha 0.20, beta 0.15)

| ID | Case | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| C8-01 | test_hand_computed_update | e=[1,0], c+=[0,1], c-=[0.6,0.8], alpha 0.20, beta 0.15 | [0.196116, 0.980581, 0.490261, 0.871576] | [0.196116, 0.980581, 0.490261, 0.871576] | PASS |
| C8-02 | test_updated_centroids_are_unit_length | arbitrary 3-d vectors | [1.0, 1.0] | [1.0, 1.0] | PASS |
| C8-03 | test_correct_centroid_moves_toward_the_email | cosine(email, c+) before vs after | after > before | [0.0, 0.1961] | PASS |
| C8-04 | same category | same correct and incorrect id | FeedbackError | FeedbackError: correct and incorrect category are the same;… | PASS |
| C8-05 | zero email | zero email vector | FeedbackError | FeedbackError: email embedding is a zero vector | PASS |
| C8-06 | dimension mismatch | dimension mismatch | FeedbackError | FeedbackError: all vectors must have the same dimension | PASS |
| C8-07 | test_incorrect_centroid_never_becomes_zero | c- = 0.15e would subtract to zero | old centroid kept, unit length | [1.0, 0.0] | PASS |
| C8-08 | test_feedback_is_isolated_between_users | user A feedback, then user B feedback, then user A's identi… | user A's result unchanged (service keeps no state) | true | PASS |
| C8-09 | test_endpoint_uses_the_documented_rates | default /api/v1/feedback request | [0.2, 0.15, 0.196116] | [0.2, 0.15, 0.196116] | PASS |
| C8-10 | test_endpoint_rejects_same_category | correct and incorrect are the same category | 422 | 422 | PASS |

Sources: `fastapi_core/tests/component/test_c08_rocchio.py`

## C9. Discovery (clustering)

| ID | Case | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| C9-01 | test_three_groups_are_found | 3 groups of 4 near-identical vectors + 1 outlier | [["g0-m0", "...4"], ["g1-...4"], ["g2-...4"]] | [["g0-m0", "g0-m1", "g0-m2", "g0-m3"], ["g1-m0", "g1-m1", "… | PASS |
| C9-02 | test_response_has_ids_and_vectors_only | discover response fields | {"top": ["clusters", "noise_ids"], "cluster": ["centroid", … | {"top": ["clusters", "noise_ids"], "cluster": ["centroid", … | PASS |
| C9-03 | test_text_is_not_accepted | a vector item that also carries email text | 422 | 422 | PASS |
| C9-04 | test_clustering_is_deterministic | same vectors 3 times, then shuffled | identical clusters every time | true | PASS |
| C9-05 | test_centroids_are_unit_vectors | norm of each returned centroid | [1.0, 1.0, 1.0] | [1.0, 1.0, 1.0] | PASS |
| C9-06 | test_too_few_vectors_rejected | a single vector | 422 | 422 | PASS |

Sources: `fastapi_core/tests/component/test_c09_discover.py`

## C10. API layer

| ID | Case | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| C10-A01 | /api/v1/choose-rule no key | POST /api/v1/choose-rule without X-Internal-Key | 401 | 401 | PASS |
| C10-A02 | /api/v1/classify no key | POST /api/v1/classify without X-Internal-Key | 401 | 401 | PASS |
| C10-A03 | /api/v1/discover no key | POST /api/v1/discover without X-Internal-Key | 401 | 401 | PASS |
| C10-A04 | /api/v1/embed no key | POST /api/v1/embed without X-Internal-Key | 401 | 401 | PASS |
| C10-A05 | /api/v1/feedback no key | POST /api/v1/feedback without X-Internal-Key | 401 | 401 | PASS |
| C10-A06 | /api/v1/match no key | POST /api/v1/match without X-Internal-Key | 401 | 401 | PASS |
| C10-A07 | /api/v1/priority no key | POST /api/v1/priority without X-Internal-Key | 401 | 401 | PASS |
| C10-A08 | /api/v1/register no key | POST /api/v1/register without X-Internal-Key | 401 | 401 | PASS |
| C10-A09 | /api/v1/summarize no key | POST /api/v1/summarize without X-Internal-Key | 401 | 401 | PASS |
| C10-A10 | /api/v1/tasks no key | POST /api/v1/tasks without X-Internal-Key | 401 | 401 | PASS |
| C10-A11 | /api/v1/thread-status no key | POST /api/v1/thread-status without X-Internal-Key | 401 | 401 | PASS |
| C10-B01 | /api/v1/choose-rule wrong key | POST /api/v1/choose-rule with a wrong key | 401 | 401 | PASS |
| C10-B02 | /api/v1/classify wrong key | POST /api/v1/classify with a wrong key | 401 | 401 | PASS |
| C10-B03 | /api/v1/discover wrong key | POST /api/v1/discover with a wrong key | 401 | 401 | PASS |
| C10-B04 | /api/v1/embed wrong key | POST /api/v1/embed with a wrong key | 401 | 401 | PASS |
| C10-B05 | /api/v1/feedback wrong key | POST /api/v1/feedback with a wrong key | 401 | 401 | PASS |
| C10-B06 | /api/v1/match wrong key | POST /api/v1/match with a wrong key | 401 | 401 | PASS |
| C10-B07 | /api/v1/priority wrong key | POST /api/v1/priority with a wrong key | 401 | 401 | PASS |
| C10-B08 | /api/v1/register wrong key | POST /api/v1/register with a wrong key | 401 | 401 | PASS |
| C10-B09 | /api/v1/summarize wrong key | POST /api/v1/summarize with a wrong key | 401 | 401 | PASS |
| C10-B10 | /api/v1/tasks wrong key | POST /api/v1/tasks with a wrong key | 401 | 401 | PASS |
| C10-B11 | /api/v1/thread-status wrong key | POST /api/v1/thread-status with a wrong key | 401 | 401 | PASS |
| C10-C01 | /api/v1/choose-rule invalid body | POST /api/v1/choose-rule with a malformed body | 422 | 422 | PASS |
| C10-C02 | /api/v1/classify invalid body | POST /api/v1/classify with a malformed body | 422 | 422 | PASS |
| C10-C03 | /api/v1/discover invalid body | POST /api/v1/discover with a malformed body | 422 | 422 | PASS |
| C10-C04 | /api/v1/embed invalid body | POST /api/v1/embed with a malformed body | 422 | 422 | PASS |
| C10-C05 | /api/v1/feedback invalid body | POST /api/v1/feedback with a malformed body | 422 | 422 | PASS |
| C10-C06 | /api/v1/match invalid body | POST /api/v1/match with a malformed body | 422 | 422 | PASS |
| C10-C07 | /api/v1/priority invalid body | POST /api/v1/priority with a malformed body | 422 | 422 | PASS |
| C10-C08 | /api/v1/register invalid body | POST /api/v1/register with a malformed body | 422 | 422 | PASS |
| C10-C09 | /api/v1/summarize invalid body | POST /api/v1/summarize with a malformed body | 422 | 422 | PASS |
| C10-C10 | /api/v1/tasks invalid body | POST /api/v1/tasks with a malformed body | 422 | 422 | PASS |
| C10-C11 | /api/v1/thread-status invalid body | POST /api/v1/thread-status with a malformed body | 422 | 422 | PASS |
| C10-D01 | test_email_content_never_reaches_the_logs | 5 endpoints called with a unique marker, a name and a phone… | none of them in captured logs or stdout/stderr | none found | PASS |
| C10-D02 | test_service_has_no_database_or_token_access | search app/ for database drivers, connection URLs and OAuth… | no matches | no matches | PASS |
| C10-D03 | test_identical_requests_get_identical_answers | the same /classify request twice | identical responses (no state carried over) | true | PASS |
| C10-D04 | test_health_is_public_but_reveals_no_secrets | GET /healthz without a key | 200/503 with status only, no key or URLs | ["auth_failures", "dimension", "learned_models", "model", "… | PASS |

Sources: `fastapi_core/tests/component/test_c10_api.py`

## C11. Web app logic

| ID | Case | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| C11-01 | sorts by priority, then nearest deadline, then newest | fixture in the test source | sorts by priority, then nearest deadline, then newest | as expected | PASS |
| C11-02 | puts emails without a deadline after those with one at the same level | fixture in the test source | puts emails without a deadline after those with one at the … | as expected | PASS |
| C11-03 | accepts Date objects (API) and ISO strings (client) alike | fixture in the test source | accepts Date objects (API) and ISO strings (client) alike | as expected | PASS |
| C11-04 | 'all' keeps every email in order | fixture in the test source | 'all' keeps every email in order | as expected | PASS |
| C11-05 | 'P4+' keeps P4 and P5 only | fixture in the test source | 'P4+' keeps P4 and P5 only | as expected | PASS |
| C11-06a | a single level filter (P1) keeps that level only | fixture in the test source | a single level filter (P1) keeps that level only | as expected | PASS |
| C11-06b | a single level filter (P2) keeps that level only | fixture in the test source | a single level filter (P2) keeps that level only | as expected | PASS |
| C11-06c | a single level filter (P3) keeps that level only | fixture in the test source | a single level filter (P3) keeps that level only | as expected | PASS |
| C11-06d | a single level filter (P4) keeps that level only | fixture in the test source | a single level filter (P4) keeps that level only | as expected | PASS |
| C11-06e | a single level filter (P5) keeps that level only | fixture in the test source | a single level filter (P5) keeps that level only | as expected | PASS |
| C11-07 | chronological mode sorts newest first without mutating the input | fixture in the test source | chronological mode sorts newest first without mutating the … | as expected | PASS |
| C11-08 | counts total and unread per level | fixture in the test source | counts total and unread per level | as expected | PASS |
| C11-09 | an empty inbox filters and counts to nothing | fixture in the test source | an empty inbox filters and counts to nothing | as expected | PASS |
| C11-10 | starts idle with the buttons shown | fixture in the test source | starts idle with the buttons shown | as expected | PASS |
| C11-11 | idle -> saving shows the rating optimistically and hides the buttons | fixture in the test source | idle -> saving shows the rating optimistically and hides th… | as expected | PASS |
| C11-12 | saving -> saved on success | fixture in the test source | saving -> saved on success | as expected | PASS |
| C11-13 | saving -> error on failure brings the buttons back | fixture in the test source | saving -> error on failure brings the buttons back | as expected | PASS |
| C11-14 | offline: nothing is sent and the buttons stay usable | fixture in the test source | offline: nothing is sent and the buttons stay usable | as expected | PASS |
| C11-15 | retry after error or offline goes back to saving | fixture in the test source | retry after error or offline goes back to saving | as expected | PASS |
| C11-16 | double clicks while saving or after saving are ignored | fixture in the test source | double clicks while saving or after saving are ignored | as expected | PASS |
| C11-17 | stray success or error outside saving changes nothing | fixture in the test source | stray success or error outside saving changes nothing | as expected | PASS |
| C11-18a | maps P5 to text and label | fixture in the test source | maps P5 to text and label | as expected | PASS |
| C11-18b | maps P4 to text and label | fixture in the test source | maps P4 to text and label | as expected | PASS |
| C11-18c | maps P3 to text and label | fixture in the test source | maps P3 to text and label | as expected | PASS |
| C11-18d | maps P2 to text and label | fixture in the test source | maps P2 to text and label | as expected | PASS |
| C11-18e | maps P1 to text and label | fixture in the test source | maps P1 to text and label | as expected | PASS |
| C11-19 | marks a manual override and a VIP pin in text, not colour only | fixture in the test source | marks a manual override and a VIP pin in text, not colour o… | as expected | PASS |
| C11-20 | never renders blank: missing level and pending states have text | fixture in the test source | never renders blank: missing level and pending states have … | as expected | PASS |
| C11-21 | shows the learned weights, label offset and guardrail when present | fixture in the test source | shows the learned weights, label offset and guardrail when … | as expected | PASS |
| C11-22 | rule-only breakdown keeps the original wording | fixture in the test source | rule-only breakdown keeps the original wording | as expected | PASS |
| C11-23 | deadline state: confirmed or clear deadline validates, ambiguous need… | fixture in the test source | deadline state: confirmed or clear deadline validates, ambi… | as expected | PASS |
| C11-AUD01 | drops keys that could carry secrets, IPs or email content | fixture in the test source | drops keys that could carry secrets, IPs or email content | as expected | PASS |
| C11-AUD02 | keeps ids, enums, counts and flags | fixture in the test source | keeps ids, enums, counts and flags | as expected | PASS |
| C11-AUD03 | drops long strings that may be free text | fixture in the test source | drops long strings that may be free text | as expected | PASS |
| C11-AUD04 | returns undefined for missing or fully-dropped metadata | fixture in the test source | returns undefined for missing or fully-dropped metadata | as expected | PASS |
| C11-AUD05 | writes the sanitized event | fixture in the test source | writes the sanitized event | as expected | PASS |
| C11-AUD06 | omits metadata when nothing survives sanitizing | fixture in the test source | omits metadata when nothing survives sanitizing | as expected | PASS |
| C11-AUD07 | swallows database errors so callers never break | fixture in the test source | swallows database errors so callers never break | as expected | PASS |
| C11-CON01 | is open when CategorAIze is turned off | fixture in the test source | is open when CategorAIze is turned off | as expected | PASS |
| C11-CON02 | accepts a current, non-withdrawn row | fixture in the test source | accepts a current, non-withdrawn row | as expected | PASS |
| C11-CON03 | rejects a user with no rows | fixture in the test source | rejects a user with no rows | as expected | PASS |
| C11-CON04 | does not count a withdrawn row | fixture in the test source | does not count a withdrawn row | as expected | PASS |
| C11-CON05 | does not count rows for an older Terms or Privacy version | fixture in the test source | does not count rows for an older Terms or Privacy version | as expected | PASS |
| C11-CON06 | does not count another user's consent | fixture in the test source | does not count another user's consent | as expected | PASS |
| C11-CON07 | queries with the current versions and withdrawnAt null | fixture in the test source | queries with the current versions and withdrawnAt null | as expected | PASS |
| C11-CON08 | limits email accounts to users with a current consent from the owner-… | fixture in the test source | limits email accounts to users with a current consent from … | as expected | PASS |
| C11-ENC01 | stores ciphertext, not the text | fixture in the test source | stores ciphertext, not the text | as expected | PASS |
| C11-ENC02 | uses a fresh IV: the same text encrypts differently | fixture in the test source | uses a fresh IV: the same text encrypts differently | as expected | PASS |
| C11-ENC03 | detects tampering with the ciphertext | fixture in the test source | detects tampering with the ciphertext | as expected | PASS |
| C11-ENC04 | rejects a value moved to another row or column | fixture in the test source | rejects a value moved to another row or column | as expected | PASS |
| C11-ENC05 | fails with the wrong key | fixture in the test source | fails with the wrong key | as expected | PASS |
| C11-ENC06 | fails closed without a key and on plaintext | fixture in the test source | fails closed without a key and on plaintext | as expected | PASS |
| C11-ENC07 | rotates: old values still decrypt with the previous key, new ones use… | fixture in the test source | rotates: old values still decrypt with the previous key, ne… | as expected | PASS |
| C11-ENC08 | rejects short keys | fixture in the test source | rejects short keys | as expected | PASS |
| C11-ENC09 | makes cuid-shaped row ids | fixture in the test source | makes cuid-shaped row ids | as expected | PASS |
| C11-ENC10 | stays well under 15 ms per record (5 fields, 5 KB body) | fixture in the test source | stays well under 15 ms per record (5 fields, 5 KB body) | as expected | PASS |
| C11-OPT01 | uses the service when the feature switch is on | fixture in the test source | uses the service when the feature switch is on | as expected | PASS |
| C11-OPT02 | restores the original LLM path when the switch is off | fixture in the test source | restores the original LLM path when the switch is off | as expected | PASS |
| C11-OPT03 | restores the original LLM path when CategorAIze is disabled | fixture in the test source | restores the original LLM path when CategorAIze is disabled | as expected | PASS |
| C11-OPT04 | falls back to the LLM on a service failure only with consent | fixture in the test source | falls back to the LLM on a service failure only with consent | as expected | PASS |
| C11-OPT05 | does not send mail to the external LLM without consent | fixture in the test source | does not send mail to the external LLM without consent | as expected | PASS |
| C11-OPT06 | cascade: a confident local answer never reaches the LLM | fixture in the test source | cascade: a confident local answer never reaches the LLM | as expected | PASS |
| C11-OPT07 | cascade: an unsure answer goes to the LLM only with consent | fixture in the test source | cascade: an unsure answer goes to the LLM only with consent | as expected | PASS |
| C11-OPT08 | cascade: keeps the local answer when the LLM fails | fixture in the test source | cascade: keeps the local answer when the LLM fails | as expected | PASS |
| C11-OPT09 | does not hide bugs: non-service errors are rethrown | fixture in the test source | does not hide bugs: non-service errors are rethrown | as expected | PASS |
| C11-PII01 | has vectors | fixture in the test source | has vectors | as expected | PASS |
| C11-PII02 | mobile with dashes | fixture in the test source | mobile with dashes | as expected | PASS |
| C11-PII03 | mobile plain | fixture in the test source | mobile plain | as expected | PASS |
| C11-PII04 | mobile with spaces and dots | fixture in the test source | mobile with spaces and dots | as expected | PASS |
| C11-PII05 | mobile with +63 | fixture in the test source | mobile with +63 | as expected | PASS |
| C11-PII06 | mobile with +63 and spaces | fixture in the test source | mobile with +63 and spaces | as expected | PASS |
| C11-PII07 | mobile with 63 prefix | fixture in the test source | mobile with 63 prefix | as expected | PASS |
| C11-PII08 | Visa test card with spaces | fixture in the test source | Visa test card with spaces | as expected | PASS |
| C11-PII09 | Mastercard test card with dashes | fixture in the test source | Mastercard test card with dashes | as expected | PASS |
| C11-PII10 | card digits run together | fixture in the test source | card digits run together | as expected | PASS |
| C11-PII11 | Amex test card 4-6-5 | fixture in the test source | Amex test card 4-6-5 | as expected | PASS |
| C11-PII12 | SSS number | fixture in the test source | SSS number | as expected | PASS |
| C11-PII13 | PhilHealth number | fixture in the test source | PhilHealth number | as expected | PASS |
| C11-PII14 | TIN | fixture in the test source | TIN | as expected | PASS |
| C11-PII15 | TIN with branch code | fixture in the test source | TIN with branch code | as expected | PASS |
| C11-PII16 | Taglish request keeps the task and the deadline | fixture in the test source | Taglish request keeps the task and the deadline | as expected | PASS |
| C11-PII17 | several kinds at once | fixture in the test source | several kinds at once | as expected | PASS |
| C11-PII18 | NOT masked: ISO date | fixture in the test source | NOT masked: ISO date | as expected | PASS |
| C11-PII19 | NOT masked: two dates in a row | fixture in the test source | NOT masked: two dates in a row | as expected | PASS |
| C11-PII20 | NOT masked: amount with separators | fixture in the test source | NOT masked: amount with separators | as expected | PASS |
| C11-PII21 | NOT masked: order and tracking numbers | fixture in the test source | NOT masked: order and tracking numbers | as expected | PASS |
| C11-PII22 | NOT masked: 16 digits that fail the Luhn check | fixture in the test source | NOT masked: 16 digits that fail the Luhn check | as expected | PASS |
| C11-PII23 | NOT masked: landline-length and short numbers | fixture in the test source | NOT masked: landline-length and short numbers | as expected | PASS |
| C11-PII24 | NOT masked: digits inside a longer number | fixture in the test source | NOT masked: digits inside a longer number | as expected | PASS |
| C11-PII25 | already masked text is unchanged | fixture in the test source | already masked text is unchanged | as expected | PASS |
| C11-PII26 | accepts test cards and rejects near misses | fixture in the test source | accepts test cards and rejects near misses | as expected | PASS |
| C11-PII27 | masks strings inside LLM messages and counts them | fixture in the test source | masks strings inside LLM messages and counts them | as expected | PASS |
| C11-PII28 | returns the same object when nothing was masked | fixture in the test source | returns the same object when nothing was masked | as expected | PASS |

Sources: `apps/web/components/CategoraizePriority.test.tsx`, `apps/web/utils/categoraize/audit.test.ts`, `apps/web/utils/categoraize/consent.test.ts`, `apps/web/utils/categoraize/features.test.ts`, `apps/web/utils/categoraize/field-encryption.test.ts`, `apps/web/utils/categoraize/pii.test.ts`, `apps/web/utils/categoraize/rating-state.test.ts`, `apps/web/utils/categoraize/triage-order.test.ts`

## C12. IAS: RLS, export/erasure, backup/restore

| ID | Case | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| C12-10 | covers every CategorAIze table in the schema (complete) | fixture in the test source | covers every CategorAIze table in the schema (complete) | as expected | PASS |
| C12-11 | is idempotent: two exports return the same data and write nothing | fixture in the test source | is idempotent: two exports return the same data and write n… | as expected | PASS |
| C12-12 | leaves vectors and email excerpts out of the learning and deadline ro… | fixture in the test source | leaves vectors and email excerpts out of the learning and d… | as expected | PASS |
| C12-13 | only reads the user's own accounts | fixture in the test source | only reads the user's own accounts | as expected | PASS |
| C12-14 | leaves email bodies out of classifications | fixture in the test source | leaves email bodies out of classifications | as expected | PASS |
| C12-15 | never selects tokens from the account rows | fixture in the test source | never selects tokens from the account rows | as expected | PASS |
| C12-20 | setup: B has rows in all 13 CategorAIze tables (empty: none) | rolled-back transaction on the local database | PASS | setup: B has rows in all 13 CategorAIze tables (empty: none) | PASS |
| C12-21 | complete: every CategorAIze table is empty for B after erasure (0 row… | rolled-back transaction on the local database | PASS | complete: every CategorAIze table is empty for B after eras… | PASS |
| C12-22 | complete: B's user, account and email account rows are gone | rolled-back transaction on the local database | PASS | complete: B's user, account and email account rows are gone | PASS |
| C12-23 | idempotent: a second erasure deletes 0 rows without error | rolled-back transaction on the local database | PASS | idempotent: a second erasure deletes 0 rows without error | PASS |
| C12-24 | isolation: tenant A's rows are untouched (45 classifications) | rolled-back transaction on the local database | PASS | isolation: tenant A's rows are untouched (45 classification… | PASS |
| C12-25 | audit trail outlives the account (ids only, no FK) | rolled-back transaction on the local database | PASS | audit trail outlives the account (ids only, no FK) | PASS |
| C12-31 | restored row counts match the manifest | rolled-back transaction on the local database | PASS | restored row counts match the manifest | PASS |
| C12-32 | email content and secret columns are empty in the backup | rolled-back transaction on the local database | PASS | email content and secret columns are empty in the backup | PASS |
| C12-33 | audit log stays append-only after restore | rolled-back transaction on the local database | PASS | audit log stays append-only after restore | PASS |
| C12-34 | a tampered backup is refused (checksum and age) | rolled-back transaction on the local database | PASS | a tampered backup is refused (checksum and age) | PASS |
| C12-DEL01 | does not delete a user when their email accounts own an organization … | fixture in the test source | does not delete a user when their email accounts own an org… | as expected | PASS |
| C12-DEL02 | keeps Tinybird data when deleting the user fails | fixture in the test source | keeps Tinybird data when deleting the user fails | as expected | PASS |
| C12-DEL03 | deletes solo organizations and memberships before deleting the user, … | fixture in the test source | deletes solo organizations and memberships before deleting … | as expected | PASS |
| C12-DEL04 | removes the marketing contact by email address | fixture in the test source | removes the marketing contact by email address | as expected | PASS |
| C12-DEL05 | releases every mailbox's recordings before deleting the user | fixture in the test source | releases every mailbox's recordings before deleting the user | as expected | PASS |
| C12-DEL06 | keeps the user when a meeting bot cannot be released | fixture in the test source | keeps the user when a meeting bot cannot be released | as expected | PASS |
| C12-DEL07 | deletes ownerless solo organizations before deleting the user | fixture in the test source | deletes ownerless solo organizations before deleting the us… | as expected | PASS |
| C12-DEL08 | surfaces the ownership transfer message when the database rejects a r… | fixture in the test source | surfaces the ownership transfer message when the database r… | as expected | PASS |
| C12-DEL09 | surfaces the ownership transfer message when membership blocks raced … | fixture in the test source | surfaces the ownership transfer message when membership blo… | as expected | PASS |
| C12-REV01 | revokes every Google grant with its refresh token and skips Microsoft | fixture in the test source | revokes every Google grant with its refresh token and skips… | as expected | PASS |
| C12-REV02 | counts an already-revoked token (HTTP 400) as revoked | fixture in the test source | counts an already-revoked token (HTTP 400) as revoked | as expected | PASS |
| C12-REV03 | never throws: network errors and 5xx are counted as failures | fixture in the test source | never throws: network errors and 5xx are counted as failures | as expected | PASS |
| C12-REV04 | never throws when the token lookup fails, so deletion goes ahead | fixture in the test source | never throws when the token lookup fails, so deletion goes … | as expected | PASS |
| C12-REV05 | skips grants with no token | fixture in the test source | skips grants with no token | as expected | PASS |
| C12-RLS01 | no context: classifications hidden (0) | rolled-back transaction on the local database | PASS | no context: classifications hidden (0) | PASS |
| C12-RLS02 | no context: consents hidden (0) | rolled-back transaction on the local database | PASS | no context: consents hidden (0) | PASS |
| C12-RLS03 | no context: contacts hidden (0) | rolled-back transaction on the local database | PASS | no context: contacts hidden (0) | PASS |
| C12-RLS04 | tenant A: own classifications visible (45) | rolled-back transaction on the local database | PASS | tenant A: own classifications visible (45) | PASS |
| C12-RLS05 | tenant A: cross-tenant read of B's contact returns nothing | rolled-back transaction on the local database | PASS | tenant A: cross-tenant read of B's contact returns nothing | PASS |
| C12-RLS06 | tenant A: cross-tenant read of B's consent returns nothing | rolled-back transaction on the local database | PASS | tenant A: cross-tenant read of B's consent returns nothing | PASS |
| C12-RLS07 | tenant A: insert with B's emailAccountId rejected by the policy (erro… | rolled-back transaction on the local database | PASS | tenant A: insert with B's emailAccountId rejected by the po… | PASS |
| C12-RLS08 | tenant A: update of B's contact touches 0 rows | rolled-back transaction on the local database | PASS | tenant A: update of B's contact touches 0 rows | PASS |
| C12-RLS09 | tenant A: delete of B's contact touches 0 rows | rolled-back transaction on the local database | PASS | tenant A: delete of B's contact touches 0 rows | PASS |
| C12-RLS10 | tenant B: sees exactly its own contact (1) | rolled-back transaction on the local database | PASS | tenant B: sees exactly its own contact (1) | PASS |
| C12-RLS11 | tenant B: none of A's classifications (0) | rolled-back transaction on the local database | PASS | tenant B: none of A's classifications (0) | PASS |
| C12-RLS12 | empty context: contacts hidden (0) | rolled-back transaction on the local database | PASS | empty context: contacts hidden (0) | PASS |
| C12-RLS13 | tenant B: none of A's audit events (0) | rolled-back transaction on the local database | PASS | tenant B: none of A's audit events (0) | PASS |
| C12-RLS14 | runtime role cannot disable row-level security (error above is expect… | rolled-back transaction on the local database | PASS | runtime role cannot disable row-level security (error above… | PASS |

Sources: `apps/web/utils/categoraize/data-export.test.ts`, `apps/web/utils/categoraize/revoke-tokens.test.ts`, `apps/web/utils/user/delete.test.ts`, `scripts/db/test-erasure.sql`, `scripts/db/test-restore.sql`, `scripts/db/test-rls.sql`
