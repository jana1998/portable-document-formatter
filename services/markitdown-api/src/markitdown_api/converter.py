from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Protocol

from .models import DocumentMetadata


class ConversionError(Exception):
    """Raised when an uploaded document cannot be converted."""


@dataclass(slots=True)
class ConversionResult:
    markdown: str
    metadata: DocumentMetadata


class DocumentConverter(Protocol):
    def convert(
        self,
        file_path: Path,
        *,
        filename: str,
        content_type: str | None,
        size_bytes: int,
    ) -> ConversionResult:
        ...


class MarkItDownConverter:
    def __init__(self) -> None:
        from markitdown import MarkItDown

        self._client = MarkItDown()

    def convert(
        self,
        file_path: Path,
        *,
        filename: str,
        content_type: str | None,
        size_bytes: int,
    ) -> ConversionResult:
        try:
            result = self._client.convert(str(file_path))
        except Exception as exc:  # pragma: no cover - depends on upstream failures
            message = str(exc).strip() or "Document conversion failed."
            raise ConversionError(message) from exc

        markdown = getattr(result, "text_content", None)
        if not isinstance(markdown, str):
            raise ConversionError("MarkItDown returned an unexpected response payload.")

        raw_metadata = _normalize_mapping(getattr(result, "metadata", None))
        for attribute in ("title", "source", "content_type", "charset", "language", "page_count"):
            value = getattr(result, attribute, None)
            if value not in (None, ""):
                raw_metadata.setdefault(attribute, _normalize_value(value))

        title = raw_metadata.get("title")
        if not isinstance(title, str) or not title.strip():
            title = Path(filename).stem

        metadata = DocumentMetadata(
            filename=filename,
            content_type=content_type,
            extension=file_path.suffix.lower() or None,
            size_bytes=size_bytes,
            title=title,
            conversion_metadata=raw_metadata,
        )
        return ConversionResult(markdown=markdown, metadata=metadata)


def _normalize_mapping(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, Mapping):
        data = dict(value)
    elif hasattr(value, "model_dump"):
        data = value.model_dump(mode="json")
    elif hasattr(value, "__dict__"):
        data = {
            key: item
            for key, item in vars(value).items()
            if not key.startswith("_")
        }
    else:
        return {"value": _normalize_value(value)}

    return {str(key): _normalize_value(item) for key, item in data.items()}


def _normalize_value(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): _normalize_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_normalize_value(item) for item in value]
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)
