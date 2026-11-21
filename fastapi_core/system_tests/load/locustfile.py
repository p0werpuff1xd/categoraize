"""S13 load test: 50 concurrent users for 5 minutes on /classify and /priority.

Run (the runner sets SYSTEM_NLP_KEY from the secrets folder; never print it):
  locust -f system_tests/load/locustfile.py --headless -u 50 -r 10 -t 5m \
    --host https://categoraize-nlp-35rdktlybq-as.a.run.app \
    --csv ../docs/testing/system/results/load --html ../docs/testing/system/artifacts/load-report.html

Each simulated user waits 1-3 s between requests (think time), sends a
fictional English, Taglish or Filipino email, and calls /classify three times
for every /priority call. A 429 (rate limit) counts as an error.
"""
from __future__ import annotations

import os
import random

from locust import HttpUser, between, task

KEY = os.environ.get("SYSTEM_NLP_KEY", "")
CATEGORIES = [
    {"id": "work", "name": "Work", "description": "Work tasks, reports, reviews and requests from colleagues.", "base_priority": 4},
    {"id": "school", "name": "School", "description": "Classes, assignments, exams and professors.", "base_priority": 3},
    {"id": "bills", "name": "Bills", "description": "Invoices, bills, statements and payment reminders.", "base_priority": 3},
    {"id": "promos", "name": "Promotions", "description": "Sales, discounts, newsletters and marketing.", "base_priority": 1},
]
EMAILS = [
    ("Report review", "Hi, please review the Q4 sales report and send me your comments by Friday 5 PM."),
    ("Report review", "Hi, paki-review naman ng Q4 sales report at i-send mo comments mo bago mag-Friday."),
    ("Pagsusuri ng ulat", "Pakisuri po ang ulat ng benta at ipadala ang inyong puna bago mag-Biyernes ng hapon."),
    ("Invoice due", "Your invoice of PHP 2,500 is due on November 30. Please settle the payment."),
    ("Flash sale", "Flash sale! 50% off sa lahat ng shoes this weekend lang."),
]
RECEIVED = "2026-11-16T09:00:00+08:00"


class NlpUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        self.client.headers.update({"X-Internal-Key": KEY})

    @task(3)
    def classify(self):
        subject, body = random.choice(EMAILS)
        self.client.post("/api/v1/classify", name="/api/v1/classify", json={
            "email_id": f"load-{random.randint(0, 10**9)}", "subject": subject, "body": body,
            "received_at": RECEIVED, "timezone": "Asia/Manila", "now": RECEIVED,
            "sender": {"email": "sender@example.invalid", "role": None, "is_vip": False},
            "categories": CATEGORIES, "threshold": 0.35,
        })

    @task(1)
    def priority(self):
        subject, body = random.choice(EMAILS)
        self.client.post("/api/v1/priority", name="/api/v1/priority", json={
            "subject": subject, "body": body, "received_at": RECEIVED, "timezone": "Asia/Manila",
            "category_base_priority": 3,
        })
