from conftest import AUTH

from app.algorithms.rule_matcher import RuleInput, RuleParams, choose_rule, rule_descriptions

PARAMS = RuleParams(threshold=0.4, request_boost=0.1, request_floor=0.02, confident_band=0.03, confident_margin=0.04)


def test_rule_descriptions_split_items_and_drop_exclusions():
    assert rule_descriptions(
        "Marketing", "Marketing: Promotions, sales, and offers. Exclude emails about account access."
    ) == ["Marketing", "Promotions, sales, and offers", "Promotions", "sales", "offers"]


def _fake_embed(similarities: dict[str, float]):
    """Vectors whose cosine with [1, 0] equals the wanted similarity."""

    def embed(texts: list[str]) -> list[list[float]]:
        return [[similarities.get(text, 0.0), (1 - similarities.get(text, 0.0) ** 2) ** 0.5] for text in texts]

    return embed


RULES = [
    RuleInput("reply", "To Reply", "", reply_needed=True),
    RuleInput("receipt", "Receipt", ""),
    RuleInput("otp", "OTP", ""),
]


def test_reply_rule_competes_only_when_a_request_was_found():
    embed = _fake_embed({"To Reply": 0.9, "Receipt": 0.5, "OTP": 0.2})
    without = choose_rule([1.0, 0.0], RULES, has_request=False, allow_multiple=False, embed=embed, params=PARAMS, prototypes={})
    assert without.matched == ["receipt"]
    with_request = choose_rule([1.0, 0.0], RULES, has_request=True, allow_multiple=False, embed=embed, params=PARAMS, prototypes={})
    assert with_request.matched == ["reply"]


def test_close_scores_are_not_confident_and_clear_wins_are():
    close = choose_rule([1.0, 0.0], RULES, has_request=False, allow_multiple=False,
                        embed=_fake_embed({"Receipt": 0.6, "OTP": 0.58}), params=PARAMS, prototypes={})
    assert close.matched == ["receipt"] and close.confident is False
    clear = choose_rule([1.0, 0.0], RULES, has_request=False, allow_multiple=False,
                        embed=_fake_embed({"Receipt": 0.6, "OTP": 0.3}), params=PARAMS, prototypes={})
    assert clear.confident is True
    just_below = choose_rule([1.0, 0.0], RULES, has_request=False, allow_multiple=False,
                             embed=_fake_embed({"Receipt": 0.39, "OTP": 0.1}), params=PARAMS, prototypes={})
    assert just_below.matched == [] and just_below.confident is False


def test_learned_prototypes_help_built_in_rules_and_none_means_no_rule():
    rules = [RuleInput("receipt", "Receipt", "", system_type="RECEIPT"), RuleInput("otp", "OTP", "", system_type="OTP")]
    embed = _fake_embed({"Receipt": 0.1, "OTP": 0.2})
    receipt_like = [0.8, 0.6]  # cosine 0.8 with the email vector [1, 0]
    decision = choose_rule([1.0, 0.0], rules, has_request=False, allow_multiple=False, embed=embed,
                           params=PARAMS, prototypes={"RECEIPT": receipt_like})
    assert decision.matched == ["receipt"]
    # A per-language centroid counts only for that language.
    by_language = choose_rule([1.0, 0.0], rules, has_request=False, allow_multiple=False, embed=embed,
                              params=PARAMS, prototypes={"RECEIPT@tl": receipt_like}, language="en")
    assert by_language.matched == []
    none_wins = choose_rule([1.0, 0.0], rules, has_request=False, allow_multiple=False, embed=embed,
                            params=PARAMS, prototypes={"RECEIPT": receipt_like, "NONE": [1.0, 0.0]})
    assert none_wins.matched == []


def test_choose_rule_endpoint(client):
    response = client.post(
        "/api/v1/choose-rule",
        json={
            "subject": "Your verification code",
            "body": "Your code is 482913. It expires in 5 minutes.",
            "rules": [
                {"id": "0", "name": "Receipt", "instructions": "Receipts and invoices", "system_type": "RECEIPT"},
                {"id": "1", "name": "OTP", "instructions": "One-time passwords and verification codes", "system_type": "OTP"},
                {"id": "2", "name": "To Reply", "instructions": "Emails I need to reply to", "reply_needed": True},
            ],
        },
        headers=AUTH,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["matched"] == ["1"]
    assert body["has_request"] is False
    assert "threshold" in body["params"]
