const express = require('express');
const cors = require('cors');
const http = require('http');
const AWS = require('aws-sdk');
const mqtt = require('mqtt');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;
const WS_PORT = process.env.WS_PORT || 5001;

// Enhanced CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://localhost:3002'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with', 'X-Tenant-ID'],
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'ap-south-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

// Initialize DynamoDB for multi-tenant data
const dynamoDb = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || 'ap-south-1'
});

// S3 for tenant assets
const s3 = new AWS.S3({
  region: process.env.AWS_REGION || 'ap-south-1'
});

// DynamoDB table names
const TABLES = {
  TENANTS: 'elpro-tenants',
  TENANT_DEVICES: 'elpro-tenant-devices',
  TENANT_GROUPS: 'elpro-tenant-groups',
  TENANT_SETTINGS: 'elpro-tenant-settings',
  TENANT_ACTIVITY: 'elpro-tenant-activity'
};

const iot = new AWS.Iot();
let iotData = null;
let iotEndpoint = null;
let shadowClient = null;

// WebSocket server with tenant context
const wss = new WebSocket.Server({ port: WS_PORT });
const tenantClients = new Map(); // Map tenant IDs to client sets

// MQTT client
let mqttClient = null;
let awsConnectionStatus = 'disconnected';
let mqttConnectionStatus = 'disconnected';

// Enhanced in-memory storage with tenant separation
const tenantAwsThings = new Map(); // tenantId -> Map of devices
const tenantDeviceStatus = new Map(); // tenantId -> Map of device status
const tenantGroups = new Map(); // tenantId -> Map of groups
const tenantStatusHistory = new Map(); // tenantId -> Array of status history

// FIXED: Enhanced device tracking for proper status management with tenant context
const subscribedTopics = new Set();
const tenantDeviceLastConnection = new Map(); // tenantId -> Map of device -> timestamp
const tenantDeviceLastRelayStatus = new Map(); // tenantId -> Map of device -> timestamp
const tenantDeviceLastAck = new Map(); // tenantId -> Map of device -> timestamp
const tenantDeviceConnectedToAWS = new Map(); // tenantId -> Map of device -> boolean
const tenantStatusCheckIntervals = new Map(); // tenantId -> Map of device -> intervalId

// FIXED: Constants for status timing
const OFFLINE_TIMEOUT = 20 * 60 * 1000; // 20 minutes
const RELAY_STATUS_TIMEOUT = 2 * 60 * 1000; // 2 minutes for active status
const CONNECTION_CHECK_INTERVAL = 10 * 1000;
const STATUS_CHECK_INTERVAL = 30 * 1000;

// Multi-tenant helper functions
function getTenantDevices(tenantId) {
  if (!tenantAwsThings.has(tenantId)) {
    tenantAwsThings.set(tenantId, new Map());
  }
  return tenantAwsThings.get(tenantId);
}

function getTenantDeviceStatus(tenantId) {
  if (!tenantDeviceStatus.has(tenantId)) {
    tenantDeviceStatus.set(tenantId, new Map());
  }
  return tenantDeviceStatus.get(tenantId);
}

function getTenantGroups(tenantId) {
  if (!tenantGroups.has(tenantId)) {
    tenantGroups.set(tenantId, new Map());
  }
  return tenantGroups.get(tenantId);
}

function getTenantStatusHistory(tenantId) {
  if (!tenantStatusHistory.has(tenantId)) {
    tenantStatusHistory.set(tenantId, []);
  }
  return tenantStatusHistory.get(tenantId);
}

function getTenantClients(tenantId) {
  if (!tenantClients.has(tenantId)) {
    tenantClients.set(tenantId, new Set());
  }
  return tenantClients.get(tenantId);
}

// Middleware to extract tenant context
function extractTenantContext(req, res, next) {
  const tenantId = req.headers['x-tenant-id'] || req.body?.tenantId || req.query?.tenantId;
  req.tenantId = tenantId;
  next();
}

app.use(extractTenantContext);

// FIXED: Enhanced device status calculation with tenant context
function calculateDeviceStatus(tenantId, deviceId) {
  const now = Date.now();

  // Get tenant-specific maps
  const deviceLastConnection = tenantDeviceLastConnection.get(tenantId) || new Map();
  const deviceLastRelayStatus = tenantDeviceLastRelayStatus.get(tenantId) || new Map();
  const deviceLastAck = tenantDeviceLastAck.get(tenantId) || new Map();
  const deviceConnectedToAWS = tenantDeviceConnectedToAWS.get(tenantId) || new Map();

  const lastConnection = deviceLastConnection.get(deviceId) || 0;
  const lastRelayStatus = deviceLastRelayStatus.get(deviceId) || 0;
  const lastAck = deviceLastAck.get(deviceId) || 0;
  const isConnectedToAWS = deviceConnectedToAWS.get(deviceId) || false;

  console.log(`📊 Status check for tenant ${tenantId} device ${deviceId}:`);
  console.log(`   - lastConnection: ${new Date(lastConnection).toLocaleTimeString()}`);
  console.log(`   - lastRelayStatus: ${new Date(lastRelayStatus).toLocaleTimeString()}`);
  console.log(`   - lastAck: ${new Date(lastAck).toLocaleTimeString()}`);
  console.log(`   - awsConnected: ${isConnectedToAWS}`);

  // OFFLINE: No connection status for more than 20 minutes
  if (now - lastConnection > OFFLINE_TIMEOUT) {
    console.log(`📴 Tenant ${tenantId} device ${deviceId} is OFFLINE - no connection for ${Math.round((now - lastConnection) / 60000)} minutes`);
    return 'offline';
  }

  // Check if device is connected first
  if (!isConnectedToAWS || (now - lastConnection >= OFFLINE_TIMEOUT)) {
    console.log(`📴 Tenant ${tenantId} device ${deviceId} is OFFLINE - not properly connected`);
    return 'offline';
  }

  // Device is connected, now check if any features are active
  const tenantDevices = getTenantDevices(tenantId);
  const device = tenantDevices.get(deviceId);
  if (!device) {
    console.log(`📴 Tenant ${tenantId} device ${deviceId} is OFFLINE - not found in registry`);
    return 'offline';
  }

  // Check for active features
  const hasActiveFeatures = device.features && Object.values(device.features).some(feature => feature === true);

  if (hasActiveFeatures) {
    console.log(`🟢 Tenant ${tenantId} device ${deviceId} is ACTIVE + ONLINE - connected with active features:`,
      Object.entries(device.features || {}).filter(([k, v]) => v).map(([k]) => k).join(', '));
    return 'active+online';
  }

  // ONLINE: Device is connected but no features are active
  console.log(`🟡 Tenant ${tenantId} device ${deviceId} is ONLINE - connected but no active features`);
  return 'online';
}

// FIXED: Update device status with tenant context
function updateDeviceStatus(tenantId, deviceId, newStatus = null) {
  const tenantDevices = getTenantDevices(tenantId);
  if (!tenantDevices.has(deviceId)) {
    return;
  }

  const device = tenantDevices.get(deviceId);
  const calculatedStatus = newStatus || calculateDeviceStatus(tenantId, deviceId);

  // Only update if status actually changed
  if (device.status !== calculatedStatus) {
    const previousStatus = device.status;
    device.status = calculatedStatus;
    device.lastStatusChange = new Date().toISOString();

    // Update storage
    tenantDevices.set(deviceId, device);
    const tenantDeviceStatusMap = getTenantDeviceStatus(tenantId);
    tenantDeviceStatusMap.set(deviceId, {
      ...device,
      lastUpdateTime: new Date().toISOString()
    });

    console.log(`📊 Tenant ${tenantId} device ${deviceId} status changed: ${previousStatus} → ${calculatedStatus}`);

    // Log feature states for debugging
    if (device.features) {
      const activeFeatures = Object.entries(device.features).filter(([k, v]) => v).map(([k]) => k);
      console.log(`🎛️ Tenant ${tenantId} device ${deviceId} active features: ${activeFeatures.length > 0 ? activeFeatures.join(', ') : 'none'}`);
    }

    // Broadcast status change to tenant clients only
    broadcastToTenant(tenantId, {
      type: 'device_status_update',
      deviceId,
      device: device,
      tenantId: tenantId,
      timestamp: new Date().toISOString(),
      source: 'status_calculation'
    });
  }
}

// FIXED: Start monitoring for a device with tenant context
function startDeviceStatusMonitoring(tenantId, deviceId) {
  // Get or create tenant status check intervals map
  if (!tenantStatusCheckIntervals.has(tenantId)) {
    tenantStatusCheckIntervals.set(tenantId, new Map());
  }
  const statusCheckIntervals = tenantStatusCheckIntervals.get(tenantId);

  // Clear existing interval if any
  if (statusCheckIntervals.has(deviceId)) {
    clearInterval(statusCheckIntervals.get(deviceId));
  }

  // Start new monitoring interval
  const intervalId = setInterval(() => {
    updateDeviceStatus(tenantId, deviceId);
  }, STATUS_CHECK_INTERVAL);

  statusCheckIntervals.set(deviceId, intervalId);
  console.log(`🔍 Started status monitoring for tenant ${tenantId} device: ${deviceId}`);
}

