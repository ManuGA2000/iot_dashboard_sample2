// const express = require('express');
// const cors = require('cors');
// const http = require('http');
// const AWS = require('aws-sdk');
// const mqtt = require('mqtt');
// const WebSocket = require('ws');
// const { v4: uuidv4 } = require('uuid');
// const fs = require('fs');
// const path = require('path');
// require('dotenv').config();

// const app = express();
// const server = http.createServer(app);
// const PORT = process.env.PORT || 5000;
// const WS_PORT = process.env.WS_PORT || 5001;

// // Enhanced CORS configuration
// app.use(cors({
//   origin: [
//     'http://localhost:3000',
//     'http://localhost:3001',
//     'http://127.0.0.1:3000',
//     'http://localhost:3002'
//   ],
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
//   credentials: true,
//   optionsSuccessStatus: 200
// }));

// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ extended: true }));

// // Configure AWS
// AWS.config.update({
//   region: process.env.AWS_REGION || 'ap-south-1',
//   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
// });

// const iot = new AWS.Iot();
// let iotData = null;
// let iotEndpoint = null;
// let shadowClient = null;

// // WebSocket server
// const wss = new WebSocket.Server({ port: WS_PORT });
// const clients = new Set();

// // MQTT client
// let mqttClient = null;
// let awsConnectionStatus = 'disconnected';
// let mqttConnectionStatus = 'disconnected';

// // Enhanced in-memory storage
// const awsThings = new Map();
// const deviceStatus = new Map();
// const groups = new Map();
// const statusHistory = [];

// // FIXED: Proper MQTT topic tracking and subscription management
// const subscribedTopics = new Set();
// const deviceLastSeen = new Map();
// const deviceHeartbeat = new Map();

// // State tracking for change detection
// const deviceStateHashes = new Map();
// const lastBroadcastTimes = new Map();

// // FIXED: Enhanced broadcast function with proper message structure
// function broadcast(message) {
//   if (!message || !message.type) {
//     console.warn('⚠️ Invalid broadcast message:', message);
//     return;
//   }

//   message.timestamp = message.timestamp || new Date().toISOString();

//   const messageStr = JSON.stringify(message);
//   let sentCount = 0;

//   clients.forEach(client => {
//     if (client.readyState === WebSocket.OPEN) {
//       try {
//         client.send(messageStr);
//         sentCount++;
//       } catch (error) {
//         console.error('❌ Error broadcasting to client:', error);
//         clients.delete(client);
//       }
//     } else {
//       clients.delete(client);
//     }
//   });

//   if (sentCount > 0) {
//     console.log(`📢 Broadcasted ${message.type} to ${sentCount} clients - Device: ${message.deviceId || 'N/A'}`);
//   }
// }

// // FIXED: Proper relay-to-feature mapping with validation
// function mapRelayStatesToFeatures(device, relayStates) {
//   try {
//     const relayConfig = device.relayConfig || {
//       relay1: 'siren',
//       relay2: 'beacon',
//       relay3: 'announcement',
//       relay4: 'dispenser'
//     };

//     const features = {
//       siren: false,
//       beacon: false,
//       announcement: false,
//       dispenser: false
//     };

//     // Map relay states to features
//     Object.entries(relayConfig).forEach(([relay, feature]) => {
//       if (relayStates[relay] === true) {
//         features[feature] = true;
//       }
//     });

//     return {
//       ...device,
//       features,
//       relayStates,
//       relayConfig,
//       status: 'online', // Device is responding
//       lastSeen: new Date().toLocaleTimeString(),
//       lastUpdateTime: new Date().toISOString()
//     };
//   } catch (error) {
//     console.error('❌ Error mapping relay states:', error);
//     return device;
//   }
// }

// // FIXED: Enhanced shadow loading with proper error handling
// async function loadDeviceStatusFromShadow(deviceId) {
//   try {
//     if (!shadowClient) {
//       console.warn('⚠️ Shadow client not initialized');
//       return null;
//     }

//     console.log(`📊 Fetching shadow for device: ${deviceId}`);
    
//     const shadowData = await shadowClient.getThingShadow({
//       thingName: deviceId
//     }).promise();

//     const shadowPayload = JSON.parse(shadowData.payload);
//     console.log(`📋 Shadow data for ${deviceId}:`, shadowPayload);

//     // Process both reported and desired states
//     let relayStates = null;

//     // Prefer reported state, fallback to desired
//     if (shadowPayload.state && shadowPayload.state.reported) {
//       const reported = shadowPayload.state.reported;
//       relayStates = {
//         relay1: Boolean(reported.relay1),
//         relay2: Boolean(reported.relay2),
//         relay3: Boolean(reported.relay3),
//         relay4: Boolean(reported.relay4)
//       };
//       console.log(`📡 Using reported shadow state for ${deviceId}:`, relayStates);
//     } else if (shadowPayload.state && shadowPayload.state.desired) {
//       const desired = shadowPayload.state.desired;
//       relayStates = {
//         relay1: Boolean(desired.relay1),
//         relay2: Boolean(desired.relay2),
//         relay3: Boolean(desired.relay3),
//         relay4: Boolean(desired.relay4)
//       };
//       console.log(`📡 Using desired shadow state for ${deviceId}:`, relayStates);
//     }

//     if (relayStates) {
//       // Update device status with shadow data
//       processDeviceStatusUpdate(deviceId, {
//         ...relayStates,
//         signal_strength: 85,
//         battery_level: 100,
//         timestamp: new Date().toISOString(),
//         source: 'shadow_fetch'
//       });

//       return relayStates;
//     } else {
//       console.log(`📋 No state found in shadow for ${deviceId}`);
//       return null;
//     }
//   } catch (error) {
//     console.warn(`⚠️ Failed to load shadow for ${deviceId}:`, error.message);
    
//     // If shadow doesn't exist, create initial state
//     if (error.code === 'ResourceNotFoundException') {
//       await createInitialShadow(deviceId);
//     }
    
//     return null;
//   }
// }

// // FIXED: Create initial shadow for new devices
// async function createInitialShadow(deviceId) {
//   try {
//     const initialState = {
//       state: {
//         desired: {
//           relay1: false,
//           relay2: false,
//           relay3: false,
//           relay4: false
//         }
//       }
//     };

//     await shadowClient.updateThingShadow({
//       thingName: deviceId,
//       payload: JSON.stringify(initialState)
//     }).promise();

//     console.log(`✅ Created initial shadow for ${deviceId}`);
//   } catch (error) {
//     console.warn(`⚠️ Failed to create initial shadow for ${deviceId}:`, error.message);
//   }
// }

// // FIXED: Enhanced device status processing with proper validation
// function processDeviceStatusUpdate(thingName, data) {
//   try {
//     console.log(`🔄 Processing status update for ${thingName}:`, data);

//     if (!awsThings.has(thingName)) {
//       console.log(`⚠️ Received status for unknown thing: ${thingName}`);
//       return;
//     }

//     const device = awsThings.get(thingName);

//     // Create the new relay states with proper validation
//     const newRelayStates = {
//       relay1: Boolean(data.relay1),
//       relay2: Boolean(data.relay2),
//       relay3: Boolean(data.relay3),
//       relay4: Boolean(data.relay4)
//     };

//     // Update device with new data
//     const updatedDevice = mapRelayStatesToFeatures(device, newRelayStates);
//     updatedDevice.signalStrength = data.signal_strength || device.signalStrength || 85;
//     updatedDevice.batteryLevel = data.battery_level || device.batteryLevel || 100;
//     updatedDevice.status = 'online'; // Device is responding
//     updatedDevice.lastSeen = new Date().toLocaleTimeString();
//     updatedDevice.lastUpdateTime = data.timestamp || new Date().toISOString();

//     // Update last seen tracking
//     deviceLastSeen.set(thingName, Date.now());

//     // Store updated device
//     awsThings.set(thingName, updatedDevice);
//     deviceStatus.set(thingName, {
//       ...updatedDevice,
//       lastUpdateTime: new Date().toISOString()
//     });

//     console.log(`📢 Broadcasting status update for ${thingName}`, updatedDevice.features);
    
//     // Broadcast status update
//     broadcast({
//       type: 'device_status_update',
//       deviceId: thingName,
//       device: updatedDevice,
//       timestamp: new Date().toISOString(),
//       source: data.source || 'status_update'
//     });

//   } catch (error) {
//     console.error('❌ Error processing device status update:', error);
//   }
// }

// // FIXED: Proper MQTT initialization with comprehensive subscriptions
// function initializeMQTT() {
//   try {
//     console.log('🔌 Initializing MQTT connection...');

//     // Load certificates from files
//     const privateKeyPath = process.env.AWS_IOT_PRIVATE_KEY_PATH || './certs/pri.pem.key';
//     const certificatePath = process.env.AWS_IOT_CERTIFICATE_PATH || './certs/certi.pem.crt';
//     const caCertificatePath = process.env.AWS_IOT_CA_CERTIFICATE_PATH || './certs/AmazonRootCA1.pem';

//     let privateKey, certificate, caCertificate;

//     try {
//       privateKey = fs.readFileSync(privateKeyPath, 'utf8');
//       certificate = fs.readFileSync(certificatePath, 'utf8');
//       caCertificate = fs.readFileSync(caCertificatePath, 'utf8');
//       console.log('✅ Loaded MQTT certificates from files');
//     } catch (fileError) {
//       console.log('📄 Certificate files not found, trying environment variables...');
      
//       // Fallback to environment variables
//       privateKey = process.env.AWS_IOT_PRIVATE_KEY ? 
//         process.env.AWS_IOT_PRIVATE_KEY.replace(/\\n/g, '\n') : null;
//       certificate = process.env.AWS_IOT_CERTIFICATE ? 
//         process.env.AWS_IOT_CERTIFICATE.replace(/\\n/g, '\n') : null;
//       caCertificate = process.env.AWS_IOT_CA_CERTIFICATE ? 
//         process.env.AWS_IOT_CA_CERTIFICATE.replace(/\\n/g, '\n') : null;

//       if (!privateKey || !certificate || !caCertificate) {
//         throw new Error('MQTT certificates not found in files or environment variables');
//       }
//       console.log('✅ Loaded MQTT certificates from environment variables');
//     }

//     const mqttUrl = `mqtts://${iotEndpoint}:8883`;

//     mqttClient = mqtt.connect(mqttUrl, {
//       clientId: `elpro-backend-${Date.now()}`,
//       clean: true,
//       connectTimeout: 30000,
//       reconnectPeriod: 5000,
//       protocol: 'mqtts',
//       key: Buffer.from(privateKey, 'utf8'),
//       cert: Buffer.from(certificate, 'utf8'),
//       ca: Buffer.from(caCertificate, 'utf8'),
//       rejectUnauthorized: true
//     });

