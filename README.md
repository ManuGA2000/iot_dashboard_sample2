# ELPRO IoT Dashboard - Production Deployment Guide

## 🎯 Project Overview

**ELPRO IoT Dashboard** is a complete production-ready IoT device management platform deployed on AWS infrastructure. The system enables real-time monitoring and control of IoT devices through a modern web interface with AWS IoT Core integration.

### Architecture
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React Client  │◄──►│   EC2 + Nginx    │◄──►│  Node.js API    │
│   (Frontend)    │    │   (Web Server)   │    │   (Backend)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                       │
                                │                       ▼
                                │              ┌─────────────────┐
                                │              │   AWS IoT Core  │
                                │              │     (MQTT)      │
                                │              └─────────────────┘
                                │                       │
                                ▼                       ▼
                    ┌─────────────────────────────────────────────┐
                    │           IoT Devices Network               │
                    │    (ESP32/Arduino with Relay Controls)     │
                    └─────────────────────────────────────────────┘
```

---

## 🏗️ Complete Infrastructure Setup

### 1. AWS EC2 Instance Configuration
- **Instance Type**: t2.micro (Free Tier)
- **Operating System**: Amazon Linux 2023
- **Region**: ap-south-1 (Mumbai)
- **Instance ID**: `i-0584ec731f6ed579a`
- **Public IP**: `35.171.161.165`
- **Key Pair**: `elpro-keys.pem`

### 2. Security Groups
```
Inbound Rules:
- Port 22 (SSH): 0.0.0.0/0
- Port 80 (HTTP): 0.0.0.0/0
- Port 443 (HTTPS): 0.0.0.0/0
- Port 5000 (Backend API): 0.0.0.0/0
- Port 5001 (WebSocket): 0.0.0.0/0
```

### 3. AWS IoT Core Setup
- **Endpoint**: `anml6aq0atkl2-ats.iot.ap-south-1.amazonaws.com`
- **Certificates**: Device certificates for secure MQTT communication
- **Topics**: Device-specific MQTT topics for relay control and status updates

---

## 📦 Software Stack

### Frontend (React)
- **Framework**: React 18
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Maps**: Leaflet.js
- **Build Tool**: Create React App

### Backend (Node.js)
- **Runtime**: Node.js 18.20.8
- **Framework**: Express.js
- **WebSocket**: ws library
- **AWS SDK**: AWS SDK v2
- **MQTT**: mqtt.js
- **Process Manager**: PM2

### Infrastructure
- **Web Server**: Nginx 1.26.3
- **SSL/TLS**: Ready for Let's Encrypt
- **Process Management**: PM2 with auto-restart
- **Reverse Proxy**: Nginx handling API and WebSocket proxying

---

## 🚀 Initial Deployment Process

### Step 1: EC2 Instance Setup
```bash
# Connect to EC2
ssh -i "elpro-keys.pem" ec2-user@35.171.161.165

# Update system
sudo yum update -y

# Install Node.js 18
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install Nginx
sudo yum install -y nginx
```

### Step 2: Backend Deployment
```bash
# Create project directory
mkdir -p /home/ec2-user/elpro-backend
cd /home/ec2-user/elpro-backend

# Create package.json and install dependencies
npm install express cors aws-sdk mqtt ws uuid dotenv lodash

# Upload server.js and certificates
# Deploy .env configuration
# Deploy IoT certificates (pri.pem.key, certi.pem.crt, AmazonRootCA1.pem)
```

### Step 3: Frontend Build and Deploy
```bash
# On local machine
cd C:\Users\ADMIN\my-react-app\frontend
npm run build

# Create deployment package
tar -czf frontend-build.tar.gz -C build .

# Upload to EC2
scp -i "../elpro-keys.pem" frontend-build.tar.gz ec2-user@35.171.161.165:/home/ec2-user/

# Deploy to nginx
sudo cp -r * /usr/share/nginx/html/
sudo chown -R nginx:nginx /usr/share/nginx/html/
```

### Step 4: Nginx Configuration
```nginx
# /etc/nginx/conf.d/elpro.conf
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Handle React Router
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy to backend
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket proxy
    location /ws {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Cache control for static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1h;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # No cache for HTML files
    location ~* \.html$ {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        try_files $uri =404;
    }
}
```

### Step 5: Process Management Setup
```bash
# Start backend with PM2
pm2 start server.js --name "elpro-backend"

