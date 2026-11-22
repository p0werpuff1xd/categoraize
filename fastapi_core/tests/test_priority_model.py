from datetime import datetime
from zoneinfo import ZoneInfo

from app.ml import priority_model
from app.ml.linear import LinearModel

MONDAY = datetime(2026, 11, 16, 9, 0, tzinfo=ZoneInfo("Asia/Manila"))


def test_vip_floor_needs_a_task():
    assert priority_model.apply_guardrails(2, is_vip=True, has_task=True, category=None) == (4, ["vip_floor"])
    assert priority_model.apply_guardrails(2, is_vip=True, has_task=False, category=None) == (2, [])


def test_promotion_cap_beats_the_vip_floor_and_override_beats_both():
    assert priority_model.apply_guardrails(5, is_vip=True, has_task=True, category="promotions") == (
        2, ["promotion_cap"])
    level, applied = priority_model.apply_guardrails(1, is_vip=True, has_task=True, category=None, override=5)
    assert level == 5 and applied == ["vip_floor", "manual_override"]


def test_deadline_proximity():
    assert priority_model.deadline_proximity([], MONDAY) == 0.0
    assert priority_model.deadline_proximity([None], MONDAY) == 0.0  # ambiguous dates never count
    assert priority_model.deadline_proximity(["2026-11-15T10:00:00+08:00"], MONDAY) == 1.0  # overdue
    assert priority_model.deadline_proximity(["2026-11-19T21:00:00+08:00"], MONDAY) == 0.5  # 84 hours
    assert priority_model.deadline_proximity(["2026-12-20"], MONDAY) == 0.0  # beyond one week


def test_why_groups_the_embedding_into_one_factor():
    names = priority_model.feature_names(3)
    model = LinearModel(
        classes=[1, 5],
        feature_names=names,
        coef=[[0.0] * len(names), [0.1, 0.1, 0.1, *([0.0] * 5), 2.0, 0.0, 0.0, 0.0, 0.0, 0.0]],
        intercept=[0.0, 0.0],
        meta={},
    )
    features = priority_model.features([1.0, 1.0, 1.0], sender_role="Manager", is_vip=True, has_task=False,
                                       deadline_proximity=0.0, promo_score=0.0, register="neutral")
    result = priority_model.predict(model, features, is_vip=True, has_task=False, category=None)
    assert result.level == 5 and result.source == "learned"
    assert [reason["factor"] for reason in result.why][:2] == ["VIP sender", "email content (embedding)"]
