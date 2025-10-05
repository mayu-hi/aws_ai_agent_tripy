## 1. 依存 / 前提
AWS Lambda（Python）
DynamoDB（任意: メッセージ/ユーザ/スポットカタログ）
Bedrock Runtime（Claude を使う場合）
API Gateway (HTTP API) で POST /invoke に紐付け

## 2. 環境変数（.env.example）
```
AWS_REGION=us-west-2
MODEL_ID=global.anthropic.claude-sonnet-4-20250514-v1:0   # BedrockモデルID
RECO_TOKEN=tripy-dev-2025                           # APIトークン（ヘッダ検証用）
TABLE_TRIPY_MESSAGES=TripyMessages                  # 任意
TABLE_USER_PROFILE=UserProfile                      # 任意
```

注: Bedrock(Anthropic)呼び出し時は anthropic_version: "bedrock-2023-05-31" が必要。

## 3. 入出力（API仕様・最小）
エンドポイント（例）: POST https://<api-id>.execute-api.<region>.amazonaws.com/prod/invoke
ヘッダ:Content-Type: application/json
X-Agent-Token: <RECO_TOKEN>（必須）
X-User-Id: <任意のユーザID>（推奨）

リクエスト（例）
```
{
  "query": "大阪で雰囲気の良いカフェ",
  "city": "大阪府大阪市中央区",        // 任意
  "center": { "lat": 34.691730856, "lon": 135.507040931 } // 任意
}
```
レスポンス（例）
```
{
  "city": "大阪府大阪市中央区",
  "center": { "lat": 34.691730856, "lon": 135.507040931 },
  "spots": [
    { "name": "大阪府大阪市中央区ルポンドシエルビル", "lat": 34.690406186, "lon": 135.510868556 },
    { "name": "大阪府大阪市中央区ドトール", "lat": 34.684261976, "lon": 135.502730707 }
  ]
}
```

## 4. クイックテスト
API Gateway経由（curl）
```
curl -s -X POST "https://<api-id>.execute-api.<region>.amazonaws.com/prod/invoke" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Token: tripy-dev-2025" \
  -H "X-User-Id: u_demo" \
  -d '{"query":"北浜で静かなカフェ","city":"大阪府大阪市中央区"}' | jq
```

Lambda直叩き（AWS CLI）
```
aws lambda invoke \
  --function-name RecommendHandler \
  --payload '{"requestContext":{"http":{"method":"POST","path":"/invoke"}}, "headers":{"x-agent-token":"tripy-dev-2025","x-user-id":"u_demo"}, "body":"{\"query\":\"北浜で静かなカフェ\"}"}' \
  out.json && cat out.json
```

## 5. デプロイ（ひとこと）

CDK を使う場合は infra/cdk から cdk deploy。
API Gateway（/invoke）→ Lambda(このハンドラ) の統合を定義。

## 6. エラーパターン
401 Unauthorized … X-Agent-Token 不正 or 未指定
400 Bad Request … query 未指定など入力不備
500 … Bedrock/DynamoDB呼び出し失敗 等

## 7. 開発メモ（任意）
DynamoDB TABLE_SPOTS_CATALOG が空の場合は、LLM検索/外部検索にフォールバック（実装に応じて）。
位置情報がある場合は近傍順にリランキング。