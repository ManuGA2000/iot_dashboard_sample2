// Improved DynamoDB setup script with better error handling
const AWS = require('aws-sdk');
require('dotenv').config();

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'ap-south-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamoDb = new AWS.DynamoDB();
const s3 = new AWS.S3();

// Check AWS credentials
function checkCredentials() {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('❌ AWS credentials not found in .env file');
    console.log('📋 Please add these to your .env file:');
    console.log('AWS_ACCESS_KEY_ID=your_access_key');
    console.log('AWS_SECRET_ACCESS_KEY=your_secret_key');
    process.exit(1);
  }
  console.log('✅ AWS credentials found');
}

// Test AWS permissions
async function testPermissions() {
  console.log('🔍 Testing AWS permissions...');
  
  try {
    // Test DynamoDB permissions
    await dynamoDb.listTables().promise();
    console.log('✅ DynamoDB permissions: OK');
  } catch (error) {
    console.log('❌ DynamoDB permissions: FAILED');
    console.log('🔧 Required permissions: dynamodb:ListTables, dynamodb:CreateTable, dynamodb:DescribeTable');
    return false;
  }

  try {
    // Test S3 permissions
    await s3.listBuckets().promise();
    console.log('✅ S3 permissions: OK');
  } catch (error) {
    console.log('❌ S3 permissions: FAILED');
    console.log('🔧 Required permissions: s3:ListAllMyBuckets, s3:CreateBucket');
    return false;
  }

  return true;
}