//     mqttClient.on('connect', () => {
//       console.log('✅ MQTT connected - Real-time updates active');
//       mqttConnectionStatus = 'connected';

//       // Subscribe to wildcard status topics for all devices
//       const statusTopicPattern = '+/relay/status';
//       mqttClient.subscribe(statusTopicPattern, (err) => {
//         if (err) {
//           console.error('❌ Failed to subscribe to status topics:', err);
//         } else {
//           console.log(`📡 Subscribed to MQTT pattern: ${statusTopicPattern}`);
//           subscribedTopics.add(statusTopicPattern);
//         }
//       });

//       // Subscribe to existing devices
//       subscribeToAllDevices();

//       broadcastConnectionStatus();
//     });

//     mqttClient.on('message', (topic, message) => {
//       try {
//         const data = JSON.parse(message.toString());
//         const topicParts = topic.split('/');

//         console.log(`📡 MQTT message received on ${topic}:`, data);

//         if (topicParts.length === 3 && topicParts[1] === 'relay') {
//           const deviceId = topicParts[0];
//           const messageType = topicParts[2]; // 'status' or 'control'

//           if (messageType === 'status') {
//             // Real device status update
//             console.log(`📡 Real-time MQTT status from ${deviceId}:`, data);
//             processDeviceStatusUpdate(deviceId, {
//               ...data,
//               timestamp: new Date().toISOString(),
//               source: 'mqtt_device_status'
//             });
//           } else if (messageType === 'control') {
//             // Command acknowledgment
//             console.log(`📤 MQTT control acknowledgment from ${deviceId}:`, data);
//           }
//         }
//       } catch (error) {
//         console.error('❌ Error processing MQTT message:', error);
//       }
//     });

//     mqttClient.on('error', (error) => {
//       console.error('❌ MQTT connection error:', error);
//       mqttConnectionStatus = 'error';
//       broadcastConnectionStatus();
//     });

//     mqttClient.on('close', () => {
//       console.log('🔌 MQTT connection closed');
//       mqttConnectionStatus = 'disconnected';
//       broadcastConnectionStatus();
//     });

//     mqttClient.on('reconnect', () => {
//       console.log('🔄 MQTT reconnecting...');
//       mqttConnectionStatus = 'connecting';
//       broadcastConnectionStatus();
//     });

//   } catch (error) {
//     console.error('❌ Failed to initialize MQTT:', error);
//     mqttConnectionStatus = 'error';
    
//     // Continue without MQTT but use shadow polling
//     console.log('🔄 Continuing with shadow polling instead of MQTT...');
//     startShadowPollingForAllDevices();
//   }
// }

// // FIXED: Subscribe to status topics for individual devices
// function subscribeToDeviceTopics(deviceId) {
//   if (!mqttClient || !mqttClient.connected) {
//     console.log(`⚠️ MQTT not connected, cannot subscribe to ${deviceId} topics`);
//     return;
//   }

//   const statusTopic = `${deviceId}/relay/status`;
//   const controlTopic = `${deviceId}/relay/control`;

//   if (!subscribedTopics.has(statusTopic)) {
//     mqttClient.subscribe(statusTopic, (err) => {
//       if (err) {
//         console.error(`❌ Failed to subscribe to ${statusTopic}:`, err);
//       } else {
//         console.log(`📡 Subscribed to device status: ${statusTopic}`);
//         subscribedTopics.add(statusTopic);
//       }
//     });
//   }

//   if (!subscribedTopics.has(controlTopic)) {
//     mqttClient.subscribe(controlTopic, (err) => {
//       if (err) {
//         console.error(`❌ Failed to subscribe to ${controlTopic}:`, err);
//       } else {
//         console.log(`📡 Subscribed to device control: ${controlTopic}`);
//         subscribedTopics.add(controlTopic);
//       }
//     });
//   }
// }

// // FIXED: Subscribe to all registered devices
// function subscribeToAllDevices() {
//   console.log('📡 Subscribing to all registered device topics...');
  
//   awsThings.forEach((device, deviceId) => {
//     subscribeToDeviceTopics(deviceId);
//   });
// }

// // FIXED: Start shadow polling as fallback
// function startShadowPollingForAllDevices() {
//   console.log('🔄 Starting shadow polling for all devices (MQTT fallback)...');
  
//   awsThings.forEach((device, deviceId) => {
//     startShadowPolling(deviceId);
//   });
// }

// function startShadowPolling(deviceId) {
//   // Initial fetch
//   setTimeout(() => {
//     loadDeviceStatusFromShadow(deviceId);
//   }, 1000);

//   // Polling interval (only if MQTT is not working)
//   if (mqttConnectionStatus !== 'connected') {
//     const interval = setInterval(async () => {
//       if (!awsThings.has(deviceId)) {
//         clearInterval(interval);
//         return;
//       }

//       try {
//         await loadDeviceStatusFromShadow(deviceId);
//       } catch (error) {
//         console.warn(`⚠️ Shadow polling failed for ${deviceId}:`, error.message);
//       }
//     }, 15000); // Poll every 15 seconds as fallback
//   }
// }

// // FIXED: Enhanced startup process
// async function initializeAWSConnection() {
//   try {
//     console.log('🔍 Initializing AWS IoT connection...');

//     // Get IoT endpoint
//     if (process.env.AWS_IOT_ENDPOINT) {
//       iotEndpoint = process.env.AWS_IOT_ENDPOINT;
//     } else {
//       const result = await iot.describeEndpoint({ endpointType: 'iot:Data-ATS' }).promise();
//       iotEndpoint = result.endpointAddress;
//     }

//     // Initialize IoT Data and Shadow clients
//     iotData = new AWS.IotData({ endpoint: `https://${iotEndpoint}` });
//     shadowClient = new AWS.IotData({ endpoint: `https://${iotEndpoint}` });

//     // Test connection
//     await testAWSConnection();

//     awsConnectionStatus = 'connected';
//     console.log('✅ AWS IoT connection established');

//     // Load existing registered things from AWS
//     await loadExistingThings();

//     // Initialize MQTT for real-time updates
//     initializeMQTT();

//     // Broadcast connection status
//     broadcastConnectionStatus();

//   } catch (error) {
//     console.error('❌ Failed to initialize AWS IoT:', error.message);
//     awsConnectionStatus = 'error';
//     broadcastConnectionStatus();

//     // Even if AWS fails, start the server for local testing
//     console.log('🚀 Starting server in local mode...');
//   }
// }

// async function testAWSConnection() {
//   await iot.listThings({ maxResults: 1 }).promise();
//   console.log('✅ AWS IoT connection test successful');
// }

// // FIXED: Load existing things with immediate status fetching
// async function loadExistingThings() {
//   try {
//     console.log('📋 Loading existing AWS IoT Things...');
//     const result = await iot.listThings().promise();

//     let registeredCount = 0;
//     for (const thing of result.things) {
//       const isRegistered = thing.attributes?.registered === 'true';

//       if (isRegistered) {
//         const deviceData = createDeviceFromThing(thing);

//         // Store device data
//         awsThings.set(thing.thingName, deviceData);
//         deviceStatus.set(thing.thingName, {
//           ...deviceData,
//           lastUpdateTime: new Date().toISOString()
//         });

//         registeredCount++;

//         // FIXED: Load initial status from shadow immediately
//         setTimeout(async () => {
//           await loadDeviceStatusFromShadow(thing.thingName);
          
//           // Subscribe to MQTT topics if connected
//           if (mqttClient && mqttClient.connected) {
//             subscribeToDeviceTopics(thing.thingName);
//           }
//         }, registeredCount * 500); // Stagger the fetches
//       }
//     }

//     console.log(`✅ Loaded ${registeredCount} registered devices from AWS`);

//   } catch (error) {
//     console.error('❌ Error loading existing things:', error);
//   }
// }

// // Create device from thing with proper defaults
// function createDeviceFromThing(thing) {
//   let relayConfig;
//   try {
//     relayConfig = thing.attributes?.relayConfig ?
//       JSON.parse(thing.attributes.relayConfig) : {
//         relay1: 'siren',
//         relay2: 'beacon',
//         relay3: 'announcement',
//         relay4: 'dispenser'
//       };
//   } catch (error) {
//     relayConfig = {
//       relay1: 'siren',
//       relay2: 'beacon',
//       relay3: 'announcement',
//       relay4: 'dispenser'
//     };
//   }

//   return {
//     id: thing.thingName,
//     name: thing.attributes?.displayName || thing.thingName,
//     location: thing.attributes?.location || '',
//     lat: parseFloat(thing.attributes?.latitude || '12.9716'),
//     lng: parseFloat(thing.attributes?.longitude || '77.5946'),
//     group: thing.attributes?.group || null,
//     status: 'offline', // Start as offline until we get real status
//     features: {
//       siren: false,
//       beacon: false,
//       announcement: false,
//       dispenser: false
//     },
//     relayStates: {
//       relay1: false,
//       relay2: false,
//       relay3: false,
//       relay4: false
//     },
//     relayConfig,
//     created: new Date().toISOString(),
//     lastSeen: 'Never',
//     signalStrength: 0,
//     batteryLevel: 100,
//     thingArn: thing.thingArn,
//     thingTypeName: thing.thingTypeName,
//     version: thing.version
//   };
// }

// // FIXED: WebSocket client handling with enhanced connection status
// wss.on('connection', (ws) => {
//   console.log('🔗 Client connected via WebSocket');
//   clients.add(ws);

//   // Send immediate connection status
//   const connectionData = {
//     type: 'connection_status',
//     status: awsConnectionStatus,
//     mqttConnected: mqttClient?.connected || false,
//     endpoint: iotEndpoint || 'Not configured',
//     timestamp: new Date().toISOString()
//   };

//   try {
//     ws.send(JSON.stringify(connectionData));
//   } catch (error) {
//     console.warn('Failed to send connection status to new client:', error);
//   }

//   // Send current device states immediately
//   setTimeout(() => {
//     console.log(`📤 Sending ${awsThings.size} device states to new client`);
//     let sentCount = 0;

//     awsThings.forEach((device, deviceId) => {
//       try {
//         const deviceMessage = {
//           type: 'device_status_update',
//           deviceId,
//           device,
//           timestamp: new Date().toISOString(),
//           source: 'initial_sync'
//         };
//         ws.send(JSON.stringify(deviceMessage));
//         sentCount++;
//       } catch (error) {
//         console.warn(`Failed to send device ${deviceId} to client:`, error);
//       }
//     });