// FIXED: Stop monitoring for a device with tenant context
function stopDeviceStatusMonitoring(tenantId, deviceId) {
  const statusCheckIntervals = tenantStatusCheckIntervals.get(tenantId);
  if (statusCheckIntervals && statusCheckIntervals.has(deviceId)) {
    clearInterval(statusCheckIntervals.get(deviceId));
    statusCheckIntervals.delete(deviceId);
    console.log(`🛑 Stopped monitoring for tenant ${tenantId} device: ${deviceId}`);
  }
}

// FIXED: Record device activity with tenant context
function recordDeviceActivity(tenantId, deviceId, topicType, data = null) {
  const now = Date.now();

  // Get or create tenant-specific activity maps
  if (!tenantDeviceLastConnection.has(tenantId)) {
    tenantDeviceLastConnection.set(tenantId, new Map());
  }
  if (!tenantDeviceLastRelayStatus.has(tenantId)) {
    tenantDeviceLastRelayStatus.set(tenantId, new Map());
  }
  if (!tenantDeviceLastAck.has(tenantId)) {
    tenantDeviceLastAck.set(tenantId, new Map());
  }
  if (!tenantDeviceConnectedToAWS.has(tenantId)) {
    tenantDeviceConnectedToAWS.set(tenantId, new Map());
  }

  const deviceLastConnection = tenantDeviceLastConnection.get(tenantId);
  const deviceLastRelayStatus = tenantDeviceLastRelayStatus.get(tenantId);
  const deviceLastAck = tenantDeviceLastAck.get(tenantId);
  const deviceConnectedToAWS = tenantDeviceConnectedToAWS.get(tenantId);

  console.log(`📡 Recording activity for tenant ${tenantId} device ${deviceId}: ${topicType} at ${new Date(now).toLocaleTimeString()}`);

  switch (topicType) {
    case 'connection':
      deviceLastConnection.set(deviceId, now);
      if (data && data.status === 'connected') {
        deviceConnectedToAWS.set(deviceId, true);
        console.log(`🔗 Tenant ${tenantId} device ${deviceId} sent connection status: CONNECTED`);
      } else {
        deviceConnectedToAWS.set(deviceId, false);
        console.log(`🔌 Tenant ${tenantId} device ${deviceId} sent connection status: DISCONNECTED`);
      }
      break;

    case 'relay_status':
      deviceLastRelayStatus.set(deviceId, now);
      console.log(`📊 Tenant ${tenantId} device ${deviceId} sent relay status update`);
      break;

    case 'relay_ack':
      deviceLastAck.set(deviceId, now);
      console.log(`✅ Tenant ${tenantId} device ${deviceId} sent relay acknowledgment (actual hardware status)`);
      break;

    case 'control':
      console.log(`📤 Control command sent to tenant ${tenantId} device ${deviceId}`);
      break;

    default:
      console.log(`📡 General activity for tenant ${tenantId} device ${deviceId}: ${topicType}`);
  }

  // Immediately update status after any activity
  updateDeviceStatus(tenantId, deviceId);
}

// FIXED: Enhanced broadcast function with tenant filtering
function broadcastToTenant(tenantId, message) {
  if (!message || !message.type) {
    console.warn('⚠️ Invalid broadcast message:', message);
    return;
  }

  message.timestamp = message.timestamp || new Date().toISOString();
  message.tenantId = tenantId;

  const messageStr = JSON.stringify(message);
  let sentCount = 0;

  const clients = getTenantClients(tenantId);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(messageStr);
        sentCount++;
      } catch (error) {
        console.error('❌ Error broadcasting to tenant client:', error);
        clients.delete(client);
      }
    } else {
      clients.delete(client);
    }
  });

  if (sentCount > 0) {
    console.log(`📢 Broadcasted ${message.type} to ${sentCount} clients in tenant ${tenantId} - Device: ${message.deviceId || 'N/A'}`);
  }
}

// Broadcast to all tenants
function broadcastToAll(message) {
  if (!message || !message.type) {
    console.warn('⚠️ Invalid broadcast message:', message);
    return;
  }

  message.timestamp = message.timestamp || new Date().toISOString();
  const messageStr = JSON.stringify(message);
  let totalSentCount = 0;

  tenantClients.forEach((clients, tenantId) => {
    let tenantSentCount = 0;
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
          tenantSentCount++;
          totalSentCount++;
        } catch (error) {
          console.error('❌ Error broadcasting to client:', error);
          clients.delete(client);
        }
      } else {
        clients.delete(client);
      }
    });

    if (tenantSentCount > 0) {
      console.log(`📢 Broadcasted ${message.type} to ${tenantSentCount} clients in tenant ${tenantId}`);
    }
  });

  if (totalSentCount > 0) {
    console.log(`📢 Total broadcast: ${message.type} to ${totalSentCount} clients across all tenants`);
  }
}

