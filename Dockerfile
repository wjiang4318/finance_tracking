FROM python:3.11-slim

# uv manages the venv from pyproject.toml + uv.lock (same as local dev)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# Copy dependency files first so this layer is cached unless deps actually change
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

# Now copy the actual app code
COPY api.py main.py ./
COPY pipeline ./pipeline
COPY database ./database

# Cloud Run injects $PORT (defaults to 8080); it's not known at build time
EXPOSE 8080
CMD ["sh", "-c", "uv run --no-sync uvicorn api:app --host 0.0.0.0 --port ${PORT:-8080}"]
