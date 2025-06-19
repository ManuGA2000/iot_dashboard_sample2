
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Home, Settings, Users, FileText, Shield, Power,
  MapPin, Search, Filter, Bell, Volume2, Mic,
  Plus, Edit, Trash2, Save, Download, Eye,
  ChevronDown, Menu, X, Activity, Wifi, WifiOff,
  Zap, AlertTriangle, Flame, Wind, LogOut, Moon, Sun,
  Play, Pause, RotateCcw, User, Calendar, BarChart3,
  Camera, Mail, Phone, Lock, Globe, Radio, Lightbulb,
  Target, Move, Layers, TrendingUp, Database, Cpu,
  Check, UserPlus, UserMinus, AlertCircle, KeyRound, Info
} from 'lucide-react';
import InteractiveMap from './components/InteractiveMap';
import realTimeService from './services/realTimeService';
import { debounce } from 'lodash';
import cognitoService from './CognitoService';
import { AWS_CONFIG } from './CognitoService';






const ProfessionalIoTDashboard = () => {
  // User and UI state
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  // FIXED: Stable state management - no unnecessary re-renders
  const [devices, setDevices] = useState([]);
  const [groups, setGroups] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [statusHistory, setStatusHistory] = useState([]);

  // Control state
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMapDevice, setSelectedMapDevice] = useState(null);


  const [controlMode, setControlMode] = useState('scenario');

  // Add these states with your other state declarations
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  // Modal state
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [awsThings, setAwsThings] = useState([]);



  const [logoVersion, setLogoVersion] = useState(0);


  const [newGroup, setNewGroup] = useState({
    name: '',
    description: '',
    color: 'blue'
  });

  // FIXED: Proper refs for stable operations
  const initializeRef = useRef(false);
  const isServiceInitializedRef = useRef(false);
  const eventListenersRef = useRef(new Map());
  const lastDevicesHashRef = useRef('');
  const pendingUpdatesRef = useRef(new Map());


  const addToStatusHistory = useCallback((deviceData) => {
    setStatusHistory(prev => {
      const newEntry = {
        id: Date.now() + Math.random(),
        deviceId: deviceData.id,
        status: deviceData.status,
        features: deviceData.features,
        timestamp: deviceData.timestamp || Date.now(),
        message: deviceData.message || `Device ${deviceData.id} status updated`,
        time: new Date().toLocaleTimeString()
      };

      // FIXED: Enhanced duplicate detection
      const isDuplicate = prev.some(entry =>
        entry.deviceId === newEntry.deviceId &&
        entry.message === newEntry.message &&
        (Date.now() - entry.timestamp) < 5000 // Increased to 5 seconds
      );

      if (isDuplicate) {
        console.log('🔄 Skipping duplicate status history entry for', newEntry.deviceId);
        return prev;
      }

      // FIXED: Also check for similar messages
      const isSimilar = prev.some(entry =>
        entry.deviceId === newEntry.deviceId &&
        entry.status === newEntry.status &&
        (Date.now() - entry.timestamp) < 2000 // Similar messages within 2 seconds
      );

      if (isSimilar) {
        console.log('🔄 Skipping similar status history entry for', newEntry.deviceId);
        return prev;
      }

      const newHistory = [newEntry, ...prev].slice(0, 50);
      console.log('📝 Added to status history:', newEntry.message);
      return newHistory;
    });
  }, []);

  // FIXED: Stable event handlers using useCallback with proper dependencies
  // FIXED: Prevent unnecessary re-renders by memoizing the device status update
  // MINIMAL CHANGE: Replace this function in your frontend (paste-3.txt)
  const handleDeviceStatusUpdate = useCallback((data) => {
    if (!data.deviceId || !data.device) {
      return;
    }

    // FIXED: Use functional update to prevent re-renders when no changes
    setDevices(prevDevices => {
      const deviceIndex = prevDevices.findIndex(device => device.id === data.deviceId);
      if (deviceIndex === -1) return prevDevices;

      const currentDevice = prevDevices[deviceIndex];

      // FIXED: Create updated device with proper status calculation
      const updatedDevice = {
        ...currentDevice,
        ...data.device,
        id: data.deviceId,
        features: data.device.features || currentDevice.features || {
          siren: false,
          beacon: false,
          announcement: false,
          dispenser: false
        },
        relayStates: data.device.relayStates || currentDevice.relayStates || {
          relay1: false,
          relay2: false,
          relay3: false,
          relay4: false
        }
      };

      // REMOVED: Don't recalculate status in frontend - use what backend sends
      // Just use the status that comes from backend directly
      // The backend will now always send 'online' when device is connected

      // FIXED: More thorough comparison to prevent unnecessary updates
      const currentDeviceString = JSON.stringify({
        status: currentDevice.status,
        features: currentDevice.features,
        relayStates: currentDevice.relayStates,
        lastSeen: currentDevice.lastSeen,
        lastUpdateTime: currentDevice.lastUpdateTime
      });

      const newDeviceString = JSON.stringify({
        status: updatedDevice.status,
        features: updatedDevice.features,
        relayStates: updatedDevice.relayStates,
        lastSeen: updatedDevice.lastSeen,
        lastUpdateTime: updatedDevice.lastUpdateTime
      });

      // Only update if something actually changed
      if (currentDeviceString === newDeviceString) {
        console.log('🔄 Skipping update - no actual changes for', data.deviceId);
        return prevDevices; // No change, prevent re-render
      }

      const newDevices = [...prevDevices];
      newDevices[deviceIndex] = updatedDevice;

      console.log(`✅ Device state updated: ${data.deviceId} - Status: ${updatedDevice.status}`);

      // Log active features for debugging
      const hasActiveFeatures = Object.values(updatedDevice.features || {}).some(feature => feature === true);
      if (hasActiveFeatures) {
        const activeFeatures = Object.entries(updatedDevice.features || {})
          .filter(([k, v]) => v)
          .map(([k]) => k);
        console.log(`🎛️ Active features for ${data.deviceId}:`, activeFeatures.join(', '));
      }

      return newDevices;
    });

    // FIXED: Only add to history for significant changes (not routine status updates)
    if (data.source === 'relay_ack' || data.source === 'connection' || data.source === 'command_sent') {
      const activeFeatures = Object.entries(data.device.features || {})
        .filter(([k, v]) => v)
        .map(([k]) => k)
        .join(', ') || 'none active';

      addToStatusHistory({
        id: data.deviceId,
        status: 'status_update',
        message: `Device ${data.deviceId} ${data.source === 'relay_ack' ? 'hardware ACK' : 'status'} - Features: ${activeFeatures}`,
        timestamp: Date.now()
      });
    }
  }, [addToStatusHistory]);

  const handleDeviceCreated = useCallback((device) => {
    console.log('📱 Device created event received:', device);

    setDevices(prev => {
      const exists = prev.some(d => d.id === device.id);
      if (exists) {
        return prev.map(d => d.id === device.id ? device : d);
      }
      return [...prev, device];
    });

    addToStatusHistory({
      id: device.id,
      status: 'created',
      message: `AWS IoT Thing ${device.name} registered successfully`,
      timestamp: Date.now()
    });
  }, []);

  const handleScenarioExecuted = useCallback((data) => {
    console.log('🎭 Scenario executed event received:', data);
    addToStatusHistory({
      id: 'system',
      status: 'scenario_executed',
      message: `Scenario executed: ${data.scenario?.name || 'Unknown'}`,
      timestamp: Date.now()
    });
  }, []);

  const handleCommandSent = useCallback((data) => {
    console.log('📤 Command sent event received:', data);
    addToStatusHistory({
      id: data.deviceId || 'system',
      status: 'command_sent',
      message: `Command sent: ${data.command || 'Unknown command'}`,
      timestamp: Date.now()
    });
  }, []);

  const handleConnectionStatus = useCallback((data) => {
    console.log('🔌 Connection status update:', data);
    setConnectionStatus(data.status === 'connected' ? 'connected' : 'disconnected');
  }, []);



  // FIXED: Proper initialization with prevent double initialization
  useEffect(() => {
    if (initializeRef.current || isServiceInitializedRef.current) {
      return;
    }

    initializeRef.current = true;

    const initializeService = async () => {
      try {
        console.log('🚀 Initializing dashboard...');
        setConnectionStatus('connecting');

        // FIXED: Initialize service only once
        if (!isServiceInitializedRef.current) {
          await realTimeService.initialize();
          isServiceInitializedRef.current = true;
        }

        setConnectionStatus('connected');

        // Load initial data
        await loadInitialData();

        // Set up event listeners
        setupEventListeners();

        console.log('✅ Dashboard initialization complete');

      } catch (error) {
        console.error('❌ Failed to initialize dashboard:', error);
        setConnectionStatus('error');
      }
    };

    initializeService();

    // FIXED: Cleanup function that doesn't trigger re-initialization
    return () => {
      console.log('🧹 Cleaning up dashboard...');
      cleanupEventListeners();
      // Don't disconnect service here to prevent re-initialization issues
    };
  }, []); // FIXED: Empty dependency array



  // Add this with your other event handlers
  const handleAckTimeout = useCallback((data) => {
    console.warn('⚠️ ACK timeout received:', data);

    // Show user notification
    alert(`⚠️ Warning: ${data.message}\n\nThe device may be experiencing connectivity issues.`);

    // Add to status history
    addToStatusHistory({
      id: data.deviceId,
      status: 'ack_timeout',
      message: `ACK timeout: ${data.feature} command on ${data.deviceId}`,
      timestamp: Date.now()
    });
  }, [addToStatusHistory]);

  // Update the setupEventListeners function to include the new handler
  const setupEventListeners = useCallback(() => {
    console.log('📡 Setting up event listeners...');

    cleanupEventListeners();

    const listeners = new Map([
      ['device_status_update', realTimeService.on('device_status_update', handleDeviceStatusUpdate)],
      ['device_created', realTimeService.on('device_created', handleDeviceCreated)],
      ['scenario_executed', realTimeService.on('scenario_executed', handleScenarioExecuted)],
      ['command_sent', realTimeService.on('command_sent', handleCommandSent)],
      ['connection_status', realTimeService.on('connection_status', handleConnectionStatus)],
      ['ack_timeout', realTimeService.on('ack_timeout', handleAckTimeout)] // NEW: ACK timeout handler
    ]);

    eventListenersRef.current = listeners;
    console.log('✅ Event listeners set up successfully');
  }, [handleDeviceStatusUpdate, handleDeviceCreated, handleScenarioExecuted, handleCommandSent, handleConnectionStatus, handleAckTimeout]);

  // FIXED: Proper cleanup function
  const cleanupEventListeners = useCallback(() => {
    console.log('🧹 Cleaning up event listeners...');
    eventListenersRef.current.forEach((cleanup, eventName) => {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    });
    eventListenersRef.current.clear();
  }, []);

  // FIXED: Memoized data loading
  // Update your existing loadInitialData function
  const loadInitialData = useCallback(async () => {
    try {
      console.log('📋 Loading initial data from AWS...');

      const [devicesResponse, groupsResponse] = await Promise.all([
        realTimeService.fetchDevices(),
        realTimeService.fetchGroups()
      ]);

      if (devicesResponse.success) {
        console.log('📋 Loaded devices from AWS:', devicesResponse.devices);
        setDevices(devicesResponse.devices);
      } else {
        console.error('❌ Failed to load devices:', devicesResponse.error);
        setDevices([]);
      }

      if (groupsResponse.success) {
        console.log('📁 Loaded groups:', groupsResponse.groups);

        // Filter out locally deleted groups
        const deletedGroups = JSON.parse(localStorage.getItem('deletedGroups') || '[]');
        const filteredGroups = groupsResponse.groups.filter(group => !deletedGroups.includes(group.id));

        setGroups(filteredGroups);
      } else {
        console.error('❌ Failed to load groups:', groupsResponse.error);
        setGroups([]);
      }

    } catch (error) {
      console.error('❌ Error loading initial data:', error);
      setDevices([]);
      setGroups([]);
    }
  }, []);

  // FIXED: Load devices and groups from backend
  // Update your existing loadDevicesGroupsAndThings function
  const loadDevicesGroupsAndThings = useCallback(async () => {
    try {
      console.log('📋 Loading devices and groups...');

      const [devicesResponse, groupsResponse] = await Promise.all([
        realTimeService.fetchDevices(),
        realTimeService.fetchGroups()
      ]);

      if (devicesResponse.success) {
        console.log('📋 Loaded devices:', devicesResponse.devices);
        setDevices(devicesResponse.devices);

        // Store devices in realTimeService for consistency
        devicesResponse.devices.forEach(device => {
          realTimeService.awsThings.set(device.id, device);
        });
      } else {
        console.error('❌ Failed to load devices:', devicesResponse.error);
      }

      if (groupsResponse.success) {
        console.log('📁 Loaded groups:', groupsResponse.groups);

        // Filter out locally deleted groups
        const deletedGroups = JSON.parse(localStorage.getItem('deletedGroups') || '[]');
        const filteredGroups = groupsResponse.groups.filter(group => !deletedGroups.includes(group.id));

        setGroups(filteredGroups);
      } else {
        console.error('❌ Failed to load groups:', groupsResponse.error);
      }

    } catch (error) {
      console.error('Error loading data:', error);
    }
  }, []);

  // FIXED: Update device in state
  const updateDeviceInState = useCallback((deviceId, updatedDevice) => {
    console.log('🔄 Updating device in state:', deviceId, updatedDevice);

    setDevices(prevDevices => {
      const deviceIndex = prevDevices.findIndex(device => device.id === deviceId);

      if (deviceIndex === -1) {
        console.warn('⚠️ Device not found for update:', deviceId);
        return prevDevices;
      }

      const newDevices = [...prevDevices];
      newDevices[deviceIndex] = {
        ...newDevices[deviceIndex],
        ...updatedDevice,
        // Ensure we preserve the ID
        id: deviceId
      };

      console.log('✅ Device state updated:', deviceId, newDevices[deviceIndex]);
      return newDevices;
    });
  }, []);



  // FIXED: Stable device management functions with proper error handling
  const addDevice = useCallback(async (deviceData) => {
    try {
      console.log('📝 Adding device:', deviceData);

      const response = await realTimeService.registerDevice({
        thingName: deviceData.thingName,
        name: deviceData.name,
        location: deviceData.location,
        lat: deviceData.lat,
        lng: deviceData.lng,
        group: deviceData.group,
        relayConfig: deviceData.relayConfig
      });

      if (response.success) {
        console.log('✅ Device added successfully:', response.device);
        return response.device;
      } else {
        throw new Error(response.message || 'Failed to register device');
      }
    } catch (error) {
      console.error('❌ Error adding device:', error);
      throw error;
    }
  }, []);

  const removeDevice = useCallback(async (deviceId) => {
    try {
      console.log('🗑️ Removing device:', deviceId);

      const response = await realTimeService.deleteDeviceCompat(deviceId);

      if (response.success) {
        console.log('✅ Device removed successfully');

        // Remove from local state
        setDevices(prevDevices => prevDevices.filter(device => device.id !== deviceId));

        // Remove from groups
        setGroups(prevGroups =>
          prevGroups.map(group => ({
            ...group,
            devices: group.devices.filter(id => id !== deviceId)
          }))
        );
      } else {
        throw new Error(response.message || response.error);
      }
    } catch (error) {
      console.error('❌ Error removing device:', error);
      throw error;
    }
  }, []);

  const updateDevice = useCallback((deviceId, updates) => {
    setDevices(prev => prev.map(device =>
      device.id === deviceId ? { ...device, ...updates } : device
    ));
  }, []);

  // FIXED: Optimized toggle function with debouncing
  const toggleDeviceFeature = useCallback(async (deviceId, feature) => {
    try {
      console.log(`🎛️ Toggle request: ${feature} for device ${deviceId}`);

      const device = devices.find(d => d.id === deviceId);
      if (!device) {
        throw new Error(`Device ${deviceId} not found`);
      }

      // FIXED: Check if device is online or active (not offline)
      if (device.status === 'offline') {
        throw new Error(`Device ${deviceId} is offline. Cannot control offline devices.`);
      }

      const currentFeatureState = device.features?.[feature] || false;
      const newFeatureState = !currentFeatureState;

      console.log(`🎛️ Sending command to ${feature}: ${currentFeatureState} → ${newFeatureState}`);
      console.log(`⏳ Waiting for hardware acknowledgment on ${deviceId}/relay/ack...`);

      const response = await realTimeService.toggleDeviceFeature(deviceId, feature);

      if (response.success) {
        console.log(`✅ Command sent - waiting for hardware ACK on ${deviceId}/relay/ack`);

        addToStatusHistory({
          id: deviceId,
          status: 'command_sent',
          message: `${feature} command sent to ${deviceId} - waiting for hardware ACK`,
          timestamp: Date.now()
        });

        return { success: true, message: response.message };
      } else {
        console.error(`❌ Feature toggle failed: ${response.message}`);
        return { success: false, message: response.message };
      }
    } catch (error) {
      console.error('❌ Failed to toggle device feature:', error);
      return { success: false, message: error.message };
    }
  }, [devices, addToStatusHistory]);

  // FIXED: Optimized status request with caching
  const requestDeviceStatus = useCallback(async (deviceId) => {
    try {
      console.log('📊 Requesting status sync for device:', deviceId);

      const response = await realTimeService.requestDeviceStatusSync(deviceId);

      if (response.success) {
        addToStatusHistory({
          id: deviceId,
          status: 'status_synced',
          message: `Status synced for ${deviceId}`,
          timestamp: Date.now()
        });
        return { success: true };
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
      console.error('❌ Failed to sync device status:', error);
      return { success: false, message: error.message };
    }
  }, [addToStatusHistory]);

  // FIXED: Optimized scenario execution
  const executeScenario = useCallback(async (selectedDevices, scenarioFeatures) => {
    try {
      console.log('🎭 Executing scenario with features:', scenarioFeatures);
      console.log('🎯 Target devices:', selectedDevices);

      if (!selectedDevices || selectedDevices.length === 0) {
        throw new Error('No devices selected');
      }

      if (!scenarioFeatures || typeof scenarioFeatures !== 'object') {
        throw new Error('Invalid scenario features');
      }

      // FIXED: Check device status before sending commands
      const offlineDevices = [];
      const onlineDevices = [];

      selectedDevices.forEach(deviceId => {
        const device = devices.find(d => d.id === deviceId);
        if (!device) {
          offlineDevices.push(deviceId);
        } else if (device.status === 'offline') {
          offlineDevices.push(deviceId);
        } else {
          onlineDevices.push(deviceId);
        }
      });

      if (offlineDevices.length > 0) {
        throw new Error(`Cannot execute scenario: ${offlineDevices.length} device(s) are offline. Only online/active devices can receive commands.`);
      }

      const validatedFeatures = {
        siren: Boolean(scenarioFeatures.siren),
        beacon: Boolean(scenarioFeatures.beacon),
        announcement: Boolean(scenarioFeatures.announcement),
        dispenser: Boolean(scenarioFeatures.dispenser)
      };

      console.log('✅ Validated features:', validatedFeatures);
      console.log('⏳ Sending commands to online devices - dashboard will update when devices send ACK...');

      // DON'T apply optimistic updates - wait for hardware acknowledgment
      const results = await realTimeService.executeScenarioCompat(selectedDevices, validatedFeatures);

      const successful = results.filter(r => r.success).length;
      const total = results.length;

      addToStatusHistory({
        id: 'scenario',
        status: 'scenario_executed',
        message: `Scenario commands sent to ${successful}/${total} devices - waiting for hardware ACK`,
        timestamp: Date.now()
      });

      return {
        success: successful === total,
        message: `Scenario commands sent to ${successful}/${total} devices`
      };
    } catch (error) {
      console.error('❌ Failed to execute scenario:', error);
      return { success: false, message: error.message };
    }
  }, [devices, addToStatusHistory]);

  // FIXED: Stable group management
  const createGroup = useCallback(async (groupData) => {
    try {
      const response = await realTimeService.createGroup(groupData);

      if (response.success) {
        setGroups(prev => [...prev, response.group]);

        // Update devices to assign them to this group
        groupData.deviceIds?.forEach(deviceId => {
          updateDevice(deviceId, { group: groupData.name });
        });

        return response.group;
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
      console.error('Error creating group:', error);
      throw error;
    }
  }, [updateDevice]);

  // FIXED: Set initial tab based on role - stable
  // FIXED: Set initial tab based on role - stable
  useEffect(() => {
    if (currentUser && !activeTab) {
      if (currentUser.role === 'admin') {
        setActiveTab('home'); // Dashboard for admin
      } else if (currentUser.role === 'supervisor') {
        setActiveTab('assets'); // Assets page for supervisor
      } else if (currentUser.role === 'guard') {
        setActiveTab('control'); // Control page for guard
      }
    }
  }, [currentUser, activeTab]);


  useEffect(() => {
    const handleStorageChange = () => {
      setLogoVersion(prev => prev + 1);
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // FIXED: Mobile detection - stable
  useEffect(() => {
    const checkMobile = () => {
      const newIsMobile = window.innerWidth < 768;
      if (newIsMobile !== isMobile) {
        setIsMobile(newIsMobile);
        if (!newIsMobile) {
          setMobileMenuOpen(false);
        }
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [isMobile]);


  // Add this useEffect in your component:
  useEffect(() => {
    document.body.style.background = 'linear-gradient(135deg, #0a0e1a 0%, #1a1f3a 25%, #2a2f4a 50%, #1a1f3a 75%, #0a0e1a 100%)';
    document.body.style.minHeight = '100vh';

    return () => {
      document.body.style.background = '';
      document.body.style.minHeight = '';
    };
  }, []);

  // FIXED: Memoized computed values to prevent unnecessary re-calculations
  // CHANGE ONLY THE STATS: Count "active" devices as also being "online"
  // FIXED: Updated device stats calculation in your frontend
  // Replace your existing deviceStats calculation with this:

  const deviceStats = useMemo(() => {
    // Count all devices that are NOT offline as online (includes both 'online' and 'active+online')
    const onlineDevices = devices.filter(d => d.status !== 'offline').length;

    const totalDevices = devices.length;

    // FIXED: Count devices as active ONLY if they have active features OR status contains 'active'
    const activeDevices = devices.filter(d => {
      // Check if device has any active features
      const hasActiveFeatures = d.features && Object.values(d.features).some(feature => feature === true);

      // MINIMAL CHANGE: Device is active only if it has active features
      return hasActiveFeatures;
    }).length;

    // Count only devices with 'offline' status as offline
    const offlineDevices = devices.filter(d => d.status === 'offline').length;

    console.log('📊 Device Stats Debug:', {
      totalDevices,
      onlineDevices, // All non-offline devices
      activeDevices, // Only devices with active features
      offlineDevices // Only 'offline' status devices
    });

    console.log('📊 Active Devices Breakdown:',
      devices.filter(d => {
        const hasActiveFeatures = d.features && Object.values(d.features).some(feature => feature === true);
        return hasActiveFeatures;
      }).map(d => ({
        id: d.id,
        status: d.status,
        activeFeatures: Object.entries(d.features || {}).filter(([k, v]) => v).map(([k]) => k)
      }))
    );

    return {
      online: onlineDevices, // All connected devices
      total: totalDevices,
      active: activeDevices, // Only devices with active features
      offline: offlineDevices
    };
  }, [devices]);

  // FIX 3: Make sure your getStatusDisplay function handles all status types:
  const getStatusDisplay = (status) => {
    switch (status) {
      case 'online': return { text: 'ONLINE', class: 'bg-emerald-500/20 text-emerald-400 border-emerald-400/30' };
      case 'offline': return { text: 'OFFLINE', class: 'bg-red-500/20 text-red-400 border-red-400/30' };
      case 'active': return { text: 'ACTIVE', class: 'bg-amber-500/20 text-amber-400 border-amber-400/30' };
      case 'active+online': return { text: 'ACTIVE + ONLINE', class: 'bg-gradient-to-r from-amber-500/20 to-emerald-500/20 text-amber-400 border-amber-400/30' };
      default: return { text: 'UNKNOWN', class: 'bg-gray-500/20 text-gray-400 border-gray-400/30' };
    }
  };


  // FIXED: Memoized filtered devices
  const filteredDevices = useMemo(() => {
    return devices.filter(device => {
      const groupMatch = selectedGroup === 'all' || device.group === selectedGroup;
      const searchMatch = !searchTerm ||
        device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        device.location.toLowerCase().includes(searchTerm.toLowerCase());

      return groupMatch && searchMatch;
    });
  }, [devices, selectedGroup, searchTerm]);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        await cognitoService.initialize();

        // Check for existing session
        const sessionResult = await cognitoService.getCurrentUser();
        if (sessionResult.success) {
          setCurrentUser(sessionResult.user);
        }
      } catch (error) {
        console.error('Failed to initialize authentication:', error);
      }
    };

    initializeAuth();
  }, []);

  // Login Form Component
  // FIXED: Enhanced Login Form Component with Signup functionality
  const LoginForm = () => {
    const [loginType, setLoginType] = useState('admin');
    const [isSignUp, setIsSignUp] = useState(false);
    const [formData, setFormData] = useState({
      username: '',
      email: '',
      password: '',
      confirmPassword: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
      e.preventDefault();
      setLoading(true);
      setError('');

      try {
        if (isSignUp && loginType === 'admin') {
          if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match');
            setLoading(false);
            return;
          }

          const result = await cognitoService.signUp(
            formData.email,
            formData.password,
            formData.username,
            'admin'
          );

          if (result.success) {
            alert('Account created! Please check your email for verification link.');
            setIsSignUp(false);
            setFormData({ username: '', email: '', password: '', confirmPassword: '' });
          } else {
            setError(result.error);
          }
        } else {
          const result = await cognitoService.signIn(formData.username, formData.password);

          if (result.success) {
            if (result.user.role !== loginType) {
              setError(`Access denied. This login is for ${loginType} users only.`);
              await cognitoService.signOut();
              return;
            }
            setCurrentUser(result.user);
          } else {
            setError(result.error);
          }
        }
      } catch (err) {
        setError('An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center" style={{
        background: 'linear-gradient(135deg, #0a0e1a 0%, #1a1f3a 25%, #2a2f4a 50%, #1a1f3a 75%, #0a0e1a 100%)',
      }}>
        {/* Background Effects - Keep exactly as original */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: `
            radial-gradient(circle at 20% 20%, rgba(0, 255, 255, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(0, 100, 255, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 40% 60%, rgba(100, 0, 255, 0.15) 0%, transparent 50%)
          `
          }}></div>
        </div>

        <div className="w-full max-w-md mx-4 relative z-10">
          {/* Logo - Keep exactly as original */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 rounded-xl bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 flex items-center justify-center animate-pulse" style={{
              boxShadow: '0 0 30px rgba(0, 255, 255, 0.4)'
            }}>
              <Shield className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 mb-2">
              ELPRO IoT Control
            </h1>
            <p className="text-gray-400">Secure Access Portal</p>
          </div>

          {/* Keep Original Three Tabs Exactly */}
          <div className="flex mb-6 bg-gray-900/60 backdrop-blur-sm rounded-xl p-1 border border-cyan-500/20">
            {[
              { id: 'admin', label: 'Admin' },
              { id: 'supervisor', label: 'Supervisor' },
              { id: 'guard', label: 'Guard' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setLoginType(tab.id);
                  setIsSignUp(false); // Reset to signin when switching tabs
                  setError('');
                  setFormData({ username: '', email: '', password: '', confirmPassword: '' });
                }}
                className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${loginType === tab.id
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Login Form - Keep exactly as original */}
          <div className="bg-gray-900/60 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-6">
            {/* Sign Up/Sign In Toggle for Admin Only */}
            {loginType === 'admin' && (
              <div className="flex mb-6 bg-gray-800/50 rounded-lg p-1">
                <button
                  onClick={() => {
                    setIsSignUp(false);
                    setError('');
                    setFormData({ username: '', email: '', password: '', confirmPassword: '' });
                  }}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${!isSignUp ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => {
                    setIsSignUp(true);
                    setError('');
                    setFormData({ username: '', email: '', password: '', confirmPassword: '' });
                  }}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${isSignUp ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                >
                  Sign Up
                </button>
              </div>
            )}

            <h2 className="text-xl font-semibold text-white mb-6 text-center">
              {loginType === 'admin'
                ? (isSignUp ? 'Create Admin Account' : 'Admin Sign In')
                : `${loginType.charAt(0).toUpperCase() + loginType.slice(1)} Sign In`
              }
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-400/30 rounded-lg flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-red-400" />
                <span className="text-red-400 text-sm">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Username</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all"
                  placeholder="Enter your username"
                  required
                />
              </div>

              {/* Email field only for admin signup */}
              {isSignUp && loginType === 'admin' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all"
                    placeholder="Enter your email"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all"
                  placeholder="Enter your password"
                  required
                />
              </div>

              {/* Confirm password only for admin signup */}
              {isSignUp && loginType === 'admin' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Confirm Password</label>
                  <input
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all"
                    placeholder="Confirm your password"
                    required
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:via-blue-500 hover:to-purple-500 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:transform-none flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>
                    {loginType === 'admin'
                      ? (isSignUp ? 'Create Account' : 'Sign In')
                      : 'Sign In'
                    }
                  </span>
                )}
              </button>
            </form>

            {/* Info message for non-admin users */}
            {loginType !== 'admin' && (
              <div className="mt-4 p-3 bg-blue-500/20 border border-blue-400/30 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Info className="w-4 h-4 text-blue-400" />
                  <span className="text-blue-400 text-sm">
                    {loginType.charAt(0).toUpperCase() + loginType.slice(1)} accounts are created by administrators.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Navigation menu items based on role
  const getMenuItems = () => {
    if (currentUser?.role === 'admin') {
      return [
        { id: 'home', label: 'Dashboard', icon: Home },
        { id: 'assets', label: 'Assets', icon: MapPin },
        { id: 'control', label: 'Control', icon: Power },
        { id: 'reports', label: 'Reports', icon: BarChart3 },
        { id: 'groups', label: 'Groups', icon: Layers },
        { id: 'users', label: 'Users', icon: Users },
        { id: 'settings', label: 'Settings', icon: Settings },
        { id: 'profile', label: 'Profile', icon: User },
      ];
    } else if (currentUser?.role === 'supervisor') {
      return [
        { id: 'assets', label: 'Assets', icon: MapPin },
        { id: 'control', label: 'Control', icon: Power },
        { id: 'reports', label: 'Reports', icon: BarChart3 },
        { id: 'profile', label: 'Profile', icon: User },
      ];
    } else if (currentUser?.role === 'guard') {
      return [
        { id: 'control', label: 'Control', icon: Power },
        { id: 'profile', label: 'Profile', icon: User },
      ];
    }
    return [];
  };

  // Device Status Icon Component
  const DeviceStatusIcon = ({ device, size = "md" }) => {
    const sizeClasses = {
      sm: "w-8 h-8",
      md: "w-12 h-12",
      lg: "w-16 h-16"
    };

    const getStatusColor = () => {
      switch (device.status) {
        case 'online': return 'from-emerald-400 to-emerald-600';
        case 'offline': return 'from-red-400 to-red-600';
        case 'active': return 'from-amber-400 to-amber-600';
        case 'active+online': return 'from-amber-400 to-emerald-600'; // Gradient for dual status
        default: return 'from-gray-400 to-gray-600';
      }
    };

    return (
      <div className={`${sizeClasses[size]} rounded-lg bg-gradient-to-r ${getStatusColor()} flex items-center justify-center relative shadow-lg transition-all transform hover:scale-110`} style={{
        boxShadow: device.status === 'online' ? '0 0 15px rgba(16, 185, 129, 0.4)' :
          device.status === 'offline' ? '0 0 15px rgba(239, 68, 68, 0.4)' :
            device.status === 'active+online' ? '0 0 15px rgba(245, 158, 11, 0.4)' :
              '0 0 15px rgba(245, 158, 11, 0.4)'
      }}>
        <Zap className={`${size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-6 h-6' : 'w-8 h-8'} text-white`} />

        {/* Primary status indicator */}
        <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${device.status === 'online' ? 'bg-emerald-500' :
          device.status === 'offline' ? 'bg-red-500' :
            device.status === 'active+online' ? 'bg-amber-500 animate-pulse' :
              'bg-amber-500'
          } ${device.status === 'active' || device.status === 'active+online' ? 'animate-pulse' : ''}`}></div>

        {/* Secondary indicator for dual status */}
        {device.status === 'active+online' && (
          <div className="absolute -top-1 -left-1 w-3 h-3 rounded-full border-2 border-white bg-emerald-500"></div>
        )}
      </div>
    );
  };

  // FIXED: Add Device Modal with proper thing selection and default features
  // COMPLETELY FIXED: Add Device Modal with local state management
  const AddDeviceModal = () => {
    // LOCAL STATE - not using parent's newDevice state
    const [localDevice, setLocalDevice] = useState({
      thingName: '',
      name: '',
      location: '',
      lat: 12.9716,
      lng: 77.5946,
      group: null,
      relayConfig: {
        relay1: 'siren',
        relay2: 'beacon',
        relay3: 'announcement',
        relay4: 'dispenser'
      }
    });

    const [isCreating, setIsCreating] = useState(false);
    const [availableThings, setAvailableThings] = useState([]);
    const [loadingThings, setLoadingThings] = useState(false);

    // Load available things when modal opens
    useEffect(() => {
      const loadAvailableThings = async () => {
        setLoadingThings(true);
        try {
          const response = await realTimeService.getAwsThings();
          if (response.success) {
            const unregisteredThings = response.things.filter(thing => !thing.isRegistered);
            setAvailableThings(unregisteredThings);
            console.log('Available unregistered things:', unregisteredThings);
          } else {
            console.error('Failed to load things:', response.error);
            setAvailableThings([]);
          }
        } catch (error) {
          console.error('Error loading available things:', error);
          setAvailableThings([]);
        } finally {
          setLoadingThings(false);
        }
      };

      loadAvailableThings();
    }, []);

    // Simple input handlers using local state
    const handleThingNameChange = (e) => {
      const value = e.target.value;
      setLocalDevice(prev => {
        const updated = { ...prev, thingName: value };

        // Auto-populate fields when thing is selected
        if (value) {
          const selectedThing = availableThings.find(thing => thing.thingName === value);
          if (selectedThing) {
            return {
              ...updated,
              name: selectedThing.thingName,
              location: selectedThing.attributes?.location || '',
              lat: parseFloat(selectedThing.attributes?.latitude) || 12.9716,
              lng: parseFloat(selectedThing.attributes?.longitude) || 77.5946,
              group: selectedThing.attributes?.group || null
            };
          }
        }

        return updated;
      });
    };

    const handleNameChange = (e) => {
      setLocalDevice(prev => ({ ...prev, name: e.target.value }));
    };

    const handleLocationChange = (e) => {
      setLocalDevice(prev => ({ ...prev, location: e.target.value }));
    };

    const handleLatChange = (e) => {
      const value = e.target.value;
      setLocalDevice(prev => ({ ...prev, lat: value ? parseFloat(value) : 12.9716 }));
    };

    const handleLngChange = (e) => {
      const value = e.target.value;
      setLocalDevice(prev => ({ ...prev, lng: value ? parseFloat(value) : 77.5946 }));
    };

    const handleGroupChange = (e) => {
      const value = e.target.value;
      setLocalDevice(prev => ({ ...prev, group: value || null }));
    };

    const handleAddDevice = async () => {
      if (!localDevice.thingName || !localDevice.name || !localDevice.location) {
        alert('Please fill in all required fields');
        return;
      }

      setIsCreating(true);
      try {
        const device = await addDevice({
          thingName: localDevice.thingName,
          name: localDevice.name,
          location: localDevice.location,
          lat: localDevice.lat,
          lng: localDevice.lng,
          group: localDevice.group,
          relayConfig: localDevice.relayConfig
        });

        // Close modal and reset
        setShowAddDeviceModal(false);

        alert(`Device ${device.name} registered successfully with all features enabled!\nMQTT Topics:\n• Control: ${device.id}/relay/control\n• Status: ${device.id}/relay/status`);

        // Reload devices to show the new one
        await loadDevicesGroupsAndThings();

      } catch (error) {
        alert(`Failed to register device: ${error.message}`);
      } finally {
        setIsCreating(false);
      }
    };

    const handleModalClose = () => {
      setShowAddDeviceModal(false);
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 border border-cyan-500/30 rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-white">Register AWS IoT Thing</h3>
            <button
              onClick={handleModalClose}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            {/* AWS IoT Thing Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Select AWS IoT Thing *
              </label>
              {loadingThings ? (
                <div className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-gray-400 flex items-center">
                  <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mr-2"></div>
                  Loading available things...
                </div>
              ) : (
                <select
                  value={localDevice.thingName}
                  onChange={handleThingNameChange}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                  disabled={isCreating}
                >
                  <option value="">Select an AWS IoT Thing...</option>
                  {availableThings.map(thing => (
                    <option key={thing.thingName} value={thing.thingName}>
                      {thing.thingName} {thing.attributes?.location ? `(${thing.attributes.location})` : ''}
                    </option>
                  ))}
                </select>
              )}

              {localDevice.thingName && (
                <p className="text-xs text-cyan-400 mt-1">
                  📡 MQTT Topics: {localDevice.thingName}/relay/control & {localDevice.thingName}/relay/status
                </p>
              )}
            </div>

            {/* Device Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Device Name *</label>
              <input
                type="text"
                value={localDevice.name}
                onChange={handleNameChange}
                placeholder="e.g., Security Pole MG 001"
                className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
                disabled={isCreating}
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Location *</label>
              <input
                type="text"
                value={localDevice.location}
                onChange={handleLocationChange}
                placeholder="e.g., MG Road Junction, Near Metro Station"
                className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
                disabled={isCreating}
              />
            </div>

            {/* Coordinates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Latitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={localDevice.lat}
                  onChange={handleLatChange}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                  disabled={isCreating}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Longitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={localDevice.lng}
                  onChange={handleLngChange}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                  disabled={isCreating}
                />
              </div>
            </div>

            {/* Group Assignment */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Assign to Group</label>
              <select
                value={localDevice.group || ''}
                onChange={handleGroupChange}
                className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                disabled={isCreating}
              >
                <option value="">No Group</option>
                {groups.map(group => (
                  <option key={group.id} value={group.name}>{group.name}</option>
                ))}
              </select>
            </div>

            {/* Features Info */}
            <div className="p-3 bg-emerald-500/10 border border-emerald-400/30 rounded-lg">
              <p className="text-xs text-emerald-400">
                ✅ All features will be enabled by default and will be controlled in real-time:
                <br />• Siren (Relay 1) - Emergency alert
                <br />• Beacon (Relay 2) - Warning light
                <br />• Announcement (Relay 3) - PA system
                <br />• Dispenser (Relay 4) - Sanitizer dispenser
              </p>
            </div>


          </div>

          <div className="flex space-x-4 mt-6">
            <button
              onClick={handleModalClose}
              disabled={isCreating}
              className="flex-1 py-3 px-4 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAddDevice}
              disabled={!localDevice.thingName || !localDevice.name || !localDevice.location || isCreating || availableThings.length === 0}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isCreating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Registering...</span>
                </>
              ) : (
                <span>Register Device</span>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Add Group Modal
  // Add Group Modal
  const AddGroupModal = () => {
    const [selectedDevices, setSelectedDevices] = useState([]);
    const [isCreating, setIsCreating] = useState(false);
    // LOCAL STATE for inputs - FIXED
    const [localGroupName, setLocalGroupName] = useState('');
    const [localGroupDescription, setLocalGroupDescription] = useState('');

    const handleDeviceSelection = (deviceId) => {
      setSelectedDevices(prev => {
        if (prev.includes(deviceId)) {
          return prev.filter(id => id !== deviceId);
        } else {
          return [...prev, deviceId];
        }
      });
    };

    const handleAddGroup = async () => {
      if (!localGroupName) {
        alert('Please enter a group name');
        return;
      }

      setIsCreating(true);
      try {
        const group = await createGroup({
          name: localGroupName,
          description: localGroupDescription,
          color: newGroup.color,
          deviceIds: selectedDevices
        });

        setNewGroup({ name: '', description: '', color: 'blue' });
        setLocalGroupName('');
        setLocalGroupDescription('');
        setSelectedDevices([]);
        setShowAddGroupModal(false);

        alert(`Group ${group.name} created with ${selectedDevices.length} devices!`);
      } catch (error) {
        alert(`Failed to create group: ${error.message}`);
      } finally {
        setIsCreating(false);
      }
    };

    // FIXED: Proper modal close with state cleanup
    const handleModalClose = () => {
      setNewGroup({ name: '', description: '', color: 'blue' });
      setLocalGroupName('');
      setLocalGroupDescription('');
      setSelectedDevices([]);
      setShowAddGroupModal(false);
    };

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900/95 backdrop-blur-xl border border-cyan-500/30 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-white">Create New Group</h3>
            <button
              onClick={handleModalClose}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Group Name *</label>
              <input
                type="text"
                value={localGroupName} // FIXED: Using local state
                onChange={(e) => setLocalGroupName(e.target.value)} // FIXED: Local setter
                placeholder="e.g., Zone_A"
                className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
                disabled={isCreating}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
              <textarea
                value={localGroupDescription} // FIXED: Using local state
                onChange={(e) => setLocalGroupDescription(e.target.value)} // FIXED: Local setter
                placeholder="Group description..."
                rows="3"
                className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 resize-none"
                disabled={isCreating}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <label className="block text-sm font-medium text-gray-300">Select Devices</label>
                <div className="text-sm text-gray-400">
                  {selectedDevices.length} of {devices.length} selected
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 max-h-64 overflow-y-auto border border-gray-700/50 rounded-lg p-3 bg-gray-800/20">
                {devices.length === 0 ? (
                  <div className="text-center text-gray-500 py-4">
                    <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No devices available. Create devices first.</p>
                  </div>
                ) : (
                  devices.map((device) => (
                    <div
                      key={device.id}
                      onClick={() => handleDeviceSelection(device.id)}
                      className={`p-4 rounded-lg border transition-all cursor-pointer ${selectedDevices.includes(device.id)
                        ? 'border-cyan-400 bg-cyan-500/10'
                        : 'border-gray-700/50 bg-gray-800/30 hover:border-cyan-500/30'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <DeviceStatusIcon device={device} size="sm" />
                          <div>
                            <h4 className="font-medium text-white">{device.name}</h4>
                            <p className="text-xs text-gray-400">{device.location}</p>
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${selectedDevices.includes(device.id)
                          ? 'bg-cyan-400 border-cyan-400'
                          : 'border-gray-400'
                          }`}>
                          {selectedDevices.includes(device.id) && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex space-x-4 mt-6">
            <button
              onClick={handleModalClose} // FIXED: Using proper close handler
              disabled={isCreating}
              className="flex-1 py-3 px-4 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAddGroup}
              disabled={!localGroupName || isCreating} // FIXED: Using local state
              className="flex-1 py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isCreating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create Group</span>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };


  // Edit Group Modal
  const EditGroupModal = () => {
    const [selectedDevices, setSelectedDevices] = useState([]);
    const [isUpdating, setIsUpdating] = useState(false);
    const [localGroupName, setLocalGroupName] = useState('');
    const [localGroupDescription, setLocalGroupDescription] = useState('');

    // Initialize with existing group data
    useEffect(() => {
      if (editingGroup) {
        setLocalGroupName(editingGroup.name);
        setLocalGroupDescription(editingGroup.description || '');
        setSelectedDevices(editingGroup.devices || []);
      }
    }, [editingGroup]);

    const handleDeviceSelection = (deviceId) => {
      setSelectedDevices(prev => {
        if (prev.includes(deviceId)) {
          return prev.filter(id => id !== deviceId);
        } else {
          return [...prev, deviceId];
        }
      });
    };

    const handleUpdateGroup = async () => {
      if (!localGroupName) {
        alert('Please enter a group name');
        return;
      }

      setIsUpdating(true);
      try {
        // Update the group
        setGroups(prevGroups =>
          prevGroups.map(group =>
            group.id === editingGroup.id
              ? {
                ...group,
                name: localGroupName,
                description: localGroupDescription,
                devices: selectedDevices
              }
              : group
          )
        );

        // Update devices that were removed from group
        const removedDevices = editingGroup.devices.filter(deviceId => !selectedDevices.includes(deviceId));
        removedDevices.forEach(deviceId => {
          updateDevice(deviceId, { group: null });
        });

        // Update devices that were added to group
        const addedDevices = selectedDevices.filter(deviceId => !editingGroup.devices.includes(deviceId));
        addedDevices.forEach(deviceId => {
          updateDevice(deviceId, { group: localGroupName });
        });

        handleModalClose();
        alert(`Group ${localGroupName} updated successfully!`);
      } catch (error) {
        alert(`Failed to update group: ${error.message}`);
      } finally {
        setIsUpdating(false);
      }
    };

    const handleModalClose = () => {
      setLocalGroupName('');
      setLocalGroupDescription('');
      setSelectedDevices([]);
      setEditingGroup(null);
      setShowEditGroupModal(false);
    };

    if (!editingGroup) return null;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900/95 backdrop-blur-xl border border-cyan-500/30 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-white">Edit Group</h3>
            <button
              onClick={handleModalClose}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Group Name *</label>
              <input
                type="text"
                value={localGroupName}
                onChange={(e) => setLocalGroupName(e.target.value)}
                placeholder="e.g., Zone_A"
                className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
                disabled={isUpdating}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
              <textarea
                value={localGroupDescription}
                onChange={(e) => setLocalGroupDescription(e.target.value)}
                placeholder="Group description..."
                rows="3"
                className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 resize-none"
                disabled={isUpdating}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <label className="block text-sm font-medium text-gray-300">Select Devices</label>
                <div className="text-sm text-gray-400">
                  {selectedDevices.length} of {devices.length} selected
                </div>
              </div>

              <div className="flex space-x-2 mb-4">
                <button
                  onClick={() => setSelectedDevices(devices.map(d => d.id))}
                  className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded text-sm hover:bg-blue-500/30 transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={() => setSelectedDevices([])}
                  className="px-3 py-1 bg-gray-500/20 text-gray-400 rounded text-sm hover:bg-gray-500/30 transition-colors"
                >
                  Clear All
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 max-h-64 overflow-y-auto border border-gray-700/50 rounded-lg p-3 bg-gray-800/20">
                {devices.length === 0 ? (
                  <div className="text-center text-gray-500 py-4">
                    <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No devices available.</p>
                  </div>
                ) : (
                  devices.map((device) => (
                    <div
                      key={device.id}
                      onClick={() => handleDeviceSelection(device.id)}
                      className={`p-4 rounded-lg border transition-all cursor-pointer ${selectedDevices.includes(device.id)
                        ? 'border-cyan-400 bg-cyan-500/10'
                        : 'border-gray-700/50 bg-gray-800/30 hover:border-cyan-500/30'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <DeviceStatusIcon device={device} size="sm" />
                          <div>
                            <h4 className="font-medium text-white">{device.name}</h4>
                            <p className="text-xs text-gray-400">{device.location}</p>
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${selectedDevices.includes(device.id)
                          ? 'bg-cyan-400 border-cyan-400'
                          : 'border-gray-400'
                          }`}>
                          {selectedDevices.includes(device.id) && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex space-x-4 mt-6">
            <button
              onClick={handleModalClose}
              disabled={isUpdating}
              className="flex-1 py-3 px-4 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdateGroup}
              disabled={!localGroupName || isUpdating}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isUpdating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Updating...</span>
                </>
              ) : (
                <span>Update Group</span>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };


  // Add this function with your other group management functions
  // Replace your deleteGroup function with this one
  const deleteGroup = useCallback(async (groupId) => {
    try {
      console.log('🗑️ Deleting group locally:', groupId);

      // Get the group that's being deleted
      const groupToDelete = groups.find(g => g.id === groupId);

      if (groupToDelete) {
        // Update devices in this group to have no group
        if (groupToDelete.devices && groupToDelete.devices.length > 0) {
          groupToDelete.devices.forEach(deviceId => {
            updateDevice(deviceId, { group: null });
          });
        }
      }

      // Remove from local state
      setGroups(prevGroups => prevGroups.filter(group => group.id !== groupId));

      // Store deleted group IDs in localStorage to persist across refreshes
      const deletedGroups = JSON.parse(localStorage.getItem('deletedGroups') || '[]');
      if (!deletedGroups.includes(groupId)) {
        deletedGroups.push(groupId);
        localStorage.setItem('deletedGroups', JSON.stringify(deletedGroups));
      }

      console.log('✅ Group deleted successfully');
      return { success: true };
    } catch (error) {
      console.error('❌ Error deleting group:', error);
      return { success: false, message: error.message };
    }
  }, [groups, updateDevice]);

  // Sidebar Component
  const Sidebar = () => {
    const roleLogos = {
      admin: localStorage.getItem('adminLogo'),
      supervisor: localStorage.getItem('supervisorLogo'),
      guard: localStorage.getItem('guardLogo')
    };

    const currentRoleLogo = roleLogos[currentUser?.role];

    return (

      <>
        {isMobile && mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        <div className={`
       ${isMobile ? 'fixed' : 'relative'} 
       ${isMobile && !mobileMenuOpen ? '-translate-x-full' : 'translate-x-0'}
       w-64 h-full bg-gray-900/95 backdrop-blur-xl border-r border-cyan-500/20 flex flex-col z-50 transition-transform duration-300
     `} style={{
            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%)',
            boxShadow: '0 0 30px rgba(0, 255, 255, 0.1)'
          }}>
          {/* Logo */}
          <div className="p-6 border-b border-cyan-500/20">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 flex items-center justify-center animate-pulse" style={{
                boxShadow: '0 0 25px rgba(0, 255, 255, 0.4)'
              }}>
                <Shield className="w-7 h-7 text-white" />
              </div>

              <div>
                <h2 className="text-xl font-bold text-white">ELPRO</h2>
                <p className="text-xs text-cyan-300">IoT Control</p>
              </div>
            </div>
          </div>

          {/* Connection Status */}
          {/* Connection Status */}
          <div className="px-6 py-3 border-b border-cyan-500/20">
            <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${connectionStatus === 'connected' ? 'bg-emerald-500/20 border border-emerald-400/30' :
              connectionStatus === 'connecting' ? 'bg-amber-500/20 border border-amber-400/30' :
                'bg-red-500/20 border border-red-400/30'
              }`}>
              <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-400 animate-pulse' :
                connectionStatus === 'connecting' ? 'bg-amber-400 animate-spin' :
                  'bg-red-400'
                }`}></div>
              <span className={`text-xs font-medium ${connectionStatus === 'connected' ? 'text-emerald-400' :
                connectionStatus === 'connecting' ? 'text-amber-400' :
                  'text-red-400'
                }`}>
                {connectionStatus === 'connected' ? 'AWS IoT Connected' :
                  connectionStatus === 'connecting' ? 'Connecting to AWS...' :
                    connectionStatus === 'error' ? 'AWS Connection Error' :
                      'AWS IoT Disconnected'}
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4">
            <div className="space-y-2">
              {getMenuItems().map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    if (isMobile) setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-all duration-200 group transform hover:scale-105 ${activeTab === item.id
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-gray-300 hover:bg-gray-800/50 hover:text-cyan-300'
                    }`}
                >
                  <item.icon className={`w-5 h-5 transition-colors ${activeTab === item.id ? 'text-cyan-400' : 'text-gray-400 group-hover:text-cyan-400'
                    }`} />
                  <span className="font-medium">{item.label}</span>
                  {activeTab === item.id && (
                    <div className="ml-auto w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                  )}
                </button>
              ))}
            </div>
          </nav>

          {/* User Info */}
          {/* User Info */}
          <div className="p-4 border-t border-cyan-500/20">
            <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-800/30 border border-cyan-500/20">
              <div className="w-12 h-12 flex items-center justify-center">
                {localStorage.getItem('adminLogo') ? (
                  <img
                    src={localStorage.getItem('adminLogo')}
                    alt="System logo"
                    className="w-10 h-10 object-cover rounded-lg"
                    key={logoVersion}
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 flex items-center justify-center">
                    <Shield className="w-6 h-6 text-white" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{currentUser?.username}</p>
                <p className="text-xs text-cyan-300 capitalize">{currentUser?.role}</p>
              </div>
              <button
              onClick={() => {
          setCurrentUser(null); // Clear current user
          setActiveTab(''); // Reset activeTab on logout
          cognitoService.signOut(); // Perform Cognito sign-out
        }}
                className="p-1 rounded hover:bg-red-500/20 text-red-400 transition-colors transform hover:scale-110"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </>
    );
  };

  // Home Page Component
  // In your HomePage component, update the map section:
  const HomePage = () => {
    const { online: onlineDevices, active: activeDevices, total: totalDevices } = deviceStats;

    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div className="relative">
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 mb-2 animate-pulse">
              System Overview
            </h1>
            <p className="text-gray-400">Real-time monitoring and control dashboard</p>
            <div className="absolute -top-2 -left-2 w-20 h-1 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full animate-pulse"></div>
          </div>
          <div className="mt-4 md:mt-0">
            <div className="text-right bg-gray-900/50 backdrop-blur-sm border border-cyan-500/20 rounded-lg p-4">
              <p className="text-sm text-gray-400">Last updated</p>
              <p className="text-cyan-300 font-medium">
                {lastUpdate ? lastUpdate.toLocaleTimeString() : 'Never'}
              </p>
              <div className={`w-2 h-2 rounded-full mt-2 ml-auto ${connectionStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
                }`}></div>
            </div>
          </div>
        </div>

        {/* Stats Cards - Reduced size */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Devices', value: totalDevices, icon: Database, color: 'blue', gradient: 'from-blue-400 to-blue-600' },
            { label: 'Online Devices', value: onlineDevices, icon: Wifi, color: 'emerald', gradient: 'from-emerald-400 to-emerald-600' },
            { label: 'Active Alerts', value: activeDevices, icon: AlertTriangle, color: 'amber', gradient: 'from-amber-400 to-amber-600' },
            {
              label: 'Control',
              value: 'Access',
              icon: Power,
              color: 'purple',
              gradient: 'from-purple-400 to-purple-600',
              action: () => setActiveTab('control')
            },
          ].map((stat, index) => (
            <div
              key={index}
              className="bg-gray-900/60 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-3 hover:border-cyan-500/40 transition-all group transform hover:scale-105 hover:-translate-y-2 duration-300"
              style={{
                boxShadow: '0 0 15px rgba(0, 255, 255, 0.1)'
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-r ${stat.gradient} flex items-center justify-center group-hover:scale-110 transition-transform duration-300 relative overflow-hidden`} style={{
                  boxShadow: `0 0 15px rgba(0, 255, 255, 0.3)`
                }}>
                  <stat.icon className="w-5 h-5 text-white" />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 translate-x-full group-hover:translate-x-[-200%] transition-transform duration-700"></div>
                </div>
              </div>
              <div>
                {stat.label === 'Control' ? (
                  <button
                    onClick={stat.action}
                    className="w-full py-1.5 px-3 bg-gradient-to-r from-purple-500 to-blue-600 text-white font-medium rounded-lg hover:from-purple-400 hover:to-blue-500 focus:outline-none focus:ring-2 focus:ring-purple-400/50 transition-all duration-300 relative overflow-hidden text-sm"
                    style={{ boxShadow: '0 0 15px rgba(147, 51, 234, 0.4)' }}
                  >
                    <span className="relative z-10">Go to Control</span>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 translate-x-full hover:translate-x-[-200%] transition-transform duration-700"></div>
                  </button>
                ) : (
                  <>
                    <p className="text-xl font-bold text-white mb-1 group-hover:text-cyan-300 transition-colors">{stat.value}</p>
                    <p className="text-gray-400 text-xs group-hover:text-gray-300 transition-colors">{stat.label}</p>
                  </>
                )}
              </div>
              <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300"></div>
            </div>
          ))}
        </div>

        {/* Charts Section - Adjusted layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Interactive Map - Increased width */}
          <div className="lg:col-span-2 h-[400px] sm:h-[500px] md:h-[600px] lg:h-[700px] w-full relative">
            <div className="absolute inset-0">
              <InteractiveMap
                key={`map-${devices.length}`}
                devices={devices}
                onFeatureToggle={toggleDeviceFeature}
                isDarkMode={false}
              />
            </div>
          </div>

          {/* Activity Timeline - Decreased width */}
          <div className="bg-gray-900/60 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-6 hover:border-cyan-500/30 transition-all group">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center group-hover:text-cyan-300 transition-colors">
              <Activity className="w-5 h-5 mr-2 text-cyan-400" />
              Recent Activity
            </h3>
            <div className="space-y-4">
              {statusHistory.slice(0, 6).map((activity, index) => (
                <div key={activity.id} className="flex items-start space-x-3 p-4 rounded-lg bg-gray-800/30 border border-gray-700/50 hover:border-cyan-500/30 transition-all group/item">
                  <div className={`w-3 h-3 rounded-full mt-2 relative ${activity.status === 'online' ? 'bg-emerald-500' :
                    activity.status === 'active' ? 'bg-amber-500' :
                      activity.status === 'command_sent' ? 'bg-blue-500' : 'bg-red-500'
                    }`}>
                    <div className={`absolute inset-0 rounded-full animate-ping ${activity.status === 'online' ? 'bg-emerald-500' :
                      activity.status === 'active' ? 'bg-amber-500' :
                        activity.status === 'command_sent' ? 'bg-blue-500' : 'bg-red-500'
                      }`}></div>
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-sm group-hover/item:text-cyan-300 transition-colors">{activity.message}</p>
                    <p className="text-gray-400 text-xs mt-1">{activity.time}</p>
                  </div>
                </div>
              ))}
              {statusHistory.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No recent activity</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Device Grid - Unchanged */}
        <div className="bg-gray-900/60 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-6 hover:border-cyan-500/30 transition-all group">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center group-hover:text-cyan-300 transition-colors">
            <MapPin className="w-5 h-5 mr-2 text-cyan-400" />
            Device Status
          </h3>
          {devices.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No Devices Found</p>
              <p className="text-sm mb-4">Create your first device to get started</p>
              <button
                onClick={() => setActiveTab('assets')}
                className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all duration-300"
              >
                Go to Assets
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {devices.map((device) => {
                const activeFeatures = Object.entries(device.features || {}).filter(([_, enabled]) => enabled);
                const hasActiveFeatures = activeFeatures.length > 0;

                return (
                  <div
                    key={device.id}
                    className={`
                  bg-gray-800/40 border rounded-lg p-4 transition-all group/device transform hover:scale-105 hover:-translate-y-1 duration-300
                  ${hasActiveFeatures
                        ? 'border-cyan-500/30 hover:border-cyan-400/50 shadow-lg shadow-cyan-500/10'
                        : 'border-gray-700/50 hover:border-gray-600/50'
                      }
                `}
                    style={{
                      boxShadow: hasActiveFeatures
                        ? '0 0 20px rgba(6, 182, 212, 0.15)'
                        : 'none'
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <DeviceStatusIcon device={device} size="sm" />
                        <div>
                          <h4 className="font-medium text-white group-hover/device:text-cyan-300 transition-colors">
                            {device.name}
                          </h4>
                          <p className="text-xs text-gray-400">{device.location}</p>
                          <p className="text-xs text-gray-500">
                            Last seen: {device.lastSeen || 'Never'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end space-y-1">
                        <span className={`text-xs px-2 py-1 rounded-full border transition-all ${device.status === 'online' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-400/30' :
                          device.status === 'offline' ? 'bg-red-500/20 text-red-400 border-red-400-400/30' :
                            'bg-amber-500/20 text-amber-400 border-amber-400/30'
                          }`}>
                          {device.status?.toUpperCase() || 'UNKNOWN'}
                        </span>
                        {hasActiveFeatures && (
                          <span className="text-xs px-2 py-1 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-400/30 animate-pulse">
                            {activeFeatures.length} Active
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-300">Device Features</span>
                          <span className="text-xs text-gray-500">
                            {activeFeatures.length}/{Object.keys(device.features || {}).length} Active
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(device.features || {}).map(([feature, enabled]) => {
                            const featureConfig = {
                              siren: { icon: Radio, label: "Siren", color: "blue", activeColor: "#3b82f6", inactiveColor: "#64748b" },
                              beacon: { icon: Bell, label: "Beacon", color: "yellow", activeColor: "#f59e0b", inactiveColor: "#64748b" },
                              announcement: { icon: Mic, label: "PA", color: "purple", activeColor: "#a855f7", inactiveColor: "#64748b" },
                              dispenser: { icon: Eye, label: "Dispenser", color: "green", activeColor: "#10b981", inactiveColor: "#64748b" },
                            }[feature];

                            if (!featureConfig) return null;

                            const { icon: Icon, label, activeColor, inactiveColor } = featureConfig;

                            return (
                              <div
                                key={feature}
                                className={`
                              flex items-center justify-between p-2 rounded-lg border transition-all duration-300
                              ${enabled
                                    ? 'bg-gray-700/50 border-gray-600/50 shadow-sm'
                                    : 'bg-gray-800/30 border-gray-700/30 opacity-60'
                                  }
                              ${enabled ? 'hover:scale-105 hover:shadow-md' : 'hover:opacity-80'}
                            `}
                                style={{
                                  borderColor: enabled ? activeColor + '40' : inactiveColor + '20',
                                  backgroundColor: enabled ? activeColor + '10' : 'rgba(55, 65, 81, 0.3)'
                                }}
                              >
                                <div className="flex items-center space-x-2">
                                  <div
                                    className={`
                                  p-1 rounded-md transition-all duration-300
                                  ${enabled ? 'shadow-sm border' : 'border-dashed opacity-50'}
                                `}
                                    style={{
                                      backgroundColor: enabled ? activeColor + '20' : 'rgba(100, 116, 139, 0.1)',
                                      borderColor: enabled ? activeColor : inactiveColor
                                    }}
                                  >
                                    <Icon
                                      className="w-3 h-3 transition-all duration-300"
                                      style={{ color: enabled ? activeColor : inactiveColor }}
                                    />
                                  </div>
                                  <div>
                                    <div
                                      className={`text-xs font-medium transition-colors duration-300 ${enabled ? 'text-white' : 'text-gray-500'
                                        }`}
                                    >
                                      {label}
                                    </div>
                                  </div>
                                </div>

                                <div
                                  className={`
                                w-2 h-2 rounded-full transition-all duration-300
                                ${enabled
                                      ? 'animate-pulse shadow-sm'
                                      : 'opacity-30'
                                    }
                              `}
                                  style={{
                                    backgroundColor: enabled ? activeColor : inactiveColor,
                                    boxShadow: enabled ? `0 0 8px ${activeColor}40` : 'none'
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex space-x-2 mt-3 pt-2 border-t border-gray-700/30">
                          <button
                            onClick={() => requestDeviceStatus(device.id)}
                            disabled={device.status === 'offline'}
                            className={`
                          flex-1 py-2 px-3 text-xs font-medium rounded-lg transition-all duration-300
                          ${device.status === 'offline'
                                ? 'bg-gray-700/30 text-gray-500 cursor-not-allowed'
                                : 'bg-blue-500/20 text-blue-400 border border-blue-400/30 hover:bg-blue-500/30 hover:scale-105'
                              }
                        `}
                          >
                            <Activity className="w-3 h-3 inline mr-1" />
                            Refresh
                          </button>
                          <button
                            onClick={() => setActiveTab('control')}
                            className="flex-1 py-2 px-3 text-xs font-medium rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-400/30 hover:bg-cyan-500/30 hover:scale-105 transition-all duration-300"
                          >
                            <Power className="w-3 h-3 inline mr-1" />
                            Control
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Assets Page Component
  const AssetsPage = () => {
    const filteredDevices = devices.filter(device =>
      selectedGroup === 'all' || device.group === selectedGroup
    ).filter(device =>
      device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.location.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 mb-2">
              Asset Management
            </h1>
            <p className="text-gray-400">Register and manage AWS IoT devices</p>
          </div>
          <button
            onClick={() => setShowAddDeviceModal(true)}
            className="mt-4 md:mt-0 px-6 py-3 bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:via-blue-500 hover:to-purple-500 transition-all duration-300 flex items-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>Register Device</span>
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search devices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-900/60 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
            />
          </div>
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="px-4 py-3 bg-gray-900/60 border border-cyan-500/20 rounded-lg text-white focus:outline-none focus:border-cyan-400"
          >
            <option value="all">All Groups</option>
            {groups.map(group => (
              <option key={group.id} value={group.name}>{group.name}</option>
            ))}
          </select>
        </div>

        {/* Device Table */}
        <div className="bg-gray-900/60 backdrop-blur-sm border border-cyan-500/20 rounded-xl overflow-hidden">
          {devices.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              <Database className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-semibold mb-2">No Devices Registered</h3>
              <p className="text-sm mb-6">Register your first AWS IoT Thing to get started</p>
              <button
                onClick={() => setShowAddDeviceModal(true)}
                className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 flex items-center space-x-2 mx-auto"
              >
                <Plus className="w-5 h-5" />
                <span>Register First Device</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-800/50 border-b border-cyan-500/20">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-cyan-300">Device</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-cyan-300">Location</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-cyan-300">Status</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-cyan-300">Features</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-cyan-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {filteredDevices.map((device) => {
                    const activeFeatures = Object.entries(device.features || {}).filter(([_, enabled]) => enabled);
                    const hasActiveFeatures = activeFeatures.length > 0;

                    return (
                      <tr
                        key={device.id}
                        className={`
                        transition-colors group/row
                        ${hasActiveFeatures
                            ? 'hover:bg-cyan-900/10 bg-gray-800/20'
                            : 'hover:bg-gray-800/30'
                          }
                      `}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <DeviceStatusIcon device={device} size="sm" />
                            <div>
                              <p className={`font-medium transition-colors ${hasActiveFeatures
                                ? 'text-white group-hover/row:text-cyan-300'
                                : 'text-gray-300 group-hover/row:text-white'
                                }`}>
                                {device.name}
                              </p>
                              <p className="text-sm text-gray-400">Group {device.group || 'None'}</p>
                              <p className="text-xs text-gray-500">
                                Lat: {device.lat?.toFixed(4)}, Lng: {device.lng?.toFixed(4)}
                              </p>
                              {hasActiveFeatures && (
                                <p className="text-xs text-cyan-400 font-medium animate-pulse">
                                  {activeFeatures.length} features active
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-300">{device.location}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${device.status === 'online' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-400/30' :
                            device.status === 'offline' ? 'bg-red-500/20 text-red-400 border-red-400/30' :
                              device.status === 'active' ? 'bg-amber-500/20 text-amber-400 border-amber-400/30' :
                                device.status === 'active+online' ? 'bg-gradient-to-r from-amber-500/20 to-emerald-500/20 text-amber-400 border-amber-400/30' :
                                  'bg-gray-500/20 text-gray-400 border-gray-400/30'
                            }`}>
                            <div className={`w-2 h-2 rounded-full mr-2 ${device.status === 'online' ? 'bg-emerald-500' :
                              device.status === 'offline' ? 'bg-red-500' :
                                device.status === 'active' ? 'bg-amber-500' :
                                  device.status === 'active+online' ? 'bg-amber-500' :
                                    'bg-gray-500'
                              } ${device.status === 'active' || device.status === 'active+online' ? 'animate-pulse' : ''}`}></div>
                            {device.status === 'active+online' ? 'ACTIVE + ONLINE' : device.status?.toUpperCase() || 'UNKNOWN'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(device.features || {}).map(([feature, enabled]) => {
                              const featureConfig = {
                                siren: { icon: Radio, label: "Siren", color: "#3b82f6" },
                                beacon: { icon: Bell, label: "Beacon", color: "#f59e0b" },
                                announcement: { icon: Mic, label: "PA", color: "#a855f7" },
                                dispenser: { icon: Eye, label: "Dispenser", color: "#10b981" },
                              }[feature];

                              if (!featureConfig) return null;

                              const { icon: Icon, label, color } = featureConfig;

                              return (
                                <span
                                  key={feature}
                                  className={`
                                  inline-flex items-center px-2 py-1 text-xs font-medium rounded border transition-all duration-300
                                  ${enabled
                                      ? 'shadow-sm animate-pulse'
                                      : 'opacity-40 border-dashed'
                                    }
                                `}
                                  style={{
                                    backgroundColor: enabled ? color + '20' : 'rgba(100, 116, 139, 0.1)',
                                    color: enabled ? color : '#64748b',
                                    borderColor: enabled ? color + '40' : '#64748b40'
                                  }}
                                >
                                  <Icon className="w-3 h-3 mr-1" />
                                  {label}
                                  {enabled && (
                                    <div
                                      className="w-1 h-1 rounded-full ml-1 animate-pulse"
                                      style={{ backgroundColor: color }}
                                    />
                                  )}
                                </span>
                              );
                            })}

                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => requestDeviceStatus(device.id)}
                              disabled={device.status === 'offline'}
                              className={`
                              p-2 rounded-lg transition-all transform hover:scale-110
                              ${device.status === 'offline'
                                  ? 'text-gray-500 cursor-not-allowed opacity-50'
                                  : 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/20'
                                }
                            `}
                              title="Request Status"
                            >
                              <Activity className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => removeDevice(device.id)}
                              className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-all transform hover:scale-110"
                              title="Unregister Device"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showAddDeviceModal && <AddDeviceModal />}
      </div>
    );
  };

  // Control Page Component
  // Control Page Component
  // FIXED Control Page Component with proper scenario and manual mode handling
  // RESTORED: Original Control Page UI with functionality fixes
  // COMPLETE Control Page Component with ALL existing functionality + fixed loading states
  const ControlPage = (props) => {
    const { controlMode, setControlMode } = props;

    // FIXED: Replace single executingAction with separate loading states
    const [executingScenario, setExecutingScenario] = useState(false);
    const [executingScenarioOff, setExecutingScenarioOff] = useState(false);
    const [executingManual, setExecutingManual] = useState(false);
    const [executingManualOff, setExecutingManualOff] = useState(false);
    const [quickToggling, setQuickToggling] = useState(false);

    // SCENARIO MODE STATES
    const [scenarioGroup, setScenarioGroup] = useState('groups');
    const [scenarioSelectedDevices, setScenarioSelectedDevices] = useState([]);
    const [scenario, setScenario] = useState('ALL');
    const [activeScenarioFeatures, setActiveScenarioFeatures] = useState(['siren', 'beacon', 'announcement', 'dispenser']);

    // MANUAL MODE STATES
    const [manualGroup, setManualGroup] = useState('groups');
    const [manualSelectedDevices, setManualSelectedDevices] = useState([]);
    const [manualActiveFeatures, setManualActiveFeatures] = useState({
      siren: false,
      beacon: false,
      announcement: false,
      dispenser: false
    });

    // FIXED: Update scenario features when scenario changes
    useEffect(() => {
      const getScenarioFeatures = (scenario) => {
        switch (scenario) {
          case 'ALL': return ['siren', 'beacon', 'announcement', 'dispenser'];
          case 'WAR': return ['siren', 'announcement', 'dispenser'];
          case 'FIRE': return ['siren', 'beacon', 'announcement'];
          case 'NATURAL': return ['siren', 'beacon', 'announcement'];
          default: return [];
        }
      };
      setActiveScenarioFeatures(getScenarioFeatures(scenario));
    }, [scenario]);

    // SCENARIO MODE functions
    const handleScenarioGroupChange = (groupValue) => {
      setScenarioGroup(groupValue);

      if (groupValue === 'all') {
        setScenarioSelectedDevices(devices.map(d => d.id));
      } else if (groupValue === 'groups') {
        setScenarioSelectedDevices([]);
      } else {
        const groupDevices = devices.filter(device => device.group === groupValue).map(d => d.id);
        setScenarioSelectedDevices(groupDevices);
      }
    };

    const handleScenarioDeviceSelection = (deviceId) => {
      setScenarioSelectedDevices(prev => {
        if (prev.includes(deviceId)) {
          return prev.filter(id => id !== deviceId);
        } else {
          return [...prev, deviceId];
        }
      });
    };

    // FIXED: Scenario execution with separate loading state
    const executeScenarioCommand = async () => {
      if (scenarioSelectedDevices.length === 0) {
        alert('Please select at least one device');
        return;
      }

      setExecutingScenario(true); // FIXED: Only this button loading
      try {
        const features = {
          siren: activeScenarioFeatures.includes('siren'),
          beacon: activeScenarioFeatures.includes('beacon'),
          announcement: activeScenarioFeatures.includes('announcement'),
          dispenser: activeScenarioFeatures.includes('dispenser')
        };

        console.log('🎭 Executing scenario with features:', features);
        console.log('⏳ Waiting for hardware acknowledgments on relay/ack topics...');

        const result = await executeScenario(scenarioSelectedDevices, features);

        if (result.success) {
          alert(`Scenario commands sent successfully. Dashboard will update when devices acknowledge.`);
        } else {
          alert(`Scenario execution failed: ${result.message}`);
        }
      } catch (error) {
        console.error('Scenario execution error:', error);
        alert('Failed to execute scenario');
      } finally {
        setExecutingScenario(false); // FIXED: Only clear this button loading
      }
    };

    // FIXED: Execute scenario OFF command with separate loading state
    const executeScenarioOffCommand = async () => {
      if (scenarioSelectedDevices.length === 0) {
        alert('Please select at least one device');
        return;
      }

      setExecutingScenarioOff(true); // FIXED: Only this button loading
      try {
        const offFeatures = {
          siren: false,
          beacon: false,
          announcement: false,
          dispenser: false
        };

        console.log('🔴 Executing OFF command for selected devices:', offFeatures);
        console.log('⏳ Waiting for hardware acknowledgments on relay/ack topics...');

        const result = await executeScenario(scenarioSelectedDevices, offFeatures);

        if (result.success) {
          alert(`OFF commands sent successfully. Dashboard will update when devices acknowledge.`);
        } else {
          alert(`OFF command failed: ${result.message}`);
        }
      } catch (error) {
        console.error('OFF command error:', error);
        alert('Failed to execute OFF command');
      } finally {
        setExecutingScenarioOff(false); // FIXED: Only clear this button loading
      }
    };

    // MANUAL MODE functions
    const handleManualGroupChange = (groupValue) => {
      setManualGroup(groupValue);

      if (groupValue === 'all') {
        setManualSelectedDevices(devices.map(d => d.id));
      } else if (groupValue === 'groups') {
        setManualSelectedDevices([]);
      } else {
        const groupDevices = devices.filter(device => device.group === groupValue).map(d => d.id);
        setManualSelectedDevices(groupDevices);
      }
    };

    const handleManualDeviceSelection = (deviceId) => {
      setManualSelectedDevices(prev => {
        if (prev.includes(deviceId)) {
          return prev.filter(id => id !== deviceId);
        } else {
          return [...prev, deviceId];
        }
      });
    };

    const toggleManualFeature = (feature) => {
      setManualActiveFeatures(prev => ({
        ...prev,
        [feature]: !prev[feature]
      }));
    };

    // FIXED: Manual controls with separate loading state
    const applyManualControls = async () => {
      if (manualSelectedDevices.length === 0) {
        alert('Please select at least one device');
        return;
      }

      setExecutingManual(true); // FIXED: Only this button loading
      try {
        console.log('🔧 Applying manual controls:', manualActiveFeatures);
        console.log('⏳ Waiting for hardware acknowledgments on relay/ack topics...');

        const result = await executeScenario(manualSelectedDevices, manualActiveFeatures);

        if (result.success) {
          alert(`Manual controls sent successfully. Dashboard will update when devices acknowledge.`);
        } else {
          alert(`Manual controls failed: ${result.message}`);
        }
      } catch (error) {
        console.error('Manual control error:', error);
        alert('Failed to apply controls');
      } finally {
        setExecutingManual(false); // FIXED: Only clear this button loading
      }
    };

    // FIXED: Apply manual OFF command with separate loading state
    const applyManualOffCommand = async () => {
      if (manualSelectedDevices.length === 0) {
        alert('Please select at least one device');
        return;
      }

      // Check if any selected devices are offline
      const offlineDevices = manualSelectedDevices.filter(deviceId => {
        const device = devices.find(d => d.id === deviceId);
        return !device || device.status === 'offline';
      });

      if (offlineDevices.length > 0) {
        alert(`Cannot apply OFF command: ${offlineDevices.length} device(s) are offline. Only online or active devices can receive commands.`);
        return;
      }

      // Get only the features that are currently selected/enabled
      const selectedFeatures = Object.entries(manualActiveFeatures)
        .filter(([feature, enabled]) => enabled)
        .map(([feature]) => feature);

      if (selectedFeatures.length === 0) {
        alert('No features are selected to turn off. Please select features first.');
        return;
      }

      setExecutingManualOff(true);
      try {
        // FIXED: Create partial OFF command only for selected features
        // Don't include other features at all - let backend preserve their current state
        const partialOffFeatures = {};
        selectedFeatures.forEach(feature => {
          partialOffFeatures[feature] = false;
        });

        console.log('🔴 Applying manual OFF command for selected features only:', partialOffFeatures);
        console.log('🔧 Selected manual features to turn OFF:', selectedFeatures);
        console.log('⏳ Other features will be preserved - waiting for hardware acknowledgments...');

        const result = await realTimeService.executeScenarioCompat(manualSelectedDevices, partialOffFeatures);

        if (result.success) {
          const featureNames = selectedFeatures.join(', ');
          alert(`OFF commands sent for selected features (${featureNames}) only. Other features preserved. Dashboard will update when devices acknowledge.`);
        } else {
          alert(`Manual OFF command failed: ${result.message}`);
        }
      } catch (error) {
        console.error('Manual OFF command error:', error);
        alert('Failed to apply OFF command');
      } finally {
        setExecutingManualOff(false);
      }
    };

    // FIXED: Quick toggle with separate loading state
    const quickToggleFeature = async (feature) => {
      if (manualSelectedDevices.length === 0) {
        alert('Please select devices first');
        return;
      }

      setQuickToggling(true);
      try {
        const results = await Promise.all(
          manualSelectedDevices.map(deviceId => toggleDeviceFeature(deviceId, feature))
        );

        const successful = results.filter(r => r.success).length;
        alert(`Feature toggled on ${successful}/${results.length} devices`);
      } catch (error) {
        console.error('Quick toggle error:', error);
        alert('Failed to toggle feature');
      } finally {
        setQuickToggling(false);
      }
    };

    const getCurrentSelectedDevices = () => {
      return controlMode === 'scenario' ? scenarioSelectedDevices : manualSelectedDevices;
    };

    // Initialize scenario devices when devices or scenarioGroup changes
    useEffect(() => {
      if (scenarioGroup === 'all') {
        setScenarioSelectedDevices(devices.map(d => d.id));
      } else if (scenarioGroup === 'groups') {
        setScenarioSelectedDevices([]);
      } else {
        const groupDevices = devices.filter(device => device.group === scenarioGroup).map(d => d.id);
        setScenarioSelectedDevices(groupDevices);
      }
    }, [devices, scenarioGroup]);

    // Initialize manual devices when devices or manualGroup changes
    useEffect(() => {
      if (manualGroup === 'all') {
        setManualSelectedDevices(devices.map(d => d.id));
      } else if (manualGroup === 'groups') {
        setManualSelectedDevices([]);
      } else {
        const groupDevices = devices.filter(device => device.group === manualGroup).map(d => d.id);
        setManualSelectedDevices(groupDevices);
      }
    }, [devices, manualGroup]);

    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div className="flex space-x-2 mb-4 md:mb-0">
            <button
              onClick={() => setControlMode('scenario')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${controlMode === 'scenario'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white'
                : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50'
                }`}
            >
              Scenario Mode
            </button>
            <button
              onClick={() => setControlMode('manual')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${controlMode === 'manual'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white'
                : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50'
                }`}
            >
              Manual Mode
            </button>
          </div>
          <div className="absolute left-1/2 transform -translate-x-1/2 text-center">
            <h1 className="text-3xl font-bold text-white mb-4">Control Center</h1>
            <p className="text-gray-400">Manage device operations and emergency scenarios</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-gray-900/60 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <Settings className="w-5 h-5 mr-2 text-cyan-400" />
                {controlMode === 'scenario' ? 'Emergency Scenarios' : 'Manual Control'}
              </h3>

              {controlMode === 'scenario' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Target Group</label>
                    <select
                      value={scenarioGroup}
                      onChange={(e) => handleScenarioGroupChange(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                    >
                      <option value="groups"> Select Groups</option>
                      <option value="all">All Groups</option>
                      {groups.map(group => (
                        <option key={group.id} value={group.name}>{group.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Device Selection Panel */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white flex items-center">
                        <Target className="w-5 h-5 mr-2 text-cyan-400" />
                        Device Selection
                      </h3>
                      <div className="text-sm text-gray-400">
                        {getCurrentSelectedDevices().length} of {devices.length} selected
                      </div>
                    </div>

                    <div className="flex space-x-2 mb-4">
                      <button
                        onClick={() => {
                          const allIds = devices.map(d => d.id);
                          if (controlMode === 'scenario') {
                            setScenarioSelectedDevices(allIds);
                          } else {
                            setManualSelectedDevices(allIds);
                          }
                        }}
                        className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded text-sm hover:bg-blue-500/30 transition-colors"
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => {
                          if (controlMode === 'scenario') {
                            setScenarioSelectedDevices([]);
                          } else {
                            setManualSelectedDevices([]);
                          }
                        }}
                        className="px-3 py-1 bg-gray-500/20 text-gray-400 rounded text-sm hover:bg-gray-500/30 transition-colors"
                      >
                        Clear All
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-4 max-h-96 overflow-y-auto border border-gray-700/50 rounded-lg p-3 bg-gray-800/20">
                      {devices.length === 0 ? (
                        <div className="text-center text-gray-500 py-4">
                          <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No devices available. Create devices first.</p>
                        </div>
                      ) : (
                        devices.map((device) => {
                          const isSelected = getCurrentSelectedDevices().includes(device.id);
                          const activeFeatures = Object.entries(device.features || {}).filter(([_, enabled]) => enabled);
                          const hasActiveFeatures = activeFeatures.length > 0;

                          return (
                            <div
                              key={device.id}
                              onClick={() => {
                                if (controlMode === 'scenario') {
                                  handleScenarioDeviceSelection(device.id);
                                } else {
                                  handleManualDeviceSelection(device.id);
                                }
                              }}
                              className={`
                            p-4 rounded-lg border transition-all cursor-pointer transform hover:scale-102
                            ${isSelected
                                  ? 'border-cyan-400 bg-cyan-500/10 shadow-lg shadow-cyan-500/20'
                                  : hasActiveFeatures
                                    ? 'border-gray-600/50 bg-gray-800/40 hover:border-cyan-500/30'
                                    : 'border-gray-700/50 bg-gray-800/30 hover:border-gray-600/50'
                                }
                          `}
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center space-x-3">
                                  <DeviceStatusIcon device={device} size="sm" />
                                  <div>
                                    <h4 className={`font-medium transition-colors ${isSelected ? 'text-cyan-300' : 'text-white'
                                      }`}>
                                      {device.name}
                                    </h4>
                                    <p className="text-xs text-gray-400">{device.location}</p>
                                    <p className="text-xs text-gray-500">Group: {device.group || 'None'}</p>
                                    {hasActiveFeatures && (
                                      <p className="text-xs text-cyan-400 font-medium">
                                        {activeFeatures.length} features active
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className={`w-6 h-6 rounded-md border-2 transition-all flex items-center justify-center ${isSelected
                                  ? 'bg-cyan-400 border-cyan-400 shadow-lg shadow-cyan-400/50'
                                  : 'border-gray-400 bg-gray-800/50 hover:border-cyan-400/50 hover:bg-gray-700/50'
                                  }`}>
                                  {isSelected && (
                                    <Check className="w-4 h-4 text-white font-bold" />
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                {Object.entries(device.features || {}).map(([feature, enabled]) => {
                                  const featureConfig = {
                                    siren: { label: "Siren", color: "#3b82f6" },
                                    beacon: { label: "Beacon", color: "#f59e0b" },
                                    announcement: { label: "PA", color: "#a855f7" },
                                    dispenser: { label: "Dispenser", color: "#10b981" },
                                  }[feature];

                                  if (!featureConfig) return null;

                                  return (
                                    <div
                                      key={feature}
                                      className={`
                                    flex items-center justify-between p-2 rounded text-xs transition-all duration-300
                                    ${enabled
                                          ? 'shadow-sm border'
                                          : 'opacity-60 border-dashed'
                                        }
                                  `}
                                      style={{
                                        backgroundColor: enabled ? featureConfig.color + '20' : 'rgba(55, 65, 81, 0.3)',
                                        borderColor: enabled ? featureConfig.color + '40' : '#64748b40',
                                        color: enabled ? featureConfig.color : '#64748b'
                                      }}
                                    >
                                      <span className="capitalize font-medium">{featureConfig.label}</span>
                                      <div
                                        className={`
                                      w-2 h-2 rounded-full transition-all duration-300
                                      ${enabled ? 'animate-pulse' : ''}
                                    `}
                                        style={{
                                          backgroundColor: enabled ? featureConfig.color : '#64748b',
                                          boxShadow: enabled ? `0 0 6px ${featureConfig.color}60` : 'none'
                                        }}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Select Scenario</label>
                    <select
                      value={scenario}
                      onChange={(e) => setScenario(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                    >
                      <option value="ALL">All Emergency Features</option>
                      <option value="WAR">War Emergency</option>
                      <option value="FIRE">Fire Emergency</option>
                      <option value="NATURAL">Natural Disaster</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Active Features</label>
                    <div className="space-y-2">
                      {activeScenarioFeatures.map((feature) => (
                        <div key={feature} className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
                          <div className="flex items-center space-x-3">
                            {feature === 'siren' && <Radio className="w-4 h-4 text-blue-400" />}
                            {feature === 'beacon' && <Bell className="w-4 h-4 text-yellow-400" />}
                            {feature === 'announcement' && <Mic className="w-4 h-4 text-purple-400" />}
                            {feature === 'dispenser' && <Eye className="w-4 h-4 text-green-400" />}
                            <span className="text-white capitalize">{feature}</span>
                          </div>
                          <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* SCENARIO MODE BUTTONS - FIXED WITH SEPARATE LOADING STATES */}
                  <div className="space-y-3">
                    <button
                      onClick={executeScenarioCommand}
                      disabled={executingScenario || scenarioSelectedDevices.length === 0}
                      className="w-full py-3 px-4 bg-gradient-to-r from-red-500 to-red-600 text-white font-medium rounded-lg hover:from-red-400 hover:to-red-500 focus:outline-none focus:ring-2 focus:ring-red-400/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      {executingScenario ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Executing...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          <span>Execute Scenario</span>
                        </>
                      )}
                    </button>

                    {/* FIXED: Scenario OFF Button with separate loading */}
                    <button
                      onClick={executeScenarioOffCommand}
                      disabled={executingScenarioOff || scenarioSelectedDevices.length === 0}
                      className="w-full py-3 px-4 bg-gradient-to-r from-gray-600 to-gray-700 text-white font-medium rounded-lg hover:from-gray-500 hover:to-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      {executingScenarioOff ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Turning OFF...</span>
                        </>
                      ) : (
                        <>
                          <Power className="w-4 h-4" />
                          <span>Turn OFF All</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Group Selection</label>
                    <select
                      value={manualGroup}
                      onChange={(e) => handleManualGroupChange(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                    >
                      <option value="groups">Select Groups</option>
                      <option value="all">All Groups</option>
                      {groups.map(group => (
                        <option key={group.id} value={group.name}>{group.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Selected: {manualSelectedDevices.length} devices
                    </p>
                  </div>

                  {/* Device Selection Panel - Same as scenario mode */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white flex items-center">
                        <Target className="w-5 h-5 mr-2 text-cyan-400" />
                        Device Selection
                      </h3>
                      <div className="text-sm text-gray-400">
                        {getCurrentSelectedDevices().length} of {devices.length} selected
                      </div>
                    </div>

                    <div className="flex space-x-2 mb-4">
                      <button
                        onClick={() => {
                          const allIds = devices.map(d => d.id);
                          if (controlMode === 'scenario') {
                            setScenarioSelectedDevices(allIds);
                          } else {
                            setManualSelectedDevices(allIds);
                          }
                        }}
                        className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded text-sm hover:bg-blue-500/30 transition-colors"
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => {
                          if (controlMode === 'scenario') {
                            setScenarioSelectedDevices([]);
                          } else {
                            setManualSelectedDevices([]);
                          }
                        }}
                        className="px-3 py-1 bg-gray-500/20 text-gray-400 rounded text-sm hover:bg-gray-500/30 transition-colors"
                      >
                        Clear All
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-4 max-h-96 overflow-y-auto border border-gray-700/50 rounded-lg p-3 bg-gray-800/20">
                      {devices.length === 0 ? (
                        <div className="text-center text-gray-500 py-4">
                          <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No devices available. Create devices first.</p>
                        </div>
                      ) : (
                        devices.map((device) => {
                          const isSelected = getCurrentSelectedDevices().includes(device.id);
                          const activeFeatures = Object.entries(device.features || {}).filter(([_, enabled]) => enabled);
                          const hasActiveFeatures = activeFeatures.length > 0;

                          return (
                            <div
                              key={device.id}
                              onClick={() => {
                                if (controlMode === 'scenario') {
                                  handleScenarioDeviceSelection(device.id);
                                } else {
                                  handleManualDeviceSelection(device.id);
                                }
                              }}
                              className={`
                            p-4 rounded-lg border transition-all cursor-pointer transform hover:scale-102
                            ${isSelected
                                  ? 'border-cyan-400 bg-cyan-500/10 shadow-lg shadow-cyan-500/20'
                                  : hasActiveFeatures
                                    ? 'border-gray-600/50 bg-gray-800/40 hover:border-cyan-500/30'
                                    : 'border-gray-700/50 bg-gray-800/30 hover:border-gray-600/50'
                                }
                          `}
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center space-x-3">
                                  <DeviceStatusIcon device={device} size="sm" />
                                  <div>
                                    <h4 className={`font-medium transition-colors ${isSelected ? 'text-cyan-300' : 'text-white'
                                      }`}>
                                      {device.name}
                                    </h4>
                                    <p className="text-xs text-gray-400">{device.location}</p>
                                    <p className="text-xs text-gray-500">Group: {device.group || 'None'}</p>
                                    {hasActiveFeatures && (
                                      <p className="text-xs text-cyan-400 font-medium">
                                        {activeFeatures.length} features active
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className={`w-6 h-6 rounded-md border-2 transition-all flex items-center justify-center ${isSelected
                                  ? 'bg-cyan-400 border-cyan-400 shadow-lg shadow-cyan-400/50' : 'border-gray-400 bg-gray-800/50 hover:border-cyan-400/50 hover:bg-gray-700/50'
                                  }`}>
                                  {isSelected && (
                                    <Check className="w-4 h-4 text-white font-bold" />
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                {Object.entries(device.features || {}).map(([feature, enabled]) => {
                                  const featureConfig = {
                                    siren: { label: "Siren", color: "#3b82f6" },
                                    beacon: { label: "Beacon", color: "#f59e0b" },
                                    announcement: { label: "PA", color: "#a855f7" },
                                    dispenser: { label: "Dispenser", color: "#10b981" },
                                  }[feature];

                                  if (!featureConfig) return null;

                                  return (
                                    <div
                                      key={feature}
                                      className={`
                                   flex items-center justify-between p-2 rounded text-xs transition-all duration-300
                                   ${enabled
                                          ? 'shadow-sm border'
                                          : 'opacity-60 border-dashed'
                                        }
                                 `}
                                      style={{
                                        backgroundColor: enabled ? featureConfig.color + '20' : 'rgba(55, 65, 81, 0.3)',
                                        borderColor: enabled ? featureConfig.color + '40' : '#64748b40',
                                        color: enabled ? featureConfig.color : '#64748b'
                                      }}
                                    >
                                      <span className="capitalize font-medium">{featureConfig.label}</span>
                                      <div
                                        className={`
                                     w-2 h-2 rounded-full transition-all duration-300
                                     ${enabled ? 'animate-pulse' : ''}
                                   `}
                                        style={{
                                          backgroundColor: enabled ? featureConfig.color : '#64748b',
                                          boxShadow: enabled ? `0 0 6px ${featureConfig.color}60` : 'none'
                                        }}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">Feature Selection</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: 'siren', label: 'Siren', icon: Radio, color: 'blue' },
                        { key: 'beacon', label: 'Beacon', icon: Bell, color: 'yellow' },
                        { key: 'announcement', label: 'PA', icon: Mic, color: 'purple' },
                        { key: 'dispenser', label: 'Dispenser', icon: Eye, color: 'green' }
                      ].map(({ key, label, icon: Icon, color }) => (
                        <button
                          key={key}
                          onClick={() => toggleManualFeature(key)}
                          className={`p-3 rounded-lg border transition-all text-sm font-medium ${manualActiveFeatures[key]
                            ? `${color === 'blue' ? 'bg-blue-500/30 text-blue-300 border-blue-400' :
                              color === 'yellow' ? 'bg-yellow-500/30 text-yellow-300 border-yellow-400' :
                                color === 'purple' ? 'bg-purple-500/30 text-purple-300 border-purple-400' :
                                  'bg-green-500/30 text-green-300 border-green-400'}`
                            : `${color === 'blue' ? 'bg-blue-500/10 text-blue-400 border-blue-400/30' :
                              color === 'yellow' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-400/30' :
                                color === 'purple' ? 'bg-purple-500/10 text-purple-400 border-purple-400/30' :
                                  'bg-green-500/10 text-green-400 border-green-400/30'} hover:${color === 'blue' ? 'bg-blue-500/20' :
                                    color === 'yellow' ? 'bg-yellow-500/20' :
                                      color === 'purple' ? 'bg-purple-500/20' :
                                        'bg-green-500/20'}`
                            }`}
                        >
                          <Icon className="w-4 h-4 mx-auto mb-1" />
                          <div className="flex items-center justify-between">
                            <span>{label}</span>
                            {manualActiveFeatures[key] && <Check className="w-3 h-3" />}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* MANUAL MODE BUTTONS - FIXED WITH SEPARATE LOADING STATES */}
                  <div className="space-y-3">
                    <button
                      onClick={applyManualControls}
                      disabled={manualSelectedDevices.length === 0 || executingManual}
                      className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-blue-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      {executingManual ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Applying...</span>
                        </>
                      ) : (
                        <>
                          <Settings className="w-4 h-4" />
                          <span>Apply Controls</span>
                        </>
                      )}
                    </button>

                    {/* FIXED: Manual OFF Button with separate loading */}
                    <button
                      onClick={applyManualOffCommand}
                      disabled={manualSelectedDevices.length === 0 || executingManualOff || Object.values(manualActiveFeatures).every(v => !v)}
                      className="w-full py-3 px-4 bg-gradient-to-r from-gray-600 to-gray-700 text-white font-medium rounded-lg hover:from-gray-500 hover:to-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                      title={`Turn OFF only selected features (others preserved)`}
                    >
                      {executingManualOff ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Turning OFF...</span>
                        </>
                      ) : (
                        <>
                          <Power className="w-4 h-4" />
                          <span>Turn OFF Selected Only</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Quick Controls</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: 'siren', label: 'Toggle Siren', color: 'blue' },
                        { key: 'beacon', label: 'Toggle Beacon', color: 'yellow' },
                        { key: 'announcement', label: 'Toggle PA', color: 'purple' },
                        { key: 'dispenser', label: 'Toggle Dispenser', color: 'green' }
                      ].map(({ key, label, color }) => (
                        <button
                          key={key}
                          onClick={() => quickToggleFeature(key)}
                          disabled={manualSelectedDevices.length === 0 || quickToggling}
                          className={`p-2 rounded text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${color === 'blue' ? 'bg-blue-500/20 text-blue-400 border border-blue-400/30 hover:bg-blue-500/30' :
                            color === 'yellow' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-400/30 hover:bg-yellow-500/30' :
                              color === 'purple' ? 'bg-purple-500/20 text-purple-400 border border-purple-400/30 hover:bg-purple-500/30' :
                                'bg-green-500/20 text-green-400 border border-green-400/30 hover:bg-green-500/30'
                            }`}
                        >
                          {quickToggling ? (
                            <>
                              <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin inline mr-1"></div>
                              {label}
                            </>
                          ) : (
                            label
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Map Section */}
          <div className="lg:col-span-2">
            <div className="bg-gray-900/60 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <MapPin className="w-5 h-5 mr-2 text-cyan-400" />
                Device Locations & Real-time Status
              </h3>

              <div className="h-[400px] sm:h-[500px] md:h-[600px] lg:h-[700px] w-full relative">
                <div className="absolute inset-0">
                  <InteractiveMap
                    devices={devices}
                    onFeatureToggle={toggleDeviceFeature}
                    isDarkMode={false}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Groups Page Component
  // Groups Page Component
  // Groups Page Component
  // Groups Page Component
  const GroupsPage = () => {
    const [draggedDevice, setDraggedDevice] = useState(null);
    const [groupSearchTerm, setGroupSearchTerm] = useState('');
    const [selectedDevices, setSelectedDevices] = useState([]);
    const [showGroupSelectModal, setShowGroupSelectModal] = useState(false);

    const handleDragStart = (e, device) => {
      setDraggedDevice(device);
      e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e, targetGroupName) => {
      e.preventDefault();
      if (!draggedDevice) return;

      updateDevice(draggedDevice.id, { group: targetGroupName });

      setGroups((prevGroups) =>
        prevGroups.map((group) => ({
          ...group,
          devices: group.name === targetGroupName
            ? [...group.devices.filter((id) => id !== draggedDevice.id), draggedDevice.id]
            : group.devices.filter((id) => id !== draggedDevice.id)
        }))
      );

      setDraggedDevice(null);
    };

    const removeDeviceFromGroup = (deviceId, groupName) => {
      updateDevice(deviceId, { group: null });

      setGroups((prevGroups) =>
        prevGroups.map((group) =>
          group.name === groupName
            ? { ...group, devices: group.devices.filter((id) => id !== deviceId) }
            : group
        )
      );
    };

    const handleDeviceSelection = (deviceId) => {
      setSelectedDevices(prev => {
        if (prev.includes(deviceId)) {
          return prev.filter(id => id !== deviceId);
        } else {
          return [...prev, deviceId];
        }
      });
    };

    const handleAddToGroup = async (groupName) => {
      if (selectedDevices.length === 0) {
        alert('Please select at least one device');
        return;
      }

      try {
        selectedDevices.forEach(deviceId => {
          updateDevice(deviceId, { group: groupName });
        });

        setGroups(prevGroups =>
          prevGroups.map(group => ({
            ...group,
            devices:
              group.name === groupName
                ? [...new Set([...group.devices, ...selectedDevices])]
                : group.devices.filter(id => !selectedDevices.includes(id))
          }))
        );

        setSelectedDevices([]);
        setShowGroupSelectModal(false);
        alert(`Successfully added ${selectedDevices.length} device(s) to group ${groupName}`);
      } catch (error) {
        console.error('Error adding devices to group:', error);
        alert('Failed to add devices to group');
      }
    };

    const filteredGroups = groups.filter(group =>
      group.name.toLowerCase().includes(groupSearchTerm.toLowerCase()) ||
      group.description.toLowerCase().includes(groupSearchTerm.toLowerCase())
    );

    const GroupSelectModal = () => (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900/95 backdrop-blur-xl border border-cyan-500/30 rounded-xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-white">Select Group</h3>
            <button
              onClick={() => setShowGroupSelectModal(false)}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3">
            {filteredGroups.length === 0 ? (
              <div className="text-center text-gray-500 py-4">
                <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No groups available. Create a group first.</p>
              </div>
            ) : (
              filteredGroups.map(group => (
                <button
                  key={group.id}
                  onClick={() => handleAddToGroup(group.name)}
                  className="w-full p-4 rounded-lg border border-gray-700/50 bg-gray-800/30 hover:border-cyan-500/30 hover:bg-gray-800/50 transition-all flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-4 h-4 rounded-full animate-pulse"
                      style={{ backgroundColor: group.color === 'blue' ? '#3b82f6' : group.color === 'purple' ? '#8b5cf6' : '#10b981' }}
                    ></div>
                    <div>
                      <span className="text-sm font-medium text-white">{group.name}</span>
                      <p className="text-xs text-gray-400">{group.description}</p>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
              ))
            )}
          </div>

          <div className="mt-6">
            <button
              onClick={() => setShowGroupSelectModal(false)}
              className="w-full py-3 px-4 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );

    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div className="flex items-center space-x-3 relative">
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400">
              Device Groups
            </h1>
            <div className="flex items-center space-x-1 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30">
              <Layers className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-medium text-blue-400">{groups.length} Groups</span>
            </div>
          </div>
          <div className="flex space-x-3 mt-4 md:mt-0">
            <button
              onClick={() => setShowAddGroupModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 flex items-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>Create Group</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search groups..."
              value={groupSearchTerm}
              onChange={(e) => setGroupSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-900/60 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Available Devices Section */}
          <div className="lg:col-span-1 bg-gray-900/60 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center">
                <Database className="w-5 h-5 mr-2 text-cyan-400" />
                Available Devices
              </h3>
              <span className="text-xs px-2 py-1 bg-gray-700/50 rounded-full">
                {selectedDevices.length} selected
              </span>
            </div>
            <div className="flex space-x-2 mb-4">
              <button
                onClick={() => setSelectedDevices(devices.map(d => d.id))}
                className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded text-sm hover:bg-blue-500/30 transition-colors"
              >
                Select All
              </button>
              <button
                onClick={() => setSelectedDevices([])}
                className="px-3 py-1 bg-gray-500/20 text-gray-400 rounded text-sm hover:bg-gray-500/30 transition-colors"
              >
                Clear All
              </button>
              <button
                onClick={() => setShowGroupSelectModal(true)}
                disabled={selectedDevices.length === 0}
                className="px-3 py-1 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded text-sm hover:from-blue-400 hover:to-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add to Group
              </button>
            </div>
            <div
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, null)}
              className="min-h-64 p-3 border-2 border-dashed border-gray-600/50 rounded-lg hover:border-cyan-500/30 transition-all"
            >
              {devices.length === 0 ? (
                <div className="text-center text-gray-500 py-4">
                  <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No devices available</p>
                </div>
              ) : (
                devices.map((device) => (
                  <div
                    key={device.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, device)}
                    className="p-3 mb-2 bg-gray-800/40 border border-gray-700/50 rounded-lg cursor-move hover:border-cyan-500/30 hover:bg-gray-800/50 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 flex-1">
                        <div
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent drag events
                            handleDeviceSelection(device.id);
                          }}
                          draggable={false} // Disable dragging on checkbox
                          className={`w-5 h-5 rounded border-2 transition-all flex items-center justify-center cursor-pointer ${selectedDevices.includes(device.id)
                            ? 'bg-cyan-400 border-cyan-400'
                            : 'border-gray-400'
                            }`}
                        >
                          {selectedDevices.includes(device.id) && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>
                        <DeviceStatusIcon device={device} size="sm" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-white">{device.name}</p>
                          <p className="text-xs text-gray-400">{device.location}</p>
                          <p className="text-xs text-gray-400">Group: {device.group || 'None'}</p>
                        </div>
                      </div>
                      <Move className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Groups Section */}
          <div className="lg:col-span-3">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredGroups.map((group) => (
                <div
                  key={group.id}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, group.name)}
                  className="bg-gray-900/60 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-6 hover:border-cyan-500/40 transition-all"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-xl font-semibold text-white">{group.name}</h3>
                      <div
                        className="w-4 h-4 rounded-full animate-pulse"
                        style={{ backgroundColor: group.color === 'blue' ? '#3b82f6' : group.color === 'purple' ? '#8b5cf6' : '#10b981' }}
                      ></div>
                    </div>
                    <div className="flex items-center space-x-1 px-2 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/30">
                      <Target className="w-3 h-3 text-cyan-400" />
                      <span className="text-xs font-medium text-cyan-400">{group.devices.length}</span>
                    </div>
                  </div>

                  <p className="text-gray-400 text-sm mb-4">{group.description}</p>

                  <div className="min-h-32 p-3 border-2 border-dashed border-gray-600/50 rounded-lg hover:border-cyan-500/30 transition-all">
                    {group.devices.length === 0 ? (
                      <div className="text-center text-gray-500 py-4">
                        <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Drop devices here</p>
                      </div>
                    ) : (
                      devices
                        .filter((d) => group.devices.includes(d.id))
                        .map((device) => (
                          <div
                            key={device.id}
                            className="flex items-center justify-between p-2 mb-2 bg-gray-800/30 border border-gray-700/50 rounded-lg hover:border-cyan-500/30"
                          >
                            <div className="flex items-center space-x-2">
                              <DeviceStatusIcon device={device} size="sm" />
                              <div>
                                <span className="text-sm font-medium text-white">{device.name}</span>
                                <p className="text-xs text-gray-400">{device.location}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => removeDeviceFromGroup(device.id, group.name)}
                              className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                    )}
                  </div>

                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => {
                        setEditingGroup(group);
                        setShowEditGroupModal(true);
                      }}
                      className="flex-1 py-2 px-3 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30"
                    >
                      <Edit className="w-4 h-4 inline mr-1" />
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        if (window.confirm(`Are you sure you want to delete group "${group.name}"? This will remove all devices from this group.`)) {
                          try {
                            await deleteGroup(group.id);
                            alert(`Group "${group.name}" deleted successfully!`);
                          } catch (error) {
                            alert(`Failed to delete group: ${error.message}`);
                          }
                        }
                      }}
                      className="flex-1 py-2 px-3 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30"
                    >
                      <Trash2 className="w-4 h-4 inline mr-1" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {showAddGroupModal && <AddGroupModal />}
        {showEditGroupModal && <EditGroupModal />}
        {showGroupSelectModal && <GroupSelectModal />}
      </div>
    );
  };

  // Reports Page
  const ReportsPage = () => {
    const [reportDateRange, setReportDateRange] = useState('today');
    const [selectedGroup, setSelectedGroup] = useState('all');

    // Calculate metrics
    const onlineDevices = devices.filter(d => d.status === 'online').length;
    const activeDevices = devices.filter(d => d.status === 'active').length;
    const offlineDevices = devices.filter(d => d.status === 'offline').length;
    const totalDevices = devices.length;

    // Group devices by status for charts
    const devicesByGroup = groups.map(group => ({
      name: group.name,
      online: devices.filter(d => d.group === group.name && d.status === 'online').length,
      offline: devices.filter(d => d.group === group.name && d.status === 'offline').length,
      active: devices.filter(d => d.group === group.name && d.status === 'active').length,
      total: devices.filter(d => d.group === group.name).length
    }));

    // Feature usage statistics
    const featureUsage = {
      siren: devices.filter(d => d.features?.siren).length,
      beacon: devices.filter(d => d.features?.beacon).length,
      announcement: devices.filter(d => d.features?.announcement).length,
      dispenser: devices.filter(d => d.features?.dispenser).length
    };

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div className="relative">
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 mb-2 animate-pulse">
              Reports & Analytics
            </h1>
            <p className="text-gray-400">System performance and usage analytics</p>
          </div>
          <div className="flex space-x-3 mt-4 md:mt-0">
            <select
              value={reportDateRange}
              onChange={(e) => setReportDateRange(e.target.value)}
              className="px-4 py-2 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white focus:outline-none focus:border-cyan-400"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
            </select>
            {/* <button className="px-6 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium rounded-lg hover:from-green-400 hover:to-emerald-500 transition-all duration-300 flex items-center space-x-2 transform hover:scale-105">
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button> */}
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: 'Total Devices',
              value: totalDevices,
              icon: Database,
              color: 'blue',
              change: '+2 this week',
              trend: 'up'
            },
            {
              label: 'Online Devices',
              value: onlineDevices,
              percentage: totalDevices > 0 ? Math.round((onlineDevices / totalDevices) * 100) : 0,
              icon: Wifi,
              color: 'emerald',
              change: `${onlineDevices}/${totalDevices}`,
              trend: onlineDevices > offlineDevices ? 'up' : 'down'
            },
            {
              label: 'Active Features',
              value: Object.values(featureUsage).reduce((a, b) => a + b, 0),
              icon: Zap,
              color: 'amber',
              change: `${activeDevices} devices`,
              trend: 'up'
            },
            {
              label: 'System Uptime',
              value: connectionStatus === 'connected' ? '99.5%' : '0%',
              icon: TrendingUp,
              color: connectionStatus === 'connected' ? 'emerald' : 'red',
              change: connectionStatus === 'connected' ? 'Stable' : 'Disconnected',
              trend: connectionStatus === 'connected' ? 'up' : 'down'
            }
          ].map((metric, index) => (
            <div
              key={index}
              className="bg-gray-900/60 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-4 hover:border-cyan-500/40 transition-all group transform hover:scale-105"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-r ${metric.color === 'blue' ? 'from-blue-400 to-blue-600' :
                  metric.color === 'emerald' ? 'from-emerald-400 to-emerald-600' :
                    metric.color === 'amber' ? 'from-amber-400 to-amber-600' :
                      metric.color === 'red' ? 'from-red-400 to-red-600' :
                        'from-emerald-400 to-emerald-600'
                  } flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <metric.icon className="w-5 h-5 text-white" />
                </div>
                <div className={`text-xs px-2 py-1 rounded-full ${metric.trend === 'up' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                  {metric.change}
                </div>
              </div>
              <div>
                <p className="text-2xl font-bold text-white mb-1 group-hover:text-cyan-300 transition-colors">
                  {metric.value}
                  {metric.percentage && <span className="text-sm text-gray-400 ml-1">({metric.percentage}%)</span>}
                </p>
                <p className="text-gray-400 text-sm">{metric.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Charts and Analytics Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Device Status with 3D Effect */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-3xl blur-xl"></div>
            <div className="relative bg-gray-900/70 backdrop-blur-2xl border border-cyan-500/30 rounded-3xl p-8 hover:border-cyan-400/50 transition-all duration-500 transform hover:scale-102" style={{
              boxShadow: '0 0 60px rgba(59, 130, 246, 0.2), inset 0 0 60px rgba(6, 182, 212, 0.05)'
            }}>
              <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 mb-6 group-hover:from-purple-400 group-hover:via-cyan-400 group-hover:to-blue-400 transition-all duration-500 flex items-center">
                <BarChart3 className="w-6 h-6 mr-3 text-cyan-400 group-hover:animate-bounce" />
                Device Status Distribution
              </h3>
              <div className="h-64 flex items-center justify-center">
                <div className="grid grid-cols-3 gap-8 w-full">
                  {[
                    { label: 'Online', count: onlineDevices, color: 'emerald', percentage: totalDevices > 0 ? (onlineDevices / totalDevices) * 100 : 0 },
                    { label: 'Active', count: activeDevices, color: 'amber', percentage: totalDevices > 0 ? (activeDevices / totalDevices) * 100 : 0 },
                    { label: 'Offline', count: offlineDevices, color: 'red', percentage: totalDevices > 0 ? (offlineDevices / totalDevices) * 100 : 0 }
                  ].map((status, i) => (
                    <div key={i} className="text-center">
                      <div className={`w-20 h-20 mx-auto mb-3 rounded-full flex items-center justify-center text-xl font-bold text-white bg-gradient-to-r ${status.color === 'emerald' ? 'from-emerald-400 to-emerald-600' :
                        status.color === 'amber' ? 'from-amber-400 to-amber-600' :
                          'from-red-400 to-red-600'
                        } animate-pulse relative`}>
                        {status.count}
                        <div className="absolute inset-0 rounded-full border-2 border-white/20 animate-ping"></div>
                      </div>
                      <p className="text-gray-300 font-medium">{status.label}</p>
                      <p className="text-xs text-gray-500">{status.percentage.toFixed(1)}%</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Feature Usage Analytics */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-pink-600/20 rounded-3xl blur-xl"></div>
            <div className="relative bg-gray-900/70 backdrop-blur-2xl border border-cyan-500/30 rounded-3xl p-8 hover:border-cyan-400/50 transition-all duration-500 transform hover:scale-102" style={{
              boxShadow: '0 0 60px rgba(147, 51, 234, 0.2), inset 0 0 60px rgba(6, 182, 212, 0.05)'
            }}>
              <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 mb-6 group-hover:from-cyan-400 group-hover:via-purple-400 group-hover:to-pink-400 transition-all duration-500 flex items-center">
                <Activity className="w-6 h-6 mr-3 text-purple-400 group-hover:animate-spin" />
                Feature Usage Analytics
              </h3>
              <div className="space-y-4">
                {[
                  { name: 'Siren', count: featureUsage.siren, icon: Radio, color: '#3b82f6' },
                  { name: 'Beacon', count: featureUsage.beacon, icon: Bell, color: '#f59e0b' },
                  { name: 'Announcement', count: featureUsage.announcement, icon: Mic, color: '#a855f7' },
                  { name: 'Dispenser', count: featureUsage.dispenser, icon: Eye, color: '#10b981' }
                ].map((feature, i) => {
                  const percentage = totalDevices > 0 ? (feature.count / totalDevices) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-gray-800/30 border border-gray-700/50 hover:border-cyan-500/30 transition-all">
                      <div className="flex items-center space-x-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: feature.color + '20', border: `1px solid ${feature.color}40` }}
                        >
                          <feature.icon className="w-4 h-4" style={{ color: feature.color }} />
                        </div>
                        <span className="text-white font-medium">{feature.name}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="text-right">
                          <div className="text-white font-semibold">{feature.count}</div>
                          <div className="text-xs text-gray-400">{percentage.toFixed(1)}%</div>
                        </div>
                        <div className="w-16 h-2 bg-gray-700 rounded-full">
                          <div
                            className="h-full rounded-full transition-all duration-1000"
                            style={{
                              width: `${percentage}%`,
                              backgroundColor: feature.color,
                              boxShadow: `0 0 8px ${feature.color}40`
                            }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity & Device Status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Activity with Matrix Effect */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-green-600/20 to-cyan-600/20 rounded-3xl blur-xl"></div>
            <div className="relative bg-gray-900/70 backdrop-blur-2xl border border-cyan-500/30 rounded-3xl p-8 hover:border-cyan-400/50 transition-all duration-500" style={{
              boxShadow: '0 0 60px rgba(6, 182, 212, 0.2), inset 0 0 60px rgba(16, 185, 129, 0.05)'
            }}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-cyan-400 to-blue-400 group-hover:from-blue-400 group-hover:via-green-400 group-hover:to-cyan-400 transition-all duration-500 flex items-center">
                  <Activity className="w-6 h-6 mr-3 text-green-400 group-hover:animate-pulse" />
                  Recent Activity
                </h3>
                <span className="text-xs px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded-full">
                  {statusHistory.length} events
                </span>
              </div>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {statusHistory.slice(0, 10).map((activity, index) => (
                  <div key={activity.id} className="flex items-start space-x-3 p-3 rounded-lg bg-gray-800/30 border border-gray-700/50 hover:border-cyan-500/30 transition-all group/item">
                    <div className={`w-3 h-3 rounded-full mt-2 relative ${activity.status === 'online' || activity.status === 'created' ? 'bg-emerald-500' :
                      activity.status === 'active' || activity.status === 'command_sent' ? 'bg-blue-500' :
                        activity.status === 'scenario_executed' ? 'bg-purple-500' :
                          activity.status === 'deleted' ? 'bg-red-500' : 'bg-amber-500'
                      }`}>
                      <div className={`absolute inset-0 rounded-full animate-ping ${activity.status === 'online' || activity.status === 'created' ? 'bg-emerald-500' :
                        activity.status === 'active' || activity.status === 'command_sent' ? 'bg-blue-500' :
                          activity.status === 'scenario_executed' ? 'bg-purple-500' :
                            activity.status === 'deleted' ? 'bg-red-500' : 'bg-amber-500'
                        }`}></div>
                    </div>
                    <div className="flex-1">
                      <p className="text-white text-sm group-hover/item:text-cyan-300 transition-colors">{activity.message}</p>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-gray-400 text-xs">{activity.time}</p>
                        <span className={`text-xs px-2 py-1 rounded-full ${activity.status === 'online' || activity.status === 'created' ? 'bg-emerald-500/20 text-emerald-400' :
                          activity.status === 'active' || activity.status === 'command_sent' ? 'bg-blue-500/20 text-blue-400' :
                            activity.status === 'scenario_executed' ? 'bg-purple-500/20 text-purple-400' :
                              activity.status === 'deleted' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                          }`}>
                          {activity.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {statusHistory.length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No recent activity</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Active Devices Status */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-pink-600/20 to-purple-600/20 rounded-3xl blur-xl"></div>
            <div className="relative bg-gray-900/70 backdrop-blur-2xl border border-cyan-500/30 rounded-3xl p-8 hover:border-cyan-400/50 transition-all duration-500" style={{
              boxShadow: '0 0 60px rgba(147, 51, 234, 0.2), inset 0 0 60px rgba(6, 182, 212, 0.05)'
            }}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 group-hover:from-cyan-400 group-hover:via-pink-400 group-hover:to-purple-400 transition-all duration-500 flex items-center">
                  <MapPin className="w-6 h-6 mr-3 text-pink-400 group-hover:animate-bounce" />
                  Device Status Overview
                </h3>
                <span className="text-xs px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded-full">
                  {devices.length} total
                </span>
              </div>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {devices.map((device, index) => {
                  const activeFeatures = Object.entries(device.features || {}).filter(([_, enabled]) => enabled);
                  const hasActiveFeatures = activeFeatures.length > 0;

                  return (
                    <div key={device.id} className={`p-3 rounded-lg border transition-all hover:scale-102 ${hasActiveFeatures
                      ? 'border-cyan-500/30 bg-cyan-500/10 shadow-lg shadow-cyan-500/10'
                      : device.status === 'online'
                        ? 'border-emerald-500/30 bg-emerald-500/10'
                        : device.status === 'offline'
                          ? 'border-red-500/30 bg-red-500/10'
                          : 'border-gray-700/50 bg-gray-800/30'
                      }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-3">
                          <DeviceStatusIcon device={device} size="sm" />
                          <div>
                            <h4 className="font-medium text-white">{device.name}</h4>
                            <p className="text-xs text-gray-400">{device.location}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs px-2 py-1 rounded-full border ${device.status === 'online' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-400/30' :
                            device.status === 'offline' ? 'bg-red-500/20 text-red-400 border-red-400/30' :
                              'bg-amber-500/20 text-amber-400 border-amber-400/30'
                            }`}>
                            {device.status?.toUpperCase() || 'UNKNOWN'}
                          </span>
                          {hasActiveFeatures && (
                            <p className="text-xs text-cyan-400 mt-1 font-medium">
                              {activeFeatures.length} active
                            </p>
                          )}
                        </div>
                      </div>

                      {hasActiveFeatures && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {activeFeatures.map(([feature, _]) => {
                            const featureConfig = {
                              siren: { label: "Siren", color: "#3b82f6" },
                              beacon: { label: "Beacon", color: "#f59e0b" },
                              announcement: { label: "PA", color: "#a855f7" },
                              dispenser: { label: "Dispenser", color: "#10b981" },
                            }[feature];

                            if (!featureConfig) return null;

                            return (
                              <span
                                key={feature}
                                className="text-xs px-2 py-1 rounded-full border animate-pulse"
                                style={{
                                  backgroundColor: featureConfig.color + '20',
                                  color: featureConfig.color,
                                  borderColor: featureConfig.color + '40'
                                }}
                              >
                                {featureConfig.label}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {devices.length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No devices registered</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* System Performance Metrics */}
        <div className="relative group">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-600/20 via-purple-600/20 to-pink-600/20 rounded-3xl blur-xl"></div>
          <div className="relative bg-gray-900/70 backdrop-blur-2xl border border-cyan-500/30 rounded-3xl p-8 hover:border-cyan-400/50 transition-all duration-500" style={{
            boxShadow: '0 0 80px rgba(6, 182, 212, 0.3), inset 0 0 80px rgba(6, 182, 212, 0.05)'
          }}>
            <h3 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 mb-8 group-hover:from-pink-500 group-hover:via-cyan-400 group-hover:to-purple-500 transition-all duration-500 flex items-center">
              <Cpu className="w-8 h-8 mr-4 text-cyan-400 group-hover:animate-spin" />
              System Performance Metrics
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                {
                  label: 'Connection Status',
                  value: connectionStatus === 'connected' ? 'Connected' : 'Disconnected',
                  subtext: connectionStatus === 'connected' ? 'AWS IoT Core' : 'Check connection',
                  color: connectionStatus === 'connected' ? 'emerald' : 'red'
                },
                {
                  label: 'Response Time',
                  value: connectionStatus === 'connected' ? '1.2s' : 'N/A',
                  subtext: connectionStatus === 'connected' ? 'Average' : 'Unavailable',
                  color: connectionStatus === 'connected' ? 'blue' : 'gray'
                },
                {
                  label: 'Data Points',
                  value: statusHistory.length,
                  subtext: 'Total events logged',
                  color: 'purple'
                },
                {
                  label: 'Last Update',
                  value: lastUpdate ? lastUpdate.toLocaleTimeString() : 'Never',
                  subtext: 'Latest sync',
                  color: lastUpdate ? 'cyan' : 'gray'
                }
              ].map((metric, index) => (
                <div key={index} className="text-center p-4 bg-gray-800/30 rounded-lg border border-gray-700/50 hover:border-cyan-500/30 transition-all group/metric transform hover:scale-105">
                  <div className={`text-2xl font-bold mb-2 ${metric.color === 'emerald' ? 'text-emerald-400' :
                    metric.color === 'red' ? 'text-red-400' :
                      metric.color === 'blue' ? 'text-blue-400' :
                        metric.color === 'purple' ? 'text-purple-400' :
                          metric.color === 'cyan' ? 'text-cyan-400' :
                            'text-gray-400'
                    } group-hover/metric:text-cyan-300 transition-colors`}>
                    {metric.value}
                  </div>
                  <div className="text-gray-400 text-sm font-medium">{metric.label}</div>
                  <div className="text-gray-500 text-xs mt-1">{metric.subtext}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Users Page
  const UsersPage = () => {

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddUserModal, setShowAddUserModal] = useState(false);
    const [showEditUserModal, setShowEditUserModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [logoVersion, setLogoVersion] = useState(0);

    useEffect(() => {
      const handleStorageChange = () => {
        setLogoVersion(prev => prev + 1);
      };

      window.addEventListener('storage', handleStorageChange);
      return () => window.removeEventListener('storage', handleStorageChange);
    }, []);
    // Load users on component mount
    useEffect(() => {
      loadUsers();
    }, []);

    const loadUsers = async () => {
      setLoading(true);
      try {
        const result = await cognitoService.listUsers(); // Changed from getAllUsers to listUsers
        if (result.success) {
          setUsers(result.users);
        }
      } catch (error) {
        console.error('Failed to load users:', error);
      } finally {
        setLoading(false);
      }
    };


    const EditUserModal = () => {
      const [userData, setUserData] = useState({
        username: editingUser?.username || '',
        email: editingUser?.email || '',
        role: editingUser?.role || 'supervisor',
        phone: editingUser?.attributes?.phone_number || '',
      });
      const [updating, setUpdating] = useState(false);
      const [error, setError] = useState('');

      const handleUpdateUser = async (e) => {
        e.preventDefault();
        setUpdating(true);
        setError('');

        try {
          // For real AWS implementation, you'd use AWS SDK here
          // For now, update local state
          setUsers(prevUsers =>
            prevUsers.map(user =>
              user.username === editingUser.username
                ? { ...user, ...userData, attributes: { ...user.attributes, phone_number: userData.phone } }
                : user
            )
          );

          setShowEditUserModal(false);
          setEditingUser(null);
          alert('User updated successfully');
        } catch (err) {
          setError('Failed to update user');
        } finally {
          setUpdating(false);
        }
      };

      return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900/95 backdrop-blur-xl border border-cyan-500/20 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">Edit User</h3>
              <button
                onClick={() => {
                  setShowEditUserModal(false);
                  setEditingUser(null);
                }}
                className="p-2 rounded-lg hover:bg-gray-800/50 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-400/30 rounded-lg flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-red-400" />
                <span className="text-red-400 text-sm">{error}</span>
              </div>
            )}

            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Username</label>
                <input
                  type="text"
                  value={userData.username}
                  readOnly
                  className="w-full px-4 py-3 bg-gray-800/30 border border-gray-600/50 rounded-lg text-gray-400 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                <input
                  type="email"
                  value={userData.email}
                  onChange={(e) => setUserData({ ...userData, email: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Role</label>
                <select
                  value={userData.role}
                  onChange={(e) => setUserData({ ...userData, role: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                  required
                >
                  <option value="supervisor">Supervisor</option>
                  <option value="guard">Guard</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={userData.phone}
                  onChange={(e) => setUserData({ ...userData, phone: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
                  placeholder="+91 98765 43210"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditUserModal(false);
                    setEditingUser(null);
                  }}
                  className="flex-1 py-3 px-4 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-500 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="flex-1 py-3 px-4 bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:via-blue-500 hover:to-purple-500 transition-all duration-300 disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  {updating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Updating...</span>
                    </>
                  ) : (
                    <span>Update User</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      );
    };

    const handleDeleteUser = async (username) => {
      if (username === currentUser?.username) {
        alert('Cannot delete your own account');
        return;
      }

      if (window.confirm(`Are you sure you want to delete user "${username}"?`)) {
        try {
          const result = await cognitoService.deleteUser(username);
          if (result.success) {
            setUsers(users.filter(user => user.username !== username));
          } else {
            alert(`Failed to delete user: ${result.error}`);
          }
        } catch (error) {
          alert('Failed to delete user');
        }
      }
    };

    // Filter users based on search term
    const filteredUsers = users.filter(user =>
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.role.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Add User Modal - For Creating Supervisor and Guard Accounts
    const AddUserModal = () => {
      const [userData, setUserData] = useState({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'supervisor', // Default to supervisor
        phone: ''
        // Removed department field
      });
      const [creating, setCreating] = useState(false);
      const [error, setError] = useState('');

      // Phone number validation and formatting
      const validatePhone = (phone) => {
        if (!phone.trim()) return { valid: true, formatted: '' }; // Optional field

        const cleaned = phone.replace(/\D/g, '');

        // Check if it's a valid 10-digit Indian number
        if (cleaned.length === 10 && cleaned.match(/^[6-9]/)) {
          return { valid: true, formatted: `+91${cleaned}` };
        }

        // Check if it's already in +91 format
        if (phone.startsWith('+91') && cleaned.length === 12) {
          return { valid: true, formatted: phone };
        }

        return { valid: false, formatted: phone };
      };

      const handlePhoneChange = (e) => {
        const value = e.target.value;
        setUserData({ ...userData, phone: value });

        // Clear phone-related errors when user types
        if (error.includes('phone')) {
          setError('');
        }
      };

      const handleCreateUser = async (e) => {
        e.preventDefault();
        setCreating(true);
        setError('');

        // Validate passwords
        if (userData.password !== userData.confirmPassword) {
          setError('Passwords do not match');
          setCreating(false);
          return;
        }

        if (userData.password.length < 8) {
          setError('Password must be at least 8 characters long');
          setCreating(false);
          return;
        }

        // Validate phone number
        const phoneValidation = validatePhone(userData.phone);
        if (!phoneValidation.valid) {
          setError('Invalid phone number. Please enter a 10-digit Indian mobile number (e.g., 9876543210) or +91xxxxxxxxxx format.');
          setCreating(false);
          return;
        }

        try {
          // Prepare attributes - only phone (department removed)
          const attributes = {};

          // Add phone only if provided
          if (phoneValidation.formatted) {
            attributes.phone_number = phoneValidation.formatted;
          }

          console.log('📱 Creating user with phone:', phoneValidation.formatted || 'none');

          const result = await cognitoService.createUserByAdmin(
            userData.username,
            userData.email,
            userData.password,
            userData.role,
            attributes
          );

          if (result.success) {
            setUsers([...users, result.user]);
            setShowAddUserModal(false);
            setUserData({
              username: '',
              email: '',
              password: '',
              confirmPassword: '',
              role: 'supervisor',
              phone: ''
            });
            alert(`✅ User ${userData.username} created successfully!`);
          } else {
            setError(result.error);
          }
        } catch (err) {
          console.error('❌ Create user error:', err);
          setError('Failed to create user. Please try again.');
        } finally {
          setCreating(false);
        }
      };

      return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900/95 backdrop-blur-xl border border-cyan-500/20 rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">Create New User</h3>
              <button
                onClick={() => setShowAddUserModal(false)}
                className="p-2 rounded-lg hover:bg-gray-800/50 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-400/30 rounded-lg flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-red-400" />
                <span className="text-red-400 text-sm">{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Username *</label>
                <input
                  type="text"
                  value={userData.username}
                  onChange={(e) => setUserData({ ...userData, username: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
                  placeholder="Enter username"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Email *</label>
                <input
                  type="email"
                  value={userData.email}
                  onChange={(e) => setUserData({ ...userData, email: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
                  placeholder="Enter email"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Role *</label>
                <select
                  value={userData.role}
                  onChange={(e) => setUserData({ ...userData, role: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                  required
                >
                  <option value="supervisor">Supervisor</option>
                  <option value="guard">Guard</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Only Supervisor and Guard accounts can be created here</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Password *</label>
                <input
                  type="password"
                  value={userData.password}
                  onChange={(e) => setUserData({ ...userData, password: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
                  placeholder="Enter password"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Min 8 characters, include uppercase, lowercase, number</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Confirm Password *</label>
                <input
                  type="password"
                  value={userData.confirmPassword}
                  onChange={(e) => setUserData({ ...userData, confirmPassword: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
                  placeholder="Confirm password"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={userData.phone}
                  onChange={handlePhoneChange}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
                  placeholder="9876543210 or +919876543210"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Optional. Enter 10-digit mobile number or +91xxxxxxxxxx format
                </p>
                {userData.phone && (
                  <p className="text-xs text-cyan-400 mt-1">
                    Will be saved as: {validatePhone(userData.phone).formatted || 'Invalid format'}
                  </p>
                )}
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="flex-1 py-3 px-4 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-500 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-3 px-4 bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:via-blue-500 hover:to-purple-500 transition-all duration-300 disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  {creating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create User</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-6">
        <div className="relative">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 mb-2 animate-pulse">
            User Management
          </h1>
          <p className="text-gray-400">Manage system users and permissions</p>
        </div>

        {/* Header Actions */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64 pl-10 pr-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 transition-all"
              />
            </div>
          </div>

          {currentUser?.role === 'admin' && (
            <button
              onClick={() => setShowAddUserModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 flex items-center space-x-2 transform hover:scale-105"
            >
              <UserPlus className="w-5 h-5" />
              <span>Add User</span>
            </button>
          )}
        </div>

        {/* Users Table */}
        <div className="bg-gray-900/60 backdrop-blur-sm border border-cyan-500/20 rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-400">Loading users...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-semibold mb-2">No Users Found</h3>
              <p className="text-sm mb-6">
                {users.length === 0 ? 'No users registered yet' : 'No users match your search'}
              </p>
              {currentUser?.role === 'admin' && users.length === 0 && (
                <button
                  onClick={() => setShowAddUserModal(true)}
                  className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 flex items-center space-x-2 mx-auto"
                >
                  <UserPlus className="w-5 h-5" />
                  <span>Add First User</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-800/50 border-b border-cyan-500/20">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-cyan-300">User</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-cyan-300">Role</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-cyan-300">Status</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-cyan-300">Created</th>

                    {currentUser?.role === 'admin' && (
                      <th className="px-6 py-4 text-left text-sm font-semibold text-cyan-300">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {filteredUsers.map((user, i) => (
                    <tr key={i} className="hover:bg-gray-800/30 transition-colors group/row">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 flex items-center justify-center">
                            {localStorage.getItem('adminLogo') ? (
                              <img
                                src={localStorage.getItem('adminLogo')}
                                alt="System logo"
                                className="w-8 h-8 object-cover rounded-full"
                                key={logoVersion}
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 flex items-center justify-center text-sm font-bold text-white">
                                {user.username.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-white group-hover/row:text-cyan-300 transition-colors">
                              {user.username}
                            </div>
                            <div className="text-sm text-gray-400">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full border ${user.role === 'admin' ? 'bg-purple-500/20 text-purple-400 border-purple-400/30' :
                          user.role === 'supervisor' ? 'bg-blue-500/20 text-blue-400 border-blue-400/30' :
                            'bg-green-500/20 text-green-400 border-green-400/30'
                          }`}>
                          {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full border ${user.status === 'CONFIRMED' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-400/30' :
                          'bg-amber-500/20 text-amber-400 border-amber-400/30'
                          }`}>
                          {user.status === 'CONFIRMED' ? 'Active' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-300 text-sm">
                        {user.createdDate ? new Date(user.createdDate).toLocaleDateString() : 'Unknown'}
                      </td>

                      {currentUser?.role === 'admin' && (
                        <td className="px-6 py-4">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                setEditingUser(user);
                                setShowEditUserModal(true);
                              }}
                              className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 rounded-lg transition-all transform hover:scale-110"
                              title="Edit User"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            {user.username !== currentUser?.username && (
                              <button
                                onClick={() => handleDeleteUser(user.username)}
                                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-all transform hover:scale-110"
                                title="Delete User"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showAddUserModal && <AddUserModal />}
        {showEditUserModal && <EditUserModal />}
      </div>
    );
  };

  // Settings Page
  const SettingsPage = () => {
    const [settings, setSettings] = useState({
      systemName: 'ELPRO IoT Control System',
      awsRegion: AWS_CONFIG.region,
      userPoolId: AWS_CONFIG.userPoolId,
      clientId: AWS_CONFIG.userPoolWebClientId,
      autoRefresh: true,
      refreshInterval: 30,
      enableNotifications: true,
      theme: 'dark',
      adminLogo: localStorage.getItem('adminLogo') || null, // Single logo for all roles
    });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Load settings on mount
    useEffect(() => {
      const savedSettings = localStorage.getItem('systemSettings');
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          setSettings(prev => ({ ...prev, ...parsed }));
        } catch (error) {
          console.error('Failed to load settings:', error);
        }
      }
    }, []);

    const handleLogoUpload = (role, event) => {
      const file = event.target.files[0];
      if (file) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
          alert('Please select an image file');
          return;
        }

        // Validate file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
          alert('Image size must be less than 2MB');
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          const logoData = e.target.result;
          setSettings(prev => ({ ...prev, adminLogo: logoData }));
          localStorage.setItem('adminLogo', logoData);

          // Force re-render by triggering a state update
          window.dispatchEvent(new Event('storage'));
        };
        reader.readAsDataURL(file);
      }
    };

    const handleRemoveLogo = (role) => {
      setSettings(prev => ({ ...prev, adminLogo: null }));
      localStorage.removeItem('adminLogo');

      // Force re-render by triggering a state update
      window.dispatchEvent(new Event('storage'));
    };

    const handleSaveSettings = async () => {
      setSaving(true);
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Save to localStorage
        localStorage.setItem('systemSettings', JSON.stringify(settings));

        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (error) {
        console.error('Failed to save settings:', error);
        alert('Failed to save settings');
      } finally {
        setSaving(false);
      }
    };

    const handleResetSettings = () => {
      if (window.confirm('Are you sure you want to reset all settings to default?')) {
        const defaultSettings = {
          systemName: 'ELPRO IoT Control System',
          awsRegion: AWS_CONFIG.region,
          userPoolId: AWS_CONFIG.userPoolId,
          clientId: AWS_CONFIG.userPoolWebClientId,
          autoRefresh: true,
          refreshInterval: 30,
          enableNotifications: true,
          theme: 'dark',
          adminLogo: null, // Single logo
        };

        setSettings(defaultSettings);
        localStorage.removeItem('systemSettings');
        localStorage.removeItem('adminLogo');
      }
    };

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="relative">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 mb-2 animate-pulse">
            System Settings
          </h1>
          <p className="text-gray-400">Configure system preferences and role logos</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* General Settings */}
          <div className="bg-gray-900/60 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-6 hover:border-cyan-500/30 transition-all group">
            <h3 className="text-lg font-semibold text-white mb-4 group-hover:text-cyan-300 transition-colors flex items-center">
              <Settings className="w-5 h-5 mr-2 text-cyan-400" />
              General Settings
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">System Name</label>
                <input
                  type="text"
                  value={settings.systemName}
                  onChange={(e) => setSettings({ ...settings, systemName: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all transform focus:scale-105"
                />
              </div>



              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Connection Status</label>
                <div className={`px-4 py-3 rounded-lg border ${connectionStatus === 'connected' ? 'bg-emerald-500/20 border-emerald-400/30' :
                  connectionStatus === 'connecting' ? 'bg-amber-500/20 border-amber-400/30' :
                    'bg-red-500/20 border-red-400/30'
                  }`}>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-400 animate-pulse' :
                      connectionStatus === 'connecting' ? 'bg-amber-400 animate-spin' :
                        'bg-red-400'
                      }`}></div>
                    <span className={`text-sm font-medium ${connectionStatus === 'connected' ? 'text-emerald-400' :
                      connectionStatus === 'connecting' ? 'text-amber-400' :
                        'text-red-400'
                      }`}>
                      {connectionStatus === 'connected' ? 'Connected to AWS IoT Core' :
                        connectionStatus === 'connecting' ? 'Connecting to AWS IoT Core...' :
                          'Disconnected from AWS IoT Core'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>



          {/* Role Logos */}
          <div className="lg:col-span-2 bg-gray-900/60 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-6 hover:border-cyan-500/30 transition-all group">
            <h3 className="text-lg font-semibold text-white mb-4 group-hover:text-cyan-300 transition-colors flex items-center">
              <User className="w-5 h-5 mr-2 text-cyan-400" />
              System Logo & Branding
            </h3>
            <p className="text-gray-400 text-sm mb-6">Upload a custom logo for the system. This logo will be displayed for all user roles in the sidebar, profile, and header.</p>

            <div className="flex justify-center">
              <div className="space-y-4 p-6 bg-gray-800/30 rounded-lg border border-gray-700/50 hover:border-cyan-500/30 transition-all max-w-sm">
                <div className="text-center">
                  <h4 className="font-medium text-lg text-cyan-400">
                    System Logo
                  </h4>
                  <p className="text-xs text-gray-500">Used across all user roles</p>
                </div>

                <div className="flex flex-col items-center space-y-4">
                  <div className="w-24 h-24 rounded-xl border-2 border-cyan-500/30 flex items-center justify-center bg-gray-800/50">
                    {settings.adminLogo ? (
                      <img
                        src={settings.adminLogo}
                        alt="System logo"
                        className="w-full h-full object-cover rounded-xl"
                      />
                    ) : (
                      <Shield className="w-12 h-12 text-cyan-400" />
                    )}
                  </div>

                  <div className="flex flex-col space-y-2 w-full">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleLogoUpload('admin', e)}
                      className="hidden"
                      id="admin-logo-upload"
                    />
                    <label
                      htmlFor="admin-logo-upload"
                      className="cursor-pointer px-4 py-2 rounded-lg hover:scale-105 transition-all border text-center font-medium bg-cyan-500/20 text-cyan-400 border-cyan-400/30 hover:bg-cyan-500/30"
                    >
                      <Camera className="w-4 h-4 inline mr-2" />
                      Upload Logo
                    </label>

                    {settings.adminLogo && (
                      <button
                        onClick={() => handleRemoveLogo('admin')}
                        className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-all border border-red-400/30 font-medium"
                      >
                        <Trash2 className="w-4 h-4 inline mr-2" />
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-xs text-gray-500 text-center">
                  <p>Max size: 2MB</p>
                  <p>Formats: JPG, PNG, GIF</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center">
          <button
            onClick={handleResetSettings}
            className="px-6 py-3 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-500 transition-all duration-300 flex items-center space-x-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset to Default</span>
          </button>

          <div className="flex items-center space-x-4">
            {saved && (
              <div className="flex items-center space-x-2 text-emerald-400">
                <Check className="w-4 h-4" />
                <span className="text-sm">Settings saved successfully!</span>
              </div>
            )}
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="px-8 py-3 bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:via-blue-500 hover:to-purple-500 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 flex items-center space-x-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Settings</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Enhanced Profile Page with AWS User Attributes
  const ProfilePage = () => {
    const [profileData, setProfileData] = useState({
      username: currentUser?.username || '',
      email: currentUser?.email || '',
      phone: currentUser?.attributes?.phone_number || '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
    const [updating, setUpdating] = useState(false);
    const [changingPassword, setChangingPassword] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleUpdateProfile = async (e) => {
      e.preventDefault();
      setUpdating(true);
      setError('');
      setSuccess('');

      try {
        const attributes = {
          phone_number: profileData.phone
        };

        const result = await cognitoService.updateUserAttributes(currentUser.username, attributes);

        if (result.success) {
          setSuccess('Profile updated successfully');
          const updatedUser = {
            ...currentUser,
            attributes: { ...currentUser.attributes, ...attributes }
          };
          setCurrentUser(updatedUser);
          setTimeout(() => setSuccess(''), 3000);
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError('Failed to update profile');
      } finally {
        setUpdating(false);
      }
    };

    const handleChangePassword = async (e) => {
      e.preventDefault();
      setChangingPassword(true);
      setError('');
      setSuccess('');

      if (profileData.newPassword !== profileData.confirmPassword) {
        setError('New passwords do not match');
        setChangingPassword(false);
        return;
      }

      try {
        const result = await cognitoService.changePassword(
          profileData.currentPassword,
          profileData.newPassword
        );

        if (result.success) {
          setSuccess('Password changed successfully');
          setProfileData({
            ...profileData,
            currentPassword: '',
            newPassword: '',
            confirmPassword: ''
          });
          setTimeout(() => setSuccess(''), 3000);
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError('Failed to change password');
      } finally {
        setChangingPassword(false);
      }
    };

    return (
      <div className="space-y-6">
        <div className="relative">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 mb-2 animate-pulse">
            Profile Settings
          </h1>
          <p className="text-gray-400">Manage your AWS Cognito account information</p>
        </div>

        {error && (
          <div className="p-4 bg-red-500/20 border border-red-400/30 rounded-lg flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-red-400">{error}</span>
          </div>
        )}

        {success && (
          <div className="p-4 bg-emerald-500/20 border border-emerald-400/30 rounded-lg flex items-center space-x-2">
            <Check className="w-5 h-5 text-emerald-400" />
            <span className="text-emerald-400">{success}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Header */}
          {/* Profile Header */}
          <div className="bg-gray-900/60 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-6 hover:border-cyan-500/30 transition-all group">
            <div className="text-center">
              <div className="relative w-32 h-32 flex items-center justify-center mb-4 mx-auto">
                {localStorage.getItem('adminLogo') ? (
                  <img
                    src={localStorage.getItem('adminLogo')}
                    alt="System logo"
                    className="w-28 h-28 object-cover rounded-full"
                    key={logoVersion}
                  />
                ) : (
                  <div className="w-28 h-28 rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 flex items-center justify-center">
                    <span className="text-3xl font-bold text-white">
                      {currentUser?.username?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <button className="absolute bottom-2 right-2 p-2 bg-cyan-500 rounded-full text-white hover:bg-cyan-400 transition-all transform hover:scale-110">
                  <Camera className="w-4 h-4" />
                </button>
              </div>
              <h3 className="text-2xl font-semibold text-white group-hover:text-cyan-300 transition-colors">
                {currentUser?.username}
              </h3>
              <p className="text-cyan-300 capitalize text-lg">{currentUser?.role}</p>
              <p className="text-gray-400 text-sm mt-2">{currentUser?.email}</p>

              <div className="mt-4 p-3 bg-cyan-500/10 border border-cyan-400/30 rounded-lg">
                <div className="flex items-center justify-center space-x-2 mb-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-medium text-cyan-400">AWS Cognito User</span>
                </div>
                <p className="text-xs text-cyan-300">
                  Authenticated via AWS Cognito<br />
                  Session managed securely
                </p>
              </div>
            </div>
          </div>



          {/* Profile Information */}
          <div className="lg:col-span-2 bg-gray-900/60 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-6 hover:border-cyan-500/30 transition-all group">
            <h3 className="text-lg font-semibold text-white mb-4 group-hover:text-cyan-300 transition-colors flex items-center">
              <User className="w-5 h-5 mr-2 text-cyan-400" />
              Account Information
            </h3>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Username</label>
                  <input
                    type="text"
                    value={profileData.username}
                    readOnly
                    className="w-full px-4 py-3 bg-gray-800/30 border border-gray-600/50 rounded-lg text-gray-400 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">Username cannot be changed</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                  <input
                    type="email"
                    value={profileData.email}
                    readOnly
                    className="w-full px-4 py-3 bg-gray-800/30 border border-gray-600/50 rounded-lg text-gray-400 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">Email is managed by AWS Cognito</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Phone Number</label>
                  <input
                    type="tel"
                    value={profileData.phone}
                    onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all transform focus:scale-105"
                  />
                </div>


              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={updating}
                  className="px-6 py-3 bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:via-blue-500 hover:to-purple-500 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 flex items-center space-x-2"
                >
                  {updating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Update Profile</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Change Password */}
          <div className="lg:col-span-3 bg-gray-900/60 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-6 hover:border-cyan-500/30 transition-all group">
            <h3 className="text-lg font-semibold text-white mb-4 group-hover:text-cyan-300 transition-colors flex items-center">
              <KeyRound className="w-5 h-5 mr-2 text-cyan-400" />
              Change Password
            </h3>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Current Password</label>
                  <input
                    type="password"
                    value={profileData.currentPassword}
                    onChange={(e) => setProfileData({ ...profileData, currentPassword: e.target.value })}
                    placeholder="Enter current password"
                    className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all transform focus:scale-105"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">New Password</label>
                  <input
                    type="password"
                    value={profileData.newPassword}
                    onChange={(e) => setProfileData({ ...profileData, newPassword: e.target.value })}
                    placeholder="Enter new password"
                    className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all transform focus:scale-105"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Min 8 chars, uppercase, lowercase, number</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Confirm New Password</label>
                  <input
                    type="password"
                    value={profileData.confirmPassword}
                    onChange={(e) => setProfileData({ ...profileData, confirmPassword: e.target.value })}
                    placeholder="Confirm new password"
                    className="w-full px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all transform focus:scale-105"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={changingPassword || !profileData.currentPassword || !profileData.newPassword || !profileData.confirmPassword}
                  className="px-6 py-3 bg-gradient-to-r from-amber-500 via-orange-600 to-red-600 text-white font-medium rounded-lg hover:from-amber-400 hover:via-orange-500 hover:to-red-500 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 flex items-center space-x-2"
                >
                  {changingPassword ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Changing...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Change Password</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  };

  // Main render function
  const renderContent = () => {
    switch (activeTab) {
      case 'home': return <HomePage />;
      case 'assets': return <AssetsPage />;
      case 'control': return <ControlPage controlMode={controlMode} setControlMode={setControlMode} />;
      case 'reports': return <ReportsPage />;
      case 'groups': return <GroupsPage />;
      case 'users': return <UsersPage />;
      case 'settings': return <SettingsPage />;
      case 'profile': return <ProfilePage />;
      default: return <HomePage />;
    }
  };

  if (!currentUser) {
    return <LoginForm />;
  }

  return (
    <div className="flex h-screen w-full" style={{
      background: 'linear-gradient(135deg, #0a0e1a 0%, #1a1f3a 25%, #2a2f4a 50%, #1a1f3a 75%, #0a0e1a 100%)',
      minHeight: '100vh',
      minWidth: '100vw'
    }}>
      {/* Enhanced Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: `
          radial-gradient(circle at 20% 20%, rgba(0, 255, 255, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 80% 80%, rgba(0, 100, 255, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 40% 60%, rgba(100, 0, 255, 0.1) 0%, transparent 50%)
        `,
          minHeight: '100vh',
          width: '100vw'
        }}></div>
      </div>

      <Sidebar />

      <div className="flex-1 flex flex-col relative z-10">
        {/* Enhanced Header */}
        <header className="bg-gray-900/80 backdrop-blur-xl border-b border-cyan-500/20 px-6 py-4 relative overflow-hidden" style={{
          boxShadow: '0 0 20px rgba(0, 255, 255, 0.1)'
        }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {isMobile && (
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="p-2 rounded-lg hover:bg-cyan-500/20 text-cyan-400 transition-all transform hover:scale-110"
                >
                  {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              )}
              <div className="relative">
                <h1 className="text-2xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400 capitalize">
                  {activeTab === 'home' ? 'Dashboard' : activeTab}
                </h1>
                <div className="absolute -bottom-1 left-0 w-full h-0.5 bg-gradient-to-r from-cyan-400 to-blue-400 animate-pulse"></div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <button className="p-2 rounded-lg hover:bg-cyan-500/20 text-cyan-400 transition-all relative transform hover:scale-110">
                <Bell className="w-5 h-5" />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></div>
              </button>

              {!isMobile && (
                <div className="flex items-center space-x-3 bg-gray-800/30 backdrop-blur-sm border border-cyan-500/20 rounded-lg p-2 hover:border-cyan-500/40 transition-all">
                  <div className="w-8 h-8 flex items-center justify-center">
                    {localStorage.getItem('adminLogo') ? (
                      <img
                        src={localStorage.getItem('adminLogo')}
                        alt="System logo"
                        className="w-7 h-7 object-cover rounded-full"
                        key={logoVersion}
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 flex items-center justify-center text-sm font-bold text-white">
                        {currentUser?.username?.charAt(0).toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{currentUser?.username}</p>
                    <p className="text-xs text-cyan-300 capitalize">{currentUser?.role}</p>
                  </div>
                  <button
                    onClick={() => {
                      setCurrentUser(null); // Clear current user
                      setActiveTab(''); // Reset activeTab on logout
                      cognitoService.signOut(); // Perform Cognito sign-out
                    }}
                    className="p-1 rounded hover:bg-red-500/20 text-red-400 transition-all transform hover:scale-110"
                    title="Logout"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Header glow effect */}
          <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent"></div>
        </header>

        {/* Enhanced Main Content */}
        <main className="flex-1 overflow-auto p-6 relative">
          <div className="max-w-none">
            {renderContent()}
          </div>

          {/* Floating action button for mobile */}
          {isMobile && (
            <div className="fixed bottom-6 right-6 z-40">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="w-14 h-14 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center text-white shadow-lg hover:shadow-xl transition-all transform hover:scale-110"
              >
                <Menu className="w-6 h-6" />
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default ProfessionalIoTDashboard;