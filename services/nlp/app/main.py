from fastapi import Depends, FastAPI, Header, HTTPException, status

from .config import load_settings
from .schemas import AnalyzeRequest, AnalyzeResponse, FeedbackRequest, FeedbackResponse
from .service import AnalysisService

settings = load_settings()
service = AnalysisService(settings)
app = FastAPI(title="CategorAIze NLP", version="0.1.0")


def authenticated_user(
    x_user_id: str | None = Header(default=None),
    x_internal_service_token: str | None = Header(default=None),
) -> str:
    if settings.service_token and x_internal_service_token != settings.service_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid service token")
    if not x_user_id or not x_user_id.strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing user identity")
    return x_user_id.strip()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/analyze", response_model=AnalyzeResponse)
def analyze(
    request: AnalyzeRequest, user_id: str = Depends(authenticated_user)
) -> AnalyzeResponse:
    return service.analyze(user_id, request)


@app.post("/api/v1/feedback", response_model=FeedbackResponse)
def feedback(
    request: FeedbackRequest, user_id: str = Depends(authenticated_user)
) -> FeedbackResponse:
    try:
        return service.feedback(user_id, request.email_id, request.corrected_category)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
