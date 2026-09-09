FROM python:3.12-slim
WORKDIR /app
COPY backend/pyproject.toml /app/pyproject.toml
RUN pip install --no-cache-dir fastapi uvicorn[standard] sqlalchemy pydantic-settings httpx playwright apscheduler python-dotenv \
    && playwright install --with-deps chromium
COPY backend /app
COPY data /data
ENV PYTHONPATH=/app
ENV DATA_DIR=/data
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
