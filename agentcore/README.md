
# Tripy agentcore 
## 🚀 API エンドポイント
```
[https://eki5d94j09.execute-api.us-west-2.amazonaws.com/prod/recommend](https://eki5d94j09.execute-api.us-west-2.amazonaws.com/prod/recommend)

````
POST リクエストでおすすめスポットを取得します。

---

## 📤 リクエスト形式
```json
{
  "city": "London",
  "query": "cafe",
  "top_k": 3
}
```

````
| パラメータ   | 型      | 必須 | 説明                |
| ------- | ------ | -- | ----------------- |
| `city`  | string | 任意 | 都市名（英語推奨）         |
| `query` | string | 必須 | 検索キーワード（例："cafe"） |
| `top_k` | number | 任意 | 最大件数（既定10）        |

---

## 📥 レスポンス形式

```json
{
  "chat": "",
  "map": {
    "city": "London, UK",
    "center": { "lat": 51.5074, "lon": -0.1278 },
    "spots": [
      { "name": "Notes Coffee", "lat": 51.5096, "lon": -0.1266 },
      { "name": "Page Common", "lat": 51.5093, "lon": -0.1268 },
      { "name": "O'Be Joyful Cafe", "lat": 51.5089, "lon": -0.1304 }
    ]
  }
}
```

```
### 使用ポイント

* `map.center` → 地図の中心座標
* `map.spots` → ピンとして表示（名前・緯度・経度）

---

## 🧩 tool.json（AgentCore レジストリ登録例）

```json
{
  "tool_name": "recommend",
  "display_name": "Tripy Recommend Tool",
  "description": "都市とキーワードからおすすめスポットを取得します。",
  "type": "api",
  "api": {
    "url": "https://eki5d94j09.execute-api.us-west-2.amazonaws.com/prod/recommend",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    },
    "input_schema": {
      "type": "object",
      "properties": {
        "city": { "type": "string" },
        "query": { "type": "string" },
        "top_k": { "type": "number" }
      },
      "required": ["query"]
    },
    "output_schema": {
      "type": "object",
      "properties": {
        "map": {
          "type": "object",
          "properties": {
            "city": { "type": "string" },
            "center": { "type": "object" },
            "spots": { "type": "array" }
          }
        }
      }
    }
  }
}
```

---

## 💻 使用例（fetch）

```js
const API = "https://eki5d94j09.execute-api.us-west-2.amazonaws.com/prod/recommend";

async function getSpots() {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city: "London", query: "cafe", top_k: 3 })
  });
  return await res.json();
}
```

---

> 💡 フロント側はこの `/recommend` を直接叩くだけでOK。
> AgentCore側では上記 `tool.json` を登録すれば、エージェントを追加利用可能。
### tool.json
s3に保存し、agentcoreで読み込む。descにツール選定条件を記載
```
[
  {
    "name": "RecommendTool",
    "desc": "Tripy Recommend API",
    "method": "POST",
    "url": "https://eki5d94j09.execute-api.us-west-2.amazonaws.com/prod/recommend",
    "health_url": "https://eki5d94j09.execute-api.us-west-2.amazonaws.com/prod/health",
    "timeout_ms": 15000,
    "headers": { "Content-Type": "application/json" }
  }
]
```