// FIXED: Proper relay-to-feature mapping with tenant context
function mapRelayStatesToFeatures(tenantId, device, relayStates) {
  try {
    const relayConfig = device.relayConfig || {
      relay1: 'siren',
      relay2: 'beacon',
      relay3: 'announcement',
      relay4: 'dispenser'
    };

    const features = {
      siren: false,
      beacon: false,
      announcement: false,
      dispenser: false
    };

    // Map relay states to features
    Object.entries(relayConfig).forEach(([relay, feature]) => {
      if (relayStates[relay] === true) {
        features[feature] = true;
      }
    });

    return {
      ...device,
      features,
      relayStates,
      relayConfig,
      tenantId,
      lastSeen: new Date().toLocaleTimeString(),
      lastUpdateTime: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Error mapping relay states for tenant:', tenantId, error);
    return device;
  }
}

// FIXED: Enhanced device status processing with tenant context
function processDeviceStatusUpdate(tenantId, thingName, data, source = 'unknown') {
  try {
    const tenantDevices = getTenantDevices(tenantId);
    if (!tenantDevices.has(thingName)) {
      return;
    }

    const device = tenantDevices.get(thingName);
    const previousStatus = device.status;

    // Record activity
    if (source === 'connection') {
      recordDeviceActivity(tenantId, thingName, 'connection', data);
    } else if (source === 'relay_ack') {
      recordDeviceActivity(tenantId, thingName, 'relay_ack', data);
    } else if (source === 'relay_status') {
      recordDeviceActivity(tenantId, thingName, 'relay_status', data);
    }

    let updatedDevice = { ...device };

    // Update relay states if from relay_ack
    if (source === 'relay_ack' && data.relay1 !== undefined) {
      const newRelayStates = {
        relay1: Boolean(data.relay1),
        relay2: Boolean(data.relay2),
        relay3: Boolean(data.relay3),
        relay4: Boolean(data.relay4)
      };
      updatedDevice = mapRelayStatesToFeatures(tenantId, device, newRelayStates);
    }

    updatedDevice.lastSeen = new Date().toLocaleTimeString();
    updatedDevice.lastUpdateTime = new Date().toISOString();
    updatedDevice.tenantId = tenantId;

    // FIXED: Always use calculateDeviceStatus
    updatedDevice.status = calculateDeviceStatus(tenantId, thingName);

    // Store updated device
    tenantDevices.set(thingName, updatedDevice);
    const tenantDeviceStatusMap = getTenantDeviceStatus(tenantId);
    tenantDeviceStatusMap.set(thingName, updatedDevice);

    // FIXED: Only broadcast on important changes to prevent refreshing
    const shouldBroadcast = (
      source === 'relay_ack' || // Hardware ACK
      previousStatus !== updatedDevice.status || // Status changed
      source === 'connection' // Connection change
    );

    if (shouldBroadcast) {
      console.log(`📢 Broadcasting important change for tenant ${tenantId} device ${thingName}: ${previousStatus} → ${updatedDevice.status}`);
      broadcastToTenant(tenantId, {
        type: 'device_status_update',
        deviceId: thingName,
        device: updatedDevice,
        tenantId: tenantId,
        timestamp: new Date().toISOString(),
        source: source
      });
    } else {
      console.log(`🔄 Skipping broadcast for tenant ${tenantId} device ${thingName} - routine update`);
    }

  } catch (error) {
    console.error('❌ Error processing device status update for tenant:', tenantId, error);
  }
}

// Store device in DynamoDB with tenant context
async function storeDeviceInDynamoDB(tenantId, device) {
  try {
    await dynamoDb.put({
      TableName: TABLES.TENANT_DEVICES,
      Item: {
        tenantId,
        deviceId: device.id,
        ...device,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    }).promise();
    console.log(`✅ Stored device in DynamoDB for tenant ${tenantId}:`, device.id);
  } catch (error) {
    console.error('❌ Failed to store device in DynamoDB:', error);
  }
}

// Load devices from DynamoDB for tenant
async function loadDevicesFromDynamoDB(tenantId) {
  try {
    const result = await dynamoDb.query({
      TableName: TABLES.TENANT_DEVICES,
      KeyConditionExpression: 'tenantId = :tenantId',
      ExpressionAttributeValues: {
        ':tenantId': tenantId
      }
    }).promise();

    return result.Items || [];
  } catch (error) {
    console.error('❌ Failed to load devices from DynamoDB for tenant:', tenantId, error);
    return [];
  }
}

// FIXED: MQTT initialization with tenant support
function initializeMQTT() {
  try {
    console.log('🔌 Initializing MQTT connection with multi-tenant support...');

    // Load certificates from files
    const privateKeyPath = process.env.AWS_IOT_PRIVATE_KEY_PATH || './certs/pri.pem.key';
    const certificatePath = process.env.AWS_IOT_CERTIFICATE_PATH || './certs/certi.pem.crt';
    const caCertificatePath = process.env.AWS_IOT_CA_CERTIFICATE_PATH || './certs/AmazonRootCA1.pem';

    let privateKey, certificate, caCertificate;

    try {
      privateKey = fs.readFileSync(privateKeyPath, 'utf8');
      certificate = fs.readFileSync(certificatePath, 'utf8');
      caCertificate = fs.readFileSync(caCertificatePath, 'utf8');
      console.log('✅ Loaded MQTT certificates from files');
    } catch (fileError) {
      console.log('📄 Certificate files not found, trying environment variables...');

      // Fallback to environment variables
      privateKey = process.env.AWS_IOT_PRIVATE_KEY ?
        process.env.AWS_IOT_PRIVATE_KEY.replace(/\\n/g, '\n') : null;
      certificate = process.env.AWS_IOT_CERTIFICATE ?
        process.env.AWS_IOT_CERTIFICATE.replace(/\\n/g, '\n') : null;
      caCertificate = process.env.AWS_IOT_CA_CERTIFICATE ?
        process.env.AWS_IOT_CA_CERTIFICATE.replace(/\\n/g, '\n') : null;

      if (!privateKey || !certificate || !caCertificate) {
        throw new Error('MQTT certificates not found in files or environment variables');
      }
      console.log('✅ Loaded MQTT certificates from environment variables');
    }

    const mqttUrl = `mqtts://${iotEndpoint}:8883`;

    mqttClient = mqtt.connect(mqttUrl, {
      clientId: `elpro-backend-${Date.now()}`,
      clean: true,
      connectTimeout: 30000,
      reconnectPeriod: 5000,
      protocol: 'mqtts',
      key: Buffer.from(privateKey, 'utf8'),
      cert: Buffer.from(certificate, 'utf8'),
      ca: Buffer.from(caCertificate, 'utf8'),
      rejectUnauthorized: true
    });

    mqttClient.on('connect', () => {
      console.log('✅ MQTT connected - Real-time multi-tenant updates active');
      mqttConnectionStatus = 'connected';

      // FIXED: Subscribe to topic patterns for all tenants
      const topicPatterns = [
        '+/connection',        // Device connection status
        '+/relay/status',      // Device relay status (every 10 seconds)
        '+/relay/ack',         // Device relay acknowledgment (actual hardware status)
        '+/relay/control'      // Device control commands
      ];

      topicPatterns.forEach(pattern => {
        mqttClient.subscribe(pattern, (err) => {
          if (err) {
            console.error(`❌ Failed to subscribe to ${pattern}:`, err);
          } else {
            console.log(`📡 Subscribed to MQTT pattern: ${pattern}`);
            subscribedTopics.add(pattern);
          }
        });
      });

      // Subscribe to existing devices for all tenants
      subscribeToAllDevicesAllTenants();

      broadcastConnectionStatusToAll();
    });

    // FIXED: Enhanced MQTT message handling with tenant context
    mqttClient.on('message', (topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        const topicParts = topic.split('/');

        console.log(`📡 MQTT message received on ${topic}:`, data);

        if (topicParts.length >= 2) {
          const deviceId = topicParts[0];
          const messageType = topicParts[topicParts.length - 1];

          // Find which tenant this device belongs to
          let deviceTenantId = null;
          for (const [tenantId, devices] of tenantAwsThings.entries()) {
            if (devices.has(deviceId)) {
              deviceTenantId = tenantId;
              break;
            }
          }

          if (!deviceTenantId) {
            console.log(`⚠️ Device ${deviceId} not found in any tenant, ignoring message`);
            return;
          }

          // Handle different message types with tenant context
          switch (messageType) {
            case 'connection':
              console.log(`🔗 Connection status from tenant ${deviceTenantId} device ${deviceId}:`, data);
              processDeviceStatusUpdate(deviceTenantId, deviceId, data, 'connection');
              break;

            case 'status':
              console.log(`📊 Relay status from tenant ${deviceTenantId} device ${deviceId}:`, data);
              processDeviceStatusUpdate(deviceTenantId, deviceId, data, 'relay_status');
              break;

            case 'ack':
              console.log(`✅ Relay acknowledgment from tenant ${deviceTenantId} device ${deviceId}:`, data);
              processDeviceStatusUpdate(deviceTenantId, deviceId, data, 'relay_ack');
              break;

            case 'control':
              console.log(`📤 Control command acknowledgment from tenant ${deviceTenantId} device ${deviceId}:`, data);
              recordDeviceActivity(deviceTenantId, deviceId, 'control', data);
              break;

            default:
              console.log(`❓ Unknown message type: ${messageType} from tenant ${deviceTenantId} device ${deviceId}`);
          }
        }
      } catch (error) {
        console.error('❌ Error processing MQTT message:', error);
      }
    });

    mqttClient.on('error', (error) => {
      console.error('❌ MQTT connection error:', error);
      mqttConnectionStatus = 'error';
      broadcastConnectionStatusToAll();
    });

    mqttClient.on('close', () => {
      console.log('🔌 MQTT connection closed');
      mqttConnectionStatus = 'disconnected';
      broadcastConnectionStatusToAll();
    });

    mqttClient.on('reconnect', () => {
      console.log('🔄 MQTT reconnecting...');
      mqttConnectionStatus = 'connecting';
      broadcastConnectionStatusToAll();
    });

  } catch (error) {
    console.error('❌ Failed to initialize MQTT:', error);
    mqttConnectionStatus = 'error';

    // Continue without MQTT but use shadow polling
    console.log('🔄 Continuing with shadow polling for all tenants...');
    startShadowPollingForAllTenants();
  }
}

// Subscribe to all device topics for all tenants
function subscribeToAllDevicesAllTenants() {
  console.log('📡 Subscribing to all registered device topics for all tenants...');

  tenantAwsThings.forEach((devices, tenantId) => {
    devices.forEach((device, deviceId) => {
      subscribeToDeviceTopics(deviceId);
    });
  });
}

// FIXED: Subscribe to device topics
function subscribeToDeviceTopics(deviceId) {
  if (!mqttClient || !mqttClient.connected) {
    console.log(`⚠️ MQTT not connected, cannot subscribe to ${deviceId} topics`);
    return;
  }

  const topics = [
    `${deviceId}/connection`,
    `${deviceId}/relay/status`,
    `${deviceId}/relay/ack`,
    `${deviceId}/relay/control`
  ];

  topics.forEach(topic => {
    if (!subscribedTopics.has(topic)) {
      mqttClient.subscribe(topic, (err) => {
        if (err) {
          console.error(`❌ Failed to subscribe to ${topic}:`, err);
        } else {
          console.log(`📡 Subscribed to device topic: ${topic}`);
          subscribedTopics.add(topic);
        }
      });
    }
  });
}

// Start shadow polling for all tenants
function startShadowPollingForAllTenants() {
  console.log('🔄 Starting shadow polling for all tenant devices (MQTT fallback)...');

  tenantAwsThings.forEach((devices, tenantId) => {
    devices.forEach((device, deviceId) => {
      startShadowPolling(tenantId, deviceId);
    });
  });
}

// Enhanced shadow loading with tenant context
async function loadDeviceStatusFromShadow(tenantId, deviceId) {
  try {
    if (!shadowClient) {
      console.warn('⚠️ Shadow client not initialized');
      return null;
    }

    console.log(`📊 Fetching shadow for tenant ${tenantId} device: ${deviceId}`);

    const shadowData = await shadowClient.getThingShadow({
      thingName: deviceId
    }).promise();

    const shadowPayload = JSON.parse(shadowData.payload);
    console.log(`📋 Shadow data for tenant ${tenantId} device ${deviceId}:`, shadowPayload);

    let relayStates = null;

    // Use reported state if available (actual device status)
    if (shadowPayload.state && shadowPayload.state.reported) {
      const reported = shadowPayload.state.reported;
      relayStates = {
        relay1: Boolean(reported.relay1),
        relay2: Boolean(reported.relay2),
        relay3: Boolean(reported.relay3),
        relay4: Boolean(reported.relay4)
      };
      console.log(`🔴 Using REPORTED shadow state for tenant ${tenantId} device ${deviceId} (from device):`, relayStates);

      // Process as relay_ack since it's from the device
      processDeviceStatusUpdate(tenantId, deviceId, {
        ...relayStates,
        signal_strength: 85,
        battery_level: 100,
        timestamp: new Date().toISOString(),
        source: 'shadow_reported'
      }, 'relay_ack');
    } else if (shadowPayload.state && shadowPayload.state.desired) {
      const desired = shadowPayload.state.desired;
      relayStates = {
        relay1: Boolean(desired.relay1),
        relay2: Boolean(desired.relay2),
        relay3: Boolean(desired.relay3),
        relay4: Boolean(desired.relay4)
      };
      console.log(`🔵 Using DESIRED shadow state for tenant ${tenantId} device ${deviceId} (command state):`, relayStates);

      // Don't update relay states from desired state, just note the device exists
      recordDeviceActivity(tenantId, deviceId, 'shadow_fetch');
    }

    return relayStates;
  } catch (error) {
    console.warn(`⚠️ Failed to load shadow for tenant ${tenantId} device ${deviceId}:`, error.message);

    // If shadow doesn't exist, create initial state
    if (error.code === 'ResourceNotFoundException') {
      await createInitialShadow(tenantId, deviceId);
    } else {
      // Mark device as not connected to AWS due to error
      const deviceConnectedToAWS = tenantDeviceConnectedToAWS.get(tenantId) || new Map();
      deviceConnectedToAWS.set(deviceId, false);
      tenantDeviceConnectedToAWS.set(tenantId, deviceConnectedToAWS);
      updateDeviceStatus(tenantId, deviceId);
    }

    return null;
  }
}

// Create initial shadow for new devices
async function createInitialShadow(tenantId, deviceId) {
  try {
    const initialState = {
      state: {
        desired: {
          relay1: false,
          relay2: false,
          relay3: false,
          relay4: false
        }
      }
    };

    await shadowClient.updateThingShadow({
      thingName: deviceId,
      payload: JSON.stringify(initialState)
    }).promise();

    console.log(`✅ Created initial shadow for tenant ${tenantId} device ${deviceId}`);
    recordDeviceActivity(tenantId, deviceId, 'shadow_create');
  } catch (error) {
    console.warn(`⚠️ Failed to create initial shadow for tenant ${tenantId} device ${deviceId}:`, error.message);
    const deviceConnectedToAWS = tenantDeviceConnectedToAWS.get(tenantId) || new Map();
    deviceConnectedToAWS.set(deviceId, false);
    tenantDeviceConnectedToAWS.set(tenantId, deviceConnectedToAWS);
    updateDeviceStatus(tenantId, deviceId);
  }
}

function startShadowPolling(tenantId, deviceId) {
  // Initial fetch
  setTimeout(() => {
    loadDeviceStatusFromShadow(tenantId, deviceId);
  }, 1000);

  // Polling interval (only if MQTT is not working)
  if (mqttConnectionStatus !== 'connected') {
    const interval = setInterval(async () => {
      const tenantDevices = getTenantDevices(tenantId);
      if (!tenantDevices.has(deviceId)) {
        clearInterval(interval);
        return;
      }

      try {
        await loadDeviceStatusFromShadow(tenantId, deviceId);
      } catch (error) {
        console.warn(`⚠️ Shadow polling failed for tenant ${tenantId} device ${deviceId}:`, error.message);
        const deviceConnectedToAWS = tenantDeviceConnectedToAWS.get(tenantId) || new Map();
        deviceConnectedToAWS.set(deviceId, false);
        tenantDeviceConnectedToAWS.set(tenantId, deviceConnectedToAWS);
        updateDeviceStatus(tenantId, deviceId);
      }
    }, 30000); // Poll every 30 seconds as fallback
  }
}

// Enhanced startup process
async function initializeAWSConnection() {
  try {
    console.log('🔍 Initializing AWS IoT connection with multi-tenant support...');

    // Get IoT endpoint
    if (process.env.AWS_IOT_ENDPOINT) {
      iotEndpoint = process.env.AWS_IOT_ENDPOINT;
    } else {
      const result = await iot.describeEndpoint({ endpointType: 'iot:Data-ATS' }).promise();
      iotEndpoint = result.endpointAddress;
    }

    // Initialize IoT Data and Shadow clients
    iotData = new AWS.IotData({ endpoint: `https://${iotEndpoint}` });
    shadowClient = new AWS.IotData({ endpoint: `https://${iotEndpoint}` });

    // Test connection
    await testAWSConnection();

    awsConnectionStatus = 'connected';
    console.log('✅ AWS IoT connection established');

    // Load existing registered things for all tenants from DynamoDB
    await loadExistingThingsAllTenants();

    // Initialize MQTT for real-time updates
    initializeMQTT();

    // Broadcast connection status
    broadcastConnectionStatusToAll();

  } catch (error) {
    console.error('❌ Failed to initialize AWS IoT:', error.message);
    awsConnectionStatus = 'error';
    broadcastConnectionStatusToAll();

    // Even if AWS fails, start the server for local testing
    console.log('🚀 Starting server in local mode...');
  }
}

async function testAWSConnection() {
  await iot.listThings({ maxResults: 1 }).promise();
  console.log('✅ AWS IoT connection test successful');
}

// Load existing things for all tenants from DynamoDB
async function loadExistingThingsAllTenants() {
  try {
    console.log('📋 Loading existing devices for all tenants from DynamoDB...');

    // Scan all tenant devices
    const result = await dynamoDb.scan({
      TableName: TABLES.TENANT_DEVICES
    }).promise();

    const devicesByTenant = new Map();

    // Group devices by tenant
    result.Items.forEach(deviceRecord => {
      const tenantId = deviceRecord.tenantId;
      if (!devicesByTenant.has(tenantId)) {
        devicesByTenant.set(tenantId, []);
      }
      devicesByTenant.get(tenantId).push(deviceRecord);
    });

    // Process each tenant's devices
    for (const [tenantId, tenantDevices] of devicesByTenant.entries()) {
      console.log(`📋 Loading ${tenantDevices.length} devices for tenant: ${tenantId}`);

      const tenantDeviceMap = getTenantDevices(tenantId);
      const tenantDeviceStatusMap = getTenantDeviceStatus(tenantId);

      for (const deviceRecord of tenantDevices) {
        const deviceData = createDeviceFromRecord(deviceRecord);

        // Store device data
        tenantDeviceMap.set(deviceData.id, deviceData);
        tenantDeviceStatusMap.set(deviceData.id, {
          ...deviceData,
          lastUpdateTime: new Date().toISOString()
        });

        // Initialize tracking for this device
        initializeTenantDeviceTracking(tenantId, deviceData.id);

        // Start status monitoring
        startDeviceStatusMonitoring(tenantId, deviceData.id);

        // Load initial status from shadow
        setTimeout(async () => {
          await loadDeviceStatusFromShadow(tenantId, deviceData.id);

          // Subscribe to MQTT topics if connected
          if (mqttClient && mqttClient.connected) {
            subscribeToDeviceTopics(deviceData.id);
          }
        }, tenantDevices.indexOf(deviceRecord) * 500); // Stagger the fetches
      }

      console.log(`✅ Loaded ${tenantDevices.length} devices for tenant: ${tenantId}`);
    }

  } catch (error) {
    console.error('❌ Error loading existing things for all tenants:', error);
  }
}

// Initialize device tracking for tenant
function initializeTenantDeviceTracking(tenantId, deviceId) {
  // Initialize tenant-specific maps if they don't exist
  if (!tenantDeviceLastConnection.has(tenantId)) {
    tenantDeviceLastConnection.set(tenantId, new Map());
  }
  if (!tenantDeviceLastRelayStatus.has(tenantId)) {
    tenantDeviceLastRelayStatus.set(tenantId, new Map());
  }
  if (!tenantDeviceLastAck.has(tenantId)) {
    tenantDeviceLastAck.set(tenantId, new Map());
  }
  if (!tenantDeviceConnectedToAWS.has(tenantId)) {
    tenantDeviceConnectedToAWS.set(tenantId, new Map());
  }

  // Initialize device tracking
  tenantDeviceLastConnection.get(tenantId).set(deviceId, 0);
  tenantDeviceLastRelayStatus.get(tenantId).set(deviceId, 0);
  tenantDeviceLastAck.get(tenantId).set(deviceId, 0);
  tenantDeviceConnectedToAWS.get(tenantId).set(deviceId, false);
}

// Create device from DynamoDB record
function createDeviceFromRecord(deviceRecord) {
  let relayConfig;
  try {
    relayConfig = deviceRecord.relayConfig || {
      relay1: 'siren',
      relay2: 'beacon',
      relay3: 'announcement',
      relay4: 'dispenser'
    };
  } catch (error) {
    relayConfig = {
      relay1: 'siren',
      relay2: 'beacon',
      relay3: 'announcement',
      relay4: 'dispenser'
    };
  }

  return {
    id: deviceRecord.deviceId,
    name: deviceRecord.name || deviceRecord.deviceId,
    location: deviceRecord.location || '',
    lat: parseFloat(deviceRecord.lat || '12.9716'),
    lng: parseFloat(deviceRecord.lng || '77.5946'),
    group: deviceRecord.group || null,
    status: 'offline', // Start as offline until we get real status
    features: deviceRecord.features || {
      siren: false,
      beacon: false,
      announcement: false,
      dispenser: false
    },
    relayStates: deviceRecord.relayStates || {
      relay1: false,
      relay2: false,
      relay3: false,
      relay4: false
    },
    relayConfig,
    tenantId: deviceRecord.tenantId,
    created: deviceRecord.createdAt || new Date().toISOString(),
    lastSeen: 'Never',
    signalStrength: 0,
    batteryLevel: 100,
    thingArn: deviceRecord.thingArn,
    thingTypeName: deviceRecord.thingTypeName,
    version: deviceRecord.version
  };
}

// WebSocket client handling with tenant context
wss.on('connection', (ws) => {
  console.log('🔗 Client connected via WebSocket');
  let clientTenantId = null;

  // Send immediate connection status
  const connectionData = {
    type: 'connection_status',
    status: awsConnectionStatus,
    mqttConnected: mqttClient?.connected || false,
    endpoint: iotEndpoint || 'Not configured',
    timestamp: new Date().toISOString()
  };

  try {
    ws.send(JSON.stringify(connectionData));
  } catch (error) {
    console.warn('Failed to send connection status to new client:', error);
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'set_tenant_context') {
        // Client is setting their tenant context
        clientTenantId = data.tenantId;
        console.log(`🏢 Client set tenant context: ${clientTenantId}`);

        // Add client to tenant-specific client set
        const tenantClientSet = getTenantClients(clientTenantId);
        tenantClientSet.add(ws);

        // Send current device states for this tenant immediately
        setTimeout(() => {
          const tenantDevices = getTenantDevices(clientTenantId);
          console.log(`📤 Sending ${tenantDevices.size} device states to tenant ${clientTenantId} client`);
          let sentCount = 0;

          tenantDevices.forEach((device, deviceId) => {
            try {
              const deviceMessage = {
                type: 'device_status_update',
                deviceId,
                device,
                tenantId: clientTenantId,
                timestamp: new Date().toISOString(),
                source: 'initial_sync'
              };
              ws.send(JSON.stringify(deviceMessage));
              sentCount++;
            } catch (error) {
              console.warn(`Failed to send tenant ${clientTenantId} device ${deviceId} to client:`, error);
            }
          });

          console.log(`✅ Sent ${sentCount} device states to tenant ${clientTenantId} client`);
        }, 500);

      } else if (data.type === 'ping') {
        ws.send(JSON.stringify({
          type: 'pong',
          tenantId: clientTenantId,
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      console.warn('⚠️ Invalid WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket client disconnected');

    // Remove from tenant client set
    if (clientTenantId) {
      const tenantClientSet = getTenantClients(clientTenantId);
      tenantClientSet.delete(ws);
    }
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);

    // Remove from tenant client set
    if (clientTenantId) {
      const tenantClientSet = getTenantClients(clientTenantId);
      tenantClientSet.delete(ws);
    }
  });
});

function broadcastConnectionStatusToAll() {
  broadcastToAll({
    type: 'connection_status',
    status: awsConnectionStatus,
    mqttConnected: mqttClient?.connected || false,
    endpoint: iotEndpoint || 'Not configured'
  });
}

// API Routes with tenant context

app.get('/api/health', (req, res) => {
  let totalDevices = 0;
  let totalOnlineDevices = 0;
  let totalActiveDevices = 0;
  let totalOfflineDevices = 0;

  // Aggregate stats across all tenants
  tenantAwsThings.forEach((devices, tenantId) => {
    const tenantDevicesArray = Array.from(devices.values());
    totalDevices += tenantDevicesArray.length;
    totalOnlineDevices += tenantDevicesArray.filter(d => d.status === 'online').length;
    totalActiveDevices += tenantDevicesArray.filter(d => d.status === 'active').length;
    totalOfflineDevices += tenantDevicesArray.filter(d => d.status === 'offline').length;
  });

  // Get tenant-specific stats if tenant ID provided
  const tenantStats = req.tenantId ? {
    tenantId: req.tenantId,
    devices: tenantAwsThings.get(req.tenantId)?.size || 0,
    clients: tenantClients.get(req.tenantId)?.size || 0
  } : null;

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    aws: awsConnectionStatus,
    mqtt: mqttClient?.connected || false,
    endpoint: iotEndpoint || 'Not configured',
    totalTenants: tenantAwsThings.size,
    totalThings: totalDevices,
    totalClients: Array.from(tenantClients.values()).reduce((sum, clients) => sum + clients.size, 0),
    deviceStats: {
      total: totalDevices,
      online: totalOnlineDevices,
      active: totalActiveDevices,
      offline: totalOfflineDevices
    },
    tenantStats,
    lastActivity: tenantStatusHistory.size > 0 ?
      Array.from(tenantStatusHistory.values()).flat().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]?.timestamp :
      null
  });
});

