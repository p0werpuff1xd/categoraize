from datetime import datetime, timedelta, timezone

from app.ml.priority_rules import compute_category_priority

NOW = datetime(2026, 11, 22, 9, 0, tzinfo=timezone.utc)


def _promo(base: int, *, extracted=(), confirmed=(), role=None, vip=False):
    return compute_category_priority(
        base_priority=base,
        category_slug="promotions",
        extracted_deadlines=list(extracted),
        confirmed_deadlines=list(confirmed),
        now=NOW,
        sender_role=role,
        is_vip=vip,
        calendar_busy=None,
    )


def test_promotion_with_critical_base_is_capped():
    assert _promo(5).level == 2


def test_promotion_with_extracted_deadline_is_not_boosted():
    # "Sale ends tomorrow" must not become a critical deadline.
    result = _promo(3, extracted=[NOW + timedelta(hours=10)])
    assert result.level == 2
    assert result.deadline is None


def test_promotion_keeps_user_confirmed_deadline_boost_but_stays_capped():
    result = _promo(3, confirmed=[NOW + timedelta(hours=10)])
    assert result.deadline is not None
    assert result.level == 2


def test_vip_sender_does_not_lift_promotion_above_cap():
    assert _promo(3, vip=True).level == 2


def test_non_promotion_is_not_capped_and_uses_extracted_deadline():
    result = compute_category_priority(
        base_priority=3,
        category_slug="work_tasks",
        extracted_deadlines=[NOW + timedelta(hours=10)],
        confirmed_deadlines=[],
        now=NOW,
        sender_role=None,
        is_vip=False,
        calendar_busy=None,
    )
    assert result.level == 5
