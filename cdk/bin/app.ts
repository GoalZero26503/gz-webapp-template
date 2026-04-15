#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AppStack } from '../lib/app-stack';

const app = new cdk.App();

const stage = app.node.tryGetContext('stage') || 'dev';
const account = app.node.tryGetContext('account') || '336507940372';
const seedAdminEmail = app.node.tryGetContext('seedAdminEmail') || '{{SEED_ADMIN_EMAIL}}';
const domainName = app.node.tryGetContext('domainName') as string | undefined;
const certificateArn = app.node.tryGetContext('certificateArn') as string | undefined;

new AppStack(app, `GzWeb-{{APP_NAME_PASCAL}}-${stage}`, {
  env: { account, region: 'us-east-1' },
  stage,
  seedAdminEmail,
  domainName,
  certificateArn,
});