// Register thing with tenant context and immediate status fetching
app.post('/api/iot/register-thing', async (req, res) => {
  try {
    const { thingName, name, location, lat, lng, group, relayConfig, tenantId } = req.body;
    const contextTenantId = tenantId || req.tenantId;

    if (!contextTenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant context is required'
      });
    }

    if (!thingName) {
      return res.status(400).json({
        success: false,
        error: 'Thing name is required'
      });
    }

    // Check if thing exists in AWS
    let awsThing;
    try {
      awsThing = await iot.describeThing({ thingName }).promise();
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: 'Thing not found in AWS IoT Core'
      });
    }

    const tenantDevices = getTenantDevices(contextTenantId);
    if (tenantDevices.has(thingName)) {
      return res.status(409).json({
        success: false,
        error: 'Thing already registered in this tenant'
      });
    }

    const finalRelayConfig = relayConfig || {
      relay1: 'siren',
      relay2: 'beacon',
      relay3: 'announcement',
      relay4: 'dispenser'
    };

    // Create device data structure
    const deviceData = {
      id: thingName,
      name: name || thingName,
      location: location || '',
      lat: lat || 12.9716,
      lng: lng || 77.5946,
      group: group || null,
      status: 'offline', // Start as offline until we get real status
      features: {
        siren: false,
        beacon: false,
        announcement: false,
        dispenser: false
      },
      relayStates: {
        relay1: false,
        relay2: false,
        relay3: false,
        relay4: false
      },
      relayConfig: finalRelayConfig,
      tenantId: contextTenantId,
      created: new Date().toISOString(),
      lastSeen: 'Never',
      signalStrength: 0,
      batteryLevel: 100,
      lastUpdateTime: new Date().toISOString()
    };

    // Store in memory for tenant
    tenantDevices.set(thingName, deviceData);
    const tenantDeviceStatusMap = getTenantDeviceStatus(contextTenantId);
    tenantDeviceStatusMap.set(thingName, {
      ...deviceData,
      lastUpdateTime: new Date().toISOString()
    });

    // ADD this line right after:
    console.log(`✅ Device ${thingName} registered for tenant ${contextTenantId} - Total tenant devices: ${tenantDevices.size}`);

    // Store in DynamoDB
    await storeDeviceInDynamoDB(contextTenantId, deviceData);

    // Initialize proper tracking for this device
    initializeTenantDeviceTracking(contextTenantId, thingName);

    // Start status monitoring
    startDeviceStatusMonitoring(contextTenantId, thingName);

    // Check for real device status and subscribe to MQTT topics
    setTimeout(async () => {
      console.log(`🔄 Setting up monitoring for newly registered tenant ${contextTenantId} device: ${thingName}`);

      // Load initial status from shadow
      await loadDeviceStatusFromShadow(contextTenantId, thingName);

      // Subscribe to MQTT topics for real device updates
      if (mqttClient && mqttClient.connected) {
        subscribeToDeviceTopics(thingName);
      }
    }, 1000);

    // Update AWS thing attributes
    try {
      await iot.updateThing({
        thingName,
        attributePayload: {
          attributes: {
            ...awsThing.attributes,
            displayName: name || thingName,
            location: location || '',
            tenantId: contextTenantId,
            registered: 'true',
            registeredAt: new Date().toISOString()
          }
        }
      }).promise();
      console.log(`✅ Updated AWS thing attributes for tenant ${contextTenantId} device ${thingName}`);
    } catch (updateError) {
      console.warn('⚠️ Failed to update thing attributes:', updateError.message);
    }

    // Broadcast device registration to tenant clients only
    broadcastToTenant(contextTenantId, {
      type: 'device_created',
      device: deviceData,
      tenantId: contextTenantId,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      message: 'AWS IoT Thing registered successfully for tenant - Monitoring MQTT topics for real-time updates',
      device: deviceData,
      tenantId: contextTenantId,
      topics: {
        connection: `${thingName}/connection`,
        status: `${thingName}/relay/status`,
        ack: `${thingName}/relay/ack`,
        control: `${thingName}/relay/control`
      }
    });

  } catch (error) {
    console.error('❌ Error registering thing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register thing',
      message: error.message
    });
  }
});

