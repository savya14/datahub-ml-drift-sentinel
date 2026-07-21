FROM python:3.12-slim

WORKDIR /app

# Install system deps for pandas/scipy
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ && \
    rm -rf /var/lib/apt/lists/*

# Copy dependency manifest first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt jinja2

# Copy application code
COPY agent/ agent/
COPY backend/ backend/
COPY drift_engine/ drift_engine/
COPY data/ data/
COPY templates/ templates/

# Default env vars (override at runtime)
ENV DATAHUB_GMS_URL=http://datahub-gms:8080
ENV DATAHUB_GMS_TOKEN=""
ENV ALLOWED_ORIGINS="*"

EXPOSE 8000

CMD ["python", "backend/main.py"]
