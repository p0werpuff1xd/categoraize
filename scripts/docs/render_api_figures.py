"""Render Figures 16 and 19 as HTML (screenshotted to PNG by html2png)."""
from __future__ import annotations

import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "docs/system-documentation/appendix"
FIG = ROOT / "docs/system-documentation/figures"
STYLE = """<style>
body{margin:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#1f1f1e}
.card{display:inline-block;padding:18px 22px;border:1px solid #e6e5e0;border-radius:8px;margin:12px}
h1{font-size:15px;margin:0 0 10px}
pre{font:12.5px/1.45 Consolas,'Courier New',monospace;margin:0;white-space:pre-wrap;max-width:880px}
table{border-collapse:collapse;font-size:12.5px;max-width:1150px}
th,td{border:1px solid #e6e5e0;padding:7px 9px;vertical-align:top;text-align:left}
th{background:#f5f5f2}
.k{color:#5f5e58}.tag{display:inline-block;border-radius:4px;padding:1px 6px;margin:1px;font-size:11.5px}
.TASK{background:#e3ecfb;color:#1c4f95}.DATE{background:#fdebd9;color:#8a3d12}
.none{color:#8a3d12;font-weight:bold}
</style>"""

resp = json.loads((APP / "b3-classify-response.json").read_text(encoding="utf-8"))
shown = {k: resp[k] for k in ("email_id", "language", "category", "ranked", "threshold", "spans", "priority",
                              "learned_priority", "sender_register", "pii_masked", "embedding", "timings_ms") if k in resp}
shown["ranked"] = shown["ranked"][:3] + [f"... {len(resp['ranked']) - 3} more categories"]
(FIG / "fig19-api-response.html").write_text(
    f"<html><head><meta charset='utf-8'>{STYLE}</head><body><div class='card' id='fig'>"
    f"<h1>POST /api/v1/classify &nbsp;→&nbsp; HTTP 200 (production NLP service, synthetic Taglish email)</h1>"
    f"<pre>{html.escape(json.dumps(shown, indent=2, ensure_ascii=False))}</pre></div></body></html>", encoding="utf-8")

rows = json.loads((APP / "fig16-multilingual-examples.json").read_text(encoding="utf-8"))
label = {"en": "English", "mixed": "Taglish", "tl": "Filipino"}
trs = []
for r in rows:
    spans = "".join(f"<span class='tag {l}'>{l}: {html.escape(t)}</span>" for l, t in r["spans"])
    cat = r["category"] or "<span class='none'>uncategorized (below τ = 0.35)</span>"
    top = "<br>".join(f"{c} {s:.3f}" for c, s in r["top3"])
    trs.append(f"<tr><td><b>{label[r['language_sent']]}</b><br><span class='k'>detected: {r['language_detected']}</span></td>"
               f"<td><b>{html.escape(r['subject'])}</b><br>{html.escape(r['body'])}</td><td>{cat}</td><td>{top}</td>"
               f"<td>P{r['priority']}</td><td>{spans}</td><td>{r['register']}</td></tr>")
(FIG / "fig16-multilingual-examples.html").write_text(
    f"<html><head><meta charset='utf-8'>{STYLE}</head><body><div class='card' id='fig'>"
    "<h1>Multilingual categorization on the production NLP service (new-user setting: category descriptions only)</h1>"
    "<table><tr><th>Language</th><th>Synthetic email</th><th>Category</th><th>Top 3 similarity</th><th>Priority</th>"
    f"<th>Extracted spans</th><th>Register</th></tr>{''.join(trs)}</table></div></body></html>", encoding="utf-8")
print("wrote fig16 and fig19 html")
