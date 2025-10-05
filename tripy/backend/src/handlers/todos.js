const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();

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
        return await getTodos(userId, headers);
      
      case 'POST':
        return await createTodo(userId, JSON.parse(body), headers);
      
      case 'PUT':
        return await updateTodo(userId, pathParameters.proxy, JSON.parse(body), headers);
      
      case 'DELETE':
        return await deleteTodo(userId, pathParameters.proxy, headers);
      
      default:
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};

async function getTodos(userId, headers) {
  const params = {
    TableName: process.env.TODOS_TABLE,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: { ':userId': userId }
  };
  
  const result = await dynamodb.query(params).promise();
  return { statusCode: 200, headers, body: JSON.stringify(result.Items) };
}

async function createTodo(userId, todoData, headers) {
  const todoId = uuidv4();
  const item = {
    userId,
    todoId,
    ...todoData,
    completed: false,
    createdAt: new Date().toISOString()
  };
  
  const params = {
    TableName: process.env.TODOS_TABLE,
    Item: item
  };
  
  await dynamodb.put(params).promise();
  return { statusCode: 201, headers, body: JSON.stringify(item) };
}

async function updateTodo(userId, todoId, todoData, headers) {
  const params = {
    TableName: process.env.TODOS_TABLE,
    Key: { userId, todoId },
    UpdateExpression: 'SET #data = :data, updatedAt = :updatedAt',
    ExpressionAttributeNames: { '#data': 'data' },
    ExpressionAttributeValues: {
      ':data': todoData,
      ':updatedAt': new Date().toISOString()
    },
    ReturnValues: 'ALL_NEW'
  };
  
  const result = await dynamodb.update(params).promise();
  return { statusCode: 200, headers, body: JSON.stringify(result.Attributes) };
}

async function deleteTodo(userId, todoId, headers) {
  const params = {
    TableName: process.env.TODOS_TABLE,
    Key: { userId, todoId }
  };
  
  await dynamodb.delete(params).promise();
  return { statusCode: 204, headers };
}