import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { NativeAttributeValue } from '@aws-sdk/util-dynamodb';

const client = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const stage = process.env.STAGE || 'dev';

/** Resolve app table name: gzweb-{stage}-{app}-{name} */
export function appTable(name: string): string {
  return `gzweb-${stage}-{{APP_NAME}}-${name}`;
}

export async function getItem<T>(tableName: string, key: Record<string, NativeAttributeValue>): Promise<T | null> {
  const result = await docClient.send(new GetCommand({ TableName: tableName, Key: key }));
  return (result.Item as T) || null;
}

export async function putItem(tableName: string, item: Record<string, NativeAttributeValue>): Promise<void> {
  await docClient.send(new PutCommand({ TableName: tableName, Item: item }));
}

export async function queryItems<T>(
  tableName: string,
  keyCondition: string,
  expressionValues: Record<string, NativeAttributeValue>,
  options?: {
    indexName?: string;
    limit?: number;
    scanForward?: boolean;
    exclusiveStartKey?: Record<string, NativeAttributeValue>;
    expressionNames?: Record<string, string>;
  },
): Promise<{ items: T[]; lastKey?: Record<string, NativeAttributeValue> }> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: options?.expressionNames,
      IndexName: options?.indexName,
      Limit: options?.limit,
      ScanIndexForward: options?.scanForward ?? false,
      ExclusiveStartKey: options?.exclusiveStartKey,
    }),
  );
  return {
    items: (result.Items as T[]) || [],
    lastKey: result.LastEvaluatedKey as Record<string, NativeAttributeValue> | undefined,
  };
}

export async function updateItem(
  tableName: string,
  key: Record<string, NativeAttributeValue>,
  updateExpression: string,
  expressionValues: Record<string, NativeAttributeValue>,
  expressionNames?: Record<string, string>,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: expressionNames,
    }),
  );
}

export async function deleteItem(
  tableName: string,
  key: Record<string, NativeAttributeValue>,
): Promise<void> {
  await docClient.send(new DeleteCommand({ TableName: tableName, Key: key }));
}

export async function scanItems<T>(
  tableName: string,
  options?: {
    limit?: number;
    exclusiveStartKey?: Record<string, NativeAttributeValue>;
    filterExpression?: string;
    expressionValues?: Record<string, NativeAttributeValue>;
    expressionNames?: Record<string, string>;
  },
): Promise<{ items: T[]; lastKey?: Record<string, NativeAttributeValue> }> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: tableName,
      Limit: options?.limit,
      ExclusiveStartKey: options?.exclusiveStartKey,
      FilterExpression: options?.filterExpression,
      ExpressionAttributeValues: options?.expressionValues,
      ExpressionAttributeNames: options?.expressionNames,
    }),
  );
  return {
    items: (result.Items as T[]) || [],
    lastKey: result.LastEvaluatedKey as Record<string, NativeAttributeValue> | undefined,
  };
}
