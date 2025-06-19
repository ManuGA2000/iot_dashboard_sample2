import React, { useState, useEffect, useCallback, useRef, memo } from "react";
import {
  MapPin,
  Radio,
  Bell,
  Mic,
  Eye,
  Wifi,
  WifiOff,
  Activity,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Map,
  Layers,
} from "lucide-react";

// Map layer configurations
const mapLayers = {
  osm: {
    name: "Standard",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
    icon: "🗺️",
  },
  google: {
    name: "Google Maps",
    url: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
    attribution: "© Google Maps",
    icon: "🌍",
  },
  satellite: {
    name: "Satellite",
    url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    attribution: "© Google Maps",
    icon: "🛰️",
  },
  dark: {
    name: "Dark Mode",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "© CartoDB",
    icon: "🌙",
  },
  terrain: {
    name: "Terrain",
    url: "https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
    attribution: "© Google Maps",
    icon: "🏔️",
  },
};

// Status configurations
const statusConfig = {
  online: {
    color: "#10b981",
    ringColor: "#34d399",
    bgGradient: "from-emerald-500 to-green-500",
    pulse: true,
    glow: "shadow-emerald-500/30",
  },
  offline: {
    color: "#ef4444",
    ringColor: "#f87171",
    bgGradient: "from-red-500 to-pink-500",
    pulse: false,
    glow: "shadow-red-500/30",
  },
  active: {
    color: "#f59e0b",
    ringColor: "#fbbf24",
    bgGradient: "from-amber-500 to-yellow-500",
    pulse: true,
    glow: "shadow-amber-500/30",
  },
  // FIXED: Add support for 'active+online' status
  'active+online': {
    color: "#f59e0b",
    ringColor: "#fbbf24",
    bgGradient: "from-amber-500 via-yellow-500 to-emerald-500",
    pulse: true,
    glow: "shadow-amber-500/30",
  },
  // FIXED: Add default fallback
  default: {
    color: "#6b7280",
    ringColor: "#9ca3af",
    bgGradient: "from-gray-500 to-gray-600",
    pulse: false,
    glow: "shadow-gray-500/30",
  },
};

// FIXED: Feature configuration with proper colors
const featureConfig = {
  siren: { 
    icon: Radio, 
    label: "Emergency Siren", 
    color: "#3b82f6",
    activeColor: "#2563eb",
    inactiveColor: "#94a3b8"
  },
  beacon: { 
    icon: Bell, 
    label: "Warning Beacon", 
    color: "#f59e0b",
    activeColor: "#d97706",
    inactiveColor: "#94a3b8"
  },
  announcement: { 
    icon: Mic, 
    label: "PA System", 
    color: "#a855f7",
    activeColor: "#9333ea",
    inactiveColor: "#94a3b8"
  },
  dispenser: { 
    icon: Eye, 
    label: "Sanitizer Dispenser", 
    color: "#10b981",
    activeColor: "#059669",
    inactiveColor: "#94a3b8"
  },
};