//     console.log(`✅ Sent ${sentCount} device states to new client`);
//   }, 500);

//   ws.on('message', (message) => {
//     try {
//       const data = JSON.parse(message);
//       if (data.type === 'ping') {
//         ws.send(JSON.stringify({
//           type: 'pong',
//           timestamp: new Date().toISOString()
//         }));
//       }
//     } catch (error) {
//       console.warn('⚠️ Invalid WebSocket message:', error);
//     }
//   });

//   ws.on('close', () => {
//     console.log('🔌 WebSocket client disconnected');
//     clients.delete(ws);
//   });

//   ws.on('error', (error) => {
//     console.error('❌ WebSocket error:', error);
//     clients.delete(ws);
//   });
// });

// function broadcastConnectionStatus() {
//   broadcast({
//     type: 'connection_status',
//     status: awsConnectionStatus,
//     mqttConnected: mqttClient?.connected || false,
//     endpoint: iotEndpoint || 'Not configured'
//   });
// }

// // API Routes

// app.get('/api/health', (req, res) => {
//   const onlineDevices = Array.from(awsThings.values()).filter(d => d.status === 'online').length;
//   const activeDevices = Array.from(awsThings.values()).filter(d => d.status === 'active').length;
//   const offlineDevices = Array.from(awsThings.values()).filter(d => d.status === 'offline').length;

//   res.json({
//     status: 'healthy',
//     timestamp: new Date().toISOString(),
//     aws: awsConnectionStatus,
//     mqtt: mqttClient?.connected || false,
//     endpoint: iotEndpoint || 'Not configured',
//     things: awsThings.size,
//     clients: clients.size,
//     deviceStats: {
//       total: awsThings.size,
//       online: onlineDevices,
//       active: activeDevices,
//       offline: offlineDevices
//     },
//     lastActivity: statusHistory.length > 0 ? statusHistory[0].timestamp : null
//   });
// });

// // FIXED: Register thing with immediate status fetching and MQTT subscription
// app.post('/api/iot/register-thing', async (req, res) => {
//   try {
//     const { thingName, name, location, lat, lng, group, relayConfig } = req.body;

//     if (!thingName) {
//       return res.status(400).json({
//         success: false,
//         error: 'Thing name is required'
//       });
//     }

//     // Check if thing exists in AWS
//     let awsThing;
//     try {
//       awsThing = await iot.describeThing({ thingName }).promise();
//     } catch (error) {
//       return res.status(404).json({
//         success: false,
//         error: 'Thing not found in AWS IoT Core'
//       });
//     }

//     if (awsThings.has(thingName)) {
//       return res.status(409).json({
//         success: false,
//         error: 'Thing already registered'
//       });
//     }

//     const finalRelayConfig = relayConfig || {
//       relay1: 'siren',
//       relay2: 'beacon',
//       relay3: 'announcement',
//       relay4: 'dispenser'
//     };

//     // Update thing attributes in AWS
//     try {
//       await iot.updateThing({
//         thingName,
//         attributePayload: {
//           attributes: {
//             ...awsThing.attributes,
//             displayName: name || thingName,
//             location: location || '',
//             latitude: String(lat || 12.9716),
//             longitude: String(lng || 77.5946),
//             group: group || '',
//             registered: 'true',
//             registeredAt: new Date().toISOString(),
//             relayConfig: JSON.stringify(finalRelayConfig)
//           }
//         }
//       }).promise();
//     } catch (updateError) {
//       console.warn('⚠️ Failed to update thing attributes:', updateError.message);
//     }

//     // Create device data structure
//     const deviceData = {
//       id: thingName,
//       name: name || thingName,
//       location: location || '',
//       lat: lat || 12.9716,
//       lng: lng || 77.5946,
//       group: group || null,
//       status: 'offline', // Start as offline until we get real status
//       features: {
//         siren: false,
//         beacon: false,
//         announcement: false,
//         dispenser: false
//       },
//       relayStates: {
//         relay1: false,
//         relay2: false,
//         relay3: false,
//         relay4: false
//       },
//       relayConfig: finalRelayConfig,
//       created: new Date().toISOString(),
//       lastSeen: 'Never',
//       signalStrength: 0,
//       batteryLevel: 100,
//       thingArn: awsThing.thingArn,
//       thingTypeName: awsThing.thingTypeName,
//       version: awsThing.version,
//       lastUpdateTime: new Date().toISOString()
//     };

//     // Store in memory
//     awsThings.set(thingName, deviceData);
//     deviceStatus.set(thingName, {
//       ...deviceData,
//       lastUpdateTime: new Date().toISOString()
//     });

//     // FIXED: Immediate status fetching and MQTT subscription
//     setTimeout(async () => {
//       console.log(`🔄 Starting immediate status sync for newly registered device: ${thingName}`);
      
//       // Try to load initial status from shadow
//       await loadDeviceStatusFromShadow(thingName);
      
//       // Subscribe to MQTT topics if connected
//       if (mqttClient && mqttClient.connected) {
//         subscribeToDeviceTopics(thingName);
//       } else {
//         // Start shadow polling as fallback
//         startShadowPolling(thingName);
//       }
//     }, 1000);

//     // Broadcast device registration
//     broadcast({
//       type: 'device_created',
//       device: deviceData,
//       timestamp: new Date().toISOString()
//     });

//     res.status(201).json({
//       success: true,
//       message: 'AWS IoT Thing registered successfully - Status fetching started',
//       device: deviceData
//     });

//   } catch (error) {
//     console.error('❌ Error registering thing:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to register thing',
//       message: error.message
//     });
//   }
// });

// // Additional API routes remain the same...
// app.get('/api/iot/available-things', async (req, res) => {
//   try {
//     const result = await iot.listThings().promise();

//     const thingsList = result.things
//       .filter(thing => !awsThings.has(thing.thingName))
//       .map(thing => ({
//         thingName: thing.thingName,
//         thingArn: thing.thingArn,
//         attributes: thing.attributes || {},
//         creationDate: thing.creationDate,
//         isRegistered: false
//       }));

//     res.json({
//       success: true,
//       things: thingsList
//     });

//   } catch (error) {
//     console.error('❌ Error listing available things:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to list available things',
//       message: error.message,
//       things: []
//     });
//   }
// });

// app.get('/api/iot/things', async (req, res) => {
//   try {
//     // Return current device list with real-time status
//     const deviceList = Array.from(awsThings.values()).map(device => ({
//       ...device,
//       // Ensure all required fields are present
//       features: device.features || {
//         siren: false,
//         beacon: false,
//         announcement: false,
//         dispenser: false
//       },
//       status: device.status || 'offline',
//       lastSeen: device.lastSeen || 'Never',
//       lastUpdateTime: device.lastUpdateTime || new Date().toISOString()
//     }));

//     res.json({
//       success: true,
//       devices: deviceList,
//       timestamp: new Date().toISOString(),
//       count: deviceList.length
//     });
//   } catch (error) {
//     console.error('❌ Error listing devices:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to list devices',
//       message: error.message,
//       devices: []
//     });
//   }
// });

// // FIXED: Delete thing with proper cleanup
// app.delete('/api/iot/things/:thingName', async (req, res) => {
//   try {
//     const thingName = req.params.thingName;

//     // Update AWS thing to remove registered flag
//     try {
//       const awsThing = await iot.describeThing({ thingName }).promise();
//       const newAttributes = { ...awsThing.attributes };
//       delete newAttributes.registered;
//       delete newAttributes.registeredAt;
//       delete newAttributes.displayName;

//       await iot.updateThing({
//         thingName,
//         attributePayload: { attributes: newAttributes }
//       }).promise();
//     } catch (awsError) {
//       console.warn('⚠️ AWS update failed:', awsError.message);
//     }

//     // Unsubscribe from MQTT topics
//     if (mqttClient && mqttClient.connected) {
//       const statusTopic = `${thingName}/relay/status`;
//       const controlTopic = `${thingName}/relay/control`;
      
//       mqttClient.unsubscribe(statusTopic);
//       mqttClient.unsubscribe(controlTopic);
//       subscribedTopics.delete(statusTopic);
//       subscribedTopics.delete(controlTopic);
      
//       console.log(`📡 Unsubscribed from ${thingName} MQTT topics`);
//     }

//     // Remove from memory
//     awsThings.delete(thingName);
//     deviceStatus.delete(thingName);
//     deviceStateHashes.delete(thingName);
//     lastBroadcastTimes.delete(thingName);
//     deviceLastSeen.delete(thingName);
//     deviceHeartbeat.delete(thingName);

//     // Broadcast deletion
//     broadcast({
//       type: 'device_deleted',
//       deviceId: thingName,
//       timestamp: new Date().toISOString()
//     });

//     res.json({
//       success: true,
//       message: 'Device unregistered successfully'
//     });

//   } catch (error) {
//     console.error('❌ Error deleting device:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to delete device',
//       message: error.message
//     });
//   }
// });

// // FIXED: Enhanced command sending with immediate shadow update
// app.post('/api/iot/command', async (req, res) => {
//   try {
//     const { deviceId, command, data } = req.body;

//     if (!deviceId || !command) {
//       return res.status(400).json({
//         success: false,
//         error: 'Device ID and command are required'
//       });
//     }

//     if (!awsThings.has(deviceId)) {
//       return res.status(404).json({
//         success: false,
//         error: 'Device not found'
//       });
//     }

//     const device = awsThings.get(deviceId);
//     const controlTopic = `${deviceId}/relay/control`;

//     // Start with current relay states
//     let payload = {
//       relay1: device.relayStates?.relay1 || false,
//       relay2: device.relayStates?.relay2 || false,
//       relay3: device.relayStates?.relay3 || false,
//       relay4: device.relayStates?.relay4 || false
//     };

//     // Handle feature toggle commands
//     if (command.includes('_on') || command.includes('_off') || command.startsWith('toggle_')) {
//       const feature = command.replace('toggle_', '').replace('_on', '').replace('_off', '');

//       // Find the correct relay for this feature
//       const relayForFeature = Object.entries(device.relayConfig || {}).find(([relay, configuredFeature]) =>
//         configuredFeature === feature
//       );

//       if (relayForFeature) {
//         const [relayNum] = relayForFeature;
//         const currentState = device.relayStates?.[relayNum] || false;

//         // Determine new state based on command
//         let newState;
//         if (command.includes('_on')) {
//           newState = true;
//         } else if (command.includes('_off')) {
//           newState = false;
//         } else if (command.includes('toggle')) {
//           newState = !currentState;
//         }

//         // ONLY update the specific relay for this feature
//         payload[relayNum] = newState;

