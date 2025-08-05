# SCORM Merge Deployment Guide

This guide provides instructions for deploying the SCORM Merge application on a Linux machine using pre-built container images from GitHub Container Registry.

## Prerequisites

- Linux machine with Docker and Docker Compose installed
- Internet connection to pull images from GHCR
- Minimum 2GB RAM recommended
- At least 5GB free disk space

## Quick Deployment

### Option 1: Using Docker Compose (Recommended)

1. **Download the deployment configuration:**
   ```bash
   wget https://raw.githubusercontent.com/ndsrf/scorm-merge/main/docker-compose.deploy.yml
   ```
   
   Or create `docker-compose.deploy.yml` with the following content:
   ```yaml
   version: '3.8'

   services:
     frontend:
       image: ghcr.io/ndsrf/scorm-merge/scorm-merge-frontend:main
       ports:
         - "80:80"
       depends_on:
         - backend
       networks:
         - scorm-network
       restart: unless-stopped
       healthcheck:
         test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost/"]
         interval: 30s
         timeout: 10s
         retries: 3

     backend:
       image: ghcr.io/ndsrf/scorm-merge/scorm-merge-backend:main
       ports:
         - "5000:5000"
       volumes:
         - uploads:/app/uploads
         - temp:/app/temp
       networks:
         - scorm-network
       restart: unless-stopped
       healthcheck:
         test: ["CMD", "node", "-e", "const http = require('http'); const options = { hostname: 'localhost', port: 5000, path: '/health', timeout: 2000 }; const req = http.request(options, (res) => { res.statusCode === 200 ? process.exit(0) : process.exit(1); }); req.on('error', () => process.exit(1)); req.end();"]
         interval: 30s
         timeout: 10s
         retries: 3

   networks:
     scorm-network:
       driver: bridge

   volumes:
     uploads:
     temp:
   ```

2. **Deploy the application:**
   ```bash
   docker-compose -f docker-compose.deploy.yml up -d
   ```

3. **Access the application:**
   - Frontend: http://your-server-ip (port 80)
   - Backend API: http://your-server-ip:5000

### Option 2: Using the Full Application Image

For a simpler deployment with a single container:

```bash
docker run -d \
  --name scorm-merge \
  -p 80:5000 \
  -v scorm_uploads:/app/uploads \
  -v scorm_temp:/app/temp \
  --restart unless-stopped \
  ghcr.io/ndsrf/scorm-merge/scorm-merge-full:main
```

Access the application at: http://your-server-ip

## Production Deployment Considerations

### 1. Use Specific Version Tags

Instead of using `:main`, pin to specific version tags for production:

```yaml
services:
  frontend:
    image: ghcr.io/ndsrf/scorm-merge/scorm-merge-frontend:v1.0.0
  backend:
    image: ghcr.io/ndsrf/scorm-merge/scorm-merge-backend:v1.0.0
```

### 2. Configure Reverse Proxy (Optional)

For production with SSL, use nginx or traefik as a reverse proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /api/ {
        proxy_pass http://localhost:5000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 3. Firewall Configuration

Open required ports:
```bash
# For separate frontend/backend deployment
sudo ufw allow 80    # Frontend
sudo ufw allow 5000  # Backend API

# For full application deployment
sudo ufw allow 80    # Application
```

### 4. Persistent Storage

The deployment creates Docker volumes for uploads and temporary files. To use host directories instead:

```yaml
volumes:
  - ./uploads:/app/uploads
  - ./temp:/app/temp
```

## Management Commands

### Start the application:
```bash
docker-compose -f docker-compose.deploy.yml up -d
```

### Stop the application:
```bash
docker-compose -f docker-compose.deploy.yml down
```

### View logs:
```bash
docker-compose -f docker-compose.deploy.yml logs -f
```

### Update to latest images:
```bash
docker-compose -f docker-compose.deploy.yml pull
docker-compose -f docker-compose.deploy.yml up -d
```

### Check application health:
```bash
docker-compose -f docker-compose.deploy.yml ps
```

## Troubleshooting

### Check container status:
```bash
docker ps
```

### View container logs:
```bash
docker logs scorm-merge-frontend-1
docker logs scorm-merge-backend-1
```

### Test connectivity:
```bash
# Test backend health
curl http://localhost:5000/health

# Test frontend
curl http://localhost/
```

### Cleanup (if needed):
```bash
# Stop and remove containers
docker-compose -f docker-compose.deploy.yml down

# Remove volumes (WARNING: This deletes uploaded files)
docker-compose -f docker-compose.deploy.yml down -v

# Remove images
docker rmi ghcr.io/ndsrf/scorm-merge/scorm-merge-frontend:main
docker rmi ghcr.io/ndsrf/scorm-merge/scorm-merge-backend:main
```

## Available Images

- **Frontend**: `ghcr.io/ndsrf/scorm-merge/scorm-merge-frontend:main`
- **Backend**: `ghcr.io/ndsrf/scorm-merge/scorm-merge-backend:main`  
- **Full Application**: `ghcr.io/ndsrf/scorm-merge/scorm-merge-full:main`

All images support both `linux/amd64` and `linux/arm64` architectures.

## Security Notes

- Images are scanned for vulnerabilities using Trivy
- No authentication is required to pull public images
- Consider setting up HTTPS for production deployments
- Review and configure appropriate firewall rules