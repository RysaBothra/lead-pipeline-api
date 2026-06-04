# Lead Pipeline API — production container.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

WORKDIR /app

# Install deps first for better layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code.
COPY . .

EXPOSE 8000

# gunicorn manages uvicorn workers. Tune workers via the WEB_CONCURRENCY env var.
# Shell form so $PORT / $WEB_CONCURRENCY expand at runtime (e.g. Cloud Run sets $PORT).
CMD gunicorn server:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --workers ${WEB_CONCURRENCY:-2} \
    --bind 0.0.0.0:${PORT:-8000} \
    --timeout 600 \
    --access-logfile - --error-logfile -