//         console.log(`🎛️ Feature ${feature} mapped to ${relayNum}: ${currentState} → ${newState}`);

//         // Update device state locally for immediate response
//         const updatedRelayStates = { ...device.relayStates, [relayNum]: newState };
//         const optimisticDevice = mapRelayStatesToFeatures(device, updatedRelayStates);
//         awsThings.set(deviceId, optimisticDevice);
//         deviceStatus.set(deviceId, {
//           ...optimisticDevice,
//           lastUpdateTime: new Date().toISOString()
//         });

//         // Immediate broadcast for instant UI feedback
//         broadcast({
//           type: 'device_status_update',
//           deviceId,
//           device: optimisticDevice,
//           timestamp: new Date().toISOString(),
//           source: 'command_optimistic'
//         });
//       } else {
//         console.warn(`⚠️ No relay mapping found for feature: ${feature}`);
//       }
//     }

//     let commandSent = false;

//     // Try MQTT first
//     if (mqttClient && mqttClient.connected) {
//       mqttClient.publish(controlTopic, JSON.stringify(payload), (err) => {
//         if (!err) {
//           console.log(`📤 Command sent via MQTT to ${controlTopic}:`, payload);
//           commandSent = true;
//         }
//       });
//     }

//     // Fallback to IoT Data API
//     if (!commandSent && iotData) {
//       try {
//         await iotData.publish({
//           topic: controlTopic,
//           payload: JSON.stringify(payload)
//         }).promise();
//         console.log(`📤 Command sent via IoT Data API to ${controlTopic}:`, payload);
//         commandSent = true;
//       } catch (iotError) {
//         console.error('❌ IoT Data publish failed:', iotError.message);
//       }
//     }

//     // Update device shadow for persistence
//     if (shadowClient) {
//       try {
//         await shadowClient.updateThingShadow({
//           thingName: deviceId,
//           payload: JSON.stringify({
//             state: { desired: payload }
//           })
//         }).promise();
//         console.log(`📋 Device shadow updated for ${deviceId}`);
//       } catch (shadowError) {
//         console.warn('⚠️ Failed to update device shadow:', shadowError.message);
//       }
//     }

//     // Broadcast command sent
//     broadcast({
//       type: 'command_sent',
//       deviceId,
//       command,
//       topic: controlTopic,
//       payload,
//       timestamp: new Date().toISOString()
//     });

//     res.json({
//       success: true,
//       message: 'Command sent successfully',
//       method: commandSent ? (mqttClient?.connected ? 'MQTT' : 'IoT Data') : 'Simulated',
//       topic: controlTopic,
//       payload
//     });

//   } catch (error) {
//     console.error('❌ Error sending command:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to send command',
//       message: error.message
//     });
//   }
// });

// // FIXED: Enhanced scenario execution
// app.post('/api/iot/scenario', async (req, res) => {
//   try {
//     const { deviceIds, scenario, features } = req.body;

//     if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
//       return res.status(400).json({
//         success: false,
//         error: 'Device IDs array is required'
//       });
//     }

//     // Use features if provided, otherwise use scenario mapping
//     let targetFeatures;

//     if (features && typeof features === 'object') {
//       // Use the exact features provided
//       targetFeatures = {
//         siren: Boolean(features.siren),
//         beacon: Boolean(features.beacon),
//         announcement: Boolean(features.announcement),
//         dispenser: Boolean(features.dispenser)
//       };
//       console.log('🎭 Using provided features:', targetFeatures);
//     } else {
//       // Correct scenario feature mapping
//       const scenarioFeatures = {
//         'ALL': { siren: true, beacon: true, announcement: true, dispenser: true },
//         'WAR': { siren: true, beacon: false, announcement: true, dispenser: true },
//         'FIRE': { siren: true, beacon: true, announcement: true, dispenser: false },
//         'NATURAL': { siren: true, beacon: true, announcement: true, dispenser: false }
//       };

//       targetFeatures = scenarioFeatures[scenario] || scenarioFeatures['ALL'];
//       console.log(`🎭 Using scenario ${scenario} features:`, targetFeatures);
//     }

//     const results = [];

//     // Send commands to each device
//     for (const deviceId of deviceIds) {
//       try {
//         if (!awsThings.has(deviceId)) {
//           results.push({ deviceId, success: false, error: 'Device not found' });
//           continue;
//         }

//         const device = awsThings.get(deviceId);
//         const controlTopic = `${deviceId}/relay/control`;

//         // Proper feature to relay mapping
//         const relayConfig = device.relayConfig || {
//           relay1: 'siren',
//           relay2: 'beacon',
//           relay3: 'announcement',
//           relay4: 'dispenser'
//         };

//         // Create reverse mapping: feature -> relay
//         const featureToRelay = {};
//         Object.entries(relayConfig).forEach(([relay, feature]) => {
//           featureToRelay[feature] = relay;
//         });

//         // Build payload based on target features and device's relay config
//         const payload = {
//           relay1: false,
//           relay2: false,
//           relay3: false,
//           relay4: false
//         };

//         // Set relays based on target features
//         Object.entries(targetFeatures).forEach(([feature, shouldEnable]) => {
//           const relayForFeature = featureToRelay[feature];
//           if (relayForFeature) {
//             payload[relayForFeature] = Boolean(shouldEnable);
//             console.log(`🎛️ Feature ${feature} -> ${relayForFeature}: ${shouldEnable}`);
//           }
//         });

//         console.log(`📋 Device ${deviceId} relay mapping:`, relayConfig);
//         console.log(`📋 Device ${deviceId} final payload:`, payload);

//         // Update device state locally for immediate response
//         const optimisticDevice = mapRelayStatesToFeatures(device, payload);
//         awsThings.set(deviceId, optimisticDevice);
//         deviceStatus.set(deviceId, {
//           ...optimisticDevice,
//           lastUpdateTime: new Date().toISOString()
//         });

//         // Immediate broadcast
//         broadcast({
//           type: 'device_status_update',
//           deviceId,
//           device: optimisticDevice,
//           timestamp: new Date().toISOString(),
//           source: 'scenario_execution'
//         });

//         // Send command
//         let sent = false;
//         if (mqttClient && mqttClient.connected) {
//           mqttClient.publish(controlTopic, JSON.stringify(payload));
//           console.log(`📤 MQTT command sent to ${deviceId}:`, payload);
//           sent = true;
//         } else if (iotData) {
//           await iotData.publish({
//             topic: controlTopic,
//             payload: JSON.stringify(payload)
//           }).promise();
//           console.log(`📤 IoT Data command sent to ${deviceId}:`, payload);
//           sent = true;
//         }

//         // Update shadow
//         if (shadowClient) {
//           try {
//             await shadowClient.updateThingShadow({
//               thingName: deviceId,
//               payload: JSON.stringify({
//                 state: { desired: payload }
//               })
//             }).promise();
//             console.log(`📋 Shadow updated for ${deviceId}`);
//           } catch (shadowError) {
//             console.warn(`⚠️ Failed to update shadow for ${deviceId}:`, shadowError.message);
//           }
//         }

//         results.push({
//           deviceId,
//           success: true,
//           method: sent ? 'AWS' : 'Simulated',
//           topic: controlTopic,
//           payload,
//           features: targetFeatures
//         });

//       } catch (error) {
//         console.error(`❌ Error executing scenario for device ${deviceId}:`, error);
//         results.push({ deviceId, success: false, error: error.message });
//       }
//     }

//     // Broadcast scenario execution
//     broadcast({
//       type: 'scenario_executed',
//       scenario: {
//         name: scenario,
//         features: targetFeatures
//       },
//       deviceIds,
//       results,
//       timestamp: new Date().toISOString()
//     });

//     const successful = results.filter(r => r.success).length;
//     res.json({
//       success: true,
//       message: `Scenario executed on ${successful}/${deviceIds.length} devices`,
//       scenario: scenario,
//       features: targetFeatures,
//       devicesAffected: deviceIds.length,
//       results
//     });

//   } catch (error) {
//     console.error('❌ Error executing scenario:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to execute scenario',
//       message: error.message
//     });
//   }
// });

// // FIXED: Manual status sync endpoint
// app.post('/api/iot/sync-status/:deviceId', async (req, res) => {
//   try {
//     const deviceId = req.params.deviceId;

//     if (!awsThings.has(deviceId)) {
//       return res.status(404).json({
//         success: false,
//         error: 'Device not found'
//       });
//     }

//     console.log('📊 Manual status sync requested for:', deviceId);

//     // Force immediate status fetch
//     const statusData = await loadDeviceStatusFromShadow(deviceId);

//     if (statusData) {
//       const device = awsThings.get(deviceId);
//       res.json({
//         success: true,
//         message: 'Status synced successfully',
//         device: device,
//         statusData: statusData
//       });
//     } else {
//       res.json({
//         success: true,
//         message: 'Status sync attempted - no data available',
//         device: awsThings.get(deviceId)
//       });
//     }

//   } catch (error) {
//     console.error('❌ Error in manual status sync:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to sync status',
//       message: error.message
//     });
//   }
// });

// // Manual status update endpoint for testing
// app.post('/api/iot/manual-status-update/:deviceId', async (req, res) => {
//   try {
//     const deviceId = req.params.deviceId;
//     const { relay1, relay2, relay3, relay4, signal_strength, battery_level } = req.body;

//     if (!awsThings.has(deviceId)) {
//       return res.status(404).json({
//         success: false,
//         error: 'Device not found'
//       });
//     }

//     const statusData = {
//       relay1: Boolean(relay1),
//       relay2: Boolean(relay2),
//       relay3: Boolean(relay3),
//       relay4: Boolean(relay4),
//       signal_strength: signal_strength || 85,
//       battery_level: battery_level || 100
//     };

//     console.log('📡 Manual status update for:', deviceId, statusData);

//     // Process the status update immediately
//     processDeviceStatusUpdate(deviceId, statusData);

//     res.json({
//       success: true,
//       message: 'Status updated successfully',
//       deviceId,
//       statusData
//     });

//   } catch (error) {
//     console.error('❌ Error in manual status update:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to update status',
//       message: error.message
//     });
//   }
// });

// // Force status refresh for all devices
// app.post('/api/iot/refresh-all-status', async (req, res) => {
//   try {
//     console.log('🔄 Manual refresh requested for all devices');
    
//     const results = [];
//     const deviceIds = Array.from(awsThings.keys());
    
//     for (const deviceId of deviceIds) {
//       try {
//         const statusData = await loadDeviceStatusFromShadow(deviceId);
//         results.push({
//           deviceId,
//           success: true,
//           hasData: !!statusData
//         });
//       } catch (error) {
//         results.push({
//           deviceId,
//           success: false,
//           error: error.message
//         });
//       }
//     }