# Setup auto-start on boot
pm2 startup
pm2 save

# Start and enable nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## 🔄 Code Update & Deployment Workflow

### Frontend Updates

#### 1. Local Development
```bash
# Navigate to frontend directory
cd C:\Users\ADMIN\my-react-app\frontend

# Make your code changes in src/

# Update environment variables if needed
notepad .env
```

#### 2. Environment Configuration
```env
# .env file content
REACT_APP_BACKEND_URL=
REACT_APP_WS_URL=ws://35.171.161.165/ws
GENERATE_SOURCEMAP=false
```

#### 3. Build and Deploy
```bash
# Clean and rebuild
Remove-Item -Recurse -Force build -ErrorAction SilentlyContinue
npm run build

# Create deployment package
tar -czf frontend-updated.tar.gz -C build .

# Upload to EC2
scp -i "../elpro-keys.pem" frontend-updated.tar.gz ec2-user@35.171.161.165:/home/ec2-user/
```

#### 4. Deploy on EC2
```bash
# SSH to EC2
ssh -i "elpro-keys.pem" ec2-user@35.171.161.165

# Create temporary directory for clean deployment
mkdir -p ~/temp-frontend
cd ~/temp-frontend

# Extract new build
tar -xzf ~/frontend-updated.tar.gz

# Deploy to nginx (clean deployment)
sudo rm -rf /usr/share/nginx/html/*
sudo cp -r * /usr/share/nginx/html/
sudo chown -R nginx:nginx /usr/share/nginx/html/

# Clean up
cd ~
rm -rf ~/temp-frontend ~/frontend-updated.tar.gz

# Verify deployment
ls -la /usr/share/nginx/html/static/js/
```

### Backend Updates

#### 1. Local Changes
```bash
# Make changes to server.js or other backend files
# Update dependencies in package.json if needed
```

#### 2. Deploy Backend Updates
```bash
# Upload updated server.js
scp -i "../elpro-keys.pem" elpro-backend\server.js ec2-user@35.171.161.165:/home/ec2-user/elpro-backend/

# Upload updated .env if changed
scp -i "../elpro-keys.pem" elpro-backend\.env ec2-user@35.171.161.165:/home/ec2-user/elpro-backend/
```

#### 3. Restart Backend Service
```bash
# SSH to EC2
ssh -i "elpro-keys.pem" ec2-user@35.171.161.165

# Navigate to backend directory
cd /home/ec2-user/elpro-backend

# Restart PM2 process
pm2 restart elpro-backend

# Check status
pm2 status
pm2 logs elpro-backend
```

### Dependencies Updates

#### Frontend Dependencies
```bash
# Update package.json locally
npm install new-package

# After building and deploying, no additional steps needed
```

#### Backend Dependencies
```bash
# SSH to EC2
cd /home/ec2-user/elpro-backend

# Install new dependencies
npm install new-package

# Restart process
pm2 restart elpro-backend
```

---

## 🛠️ Environment Configuration

### Frontend Environment Variables
```env
# Development
REACT_APP_BACKEND_URL=http://localhost:5000
REACT_APP_WS_URL=ws://localhost:5001

# Production (deployed on EC2)
REACT_APP_BACKEND_URL=
REACT_APP_WS_URL=ws://35.171.161.165/ws
GENERATE_SOURCEMAP=false
```

### Backend Environment Variables
```env
# AWS Configuration
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=AKIA52UMIPHGBEMDSJID
AWS_SECRET_ACCESS_KEY=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

# AWS IoT Configuration
AWS_IOT_ENDPOINT=anml6aq0atkl2-ats.iot.ap-south-1.amazonaws.com

# Certificate Paths
AWS_IOT_PRIVATE_KEY_PATH=./certs/pri.pem.key
AWS_IOT_CERTIFICATE_PATH=./certs/certi.pem.crt
AWS_IOT_CA_CERTIFICATE_PATH=./certs/AmazonRootCA1.pem

# Server Configuration
PORT=5000
WS_PORT=5001
NODE_ENV=production
```

