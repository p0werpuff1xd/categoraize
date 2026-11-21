"""C6 Register (sender tone) classifier, as served by /api/v1/register."""

import pytest
from conftest import AUTH

SAMPLES = [
    ("C6-01", "en", "formal", "Dear Ms. Santos, kindly review the attached proposal at your earliest convenience. Respectfully, Juan"),
    ("C6-02", "en", "neutral", "Hi Ana, the meeting moved to 3 PM tomorrow. Please bring the draft."),
    ("C6-03", "en", "casual", "hey lol can u send the pics later?? thx 😂"),
    ("C6-04", "mixed", "formal", "Good morning po, Ma'am. Kindly i-send po ang final report bago mag-5 PM. Salamat po."),
    ("C6-05", "mixed", "neutral", "Team, na-move ang sprint planning sa Thursday 2 PM. Paki-confirm ng attendance."),
    ("C6-06", "mixed", "casual", "uy pre, tara kain tayo mamaya haha 🍜"),
    ("C6-07", "tl", "formal", "Magandang umaga po. Mangyaring ipasa po ang inyong mga dokumento. Maraming salamat po."),
    ("C6-08", "tl", "neutral", "Inilipat ang pulong sa Huwebes, alas-dos ng hapon. Pakikumpirma ang pagdalo."),
    ("C6-09", "tl", "casual", "uy bes musta na? kape tayo bukas haha 😄"),
]


@pytest.mark.parametrize(("tc", "lang", "expected", "body"), [pytest.param(*s, id=f"{s[0]} {s[1]} {s[2]}") for s in SAMPLES])
def test_register_per_language(client, case, tc, lang, expected, body):
    response = client.post("/api/v1/register", headers=AUTH, json={"subject": "", "body": body})
    result = response.json()
    case(f"[{lang}] {body}", expected, f"{result['register']} (source {result['source']})")
    assert response.status_code == 200 and result["register"] == expected
