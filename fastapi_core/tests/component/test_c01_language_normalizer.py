"""C1 Language detection and Taglish normalizer."""

import pytest

from app.nlp.language import detect_language
from app.nlp.taglish_cleaner import normalize

LANGUAGE_CASES = [
    pytest.param("Please send the quarterly report before the meeting tomorrow.", "en", id="C1-01 English"),
    pytest.param("Pakipadala po ang ulat bago ang pulong bukas. Salamat po.", "tl", id="C1-02 Filipino with po"),
    pytest.param("Paki-send naman yung report bago ang meeting bukas, thanks!", "mixed", id="C1-03 Taglish"),
    pytest.param("PAKI-SUBMIT PO ANG REQUIREMENTS BUKAS", "tl", id="C1-04 ALL CAPS Filipino"),
    pytest.param("i-submit mo na yung slides ngayon 🙏🔥", "mixed", id="C1-05 hyphenated form and emoji",
                 marks=pytest.mark.xfail(strict=True, reason="D-01: English stems inside hyphenated forms are not counted")),
    pytest.param("ok", "unknown", id="C1-06 too short"),
    pytest.param("", "unknown", id="C1-07 empty"),
    pytest.param("😂😂😂 🙏", "unknown", id="C1-08 emoji only"),
    pytest.param("Bitte senden Sie den Bericht bis morgen an das Team.", "unknown", id="C1-09 other language",
                 marks=pytest.mark.xfail(strict=True, reason="D-02: short English function words make German look English")),
]


@pytest.mark.parametrize(("text", "expected"), LANGUAGE_CASES)
def test_language_detection(case, text, expected):
    assert case(text, expected, detect_language(text)) == expected


NORMALIZER_CASES = [
    pytest.param("Pakipadala po ang ulat", "please send", id="C1-10 paki- request prefix becomes please"),
    pytest.param("Opo, salamat po", "thanks", id="C1-11 po/opo particles dropped, salamat glossed"),
    pytest.param("BUKAS NG UMAGA", "tomorrow", id="C1-12 ALL CAPS time words glossed"),
    pytest.param("i-submit bukas", "i-submit", id="C1-13 hyphenated i- form kept intact"),
]


@pytest.mark.parametrize(("text", "must_contain"), NORMALIZER_CASES)
def test_normalizer(case, text, must_contain):
    actual = normalize(text)
    case(text, f"contains '{must_contain}'", actual)
    assert must_contain in actual


def test_normalizer_keeps_particles_when_asked(case):
    actual = case("Salamat po", "contains 'po'", normalize("Salamat po", drop_particles=False), tc="C1-14")
    assert "po" in actual.split()


def test_particles_po_opo_are_removed(case):
    actual = case("Opo, salamat po", "no 'po' or 'opo' tokens", normalize("Opo, salamat po"), tc="C1-15")
    assert not {"po", "opo"} & set(actual.replace(",", " ").split())
