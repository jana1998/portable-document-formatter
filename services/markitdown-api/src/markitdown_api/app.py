from __future__ import annotations

import shutil
from contextlib import suppress
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import cast

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile

from .converter import ConversionError, DocumentConverter, MarkItDownConverter
from .models import ConvertResponse, HealthResponse

SERVICE_NAME = "markitdown-fastapi-service"


def create_app(converter: DocumentConverter | None = None) -> FastAPI:
    app = FastAPI(title="MarkItDown FastAPI Service", version="0.1.0")
    app.state.converter = converter or MarkItDownConverter()

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(status="ok", service=SERVICE_NAME)

    @app.post("/convert", response_model=ConvertResponse)
    async def convert_file(
        file: UploadFile = File(...),
        document_converter: DocumentConverter = Depends(get_converter),
    ) -> ConvertResponse:
        if not file.filename:
            raise HTTPException(status_code=400, detail="Uploaded file must include a filename.")

        suffix = Path(file.filename).suffix
        temp_path: Path | None = None

        try:
            with NamedTemporaryFile(delete=False, suffix=suffix) as temporary_file:
                shutil.copyfileobj(file.file, temporary_file)
                temp_path = Path(temporary_file.name)

            size_bytes = temp_path.stat().st_size
            if size_bytes == 0:
                raise HTTPException(status_code=400, detail="Uploaded file is empty.")

            conversion = document_converter.convert(
                temp_path,
                filename=file.filename,
                content_type=file.content_type,
                size_bytes=size_bytes,
            )
            return ConvertResponse(markdown=conversion.markdown, metadata=conversion.metadata)
        except ConversionError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        finally:
            await file.close()
            if temp_path is not None:
                with suppress(FileNotFoundError):
                    temp_path.unlink()

    return app


def get_converter(request: Request) -> DocumentConverter:
    return cast(DocumentConverter, request.app.state.converter)


app = create_app()
