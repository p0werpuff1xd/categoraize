"""S10 (API half): authentication, exposure and headers on the deployed stack."""
from __future__ import annotations

import pytest
from conftest import NLP_URL, WEB_URL

ENDPOINTS = ["classify", "embed", "match", "choose-rule", "thread-status", "summarize",
             "feedback", "discover", "tasks", "register", "priority"]


@pytest.mark.parametrize("name", ENDPOINTS, ids=[f"S10-A{i + 1:02d} {n}" for i, n in enumerate(ENDPOINTS)])
def test_endpoint_rejects_missing_and_wrong_key(case, anonymous, name):
    url = f"{NLP_URL}/api/v1/{name}"
    missing = anonymous.post(url, json={}).status_code
    wrong = anonymous.post(url, json={}, headers={"X-Internal-Key": "wrong-key"}).status_code
    case(f"POST /api/v1/{name} without key, then with a wrong key", "401, 401", f"{missing}, {wrong}")
    assert (missing, wrong) == (401, 401)


@pytest.mark.xfail(strict=True, reason="SYS-D01 deployed NLP image predates the /health route")
def test_health_route_the_web_app_calls(case, anonymous):
    status = anonymous.get(f"{NLP_URL}/health").status_code
    case("GET /health (used by the web status check)", 200, status, tc="S10-B01")
    assert status == 200


@pytest.mark.xfail(strict=True, reason="SYS-D02 API docs and schema are public in production")
def test_api_docs_are_not_public(case, anonymous):
    codes = {p: anonymous.get(f"{NLP_URL}{p}").status_code for p in ("/docs", "/openapi.json", "/redoc")}
    case("GET /docs, /openapi.json, /redoc without a key", "404 or 401 for each", codes, tc="S10-B02")
    assert all(code in (401, 404) for code in codes.values())


REQUIRED_HEADERS = {
    "strict-transport-security": "max-age",
    "content-security-policy": "",
    "x-content-type-options": "nosniff",
    "x-frame-options": "",
    "referrer-policy": "",
    "permissions-policy": "",
}


@pytest.mark.parametrize("path", ["/", "/login"], ids=["S10-C01 landing", "S10-C02 login"])
def test_web_security_headers(case, anonymous, path):
    response = anonymous.get(f"{WEB_URL}{path}")
    headers = {k.lower(): v for k, v in response.headers.items()}
    present = {name: name in headers and want in headers[name].lower() for name, want in REQUIRED_HEADERS.items()}
    case(f"GET {path}", "HSTS, CSP, nosniff, XFO, Referrer-Policy, Permissions-Policy", present,
         evidence=f"HTTP {response.status_code}")
    assert all(present.values())


@pytest.mark.xfail(strict=True, reason="SYS-D08 CSP allows 'unsafe-inline' and 'unsafe-eval' scripts")
def test_csp_blocks_inline_and_eval_scripts(case, anonymous):
    csp = anonymous.get(f"{WEB_URL}/login").headers.get("content-security-policy", "")
    script_src = next((d.strip() for d in csp.split(";") if d.strip().startswith("script-src")), "")
    case("GET /login, Content-Security-Policy script-src", "no 'unsafe-inline' or 'unsafe-eval'", script_src, tc="S10-C05")
    assert "'unsafe-inline'" not in script_src and "'unsafe-eval'" not in script_src


@pytest.mark.xfail(strict=True, reason="SYS-D03 X-Powered-By: Next.js is sent")
def test_web_does_not_advertise_framework(case, anonymous):
    header = anonymous.get(f"{WEB_URL}/login").headers.get("x-powered-by")
    case("GET /login", "no X-Powered-By header", header or "absent", tc="S10-C03")
    assert header is None


def test_nlp_service_is_not_reachable_without_tls(case, anonymous):
    import httpx

    try:
        code = anonymous.get(NLP_URL.replace("https://", "http://") + "/api/v1/classify").status_code
    except httpx.HTTPError as error:
        code = type(error).__name__
    case("plain HTTP to the NLP service", "redirect to HTTPS or refused", code, tc="S10-C04")
    assert code in (301, 302, 307, 308) or isinstance(code, str)
