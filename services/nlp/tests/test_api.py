from fastapi.testclient import TestClient

from app.main import app


def test_health():
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_analyze_requires_user_identity():
    response = TestClient(app).post(
        "/api/v1/analyze",
        json={
            "email_id": "message-1",
            "subject": "Assignment deadline",
            "body": "Submit by Friday",
            "category_descriptions": [{"name": "School", "description": "Assignments"}],
        },
    )
    assert response.status_code == 401
