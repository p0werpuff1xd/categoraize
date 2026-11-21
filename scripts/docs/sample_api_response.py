"""Figure 19 / Appendix B.3: a real /api/v1/classify response for a synthetic Taglish email.

Calls the NLP service at SYSTEM_NLP_URL (default: production) with the key in
SYSTEM_NLP_KEY. The email and sender are made up; no real mail is used. The
384-number embedding is shortened to its first 5 values for the document.

Usage: SYSTEM_NLP_KEY=... python scripts/docs/sample_api_response.py
Writes docs/system-documentation/appendix/b3-classify-request.json and -response.json.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "system-documentation" / "appendix"
URL = os.environ.get("SYSTEM_NLP_URL", "https://categoraize-nlp-35rdktlybq-as.a.run.app").rstrip("/")

categories = json.loads((ROOT / "fastapi_core/data/categoraize-dataset/data/categories.json").read_text(encoding="utf-8"))
request = {
    "email_id": "sample-taglish-001",
    "subject": "Paki-review ng Q4 report",
    "body": ("Hi Ana, paki-review naman ng Q4 sales report bago mag-Friday 5 PM. "
             "Kailangan ko na siya para sa client meeting sa Monday. Salamat!\n\nMarco"),
    "received_at": "2026-11-16T09:00:00+08:00",
    "timezone": "Asia/Manila",
    "now": "2026-11-16T09:00:00+08:00",
    "sender": {"email": "marco@example.invalid", "role": "Manager", "is_vip": False},
    "categories": [{"id": c["slug"], "name": c["name"], "description": c["description"], "base_priority": 3}
                   for c in categories],
    "threshold": 0.35,
    "calendar_busy": [{"start": "2026-11-20T16:00:00+08:00", "end": "2026-11-20T18:00:00+08:00"}],
}

started = time.perf_counter()
response = httpx.post(f"{URL}/api/v1/classify", json=request,
                      headers={"X-Internal-Key": os.environ["SYSTEM_NLP_KEY"]}, timeout=60)
elapsed = (time.perf_counter() - started) * 1000
response.raise_for_status()
body = response.json()
body["embedding"] = [round(x, 4) for x in body["embedding"][:5]] + [f"... {len(body['embedding']) - 5} more values"]

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "b3-classify-request.json").write_text(json.dumps({k: v for k, v in request.items() if k != "categories"}
                                                         | {"categories": f"{len(request['categories'])} categories from data/categories.json"},
                                                         indent=2, ensure_ascii=False), encoding="utf-8")
(OUT / "b3-classify-response.json").write_text(json.dumps(body, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"HTTP {response.status_code} in {elapsed:.0f} ms; category={body.get('category')}; "
      f"priority={body['priority']['level']}; spans={[(s['label'], s['text']) for s in body['spans']]}")
