# Tripy - 旅行計画アプリ

AIを活用した旅行計画アプリケーションです。

## 機能

1. **Cognito認証** - セキュアなユーザー認証
2. **AI相談** - 旅行計画についてAIエージェントと会話
3. **マップピン** - 行きたい場所にピンを設定
4. **予約管理** - 交通機関やホテルの予約管理
5. **TODOリスト** - 旅行準備のタスク管理

## セットアップ

### バックエンド

```bash
cd backend
npm install
serverless deploy
```

### フロントエンド

```bash
cd frontend
npm install
npm start
```

## 設定

1. Serverlessデプロイ後、出力されたAPI GatewayのURLとCognito設定を`frontend/src/App.js`に設定
2. Cognito User PoolとUser Pool Clientの情報を更新

## 技術スタック

- **フロントエンド**: React, React Router, Leaflet, AWS Amplify
- **バックエンド**: Node.js, AWS Lambda, DynamoDB
- **認証**: Amazon Cognito
- **AI**: Amazon Bedrock (Claude)
- **インフラ**: Serverless Framework

## API エンドポイント

- `GET /trips` - 旅行プラン一覧取得
- `POST /trips` - 旅行プラン作成
- `POST /trips/chat` - AIチャット
- `GET /bookings` - 予約一覧取得
- `POST /bookings` - 予約作成
- `GET /todos` - TODO一覧取得
- `POST /todos` - TODO作成