//     res.json({
//       success: true,
//       message: `Status refresh completed for ${deviceIds.length} devices`,
//       results
//     });

//   } catch (error) {
//     console.error('❌ Error in refresh all status:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to refresh status',
//       message: error.message
//     });
//   }
// });

// // Groups API
// app.get('/api/groups', (req, res) => {
//   const groupList = Array.from(groups.values());
//   res.json({
//     success: true,
//     groups: groupList
//   });
// });

// app.post('/api/groups', (req, res) => {
//   try {
//     const { name, description, color, deviceIds } = req.body;

//     if (!name) {
//       return res.status(400).json({
//         success: false,
//         error: 'Group name is required'
//       });
//     }

//     const group = {
//       id: `group-${Date.now()}`,
//       name,
//       description: description || '',
//       color: color || 'blue',
//       devices: deviceIds || [],
//       created: new Date().toISOString()
//     };

//     groups.set(group.id, group);

//     broadcast({
//       type: 'group_created',
//       group,
//       timestamp: new Date().toISOString()
//     });

//     res.status(201).json({
//       success: true,
//       message: 'Group created successfully',
//       group
//     });

//   } catch (error) {
//     console.error('❌ Error creating group:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to create group',
//       message: error.message
//     });
//   }
// });

// // Get system statistics
// app.get('/api/statistics', (req, res) => {
//   try {
//     const stats = {
//       totalThings: awsThings.size,
//       onlineThings: Array.from(awsThings.values()).filter(d => d.status === 'online').length,
//       activeThings: Array.from(awsThings.values()).filter(d => d.status === 'active').length,
//       offlineThings: Array.from(awsThings.values()).filter(d => d.status === 'offline').length,
//       totalGroups: groups.size,
//       mqttConnected: mqttClient ? mqttClient.connected : false,
//       awsConnectionStatus,
//       iotEndpoint: iotEndpoint || 'Not configured',
//       lastStatusUpdate: statusHistory.length > 0 ? statusHistory[0].timestamp : null,
//       systemUptime: process.uptime(),
//       connectedClients: clients.size,
//       subscribedTopics: subscribedTopics.size
//     };

//     res.json({
//       success: true,
//       statistics: stats,
//       timestamp: new Date().toISOString()
//     });

//   } catch (error) {
//     console.error('❌ Error getting statistics:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to get statistics',
//       message: error.message
//     });
//   }
// });

// // Get status history
// app.get('/api/history', (req, res) => {
//   try {
//     const limit = parseInt(req.query.limit) || 50;
//     const deviceId = req.query.deviceId;

//     let history = statusHistory;

//     if (deviceId) {
//       history = history.filter(entry => entry.deviceId === deviceId);
//     }

//     res.json({
//       success: true,
//       history: history.slice(0, limit),
//       total: history.length,
//       timestamp: new Date().toISOString()
//     });

//   } catch (error) {
//     console.error('❌ Error getting history:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to get history',
//       message: error.message
//     });
//   }
// });

// // Error handling middleware
// app.use((error, req, res, next) => {
//   console.error('❌ Unhandled error:', error);
//   res.status(500).json({
//     success: false,
//     error: 'Internal server error',
//     message: error.message
//   });
// });

// // 404 handler
// app.use((req, res) => {
//   res.status(404).json({
//     success: false,
//     error: 'Not found',
//     message: `Route ${req.method} ${req.path} not found`
//   });
// });

// // Start HTTP server
// server.listen(PORT, () => {
//   console.log(`🚀 ELPRO AWS IoT Backend Server running on port ${PORT}`);
//   console.log(`🌐 WebSocket server running on port ${WS_PORT}`);
//   console.log(`📡 CORS enabled for frontend connections`);

//   // Initialize AWS connection
//   initializeAWSConnection();

//   console.log('\n📋 Available API Endpoints:');
//   console.log('  GET  /api/health - Health check');
//   console.log('  GET  /api/iot/things - List registered devices');
//   console.log('  GET  /api/iot/available-things - List unregistered things');
//   console.log('  POST /api/iot/register-thing - Register existing thing');
//   console.log('  DELETE /api/iot/things/:thingName - Unregister thing');
//   console.log('  POST /api/iot/command - Send MQTT command');
//   console.log('  POST /api/iot/scenario - Execute scenario');
//   console.log('  POST /api/iot/sync-status/:deviceId - Manual status sync');
//   console.log('  POST /api/iot/refresh-all-status - Refresh all device status');
//   console.log('  POST /api/iot/manual-status-update/:deviceId - Manual status update');
//   console.log('  GET  /api/groups - List groups');
//   console.log('  POST /api/groups - Create group');
//   console.log('  GET  /api/statistics - System statistics');
//   console.log('  GET  /api/history - Status history');

//   console.log('\n🧪 Testing without MQTT:');
//   console.log('  POST /api/iot/manual-status-update/your-device-id');
//   console.log('  Body: { "relay1": true, "relay2": false, "relay3": false, "relay4": false }');

//   console.log('\n🎯 FIXED STATUS FETCHING:');
//   console.log('  ✅ Automatic MQTT subscription for real-time status updates');
//   console.log('  ✅ Immediate status fetch on device registration');
//   console.log('  ✅ Shadow polling fallback when MQTT unavailable');
//   console.log('  ✅ Proper certificate loading from files or environment');
//   console.log('  ✅ Enhanced error handling and reconnection logic');
//   console.log('  ✅ Real-time status broadcasting via WebSocket');
// });

// // Graceful shutdown
// process.on('SIGINT', () => {
//   console.log('\n🛑 Shutting down gracefully...');

//   // Close MQTT connection
//   if (mqttClient) {
//     console.log('🔌 Disconnecting MQTT client...');
//     mqttClient.end();
//   }

//   // Close WebSocket server
//   wss.close(() => {
//     console.log('✅ WebSocket server closed');
//     server.close(() => {
//       console.log('✅ HTTP server closed');
//       console.log('👋 ELPRO Backend shutdown complete');
//       process.exit(0);
//     });
//   });
// });

// process.on('SIGTERM', () => {
//   console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
//   process.emit('SIGINT');
// });

// process.on('uncaughtException', (error) => {
//   console.error('❌ Uncaught Exception:', error);
//   process.exit(1);
// });

// process.on('unhandledRejection', (reason, promise) => {
//   console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
//   process.exit(1);
// });



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
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
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

const iot = new AWS.Iot();
let iotData = null;
let iotEndpoint = null;
let shadowClient = null;

// WebSocket server
const wss = new WebSocket.Server({ port: WS_PORT });
const clients = new Set();

// MQTT client
let mqttClient = null;
let awsConnectionStatus = 'disconnected';
let mqttConnectionStatus = 'disconnected';

// Enhanced in-memory storage
const awsThings = new Map();
const deviceStatus = new Map();
const groups = new Map();
const statusHistory = [];

// FIXED: Enhanced device tracking for proper status management
const subscribedTopics = new Set();
const deviceLastConnection = new Map(); // When device last sent connection status
const deviceLastRelayStatus = new Map(); // When device last sent relay status
const deviceLastAck = new Map(); // When device last sent ack (actual hardware status)
const deviceConnectedToAWS = new Map(); // Track AWS connectivity
const statusCheckIntervals = new Map(); // Store interval IDs for cleanup

// FIXED: Constants for status timing based on your requirements
// FIXED: Add proper timeout constants
const OFFLINE_TIMEOUT = 20 * 60 * 1000; // 20 minutes
const RELAY_STATUS_TIMEOUT = 2 * 60 * 1000; // 2 minutes for active status
const CONNECTION_CHECK_INTERVAL = 10 * 1000;
const STATUS_CHECK_INTERVAL = 30 * 1000;

// State tracking for change detection
const deviceStateHashes = new Map();
const lastBroadcastTimes = new Map();

// FIXED: Enhanced device status calculation based on connection and relay status timing
// FIXED: Enhanced device status calculation with clear active/online logic
// FIXED: The device IS sending relay status, so it should be ACTIVE
// MINIMAL CHANGE: Just replace this function in your backend (paste-2.txt)
// REVERT: Go back to original calculateDeviceStatus that shows "active" when features are on
// BACKEND: Modified calculateDeviceStatus to return dual status object
function calculateDeviceStatus(deviceId) {
  const now = Date.now();
  const lastConnection = deviceLastConnection.get(deviceId) || 0;
  const lastRelayStatus = deviceLastRelayStatus.get(deviceId) || 0;
  const lastAck = deviceLastAck.get(deviceId) || 0;
  const isConnectedToAWS = deviceConnectedToAWS.get(deviceId) || false;
  
  console.log(`📊 Status check for ${deviceId}:`);
  console.log(`   - lastConnection: ${new Date(lastConnection).toLocaleTimeString()}`);
  console.log(`   - lastRelayStatus: ${new Date(lastRelayStatus).toLocaleTimeString()}`);
  console.log(`   - lastAck: ${new Date(lastAck).toLocaleTimeString()}`);
  console.log(`   - awsConnected: ${isConnectedToAWS}`);
  
  // OFFLINE: No connection status for more than 20 minutes
  if (now - lastConnection > OFFLINE_TIMEOUT) {
    console.log(`📴 Device ${deviceId} is OFFLINE - no connection for ${Math.round((now - lastConnection) / 60000)} minutes`);
    return 'offline';
  }
  
  // Check if device is connected first
  if (!isConnectedToAWS || (now - lastConnection >= OFFLINE_TIMEOUT)) {
    console.log(`📴 Device ${deviceId} is OFFLINE - not properly connected`);
    return 'offline';
  }
  
  // Device is connected, now check if any features are active
  const device = awsThings.get(deviceId);
  if (!device) {
    console.log(`📴 Device ${deviceId} is OFFLINE - not found in registry`);
    return 'offline';
  }
  
  // Check for active features
  const hasActiveFeatures = device.features && Object.values(device.features).some(feature => feature === true);
  
  if (hasActiveFeatures) {
    console.log(`🟢 Device ${deviceId} is ACTIVE + ONLINE - connected with active features:`, 
      Object.entries(device.features || {}).filter(([k, v]) => v).map(([k]) => k).join(', '));
    // MINIMAL CHANGE: Return "active+online" to show both statuses
    return 'active+online';
  }
  
  // ONLINE: Device is connected but no features are active
  console.log(`🟡 Device ${deviceId} is ONLINE - connected but no active features`);
  return 'online';
}