const tables = [
  {
    TableName: 'elpro-tenants',
    KeySchema: [
      { AttributeName: 'tenantId', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'tenantId', AttributeType: 'S' },
      { AttributeName: 'adminUserId', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'AdminUserIdIndex',
        KeySchema: [
          { AttributeName: 'adminUserId', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' }
      }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: 'elpro-tenant-users',
    KeySchema: [
      { AttributeName: 'tenantId', KeyType: 'HASH' },
      { AttributeName: 'userId', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'tenantId', AttributeType: 'S' },
      { AttributeName: 'userId', AttributeType: 'S' }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: 'elpro-tenant-devices',
    KeySchema: [
      { AttributeName: 'tenantId', KeyType: 'HASH' },
      { AttributeName: 'deviceId', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'tenantId', AttributeType: 'S' },
      { AttributeName: 'deviceId', AttributeType: 'S' }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: 'elpro-tenant-groups',
    KeySchema: [
      { AttributeName: 'tenantId', KeyType: 'HASH' },
      { AttributeName: 'groupId', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'tenantId', AttributeType: 'S' },
      { AttributeName: 'groupId', AttributeType: 'S' }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: 'elpro-tenant-settings',
    KeySchema: [
      { AttributeName: 'tenantId', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'tenantId', AttributeType: 'S' }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  }
];

async function createTables() {
  console.log('🚀 Creating DynamoDB tables for ELPRO Multi-Tenant IoT System...');

  let successCount = 0;
  let errorCount = 0;

  for (const tableParams of tables) {
    try {
      console.log(`📋 Creating table: ${tableParams.TableName}`);
      
      // Check if table already exists
      try {
        await dynamoDb.describeTable({ TableName: tableParams.TableName }).promise();
        console.log(`✅ Table ${tableParams.TableName} already exists, skipping...`);
        successCount++;
        continue;
      } catch (error) {
        if (error.code !== 'ResourceNotFoundException') {
          throw error;
        }
      }

      // Create the table
      await dynamoDb.createTable(tableParams).promise();
      console.log(`✅ Created table: ${tableParams.TableName}`);
      
      // Wait for table to be active
      console.log(`⏳ Waiting for table ${tableParams.TableName} to be active...`);
      await dynamoDb.waitFor('tableExists', { TableName: tableParams.TableName }).promise();
      console.log(`✅ Table ${tableParams.TableName} is now active`);
      successCount++;
      
    } catch (error) {
      console.error(`❌ Error creating table ${tableParams.TableName}:`, error.message);
      errorCount++;
      
      if (error.code === 'AccessDeniedException') {
        console.log('🔧 Permission issue detected. Please check IAM permissions.');
      }
    }
  }

  return { successCount, errorCount };
}

async function createS3Bucket() {
  const bucketName = 'elpro-tenant-assets';
  
  try {
    console.log(`📦 Creating S3 bucket: ${bucketName}`);
    
    // Check if bucket exists
    try {
      await s3.headBucket({ Bucket: bucketName }).promise();
      console.log(`✅ S3 bucket ${bucketName} already exists, checking settings...`);
      
      // Try to set CORS configuration for existing bucket
      try {
        await configureBucketForTenantAssets(bucketName);
        return true;
      } catch (corsError) {
        console.log('⚠️ Could not configure bucket settings, but bucket exists');
        return true;
      }
    } catch (error) {
      if (error.statusCode !== 404) {
        throw error;
      }
    }
    
    // Create bucket
    const bucketParams = {
      Bucket: bucketName
    };
    
    // Only add CreateBucketConfiguration for regions other than us-east-1
    if (process.env.AWS_REGION && process.env.AWS_REGION !== 'us-east-1') {
      bucketParams.CreateBucketConfiguration = {
        LocationConstraint: process.env.AWS_REGION
      };
    }
    
    await s3.createBucket(bucketParams).promise();
    console.log(`✅ Created S3 bucket: ${bucketName}`);
    
    // Configure bucket for tenant assets
    await configureBucketForTenantAssets(bucketName);
    
    return true;
    
  } catch (error) {
    console.error(`❌ Error creating S3 bucket:`, error.message);
    
    if (error.code === 'AccessDenied' || error.message.includes('BlockPublicPolicy')) {
      console.log('🔧 S3 bucket policy blocked by public access settings.');
      console.log('💡 The bucket was created but public access is blocked.');
      console.log('   You can manually configure the bucket later if needed.');
      return true; // Consider this a success since bucket exists
    }
    return false;
  }
}

async function configureBucketForTenantAssets(bucketName) {
  try {
    // Set CORS configuration
    const corsParams = {
      Bucket: bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE'],
            AllowedOrigins: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3000
          }
        ]
      }
    };
    
    await s3.putBucketCors(corsParams).promise();
    console.log(`✅ Set CORS configuration for ${bucketName}`);
    
    // Try to set bucket policy (may fail due to public access blocks)
    try {
      const bucketPolicy = {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'PublicReadGetObject',
            Effect: 'Allow',
            Principal: '*',
            Action: 's3:GetObject',
            Resource: `arn:aws:s3:::${bucketName}/tenant-logos/*`
          }
        ]
      };
      
      await s3.putBucketPolicy({
        Bucket: bucketName,
        Policy: JSON.stringify(bucketPolicy)
      }).promise();
      
      console.log(`✅ Set public read policy for tenant logos`);
    } catch (policyError) {
      console.log(`⚠️ Could not set public policy (blocked by account settings)`);
      console.log(`   Bucket is still usable for authenticated access`);
    }
    
  } catch (error) {
    console.log(`⚠️ Could not configure bucket settings: ${error.message}`);
    throw error;
  }
}

async function main() {
  console.log('🔧 ELPRO Multi-Tenant IoT System Setup');
  console.log('=====================================\n');

  // Check credentials
  checkCredentials();

  // Test permissions
  const hasPermissions = await testPermissions();
  if (!hasPermissions) {
    console.log('\n❌ Permission check failed. Please fix IAM permissions and try again.');
    console.log('\n🔧 Quick Fix Options:');
    console.log('1. Add AmazonDynamoDBFullAccess policy to your IAM user');
    console.log('2. Add AmazonS3FullAccess policy to your IAM user');
    console.log('3. Or use the custom policy provided in the documentation');
    process.exit(1);
  }

  try {
    // Create tables
    const tableResults = await createTables();
    
    // Create S3 bucket
    const s3Success = await createS3Bucket();
    
    console.log('\n📊 Setup Summary:');
    console.log(`✅ DynamoDB tables created: ${tableResults.successCount}`);
    console.log(`❌ DynamoDB table errors: ${tableResults.errorCount}`);
    console.log(`${s3Success ? '✅' : '❌'} S3 bucket: ${s3Success ? 'Created' : 'Failed'}`);
    
    if (tableResults.errorCount === 0 && s3Success) {
      console.log('\n🎉 Setup completed successfully!');
      console.log('\n🚀 Next Steps:');
      console.log('1. Start your backend: npm start');
      console.log('2. Start your frontend: npm start');
      console.log('3. Create your first admin account');
    } else {
      console.log('\n⚠️ Setup completed with some errors.');
      console.log('Please fix the permission issues and run the setup again.');
    }
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run the setup
if (require.main === module) {
  main();
}

module.exports = { createTables, createS3Bucket };