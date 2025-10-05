#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TripyAgentcoreV2Stack } from '../lib/tripy-agentcore-v2-stack';

const app = new cdk.App();
new TripyAgentcoreV2Stack(app, 'TripyAgentcoreV2Stack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-west-2' }
});