// FIXED: Update device status with proper feature-based active logic
// MINIMAL CHANGE: Also replace this function in your backend (paste-2.txt)
function updateDeviceStatus(deviceId, newStatus = null) {
  if (!awsThings.has(deviceId)) {
    return;
  }
  
  const device = awsThings.get(deviceId);
  const calculatedStatus = newStatus || calculateDeviceStatus(deviceId);
  
  // Only update if status actually changed
  if (device.status !== calculatedStatus) {
    const previousStatus = device.status;
    device.status = calculatedStatus; // This will now always be 'online' when connected
    device.lastStatusChange = new Date().toISOString();
    
    // Update storage
    awsThings.set(deviceId, device);
    deviceStatus.set(deviceId, {
      ...device,
      lastUpdateTime: new Date().toISOString()
    });
    
    console.log(`📊 Device ${deviceId} status changed: ${previousStatus} → ${calculatedStatus}`);
    
    // Log feature states for debugging
    if (device.features) {
      const activeFeatures = Object.entries(device.features).filter(([k, v]) => v).map(([k]) => k);
      console.log(`🎛️ Device ${deviceId} active features: ${activeFeatures.length > 0 ? activeFeatures.join(', ') : 'none'}`);
    }
    
    // Broadcast status change
    broadcast({
      type: 'device_status_update',
      deviceId,
      device: device,
      timestamp: new Date().toISOString(),
      source: 'status_calculation'
    });
  }
}

// FIXED: Start monitoring for a device
function startDeviceStatusMonitoring(deviceId) {
  // Clear existing interval if any
  if (statusCheckIntervals.has(deviceId)) {
    clearInterval(statusCheckIntervals.get(deviceId));
  }
  
  // Start new monitoring interval
  const intervalId = setInterval(() => {
    updateDeviceStatus(deviceId);
  }, STATUS_CHECK_INTERVAL);
  
  statusCheckIntervals.set(deviceId, intervalId);
  console.log(`🔍 Started status monitoring for device: ${deviceId}`);
}

// FIXED: Stop monitoring for a device
function stopDeviceStatusMonitoring(deviceId) {
  if (statusCheckIntervals.has(deviceId)) {
    clearInterval(statusCheckIntervals.get(deviceId));
    statusCheckIntervals.delete(deviceId);
    console.log(`🛑 Stopped monitoring for device: ${deviceId}`);
  }
}

// FIXED: Record device activity based on MQTT topic type
function recordDeviceActivity(deviceId, topicType, data = null) {
  const now = Date.now();
  
  console.log(`📡 Recording activity for ${deviceId}: ${topicType} at ${new Date(now).toLocaleTimeString()}`);
  
  switch (topicType) {
    case 'connection':
      deviceLastConnection.set(deviceId, now);
      if (data && data.status === 'connected') {
        deviceConnectedToAWS.set(deviceId, true);
        console.log(`🔗 Device ${deviceId} sent connection status: CONNECTED`);
      } else {
        deviceConnectedToAWS.set(deviceId, false);
        console.log(`🔌 Device ${deviceId} sent connection status: DISCONNECTED`);
      }
      break;
      
    case 'relay_status':
      deviceLastRelayStatus.set(deviceId, now);
      console.log(`📊 Device ${deviceId} sent relay status update`);
      break;
      
    case 'relay_ack':
      deviceLastAck.set(deviceId, now);
      console.log(`✅ Device ${deviceId} sent relay acknowledgment (actual hardware status)`);
      break;
      
    case 'control':
      console.log(`📤 Control command sent to ${deviceId}`);
      break;
      
    default:
      console.log(`📡 General activity for ${deviceId}: ${topicType}`);
  }
  
  // Immediately update status after any activity
  updateDeviceStatus(deviceId);
}

// FIXED: Enhanced broadcast function with proper message structure
function broadcast(message) {
  if (!message || !message.type) {
    console.warn('⚠️ Invalid broadcast message:', message);
    return;
  }

  message.timestamp = message.timestamp || new Date().toISOString();

  const messageStr = JSON.stringify(message);
  let sentCount = 0;

  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(messageStr);
        sentCount++;
      } catch (error) {
        console.error('❌ Error broadcasting to client:', error);
        clients.delete(client);
      }
    } else {
      clients.delete(client);
    }
  });

  if (sentCount > 0) {
    console.log(`📢 Broadcasted ${message.type} to ${sentCount} clients - Device: ${message.deviceId || 'N/A'}`);
  }
}

// FIXED: Proper relay-to-feature mapping with validation
function mapRelayStatesToFeatures(device, relayStates) {
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
      lastSeen: new Date().toLocaleTimeString(),
      lastUpdateTime: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Error mapping relay states:', error);
    return device;
  }
}

// FIXED: Enhanced device status processing with proper activity tracking
// FIXED: Enhanced device status processing with immediate status recalculation
// FIXED: Reduce broadcasting to prevent dashboard refreshing
// MINIMAL CHANGE: Also replace this function in your backend (paste-2.txt)
function processDeviceStatusUpdate(thingName, data, source = 'unknown') {
  try {
    if (!awsThings.has(thingName)) {
      return;
    }

    const device = awsThings.get(thingName);
    const previousStatus = device.status;

    // Record activity
    if (source === 'connection') {
      recordDeviceActivity(thingName, 'connection', data);
    } else if (source === 'relay_ack') {
      recordDeviceActivity(thingName, 'relay_ack', data);
    } else if (source === 'relay_status') {
      recordDeviceActivity(thingName, 'relay_status', data);
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
      updatedDevice = mapRelayStatesToFeatures(device, newRelayStates);
    }

    updatedDevice.lastSeen = new Date().toLocaleTimeString();
    updatedDevice.lastUpdateTime = new Date().toISOString();
    
    // FIXED: Always use calculateDeviceStatus instead of setting 'active'
    updatedDevice.status = calculateDeviceStatus(thingName);

    // Store updated device
    awsThings.set(thingName, updatedDevice);
    deviceStatus.set(thingName, updatedDevice);

    // FIXED: Only broadcast on important changes to prevent refreshing
    const shouldBroadcast = (
      source === 'relay_ack' || // Hardware ACK
      previousStatus !== updatedDevice.status || // Status changed
      source === 'connection' // Connection change
    );

    if (shouldBroadcast) {
      console.log(`📢 Broadcasting important change for ${thingName}: ${previousStatus} → ${updatedDevice.status}`);
      broadcast({
        type: 'device_status_update',
        deviceId: thingName,
        device: updatedDevice,
        timestamp: new Date().toISOString(),
        source: source
      });
    } else {
      console.log(`🔄 Skipping broadcast for ${thingName} - routine update`);
    }

  } catch (error) {
    console.error('❌ Error processing device status update:', error);
  }
}

// FIXED: Proper MQTT initialization with comprehensive subscriptions for your topics
function initializeMQTT() {
  try {
    console.log('🔌 Initializing MQTT connection...');

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
      console.log('✅ MQTT connected - Real-time updates active');
      mqttConnectionStatus = 'connected';

      // FIXED: Subscribe to your specific topic patterns
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

      // Subscribe to existing devices
      subscribeToAllDevices();

      broadcastConnectionStatus();
    });

    // FIXED: Enhanced MQTT message handling for your specific topics
    mqttClient.on('message', (topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        const topicParts = topic.split('/');

        console.log(`📡 MQTT message received on ${topic}:`, data);

        if (topicParts.length >= 2) {
          const deviceId = topicParts[0];
          const messageType = topicParts[topicParts.length - 1]; // Last part of topic

          // Handle different message types based on your requirements
          switch (messageType) {
            case 'connection':
              // Handle device connection status: zonex_3/connection
              console.log(`🔗 Connection status from ${deviceId}:`, data);
              processDeviceStatusUpdate(deviceId, data, 'connection');
              break;

            case 'status':
              // Handle relay status updates: zonex_3/relay/status (every 10 seconds)
              console.log(`📊 Relay status from ${deviceId}:`, data);
              processDeviceStatusUpdate(deviceId, data, 'relay_status');
              break;

            case 'ack':
              // Handle relay acknowledgment: zonex_3/relay/ack (actual hardware status)
              console.log(`✅ Relay acknowledgment from ${deviceId}:`, data);
              processDeviceStatusUpdate(deviceId, data, 'relay_ack');
              break;

            case 'control':
              // Handle control commands: zonex_3/relay/control
              console.log(`📤 Control command acknowledgment from ${deviceId}:`, data);
              recordDeviceActivity(deviceId, 'control', data);
              break;

            default:
              console.log(`❓ Unknown message type: ${messageType} from ${deviceId}`);
          }
        }
      } catch (error) {
        console.error('❌ Error processing MQTT message:', error);
      }
    });

    mqttClient.on('error', (error) => {
      console.error('❌ MQTT connection error:', error);
      mqttConnectionStatus = 'error';
      broadcastConnectionStatus();
    });

    mqttClient.on('close', () => {
      console.log('🔌 MQTT connection closed');
      mqttConnectionStatus = 'disconnected';
      broadcastConnectionStatus();
    });

    mqttClient.on('reconnect', () => {
      console.log('🔄 MQTT reconnecting...');
      mqttConnectionStatus = 'connecting';
      broadcastConnectionStatus();
    });

  } catch (error) {
    console.error('❌ Failed to initialize MQTT:', error);
    mqttConnectionStatus = 'error';
    
    // Continue without MQTT but use shadow polling
    console.log('🔄 Continuing with shadow polling instead of MQTT...');
    startShadowPollingForAllDevices();
  }
}

