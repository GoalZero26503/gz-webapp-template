import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfront_origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, Architecture } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import * as path from 'path';

interface AppStackProps extends cdk.StackProps {
  stage: string;
  seedAdminEmail: string;
  domainName?: string;
  certificateArn?: string;
}

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const { stage, seedAdminEmail, domainName, certificateArn } = props;
    const lambdaDir = path.join(__dirname, '..', '..', 'lambda');

    // ─────────────────────────────────────────────
    // DynamoDB: App User Table
    // ─────────────────────────────────────────────

    const appUserTable = new dynamodb.Table(this, 'AppUserTable', {
      tableName: `${stage}{{APP_NAME_PASCAL}}User`,
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    });

    // ─────────────────────────────────────────────
    // S3: Webapp Hosting Bucket
    // ─────────────────────────────────────────────

    const webappBucket = new s3.Bucket(this, 'WebappBucket', {
      bucketName: `${stage}-{{APP_NAME}}-webapp`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ─────────────────────────────────────────────
    // Lambda Functions (NodejsFunction — auto esbuild)
    // ─────────────────────────────────────────────

    const sharedBundling = {
      externalModules: [] as string[],
      minify: true,
      sourceMap: true,
    };

    // Build allowed redirect URIs: always include localhost for local dev
    const allowedRedirectUris = ['http://localhost:5174/auth/callback'];
    if (domainName) {
      allowedRedirectUris.push(`https://${domainName}/auth/callback`);
    }

    const authFn = new NodejsFunction(this, 'AuthFn', {
      functionName: `${stage}-{{APP_NAME}}-auth`,
      entry: path.join(lambdaDir, 'auth', 'handler.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        STAGE: stage,
        APP_USER_TABLE: appUserTable.tableName,
        NODE_OPTIONS: '--enable-source-maps',
        ALLOWED_DOMAINS: 'bioliteenergy.com,goalzero.com',
        ALLOWED_REDIRECT_URIS: allowedRedirectUris.join(','),
        SSM_GOOGLE_CLIENT_ID: `/{{APP_NAME}}/${stage}/google_client_id`,
        SSM_GOOGLE_CLIENT_SECRET: `/{{APP_NAME}}/${stage}/google_client_secret`,
      },
      bundling: sharedBundling,
    });

    const usersFn = new NodejsFunction(this, 'UsersFn', {
      functionName: `${stage}-{{APP_NAME}}-users`,
      entry: path.join(lambdaDir, 'users', 'handler.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        STAGE: stage,
        APP_USER_TABLE: appUserTable.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: sharedBundling,
    });

    // ─────────────────────────────────────────────
    // IAM Permissions
    // ─────────────────────────────────────────────

    // Auth Lambda: read SSM params + read/write user table
    appUserTable.grantReadWriteData(authFn);
    authFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/{{APP_NAME}}/${stage}/*`,
      ],
    }));

    // Users Lambda: read/write user table + read SSM (jwt_secret)
    appUserTable.grantReadWriteData(usersFn);
    usersFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/{{APP_NAME}}/${stage}/jwt_secret`,
      ],
    }));

    // ─────────────────────────────────────────────
    // API Gateway v2 (HTTP API)
    // ─────────────────────────────────────────────

    const httpApi = new apigwv2.HttpApi(this, 'AppApi', {
      apiName: `${stage}-{{APP_NAME}}-api`,
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'Authorization'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    // Auth routes (no authorizer — these issue tokens)
    const authIntegration = new apigwv2_integrations.HttpLambdaIntegration('AuthIntegration', authFn);
    httpApi.addRoutes({ path: '/auth/google/redirect', methods: [apigwv2.HttpMethod.GET], integration: authIntegration });
    httpApi.addRoutes({ path: '/auth/google/callback', methods: [apigwv2.HttpMethod.POST], integration: authIntegration });
    httpApi.addRoutes({ path: '/auth/refresh', methods: [apigwv2.HttpMethod.POST], integration: authIntegration });
    httpApi.addRoutes({ path: '/auth/me', methods: [apigwv2.HttpMethod.GET], integration: authIntegration });

    // User management routes
    const usersIntegration = new apigwv2_integrations.HttpLambdaIntegration('UsersIntegration', usersFn);
    httpApi.addRoutes({ path: '/portal/users', methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST], integration: usersIntegration });
    httpApi.addRoutes({ path: '/portal/users/{email}/role', methods: [apigwv2.HttpMethod.PUT], integration: usersIntegration });
    httpApi.addRoutes({ path: '/portal/users/{email}', methods: [apigwv2.HttpMethod.DELETE], integration: usersIntegration });

    // ─────────────────────────────────────────────
    // CloudFront: Webapp Distribution
    // ─────────────────────────────────────────────

    const certificate = certificateArn
      ? acm.Certificate.fromCertificateArn(this, 'DomainCert', certificateArn)
      : undefined;

    const distribution = new cloudfront.Distribution(this, 'WebappDistribution', {
      defaultBehavior: {
        origin: cloudfront_origins.S3BucketOrigin.withOriginAccessControl(webappBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
      ...(domainName && certificate ? {
        domainNames: [domainName],
        certificate,
      } : {}),
    });

    // ─────────────────────────────────────────────
    // Seed Admin User
    // ─────────────────────────────────────────────

    new cr.AwsCustomResource(this, 'SeedAdminUser', {
      onCreate: {
        service: 'DynamoDB',
        action: 'putItem',
        parameters: {
          TableName: appUserTable.tableName,
          Item: {
            email: { S: seedAdminEmail },
            role: { S: 'admin' },
            invitedBy: { S: 'system' },
            invitedAt: { S: new Date().toISOString() },
            status: { S: 'active' },
          },
          ConditionExpression: 'attribute_not_exists(email)',
        },
        physicalResourceId: cr.PhysicalResourceId.of('seed-admin-user'),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['dynamodb:PutItem'],
          resources: [appUserTable.tableArn],
        }),
      ]),
    });

    // ─────────────────────────────────────────────
    // Outputs
    // ─────────────────────────────────────────────

    new cdk.CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'WebappBucketName', { value: webappBucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new cdk.CfnOutput(this, 'DistributionDomain', { value: distribution.distributionDomainName });
    new cdk.CfnOutput(this, 'AppUserTableName', { value: appUserTable.tableName });
  }
}
