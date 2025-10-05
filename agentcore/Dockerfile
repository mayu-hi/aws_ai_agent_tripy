FROM python:3.12-slim

# OSツール（必要最小限）
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Python依存
RUN pip install --no-cache-dir --upgrade pip

# strands が環境依存でコケやすいので setuptools-scm を先入れ
RUN pip install --no-cache-dir \
    boto3 httpx setuptools-scm \
    bedrock_agentcore \
    strands

WORKDIR /app
COPY tripy_agentcore.py /app/

# 既定環境（本番はタスク定義で上書き）
ENV AWS_REGION=us-west-2
ENV MODEL_ID=global.anthropic.claude-sonnet-4-20250514-v1:0
ENV REGISTRY_S3=s3://s3-tripy-agent-registry-20251003/tools.json
ENV HEALTH_TIMEOUT_MS=1500
ENV REGISTRY_REFRESH_SEC=60
ENV FALLBACK_TO_MOCK=1

EXPOSE 8080
CMD ["python", "tripy_agentcore.py"]