// FIXED: Subscribe to all device topics for your specific patterns
function subscribeToDeviceTopics(deviceId) {
  if (!mqttClient || !mqttClient.connected) {
    console.log(`⚠️ MQTT not connected, cannot subscribe to ${deviceId} topics`);
    return;
  }

  // Subscribe to your specific topic patterns for this device
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

// Subscribe to all registered devices
function subscribeToAllDevices() {
  console.log('📡 Subscribing to all registered device topics...');
  
  awsThings.forEach((device, deviceId) => {
    subscribeToDeviceTopics(deviceId);
  });
}

// Enhanced shadow loading with proper status tracking
async function loadDeviceStatusFromShadow(deviceId) {
  try {
    if (!shadowClient) {
      console.warn('⚠️ Shadow client not initialized');
      return null;
    }

    console.log(`📊 Fetching shadow for device: ${deviceId}`);
    
    const shadowData = await shadowClient.getThingShadow({
      thingName: deviceId
    }).promise();

    const shadowPayload = JSON.parse(shadowData.payload);
    console.log(`📋 Shadow data for ${deviceId}:`, shadowPayload);

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
      console.log(`🔴 Using REPORTED shadow state for ${deviceId} (from device):`, relayStates);
      
      // Process as relay_ack since it's from the device
      processDeviceStatusUpdate(deviceId, {
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
      console.log(`🔵 Using DESIRED shadow state for ${deviceId} (command state):`, relayStates);
      
      // Don't update relay states from desired state, just note the device exists
      recordDeviceActivity(deviceId, 'shadow_fetch');
    }

    return relayStates;
  } catch (error) {
    console.warn(`⚠️ Failed to load shadow for ${deviceId}:`, error.message);
    
    // If shadow doesn't exist, create initial state
    if (error.code === 'ResourceNotFoundException') {
      await createInitialShadow(deviceId);
    } else {
      // Mark device as not connected to AWS due to error
      deviceConnectedToAWS.set(deviceId, false);
      updateDeviceStatus(deviceId);
    }
    
    return null;
  }
}

// Create initial shadow for new devices
async function createInitialShadow(deviceId) {
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

    console.log(`✅ Created initial shadow for ${deviceId}`);
    recordDeviceActivity(deviceId, 'shadow_create');
  } catch (error) {
    console.warn(`⚠️ Failed to create initial shadow for ${deviceId}:`, error.message);
    deviceConnectedToAWS.set(deviceId, false);
    updateDeviceStatus(deviceId);
  }
}

// Start shadow polling as fallback
function startShadowPollingForAllDevices() {
  console.log('🔄 Starting shadow polling for all devices (MQTT fallback)...');
  
  awsThings.forEach((device, deviceId) => {
    startShadowPolling(deviceId);
  });
}

function startShadowPolling(deviceId) {
  // Initial fetch
  setTimeout(() => {
    loadDeviceStatusFromShadow(deviceId);
  }, 1000);

  // Polling interval (only if MQTT is not working)
  if (mqttConnectionStatus !== 'connected') {
    const interval = setInterval(async () => {
      if (!awsThings.has(deviceId)) {
        clearInterval(interval);
        return;
      }

      try {
        await loadDeviceStatusFromShadow(deviceId);
      } catch (error) {
        console.warn(`⚠️ Shadow polling failed for ${deviceId}:`, error.message);
        deviceConnectedToAWS.set(deviceId, false);
        updateDeviceStatus(deviceId);
      }
    }, 30000); // Poll every 30 seconds as fallback
  }
}

// Enhanced startup process
async function initializeAWSConnection() {
  try {
    console.log('🔍 Initializing AWS IoT connection...');

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

    // Load existing registered things from AWS
    await loadExistingThings();

    // Initialize MQTT for real-time updates
    initializeMQTT();

    // Broadcast connection status
    broadcastConnectionStatus();

  } catch (error) {
    console.error('❌ Failed to initialize AWS IoT:', error.message);
    awsConnectionStatus = 'error';
    broadcastConnectionStatus();

    // Even if AWS fails, start the server for local testing
    console.log('🚀 Starting server in local mode...');
  }
}

async function testAWSConnection() {
  await iot.listThings({ maxResults: 1 }).promise();
  console.log('✅ AWS IoT connection test successful');
}

// Load existing things with immediate status fetching and monitoring
async function loadExistingThings() {
  try {
    console.log('📋 Loading existing AWS IoT Things...');
    const result = await iot.listThings().promise();

    let registeredCount = 0;
    for (const thing of result.things) {
      const isRegistered = thing.attributes?.registered === 'true';

      if (isRegistered) {
        const deviceData = createDeviceFromThing(thing);

        // Store device data
        awsThings.set(thing.thingName, deviceData);
        deviceStatus.set(thing.thingName, {
          ...deviceData,
          lastUpdateTime: new Date().toISOString()
        });

        // Initialize tracking for this device
        deviceLastConnection.set(thing.thingName, 0);
        deviceLastRelayStatus.set(thing.thingName, 0);
        deviceLastAck.set(thing.thingName, 0);
        deviceConnectedToAWS.set(thing.thingName, false);

        // Start status monitoring
        startDeviceStatusMonitoring(thing.thingName);

        registeredCount++;

        // Load initial status from shadow immediately
        setTimeout(async () => {
          await loadDeviceStatusFromShadow(thing.thingName);
          
          // Subscribe to MQTT topics if connected
          if (mqttClient && mqttClient.connected) {
            subscribeToDeviceTopics(thing.thingName);
          }
        }, registeredCount * 500); // Stagger the fetches
      }
    }

    console.log(`✅ Loaded ${registeredCount} registered devices from AWS`);

  } catch (error) {
    console.error('❌ Error loading existing things:', error);
  }
}

// Create device from thing with proper defaults
// Create device from thing with proper defaults (continued)
function createDeviceFromThing(thing) {
  let relayConfig;
  try {
    relayConfig = thing.attributes?.relayConfig ?
      JSON.parse(thing.attributes.relayConfig) : {
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
    id: thing.thingName,
    name: thing.attributes?.displayName || thing.thingName,
    location: thing.attributes?.location || '',
    lat: parseFloat(thing.attributes?.latitude || '12.9716'),
    lng: parseFloat(thing.attributes?.longitude || '77.5946'),
    group: thing.attributes?.group || null,
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
    relayConfig,
    created: new Date().toISOString(),
    lastSeen: 'Never',
    signalStrength: 0,
    batteryLevel: 100,
    thingArn: thing.thingArn,
    thingTypeName: thing.thingTypeName,
    version: thing.version
  };
}

// WebSocket client handling with enhanced connection status
wss.on('connection', (ws) => {
  console.log('🔗 Client connected via WebSocket');
  clients.add(ws);

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

  // Send current device states immediately
  setTimeout(() => {
    console.log(`📤 Sending ${awsThings.size} device states to new client`);
    let sentCount = 0;

    awsThings.forEach((device, deviceId) => {
      try {
        const deviceMessage = {
          type: 'device_status_update',
          deviceId,
          device,
          timestamp: new Date().toISOString(),
          source: 'initial_sync'
        };
        ws.send(JSON.stringify(deviceMessage));
        sentCount++;
      } catch (error) {
        console.warn(`Failed to send device ${deviceId} to client:`, error);
      }
    });

    console.log(`✅ Sent ${sentCount} device states to new client`);
  }, 500);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'ping') {
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      console.warn('⚠️ Invalid WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
    clients.delete(ws);
  });
});

function broadcastConnectionStatus() {
  broadcast({
    type: 'connection_status',
    status: awsConnectionStatus,
    mqttConnected: mqttClient?.connected || false,
    endpoint: iotEndpoint || 'Not configured'
  });
}

function initializeDeviceTracking() {
  // Clear existing tracking
  deviceLastConnection.clear();
  deviceLastRelayStatus.clear();
  deviceLastAck.clear();
  deviceConnectedToAWS.clear();
  
  console.log('🔄 Initialized device tracking with enhanced status logic for your MQTT topics');
}

// API Routes

app.get('/api/health', (req, res) => {
  const onlineDevices = Array.from(awsThings.values()).filter(d => d.status === 'online').length;
  const activeDevices = Array.from(awsThings.values()).filter(d => d.status === 'active').length;
  const offlineDevices = Array.from(awsThings.values()).filter(d => d.status === 'offline').length;

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    aws: awsConnectionStatus,
    mqtt: mqttClient?.connected || false,
    endpoint: iotEndpoint || 'Not configured',
    things: awsThings.size,
    clients: clients.size,
    deviceStats: {
      total: awsThings.size,
      online: onlineDevices,
      active: activeDevices,
      offline: offlineDevices
    },
    lastActivity: statusHistory.length > 0 ? statusHistory[0].timestamp : null
  });
});

