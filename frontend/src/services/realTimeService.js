// COMPLETELY FIXED: Real-time service with stable connection and multi-tenant support
class RealTimeService {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 3000;
        this.awsThings = new Map();
        this.listeners = new Map();
        this.isInitialized = false;
        this.backendUrl = process.env.REACT_APP_BACKEND_URL || '//localhost:5000';
        this.wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:5001';
        this.connectionState = 'disconnected';
        this.heartbeatInterval = null;
        this.deviceStates = new Map();
        this.lastUpdateTimes = new Map();
        this.initPromise = null;
        this.currentTenantId = null;

        // FIXED: Enhanced state tracking to prevent duplicates
        this.isLoadingInitialData = false;
        this.hasLoadedInitialData = false;
        this.statusSyncInProgress = new Set();
        this.lastDeviceHashes = new Map();
        this.updateThrottleMap = new Map();
        this.reconnectTimeoutId = null;
        this.isDestroyed = false;
        this.pendingOperations = new Map();

        // FIXED: Stable connection tracking
        this.connectionAttempts = 0;
        this.lastConnectionTime = 0;
        this.minReconnectDelay = 1000;
        this.maxReconnectDelay = 30000;
    }

    setTenantContext(tenantId) {
        console.log('🏢 Setting tenant context:', tenantId);
        this.currentTenantId = tenantId;

        // Clear existing data when switching tenants
        if (tenantId !== this.previousTenantId) {
            this.awsThings.clear();
            this.deviceStates.clear();
            this.lastUpdateTimes.clear();
            this.hasLoadedInitialData = false;
            this.previousTenantId = tenantId;
            console.log('🧹 Cleared data for tenant switch');
        }
    }

    async initialize(tenantId = null) {
        // FIXED: Set tenant context if provided
        if (tenantId) {
            this.setTenantContext(tenantId);
        }

        // FIXED: Prevent multiple initializations
        if (this.isInitialized) {
            console.log('🔄 Service already initialized, returning existing connection');
            return Promise.resolve();
        }

        if (this.initPromise) {
            console.log('🔄 Initialization in progress, waiting...');
            return this.initPromise;
        }

        this.initPromise = this._doInitialize();
        return this.initPromise;
    }

    async _doInitialize() {
        try {
            console.log('🔄 Initializing Real-time Service with multi-tenant support...');
            console.log('🏢 Current tenant:', this.currentTenantId || 'No tenant context');

            // FIXED: Test connection only once
            if (!this.hasLoadedInitialData) {
                await this._testHttpConnection();
            }

            // FIXED: Initialize WebSocket with proper state management
            await this._initializeWebSocketStable();

            // FIXED: Load initial data only once for current tenant
            if (!this.hasLoadedInitialData) {
                await this._loadInitialDataStable();
                this.hasLoadedInitialData = true;
            }

            // Start heartbeat with stable timing
            this._startStableHeartbeat();

            this.isInitialized = true;
            this.connectionAttempts = 0;
            console.log('✅ Real-time service initialized with multi-tenant support');

            return true;
        } catch (error) {
            console.error('❌ Real-time service initialization failed:', error);
            this.initPromise = null;
            this.isInitialized = false;
            throw error;
        }
    }

    async _testHttpConnection() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(`${this.backendUrl}/api/health`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-ID': this.currentTenantId || ''
                },
                mode: 'cors',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP connection test failed: ${response.status}`);
            }

            const data = await response.json();
            console.log('✅ HTTP connection test successful:', data);
            return data;
        } catch (error) {
            console.error('❌ HTTP connection test failed:', error);
            throw new Error(`Backend not accessible at ${this.backendUrl}`);
        }
    }

    // FIXED: Stable WebSocket initialization with tenant context
    _initializeWebSocketStable() {
        return new Promise((resolve, reject) => {
            try {
                // FIXED: Don't create new connection if one exists and is working
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    console.log('✅ WebSocket already connected');
                    resolve();
                    return;
                }

                console.log('🔌 Connecting to WebSocket for real-time updates:', this.wsUrl);
                console.log('🏢 Tenant context:', this.currentTenantId || 'No tenant');

                if (this.ws) {
                    this.ws.close();
                    this.ws = null;
                }

                this.ws = new WebSocket(this.wsUrl);
                this.connectionAttempts++;

                let connectionTimeout = setTimeout(() => {
                    if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
                        console.error('❌ WebSocket connection timeout');
                        this.ws.close();
                        reject(new Error('WebSocket connection timeout'));
                    }
                }, 15000);

                const clearTimeoutSafely = () => {
                    if (connectionTimeout) {
                        clearTimeout(connectionTimeout);
                        connectionTimeout = null;
                    }
                };

                this.ws.addEventListener('open', () => {
                    clearTimeoutSafely();
                    console.log('✅ WebSocket connected - Real-time MQTT updates active');

                    // Send tenant context to backend
                    if (this.currentTenantId) {
                        this.ws.send(JSON.stringify({
                            type: 'set_tenant_context',
                            tenantId: this.currentTenantId,
                            timestamp: Date.now()
                        }));
                    }

                    this.reconnectAttempts = 0;
                    this.connectionState = 'connected';
                    this.lastConnectionTime = Date.now();
                    this._notifyListeners('connection', { status: 'connected' });
                    resolve();
                });

                this.ws.addEventListener('message', (event) => {
                    this._handleWebSocketMessageStable(event);
                });

                this.ws.addEventListener('close', (event) => {
                    clearTimeoutSafely();
                    console.log('🔌 WebSocket connection closed:', event.code, event.reason);
                    this.connectionState = 'disconnected';
                    this._notifyListeners('connection', { status: 'disconnected' });

                    // FIXED: Only attempt reconnect if not manually closed and not destroyed
                    if (event.code !== 1000 && !this.isDestroyed) {
                        this._attemptReconnectStable();
                    }
                });

                this.ws.addEventListener('error', (error) => {
                    clearTimeoutSafely();
                    console.error('❌ WebSocket error:', error);
                    this.connectionState = 'error';
                    this._notifyListeners('connection', { status: 'error', error });

                    if (this.connectionAttempts <= 1) {
                        reject(new Error(`WebSocket connection failed: ${error.message || 'Unknown error'}`));
                    }
                });

            } catch (error) {
                console.error('❌ Failed to create WebSocket:', error);
                reject(error);
            }
        });
    }

    // FIXED: Enhanced message handling with tenant filtering
    _handleWebSocketMessageStable(event) {
        try {
            if (!event.data || event.data.trim() === '') {
                console.warn('⚠️ Received empty WebSocket message');
                return;
            }

            const data = JSON.parse(event.data);

            if (!data || !data.type) {
                console.warn('⚠️ Received malformed WebSocket message:', data);
                return;
            }

            // FIXED: Filter messages by tenant context
            if (data.tenantId && this.currentTenantId && data.tenantId !== this.currentTenantId) {
                console.log('🏢 Ignoring message for different tenant:', data.tenantId);
                return;
            }

            // FIXED: Throttle frequent updates to prevent spam
            const messageKey = `${data.type}-${data.deviceId || 'system'}`;
            const lastUpdate = this.updateThrottleMap.get(messageKey);
            const now = Date.now();

            if (lastUpdate && (now - lastUpdate) < 500) {
                return;
            }

            this.updateThrottleMap.set(messageKey, now);

            console.log('📨 Real-time message received for tenant:', this.currentTenantId, data.type, data.source || '');

            switch (data.type) {
                case 'connection_status':
                    this._handleConnectionStatusStable(data);
                    break;
                case 'device_created':
                    this._handleDeviceCreatedStable(data);
                    break;
                case 'device_deleted':
                    this._handleDeviceDeletedStable(data);
                    break;
                case 'device_status_update':
                    this._handleDeviceStatusUpdateStable(data);
                    break;
                case 'command_sent':
                    this._handleCommandSentStable(data);
                    break;
                case 'scenario_executed':
                    this._handleScenarioExecutedStable(data);
                    break;
                case 'mqtt_message':
                    this._handleMqttMessageStable(data);
                    break;
                case 'pong':
                    // Heartbeat response - connection is alive
                    break;
                default:
                    console.log('❓ Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('❌ Error parsing WebSocket message:', error);
        }
    }

    _handleConnectionStatusStable(data) {
        console.log('🔌 Connection status update:', data);
        this.connectionState = data.status === 'connected' ? 'connected' : 'disconnected';
        this._notifyListeners('connection_status', data);
    }

    _handleDeviceCreatedStable(data) {
        try {
            const device = data.device || data;
            if (!device || !device.id) {
                console.warn('⚠️ Invalid device data in creation event:', data);
                return;
            }

            console.log('📱 Device created via real-time for tenant:', this.currentTenantId, device.id);

            // FIXED: Update internal state efficiently with tenant context
            device.tenantId = this.currentTenantId;
            this.awsThings.set(device.id, device);
            this.deviceStates.set(device.id, JSON.stringify(device));
            this.lastUpdateTimes.set(device.id, Date.now());

            this._notifyListeners('device_created', device);

            // FIXED: Request status sync with delay to avoid overwhelming
            setTimeout(() => {
                this.requestDeviceStatusSync(device.id);
            }, 2000);

        } catch (error) {
            console.error('❌ Error handling device creation:', error);
        }
    }

    _handleDeviceDeletedStable(data) {
        try {
            const deviceId = data.deviceId || data.id;
            if (!deviceId) {
                console.warn('⚠️ Invalid device deletion data:', data);
                return;
            }

            console.log('🗑️ Device deleted via real-time for tenant:', this.currentTenantId, deviceId);

            // Clean up all references
            this.awsThings.delete(deviceId);
            this.deviceStates.delete(deviceId);
            this.lastUpdateTimes.delete(deviceId);
            this.statusSyncInProgress.delete(deviceId);
            this.lastDeviceHashes.delete(deviceId);

            this._notifyListeners('device_deleted', { deviceId });

        } catch (error) {
            console.error('❌ Error handling device deletion:', error);
        }
    }

    // FIXED: Device status update handling with tenant context
    _handleDeviceStatusUpdateStable(data) {
        try {
            const { deviceId, device, timestamp, source } = data;

            if (!deviceId || !device) {
                console.warn('⚠️ Invalid device status update data:', data);
                return;
            }

            console.log(`📡 Processing ${source} update for tenant ${this.currentTenantId} device ${deviceId}:`, device.status);

            // Get existing device
            const existingDevice = this.awsThings.get(deviceId) || {};

            // FIXED: Always update device immediately for real-time UI updates
            const updatedDevice = {
                ...existingDevice,
                ...device,
                id: deviceId,
                tenantId: this.currentTenantId,
                features: device.features || existingDevice.features || {
                    siren: false,
                    beacon: false,
                    announcement: false,
                    dispenser: false
                },
                relayStates: device.relayStates || existingDevice.relayStates || {
                    relay1: false,
                    relay2: false,
                    relay3: false,
                    relay4: false
                },
                status: device.status || existingDevice.status || 'offline',
                lastSeen: device.lastSeen || new Date().toLocaleTimeString(),
                lastUpdateTime: timestamp || new Date().toISOString(),
                signalStrength: device.signalStrength || existingDevice.signalStrength || 85,
                batteryLevel: device.batteryLevel || existingDevice.batteryLevel || 100
            };

            // Update internal state immediately
            this.awsThings.set(deviceId, updatedDevice);
            this.deviceStates.set(deviceId, JSON.stringify(updatedDevice));
            this.lastUpdateTimes.set(deviceId, Date.now());

            // Always notify listeners for real-time updates
            this._notifyListeners('device_status_update', {
                deviceId,
                device: updatedDevice,
                timestamp: timestamp || new Date().toISOString(),
                source: source || 'status_update',
                tenantId: this.currentTenantId
            });

            console.log(`✅ Real-time update processed for tenant ${this.currentTenantId}: ${deviceId} - Status: ${updatedDevice.status}`);

        } catch (error) {
            console.error('❌ Error handling real-time status update:', error);
        }
    }

    _handleCommandSentStable(data) {
        console.log('📤 Command sent event for tenant:', this.currentTenantId, data);
        this._notifyListeners('command_sent', data);
    }

    _handleScenarioExecutedStable(data) {
        console.log('🎭 Scenario executed event for tenant:', this.currentTenantId, data);
        this._notifyListeners('scenario_executed', data);
    }

    _handleMqttMessageStable(data) {
        console.log('📡 MQTT message event for tenant:', this.currentTenantId, data);
        this._notifyListeners('mqtt_message', data);
    }

    // FIXED: Stable initial data loading with tenant context
    async _loadInitialDataStable() {
        if (this.isLoadingInitialData) {
            console.log('📋 Already loading initial data, skipping...');
            return;
        }

        this.isLoadingInitialData = true;

        try {
            console.log('📋 Loading device registry for tenant:', this.currentTenantId);

            const [devicesResponse, groupsResponse] = await Promise.all([
                this.fetchDevices(this.currentTenantId),
                this.fetchGroups(this.currentTenantId)
            ]);

            if (devicesResponse.success) {
                console.log('📋 Loaded device registry for tenant:', this.currentTenantId, devicesResponse.devices.length, 'devices');

                devicesResponse.devices.forEach(device => {
                    const registryDevice = {
                        ...device,
                        tenantId: this.currentTenantId,
                        features: device.features || {
                            siren: false,
                            beacon: false,
                            announcement: false,
                            dispenser: false
                        },
                        relayStates: device.relayStates || {
                            relay1: false,
                            relay2: false,
                            relay3: false,
                            relay4: false
                        },
                        status: device.status || 'offline'
                    };

                    this.awsThings.set(device.id, registryDevice);
                    this.deviceStates.set(device.id, JSON.stringify(registryDevice));
                    this.lastUpdateTimes.set(device.id, Date.now());
                });

                // FIXED: Request status sync with proper timing
                setTimeout(() => {
                    console.log('🔄 Requesting immediate status sync for tenant devices...');
                    this.refreshAllDeviceStatus();
                }, 3000);

                console.log('✅ Device registry loaded for tenant - MQTT status updates will follow');
            } else {
                console.error('❌ Failed to load device registry for tenant:', this.currentTenantId, devicesResponse.error);
            }

            if (groupsResponse.success) {
                console.log('📁 Loaded groups registry for tenant:', this.currentTenantId, groupsResponse.groups.length, 'groups');
            } else {
                console.error('❌ Failed to load groups for tenant:', this.currentTenantId, groupsResponse.error);
            }

        } catch (error) {
            console.error('❌ Error loading initial data for tenant:', this.currentTenantId, error);
        } finally {
            this.isLoadingInitialData = false;
        }
    }

    // FIXED: Stable reconnection with exponential backoff
    _attemptReconnectStable() {
        if (this.isDestroyed || this.reconnectAttempts >= this.maxReconnectAttempts) {
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error('❌ Max reconnection attempts reached');
                this._notifyListeners('connection', { status: 'failed' });
            }
            return;
        }

        // Clear any existing reconnect timeout
        if (this.reconnectTimeoutId) {
            clearTimeout(this.reconnectTimeoutId);
        }

        this.reconnectAttempts++;

        // Exponential backoff with jitter
        const baseDelay = Math.min(this.minReconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
        const jitter = Math.random() * 1000;
        const delay = baseDelay + jitter;

        console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${Math.round(delay)}ms...`);

        this.reconnectTimeoutId = setTimeout(() => {
            if (this.isDestroyed) return;

            this._initializeWebSocketStable().catch(error => {
                console.error('❌ Reconnection failed:', error);
                this._attemptReconnectStable();
            });
        }, delay);
    }

    // FIXED: Stable heartbeat with proper cleanup
    _startStableHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN && !this.isDestroyed) {
                try {
                    this.ws.send(JSON.stringify({
                        type: 'ping',
                        tenantId: this.currentTenantId,
                        timestamp: Date.now()
                    }));
                } catch (error) {
                    console.warn('⚠️ Heartbeat failed:', error);
                }
            }
        }, 30000);
    }

    // FIXED: Event listener management with proper cleanup
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        console.log(`📡 Real-time listener added for: ${event}`);

        return () => {
            this.off(event, callback);
        };
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            if (callback) {
                this.listeners.get(event).delete(callback);
            } else {
                this.listeners.get(event).clear();
            }
        }
    }

    _notifyListeners(event, data) {
        if (this.listeners.has(event)) {
            const listeners = this.listeners.get(event);

            if (listeners.size === 0) {
                return;
            }

            console.log(`📢 Notifying ${listeners.size} listeners for: ${event} (tenant: ${this.currentTenantId})`);

            listeners.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('❌ Error in event listener:', error);
                }
            });
        }
    }

    // FIXED: HTTP request helper with tenant context
    async _makeRequest(url, options = {}) {
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-ID': this.currentTenantId || ''
            },
            mode: 'cors',
            credentials: 'same-origin'
        };

        // Merge headers properly
        const requestOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...(options.headers || {})
            }
        };

        const maxRetries = 3;
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);

                const response = await fetch(url, {
                    ...requestOptions,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    let errorData;
                    try {
                        errorData = await response.json();
                    } catch {
                        errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
                    }
                    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
                }

                const result = await response.json();
                return result;
            } catch (error) {
                lastError = error;
                if (attempt < maxRetries && error.name !== 'AbortError') {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }

        throw lastError;
    }

    // FIXED: Enhanced toggle feature with tenant context and ACK timeout notification
    async toggleDeviceFeature(deviceId, feature) {
        try {
            console.log(`🎛️ Real-time toggle for tenant ${this.currentTenantId}: ${feature} for device ${deviceId}`);

            const device = this.awsThings.get(deviceId);
            if (!device) {
                throw new Error(`Device ${deviceId} not found in tenant ${this.currentTenantId}`);
            }

            const currentFeatureState = device.features?.[feature] || false;
            const newFeatureState = !currentFeatureState;

            console.log(`🎛️ Sending command to ${feature}: ${currentFeatureState} → ${newFeatureState}`);
            console.log(`⏳ Waiting for hardware acknowledgment on ${deviceId}/relay/ack...`);

            // Send command with tenant context
            const result = await this._makeRequest(`${this.backendUrl}/api/iot/command`, {
                method: 'POST',
                body: JSON.stringify({
                    deviceId,
                    command: newFeatureState ? `${feature}_on` : `${feature}_off`,
                    data: {
                        feature,
                        state: newFeatureState
                    },
                    tenantId: this.currentTenantId
                }),
            });

            if (result.success) {
                console.log(`✅ Command sent for tenant ${this.currentTenantId} - waiting for hardware ACK on ${deviceId}/relay/ack`);

                // Set up ACK timeout notification (15 seconds)
                setTimeout(() => {
                    const currentDevice = this.awsThings.get(deviceId);
                    const currentState = currentDevice?.features?.[feature];

                    // Check if the feature state actually changed (ACK received)
                    if (currentState === currentFeatureState) {
                        // ACK not received - show notification
                        this._notifyListeners('ack_timeout', {
                            deviceId,
                            feature,
                            tenantId: this.currentTenantId,
                            message: `ACK not received from ${deviceId} for ${feature} toggle. Hardware may not have responded.`,
                            timestamp: new Date().toISOString()
                        });
                        console.warn(`⚠️ ACK timeout for tenant ${this.currentTenantId} device ${deviceId} ${feature} toggle`);
                    }
                }, 15000);

                return {
                    success: true,
                    message: `${feature} command sent - waiting for hardware confirmation`
                };
            } else {
                throw new Error(result.message || 'Command failed');
            }
        } catch (error) {
            console.error('❌ Error in real-time toggle for tenant:', this.currentTenantId, error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    // FIXED: Device status sync with tenant context
    async requestDeviceStatusSync(deviceId) {
        if (this.statusSyncInProgress.has(deviceId)) {
            console.log(`📊 Status sync already in progress for tenant ${this.currentTenantId} device ${deviceId}`);
            return { success: true, message: 'Status sync already in progress' };
        }

        try {
            console.log(`📊 Requesting status sync for tenant ${this.currentTenantId} device: ${deviceId}`);
            this.statusSyncInProgress.add(deviceId);

            const response = await this._makeRequest(`${this.backendUrl}/api/iot/sync-status/${deviceId}`, {
                method: 'POST'
            });

            if (response.success) {
                console.log(`✅ Status sync requested for tenant ${this.currentTenantId} device ${deviceId}`);
                return { success: true, message: 'Status sync requested' };
            } else {
                throw new Error(response.message);
            }
        } catch (error) {
            console.error('❌ Failed to sync device status for tenant:', this.currentTenantId, error);
            return { success: false, message: error.message };
        } finally {
            setTimeout(() => {
                this.statusSyncInProgress.delete(deviceId);
            }, 5000);
        }
    }

    // FIXED: Refresh all device status with tenant context
    async refreshAllDeviceStatus() {
        try {
            console.log('🔄 Requesting status refresh for all tenant devices:', this.currentTenantId);

            const response = await this._makeRequest(`${this.backendUrl}/api/iot/refresh-all-status`, {
                method: 'POST'
            });

            if (response.success) {
                console.log(`✅ Status refresh requested for all tenant ${this.currentTenantId} devices`);
                return { success: true, message: response.message };
            } else {
                throw new Error(response.message);
            }
        } catch (error) {
            console.error('❌ Failed to refresh all device status for tenant:', this.currentTenantId, error);
            return { success: false, message: error.message };
        }
    }

    // FIXED: Fetch devices with tenant context
    async fetchDevices(tenantId = null) {
        try {
            const tenant = tenantId || this.currentTenantId;
            console.log('📋 Fetching devices for tenant:', tenant);

            const result = await this._makeRequest(`${this.backendUrl}/api/iot/things`, {
                headers: {
                    'X-Tenant-ID': tenant || ''
                }
            });

            // FIXED: Filter devices by tenant ID to ensure only tenant-specific devices are returned
            const devices = (result.devices || [])
                .filter(device => !tenant || device.tenantId === tenant)
                .map(device => ({
                    ...device,
                    tenantId: tenant
                }));

            devices.forEach(device => {
                const validatedDevice = {
                    ...device,
                    features: device.features || {
                        siren: false,
                        beacon: false,
                        announcement: false,
                        dispenser: false
                    },
                    relayStates: device.relayStates || {
                        relay1: false,
                        relay2: false,
                        relay3: false,
                        relay4: false
                    },
                    status: device.status || 'offline'
                };

                this.awsThings.set(device.id, validatedDevice);
                this.deviceStates.set(device.id, JSON.stringify(validatedDevice));
                this.lastUpdateTimes.set(device.id, Date.now());
            });

            return { success: true, devices };
        } catch (error) {
            console.error('❌ Error fetching devices for tenant:', this.currentTenantId, error);
            return { success: false, devices: [], error: error.message };
        }
    }

    // FIXED: Fetch groups with tenant context
    async fetchGroups(tenantId = null) {
        try {
            const tenant = tenantId || this.currentTenantId;
            console.log('📁 Fetching groups for tenant:', tenant);

            const result = await this._makeRequest(`${this.backendUrl}/api/groups`, {
                headers: {
                    'X-Tenant-ID': tenant || ''
                }
            });

            return { success: true, groups: result.groups || [] };
        } catch (error) {
            console.error('❌ Error fetching groups for tenant:', this.currentTenantId, error);
            return { success: false, groups: [], error: error.message };
        }
    }

    // FIXED: Register device with tenant context
    async registerDevice(deviceData) {
        try {
            console.log('📝 Registering device for tenant:', this.currentTenantId, deviceData);

            const result = await this._makeRequest(`${this.backendUrl}/api/iot/register-thing`, {
                method: 'POST',
                body: JSON.stringify({
                    ...deviceData,
                    tenantId: this.currentTenantId
                }),
            });

            if (result.success && result.device) {
                const validatedDevice = {
                    ...result.device,
                    tenantId: this.currentTenantId,
                    features: result.device.features || {
                        siren: false,
                        beacon: false,
                        announcement: false,
                        dispenser: false
                    },
                    relayStates: result.device.relayStates || {
                        relay1: false,
                        relay2: false,
                        relay3: false,
                        relay4: false
                    }
                };

                this.awsThings.set(validatedDevice.id, validatedDevice);
                this.deviceStates.set(validatedDevice.id, JSON.stringify(validatedDevice));
                this.lastUpdateTimes.set(validatedDevice.id, Date.now());

                console.log('✅ Device registered for tenant - MQTT updates will follow');
            }

            return result;
        } catch (error) {
            console.error('❌ Error registering device for tenant:', this.currentTenantId, error);
            throw error;
        }
    }

    // FIXED: Delete device with tenant context and proper cleanup
    async deleteDeviceCompat(deviceId, tenantId = null) {
        try {
            const tenant = tenantId || this.currentTenantId;
            console.log('🗑️ Deleting device for tenant:', tenant, deviceId);

            const result = await this._makeRequest(`${this.backendUrl}/api/iot/things/${deviceId}`, {
                method: 'DELETE',
                headers: {
                    'X-Tenant-ID': tenant || ''
                }
            });

            // Clean up local state
            this.awsThings.delete(deviceId);
            this.deviceStates.delete(deviceId);
            this.lastUpdateTimes.delete(deviceId);
            this.statusSyncInProgress.delete(deviceId);
            this.lastDeviceHashes.delete(deviceId);

            return {
                success: result.success,
                message: result.message || 'Device deleted successfully'
            };
        } catch (error) {
            console.error('❌ Error deleting device for tenant:', this.currentTenantId, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // FIXED: Execute scenario with tenant context and optimistic updates
    async executeScenarioCompat(selectedDevices, scenarioFeatures) {
        try {
            if (!selectedDevices || !Array.isArray(selectedDevices) || selectedDevices.length === 0) {
                throw new Error('No devices selected');
            }

            if (!scenarioFeatures || typeof scenarioFeatures !== 'object') {
                throw new Error('Invalid scenario features');
            }

            console.log(`🎭 Sending scenario command for tenant ${this.currentTenantId} - waiting for hardware acknowledgments...`);
            console.log('🎯 Features to update:', scenarioFeatures);

            // Send command with tenant context
            const result = await this._makeRequest(`${this.backendUrl}/api/iot/scenario`, {
                method: 'POST',
                body: JSON.stringify({
                    deviceIds: selectedDevices,
                    features: scenarioFeatures,
                    tenantId: this.currentTenantId
                }),
            });

            if (result.success) {
                const featureList = Object.keys(scenarioFeatures).join(', ');
                console.log(`✅ Scenario commands sent for tenant ${this.currentTenantId} features: ${featureList}`);
                return [{
                    success: true,
                    message: result.message,
                    features: scenarioFeatures,
                    tenantId: this.currentTenantId,
                    note: 'Commands sent - dashboard will update when devices acknowledge'
                }];
            } else {
                throw new Error(result.message || 'Scenario execution failed');
            }

        } catch (error) {
            console.error('❌ Failed to execute scenario for tenant:', this.currentTenantId, error);
            return [{
                success: false,
                message: error.message,
                error: error,
                tenantId: this.currentTenantId
            }];
        }
    }

    // FIXED: Get AWS things with tenant context
    async getAwsThings() {
        try {
            console.log('☁️ Fetching available AWS things for tenant:', this.currentTenantId);

            const result = await this._makeRequest(`${this.backendUrl}/api/iot/available-things`);
            return {
                success: true,
                things: result.things || []
            };
        } catch (error) {
            console.error('❌ Error fetching AWS things for tenant:', this.currentTenantId, error);
            return {
                success: false,
                things: [],
                error: error.message
            };
        }
    }

    // FIXED: Create group with tenant context
    async createGroup(groupData) {
        try {
            console.log('📁 Creating group for tenant:', this.currentTenantId, groupData);

            const result = await this._makeRequest(`${this.backendUrl}/api/groups`, {
                method: 'POST',
                body: JSON.stringify({
                    ...groupData,
                    tenantId: this.currentTenantId
                }),
            });

            return {
                success: result.success,
                group: result.group
            };
        } catch (error) {
            console.error('❌ Error creating group for tenant:', this.currentTenantId, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // FIXED: Get devices with tenant context and local cache
    async getDevices() {
        try {
            console.log('📋 Getting devices for tenant:', this.currentTenantId);

            const result = await this._makeRequest(`${this.backendUrl}/api/iot/things`);
            const devices = (result.devices || []).map(device => ({
                ...device,
                tenantId: this.currentTenantId
            }));

            devices.forEach(device => {
                const validatedDevice = {
                    ...device,
                    features: device.features || {
                        siren: false,
                        beacon: false,
                        announcement: false,
                        dispenser: false
                    },
                    relayStates: device.relayStates || {
                        relay1: false,
                        relay2: false,
                        relay3: false,
                        relay4: false
                    },
                    status: device.status || 'offline'
                };

                this.awsThings.set(device.id, validatedDevice);
                this.deviceStates.set(device.id, JSON.stringify(validatedDevice));
                this.lastUpdateTimes.set(device.id, Date.now());
            });

            return devices;
        } catch (error) {
            console.error('❌ Error fetching devices for tenant:', this.currentTenantId, error);
            return [];
        }
    }

    // Utility methods with tenant awareness
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    getConnectionState() {
        if (!this.ws) return 'disconnected';
        switch (this.ws.readyState) {
            case WebSocket.CONNECTING: return 'connecting';
            case WebSocket.OPEN: return 'connected';
            case WebSocket.CLOSING: return 'closing';
            case WebSocket.CLOSED: return 'disconnected';
            default: return 'unknown';
        }
    }

    getAllDevices() {
        return Array.from(this.awsThings.values()).filter(device =>
            !this.currentTenantId || device.tenantId === this.currentTenantId
        );
    }

    getDevice(deviceId) {
        const device = this.awsThings.get(deviceId);
        // Only return device if it belongs to current tenant
        if (device && (!this.currentTenantId || device.tenantId === this.currentTenantId)) {
            return device;
        }
        return null;
    }

    getDeviceCount() {
        return this.getAllDevices().length;
    }

    // FIXED: Get connection statistics with tenant context
    getConnectionStats() {
        return {
            isConnected: this.isConnected(),
            connectionState: this.getConnectionState(),
            reconnectAttempts: this.reconnectAttempts,
            lastConnectionTime: this.lastConnectionTime,
            deviceCount: this.getDeviceCount(),
            hasLoadedInitialData: this.hasLoadedInitialData,
            isInitialized: this.isInitialized,
            currentTenantId: this.currentTenantId
        };
    }

    // FIXED: Force reconnection with tenant context
    forceReconnect() {
        console.log('🔄 Forcing reconnection for tenant:', this.currentTenantId);

        if (this.ws) {
            this.ws.close(1000, 'Force reconnect');
        }

        this.reconnectAttempts = 0;
        this.connectionState = 'connecting';

        setTimeout(() => {
            this._initializeWebSocketStable().catch(error => {
                console.error('❌ Force reconnection failed:', error);
            });
        }, 1000);
    }

    // FIXED: Clear tenant-specific caches
    clearCaches() {
        console.log('🧹 Clearing caches for tenant:', this.currentTenantId);

        // Only clear data for current tenant
        const tenantDevices = Array.from(this.awsThings.entries())
            .filter(([deviceId, device]) => device.tenantId === this.currentTenantId);

        tenantDevices.forEach(([deviceId]) => {
            this.awsThings.delete(deviceId);
            this.deviceStates.delete(deviceId);
            this.lastUpdateTimes.delete(deviceId);
            this.lastDeviceHashes.delete(deviceId);
            this.statusSyncInProgress.delete(deviceId);
        });

        this.updateThrottleMap.clear();
        this.pendingOperations.clear();

        console.log('✅ Tenant caches cleared');
    }

    // FIXED: Get cache statistics with tenant context
    getCacheStats() {
        const tenantDeviceCount = this.getAllDevices().length;

        return {
            updateThrottleMap: this.updateThrottleMap.size,
            lastDeviceHashes: this.lastDeviceHashes.size,
            pendingOperations: this.pendingOperations.size,
            statusSyncInProgress: this.statusSyncInProgress.size,
            awsThings: this.awsThings.size,
            tenantDevices: tenantDeviceCount,
            deviceStates: this.deviceStates.size,
            lastUpdateTimes: this.lastUpdateTimes.size,
            currentTenantId: this.currentTenantId
        };
    }

    // FIXED: Health check with tenant context
    async healthCheck() {
        try {
            const response = await this._makeRequest(`${this.backendUrl}/api/health`);
            return {
                success: true,
                backend: response,
                websocket: {
                    connected: this.isConnected(),
                    state: this.getConnectionState()
                },
                cache: this.getCacheStats(),
                connection: this.getConnectionStats(),
                tenant: {
                    currentTenantId: this.currentTenantId,
                    deviceCount: this.getDeviceCount()
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                websocket: {
                    connected: this.isConnected(),
                    state: this.getConnectionState()
                },
                tenant: {
                    currentTenantId: this.currentTenantId
                }
            };
        }
    }

    // FIXED: Proper disconnect with tenant-aware cleanup
    disconnect() {
        console.log('🔌 Disconnecting real-time service for tenant:', this.currentTenantId);

        this.isDestroyed = true;

        // Clear all timers
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        if (this.reconnectTimeoutId) {
            clearTimeout(this.reconnectTimeoutId);
            this.reconnectTimeoutId = null;
        }

        // Close WebSocket
        if (this.ws) {
            this.ws.close(1000, 'Manual disconnect');
            this.ws = null;
        }

        // Clear tenant-specific state
        this.clearCaches();

        // Reset service state
        this.isInitialized = false;
        this.initPromise = null;
        this.connectionState = 'disconnected';
        this.listeners.clear();
        this.isLoadingInitialData = false;
        this.hasLoadedInitialData = false;
        this.reconnectAttempts = 0;
        this.connectionAttempts = 0;
        this.currentTenantId = null;

        console.log('✅ Real-time service disconnected');
    }

    // FIXED: Restart service with tenant context
    async restart(tenantId = null) {
        console.log('🔄 Restarting real-time service for tenant:', tenantId || this.currentTenantId);

        // Store tenant context
        const tenant = tenantId || this.currentTenantId;

        // Disconnect first
        this.disconnect();

        // Reset destroyed flag
        this.isDestroyed = false;

        // Restore tenant context
        if (tenant) {
            this.setTenantContext(tenant);
        }

        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Initialize again
        return this.initialize(tenant);
    }

    // FIXED: Debug information with tenant context
    getDebugInfo() {
        return {
            service: {
                isInitialized: this.isInitialized,
                isDestroyed: this.isDestroyed,
                hasLoadedInitialData: this.hasLoadedInitialData,
                isLoadingInitialData: this.isLoadingInitialData,
                currentTenantId: this.currentTenantId
            },
            connection: this.getConnectionStats(),
            cache: this.getCacheStats(),
            endpoints: {
                backend: this.backendUrl,
                websocket: this.wsUrl
            },
            timers: {
                heartbeatActive: !!this.heartbeatInterval,
                reconnectPending: !!this.reconnectTimeoutId
            },
            tenant: {
                currentTenantId: this.currentTenantId,
                deviceCount: this.getDeviceCount(),
                devices: this.getAllDevices().map(d => ({ id: d.id, name: d.name, status: d.status }))
            }
        };
    }
}

// FIXED: Create singleton instance with multi-tenant support
const realTimeService = new RealTimeService();

// FIXED: Add global error handlers for better debugging
if (typeof window !== 'undefined') {
    window.realTimeService = realTimeService;

    // Add unload handler to clean up
    window.addEventListener('beforeunload', () => {
        realTimeService.disconnect();
    });

    // Add visibility change handler to manage connections
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            console.log('🌙 Page hidden - maintaining connection for tenant:', realTimeService.currentTenantId);
        } else {
            console.log('☀️ Page visible - checking connection for tenant:', realTimeService.currentTenantId);
            if (!realTimeService.isConnected() && realTimeService.isInitialized) {
                realTimeService.forceReconnect();
            }
        }
    });
}

export default realTimeService;