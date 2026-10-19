# Core-CBT 에이전트(FastAPI) 이미지
# 빌드 컨텍스트는 리포 루트: docker compose build agent

FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY fastapi_app/requirements.txt ./fastapi_app/requirements.txt
RUN pip install --no-cache-dir -r fastapi_app/requirements.txt

COPY fastapi_app ./fastapi_app
COPY datasets ./datasets

RUN useradd --system --no-create-home agent
USER agent
EXPOSE 8001
CMD ["uvicorn", "fastapi_app.main:app", "--host", "0.0.0.0", "--port", "8001"]
