import * as cdk from 'aws-cdk-lib';
import {
  Stack, StackProps, Duration, CfnOutput,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_ecs_patterns as ecsPatterns,
  aws_iam as iam,
  aws_dynamodb as ddb,
  aws_apigatewayv2 as apigwv2,
  aws_elasticloadbalancingv2 as elbv2,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class TripyAgentcoreV2Stack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ===== パラメータ =====
    const repoName = 'tripy-agentcore-v2';
    const imageTag = 'v1';
    const containerPort = 8080;

    const registryS3 = 's3://s3-tripy-agent-registry-20251003/tools.json';
    const modelId    = 'global.anthropic.claude-sonnet-4-20250514-v1:0';
    const ddbArn     = 'arn:aws:dynamodb:us-west-2:047786098634:table/TripyMemory';

    // ===== VPC =====
    const vpc = new ec2.Vpc(this, 'Vpc', { maxAzs: 2, natGateways: 1 });

    // ===== ECR（既存; CodeBuild で :v1 をpush） =====
    const repo = ecr.Repository.fromRepositoryName(this, 'Repo', repoName);

    // ===== ECS + NLB(Fargate, TCP:80→:8080) =====
    const cluster = new ecs.Cluster(this, 'Cluster', { vpc });

    const svc = new ecsPatterns.NetworkLoadBalancedFargateService(this, 'Service', {
      cluster,
      cpu: 512,
      memoryLimitMiB: 1024,
      desiredCount: 1,
      publicLoadBalancer: true,
      listenerPort: 80,
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(repo, imageTag),
        containerPort,
        containerName: 'tripy-agentcore',
        environment: {
          AWS_REGION: 'us-west-2',
          MODEL_ID: modelId,
          REGISTRY_S3: registryS3,
          HEALTH_TIMEOUT_MS: '1500',
          REGISTRY_REFRESH_SEC: '60',
          FALLBACK_TO_MOCK: '1',
          DDB_TABLE_TRIPY_MEMORY: 'TripyMemory',
        },
      },
    });

    // ===== タスクロール（アプリ権限） =====
    const taskRole = svc.taskDefinition.taskRole;
    taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: ['*'],
    }));
    taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: ['arn:aws:s3:::s3-tripy-agent-registry-20251003/tools.json'],
    }));
    taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['dynamodb:PutItem', 'dynamodb:Query'],
      resources: [ddbArn],
    }));

    // ===== API Gateway HTTP API (CFN L1) + VPC Link → NLB =====
    // VPC Link 用SG（送信のみ許可でOK）
    const vpcLinkSg = new ec2.SecurityGroup(this, 'VpcLinkSg', {
      vpc, description: 'APIGW VPC Link', allowAllOutbound: true,
    });

    // HTTP API 本体
    const httpApi = new apigwv2.CfnApi(this, 'HttpApi', {
      name: 'tripy-agentcore-v2',
      protocolType: 'HTTP',
    });

    // VPC Link（プライベートサブネットを割当）
    const vpcLink = new apigwv2.CfnVpcLink(this, 'VpcLink', {
      name: 'tripy-vpc-link',
      subnetIds: vpc.privateSubnets.map(s => s.subnetId),
      securityGroupIds: [vpcLinkSg.securityGroupId],
    });

    // デフォルトステージ（https://{id}.execute-api.../）
    const stage = new apigwv2.CfnStage(this, 'DefaultStage', {
      apiId: httpApi.ref,
      stageName: '$default',
      autoDeploy: true,
    });

    // NLBのリスナーARNをHTTP APIの統合URIに使用
    const nlbListenerArn = (svc.listener as elbv2.NetworkListener).listenerArn;

    const integration = new apigwv2.CfnIntegration(this, 'Integration', {
      apiId: httpApi.ref,
      integrationType: 'HTTP_PROXY',
      connectionType: 'VPC_LINK',
      connectionId: vpcLink.ref,
      integrationUri: nlbListenerArn, // ← NLB Listener ARN
      payloadFormatVersion: '1.0',
      timeoutInMillis: 29000,
    });

    // ANY /{proxy+} → integration
    const route = new apigwv2.CfnRoute(this, 'ProxyRoute', {
      apiId: httpApi.ref,
      routeKey: 'ANY /{proxy+}',
      target: `integrations/${integration.ref}`,
    });

    // 出力
    new CfnOutput(this, 'ApiEndpoint', { value: httpApi.attrApiEndpoint });
    new CfnOutput(this, 'NlbDns', { value: svc.loadBalancer.loadBalancerDnsName });
  }
}
