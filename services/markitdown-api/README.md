# MarkItDown API

Standalone FastAPI service for document-to-Markdown conversion using Microsoft MarkItDown.

## Endpoints

- `GET /health` returns a basic liveness response.
- `POST /convert` accepts a multipart file upload and returns extracted Markdown.

## Local Run

```bash
uv sync --extra dev
uv run markitdown-api
```

The service rejects uploads larger than 50 MB and cleans up temporary files after every request.
