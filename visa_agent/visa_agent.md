# test

### image
```mermaid
flowchart LR
  UserReq["User Request (destination, purpose, days)"]
    --> Lambda["VisaCheck Lambda"]

  Lambda --> Normalize["Normalize Inputs"]
  Normalize --> RuleCheck["ルールベース判定 (DDB/S3)"]

  RuleCheck -->|hit| ResponseOK["Return 判定 (不要/必要)"]
  RuleCheck -->|"miss/uncertain"| KBCall["Bedrock KB Retrieve"]

  KBCall --> LLM["Claude Sonnet (Bedrock Model)"]
  LLM --> ResponseKB["LLM Response (判定 + 根拠要約)"]

```

s3-tripy-tool-visacheck-visa-kb-20251004/
  gov/
    usa_visa.html
    uk_visa.pdf
  faq/
    visa_faq.txt
外務省、大使館の公開資料をダウンロード → S3に配置

PDF/HTML/TXT どれでもOK（KBが自動で分割＆ベクトル化）


###テスト
curl -s -X POST "https://<orchestrator-api>/agent" \
  -H "Content-Type: application/json" \
  -d '{"message":"来月アメリカに観光で2週間行くけど、ビザいる？"}'
