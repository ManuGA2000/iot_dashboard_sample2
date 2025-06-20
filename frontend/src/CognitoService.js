import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
  CognitoAccessToken,
  CognitoIdToken,
  CognitoRefreshToken,
  CognitoUserSession
} from 'amazon-cognito-identity-js';
import AWS from 'aws-sdk';
import CryptoJS from 'crypto-js';

// AWS Cognito Configuration - UPDATE WITH YOUR REAL AWS VALUES
export const AWS_CONFIG = {
  region: 'ap-south-1',
  userPoolId: 'ap-south-1_yXZ4xB5dV',
  userPoolWebClientId: '5ittg7jqt3pkc7v0ts1hb1jui3',
  clientSecret: '81n9qoc2ntes90922qqdl4jpv9pegln7h2javugr86pkviodq6d',
  // Add your AWS credentials here (for admin operations)
  accessKeyId: 'AKIA52UMIPHGBEMDSJID', // Replace with your actual access key
  secretAccessKey: '9Tuk8eLcM3hIhQQOCm4JDcLXXDGtsy2gj5biLRK+', // Replace with your actual secret key
};

// Configure AWS SDK with credentials
AWS.config.update({
  region: AWS_CONFIG.region,
  accessKeyId: AWS_CONFIG.accessKeyId,
  secretAccessKey: AWS_CONFIG.secretAccessKey,
});

const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider({
  apiVersion: '2016-04-18',
  region: AWS_CONFIG.region,
});

// Initialize DynamoDB and S3 for multi-tenant storage
const dynamoDb = new AWS.DynamoDB.DocumentClient({
  region: AWS_CONFIG.region,
});

const s3 = new AWS.S3({
  region: AWS_CONFIG.region,
});

// DynamoDB table names for multi-tenant data
const TABLES = {
  TENANTS: 'elpro-tenants',
  TENANT_USERS: 'elpro-tenant-users',
  TENANT_DEVICES: 'elpro-tenant-devices',
  TENANT_GROUPS: 'elpro-tenant-groups',
  TENANT_SETTINGS: 'elpro-tenant-settings'
};

// S3 bucket for tenant logos
const S3_BUCKET = 'elpro-tenant-assets';

// Compute SECRET_HASH using CryptoJS
function computeSecretHash(username, clientId, clientSecret) {
  const message = username + clientId;
  const hmac = CryptoJS.HmacSHA256(message, clientSecret);
  const secretHash = CryptoJS.enc.Base64.stringify(hmac);
  return secretHash;
}

// Add this helper function to format phone numbers
// Add this helper function to format phone numbers
function formatPhoneNumber(phone) {
  if (!phone || phone.trim() === '') {
    return null; // Don't include phone if empty
  }
  
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // If it starts with country code 91, use as is
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  
  // If it's 10 digits, assume Indian number and add +91
  if (cleaned.length === 10 && cleaned.match(/^[6-9]/)) {
    return `+91${cleaned}`;
  }
  
  // If it already has +91, validate format
  if (phone.startsWith('+91')) {
    const phoneDigits = phone.substring(3).replace(/\D/g, '');
    if (phoneDigits.length === 10 && phoneDigits.match(/^[6-9]/)) {
      return `+91${phoneDigits}`;
    }
  }
  
  // If it already has + but not +91, return as is (international number)
  if (phone.startsWith('+') && !phone.startsWith('+91')) {
    return phone;
  }
  
  // Invalid format
  return null;
}

// Multi-tenant helper functions
async function createTenantRecord(adminUserId, tenantData) {
  try {
    const tenantId = `tenant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const tenantRecord = {
      tenantId,
      adminUserId,
      tenantName: tenantData.tenantName || `${tenantData.username}'s Organization`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      subscription: 'basic',
      settings: {
        systemName: `${tenantData.username}'s ELPRO System`,
        awsRegion: AWS_CONFIG.region,
        theme: 'dark',
        autoRefresh: true,
        refreshInterval: 30,
        enableNotifications: true
      }
    };

    await dynamoDb.put({
      TableName: TABLES.TENANTS,
      Item: tenantRecord
    }).promise();

    console.log(`✅ Created tenant record for admin: ${adminUserId}`);
    return tenantRecord;
  } catch (error) {
    console.error('❌ Failed to create tenant record:', error);
    throw error;
  }
}

async function getTenantByAdminId(adminUserId) {
  try {
    const result = await dynamoDb.query({
      TableName: TABLES.TENANTS,
      IndexName: 'AdminUserIdIndex',
      KeyConditionExpression: 'adminUserId = :adminUserId',
      ExpressionAttributeValues: {
        ':adminUserId': adminUserId
      }
    }).promise();

    return result.Items && result.Items.length > 0 ? result.Items[0] : null;
  } catch (error) {
    console.error('❌ Failed to get tenant by admin ID:', error);
    return null;
  }
}