---

## 🔍 Monitoring & Troubleshooting

### System Status Commands
```bash
# Check PM2 processes
pm2 status
pm2 logs elpro-backend

# Check Nginx status
sudo systemctl status nginx
sudo nginx -t

# Check system resources
htop
df -h
free -m

# Check network connections
sudo netstat -tlnp | grep :5000
sudo netstat -tlnp | grep :5001
sudo netstat -tlnp | grep :80
```

### Log Monitoring
```bash
# Backend logs
pm2 logs elpro-backend --lines 50

# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Nginx error logs
sudo tail -f /var/log/nginx/error.log

# System logs
sudo journalctl -f -u nginx
```

### Common Issues & Solutions

#### Frontend Not Loading
```bash
# Check nginx status
sudo systemctl status nginx

# Verify files are deployed
ls -la /usr/share/nginx/html/

# Check nginx configuration
sudo nginx -t
```

#### API Not Working
```bash
# Check backend process
pm2 status

# Test API directly
curl http://localhost:5000/api/health

# Check backend logs
pm2 logs elpro-backend
```

#### WebSocket Connection Failed
```bash
# Test WebSocket proxy
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://localhost/ws

# Check nginx configuration
grep -A 10 "location /ws" /etc/nginx/conf.d/elpro.conf
```

---

## 📡 API Endpoints

### Health Check
```http
GET /api/health
Response: {"status":"healthy","aws":"connected","mqtt":true}
```

### Device Management
```http
GET /api/iot/things                    # List registered devices
GET /api/iot/available-things          # List unregistered AWS IoT things
POST /api/iot/register-thing           # Register existing thing
DELETE /api/iot/things/:thingName      # Unregister thing
```

### Device Control
```http
POST /api/iot/command                  # Send MQTT command
POST /api/iot/scenario                 # Execute scenario
POST /api/iot/sync-status/:deviceId    # Manual status sync
POST /api/iot/refresh-all-status       # Refresh all device status
POST /api/iot/manual-status-update/:deviceId  # Manual status update
```

### Groups & Statistics
```http
GET /api/groups                        # List groups
POST /api/groups                       # Create group
GET /api/statistics                    # System statistics
GET /api/history                       # Status history
```

---

## 🔒 Security Configuration

### AWS IAM Permissions
The `iot-application` user has the following policies:
- IoT Core full access
- Certificate management
- MQTT publish/subscribe permissions

### SSL/TLS Setup (Optional)
```bash
# Install Certbot for Let's Encrypt
sudo yum install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### Firewall Configuration
```bash
# Check current iptables rules
sudo iptables -L

