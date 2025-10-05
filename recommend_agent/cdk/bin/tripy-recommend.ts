#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TripyRecommendStack } from '../lib/tripy-recommend-stack';

const app = new cdk.App();
new TripyRecommendStack(app, 'TripyRecommendStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-west-2' },
});