// Get tenant by tenant ID
async function getTenantById(tenantId) {
  try {
    const result = await dynamoDb.get({
      TableName: TABLES.TENANTS,
      Key: { tenantId }
    }).promise();

    return result.Item || null;
  } catch (error) {
    console.error('❌ Failed to get tenant by ID:', error);
    return null;
  }
}

// Replace the existing uploadLogoToS3 function with this browser-compatible version:
async function uploadLogoToS3(tenantId, logoData) {
  try {
    // Extract the base64 data and content type
    const matches = logoData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid base64 data format');
    }

    const contentType = matches[1];
    const base64Data = matches[2];
    
    // Convert base64 to Uint8Array (browser-compatible)
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Determine file extension
    const extension = contentType.split('/')[1] || 'png';
    const key = `tenant-logos/${tenantId}/logo.${extension}`;
    
    const uploadParams = {
      Bucket: S3_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      ACL: 'public-read'
    };

    console.log('📤 Uploading to S3:', { bucket: S3_BUCKET, key, contentType });
    const result = await s3.upload(uploadParams).promise();
    console.log('✅ S3 upload successful:', result.Location);
    return result.Location;
  } catch (error) {
    console.error('❌ S3 upload failed:', error);
    throw error;
  }
}

class CognitoService {
  constructor() {
    this.userPool = null;
    this.currentUser = null;
    this.currentTenant = null;
    this.initialized = false;
    this.currentSession = null; // Store session
    this.accessToken = null; // Store access token
  }

  async initialize() {
    if (this.initialized) return;
    try {
      this.userPool = new CognitoUserPool({
        UserPoolId: AWS_CONFIG.userPoolId,
        ClientId: AWS_CONFIG.userPoolWebClientId,
      });
      
      // Initialize DynamoDB tables if they don't exist
      await this.initializeTenantTables();
      
      this.initialized = true;
      console.log('✅ AWS Cognito service initialized with multi-tenant support');
      
      // Test AWS SDK configuration
      try {
        await cognitoIdentityServiceProvider.listUserPools({ MaxResults: 1 }).promise();
        console.log('✅ AWS SDK credentials configured correctly');
      } catch (credError) {
        console.warn('⚠️ AWS SDK credentials issue:', credError.message);
        console.warn('💡 Admin operations (like listing/creating users) will not work without proper AWS credentials');
      }
    } catch (error) {
      console.error('❌ Failed to initialize Cognito:', error);
      throw error;
    }
  }

