from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str


class DocumentMetadata(BaseModel):
    filename: str
    content_type: str | None = None
    extension: str | None = None
    size_bytes: int
    title: str | None = None
    converter: str = "markitdown"
    conversion_metadata: dict[str, Any] = Field(default_factory=dict)


class ConvertResponse(BaseModel):
    markdown: str
    metadata: DocumentMetadata