// Enhanced command sending with tenant context - ONLY ACTIVE DEVICES
app.post('/api/iot/command', async (req, res) => {
  try {
    const { deviceId, command, data, tenantId } = req.body;
    const contextTenantId = tenantId || req.tenantId;

    if (!contextTenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant context is required'
      });
    }

    if (!deviceId || !command) {
      return res.status(400).json({
        success: false,
        error: 'Device ID and command are required'
      });
    }

    const tenantDevices = getTenantDevices(contextTenantId);
    if (!tenantDevices.has(deviceId)) {
      return res.status(404).json({
        success: false,
        error: 'Device not found in tenant'
      });
    }

    const device = tenantDevices.get(deviceId);

    // Allow commands if device is online or active (not offline)
    if (device.status === 'offline') {
      return res.status(400).json({
        success: false,
        error: `Cannot send command to offline device. Device status is '${device.status}'. Device must be 'online' or 'active' for control.`,
        deviceStatus: device.status,
        tenantId: contextTenantId,
        message: 'Device is offline. Please wait for device to come online.',
        requirement: 'Device must be ONLINE or ACTIVE (connected to AWS) to accept commands'
      });
    }

    console.log(`🎛️ Command approved for tenant ${contextTenantId} ${device.status.toUpperCase()} device ${deviceId}: ${command}`);

    const controlTopic = `${deviceId}/relay/control`;

    // FIXED: Start with current relay states (preserve existing state)
    let payload = {
      relay1: device.relayStates?.relay1 || false,
      relay2: device.relayStates?.relay2 || false,
      relay3: device.relayStates?.relay3 || false,
      relay4: device.relayStates?.relay4 || false
    };

    // Handle feature toggle commands
    if (command.includes('_on') || command.includes('_off') || command.startsWith('toggle_')) {
      const feature = command.replace('toggle_', '').replace('_on', '').replace('_off', '');

      // Find the correct relay for this feature
      const relayForFeature = Object.entries(device.relayConfig || {}).find(([relay, configuredFeature]) =>
        configuredFeature === feature
      );

      if (relayForFeature) {
        const [relayNum] = relayForFeature;
        const currentState = device.relayStates?.[relayNum] || false;

        // Determine new state based on command
        let newState;
        if (command.includes('_on')) {
          newState = true;
        } else if (command.includes('_off')) {
          newState = false;
        } else if (command.includes('toggle')) {
          newState = !currentState;
        }

        // ONLY update the specific relay for this feature
        payload[relayNum] = newState;

        console.log(`🎛️ Tenant ${contextTenantId} feature ${feature} mapped to ${relayNum}: ${currentState} → ${newState} (Device is ${device.status.toUpperCase()})`);
        console.log(`🎛️ Preserving other relay states:`, {
          relay1: relayNum !== 'relay1' ? payload.relay1 : 'UPDATED',
          relay2: relayNum !== 'relay2' ? payload.relay2 : 'UPDATED',
          relay3: relayNum !== 'relay3' ? payload.relay3 : 'UPDATED',
          relay4: relayNum !== 'relay4' ? payload.relay4 : 'UPDATED'
        });

        // Record command activity
        recordDeviceActivity(contextTenantId, deviceId, 'control');
      } else {
        console.warn(`⚠️ No relay mapping found for feature: ${feature}`);
      }
    }

    let commandSent = false;

    // Try MQTT first (preferred for connected devices)
    if (mqttClient && mqttClient.connected) {
      mqttClient.publish(controlTopic, JSON.stringify(payload), (err) => {
        if (!err) {
          console.log(`📤 Partial command sent via MQTT to tenant ${contextTenantId} ${device.status.toUpperCase()} device ${controlTopic}:`, payload);
          commandSent = true;
        }
      });
    }

    // Fallback to IoT Data API
    if (!commandSent && iotData) {
      try {
        await iotData.publish({
          topic: controlTopic,
          payload: JSON.stringify(payload)
        }).promise();
        console.log(`📤 Partial command sent via IoT Data API to tenant ${contextTenantId} ${device.status.toUpperCase()} device ${controlTopic}:`, payload);
        commandSent = true;
      } catch (iotError) {
        console.error('❌ IoT Data publish failed:', iotError.message);
      }
    }

    // Update device shadow for persistence
    if (shadowClient) {
      try {
        await shadowClient.updateThingShadow({
          thingName: deviceId,
          payload: JSON.stringify({
            state: { desired: payload }
          })
        }).promise();
        console.log(`📋 Device shadow updated for tenant ${contextTenantId} ${device.status.toUpperCase()} device ${deviceId}`);
      } catch (shadowError) {
        console.warn('⚠️ Failed to update device shadow:', shadowError.message);
      }
    }

    // Broadcast command sent to tenant clients only
    broadcastToTenant(contextTenantId, {
      type: 'command_sent',
      deviceId,
      command,
      topic: controlTopic,
      payload,
      tenantId: contextTenantId,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: `Partial command sent successfully to tenant ${contextTenantId} ${device.status.toUpperCase()} device. Waiting for relay acknowledgment on ${deviceId}/relay/ack`,
      method: commandSent ? (mqttClient?.connected ? 'MQTT' : 'IoT Data') : 'Simulated',
      topic: controlTopic,
      payload,
      deviceStatus: device.status,
      tenantId: contextTenantId,
      note: 'Device will send acknowledgment on relay/ack topic with actual hardware status'
    });

  } catch (error) {
    console.error('❌ Error sending command:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send command',
      message: error.message
    });
  }
});

