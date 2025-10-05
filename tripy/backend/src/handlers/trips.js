const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const bedrock = new AWS.BedrockRuntime({ region: 'us-east-1' });

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  const userId = event.requestContext.authorizer?.claims?.sub || 'test-user';
  const { httpMethod, pathParameters, body } = event;

  try {
    switch (httpMethod) {
      case 'GET':
        if (pathParameters?.proxy === 'pins') {
          return await getPins(userId, headers);
        }
        if (pathParameters?.proxy) {
          return await getTrip(userId, pathParameters.proxy, headers);
        }
        return await getTrips(userId, headers);
      
      case 'POST':
        if (pathParameters?.proxy === 'chat') {
          return await chatWithAgent(userId, JSON.parse(body), headers);
        }
        if (pathParameters?.proxy === 'pins') {
          return await savePins(userId, JSON.parse(body), headers);
        }
        return await createTrip(userId, JSON.parse(body), headers);
      
      case 'PUT':
        return await updateTrip(userId, pathParameters.proxy, JSON.parse(body), headers);
      
      case 'DELETE':
        return await deleteTrip(userId, pathParameters.proxy, headers);
      
      default:
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};

async function getTrips(userId, headers) {
  const params = {
    TableName: process.env.TRIPS_TABLE,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: { ':userId': userId }
  };
  
  const result = await dynamodb.query(params).promise();
  return { statusCode: 200, headers, body: JSON.stringify(result.Items) };
}

async function getTrip(userId, tripId, headers) {
  const params = {
    TableName: process.env.TRIPS_TABLE,
    Key: { userId, tripId }
  };
  
  const result = await dynamodb.get(params).promise();
  return { statusCode: 200, headers, body: JSON.stringify(result.Item) };
}

async function createTrip(userId, tripData, headers) {
  const tripId = uuidv4();
  const item = {
    userId,
    tripId,
    ...tripData,
    createdAt: new Date().toISOString()
  };
  
  const params = {
    TableName: process.env.TRIPS_TABLE,
    Item: item
  };
  
  await dynamodb.put(params).promise();
  return { statusCode: 201, headers, body: JSON.stringify(item) };
}

async function updateTrip(userId, tripId, tripData, headers) {
  const params = {
    TableName: process.env.TRIPS_TABLE,
    Key: { userId, tripId },
    UpdateExpression: 'SET #data = :data, updatedAt = :updatedAt',
    ExpressionAttributeNames: { '#data': 'data' },
    ExpressionAttributeValues: {
      ':data': tripData,
      ':updatedAt': new Date().toISOString()
    },
    ReturnValues: 'ALL_NEW'
  };
  
  const result = await dynamodb.update(params).promise();
  return { statusCode: 200, headers, body: JSON.stringify(result.Attributes) };
}

async function deleteTrip(userId, tripId, headers) {
  const params = {
    TableName: process.env.TRIPS_TABLE,
    Key: { userId, tripId }
  };
  
  await dynamodb.delete(params).promise();
  return { statusCode: 204, headers };
}

async function chatWithAgent(userId, { message, tripContext, userProfile }, headers) {
  // ユーザープロファイルを取得
  const profile = userProfile || await getUserProfile(userId);
  
  const prompt = `あなたは旅行計画のエキスパートです。ユーザーのプロファイルを考慮して旅行プランを提案してください。

ユーザープロファイル: ${JSON.stringify(profile)}
ユーザーメッセージ: ${message}
旅行コンテキスト: ${JSON.stringify(tripContext || {})}

予算、好み、過去の旅行履歴を考慮した具体的で実用的な提案をしてください。公共交通機関の利用も含めて提案してください。`;

  const params = {
    modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  };

  try {
    const response = await bedrock.invokeModel(params).promise();
    const responseBody = JSON.parse(response.body.toString());
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ response: responseBody.content[0].text })
    };
  } catch (error) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ response: 'AIエージェントは現在利用できません。後でもう一度お試しください。' })
    };
  }
}

async function getUserProfile(userId) {
  try {
    const params = {
      TableName: process.env.TRIPS_TABLE,
      Key: { userId, tripId: 'user-profile' }
    };
    const result = await dynamodb.get(params).promise();
    return result.Item?.profile || {
      budget: 'medium',
      interests: ['観光', '食事'],
      travelStyle: 'relaxed',
      previousTrips: []
    };
  } catch (error) {
    return {
      budget: 'medium',
      interests: ['観光', '食事'],
      travelStyle: 'relaxed',
      previousTrips: []
    };
  }
}

async function getPins(userId, headers) {
  const params = {
    TableName: process.env.TRIPS_TABLE,
    Key: { userId, tripId: 'map-pins' }
  };
  
  const result = await dynamodb.get(params).promise();
  return { statusCode: 200, headers, body: JSON.stringify(result.Item?.pins || []) };
}

async function savePins(userId, { pins }, headers) {
  const params = {
    TableName: process.env.TRIPS_TABLE,
    Key: { userId, tripId: 'map-pins' },
    UpdateExpression: 'SET pins = :pins, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':pins': pins,
      ':updatedAt': new Date().toISOString()
    },
    ReturnValues: 'ALL_NEW'
  };
  
  const result = await dynamodb.update(params).promise();
  return { statusCode: 200, headers, body: JSON.stringify(result.Attributes) };
}