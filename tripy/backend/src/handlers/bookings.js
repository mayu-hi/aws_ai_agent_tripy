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
        return await getBookings(userId, headers);
      
      case 'POST':
        if (pathParameters?.proxy === 'transport') {
          return await bookTransport(userId, JSON.parse(body), headers);
        }
        return await createBooking(userId, JSON.parse(body), headers);
      
      case 'PUT':
        return await updateBooking(userId, pathParameters.proxy, JSON.parse(body), headers);
      
      case 'DELETE':
        return await deleteBooking(userId, pathParameters.proxy, headers);
      
      default:
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};

async function getBookings(userId, headers) {
  const params = {
    TableName: process.env.BOOKINGS_TABLE,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: { ':userId': userId }
  };
  
  const result = await dynamodb.query(params).promise();
  return { statusCode: 200, headers, body: JSON.stringify(result.Items) };
}

async function createBooking(userId, bookingData, headers) {
  const bookingId = uuidv4();
  const item = {
    userId,
    bookingId,
    ...bookingData,
    status: bookingData.type === 'transport' ? 'confirmed' : 'pending',
    createdAt: new Date().toISOString()
  };
  
  const params = {
    TableName: process.env.BOOKINGS_TABLE,
    Item: item
  };
  
  await dynamodb.put(params).promise();
  return { statusCode: 201, headers, body: JSON.stringify(item) };
}

async function bookTransport(userId, { route, date, time, passengers }, headers) {
  const bookingId = uuidv4();
  const item = {
    userId,
    bookingId,
    type: 'transport',
    route,
    date,
    time,
    passengers: passengers || 1,
    status: 'confirmed',
    bookingReference: `TR${Date.now()}`,
    createdAt: new Date().toISOString()
  };
  
  const params = {
    TableName: process.env.BOOKINGS_TABLE,
    Item: item
  };
  
  await dynamodb.put(params).promise();
  return { statusCode: 201, headers, body: JSON.stringify(item) };
}

async function updateBooking(userId, bookingId, bookingData, headers) {
  const params = {
    TableName: process.env.BOOKINGS_TABLE,
    Key: { userId, bookingId },
    UpdateExpression: 'SET #data = :data, updatedAt = :updatedAt',
    ExpressionAttributeNames: { '#data': 'data' },
    ExpressionAttributeValues: {
      ':data': bookingData,
      ':updatedAt': new Date().toISOString()
    },
    ReturnValues: 'ALL_NEW'
  };
  
  const result = await dynamodb.update(params).promise();
  return { statusCode: 200, headers, body: JSON.stringify(result.Attributes) };
}

async function deleteBooking(userId, bookingId, headers) {
  const params = {
    TableName: process.env.BOOKINGS_TABLE,
    Key: { userId, bookingId }
  };
  
  await dynamodb.delete(params).promise();
  return { statusCode: 204, headers };
}