// Enhanced scenario execution with tenant context
app.post('/api/iot/scenario', async (req, res) => {
  try {
    const { deviceIds, scenario, features, tenantId } = req.body;
    const contextTenantId = tenantId || req.tenantId;

    if (!contextTenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant context is required'
      });
    }

    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Device IDs array is required'
      });
    }

    const tenantDevices = getTenantDevices(contextTenantId);

    // Check if all devices are online or active (not offline) and belong to tenant
    const offlineDevices = [];
    const onlineDevices = [];

    deviceIds.forEach(deviceId => {
      if (!tenantDevices.has(deviceId)) {
        offlineDevices.push({ deviceId, reason: 'not_found_in_tenant' });
      } else {
        const device = tenantDevices.get(deviceId);
        if (device.status === 'offline') {
          offlineDevices.push({ deviceId, reason: device.status });
        } else {
          onlineDevices.push(deviceId);
        }
      }
    });

    if (offlineDevices.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Some devices are offline and cannot receive commands',
        offlineDevices: offlineDevices,
        onlineDevices: onlineDevices,
        tenantId: contextTenantId,
        message: 'Only ONLINE or ACTIVE devices can receive scenario commands. Please wait for devices to come online.',
        requirement: 'All devices must be ONLINE or ACTIVE (connected to AWS) to execute scenarios'
      });
    }

    console.log(`🎭 Scenario approved for tenant ${contextTenantId} ${onlineDevices.length} ONLINE/ACTIVE devices`);

    // Use features if provided, otherwise use scenario mapping
    let targetFeatures;

    if (features && typeof features === 'object') {
      // FIXED: Only include features that are explicitly specified (not undefined)
      targetFeatures = {};
      Object.entries(features).forEach(([feature, value]) => {
        if (value !== undefined) {
          targetFeatures[feature] = Boolean(value);
        }
      });
      console.log('🎭 Using provided features (partial update):', targetFeatures);
    } else {
      // Correct scenario feature mapping
      const scenarioFeatures = {
        'ALL': { siren: true, beacon: true, announcement: true, dispenser: true },
        'WAR': { siren: true, beacon: false, announcement: true, dispenser: true },
        'FIRE': { siren: true, beacon: true, announcement: true, dispenser: false },
        'NATURAL': { siren: true, beacon: true, announcement: true, dispenser: false }
      };

      targetFeatures = scenarioFeatures[scenario] || scenarioFeatures['ALL'];
      console.log(`🎭 Using scenario ${scenario} features:`, targetFeatures);
    }

    const results = [];

    // Send commands to each ONLINE/ACTIVE device in tenant
    for (const deviceId of onlineDevices) {
      try {
        const device = tenantDevices.get(deviceId);
        const controlTopic = `${deviceId}/relay/control`;

        // Proper feature to relay mapping
        const relayConfig = device.relayConfig || {
          relay1: 'siren',
          relay2: 'beacon',
          relay3: 'announcement',
          relay4: 'dispenser'
        };

        // Create reverse mapping: feature -> relay
        const featureToRelay = {};
        Object.entries(relayConfig).forEach(([relay, feature]) => {
          featureToRelay[feature] = relay;
        });

        // FIXED: Build payload with current device state as base
        const payload = {
          relay1: device.relayStates?.relay1 || false,
          relay2: device.relayStates?.relay2 || false,
          relay3: device.relayStates?.relay3 || false,
          relay4: device.relayStates?.relay4 || false
        };

        // FIXED: Only update relays for specified features (partial update)
        Object.entries(targetFeatures).forEach(([feature, shouldEnable]) => {
          const relayForFeature = featureToRelay[feature];
          if (relayForFeature) {
            payload[relayForFeature] = Boolean(shouldEnable);
            console.log(`🎛️ Tenant ${contextTenantId} updating feature ${feature} -> ${relayForFeature}: ${shouldEnable}`);
          }
        });

        console.log(`📋 Tenant ${contextTenantId} ${device.status.toUpperCase()} Device ${deviceId} relay mapping:`, relayConfig);
        console.log(`📋 Tenant ${contextTenantId} ${device.status.toUpperCase()} Device ${deviceId} current state:`, device.relayStates);
        console.log(`📋 Tenant ${contextTenantId} ${device.status.toUpperCase()} Device ${deviceId} final payload (partial):`, payload);

        // Record scenario activity
        recordDeviceActivity(contextTenantId, deviceId, 'control');

        // Send command
        let sent = false;
        if (mqttClient && mqttClient.connected) {
          mqttClient.publish(controlTopic, JSON.stringify(payload));
          console.log(`📤 MQTT partial command sent to tenant ${contextTenantId} ${device.status.toUpperCase()} device ${deviceId}:`, payload);
          sent = true;
        } else if (iotData) {
          await iotData.publish({
            topic: controlTopic,
            payload: JSON.stringify(payload)
          }).promise();
          console.log(`📤 IoT Data partial command sent to tenant ${contextTenantId} ${device.status.toUpperCase()} device ${deviceId}:`, payload);
          sent = true;
        }

        // Update shadow
        if (shadowClient) {
          try {
            await shadowClient.updateThingShadow({
              thingName: deviceId,
              payload: JSON.stringify({
                state: { desired: payload }
              })
            }).promise();
            console.log(`📋 Shadow updated for tenant ${contextTenantId} ${device.status.toUpperCase()} device ${deviceId}`);
          } catch (shadowError) {
            console.warn(`⚠️ Failed to update shadow for tenant ${contextTenantId} device ${deviceId}:`, shadowError.message);
          }
        }

        results.push({
          deviceId,
          success: true,
          method: sent ? 'AWS' : 'Simulated',
          topic: controlTopic,
          payload,
          features: targetFeatures,
          deviceStatus: device.status,
          tenantId: contextTenantId,
          note: 'Partial command sent - waiting for hardware acknowledgment'
        });

      } catch (error) {
        console.error(`❌ Error executing scenario for tenant ${contextTenantId} device ${deviceId}:`, error);
        results.push({
          deviceId,
          success: false,
          error: error.message,
          tenantId: contextTenantId
        });
      }
    }

    // Broadcast scenario execution to tenant clients only
    broadcastToTenant(contextTenantId, {
      type: 'scenario_executed',
      scenario: {
        name: scenario,
        features: targetFeatures
      },
      deviceIds: onlineDevices,
      results,
      tenantId: contextTenantId,
      timestamp: new Date().toISOString()
    });

    const successful = results.filter(r => r.success).length;
    const featureList = Object.keys(targetFeatures).join(', ');
    res.json({
      success: true,
      message: `Partial scenario executed on ${successful}/${onlineDevices.length} ONLINE/ACTIVE devices for tenant ${contextTenantId} features: ${featureList}`,
      scenario: scenario,
      features: targetFeatures,
      devicesAffected: onlineDevices.length,
      skippedDevices: offlineDevices.length,
      results,
      tenantId: contextTenantId,
      note: 'Partial commands sent - dashboard will update when devices send acknowledgments on relay/ack topic'
    });

  } catch (error) {
    console.error('❌ Error executing scenario:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute scenario',
      message: error.message
    });
  }
});

