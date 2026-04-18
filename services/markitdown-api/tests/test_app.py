from __future__ import annotations

import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException
from starlette.datastructures import UploadFile

from markitdown_api.app import create_app, _persist_upload


class FakeConversionResult:
    def __init__(self, text_content: str) -> None:
        self.text_content = text_content


class RecordingConverter:
    def __init__(self, result_text: str = "# Converted") -> None:
        self.result_text = result_text
        self.paths: list[Path] = []

    def convert(self, source: str) -> FakeConversionResult:
        self.paths.append(Path(source))
        return FakeConversionResult(self.result_text)


class FailingConverter:
    def __init__(self) -> None:
        self.paths: list[Path] = []

    def convert(self, source: str) -> FakeConversionResult:
        self.paths.append(Path(source))
        raise RuntimeError("boom")


def test_health_returns_ok() -> None:
    client = TestClient(create_app(document_converter=RecordingConverter()))

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_convert_returns_markdown() -> None:
    converter = RecordingConverter()
    client = TestClient(create_app(document_converter=converter))

    response = client.post(
        "/convert",
        files={"file": ("demo.pdf", b"test payload", "application/pdf")},
    )

    assert response.status_code == 200
    assert response.json() == {"filename": "demo.pdf", "markdown": "# Converted"}
    assert converter.paths
    assert not converter.paths[0].exists()


def test_convert_rejects_missing_filename() -> None:
    upload = UploadFile(filename="", file=io.BytesIO(b"test payload"))

    with pytest.raises(HTTPException) as exc_info:
        _persist_upload(upload, max_upload_size_bytes=1024)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Uploaded file must include a filename."


def test_convert_rejects_oversized_upload() -> None:
    client = TestClient(
        create_app(
            document_converter=RecordingConverter(),
            max_upload_size_bytes=5,
        )
    )

    response = client.post(
        "/convert",
        files={"file": ("demo.pdf", b"123456", "application/pdf")},
    )

    assert response.status_code == 413
    assert response.json()["detail"] == "Uploaded file exceeds the 5 bytes limit."


def test_convert_cleans_temp_file_after_failure() -> None:
    converter = FailingConverter()
    client = TestClient(create_app(document_converter=converter))

    response = client.post(
        "/convert",
        files={"file": ("demo.pdf", b"test payload", "application/pdf")},
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "Conversion failed: boom"
    assert converter.paths
    assert not converter.paths[0].exists()