# Basic firewall setup (if needed)
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
```

---

## 🚀 Access URLs

- **Production Dashboard**: http://35.171.161.165
- **API Health Check**: http://35.171.161.165/api/health
- **WebSocket Endpoint**: ws://35.171.161.165/ws

---

## 📋 Quick Deployment Checklist

### For Frontend Updates:
- [ ] Make code changes locally
- [ ] Update .env if needed
- [ ] Run `npm run build`
- [ ] Create tar package
- [ ] Upload to EC2
- [ ] Deploy to nginx directory
- [ ] Clear browser cache and test

### For Backend Updates:
- [ ] Make code changes locally
- [ ] Upload server.js to EC2
- [ ] Update dependencies if needed
- [ ] Restart PM2 process
- [ ] Check logs for errors

### For Infrastructure Changes:
- [ ] Update nginx configuration
- [ ] Test nginx config with `sudo nginx -t`
- [ ] Restart nginx service
- [ ] Monitor logs for issues

---

## 🏆 Achievement Summary

✅ **Complete IoT Platform**: Production-ready dashboard with real-time device management  
✅ **AWS Integration**: Full AWS IoT Core integration with MQTT communication  
✅ **Scalable Architecture**: Nginx reverse proxy with PM2 process management  
✅ **Real-time Updates**: WebSocket implementation for live device status  
✅ **Responsive Design**: Modern React interface with Tailwind CSS  
✅ **Production Deployment**: EC2 hosting with auto-restart capabilities  
✅ **Security**: AWS IAM integration with certificate-based authentication  
✅ **Monitoring**: Comprehensive logging and status monitoring  

**Total Development Time**: Comprehensive full-stack IoT solution deployed in production  
**Technologies Mastered**: React, Node.js, AWS IoT, Nginx, PM2, WebSockets, MQTT

---

*This deployment guide ensures your ELPRO IoT Dashboard remains maintainable and scalable for future enhancements.*





# ELPRO IoT Dashboard - Complete Step-by-Step Deployment Guide

## 🎯 What We Achieved
**Deployed a complete production-ready IoT Dashboard accessible at: http://35.171.161.165**

✅ **Frontend**: React dashboard with real-time controls  
✅ **Backend**: Node.js API with AWS IoT integration  
✅ **Real-time Communication**: WebSocket for live updates  
✅ **Production Hosting**: EC2 + Nginx + PM2  
✅ **AWS IoT Integration**: MQTT device communication  

---

## 📋 Prerequisites Setup

### 1. AWS Account & Credentials
```bash
# Configured AWS CLI with credentials:
AWS_ACCESS_KEY_ID=AKIA52UMIPHGBEMDSJID
AWS_SECRET_ACCESS_KEY=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
AWS_REGION=ap-south-1
```

### 2. AWS EC2 Instance Created
- **Instance Type**: t2.micro (Free Tier)
- **OS**: Amazon Linux 2023
- **Region**: ap-south-1 (Mumbai)
- **Instance ID**: `i-0584ec731f6ed579a`
- **Public IP**: `35.171.161.165`
- **Key Pair**: `elpro-keys.pem`

### 3. Security Group Configuration
```
Inbound Rules:
- SSH (22): 0.0.0.0/0
- HTTP (80): 0.0.0.0/0
- Custom TCP (5000): 0.0.0.0/0  [Backend API]
- Custom TCP (5001): 0.0.0.0/0  [WebSocket]
```

### 4. AWS IoT Core Setup
- **Endpoint**: `anml6aq0atkl2-ats.iot.ap-south-1.amazonaws.com`
- **Certificates**: Generated and downloaded
  - `pri.pem.key` (Private key)
  - `certi.pem.crt` (Certificate)
  - `AmazonRootCA1.pem` (Root CA)

---

## 🛠️ Step-by-Step Deployment Process

### STEP 1: Connect to EC2 Instance
```powershell
# From Windows PowerShell in project directory
cd C:\Users\ADMIN\my-react-app
ssh -i "elpro-keys.pem" ec2-user@35.171.161.165
```

### STEP 2: Update System & Install Node.js
```bash
# Update Amazon Linux
sudo yum update -y

# Install Node.js 18.x
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Verify installation
node --version  # v18.20.8
npm --version   # 10.8.2
```

### STEP 3: Install PM2 Process Manager
```bash
# Install PM2 globally
sudo npm install -g pm2

# Verify installation
pm2 --version  # 6.0.8
```

### STEP 4: Create Backend Project Structure
```bash
# Create project directory
mkdir -p /home/ec2-user/elpro-backend
cd /home/ec2-user/elpro-backend

