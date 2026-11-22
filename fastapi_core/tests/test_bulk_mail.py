"""Uncategorized bulk mail must not rank as P5 (synthetic emails only)."""

from app.nlp.bulk_mail import detect_bulk


def test_marketing_footer_is_promotional():
    signals = detect_bulk(
        "Win a trip to L.A.",
        "Your chance to win a trip. Important Privacy Information - Especially for Plain Text Readers.",
        "contest@brand.example.com",
    )
    assert signals.promotional


def test_two_offer_phrases_are_promotional():
    assert detect_bulk("Big sale", "Use promo code SAVE10 for free shipping.", "shop@x.example.com").promotional


def test_newsletter_sender_is_promotional():
    assert detect_bulk("Your weekly read", "Five posts picked for you.", "newsletter@blog.example.com").promotional


def test_job_alert_is_promotional():
    signals = detect_bulk(
        "Be first to hear about new openings",
        "Set up Job Alerts for companies and roles of interest. Personalized recommendations inside.",
        "jobs-noreply@careers.example.com",
    )
    assert signals.promotional
    assert signals.automated


def test_noreply_notification_is_automated_not_promotional():
    signals = detect_bulk(
        "Finished exporting day 2 .mp4",
        "Export ready. It finished exporting. Download it from your browser.",
        "notifications@video.example.com",
    )
    assert signals.automated
    assert not signals.promotional


def test_personal_request_is_neither():
    signals = detect_bulk(
        "Paki-submit ang report",
        "Hi! Paki-submit ang final budget report bukas ng 5pm. Salamat!",
        "ana.reyes@company.example.com",
    )
    assert not signals.promotional
    assert not signals.automated


# Through /classify with no user categories (everything Uncategorized).
from conftest import AUTH, classify_payload  # noqa: E402


def _classify(client, subject, body, sender):
    payload = classify_payload(subject=subject, body=body, categories=[], sender={"email": sender, "role": None, "is_vip": False})
    return client.post("/api/v1/classify", json=payload, headers=AUTH).json()


def test_uncategorized_promotion_with_a_date_stays_at_or_below_p2(client):
    result = _classify(
        client,
        "Last chance: 50% off ends today",
        "Shop now, sale ends today at midnight. Unsubscribe or manage your email preferences.",
        "deals@shop.example.com",
    )
    assert result["priority"]["level"] <= 2
    assert result["priority"]["deadline"] is None
    if result.get("learned_priority"):
        assert result["learned_priority"]["level"] <= 2


def test_uncategorized_automated_mail_ignores_template_dates(client):
    result = _classify(
        client,
        "Your export is ready",
        "Your file finished exporting today. Download it before tomorrow 5pm.",
        "no-reply@video.example.com",
    )
    assert result["priority"]["deadline"] is None
    assert result["priority"]["factors"]["deadline"] == 0


def test_uncategorized_personal_request_keeps_its_deadline(client):
    result = _classify(
        client,
        "Report",
        "Paki-tawagan si Ana bago bukas.",
        "ana.reyes@company.example.com",
    )
    assert result["priority"]["deadline"] is not None
