import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
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
  // Alternative: Use temporary credentials or IAM roles in production
});

const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider({
  apiVersion: '2016-04-18',
  region: AWS_CONFIG.region,
});

// Compute SECRET_HASH using CryptoJS
function computeSecretHash(username, clientId, clientSecret) {
  const message = username + clientId;
  const hmac = CryptoJS.HmacSHA256(message, clientSecret);
  const secretHash = CryptoJS.enc.Base64.stringify(hmac);
  return secretHash;
}


// Add this helper function to format phone numbers
function formatPhoneNumber(phone) {
  if (!phone || phone.trim() === '') {
    return null; // Don't include phone if empty
  }
  
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // If it starts with country code, use as is
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  
  // If it's 10 digits, assume Indian number and add +91
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  
  // If it already has +, use as is
  if (phone.startsWith('+')) {
    return phone;
  }
  
  // Default: add +91 for Indian numbers
  return `+91${cleaned}`;
}

class CognitoService {
  constructor() {
    this.userPool = null;
    this.currentUser = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    try {
      this.userPool = new CognitoUserPool({
        UserPoolId: AWS_CONFIG.userPoolId,
        ClientId: AWS_CONFIG.userPoolWebClientId,
      });
      this.initialized = true;
      console.log('✅ AWS Cognito service initialized');
      
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
      
      return {
        success: true,
        user: {
          username: userInfo.Username,
          email: attributes.email,
          role: attributes['custom:role'] || 'admin',
          attributes: attributes
        },
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
      
      console.log('📝 Creating new user:', { username, email, role });
      
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
          ? 'User created and confirmed successfully. You can now sign in.' 
          : 'User created successfully. Please check email for verification.',
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
        cognitoUser.getSession((err, session) => {
          if (err || !session.isValid()) {
            resolve({ success: false, error: 'Session invalid' });
            return;
          }

          cognitoUser.getUserAttributes((err, attributes) => {
            if (err) {
              resolve({ success: false, error: err.message });
              return;
            }

            const userAttributes = {};
            attributes.forEach((attr) => {
              userAttributes[attr.getName()] = attr.getValue();
            });

            this.currentUser = cognitoUser;
            resolve({
              success: true,
              user: {
                username: cognitoUser.getUsername(),
                email: userAttributes.email,
                role: userAttributes['custom:role'] || 'admin',
                attributes: userAttributes,
              },
            });
          });
        });
      });
    } catch (error) {
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

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async listUsers() {
    try {
      console.log('📋 Attempting to list users...');
      
      // Check if AWS credentials are configured
      if (!AWS_CONFIG.accessKeyId || AWS_CONFIG.accessKeyId === 'YOUR_AWS_ACCESS_KEY_ID') {
        throw new Error('AWS credentials not configured. Please set your AWS Access Key ID and Secret Access Key in AWS_CONFIG.');
      }
      
      const params = {
        UserPoolId: AWS_CONFIG.userPoolId,
        Limit: 60, // Max users to fetch
      };

      const data = await cognitoIdentityServiceProvider.listUsers(params).promise();
      console.log('✅ Users retrieved successfully:', data.Users.length);

      const users = data.Users.map((user) => {
        const attributes = {};
        user.Attributes.forEach((attr) => {
          attributes[attr.Name] = attr.Value;
        });

        return {
          username: user.Username,
          email: attributes.email || '',
          role: attributes['custom:role'] || 'admin',
          status: user.UserStatus,
          createdDate: user.UserCreateDate.toISOString(),
          attributes,
        };
      });

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
      if (!this.currentUser) {
        throw new Error('No authenticated user');
      }

      const attributeList = Object.keys(attributes).map((key) =>
        new CognitoUserAttribute({ Name: key, Value: attributes[key].toString() })
      );

      return new Promise((resolve) => {
        this.currentUser.updateAttributes(attributeList, (err, result) => {
          if (err) {
            resolve({ success: false, error: err.message });
            return;
          }
          resolve({ success: true, message: 'User attributes updated successfully' });
        });
      });
    } catch (error) {
      console.error('Error updating user attributes:', error);
      return { success: false, error: error.message };
    }
  }

  async changePassword(oldPassword, newPassword) {
    try {
      if (!this.currentUser) {
        throw new Error('No authenticated user');
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
            resolve({ success: false, error: err.message });
            return;
          }
          resolve({ success: true, message: 'Password changed successfully' });
        });
      });
    } catch (error) {
      console.error('Error changing password:', error);
      return { success: false, error: error.message };
    }
  }



// Updated createUserByAdmin method
async createUserByAdmin(username, email, password, role, attributes = {}) {
  try {
    console.log('👤 Creating user by admin:', { username, email, role });
    
    // Check if AWS credentials are configured
    if (!AWS_CONFIG.accessKeyId || AWS_CONFIG.accessKeyId === 'YOUR_AWS_ACCESS_KEY_ID') {
      throw new Error('AWS credentials not configured. Please set your AWS Access Key ID and Secret Access Key in AWS_CONFIG.');
    }
    
    // Build user attributes - only use attributes that exist in schema
    const userAttributes = [
      { Name: 'email', Value: email },
      { Name: 'custom:role', Value: role },
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
    
    // SIMPLIFIED: Only use standard and known custom attributes
    // Removed department and other custom attributes to avoid schema errors
    
    const params = {
      UserPoolId: AWS_CONFIG.userPoolId,
      Username: username,
      TemporaryPassword: password,
      UserAttributes: userAttributes,
      DesiredDeliveryMediums: ['EMAIL'],
      MessageAction: 'SUPPRESS', // Don't send welcome email
    };

    console.log('📞 Creating user with attributes:', userAttributes.map(attr => ({ name: attr.Name, value: attr.Name === 'phone_number' ? attr.Value : '[hidden]' })));

    const result = await cognitoIdentityServiceProvider.adminCreateUser(params).promise();
    console.log('✅ User created by admin:', result);

    const user = {
      username: result.User.Username,
      email,
      role,
      status: result.User.UserStatus,
      createdDate: result.User.UserCreateDate.toISOString(),
      attributes: {
        email,
        'custom:role': role,
        phone_number: attributes.phone_number || '',
      },
    };

    // Set permanent password
    await cognitoIdentityServiceProvider
      .adminSetUserPassword({
        UserPoolId: AWS_CONFIG.userPoolId,
        Username: username,
        Password: password,
        Permanent: true,
      })
      .promise();

    console.log('✅ Password set as permanent for user:', username);

    return {
      success: true,
      user,
      message: 'User created successfully by admin',
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
      if (error.message.includes('schema') || error.message.includes('not defined')) {
        return {
          success: false,
          error: 'Custom attribute not defined in User Pool schema. Using simplified attributes.',
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
      console.log('🗑️ Deleting user:', username);
      
      // Check if AWS credentials are configured
      if (!AWS_CONFIG.accessKeyId || AWS_CONFIG.accessKeyId === 'YOUR_AWS_ACCESS_KEY_ID') {
        throw new Error('AWS credentials not configured. Please set your AWS Access Key ID and Secret Access Key in AWS_CONFIG.');
      }
      
      const params = {
        UserPoolId: AWS_CONFIG.userPoolId,
        Username: username,
      };

      await cognitoIdentityServiceProvider.adminDeleteUser(params).promise();
      console.log('✅ User deleted successfully:', username);

      return {
        success: true,
        message: 'User deleted successfully',
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
        message: 'Account confirmed successfully. You can now sign in.' 
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