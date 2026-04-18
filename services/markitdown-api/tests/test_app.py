from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from markitdown_api.app import create_app
from markitdown_api.converter import ConversionError, ConversionResult
from markitdown_api.models import DocumentMetadata


class StubConverter:
    def __init__(
        self,
        *,
        result: ConversionResult | None = None,
        error: Exception | None = None,
    ) -> None:
        self._result = result
        self._error = error
        self.last_file_path: Path | None = None
        self.last_filename: str | None = None
        self.last_content_type: str | None = None
        self.last_size_bytes: int | None = None

    def convert(
        self,
        file_path: Path,
        *,
        filename: str,
        content_type: str | None,
        size_bytes: int,
    ) -> ConversionResult:
        self.last_file_path = file_path
        self.last_filename = filename
        self.last_content_type = content_type
        self.last_size_bytes = size_bytes

        if self._error is not None:
            raise self._error
        if self._result is None:
            raise AssertionError("StubConverter requires either a result or an error.")
        return self._result


def test_health_endpoint_reports_ok() -> None:
    client = TestClient(create_app(converter=StubConverter(result=_conversion_result())))

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "markitdown-fastapi-service",
    }


def test_convert_endpoint_returns_markdown_and_metadata() -> None:
    converter = StubConverter(result=_conversion_result())
    client = TestClient(create_app(converter=converter))

    response = client.post(
        "/convert",
        files={"file": ("sample.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )

    assert response.status_code == 200
    assert response.json() == {
        "markdown": "# Converted document",
        "metadata": {
            "filename": "sample.pdf",
            "content_type": "application/pdf",
            "extension": ".pdf",
            "size_bytes": 13,
            "title": "sample",
            "converter": "markitdown",
            "conversion_metadata": {"page_count": 1},
        },
    }
    assert converter.last_filename == "sample.pdf"
    assert converter.last_content_type == "application/pdf"
    assert converter.last_size_bytes == 13
    assert converter.last_file_path is not None
    assert not converter.last_file_path.exists()


def test_convert_rejects_empty_uploads() -> None:
    client = TestClient(create_app(converter=StubConverter(result=_conversion_result())))

    response = client.post(
        "/convert",
        files={"file": ("empty.txt", b"", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Uploaded file is empty."}


def test_convert_surfaces_conversion_failures() -> None:
    client = TestClient(
        create_app(
            converter=StubConverter(error=ConversionError("Unsupported document format.")),
        ),
    )

    response = client.post(
        "/convert",
        files={"file": ("sample.xyz", b"data", "application/octet-stream")},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Unsupported document format."}


def _conversion_result() -> ConversionResult:
    return ConversionResult(
        markdown="# Converted document",
        metadata=DocumentMetadata(
            filename="sample.pdf",
            content_type="application/pdf",
            extension=".pdf",
            size_bytes=13,
            title="sample",
            conversion_metadata={"page_count": 1},
        ),
    )
