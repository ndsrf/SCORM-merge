# Docker Deployment Guide

This document explains how to run the SCORM Package Merger application using Docker containers.

## Prerequisites

- Docker Engine 20.10 or higher
- Docker Compose 2.0 or higher
- At least 2GB of available RAM
- At least 5GB of free disk space

## Quick Start

### Option 1: Using Docker Compose (Recommended)

1. **Clone and navigate to the project:**
   ```bash
   git clone <repository-url>
   cd SCORM-merge
   ```

2. **Build and start all services:**
   ```bash
   npm run docker:dev
   ```
   
   Or using Docker Compose directly:
   ```bash
   docker-compose up --build
   ```

3. **Access the application:**
   - Open http://localhost in your web browser
   - The application will be ready when both services show as healthy

4. **Stop the application:**
   ```bash
   npm run docker:down
   ```

### Option 2: Build Individual Containers

1. **Build backend container:**
   ```bash
   docker build -f Dockerfile.backend -t SCORM-merger-backend .
   ```

2. **Build frontend container:**
   ```bash
   docker build -f Dockerfile.frontend -t SCORM-merger-frontend .
   ```

3. **Run with custom network:**
   ```bash
   docker network create SCORM-network
   docker run -d --name backend --network SCORM-network -p 5000:5000 SCORM-merger-backend
   docker run -d --name frontend --network SCORM-network -p 80:80 SCORM-merger-frontend
   ```

## Available Docker Commands

The following npm scripts are available for Docker operations:

| Command | Description |
|---------|-------------|
| `npm run docker:build` | Build all Docker images |
| `npm run docker:up` | Start containers in detached mode |
| `npm run docker:down` | Stop and remove containers |
| `npm run docker:logs` | View logs from all containers |
| `npm run docker:dev` | Build and start containers (development) |
| `npm run docker:clean` | Stop containers and remove volumes/images |

## Architecture

The Docker setup consists of two main services:

### Backend Service (`SCORM-merger-backend`)
- **Base Image:** `node:18-alpine`
- **Port:** 5000
- **Health Check:** `http://localhost:5000/health`
- **Volumes:** 
  - `backend_uploads:/app/uploads` (persistent file uploads)
  - `backend_temp:/app/temp` (temporary processing files)

### Frontend Service (`SCORM-merger-frontend`)
- **Base Image:** `nginx:alpine`
- **Port:** 80
- **Health Check:** `http://localhost/health`
- **Features:**
  - Serves React build files
  - Proxies API requests to backend
  - Handles WebSocket connections
  - Optimized nginx configuration

## Configuration

### Environment Variables

The following environment variables can be customized:

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Node.js environment |
| `PORT` | `5000` | Backend server port |

### Volume Configuration

- **backend_uploads:** Stores uploaded SCORM packages
- **backend_temp:** Stores temporary merged packages
- **Data Persistence:** Volumes persist data between container restarts

### Network Configuration

- **Custom Network:** `SCORM-network` (bridge)
- **Service Discovery:** Backend accessible via `backend:5000` from frontend
- **External Access:** Frontend on port 80, Backend API on port 5000

## File Size Limits

The Docker setup is configured to handle large SCORM packages:

- **Backend:** 200MB per file, 500MB total request size
- **Nginx:** 500MB client body size
- **Proxy Timeouts:** 300 seconds for upload/processing

## Health Checks

Both services include health checks:

- **Interval:** 30 seconds
- **Timeout:** 10 seconds
- **Retries:** 3
- **Start Period:** 10 seconds

Monitor health with:
```bash
docker-compose ps
```

## Logs and Debugging

### View logs from all services:
```bash
npm run docker:logs
```

### View logs from specific service:
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Access container shell:
```bash
docker-compose exec backend sh
docker-compose exec frontend sh
```

## Troubleshooting

### Common Issues

1. **Port Already in Use:**
   ```bash
   # Check what's using the port
   sudo lsof -i :80
   sudo lsof -i :5000
   
   # Stop conflicting services or change ports in docker-compose.yml
   ```

2. **Out of Disk Space:**
   ```bash
   # Clean up Docker resources
   docker system prune -a
   npm run docker:clean
   ```

3. **Memory Issues:**
   ```bash
   # Check Docker memory usage
   docker stats
   
   # Increase Docker memory allocation in Docker Desktop
   ```

4. **Build Failures:**
   ```bash
   # Clean build with no cache
   docker-compose build --no-cache
   
   # Check Docker logs
   docker-compose logs
   ```

### Service Health

Check service health:
```bash
# Backend health
curl http://localhost:5000/health

# Frontend health  
curl http://localhost/health

# Full application test
curl http://localhost/
```

## Production Considerations

### Security
- Change default ports if needed
- Use proper SSL/TLS certificates
- Configure firewall rules
- Set up proper authentication if required

### Performance
- Allocate sufficient RAM (recommended: 4GB+)
- Use SSD storage for better I/O performance
- Monitor disk space for uploaded files
- Consider setting up log rotation

### Backup
- Backup the `backend_uploads` volume regularly
- Export/import volumes as needed:
  ```bash
  # Export volume
  docker run --rm -v backend_uploads:/data -v $(pwd):/backup alpine tar czf /backup/uploads.tar.gz -C /data .
  
  # Import volume
  docker run --rm -v backend_uploads:/data -v $(pwd):/backup alpine tar xzf /backup/uploads.tar.gz -C /data
  ```

## Development

For development with Docker:

1. **Use development compose:**
   ```bash
   cp docker-compose.yml docker-compose.dev.yml
   # Edit docker-compose.dev.yml for development needs
   docker-compose -f docker-compose.dev.yml up
   ```

2. **Mount source code for live reload:**
   ```yaml
   # Add to backend service in docker-compose.dev.yml
   volumes:
     - ./server:/app/server
     - ./package.json:/app/package.json
   ```

3. **Debug mode:**
   ```bash
   # Backend with debug
   docker-compose exec backend node --inspect=0.0.0.0:9229 server/index.js
   ```

## Support

For Docker-related issues:
1. Check the logs: `npm run docker:logs`
2. Verify health checks: `docker-compose ps`
3. Test individual services: `curl http://localhost:5000/health`
4. Review Docker and system resources: `docker system df`