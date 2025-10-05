import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ddb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Tags, Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as path from 'path';

export class TripyRecommendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 共通タグ
    Tags.of(this).add('Owner', 'AI-Hackathon');
    Tags.of(this).add('Team', '01_athena');

    // ---------- DynamoDB ----------
    const messages = new ddb.Table(this, 'TripyMessages', {
      tableName: 'tripy_Messages',
      partitionKey: { name: 'userId', type: ddb.AttributeType.STRING },
      sortKey: { name: 'ts', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const userProfile = new ddb.Table(this, 'TripyUserProfile', {
      tableName: 'tripy_UserProfile',
      partitionKey: { name: 'userId', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const spots = new ddb.Table(this, 'TripySpotsCatalog', {
      tableName: 'tripy_SpotsCatalog',
      partitionKey: { name: 'spotId', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // ---------- Lambda ----------
    const fn = new lambda.Function(this, 'TripyRecommendLambda', {
      functionName: 'tripy_recommend_lambda',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'recommend_handler.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda')),
      timeout: Duration.seconds(20),
      environment: {
        TABLE_TRIPY_MESSAGES: messages.tableName,
        TABLE_USER_PROFILE: userProfile.tableName,
        TABLE_SPOTS_CATALOG: spots.tableName,
        RECO_TOKEN: 'set-your-token-here',
      },
    });

    messages.grantReadWriteData(fn);
    userProfile.grantReadWriteData(fn);
    spots.grantReadData(fn);

    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream',
        'bedrock:Converse', 'bedrock:ConverseStream'
      ],
      resources: ['*'],
    }));

    // ---------- API Gateway ----------
    const api = new apigw.RestApi(this, 'TripyRecommendApi', {
      restApiName: 'tripy-recommend-api',
      deployOptions: { stageName: 'prod' },
    });

    const invoke = api.root.addResource('invoke');
    invoke.addMethod('POST', new apigw.LambdaIntegration(fn));

    const health = api.root.addResource('health');
    health.addMethod('GET', new apigw.LambdaIntegration(fn));

    new cdk.CfnOutput(this, 'ApiInvokeUrl', { value: `${api.url}invoke` });
    new cdk.CfnOutput(this, 'ApiHealthUrl', { value: `${api.url}health` });
  }
}