# Create package.json
cat > package.json << 'EOF'
{
  "name": "elpro-backend",
  "version": "1.0.0",
  "description": "ELPRO IoT Backend Server",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "aws-sdk": "^2.1490.0",
    "mqtt": "^5.1.2",
    "ws": "^8.14.2",
    "uuid": "^9.0.1",
    "dotenv": "^16.3.1",
    "lodash": "^4.17.21"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF

# Install dependencies
npm install
```

### STEP 5: Create Environment Configuration
```bash
# Create .env file
cat > .env << 'EOF'
# AWS Configuration
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=AKIA52UMIPHGBEMDSJID
AWS_SECRET_ACCESS_KEY=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

# AWS IoT Configuration
AWS_IOT_ENDPOINT=anml6aq0atkl2-ats.iot.ap-south-1.amazonaws.com

# Certificate file paths
AWS_IOT_PRIVATE_KEY_PATH=./certs/pri.pem.key
AWS_IOT_CERTIFICATE_PATH=./certs/certi.pem.crt
AWS_IOT_CA_CERTIFICATE_PATH=./certs/AmazonRootCA1.pem

# Server Configuration
PORT=5000
WS_PORT=5001
NODE_ENV=production
EOF

# Create certificates directory
mkdir -p certs
```

### STEP 6: Upload Backend Files from Windows
```powershell
# From Windows PowerShell in project directory
cd C:\Users\ADMIN\my-react-app

# Upload server.js
scp -i "elpro-keys.pem" elpro-backend\server.js ec2-user@35.171.161.165:/home/ec2-user/elpro-backend/

# Upload certificates
scp -i "elpro-keys.pem" elpro-backend\certs\pri.pem.key ec2-user@35.171.161.165:/home/ec2-user/elpro-backend/certs/
scp -i "elpro-keys.pem" elpro-backend\certs\certi.pem.crt ec2-user@35.171.161.165:/home/ec2-user/elpro-backend/certs/
scp -i "elpro-keys.pem" elpro-backend\certs\AmazonRootCA1.pem ec2-user@35.171.161.165:/home/ec2-user/elpro-backend/certs/
```

### STEP 7: Set Certificate Permissions & Test Backend
```bash
# Set secure permissions for certificates
chmod 600 certs/*

# Test server startup
node server.js
# Should show: "🚀 ELPRO AWS IoT Backend Server running on port 5000"
# Press Ctrl+C to stop

# Start with PM2
pm2 start server.js --name "elpro-backend"

# Verify PM2 status
pm2 status
# Should show: status: online

# Test API
curl http://localhost:5000/api/health
# Should return: {"status":"healthy","aws":"connected","mqtt":true}
```

### STEP 8: Install & Configure Nginx
```bash
# Install Nginx
sudo yum install -y nginx

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Verify Nginx is running
sudo systemctl status nginx
```

### STEP 9: Configure Frontend for Production
```powershell
# In Windows PowerShell
cd C:\Users\ADMIN\my-react-app\frontend

# Create production environment configuration
@"
REACT_APP_BACKEND_URL=
REACT_APP_WS_URL=ws://35.171.161.165/ws
GENERATE_SOURCEMAP=false
"@ | Out-File -FilePath ".env" -Encoding UTF8

# Build production frontend
npm run build
```

### STEP 10: Upload & Deploy Frontend
```powershell
# Create deployment package
tar -czf frontend-build.tar.gz -C build .

# Upload to EC2
scp -i "../elpro-keys.pem" frontend-build.tar.gz ec2-user@35.171.161.165:/home/ec2-user/
```

```bash
# On EC2: Deploy frontend files
mkdir -p ~/temp-frontend
cd ~/temp-frontend
tar -xzf ~/frontend-build.tar.gz

# Deploy to nginx directory
sudo rm -rf /usr/share/nginx/html/*
sudo cp -r * /usr/share/nginx/html/
sudo chown -R nginx:nginx /usr/share/nginx/html/

# Clean up
cd ~
rm -rf ~/temp-frontend ~/frontend-build.tar.gz
```

### STEP 11: Configure Nginx Reverse Proxy
```bash
# Create Nginx configuration
sudo tee /etc/nginx/conf.d/elpro.conf > /dev/null << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Handle React Router
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy to backend
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket proxy
    location /ws {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Cache control for static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1h;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # No cache for HTML files
    location ~* \.html$ {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        try_files $uri =404;
    }
}
EOF

# Test and restart Nginx
sudo nginx -t
sudo systemctl restart nginx
```

### STEP 12: Setup Auto-start Services
```bash
# Configure PM2 to start on boot
pm2 startup
# Copy and run the generated command, example:
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ec2-user --hp /home/ec2-user

# Save PM2 process list
pm2 save

# Verify Nginx starts on boot (already enabled)
sudo systemctl is-enabled nginx
```

### STEP 13: Fix Frontend Backend Connection Issue
**Problem Identified**: Frontend was hardcoded to connect to `http://localhost:5000`

```powershell
# Edit realTimeService.js
notepad src\services\realTimeService.js

# Change line 11 from:
# this.backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';
# To:
# this.backendUrl = process.env.REACT_APP_BACKEND_URL || '';

# Rebuild and redeploy
npm run build
tar -czf frontend-fixed.tar.gz -C build .
scp -i "../elpro-keys.pem" frontend-fixed.tar.gz ec2-user@35.171.161.165:/home/ec2-user/
```

```bash
# Deploy the fix
mkdir -p ~/temp-frontend-fix
cd ~/temp-frontend-fix
tar -xzf ~/frontend-fixed.tar.gz
sudo rm -rf /usr/share/nginx/html/*
sudo cp -r * /usr/share/nginx/html/
sudo chown -R nginx:nginx /usr/share/nginx/html/
cd ~
rm -rf ~/temp-frontend-fix ~/frontend-fixed.tar.gz
```

### STEP 14: Final Testing & Verification
```bash
# Test all services
pm2 status                              # Backend should be online
sudo systemctl status nginx            # Nginx should be active
curl http://localhost/api/health        # API should return healthy status

# Monitor logs
sudo tail -f /var/log/nginx/access.log  # Check incoming requests
pm2 logs elpro-backend                 # Check backend logs
```

**Final Verification**: Open browser → `http://35.171.161.165`
- ✅ Dashboard loads successfully
- ✅ API connection successful
- ✅ WebSocket connected
- ✅ Real-time functionality working

---

## 🏆 Final Result: Production-Ready IoT Dashboard

### **Live URLs:**
- **Main Dashboard**: http://35.171.161.165
- **API Health Check**: http://35.171.161.165/api/health
- **WebSocket Endpoint**: ws://35.171.161.165/ws

### **Services Running:**
```bash
# Check all services status
pm2 status                    # elpro-backend: online
sudo systemctl status nginx  # nginx: active (running)
sudo netstat -tlnp | grep :80    # nginx listening on port 80
sudo netstat -tlnp | grep :5000  # backend listening on port 5000
sudo netstat -tlnp | grep :5001  # websocket listening on port 5001
```

### **Auto-restart Configuration:**
- ✅ PM2 starts backend automatically on server reboot
- ✅ Nginx starts automatically on server reboot
- ✅ SSL certificates ready for domain setup
- ✅ Production-grade reverse proxy configuration

---

## 🔄 How to Update Code in Future

### **Frontend Updates:**
```powershell
# 1. Make changes in src/
# 2. Update .env if needed:
REACT_APP_BACKEND_URL=
REACT_APP_WS_URL=ws://35.171.161.165/ws
GENERATE_SOURCEMAP=false

# 3. Build and deploy:
npm run build
tar -czf frontend-update.tar.gz -C build .
scp -i "../elpro-keys.pem" frontend-update.tar.gz ec2-user@35.171.161.165:/home/ec2-user/

# 4. Deploy on EC2:
mkdir -p ~/temp-update && cd ~/temp-update
tar -xzf ~/frontend-update.tar.gz
sudo rm -rf /usr/share/nginx/html/*
sudo cp -r * /usr/share/nginx/html/
sudo chown -R nginx:nginx /usr/share/nginx/html/
cd ~ && rm -rf ~/temp-update ~/frontend-update.tar.gz
```

### **Backend Updates:**
```powershell
# 1. Upload updated server.js
scp -i "elpro-keys.pem" elpro-backend\server.js ec2-user@35.171.161.165:/home/ec2-user/elpro-backend/

# 2. Restart PM2 process
ssh -i "elpro-keys.pem" ec2-user@35.171.161.165
pm2 restart elpro-backend
pm2 logs elpro-backend  # Check for errors
```

---

## 📊 Technical Architecture Summary

```
Internet → Nginx (Port 80) → React App (Static Files)
                          ↓
                     API Proxy (/api/*) → Node.js Backend (Port 5000)
                          ↓
                     WebSocket Proxy (/ws) → WebSocket Server (Port 5001)
                          ↓
                     AWS IoT Core ← MQTT → IoT Devices
```

**Total Deployment Time**: ~2 hours (including troubleshooting)  
**Technologies Used**: React, Node.js, Nginx, PM2, AWS IoT Core, WebSockets, MQTT  
**Infrastructure**: AWS EC2 t2.micro with production-grade configuration  
**Result**: Fully functional IoT dashboard ready for commercial use! 🎉