"""Figure 16: the deployed NLP service on three synthetic emails, one per language.

New-user setting: categories are sent with their descriptions only (no learned
centroid), exactly as the web app does before any feedback. Output is recorded
as returned; nothing is edited.
Usage: SYSTEM_NLP_KEY=... python scripts/docs/multilingual_examples.py
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
URL = os.environ.get("SYSTEM_NLP_URL", "https://categoraize-nlp-35rdktlybq-as.a.run.app").rstrip("/")
categories = json.loads((ROOT / "fastapi_core/data/categoraize-dataset/data/categories.json").read_text(encoding="utf-8"))
cats = [{"id": c["slug"], "name": c["name"], "description": c["description"], "base_priority": 3} for c in categories]
EMAILS = [
    ("en", "Electricity bill due", "Your electricity bill of PHP 3,240.50 for November is due on November 28. Please pay on or before the due date to avoid disconnection."),
    ("mixed", "Interview invite", "Hi! Salamat sa pag-apply sa Junior Data Analyst position. Gusto ka naming i-invite sa interview sa Thursday 2 PM via Google Meet. Paki-confirm kung available ka."),
    ("tl", "Takdang-aralin sa Filipino", "Magandang araw, klase. Ipasa ang inyong sanaysay tungkol sa wika sa darating na Lunes bago mag-alas-singko ng hapon. Gng. Santos"),
]
rows = []
for lang, subject, body in EMAILS:
    r = httpx.post(f"{URL}/api/v1/classify", headers={"X-Internal-Key": os.environ["SYSTEM_NLP_KEY"]}, timeout=60, json={
        "email_id": f"sample-{lang}", "subject": subject, "body": body,
        "received_at": "2026-11-16T09:00:00+08:00", "now": "2026-11-16T09:00:00+08:00", "timezone": "Asia/Manila",
        "sender": {"email": "sender@example.invalid", "role": None, "is_vip": False}, "categories": cats, "threshold": 0.35})
    r.raise_for_status()
    d = r.json()
    rows.append({
        "language_sent": lang, "subject": subject, "body": body,
        "language_detected": d["language"],
        "category": (d["category"] or {}).get("id"),
        "top3": [(x["id"], round(x["similarity"], 3)) for x in d["ranked"][:3]],
        "priority": d["priority"]["level"],
        "spans": [(s["label"], s["text"]) for s in d["spans"]],
        "register": (d.get("sender_register") or {}).get("value"),
    })
out = ROOT / "docs/system-documentation/appendix/fig16-multilingual-examples.json"
out.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
for row in rows:
    print(row["language_sent"], row["language_detected"], row["category"], row["top3"], "P", row["priority"], row["spans"], row["register"])
