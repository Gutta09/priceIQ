# Single-image build: Vite compiles the React frontend, FastAPI serves it
# at the same origin (backend/main.py mounts ../frontend/dist).

FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim
WORKDIR /app/backend

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend /app/frontend/dist /app/frontend/dist

# SQLite lives on a mountable volume path (see docker-compose.yml)
ENV PRICEIQ_DB=/data/priceiq.db
RUN mkdir -p /data

EXPOSE 8000

# python:slim ships no curl — use the stdlib for the healthcheck
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=4)"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
