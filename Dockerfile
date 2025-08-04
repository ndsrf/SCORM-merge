# Multi-stage Dockerfile for SCORM Package Merger
# This builds both frontend and backend in a single container

# Stage 1: Build React frontend
FROM node:18-alpine AS frontend-build

WORKDIR /app/client

# Copy and install client dependencies
COPY client/package*.json ./
RUN npm ci

# Copy client source and build
COPY client/ ./
RUN npm run build

# Stage 2: Setup backend with built frontend
FROM node:18-alpine AS production

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy package files and install backend dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy backend source
COPY server/ ./server/

# Copy built frontend from previous stage
COPY --from=frontend-build /app/client/build ./client/build

# Create directories with proper ownership
RUN mkdir -p temp uploads && \
    chown -R nextjs:nodejs temp uploads

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); \
    const options = { hostname: 'localhost', port: 5000, path: '/health', timeout: 2000 }; \
    const req = http.request(options, (res) => { \
      res.statusCode === 200 ? process.exit(0) : process.exit(1); \
    }); \
    req.on('error', () => process.exit(1)); \
    req.end();"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "server/index.js"]