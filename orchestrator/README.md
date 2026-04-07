# Tripy Agent（Supervisor）

**対象**: `tripy_agent.py`  
**役割**: S3のツールレジストリを読み込み、疎通OKなHTTPツールだけを有効化してLLM（Bedrock）で統合回答。`BedrockAgentCoreApp` のエントリポイント。

---

## 必要物
- ライブラリ: `boto3`, `httpx`, `strands`, `bedrock-agentcore`
- AWS権限: S3 読取 / Bedrock 実行

---

## 環境変数（例：`.env`）
```env
MODEL_ID=global.anthropic.claude-sonnet-4-20250514-v1:0
AWS_REGION=us-west-2
REGISTRY_S3=s3://tripy-registry/stg/tools.json
HEALTH_TIMEOUT_MS=1500
REGISTRY_REFRESH_SEC=60
FALLBACK_TO_MOCK=1
```

## ツールレジストリ
```
[
  {
    "name": "RecommendTool",
    "method": "POST",
    "url": "https://<api-id>.execute-api.<region>.amazonaws.com/prod/recommend",
    "timeout_ms": 5000,
    "headers": {
      "Content-Type": "application/json",
      "X-Agent-Token": "${RECO_TOKEN}"
    }
  }
]
```

## 使い方
依存を入れる
```
pip install boto3 httpx strands bedrock-agentcore
```
起動
```
python tripy_agent.py
```

呼び出し（例）
```
curl -s -X POST http://localhost:8787/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message":"大阪で雰囲気のいいカフェ","user_id":"u_demo"}'
```

レスポンス
```
{ "result": "<統合済みの回答テキスト>" }
```
