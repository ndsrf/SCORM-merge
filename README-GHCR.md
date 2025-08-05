# GitHub Container Registry Usage

This project automatically builds and publishes Docker images to GitHub Container Registry (GHCR) on every push to main/develop branches and on version tags.

## Available Images

Three different images are built and published:

1. **Full Application** (`scorm-merge-full`): Contains both frontend and backend in a single container
2. **Frontend Only** (`scorm-merge-frontend`): Nginx serving the React frontend
3. **Backend Only** (`scorm-merge-backend`): Node.js backend API

## Image Tags

Images are tagged with:
- `main` - Latest from main branch
- `develop` - Latest from develop branch  
- `v1.0.0` - Semantic version tags
- `pr-123` - Pull request builds
- `main-abc1234` - Git SHA for specific commits

## Quick Start with GHCR Images

### Using Docker Compose (Recommended)

```bash
# Use the pre-built images from GHCR
docker-compose -f docker-compose.ghcr.yml up -d

# Or pull specific versions
docker-compose -f docker-compose.ghcr.yml pull
docker-compose -f docker-compose.ghcr.yml up -d
```

### Using Individual Images

#### Full Application (Frontend + Backend)
```bash
docker run -d \
  --name scorm-merge \
  -p 5000:5000 \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/temp:/app/temp \
  ghcr.io/ndsrf/scorm-merge/scorm-merge-full:main
```

#### Separate Frontend and Backend
```bash
# Backend
docker run -d \
  --name scorm-backend \
  -p 5000:5000 \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/temp:/app/temp \
  ghcr.io/ndsrf/scorm-merge/scorm-merge-backend:main

# Frontend  
docker run -d \
  --name scorm-frontend \
  -p 3000:80 \
  ghcr.io/ndsrf/scorm-merge/scorm-merge-frontend:main
```

## Authentication

GitHub Container Registry images are public by default, but you may need to authenticate for private repositories:

```bash
# Login with GitHub token
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Or use GitHub CLI
gh auth token | docker login ghcr.io -u USERNAME --password-stdin
```

## Production Deployment

For production, pin to specific version tags:

```yaml
services:
  backend:
    image: ghcr.io/ndsrf/scorm-merge/scorm-merge-backend:v1.0.0
  frontend:
    image: ghcr.io/ndsrf/scorm-merge/scorm-merge-frontend:v1.0.0
```

## Security Scanning

All images are automatically scanned for vulnerabilities using Trivy, with results uploaded to GitHub Security tab.

## Multi-Architecture Support

Images are built for both `linux/amd64` and `linux/arm64` architectures, supporting deployment on various platforms including Apple Silicon Macs and ARM-based servers.