// Register thing with immediate status fetching and MQTT subscription
app.post('/api/iot/register-thing', async (req, res) => {
  try {
    const { thingName, name, location, lat, lng, group, relayConfig } = req.body;

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

    if (awsThings.has(thingName)) {
      return res.status(409).json({
        success: false,
        error: 'Thing already registered'
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
      created: new Date().toISOString(),
      lastSeen: 'Never',
      signalStrength: 0,
      batteryLevel: 100,
      lastUpdateTime: new Date().toISOString()
    };

    // Store in memory
    awsThings.set(thingName, deviceData);
    deviceStatus.set(thingName, {
      ...deviceData,
      lastUpdateTime: new Date().toISOString()
    });

    // Initialize proper tracking for this device
    deviceLastConnection.set(thingName, 0);
    deviceLastRelayStatus.set(thingName, 0);
    deviceLastAck.set(thingName, 0);
    deviceConnectedToAWS.set(thingName, false);

    // Start status monitoring
    startDeviceStatusMonitoring(thingName);

    // Check for real device status and subscribe to MQTT topics
    setTimeout(async () => {
      console.log(`🔄 Setting up monitoring for newly registered device: ${thingName}`);
      
      // Load initial status from shadow
      await loadDeviceStatusFromShadow(thingName);
      
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
            registered: 'true',
            registeredAt: new Date().toISOString()
          }
        }
      }).promise();
      console.log(`✅ Updated AWS thing attributes for ${thingName}`);
    } catch (updateError) {
      console.warn('⚠️ Failed to update thing attributes:', updateError.message);
    }

    // Broadcast device registration
    broadcast({
      type: 'device_created',
      device: deviceData,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      message: 'AWS IoT Thing registered successfully - Monitoring MQTT topics for real-time updates',
      device: deviceData,
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

// Enhanced command sending with device status validation - ONLY ACTIVE DEVICES
app.post('/api/iot/command', async (req, res) => {
  try {
    const { deviceId, command, data } = req.body;

    if (!deviceId || !command) {
      return res.status(400).json({
        success: false,
        error: 'Device ID and command are required'
      });
    }

    if (!awsThings.has(deviceId)) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    const device = awsThings.get(deviceId);
    
    // Allow commands if device is online or active (not offline)
    if (device.status === 'offline') {
      return res.status(400).json({
        success: false,
        error: `Cannot send command to offline device. Device status is '${device.status}'. Device must be 'online' or 'active' for control.`,
        deviceStatus: device.status,
        message: 'Device is offline. Please wait for device to come online.',
        requirement: 'Device must be ONLINE or ACTIVE (connected to AWS) to accept commands'
      });
    }

    console.log(`🎛️ Command approved for ${device.status.toUpperCase()} device ${deviceId}: ${command}`);
    
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

        console.log(`🎛️ Feature ${feature} mapped to ${relayNum}: ${currentState} → ${newState} (Device is ${device.status.toUpperCase()})`);
        console.log(`🎛️ Preserving other relay states:`, {
          relay1: relayNum !== 'relay1' ? payload.relay1 : 'UPDATED',
          relay2: relayNum !== 'relay2' ? payload.relay2 : 'UPDATED',
          relay3: relayNum !== 'relay3' ? payload.relay3 : 'UPDATED',
          relay4: relayNum !== 'relay4' ? payload.relay4 : 'UPDATED'
        });

        // Record command activity
        recordDeviceActivity(deviceId, 'control');
      } else {
        console.warn(`⚠️ No relay mapping found for feature: ${feature}`);
      }
    }

    let commandSent = false;

    // Try MQTT first (preferred for connected devices)
    if (mqttClient && mqttClient.connected) {
      mqttClient.publish(controlTopic, JSON.stringify(payload), (err) => {
        if (!err) {
          console.log(`📤 Partial command sent via MQTT to ${device.status.toUpperCase()} device ${controlTopic}:`, payload);
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
        console.log(`📤 Partial command sent via IoT Data API to ${device.status.toUpperCase()} device ${controlTopic}:`, payload);
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
        console.log(`📋 Device shadow updated for ${device.status.toUpperCase()} device ${deviceId}`);
      } catch (shadowError) {
        console.warn('⚠️ Failed to update device shadow:', shadowError.message);
      }
    }

    // Broadcast command sent
    broadcast({
      type: 'command_sent',
      deviceId,
      command,
      topic: controlTopic,
      payload,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: `Partial command sent successfully to ${device.status.toUpperCase()} device. Waiting for relay acknowledgment on ${deviceId}/relay/ack`,
      method: commandSent ? (mqttClient?.connected ? 'MQTT' : 'IoT Data') : 'Simulated',
      topic: controlTopic,
      payload,
      deviceStatus: device.status,
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



app.post('/api/iot/scenario', async (req, res) => {
  try {
    const { deviceIds, scenario, features } = req.body;

    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Device IDs array is required'
      });
    }

    // Check if all devices are online or active (not offline)
    const offlineDevices = [];
    const onlineDevices = [];

    deviceIds.forEach(deviceId => {
      if (!awsThings.has(deviceId)) {
        offlineDevices.push({ deviceId, reason: 'not_found' });
      } else {
        const device = awsThings.get(deviceId);
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
        message: 'Only ONLINE or ACTIVE devices can receive scenario commands. Please wait for devices to come online.',
        requirement: 'All devices must be ONLINE or ACTIVE (connected to AWS) to execute scenarios'
      });
    }

    console.log(`🎭 Scenario approved for ${onlineDevices.length} ONLINE/ACTIVE devices`);

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

    // Send commands to each ONLINE/ACTIVE device
    for (const deviceId of onlineDevices) {
      try {
        const device = awsThings.get(deviceId);
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
            console.log(`🎛️ Updating feature ${feature} -> ${relayForFeature}: ${shouldEnable}`);
          }
        });

        console.log(`📋 ${device.status.toUpperCase()} Device ${deviceId} relay mapping:`, relayConfig);
        console.log(`📋 ${device.status.toUpperCase()} Device ${deviceId} current state:`, device.relayStates);
        console.log(`📋 ${device.status.toUpperCase()} Device ${deviceId} final payload (partial):`, payload);

        // Record scenario activity
        recordDeviceActivity(deviceId, 'control');

        // Send command
        let sent = false;
        if (mqttClient && mqttClient.connected) {
          mqttClient.publish(controlTopic, JSON.stringify(payload));
          console.log(`📤 MQTT partial command sent to ${device.status.toUpperCase()} device ${deviceId}:`, payload);
          sent = true;
        } else if (iotData) {
          await iotData.publish({
            topic: controlTopic,
            payload: JSON.stringify(payload)
          }).promise();
          console.log(`📤 IoT Data partial command sent to ${device.status.toUpperCase()} device ${deviceId}:`, payload);
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
            console.log(`📋 Shadow updated for ${device.status.toUpperCase()} device ${deviceId}`);
          } catch (shadowError) {
            console.warn(`⚠️ Failed to update shadow for ${deviceId}:`, shadowError.message);
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
          note: 'Partial command sent - waiting for hardware acknowledgment'
        });

      } catch (error) {
        console.error(`❌ Error executing scenario for device ${deviceId}:`, error);
        results.push({ deviceId, success: false, error: error.message });
      }
    }

    // Broadcast scenario execution
    broadcast({
      type: 'scenario_executed',
      scenario: {
        name: scenario,
        features: targetFeatures
      },
      deviceIds: onlineDevices,
      results,
      timestamp: new Date().toISOString()
    });

    const successful = results.filter(r => r.success).length;
    const featureList = Object.keys(targetFeatures).join(', ');
    res.json({
      success: true,
      message: `Partial scenario executed on ${successful}/${onlineDevices.length} ONLINE/ACTIVE devices for features: ${featureList}`,
      scenario: scenario,
      features: targetFeatures,
      devicesAffected: onlineDevices.length,
      skippedDevices: offlineDevices.length,
      results,
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

// Additional API routes (remaining routes)
app.get('/api/iot/available-things', async (req, res) => {
  try {
    const result = await iot.listThings().promise();

    const thingsList = result.things
      .filter(thing => !awsThings.has(thing.thingName))
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

app.get('/api/iot/things', async (req, res) => {
  try {
    // Return current device list with real-time status
    const deviceList = Array.from(awsThings.values()).map(device => ({
      ...device,
      features: device.features || {
        siren: false,
        beacon: false,
        announcement: false,
        dispenser: false
      },
      status: device.status || 'offline',
      lastSeen: device.lastSeen || 'Never',
      lastUpdateTime: device.lastUpdateTime || new Date().toISOString()
    }));

    res.json({
      success: true,
      devices: deviceList,
      timestamp: new Date().toISOString(),
      count: deviceList.length
    });
  } catch (error) {
    console.error('❌ Error listing devices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list devices',
      message: error.message,
      devices: []
    });
  }
});

// Delete thing with proper cleanup
app.delete('/api/iot/things/:thingName', async (req, res) => {
  try {
    const thingName = req.params.thingName;

    // Stop monitoring for this device
    stopDeviceStatusMonitoring(thingName);

    // Update AWS thing to remove registered flag
    try {
      const awsThing = await iot.describeThing({ thingName }).promise();
      const newAttributes = { ...awsThing.attributes };
      delete newAttributes.registered;
      delete newAttributes.registeredAt;
      delete newAttributes.displayName;

      await iot.updateThing({
        thingName,
        attributePayload: { attributes: newAttributes }
      }).promise();
    } catch (awsError) {
      console.warn('⚠️ AWS update failed:', awsError.message);
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
      
      console.log(`📡 Unsubscribed from ${thingName} MQTT topics`);
    }

    // Remove from memory and tracking
    awsThings.delete(thingName);
    deviceStatus.delete(thingName);
    deviceStateHashes.delete(thingName);
    lastBroadcastTimes.delete(thingName);
    deviceLastConnection.delete(thingName);
    deviceLastRelayStatus.delete(thingName);
    deviceLastAck.delete(thingName);
    deviceConnectedToAWS.delete(thingName);

    // Broadcast deletion
    broadcast({
      type: 'device_deleted',
      deviceId: thingName,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Device unregistered successfully'
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

// Manual status simulation endpoint for testing
app.post('/api/iot/simulate-device-status/:deviceId', async (req, res) => {
  try {
    const deviceId = req.params.deviceId;
    const { 
      connectionStatus = 'connected',
      relay1 = false, 
      relay2 = false, 
      relay3 = false, 
      relay4 = false, 
      signal_strength = 85, 
      battery_level = 100 
    } = req.body;

    if (!awsThings.has(deviceId)) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    console.log('🔴 Simulating device messages for:', deviceId);

    // Simulate connection status
    processDeviceStatusUpdate(deviceId, {
      status: connectionStatus
    }, 'connection');

    // Simulate relay acknowledgment (actual hardware status)
    processDeviceStatusUpdate(deviceId, {
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
      connectionStatus,
      relayStates: {
        relay1: Boolean(relay1),
        relay2: Boolean(relay2),
        relay3: Boolean(relay3),
        relay4: Boolean(relay4)
      },
      newStatus: calculateDeviceStatus(deviceId),
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

// Initialize enhanced tracking on startup
initializeDeviceTracking();

// Start HTTP server
server.listen(PORT, () => {
  console.log(`🚀 ELPRO AWS IoT Backend Server running on port ${PORT}`);
  console.log(`🌐 WebSocket server running on port ${WS_PORT}`);
  console.log(`📡 CORS enabled for frontend connections`);

  // Initialize AWS connection
  initializeAWSConnection();

  console.log('\n📋 Available API Endpoints:');
  console.log('  GET  /api/health - Health check');
  console.log('  GET  /api/iot/things - List registered devices');
  console.log('  GET  /api/iot/available-things - List unregistered things');
  console.log('  POST /api/iot/register-thing - Register existing thing');
  console.log('  DELETE /api/iot/things/:thingName - Unregister thing');
  console.log('  POST /api/iot/command - Send MQTT command (ACTIVE devices only)');
  console.log('  POST /api/iot/simulate-device-status/:deviceId - Simulate device messages');

  console.log('\n🎯 FIXED MQTT TOPIC MANAGEMENT:');
  console.log('  📡 Monitoring Topics:');
  console.log('    🔗 deviceId/connection - Device connection status');
  console.log('    📊 deviceId/relay/status - Relay status (every 10 seconds)');
  console.log('    ✅ deviceId/relay/ack - Relay acknowledgment (actual hardware)');
  console.log('    📤 deviceId/relay/control - Control commands');
  console.log('  ✅ Status Logic:');
  console.log('    📴 OFFLINE: No connection status for 20+ minutes');
  console.log('    🟡 ONLINE: Connection status "connected" but no relay updates');
  console.log('    🟢 ACTIVE: Connection "connected" + relay status updates');
  console.log('  ✅ Real-time Updates:');
  console.log('    🔗 Connection status determines online/offline');
  console.log('    📊 Relay status shows device is actively communicating');
  console.log('    ✅ Relay ACK updates actual feature states in dashboard');
  console.log('    📤 Commands only work for ACTIVE devices');

  console.log('\n🧪 Testing Commands:');
  console.log('  POST /api/iot/simulate-device-status/zonex_3');
  console.log('  Body: {');
  console.log('    "connectionStatus": "connected",');
  console.log('    "relay1": true, "relay2": false, "relay3": false, "relay4": false');
  console.log('  }');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');

  // Stop all device monitoring
  statusCheckIntervals.forEach((intervalId, deviceId) => {
    clearInterval(intervalId);
    console.log(`🛑 Stopped monitoring for ${deviceId}`);
  });
  statusCheckIntervals.clear();

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
      console.log('👋 ELPRO Backend shutdown complete');
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