  async initializeTenantTables() {
    // This would typically be done via CloudFormation or AWS CLI
    // For now, we'll assume tables exist
    console.log('📋 Multi-tenant tables initialized');
  }

async signIn(username, password) {
  try {
    await this.initialize();
    const secretHash = computeSecretHash(
      username,
      AWS_CONFIG.userPoolWebClientId,
      AWS_CONFIG.clientSecret
    );
    
    console.log('🔐 Attempting sign-in for user:', username);
    
    const params = {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: AWS_CONFIG.userPoolWebClientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
        SECRET_HASH: secretHash,
      },
    };
    
    const result = await cognitoIdentityServiceProvider.initiateAuth(params).promise();
    console.log('✅ Sign-in successful for user:', username);
    
    // Store access token and session
    this.accessToken = result.AuthenticationResult.AccessToken;
    this.currentSession = result.AuthenticationResult;
    
    // Get user attributes to determine role
    const userParams = {
      AccessToken: result.AuthenticationResult.AccessToken
    };
    
    const userInfo = await cognitoIdentityServiceProvider.getUser(userParams).promise();
    console.log('👤 Retrieved user info:', userInfo);
    
    // Extract attributes
    const attributes = {};
    userInfo.UserAttributes.forEach(attr => {
      attributes[attr.Name] = attr.Value;
    });
    
    const user = {
      username: userInfo.Username,
      email: attributes.email,
      role: attributes['custom:role'] || 'admin',
      attributes: attributes,
      sub: attributes.sub
    };

    // Create Cognito User object for later use
    this.currentUser = new CognitoUser({
      Username: username,
      Pool: this.userPool
    });

    // Create proper session objects using Cognito SDK classes
    const CognitoAccessToken = require('amazon-cognito-identity-js').CognitoAccessToken;
    const CognitoIdToken = require('amazon-cognito-identity-js').CognitoIdToken;
    const CognitoRefreshToken = require('amazon-cognito-identity-js').CognitoRefreshToken;
    const CognitoUserSession = require('amazon-cognito-identity-js').CognitoUserSession;

    const accessToken = new CognitoAccessToken({ AccessToken: result.AuthenticationResult.AccessToken });
    const idToken = new CognitoIdToken({ IdToken: result.AuthenticationResult.IdToken });
    const refreshToken = new CognitoRefreshToken({ RefreshToken: result.AuthenticationResult.RefreshToken });

    const session = new CognitoUserSession({
      IdToken: idToken,
      AccessToken: accessToken,
      RefreshToken: refreshToken
    });

    // Set session on the user object
    this.currentUser.setSignInUserSession(session);

    // FIXED: Get tenant information for ALL user types
    if (user.role === 'admin') {
      let tenant = await getTenantByAdminId(user.sub);
      if (!tenant) {
        tenant = await createTenantRecord(user.sub, user);
      }
      this.currentTenant = tenant;
      user.tenantId = tenant.tenantId;
      console.log(`🏢 Admin user associated with tenant: ${tenant.tenantId}`);
    } else {
      // FIXED: For non-admin users (supervisor/guard), get tenant from DynamoDB
      console.log(`🔍 Looking for tenant association for ${user.role}:`, username);
      
      try {
        // Query the tenant users table to find which tenant this user belongs to
        const tenantUserResult = await dynamoDb.scan({
          TableName: TABLES.TENANT_USERS,
          FilterExpression: 'username = :username',
          ExpressionAttributeValues: {
            ':username': username
          }
        }).promise();

        console.log(`📋 DynamoDB scan result for ${username}:`, tenantUserResult);

        if (tenantUserResult.Items && tenantUserResult.Items.length > 0) {
          const tenantUser = tenantUserResult.Items[0];
          const tenantId = tenantUser.tenantId;
          
          console.log(`✅ Found ${user.role} in tenant:`, tenantId);
          
          // Get the full tenant details
          const tenant = await getTenantById(tenantId);
          if (tenant) {
            this.currentTenant = tenant;
            user.tenantId = tenantId;
            console.log(`🏢 ${user.role} user associated with tenant: ${tenantId} (${tenant.tenantName})`);
            console.log(`📷 Tenant logo available: ${!!tenant.logoUrl}`);
          } else {
            console.warn(`⚠️ Tenant not found for ID: ${tenantId}`);
          }
        } else {
          console.warn(`⚠️ No tenant association found for ${user.role} user:`, username);
          console.log(`🔍 Available tenant users:`, await dynamoDb.scan({ TableName: TABLES.TENANT_USERS }).promise());
        }
      } catch (error) {
        console.error(`❌ Failed to get tenant for ${user.role}:`, error);
      }
    }
    
    return {
      success: true,
      user: user,
      tenant: this.currentTenant,
      tokens: {
        accessToken: result.AuthenticationResult.AccessToken,
        idToken: result.AuthenticationResult.IdToken,
        refreshToken: result.AuthenticationResult.RefreshToken,
      },
    };
  } catch (error) {
    console.error('❌ SignIn error:', error);
    
    if (error.code === 'NotAuthorizedException') {
      return {
        success: false,
        error: 'Invalid username or password. Please check your credentials.',
      };
    }
    if (error.code === 'UserNotConfirmedException') {
      return {
        success: false,
        error: 'Account not verified. Please check your email for verification link and confirm your account.',
        needsConfirmation: true,
        username: username
      };
    }
    if (error.code === 'InvalidParameterException') {
      return {
        success: false,
        error: `Invalid parameters: ${error.message}`,
      };
    }
    if (error.code === 'UserNotFoundException') {
      return {
        success: false,
        error: 'User not found. Please check your username or create an account.',
      };
    }
    
    return {
      success: false,
      error: error.message || 'An error occurred during sign-in.',
    };
  }
}

  async signUp(email, password, username, role = 'admin') {
    try {
      await this.initialize();
      const secretHash = computeSecretHash(
        username,
        AWS_CONFIG.userPoolWebClientId,
        AWS_CONFIG.clientSecret
      );
      
      console.log('📝 Creating new admin user:', { username, email, role });
      
      const params = {
        ClientId: AWS_CONFIG.userPoolWebClientId,
        Username: username,
        Password: password,
        SecretHash: secretHash,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'custom:role', Value: role },
        ],
      };
      
      const result = await cognitoIdentityServiceProvider.signUp(params).promise();
      console.log('✅ User created successfully:', result);
      
      // For admin users, create tenant record after successful signup
      if (role === 'admin' && result.UserSub) {
        try {
          const tenant = await createTenantRecord(result.UserSub, {
            username,
            email,
            tenantName: `${username}'s Organization`
          });
          console.log(`🏢 Created tenant for new admin: ${tenant.tenantId}`);
        } catch (tenantError) {
          console.warn('⚠️ Failed to create tenant record:', tenantError);
        }
      }
      
      return {
        success: true,
        user: {
          username: result.User?.Username || username,
          email: email,
          role: role,
          attributes: { email },
          userStatus: result.UserConfirmed ? 'CONFIRMED' : 'UNCONFIRMED',
          sub: result.UserSub || null,
        },
        message: result.UserConfirmed 
          ? 'Admin account created and confirmed successfully. You can now sign in and manage your organization.' 
          : 'Admin account created successfully. Please check email for verification.',
        needsConfirmation: !result.UserConfirmed
      };
    } catch (error) {
      console.error('❌ SignUp error:', error);
      
      if (error.code === 'UsernameExistsException') {
        return {
          success: false,
          error: 'This username is already taken. Please choose a different username.',
        };
      }
      if (error.code === 'InvalidParameterException') {
        return {
          success: false,
          error: `Invalid parameters: ${error.message}`,
        };
      }
      if (error.code === 'InvalidPasswordException') {
        return {
          success: false,
          error: 'Password does not meet requirements. Please ensure it has at least 8 characters with uppercase, lowercase, and numbers.',
        };
      }
      
      return {
        success: false,
        error: error.message || 'An error occurred during signup.',
      };
    }
  }

