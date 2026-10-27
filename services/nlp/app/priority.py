import re

from .schemas import Entity, PriorityOutput


def resolve_priority(text: str, entities: list[Entity]) -> PriorityOutput:
    lowered = text.casefold()
    explanation: list[str] = []
    if any(entity.label == "DEADLINE" for entity in entities):
        explanation.append("A model-extracted deadline is present.")
    elif re.search(r"\b(?:due|deadline|submit|before|by)\b.{0,40}\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b", lowered):
        explanation.append("A deterministic deadline cue is present; no NER span was claimed.")
    if any(term in lowered for term in ("urgent", "asap", "today", "overdue")):
        explanation.append("The message contains an urgency cue.")
    if explanation:
        return PriorityOutput(level="high", explanation=explanation)
    if any(term in lowered for term in ("fyi", "newsletter", "weekly update")):
        return PriorityOutput(level="low", explanation=["The message contains an informational cue."])
    return PriorityOutput(level="normal", explanation=["No deterministic high- or low-priority rule matched."])