// Get available things (not tenant-specific)
app.get('/api/iot/available-things', async (req, res) => {
  try {
    const result = await iot.listThings().promise();

    // Get all registered device IDs across all tenants
    const allRegisteredDevices = new Set();
    tenantAwsThings.forEach((devices) => {
      devices.forEach((device, deviceId) => {
        allRegisteredDevices.add(deviceId);
      });
    });

    const thingsList = result.things
      .filter(thing => !allRegisteredDevices.has(thing.thingName))
      .map(thing => ({
        thingName: thing.thingName,
        thingArn: thing.thingArn,
        attributes: thing.attributes || {},
        creationDate: thing.creationDate,
        isRegistered: false
      }));

    res.json({
      success: true,
      things: thingsList
    });

  } catch (error) {
    console.error('❌ Error listing available things:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list available things',
      message: error.message,
      things: []
    });
  }
});

// Get tenant-specific devices
app.get('/api/iot/things', async (req, res) => {
  try {
    const contextTenantId = req.tenantId;

    if (!contextTenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant context is required',
        devices: []
      });
    }

    const tenantDevices = getTenantDevices(contextTenantId);

    // FIXED: Ensure devices are properly filtered by tenant ID
    const deviceList = Array.from(tenantDevices.values())
      .filter(device => device.tenantId === contextTenantId) // Add explicit tenant filter
      .map(device => ({
        ...device,
        features: device.features || {
          siren: false,
          beacon: false,
          announcement: false,
          dispenser: false
        },
        status: device.status || 'offline',
        lastSeen: device.lastSeen || 'Never',
        lastUpdateTime: device.lastUpdateTime || new Date().toISOString(),
        tenantId: contextTenantId
      }));

    res.json({
      success: true,
      devices: deviceList,
      tenantId: contextTenantId,
      timestamp: new Date().toISOString(),
      count: deviceList.length
    });
  } catch (error) {
    console.error('❌ Error listing devices for tenant:', req.tenantId, error);
    res.status(500).json({
      success: false,
      error: 'Failed to list devices',
      message: error.message,
      devices: []
    });
  }
});

// Delete thing with tenant context and proper cleanup
app.delete('/api/iot/things/:thingName', async (req, res) => {
  try {
    const thingName = req.params.thingName;
    const contextTenantId = req.tenantId;

    if (!contextTenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant context is required'
      });
    }

    const tenantDevices = getTenantDevices(contextTenantId);
    if (!tenantDevices.has(thingName)) {
      return res.status(404).json({
        success: false,
        error: 'Device not found in tenant'
      });
    }

    // Stop monitoring for this device
    stopDeviceStatusMonitoring(contextTenantId, thingName);

    // Update AWS thing to remove tenant-specific attributes
    try {
      const awsThing = await iot.describeThing({ thingName }).promise();
      const newAttributes = { ...awsThing.attributes };
      delete newAttributes.registered;
      delete newAttributes.registeredAt;
      delete newAttributes.displayName;
      delete newAttributes.tenantId;

      await iot.updateThing({
        thingName,
        attributePayload: { attributes: newAttributes }
      }).promise();
    } catch (awsError) {
      console.warn('⚠️ AWS update failed:', awsError.message);
    }

    // Remove from DynamoDB
    try {
      await dynamoDb.delete({
        TableName: TABLES.TENANT_DEVICES,
        Key: {
          tenantId: contextTenantId,
          deviceId: thingName
        }
      }).promise();
    } catch (dbError) {
      console.warn('⚠️ DynamoDB delete failed:', dbError.message);
    }

    // Unsubscribe from MQTT topics
    if (mqttClient && mqttClient.connected) {
      const topics = [
        `${thingName}/connection`,
        `${thingName}/relay/status`,
        `${thingName}/relay/ack`,
        `${thingName}/relay/control`
      ];

      topics.forEach(topic => {
        mqttClient.unsubscribe(topic);
        subscribedTopics.delete(topic);
      });

      console.log(`📡 Unsubscribed from tenant ${contextTenantId} device ${thingName} MQTT topics`);
    }

    // Remove from tenant memory and tracking
    tenantDevices.delete(thingName);
    const tenantDeviceStatusMap = getTenantDeviceStatus(contextTenantId);
    tenantDeviceStatusMap.delete(thingName);

    // Clean up tenant-specific tracking maps
    const deviceLastConnection = tenantDeviceLastConnection.get(contextTenantId);
    const deviceLastRelayStatus = tenantDeviceLastRelayStatus.get(contextTenantId);
    const deviceLastAck = tenantDeviceLastAck.get(contextTenantId);
    const deviceConnectedToAWS = tenantDeviceConnectedToAWS.get(contextTenantId);

    if (deviceLastConnection) deviceLastConnection.delete(thingName);
    if (deviceLastRelayStatus) deviceLastRelayStatus.delete(thingName);
    if (deviceLastAck) deviceLastAck.delete(thingName);
    if (deviceConnectedToAWS) deviceConnectedToAWS.delete(thingName);

    // Broadcast deletion to tenant clients only
    broadcastToTenant(contextTenantId, {
      type: 'device_deleted',
      deviceId: thingName,
      tenantId: contextTenantId,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Device unregistered successfully from tenant',
      tenantId: contextTenantId
    });

  } catch (error) {
    console.error('❌ Error deleting device:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete device',
      message: error.message
    });
  }
});

// Manual status simulation endpoint for testing with tenant context
app.post('/api/iot/simulate-device-status/:deviceId', async (req, res) => {
  try {
    const deviceId = req.params.deviceId;
    const contextTenantId = req.tenantId;
    const {
      connectionStatus = 'connected',
      relay1 = false,
      relay2 = false,
      relay3 = false,
      relay4 = false,
      signal_strength = 85,
      battery_level = 100
    } = req.body;

    if (!contextTenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant context is required'
      });
    }

    const tenantDevices = getTenantDevices(contextTenantId);
    if (!tenantDevices.has(deviceId)) {
      return res.status(404).json({
        success: false,
        error: 'Device not found in tenant'
      });
    }

    console.log('🔴 Simulating device messages for tenant:', contextTenantId, 'device:', deviceId);

    // Simulate connection status
    processDeviceStatusUpdate(contextTenantId, deviceId, {
      status: connectionStatus
    }, 'connection');

    // Simulate relay acknowledgment (actual hardware status)
    processDeviceStatusUpdate(contextTenantId, deviceId, {
      relay1: Boolean(relay1),
      relay2: Boolean(relay2),
      relay3: Boolean(relay3),
      relay4: Boolean(relay4),
      signal_strength,
      battery_level,
      timestamp: new Date().toISOString()
    }, 'relay_ack');

    res.json({
      success: true,
      message: 'Device status simulated successfully',
      deviceId,
      tenantId: contextTenantId,
      connectionStatus,
      relayStates: {
        relay1: Boolean(relay1),
        relay2: Boolean(relay2),
        relay3: Boolean(relay3),
        relay4: Boolean(relay4)
      },
      newStatus: calculateDeviceStatus(contextTenantId, deviceId),
      note: 'Simulated both connection status and relay acknowledgment'
    });

  } catch (error) {
    console.error('❌ Error simulating device status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to simulate device status',
      message: error.message
    });
  }
});

