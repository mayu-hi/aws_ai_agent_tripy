# デプロイ手順

## 1. バックエンドのデプロイ

```bash
cd backend
npm install
npm install -g serverless
serverless deploy
```

**デプロイ完了時の出力例：**
```
Service Information
service: tripy-backend
stage: dev
region: ap-northeast-1
stack: tripy-backend-dev
resources: 15
api keys:
  None
endpoints:
  ANY - https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/dev/trips
  ANY - https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/dev/trips/{proxy+}
  ANY - https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/dev/bookings
  ANY - https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/dev/bookings/{proxy+}
  ANY - https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/dev/todos
  ANY - https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/dev/todos/{proxy+}
functions:
  trips: tripy-backend-dev-trips
  bookings: tripy-backend-dev-bookings
  todos: tripy-backend-dev-todos
layers:
  None

Stack Outputs
CognitoUserPoolId: ap-northeast-1_XXXXXXXXX
CognitoUserPoolClientId: xxxxxxxxxxxxxxxxxxxxxxxxxx
ServiceEndpoint: https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/dev
```

デプロイ完了後、上記の出力から以下の情報をメモしてください：
- **API Gateway URL**: ServiceEndpoint の値
- **Cognito User Pool ID**: CognitoUserPoolId の値
- **Cognito User Pool Client ID**: CognitoUserPoolClientId の値

## 2. フロントエンドの設定更新

`frontend/src/App.js`の以下の部分を実際の値に更新：

```javascript
Amplify.configure({
  Auth: {
    region: 'ap-northeast-1',
    userPoolId: 'YOUR_USER_POOL_ID', // 実際のUser Pool IDに変更
    userPoolWebClientId: 'YOUR_CLIENT_ID' // 実際のClient IDに変更
  },
  API: {
    endpoints: [
      {
        name: 'tripyAPI',
        endpoint: 'YOUR_API_ENDPOINT' // 実際のAPI Gateway URLに変更
      }
    ]
  }
});
```

## 3. フロントエンドのデプロイ

### 開発環境での実行
```bash
cd frontend
npm install
npm start
```

### 本番環境へのデプロイ（S3 + CloudFront）

```bash
cd frontend
npm run build

# S3バケットを作成してビルドファイルをアップロード
aws s3 mb s3://tripy-frontend-bucket
aws s3 sync build/ s3://tripy-frontend-bucket --delete

# CloudFrontディストリビューションを設定
# S3バケットをオリジンとして設定
```

## 4. 必要な権限

Lambda関数に以下の権限が必要です：
- DynamoDB: Query, Scan, GetItem, PutItem, UpdateItem, DeleteItem
- Bedrock: InvokeModel

## 5. 環境変数

以下の環境変数が自動的に設定されます：
- TRIPS_TABLE
- BOOKINGS_TABLE  
- TODOS_TABLE