// FIXED: Enhanced marker creation with proper feature indicators
const createProfessionalMarker = (device, isDarkMode = false) => {
  const config = statusConfig[device.status] || statusConfig['online'] || {
  color: "#10b981",
  ringColor: "#34d399", 
  bgGradient: "from-emerald-500 to-green-500",
  pulse: true,
  glow: "shadow-emerald-500/30",
};
  const size = 40;

  // Only show active features
  const activeFeatures = Object.entries(device.features)
    .filter(([_, enabled]) => enabled);

  // Create feature indicators only for active features
  const featureIndicators = activeFeatures
    .map(([feature], index) => {
      const featureInfo = featureConfig[feature];
      const positions = [
        { x: size * 0.8, y: size * 0.2 },
        { x: size * 0.8, y: size * 0.8 },
        { x: size * 0.2, y: size * 0.8 },
        { x: size * 0.2, y: size * 0.2 },
      ];
      const pos = positions[index] || positions[0];
      
      return `
        <circle cx="${pos.x}" cy="${pos.y}" r="3" 
                fill="${featureInfo.activeColor}" 
                stroke="white" stroke-width="1" opacity="0.95">
            <animate attributeName="opacity" values="0.95;0.6;0.95" dur="2s" repeatCount="indefinite"/>
        </circle>
      `;
    })
    .join("");

  // Enhanced pulse animation for active devices
  const pulseAnimation = config.pulse
    ? `
      <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.7}" fill="none" 
              stroke="${config.ringColor}" stroke-width="2" opacity="0.4">
          <animate attributeName="r" values="${size * 0.5};${size * 0.8};${size * 0.5}" 
                   dur="2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite"/>
      </circle>
    `
    : "";

  // Status ring for online devices
  const statusRing = device.status === "online"
    ? `
      <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.6}" fill="none" 
              stroke="${config.ringColor}" stroke-width="1.5" opacity="0.6" 
              stroke-dasharray="3 2">
          <animateTransform attributeName="transform" type="rotate" 
                          values="0 ${size / 2} ${size / 2};360 ${size / 2} ${size / 2}" 
                          dur="4s" repeatCount="indefinite"/>
      </circle>
    `
    : "";

  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="gradient-${device.id}" cx="50%" cy="30%" r="70%">
                <stop offset="0%" stop-color="${config.color}" stop-opacity="1"/>
                <stop offset="70%" stop-color="${config.color}" stop-opacity="0.8"/>
                <stop offset="100%" stop-color="${config.color}" stop-opacity="0.6"/>
            </radialGradient>
            <filter id="shadow-${device.id}" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.3"/>
            </filter>
        </defs>
        ${pulseAnimation}
        ${statusRing}
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 3}" 
                fill="url(#gradient-${device.id})" 
                stroke="white" stroke-width="2" 
                filter="url(#shadow-${device.id})"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 4}" 
                fill="${isDarkMode ? "rgba(15, 23, 42, 0.8)" : "rgba(255, 255, 255, 0.9)"}" 
                opacity="0.9"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 8}" 
                fill="${config.ringColor}" opacity="0.9">
            ${device.status !== "offline" ? `
                <animate attributeName="opacity" values="0.9;0.4;0.9" dur="1.5s" repeatCount="indefinite"/>
            ` : ""}
        </circle>
        ${featureIndicators}
        <g transform="translate(${size - 10}, 2)" opacity="${device.status === "offline" ? "0.3" : "0.9"}">
            ${device.status !== "offline"
              ? Array.from({ length: 4 }, (_, i) => `
                  <rect x="${i * 1.5}" y="${6 - i * 1.5}" width="1" height="${1 + i * 1.5}" 
                        fill="${device.signalStrength > (i + 1) * 20 ? config.color : "#94a3b8"}" 
                        opacity="${device.signalStrength > (i + 1) * 20 ? "1" : "0.3"}"/>
                `).join("")
              : `
                  <line x1="0" y1="1" x2="5" y2="6" stroke="#94a3b8" stroke-width="1" stroke-linecap="round"/>
                  <line x1="5" y1="1" x2="0" y2="6" stroke="#94a3b8" stroke-width="1" stroke-linecap="round"/>
              `}
        </g>
    </svg>
  `;

  return svg;
};

// FIXED: Enhanced popup with proper feature highlighting
const DevicePopup = memo(
  ({
    device,
    isDarkMode,
    onFeatureToggle,
    position,
    onMouseEnter,
    onMouseLeave,
    placement,
  }) => {
    const config = statusConfig[device.status];

    if (!position) return null;

    return (
      <div
        className="absolute z-[1500] pointer-events-none"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          transform: "translate(-50%, -100%)",
        }}
      >
        <div
          className={`
            w-60 p-3 rounded-xl shadow-xl border backdrop-blur-xl pointer-events-auto
            transform transition-all duration-200 ease-out
            ${isDarkMode ? "bg-slate-800/95 border-slate-600/50 text-slate-200" : "bg-white/95 border-gray-200/50 text-gray-800"}
            ${config.glow}
          `}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          <div
            className={`
              absolute left-1/2 transform -translate-x-1/2 bottom-[-6px]
              w-0 h-0 border-l-6 border-r-6 border-transparent border-t-6
              ${isDarkMode ? "border-t-slate-800/95" : "border-t-white/95"}
            `}
          ></div>
          
          <div className="flex justify-between items-start mb-2">
            <div className="flex-1">
              <h3 className={`font-bold text-sm mb-1 truncate ${isDarkMode ? "text-blue-400" : "text-blue-600"}`}>
                {device.name}
              </h3>
              <div className={`text-xs ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                <MapPin className="w-2 h-2 inline-block mr-1" />
                {device.location} • Zone {device.group}
              </div>
            </div>
            <div
              className={`
                px-2 py-0.5 rounded-full text-xs font-bold flex items-center space-x-1
                ${
                  device.status === "online"
                    ? "bg-emerald-100 text-emerald-800"
                    : device.status === "offline"
                    ? "bg-red-100 text-red-800"
                    : "bg-amber-100 text-amber-800"
                }
              `}
            >
              {device.status === "online" && <Wifi className="w-2 h-2" />}
              {device.status === "offline" && <WifiOff className="w-2 h-2" />}
              {device.status === "active" && <Activity className="w-2 h-2" />}
              <span>{device.status.toUpperCase()}</span>
            </div>
          </div>

          {/* Device Stats */}
          {/* <div className={`grid grid-cols-3 gap-2 p-2 mb-3 rounded-lg ${isDarkMode ? "bg-slate-700/50" : "bg-gray-50"}`}>
            <div className="text-center">
              <div
                className={`font-bold text-sm ${
                  device.status === "offline" ? "text-red-500" : "text-emerald-500"
                }`}
              >
                {device.signalStrength || 0}%
              </div>
              <div className={`text-xs ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>Signal</div>
            </div>
            <div className="text-center">
              <div
                className={`font-bold text-sm ${
                  device.batteryLevel < 20
                    ? "text-red-500"
                    : device.batteryLevel < 50
                    ? "text-amber-500"
                    : "text-emerald-500"
                }`}
              >
                {device.batteryLevel || 0}%
              </div>
              <div className={`text-xs ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>Battery</div>
            </div>
            <div className="text-center">
              <div className={`font-bold text-sm ${isDarkMode ? "text-blue-400" : "text-blue-600"}`}>
                {Object.values(device.features || {}).filter((f) => f).length}
              </div>
              <div className={`text-xs ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>Active</div>
            </div>
          </div> */}

          {/* FIXED: Enhanced Feature Controls with proper highlighting */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className={`font-semibold text-xs ${isDarkMode ? "text-slate-300" : "text-gray-700"}`}>
                Device Features
              </h4>
              <span className={`text-xs ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                Last seen: {device.lastSeen || 'Never'}
              </span>
            </div>
            <div className="space-y-1">
              {Object.entries(featureConfig).map(([feature, config]) => {
                const { icon: Icon, label } = config;
                const isEnabled = device.features?.[feature] || false;
                
                return (
                  <div
                    key={feature}
                    className={`
                      flex items-center justify-between p-2 rounded-lg transition-all duration-300
                      ${isEnabled 
                        ? isDarkMode 
                          ? "bg-slate-700/50 hover:bg-slate-600/50 border border-slate-500/30" 
                          : "bg-gray-50 hover:bg-gray-100 border border-gray-200/50"
                        : isDarkMode
                          ? "bg-slate-800/30 hover:bg-slate-700/30 border border-slate-700/30"
                          : "bg-gray-100/30 hover:bg-gray-100/50 border border-gray-300/30"
                      }
                      ${isEnabled ? 'shadow-sm' : 'opacity-60'}
                    `}
                  >
                    <div className="flex items-center space-x-2">
                      <div
                        className={`
                          p-1 rounded-md transition-all duration-300
                          ${isEnabled 
                            ? `border shadow-sm`
                            : `border-dashed opacity-50`
                          }
                        `}
                        style={{
                          backgroundColor: isEnabled 
                            ? `${config.color}20` 
                            : isDarkMode ? '#334155' : '#f1f5f9',
                          borderColor: isEnabled 
                            ? config.color 
                            : isDarkMode ? '#475569' : '#cbd5e1'
                        }}
                      >
                        <Icon
                          className={`w-3 h-3 transition-all duration-300`}
                          style={{
                            color: isEnabled ? config.activeColor : config.inactiveColor
                          }}
                        />
                      </div>
                      <div>
                        <div 
                          className={`text-xs font-medium transition-colors duration-300 ${
                            isEnabled 
                              ? isDarkMode ? "text-slate-100" : "text-slate-800"
                              : isDarkMode ? "text-slate-400" : "text-slate-500"
                          }`}
                        >
                          {label}
                        </div>
                        <div className={`text-xs ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                          <span 
                            className={`font-medium ${
                              isEnabled ? "text-emerald-500" : "text-red-500"
                            }`}
                          >
                            {isEnabled ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* FIXED: Enhanced toggle switch */}
                    <button
                      onClick={() => onFeatureToggle(device.id, feature)}
                      disabled={device.status === 'offline'}
                      className={`
                        relative inline-flex h-4 w-7 items-center rounded-full transition-all duration-300
                        ${isEnabled 
                          ? "bg-emerald-500 shadow-md" 
                          : isDarkMode ? "bg-slate-600" : "bg-gray-300"
                        }
                        ${device.status === 'offline' ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 transform cursor-pointer'}
                        focus:outline-none focus:ring-2 focus:ring-emerald-400/50
                      `}
                    >
                      <span
                        className={`
                          inline-block h-2 w-2 transform rounded-full bg-white shadow-lg transition-all duration-300
                          ${isEnabled ? "translate-x-4" : "translate-x-1"}
                          ${isEnabled ? "shadow-emerald-200" : "shadow-gray-200"}
                        `}
                      />
                      {isEnabled && (
                        <div className="absolute inset-0 rounded-full bg-emerald-400 opacity-20 animate-pulse"></div>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

// Main map component (rest of the component remains the same)
const ProfessionalLeafletMap = memo(
  ({
    devices,
    isDarkMode,
    hoveredDevice,
    setHoveredDevice,
    handleFeatureToggle,
  }) => {
    const mapRef = useRef(null);
    const leafletMapRef = useRef(null);
    const markersRef = useRef({});
    const hoverTimeoutRef = useRef(null);

    const [mapLoaded, setMapLoaded] = useState(false);
    const [currentLayer, setCurrentLayer] = useState(
      isDarkMode ? "dark" : "google"
    );
    const [showLayerSelector, setShowLayerSelector] = useState(false);
    const [mapReady, setMapReady] = useState(false);
    const [popupPosition, setPopupPosition] = useState(null);

    const calculatePopupPosition = useCallback((device) => {
      if (!leafletMapRef.current || !window.L) return null;

      try {
        const marker = markersRef.current[device.id];
        if (!marker || !marker._icon) return null;

        const markerElement = marker._icon;
        const mapContainer = mapRef.current;

        if (!mapContainer) return null;

        const mapRect = mapContainer.getBoundingClientRect();
        const markerRect = markerElement.getBoundingClientRect();

        const x = markerRect.left - mapRect.left + markerRect.width / 2;
        const y = markerRect.top - mapRect.top;

        const popupWidth = 240;
        const popupHeight = 320;
        const padding = 15;
        const arrowOffset = 10;

        let adjustedX = x;
        if (x + popupWidth / 2 > mapRect.width - padding) {
          adjustedX = mapRect.width - popupWidth / 2 - padding;
        } else if (x - popupWidth / 2 < padding) {
          adjustedX = popupWidth / 2 + padding;
        }

        const adjustedY = y - arrowOffset;
        const placement = "above";

        const popupTopEdge = adjustedY - popupHeight;
        
        if (popupTopEdge < padding) {
          const spaceNeeded = Math.abs(popupTopEdge - padding) + 30;
          
          leafletMapRef.current.panBy([0, -spaceNeeded], { 
            animate: true, 
            duration: 0.3,
            easeLinearity: 0.25
          });

          setTimeout(() => {
            const newMarkerRect = markerElement.getBoundingClientRect();
            const newY = newMarkerRect.top - mapRect.top;
            const newAdjustedY = newY - arrowOffset;
            
            setPopupPosition({ 
              x: adjustedX, 
              y: newAdjustedY, 
              placement: "above" 
            });
          }, 350);

          return null;
        }

        return { x: adjustedX, y: adjustedY, placement };
      } catch (error) {
        console.warn("Error calculating popup position:", error);
        return null;
      }
    }, []);

    // Leaflet initialization and other methods remain the same...
    useEffect(() => {
      const loadLeaflet = async () => {
        if (!document.querySelector('link[href*="leaflet"]')) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css";
          document.head.appendChild(link);
        }

        if (!window.L) {
          const attemptLoad = async (urls, index = 0) => {
            if (index >= urls.length) {
              console.error("All Leaflet CDNs failed");
              return;
            }

            const script = document.createElement("script");
            script.src = urls[index];
            script.onload = () => setMapReady(true);
            script.onerror = () => {
              console.warn(`Failed to load Leaflet from ${urls[index]}`);
              attemptLoad(urls, index + 1);
            };
            document.head.appendChild(script);
          };

          const leafletUrls = [
            "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
            "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
          ];
          attemptLoad(leafletUrls);
        } else {
          setMapReady(true);
        }
      };

      loadLeaflet();
    }, []);

    // FIXED: Enhanced marker creation with real-time updates
    const createMarkers = useCallback(() => {
      if (!leafletMapRef.current || !window.L) {
        console.warn("Leaflet map or library not initialized");
        return;
      }

      // Remove existing markers
      Object.values(markersRef.current).forEach((marker) => {
        if (leafletMapRef.current && marker) {
          leafletMapRef.current.removeLayer(marker);
        }
      });
      markersRef.current = {};

      devices.forEach((device, index) => {
        try {
          const svgString = createProfessionalMarker(device, isDarkMode);
          const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
          const svgUrl = URL.createObjectURL(svgBlob);

          const customIcon = window.L.icon({
            iconUrl: svgUrl,
            iconSize: [40, 40],
            iconAnchor: [20, 20],
            popupAnchor: [0, -20],
            className: "custom-marker-icon",
          });

          const marker = window.L.marker([device.lat, device.lng], {
            icon: customIcon,
            riseOnHover: false,
          });

          setTimeout(() => {
            if (!leafletMapRef.current) {
              console.warn("Map reference lost before adding marker");
              URL.revokeObjectURL(svgUrl);
              return;
            }

            marker.addTo(leafletMapRef.current);

            setTimeout(() => {
              if (marker._icon) {
                marker._icon.style.opacity = "0";
                marker._icon.style.transition = "opacity 0.5s ease-in-out";
                setTimeout(() => {
                  if (marker._icon) {
                    marker._icon.style.opacity = "1";
                  }
                }, 50);
              }
            }, 0);

            marker.on("mouseover", () => {
              if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
                hoverTimeoutRef.current = null;
              }
              setHoveredDevice(device);
              if (marker._icon) {
                marker._icon.style.filter =
                  "brightness(1.2) drop-shadow(0 4px 8px rgba(0,0,0,0.3))";
                marker._icon.style.zIndex = "1000";
              }
            });

            marker.on("mouseout", () => {
              hoverTimeoutRef.current = setTimeout(() => {
                setHoveredDevice(null);
              }, 150);
              if (marker._icon) {
                marker._icon.style.filter = "none";
                marker._icon.style.zIndex = "auto";
              }
            });

            markersRef.current[device.id] = marker;
            setTimeout(() => URL.revokeObjectURL(svgUrl), 1000);
          }, index * 150);
        } catch (error) {
          console.error(`Error creating marker for device ${device.id}:`, error);
        }
      });
    }, [devices, isDarkMode, setHoveredDevice]);

    // Rest of the component implementation remains the same...
    // (Include all the other useEffect hooks, map initialization, layer switching, etc.)

    useEffect(() => {
      if (!mapReady || !mapRef.current || leafletMapRef.current) return;

      try {
        if (!mapRef.current.offsetParent) {
          console.warn("Map container not visible or not mounted");
          return;
        }

        leafletMapRef.current = window.L.map(mapRef.current, {
          center: [12.9716, 77.5946],
          zoom: 13,
          zoomControl: false,
          attributionControl: false,
          preferCanvas: true,
          zoomAnimation: true,
          fadeAnimation: true,
          markerZoomAnimation: true,
          inertia: true,
          inertiaDeceleration: 3000,
          inertiaMaxSpeed: 1500,
          worldCopyJump: true,
        });

        const layer = mapLayers[currentLayer];
        window.L.tileLayer(layer.url, {
          attribution: layer.attribution,
          maxZoom: 18,
          tileSize: 256,
          zoomOffset: 0,
          updateWhenIdle: false,
          updateWhenZooming: false,
          keepBuffer: 2,
        }).addTo(leafletMapRef.current);

        window.L.control
          .attribution({
            position: "bottomright",
            prefix: false,
          })
          .addTo(leafletMapRef.current);

        setMapLoaded(true);

        setTimeout(createMarkers, 100);
      } catch (error) {
        console.error("Failed to initialize map:", error);
      }
    }, [mapReady, currentLayer]);

    useEffect(() => {
      if (leafletMapRef.current) {
        const newLayer = isDarkMode ? "dark" : "google";
        if (newLayer !== currentLayer) {
          changeLayer(newLayer);
        }
      }
    }, [isDarkMode]);

    useEffect(() => {
      if (hoveredDevice) {
        const position = calculatePopupPosition(hoveredDevice);
        setPopupPosition(position);
      } else {
        setPopupPosition(null);
      }
    }, [hoveredDevice, calculatePopupPosition]);

    const changeLayer = useCallback((layerKey) => {
      if (!leafletMapRef.current || !window.L) return;

      const currentTileLayer = Object.values(leafletMapRef.current._layers).find(
        (layer) => layer instanceof window.L.TileLayer
      );

      if (currentTileLayer) {
        currentTileLayer.setOpacity(0);
        setTimeout(() => {
          leafletMapRef.current.removeLayer(currentTileLayer);
          const newLayer = mapLayers[layerKey];
          const tileLayer = window.L.tileLayer(newLayer.url, {
            attribution: newLayer.attribution,
            maxZoom: 18,
            opacity: 0,
          }).addTo(leafletMapRef.current);
          let opacity = 0;
          const fadeIn = setInterval(() => {
            opacity += 0.1;
            tileLayer.setOpacity(opacity);
            if (opacity >= 1) clearInterval(fadeIn);
          }, 50);
        }, 200);
      }

      setCurrentLayer(layerKey);
      setShowLayerSelector(false);
    }, []);

    useEffect(() => {
      if (mapLoaded) createMarkers();
    }, [devices, mapLoaded, createMarkers]);

    const handlePopupMouseEnter = useCallback(() => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
    }, []);

    const handlePopupMouseLeave = useCallback(() => {
      hoverTimeoutRef.current = setTimeout(() => {
        setHoveredDevice(null);
      }, 100);
    }, []);

    const handleZoomIn = useCallback(() => {
      if (leafletMapRef.current) leafletMapRef.current.zoomIn();
    }, []);

    const handleZoomOut = useCallback(() => {
      if (leafletMapRef.current) leafletMapRef.current.zoomOut();
    }, []);

    const handleResetView = useCallback(() => {
      if (leafletMapRef.current) {
        leafletMapRef.current.flyTo([12.9716, 77.5946], 13, {
          duration: 1.5,
          easeLinearity: 0.25,
        });
      }
    }, []);

    useEffect(() => {
      return () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      };
    }, []);

    return (
      <div
        className={`
          relative h-full w-full rounded-2xl overflow-hidden shadow-2xl
          ${isDarkMode ? "bg-gradient-to-br from-slate-900 via-blue-900/20 to-purple-900/30" : "bg-gradient-to-br from-blue-50 via-white to-slate-50"}
        `}
      >
        <div
          ref={mapRef}
          className="absolute inset-0 h-full w-full"
          style={{ minHeight: "400px" }}
        />
        {!mapLoaded && (
          <div
            className={`
              absolute inset-0 flex items-center justify-center z-[1000]
              ${isDarkMode ? "bg-slate-900/80" : "bg-white/80"}
              backdrop-blur-sm
            `}
          >
            <div
              className={`
                text-center p-8 rounded-2xl backdrop-blur-md border
                ${isDarkMode ? "bg-slate-800/90 border-slate-700/50 text-slate-200" : "bg-white/90 border-gray-200/50 text-gray-800"}
                transform transition-all duration-500
              `}
            >
              <div className="relative mb-4">
                <div
                  className={`
                    w-12 h-12 rounded-full border-4 border-t-transparent animate-spin mx-auto
                    ${isDarkMode ? "border-blue-400" : "border-blue-500"}
                  `}
                ></div>
                <div
                  className={`
                    absolute inset-0 w-12 h-12 rounded-full border-4 border-transparent 
                    border-t-current animate-pulse mx-auto
                    ${isDarkMode ? "text-purple-400" : "text-purple-500"}
                  `}
                ></div>
              </div>
              <h3 className="text-lg font-semibold mb-2">Loading Professional Map</h3>
              <p className="text-sm opacity-75">Initializing enhanced visualization...</p>
            </div>
          </div>
        )}
        {mapLoaded && (
          <>
            <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-[1000]">
              <div className="relative">
                <button
                  onClick={() => setShowLayerSelector(!showLayerSelector)}
                  className={`
                    flex items-center space-x-3 px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md
                    transition-all duration-300 hover:scale-105 transform active:scale-95
                    ${isDarkMode ? "bg-slate-800/90 text-slate-200 border-slate-600/50 hover:bg-slate-700/90" : "bg-white/90 text-gray-700 border-gray-200/50 hover:bg-gray-50/90"}
                  `}
                >
                  <Layers className="w-4 h-4" />
                  <span className="font-medium">{mapLayers[currentLayer].name}</span>
                  <span className="text-lg">{mapLayers[currentLayer].icon}</span>
                </button>
                {showLayerSelector && (
                  <div
                    className={`
                      absolute top-full mt-3 left-0 right-0 rounded-xl shadow-2xl border backdrop-blur-md
                      ${isDarkMode ? "bg-slate-800/95 border-slate-600/50" : "bg-white/95 border-gray-200/50"}
                      transform transition-all duration-300 ease-out
                    `}
                  >
                    {Object.entries(mapLayers).map(([key, layer]) => (
                      <button
                        key={key}
                        onClick={() => changeLayer(key)}
                        className={`
                          w-full text-left px-4 py-3 flex items-center space-x-3
                          transition-all duration-200 first:rounded-t-xl last:rounded-b-xl
                          ${
                            currentLayer === key
                              ? isDarkMode
                                ? "bg-blue-600/20 text-blue-400 border-l-4 border-blue-400"
                                : "bg-blue-100 text-blue-600 border-l-4 border-blue-500"
                              : isDarkMode
                              ? "text-slate-200 hover:bg-slate-700/50"
                              : "text-gray-700 hover:bg-gray-100/50"
                          }
                        `}
                      >
                        <span className="text-lg">{layer.icon}</span>
                        <span className="font-medium">{layer.name}</span>
                        {currentLayer === key && (
                          <div className="ml-auto w-2 h-2 rounded-full bg-current animate-pulse"></div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="absolute top-6 right-6 flex flex-col space-y-3 z-[1000]">
              {[
                { icon: ZoomIn, action: handleZoomIn, label: "Zoom In" },
                { icon: ZoomOut, action: handleZoomOut, label: "Zoom Out" },
                { icon: RotateCcw, action: handleResetView, label: "Reset View" },
              ].map(({ icon: Icon, action, label }, index) => (
                <button
                  key={label}
                  onClick={action}
                  title={label}
                  className={`
                    p-3 rounded-xl shadow-xl border backdrop-blur-md group
                    transition-all duration-300 hover:scale-110 transform active:scale-95
                    ${isDarkMode ? "bg-slate-800/90 text-slate-200 border-slate-600/50 hover:bg-slate-700/90 hover:border-blue-400/50" : "bg-white/90 text-gray-600 border-gray-200/50 hover:bg-gray-50/90 hover:border-blue-300/50"}
                  `}
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <Icon className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" />
                </button>
              ))}
            </div>
            <div
              className={`
                absolute bottom-6 left-6 p-4 rounded-xl shadow-xl backdrop-blur-md border
                ${isDarkMode ? "bg-slate-800/95 border-slate-600/50" : "bg-white/95 border-gray-200/50"}
                transform transition-all duration-500
              `}
            >
              <div className="space-y-3">
                <h4
                  className={`
                    text-sm font-bold flex items-center space-x-2
                    ${isDarkMode ? "text-slate-200" : "text-gray-800"}
                  `}
                >
                  <Activity className="w-4 h-4" />
                  <span>Device Status</span>
                </h4>
                <div className="space-y-2">
                  {[
                    {
                      status: "Online",
                      color: "bg-emerald-500",
                      count: devices.filter((d) => d.status === "online").length,
                      icon: Wifi,
                    },
                    {
                      status: "Offline",
                      color: "bg-red-500",
                      count: devices.filter((d) => d.status === "offline").length,
                      icon: WifiOff,
                    },
                    {
                      status: "Active",
                      color: "bg-amber-500",
                      count: devices.filter((d) => d.status === "active").length,
                      icon: Activity,
                    },
                  ].map(({ status, color, count, icon: StatusIcon }) => (
                    <div
                      key={status}
                      className="flex items-center justify-between space-x-3"
                    >
                      <div className="flex items-center space-x-2">
                        <div
                          className={`
                            w-3 h-3 ${color} rounded-full shadow-sm
                            ${status === "Active" ? "animate-pulse" : ""}
                          `}
                        ></div>
                        <StatusIcon className="w-3 h-3 opacity-60" />
                        <span
                          className={`text-sm ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}
                        >
                          {status}
                        </span>
                      </div>
                      <span
                        className={`
                          text-sm font-bold px-2 py-1 rounded-full
                          ${isDarkMode ? "bg-slate-700 text-white" : "bg-gray-100 text-slate-800"}
                        `}
                      >
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div
              className={`
                absolute top-6 left-6 p-3 rounded-xl shadow-xl backdrop-blur-md border
                ${isDarkMode ? "bg-slate-800/95 border-slate-600/50" : "bg-white/95 border-gray-200/50"}
                transform transition-all duration-500
              `}
            >
              <div className="space-y-2">
                <div
                  className={`
                    font-semibold text-sm flex items-center space-x-2
                    ${isDarkMode ? "text-blue-400" : "text-blue-600"}
                  `}
                >
                  <Map className="w-4 h-4" />
                  <span>Live Network</span>
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                </div>
                <div
                  className={`text-xs space-y-1 ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}
                >
                  <div className="flex justify-between">
                    <span>Total Devices:</span>
                    <span
                      className={`font-bold ${isDarkMode ? "text-white" : "text-slate-800"}`}
                    >
                      {devices.length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Online:</span>
                    <span className="font-bold text-emerald-500">
                      {devices.filter((d) => d.status === "online").length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Coverage:</span>
                    <span
                      className={`font-bold ${isDarkMode ? "text-blue-400" : "text-blue-600"}`}
                    >
                      {devices.length > 0 ? Math.round(
                        (devices.filter((d) => d.status !== "offline").length / devices.length) * 100
                      ) : 0}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
        {hoveredDevice && popupPosition && (
          <DevicePopup
            device={hoveredDevice}
            isDarkMode={isDarkMode}
            onFeatureToggle={handleFeatureToggle}
            position={{ x: popupPosition.x, y: popupPosition.y }}
            placement={popupPosition.placement}
            onMouseEnter={handlePopupMouseEnter}
            onMouseLeave={handlePopupMouseLeave}
          />
        )}
        {showLayerSelector && (
          <div
            className="absolute inset-0 z-[999]"
            onClick={() => setShowLayerSelector(false)}
          />
        )}
        <style jsx>{`
          .custom-marker-icon {
            transition: filter 0.3s ease, z-index 0.3s ease !important;
            transform-origin: center center !important;
            cursor: pointer !important;
          }
          .custom-marker-icon:hover {
            filter: brightness(1.2) drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3)) !important;
          }
          .leaflet-marker-icon {
            margin-left: -20px !important;
            margin-top: -20px !important;
          }
          .leaflet-zoom-animated {
            transition: transform 0.25s cubic-bezier(0, 0, 0.25, 1) !important;
          }
          .leaflet-popup {
            pointer-events: none !important;
          }
          .leaflet-popup-content-wrapper {
            pointer-events: auto !important;
          }
          .popup-container {
            transition: opacity 0.2s ease, transform 0.2s ease !important;
          }
          .leaflet-container {
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            user-select: none;
          }
        `}</style>
      </div>
    );
  }
);

// Main component wrapper
const InteractiveMap = memo(({ isDarkMode = false, devices = [], onFeatureToggle }) => {
  const [hoveredDevice, setHoveredDevice] = useState(null);

  // FIXED: Enhanced feature toggle with proper error handling
  const handleFeatureToggle = useCallback(async (deviceId, feature) => {
    if (onFeatureToggle) {
      try {
        console.log(`🎛️ Toggling ${feature} for device ${deviceId}`);
        await onFeatureToggle(deviceId, feature);
      } catch (error) {
        console.error(`❌ Failed to toggle ${feature} for device ${deviceId}:`, error);
        // Could add user notification here
      }
    } else {
      // Fallback for standalone usage
      console.log(`Feature ${feature} toggled for device ${deviceId}`);
    }
  }, [onFeatureToggle]);

  useEffect(() => {
    return () => {
      if (window.L && window.leafletMapRef && window.leafletMapRef.current) {
        try {
          window.leafletMapRef.current.remove();
        } catch (error) {
          console.warn("Error during map cleanup:", error);
        }
      }
    };
  }, []);

  return (
    <div className="h-full w-full relative">
      <ProfessionalLeafletMap
        devices={devices}
        isDarkMode={isDarkMode}
        hoveredDevice={hoveredDevice}
        setHoveredDevice={setHoveredDevice}
        handleFeatureToggle={handleFeatureToggle}
      />
    </div>
  );
});

DevicePopup.displayName = "DevicePopup";
ProfessionalLeafletMap.displayName = "ProfessionalLeafletMap";
InteractiveMap.displayName = "InteractiveMap";

export default InteractiveMap;