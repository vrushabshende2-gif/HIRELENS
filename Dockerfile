FROM node:22-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim-bookworm AS app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HOST=0.0.0.0 PORT=8000
WORKDIR /app
COPY requirements.lock.txt ./
RUN pip install --no-cache-dir -r requirements.lock.txt
COPY backend/ backend/
COPY evaluation/ evaluation/
COPY scripts/ scripts/
COPY manage.py ./
COPY --from=frontend /build/frontend/dist frontend/dist/
RUN useradd --create-home hirelens && chown -R hirelens:hirelens /app
USER hirelens
EXPOSE 8000
CMD ["python", "scripts/deploy.py"]
