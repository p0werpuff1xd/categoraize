import pytest
from conftest import AUTH

from app.algorithms.thread_status import ThreadMessage, determine_status
from app.services.tagger import tagger_manager


def _status(*messages: tuple[bool, str]):
    _, tag, _ = tagger_manager.active()
    return determine_status([ThreadMessage(from_user, "", body) for from_user, body in messages], tag)


@pytest.mark.parametrize(
    ("messages", "expected"),
    [
        ([(False, "Hi, can you tell me which dataset you used?")], "TO_REPLY"),
        ([(False, "Hi team, paki-send ang final report bukas.")], "TO_REPLY"),
        ([(True, "Could you send me a quotation for 200 notebooks?")], "AWAITING_REPLY"),
        ([(True, "Sending the invoice."), (False, "Got it, I'll check with finance and get back to you.")], "AWAITING_REPLY"),
        ([(False, "Please submit the form."), (True, "Done, submitted it this morning.")], "ACTIONED"),
        ([(False, "May sira ang gripo."), (True, "Ako na ang bahala diyan, aayusin ko mamaya.")], "ACTIONED"),
        ([(False, "Please confirm the room."), (True, "Let me check and I'll get back to you tomorrow.")], "TO_REPLY"),
        ([(False, "Walang pasok bukas dahil sa bagyo.")], "FYI"),
    ],
)
def test_local_thread_status(messages, expected):
    assert _status(*messages).status == expected


def test_informational_reply_after_an_unanswered_request_is_unsure():
    decision = _status((False, "Pakicheck yung budget sheet."), (False, "FYI, in-update ko na rin yung tab 2."))
    assert decision.status == "TO_REPLY"
    assert decision.confident is False


def test_thread_status_endpoint(client):
    response = client.post(
        "/api/v1/thread-status",
        json={"messages": [{"from_user": False, "subject": "Q", "body": "Kailan po ang deadline?"}]},
        headers=AUTH,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "TO_REPLY"