// Groups API with tenant context
app.get('/api/groups', async (req, res) => {
  try {
    const contextTenantId = req.tenantId;

    if (!contextTenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant context is required',
        groups: []
      });
    }

    // Load groups from DynamoDB for this tenant
    const result = await dynamoDb.query({
      TableName: TABLES.TENANT_GROUPS,
      KeyConditionExpression: 'tenantId = :tenantId',
      ExpressionAttributeValues: {
        ':tenantId': contextTenantId
      }
    }).promise();

    const groups = result.Items || [];

    res.json({
      success: true,
      groups: groups,
      tenantId: contextTenantId,
      count: groups.length
    });

  } catch (error) {
    console.error('❌ Error fetching groups for tenant:', req.tenantId, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch groups',
      message: error.message,
      groups: []
    });
  }
});

app.post('/api/groups', async (req, res) => {
  try {
    const { name, description, color, deviceIds, tenantId } = req.body;
    const contextTenantId = tenantId || req.tenantId;

    if (!contextTenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant context is required'
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Group name is required'
      });
    }

    const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const group = {
      tenantId: contextTenantId,
      groupId: groupId,
      id: groupId, // For compatibility
      name,
      description: description || '',
      color: color || 'blue',
      devices: deviceIds || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store in DynamoDB
    await dynamoDb.put({
      TableName: TABLES.TENANT_GROUPS,
      Item: group
    }).promise();

    // Update local tenant groups cache
    const tenantGroupsMap = getTenantGroups(contextTenantId);
    tenantGroupsMap.set(groupId, group);

    res.status(201).json({
      success: true,
      group: group,
      tenantId: contextTenantId,
      message: 'Group created successfully'
    });

  } catch (error) {
    console.error('❌ Error creating group:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create group',
      message: error.message
    });
  }
});

// Status sync endpoints with tenant context
app.post('/api/iot/sync-status/:deviceId', async (req, res) => {
  try {
    const deviceId = req.params.deviceId;
    const contextTenantId = req.tenantId;

    if (!contextTenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant context is required'
      });
    }

    const tenantDevices = getTenantDevices(contextTenantId);
    if (!tenantDevices.has(deviceId)) {
      return res.status(404).json({
        success: false,
        error: 'Device not found in tenant'
      });
    }

    console.log(`📊 Manual status sync requested for tenant ${contextTenantId} device: ${deviceId}`);

    // Load status from shadow
    await loadDeviceStatusFromShadow(contextTenantId, deviceId);

    res.json({
      success: true,
      message: 'Status sync initiated',
      deviceId: deviceId,
      tenantId: contextTenantId
    });

  } catch (error) {
    console.error('❌ Error syncing device status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync device status',
      message: error.message
    });
  }
});

app.post('/api/iot/refresh-all-status', async (req, res) => {
  try {
    const contextTenantId = req.tenantId;

    if (!contextTenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant context is required'
      });
    }

    console.log(`🔄 Manual refresh all status for tenant: ${contextTenantId}`);

    const tenantDevices = getTenantDevices(contextTenantId);
    const deviceCount = tenantDevices.size;

    // Refresh status for all tenant devices
    const promises = Array.from(tenantDevices.keys()).map(deviceId =>
      loadDeviceStatusFromShadow(contextTenantId, deviceId)
    );

    await Promise.allSettled(promises);

    res.json({
      success: true,
      message: `Status refresh initiated for ${deviceCount} devices in tenant ${contextTenantId}`,
      tenantId: contextTenantId,
      deviceCount: deviceCount
    });

  } catch (error) {
    console.error('❌ Error refreshing all device status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh device status',
      message: error.message
    });
  }
});

// Initialize enhanced tracking on startup
function initializeDeviceTracking() {
  // Clear existing tracking
  tenantDeviceLastConnection.clear();
  tenantDeviceLastRelayStatus.clear();
  tenantDeviceLastAck.clear();
  tenantDeviceConnectedToAWS.clear();

  console.log('🔄 Initialized multi-tenant device tracking with enhanced status logic');
}

initializeDeviceTracking();

// Start HTTP server
server.listen(PORT, () => {
  console.log(`🚀 ELPRO AWS IoT Multi-Tenant Backend Server running on port ${PORT}`);
  console.log(`🌐 WebSocket server running on port ${WS_PORT}`);
  console.log(`📡 CORS enabled for frontend connections`);
  console.log(`🏢 Multi-tenant support enabled with DynamoDB storage`);

  // Initialize AWS connection
  initializeAWSConnection();

  console.log('\n📋 Available API Endpoints:');
  console.log('  GET  /api/health - Health check (with tenant stats)');
  console.log('  GET  /api/iot/things - List tenant devices (requires X-Tenant-ID header)');
  console.log('  GET  /api/iot/available-things - List unregistered things');
  console.log('  POST /api/iot/register-thing - Register thing to tenant (requires tenantId)');
  console.log('  DELETE /api/iot/things/:thingName - Unregister thing from tenant');
  console.log('  POST /api/iot/command - Send MQTT command (tenant-specific)');
  console.log('  POST /api/iot/scenario - Execute scenario (tenant-specific)');
  console.log('  GET  /api/groups - List tenant groups');
  console.log('  POST /api/groups - Create tenant group');
  console.log('  POST /api/iot/simulate-device-status/:deviceId - Simulate device messages');

  console.log('\n🏢 MULTI-TENANT FEATURES:');
  console.log('  🔐 Each admin gets isolated environment');
  console.log('  📊 Separate device/group management per tenant');
  console.log('  💾 DynamoDB storage for tenant data persistence');
  console.log('  📡 WebSocket tenant context for real-time updates');
  console.log('  🎯 Tenant-filtered MQTT message processing');

  console.log('\n🎯 MQTT TOPIC MANAGEMENT:');
  console.log('  📡 Monitoring Topics:');
  console.log('    🔗 deviceId/connection - Device connection status');
  console.log('    📊 deviceId/relay/status - Relay status (every 10 seconds)');
  console.log('    ✅ deviceId/relay/ack - Relay acknowledgment (actual hardware)');
  console.log('    📤 deviceId/relay/control - Control commands');
  console.log('  ✅ Status Logic (per tenant):');
  console.log('    📴 OFFLINE: No connection status for 20+ minutes');
  console.log('    🟡 ONLINE: Connection status "connected" but no relay updates');
  console.log('    🟢 ACTIVE: Connection "connected" + relay status updates');
  console.log('  ✅ Real-time Updates (tenant-filtered):');
  console.log('    🔗 Connection status determines online/offline');
  console.log('    📊 Relay status shows device is actively communicating');
  console.log('    ✅ Relay ACK updates actual feature states in dashboard');
  console.log('    📤 Commands only work for ACTIVE devices');

  console.log('\n🧪 Testing Commands:');
  console.log('  POST /api/iot/simulate-device-status/zonex_3');
  console.log('  Headers: { "X-Tenant-ID": "your-tenant-id" }');
  console.log('  Body: {');
  console.log('    "connectionStatus": "connected",');
  console.log('    "relay1": true, "relay2": false, "relay3": false, "relay4": false');
  console.log('  }');

  console.log('\n📋 DynamoDB Tables Required:');
  console.log('  📊 elpro-tenants - Tenant information');
  console.log('  🏢 elpro-tenant-devices - Tenant-specific devices');
  console.log('  📁 elpro-tenant-groups - Tenant-specific groups');
  console.log('  ⚙️ elpro-tenant-settings - Tenant-specific settings');
  console.log('  📈 elpro-tenant-activity - Tenant-specific activity logs');
});

// Graceful shutdown with multi-tenant cleanup
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');

  // Stop all device monitoring for all tenants
  tenantStatusCheckIntervals.forEach((intervals, tenantId) => {
    intervals.forEach((intervalId, deviceId) => {
      clearInterval(intervalId);
      console.log(`🛑 Stopped monitoring for tenant ${tenantId} device ${deviceId}`);
    });
  });
  tenantStatusCheckIntervals.clear();

  // Close MQTT connection
  if (mqttClient) {
    console.log('🔌 Disconnecting MQTT client...');
    mqttClient.end();
  }

  // Close WebSocket server
  wss.close(() => {
    console.log('✅ WebSocket server closed');
    server.close(() => {
      console.log('✅ HTTP server closed');
      console.log('👋 ELPRO Multi-Tenant Backend shutdown complete');
      process.exit(0);
    });
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.emit('SIGINT');
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});