import re


def summarize(text: str, limit: int = 2) -> list[str]:
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", text.strip())
        if sentence.strip()
    ]
    if len(sentences) <= limit:
        return sentences

    ranked = sorted(
        enumerate(sentences),
        key=lambda item: (-_salience(item[1]), item[0]),
    )[:limit]
    return [sentences[index] for index, _sentence in sorted(ranked)]


def _salience(sentence: str) -> int:
    return len(re.findall(r"\b\w+\b", sentence)) + 2 * len(
        re.findall(r"\b(please|kindly|paki|bukas|tomorrow|deadline|urgent)\b", sentence, re.IGNORECASE)
    )
