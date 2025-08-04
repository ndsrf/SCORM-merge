#!/bin/bash

# SCORM Package Merger - Docker Quick Start Script

set -e

echo "🐳 SCORM Package Merger - Docker Setup"
echo "======================================"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    echo "   Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo "❌ Docker daemon is not running. Please start Docker first."
    exit 1
fi

echo ""
echo "Choose deployment option:"
echo "1) Simple (single container) - Recommended for testing"
echo "2) Multi-service (separate frontend/backend) - Recommended for production"
echo "3) Development mode (with source mounting)"
echo ""
read -p "Enter your choice (1-3): " choice

case $choice in
    1)
        echo "🚀 Starting simple deployment..."
        docker-compose -f docker-compose.simple.yml up --build -d
        COMPOSE_FILE="docker-compose.simple.yml"
        PORT="5000"
        ;;
    2)
        echo "🚀 Starting multi-service deployment..."
        docker-compose up --build -d
        COMPOSE_FILE="docker-compose.yml"
        PORT="80"
        ;;
    3)
        echo "🚀 Starting development mode..."
        docker-compose -f docker-compose.yml -f docker-compose.override.yml up --build -d
        COMPOSE_FILE="docker-compose.yml"
        PORT="80"
        ;;
    *)
        echo "❌ Invalid choice. Exiting."
        exit 1
        ;;
esac

echo ""
echo "⏳ Waiting for services to be healthy..."

# Wait for services to be healthy
max_attempts=60
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if docker-compose -f $COMPOSE_FILE ps | grep -q "healthy"; then
        echo "✅ Services are healthy!"
        break
    fi
    
    if [ $attempt -eq 0 ]; then
        echo -n "   "
    fi
    echo -n "."
    sleep 5
    ((attempt++))
done

if [ $attempt -eq $max_attempts ]; then
    echo ""
    echo "⚠️  Services took longer than expected to start. Check logs with:"
    echo "   docker-compose -f $COMPOSE_FILE logs"
else
    echo ""
fi

echo ""
echo "🎉 SCORM Package Merger is now running!"
echo ""
echo "📍 Access the application:"
echo "   http://localhost:$PORT"
echo ""
echo "🔧 Useful commands:"
echo "   View logs:    docker-compose -f $COMPOSE_FILE logs -f"
echo "   Stop:         docker-compose -f $COMPOSE_FILE down"
echo "   Restart:      docker-compose -f $COMPOSE_FILE restart"
echo ""
echo "📚 For more information, see README-Docker.md"
echo ""

# Open browser if available
if command -v xdg-open &> /dev/null; then
    echo "🌐 Opening browser..."
    xdg-open "http://localhost:$PORT" &> /dev/null &
elif command -v open &> /dev/null; then
    echo "🌐 Opening browser..."
    open "http://localhost:$PORT" &> /dev/null &
fi