async getCurrentUser() {
  try {
    const cognitoUser = this.userPool.getCurrentUser();

    if (!cognitoUser) {
      return { success: false, error: 'No user session found' };
    }

    return new Promise((resolve) => {
      cognitoUser.getSession(async (err, session) => {
        if (err || !session.isValid()) {
          resolve({ success: false, error: 'Session invalid' });
          return;
        }

        // Store session and user
        this.currentSession = session;
        this.currentUser = cognitoUser;
        this.accessToken = session.getAccessToken().getJwtToken();

        cognitoUser.getUserAttributes(async (err, attributes) => {
          if (err) {
            resolve({ success: false, error: err.message });
            return;
          }

          const userAttributes = {};
          attributes.forEach((attr) => {
            userAttributes[attr.getName()] = attr.getValue();
          });

          const user = {
            username: cognitoUser.getUsername(),
            email: userAttributes.email,
            role: userAttributes['custom:role'] || 'admin',
            attributes: userAttributes,
            sub: userAttributes.sub
          };

          // FIXED: Get tenant information for ALL user types
          if (user.role === 'admin') {
            const tenant = await getTenantByAdminId(user.sub);
            if (tenant) {
              this.currentTenant = tenant;
              user.tenantId = tenant.tenantId;
              console.log(`🏢 Admin session restored with tenant: ${tenant.tenantId}`);
            }
          } else {
            // FIXED: For non-admin users, get tenant from DynamoDB tenant users table
            try {
              console.log(`🔍 Restoring session for ${user.role}:`, user.username);
              
              const tenantUserResult = await dynamoDb.scan({
                TableName: TABLES.TENANT_USERS,
                FilterExpression: 'username = :username',
                ExpressionAttributeValues: {
                  ':username': user.username
                }
              }).promise();

              console.log(`📋 Session restore - DynamoDB result for ${user.username}:`, tenantUserResult);

              if (tenantUserResult.Items && tenantUserResult.Items.length > 0) {
                const tenantUser = tenantUserResult.Items[0];
                const tenantId = tenantUser.tenantId;
                
                console.log(`✅ Session restore - Found ${user.role} in tenant:`, tenantId);
                
                const tenant = await getTenantById(tenantId);
                if (tenant) {
                  this.currentTenant = tenant;
                  user.tenantId = tenantId;
                  console.log(`🏢 ${user.role} session restored with tenant: ${tenantId} (${tenant.tenantName})`);
                  console.log(`📷 Tenant logo available: ${!!tenant.logoUrl}`);
                } else {
                  console.warn(`⚠️ Tenant not found during session restore for ID: ${tenantId}`);
                }
              } else {
                console.warn(`⚠️ No tenant association found during session restore for ${user.role}:`, user.username);
              }
            } catch (error) {
              console.error(`❌ Failed to restore tenant for ${user.role}:`, error);
            }
          }

          resolve({
            success: true,
            user: user,
            tenant: this.currentTenant
          });
        });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
}


// Add this method to the CognitoService class

async adminSetUserPassword(username, password) {
  try {
    if (!AWS_CONFIG.accessKeyId || AWS_CONFIG.accessKeyId === 'YOUR_AWS_ACCESS_KEY_ID') {
      throw new Error('AWS credentials not configured for admin operations');
    }

    await cognitoIdentityServiceProvider.adminSetUserPassword({
      UserPoolId: AWS_CONFIG.userPoolId,
      Username: username,
      Password: password,
      Permanent: true,
    }).promise();

    console.log('✅ Password set successfully for user:', username);
    return { success: true, message: 'Password updated successfully' };
  } catch (error) {
    console.error('❌ Error setting user password:', error);
    return { success: false, error: error.message };
  }
}

  async signOut() {
    try {
      if (this.currentUser) {
        this.currentUser.signOut();
        this.currentUser = null;
      }

      const cognitoUser = this.userPool.getCurrentUser();
      if (cognitoUser) {
        cognitoUser.signOut();
      }

      // Clear stored session data
      this.currentSession = null;
      this.accessToken = null;
      this.currentTenant = null;
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

async listUsers(currentUserData = null) {
  try {
    console.log('📋 Attempting to list users for tenant...');
    
    if (!this.currentTenant) {
      throw new Error('No tenant context. Please sign in as admin first.');
    }

    // Get tenant users from DynamoDB
    const tenantUsers = await dynamoDb.query({
      TableName: TABLES.TENANT_USERS,
      KeyConditionExpression: 'tenantId = :tenantId',
      ExpressionAttributeValues: {
        ':tenantId': this.currentTenant.tenantId
      }
    }).promise();

    // Extract admin username and email from the passed currentUser data
    let adminUsername = 'admin'; // fallback
    let adminEmail = 'admin@example.com'; // fallback
    
    if (currentUserData) {
      adminUsername = currentUserData.username || adminUsername;
      adminEmail = currentUserData.email || adminEmail;
      console.log('✅ Got admin data from passed currentUser:', { adminUsername, adminEmail });
    }
    // Try to get from this.currentUser (Cognito user object) as fallback
    else if (this.currentUser) {
      if (this.currentUser.getUsername) {
        adminUsername = this.currentUser.getUsername();
        adminEmail = this.currentUser.attributes?.email || adminEmail;
      } else if (this.currentUser.username) {
        adminUsername = this.currentUser.username;
        adminEmail = this.currentUser.email || adminEmail;
      }
      console.log('✅ Got admin data from this.currentUser:', { adminUsername, adminEmail });
    }
    // Try to get from tenant data as last resort
    else if (this.currentTenant) {
      adminUsername = this.currentTenant.adminUsername || adminUsername;
      adminEmail = this.currentTenant.adminEmail || adminEmail;
      console.log('✅ Got admin data from currentTenant:', { adminUsername, adminEmail });
    }

    console.log('👤 Final admin data:', { adminUsername, adminEmail });

    // Construct admin user
    const adminUser = {
      username: adminUsername,
      email: adminEmail,
      role: 'admin',
      status: 'CONFIRMED',
      createdDate: this.currentTenant.createdAt,
      attributes: {
        email: adminEmail,
        'custom:role': 'admin',
        phone_number: currentUserData?.phone || this.currentUser?.attributes?.phone_number || '',
        sub: currentUserData?.attributes?.sub || this.currentUser?.attributes?.sub || ''
      }
    };

    // Combine admin user with tenant users
    const users = [adminUser, ...tenantUsers.Items.map(user => ({
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status || 'CONFIRMED',
      createdDate: user.createdAt,
      attributes: user.attributes || {}
    }))];

    console.log('✅ Users loaded successfully:', users.length);
    console.log('👤 Final admin user:', adminUser);

    return {
      success: true,
      users,
    };
  } catch (error) {
    console.error('❌ Error listing users:', error);
    
    if (error.code === 'CredentialsError' || error.message.includes('Missing credentials')) {
      return {
        success: false,
        error: 'AWS credentials not configured. Admin operations require AWS Access Key ID and Secret Access Key. Please configure them in AWS_CONFIG.',
      };
    }
    
    return {
      success: false,
      error: error.message,
    };
  }
}

async updateUserAttributes(username, attributes) {
  try {
    // Check if we have a current authenticated user
    if (!this.currentUser || !this.accessToken) {
      throw new Error('No authenticated user session found');
    }

    console.log('🔄 Updating user attributes for:', username);
    console.log('📝 Attributes to update:', attributes);

    // FIXED: Format phone number properly before sending to Cognito
    const formattedAttributes = { ...attributes };
    
    if (formattedAttributes.phone_number) {
      const phoneValue = formattedAttributes.phone_number.trim();
      
      if (phoneValue === '') {
        // If empty phone, remove the attribute entirely
        delete formattedAttributes.phone_number;
        console.log('📞 Removing empty phone number');
      } else {
        // Format the phone number properly
        const formattedPhone = formatPhoneNumber(phoneValue);
        if (!formattedPhone) {
          throw new Error('Invalid phone number format. Please use +91xxxxxxxxxx or 10-digit format.');
        }
        formattedAttributes.phone_number = formattedPhone;
        console.log('📞 Formatted phone number:', formattedPhone);
      }
    }

    // For updating current user's own attributes
    if (username === this.currentUser.getUsername()) {
      const attributeList = Object.keys(formattedAttributes).map((key) =>
        new CognitoUserAttribute({ Name: key, Value: formattedAttributes[key].toString() })
      );

      return new Promise((resolve) => {
        this.currentUser.updateAttributes(attributeList, (err, result) => {
          if (err) {
            console.error('❌ Update attributes error:', err);
            resolve({ success: false, error: err.message });
            return;
          }
          console.log('✅ User attributes updated successfully');
          resolve({ success: true, message: 'User attributes updated successfully' });
        });
      });
    } else {
      // For admin updating other users (requires AWS credentials)
      if (!AWS_CONFIG.accessKeyId || AWS_CONFIG.accessKeyId === 'YOUR_AWS_ACCESS_KEY_ID') {
        throw new Error('AWS credentials not configured for admin operations');
      }

      const userAttributes = Object.keys(formattedAttributes).map(key => ({
        Name: key,
        Value: formattedAttributes[key].toString()
      }));

      await cognitoIdentityServiceProvider.adminUpdateUserAttributes({
        UserPoolId: AWS_CONFIG.userPoolId,
        Username: username,
        UserAttributes: userAttributes
      }).promise();

      console.log('✅ User attributes updated via admin operation');
      return { success: true, message: 'User attributes updated successfully' };
    }
  } catch (error) {
    console.error('❌ Error updating user attributes:', error);
    return { success: false, error: error.message };
  }
}

  async changePassword(oldPassword, newPassword) {
    try {
      if (!this.currentUser || !this.accessToken) {
        throw new Error('No authenticated user session found');
      }

      if (newPassword.length < 8) {
        throw new Error('New password must be at least 8 characters long');
      }
      if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
        throw new Error('Password must contain uppercase, lowercase, and number');
      }

      return new Promise((resolve) => {
        this.currentUser.changePassword(oldPassword, newPassword, (err, result) => {
          if (err) {
            console.error('❌ Change password error:', err);
            resolve({ success: false, error: err.message });
            return;
          }
          console.log('✅ Password changed successfully');
          resolve({ success: true, message: 'Password changed successfully' });
        });
      });
    } catch (error) {
      console.error('❌ Error changing password:', error);
      return { success: false, error: error.message };
    }
  }

async createUserByAdmin(username, email, password, role, attributes = {}) {
  try {
    console.log('👤 Creating user by admin for tenant:', this.currentTenant?.tenantId);
    
    if (!this.currentTenant) {
      throw new Error('No tenant context. Please sign in as admin first.');
    }
    
    // Check if AWS credentials are configured
    if (!AWS_CONFIG.accessKeyId || AWS_CONFIG.accessKeyId === 'YOUR_AWS_ACCESS_KEY_ID') {
      throw new Error('AWS credentials not configured. Please set your AWS Access Key ID and Secret Access Key in AWS_CONFIG.');
    }
    
    // Build user attributes for Cognito - REMOVE custom:tenantId since it's not in schema
    const userAttributes = [
      { Name: 'email', Value: email },
      { Name: 'custom:role', Value: role },
      // REMOVED: { Name: 'custom:tenantId', Value: this.currentTenant.tenantId }, - This causes the error
      { Name: 'email_verified', Value: 'true' },
    ];
    
    // Add phone number only if provided and valid
    if (attributes.phone_number) {
      const formattedPhone = formatPhoneNumber(attributes.phone_number);
      if (formattedPhone) {
        userAttributes.push({ Name: 'phone_number', Value: formattedPhone });
        userAttributes.push({ Name: 'phone_number_verified', Value: 'false' });
      }
    }
    
    const params = {
      UserPoolId: AWS_CONFIG.userPoolId,
      Username: username,
      TemporaryPassword: password,
      UserAttributes: userAttributes,
      DesiredDeliveryMediums: ['EMAIL'],
      MessageAction: 'SUPPRESS',
    };

    console.log('📞 Creating user with tenant context:', this.currentTenant.tenantId);

    const result = await cognitoIdentityServiceProvider.adminCreateUser(params).promise();
    console.log('✅ User created by admin:', result);

    // Set permanent password
    await cognitoIdentityServiceProvider
      .adminSetUserPassword({
        UserPoolId: AWS_CONFIG.userPoolId,
        Username: username,
        Password: password,
        Permanent: true,
      })
      .promise();

   // Store user in tenant-specific table
const tenantUser = {
  tenantId: this.currentTenant.tenantId,
  userId: `${this.currentTenant.tenantId}_${username}`,
  username,
  email,
  role,
  status: result.User.UserStatus,
  createdAt: new Date().toISOString(),
  createdBy: this.currentUser?.getUsername(),
  attributes: {
    email,
    'custom:role': role,
    tenantId: this.currentTenant.tenantId, // Store tenant association
    phone_number: attributes.phone_number || '',
  },
};

await dynamoDb.put({
  TableName: TABLES.TENANT_USERS,
  Item: tenantUser
}).promise();

console.log('✅ User stored in tenant table:', tenantUser.userId);

    const user = {
      username: result.User.Username,
      email,
      role,
      status: result.User.UserStatus,
      createdDate: result.User.UserCreateDate.toISOString(),
      tenantId: this.currentTenant.tenantId,
      attributes: tenantUser.attributes,
    };

    return {
      success: true,
      user,
      message: 'User created successfully for your organization',
    };
  } catch (error) {
    console.error('❌ Error creating user by admin:', error);
    
    if (error.code === 'CredentialsError' || error.message.includes('Missing credentials')) {
      return {
        success: false,
        error: 'AWS credentials not configured. Admin operations require AWS Access Key ID and Secret Access Key.',
      };
    }
    
    if (error.code === 'UsernameExistsException') {
      return {
        success: false,
        error: 'Username already exists. Please choose a different username.',
      };
    }
    
    if (error.code === 'InvalidParameterException') {
      if (error.message.includes('phone')) {
        return {
          success: false,
          error: 'Invalid phone number format. Please use format: +91xxxxxxxxxx or 10-digit number.',
        };
      }
      return {
        success: false,
        error: `Invalid parameters: ${error.message}`,
      };
    }
    
    return {
      success: false,
      error: error.message,
    };
  }
}

  async deleteUser(username) {
    try {
      console.log('🗑️ Deleting user from tenant:', this.currentTenant?.tenantId);
      
      if (!this.currentTenant) {
        throw new Error('No tenant context. Please sign in as admin first.');
      }
      
      // Check if AWS credentials are configured
      if (!AWS_CONFIG.accessKeyId || AWS_CONFIG.accessKeyId === 'YOUR_AWS_ACCESS_KEY_ID') {
        throw new Error('AWS credentials not configured. Please set your AWS Access Key ID and Secret Access Key in AWS_CONFIG.');
      }
      
      // Delete from Cognito
      const params = {
        UserPoolId: AWS_CONFIG.userPoolId,
        Username: username,
      };

await cognitoIdentityServiceProvider.adminDeleteUser(params).promise();

      // Delete from tenant users table
      await dynamoDb.delete({
        TableName: TABLES.TENANT_USERS,
        Key: {
          tenantId: this.currentTenant.tenantId,
          userId: `${this.currentTenant.tenantId}_${username}`
        }
      }).promise();

      console.log('✅ User deleted successfully from tenant:', username);

      return {
        success: true,
        message: 'User deleted successfully from your organization',
      };
    } catch (error) {
      console.error('❌ Error deleting user:', error);
      
      if (error.code === 'CredentialsError' || error.message.includes('Missing credentials')) {
        return {
          success: false,
          error: 'AWS credentials not configured. Admin operations require AWS Access Key ID and Secret Access Key.',
        };
      }
      
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Multi-tenant specific methods
 async getTenantSettings() {
  try {
    if (!this.currentTenant) {
      throw new Error('No tenant context');
    }

    const result = await dynamoDb.get({
      TableName: TABLES.TENANT_SETTINGS,
      Key: { tenantId: this.currentTenant.tenantId }
    }).promise();

    return result.Item?.settings || this.currentTenant.settings || {
      systemName: this.currentTenant.tenantName || 'ELPRO IoT Control System',
      awsRegion: AWS_CONFIG.region,
      autoRefresh: true,
      refreshInterval: 30,
      enableNotifications: true,
      theme: 'dark'
    };
  } catch (error) {
    console.error('❌ Error getting tenant settings:', error);
    return {
      systemName: this.currentTenant?.tenantName || 'ELPRO IoT Control System',
      awsRegion: AWS_CONFIG.region,
      autoRefresh: true,
      refreshInterval: 30,
      enableNotifications: true,
      theme: 'dark'
    };
  }
}

async updateTenantSettings(settings) {
  try {
    if (!this.currentTenant) {
      throw new Error('No tenant context');
    }

    console.log('💾 Updating tenant settings for:', this.currentTenant.tenantId);

    await dynamoDb.put({
      TableName: TABLES.TENANT_SETTINGS,
      Item: {
        tenantId: this.currentTenant.tenantId,
        settings,
        updatedAt: new Date().toISOString(),
        updatedBy: this.currentUser?.getUsername()
      }
    }).promise();

    // Also update tenant record if systemName changed
    if (settings.systemName !== this.currentTenant.tenantName) {
      await dynamoDb.update({
        TableName: TABLES.TENANTS,
        Key: { tenantId: this.currentTenant.tenantId },
        UpdateExpression: 'SET tenantName = :tenantName, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':tenantName': settings.systemName,
          ':updatedAt': new Date().toISOString()
        }
      }).promise();

      // Update local tenant reference
      this.currentTenant.tenantName = settings.systemName;
    }

    console.log('✅ Tenant settings updated successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ Error updating tenant settings:', error);
    return { success: false, error: error.message };
  }
}

async uploadTenantLogo(logoData) {
  try {
    if (!this.currentTenant) {
      throw new Error('No tenant context');
    }

    console.log('📷 Uploading logo for tenant:', this.currentTenant.tenantId);

    // For now, store logo as base64 in DynamoDB (for S3 implementation, use uploadLogoToS3)
    // In production, you'd want to use S3 for better performance
    
    await dynamoDb.update({
      TableName: TABLES.TENANTS,
      Key: { tenantId: this.currentTenant.tenantId },
      UpdateExpression: 'SET logoUrl = :logoUrl, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':logoUrl': logoData, // In production, this would be S3 URL
        ':updatedAt': new Date().toISOString()
      }
    }).promise();

    this.currentTenant.logoUrl = logoData;

    console.log('✅ Tenant logo uploaded successfully');
    return { success: true, logoUrl: logoData };
  } catch (error) {
    console.error('❌ Error uploading tenant logo:', error);
    return { success: false, error: error.message };
  }
}

 async getTenantLogo() {
  try {
    if (!this.currentTenant || !this.currentTenant.logoUrl) {
      return null;
    }
    return this.currentTenant.logoUrl;
  } catch (error) {
    console.error('❌ Error getting tenant logo:', error);
    return null;
  }
}

  getCurrentTenant() {
    return this.currentTenant;
  }

  async confirmSignUp(username, code) {
    try {
      await this.initialize();
      const secretHash = computeSecretHash(
        username,
        AWS_CONFIG.userPoolWebClientId,
        AWS_CONFIG.clientSecret
      );
      
      console.log('✅ Confirming signup for user:', username);
      
      const params = {
        ClientId: AWS_CONFIG.userPoolWebClientId,
        Username: username,
        ConfirmationCode: code,
        SecretHash: secretHash,
      };

      const result = await cognitoIdentityServiceProvider.confirmSignUp(params).promise();
      console.log('✅ Account confirmed successfully:', result);
      
      return { 
        success: true, 
        message: 'Account confirmed successfully. You can now sign in and manage your organization.' 
      };
    } catch (error) {
      console.error('❌ Error confirming signup:', error);
      
      if (error.code === 'CodeMismatchException') {
        return { 
          success: false, 
          error: 'Invalid verification code. Please check and try again.' 
        };
      }
      if (error.code === 'ExpiredCodeException') {
      return { 
         success: false, 
         error: 'Verification code has expired. Please request a new code.' 
       };
     }
     if (error.code === 'NotAuthorizedException') {
       return { 
         success: false, 
         error: 'User is already confirmed or verification failed.' 
       };
     }
     
     return { 
       success: false, 
       error: error.message || 'Failed to confirm account'
     };
   }
 }

 async resendConfirmationCode(username) {
   try {
     await this.initialize();
     const secretHash = computeSecretHash(
       username,
       AWS_CONFIG.userPoolWebClientId,
       AWS_CONFIG.clientSecret
     );
     
     console.log('📧 Resending confirmation code for user:', username);
     
     const params = {
       ClientId: AWS_CONFIG.userPoolWebClientId,
       Username: username,
       SecretHash: secretHash,
     };

     const result = await cognitoIdentityServiceProvider.resendConfirmationCode(params).promise();
     console.log('✅ Confirmation code sent:', result);
     
     return { 
       success: true, 
       message: 'Verification code sent to your email' 
     };
   } catch (error) {
     console.error('❌ Error resending confirmation code:', error);
     
     if (error.code === 'InvalidParameterException') {
       return { 
         success: false, 
         error: 'User is already confirmed or invalid request.' 
       };
     }
     if (error.code === 'LimitExceededException') {
       return { 
         success: false, 
         error: 'Too many requests. Please wait before requesting another code.' 
       };
     }
     
     return { 
       success: false, 
       error: error.message || 'Failed to resend confirmation code'
     };
   }
 }
}

const cognitoService = new CognitoService();

export default cognitoService;