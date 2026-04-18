from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any, Protocol

from fastapi import FastAPI, File, HTTPException, UploadFile
from markitdown import MarkItDown
from pydantic import BaseModel

MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024
COPY_CHUNK_SIZE_BYTES = 1024 * 1024


class Converter(Protocol):
    def convert(self, source: str) -> Any: ...


class HealthResponse(BaseModel):
    status: str = "ok"


class ConvertResponse(BaseModel):
    filename: str
    markdown: str


def _format_file_size(num_bytes: int) -> str:
    if num_bytes < 1024:
        return f"{num_bytes} bytes"
    if num_bytes < 1024 * 1024:
        return f"{num_bytes // 1024} KB"
    return f"{num_bytes // (1024 * 1024)} MB"


def _extract_markdown(conversion_result: Any) -> str:
    markdown = getattr(conversion_result, "text_content", conversion_result)
    if not isinstance(markdown, str):
        raise ValueError("Converter returned an unexpected response payload.")
    return markdown


def _persist_upload(upload: UploadFile, max_upload_size_bytes: int) -> Path:
    if not upload.filename:
        raise HTTPException(status_code=400, detail="Uploaded file must include a filename.")

    suffix = Path(upload.filename).suffix
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    temp_path = Path(temp_file.name)
    bytes_written = 0

    try:
        with temp_file:
            upload.file.seek(0)
            while chunk := upload.file.read(COPY_CHUNK_SIZE_BYTES):
                bytes_written += len(chunk)
                if bytes_written > max_upload_size_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Uploaded file exceeds the {_format_file_size(max_upload_size_bytes)} limit.",
                    )
                temp_file.write(chunk)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise

    return temp_path


def create_app(
    document_converter: Converter | None = None,
    *,
    max_upload_size_bytes: int = MAX_UPLOAD_SIZE_BYTES,
) -> FastAPI:
    app = FastAPI(title="MarkItDown API", version="0.1.0")
    converter = document_converter or MarkItDown()

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse()

    @app.post("/convert", response_model=ConvertResponse)
    def convert(file: UploadFile = File(...)) -> ConvertResponse:
        temp_path: Path | None = None
        try:
            temp_path = _persist_upload(file, max_upload_size_bytes=max_upload_size_bytes)
            markdown = _extract_markdown(converter.convert(str(temp_path)))
            return ConvertResponse(filename=file.filename, markdown=markdown)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Conversion failed: {exc}") from exc
        finally:
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)
            file.file.close()

    return app


app = create_app()
