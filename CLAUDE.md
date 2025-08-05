# SCORM Merge Project Guide

This document provides essential context and guidance for working with the SCORM Merge application - a web-based tool for merging multiple SCORM packages into a single cohesive package.

## Project Overview

- **Purpose**: Merge multiple SCORM packages into one unified package with navigation menu
- **Tech Stack**: Node.js/Express backend, React/TypeScript frontend, Docker deployment
- **Architecture**: Full-stack web application with file processing capabilities
- **Target Users**: Educators and training professionals working with SCORM content

## Key Project Structure

```
scorm-merge/
├── server/                 # Node.js backend
│   ├── index.js           # Express server with file upload/processing
│   └── scormProcessor.js  # Core SCORM merging logic
├── client/                # React frontend
│   ├── src/components/    # Upload, Sort, Merge step components
│   └── src/App.tsx       # Main application with step-based workflow
├── tests/                 # Backend unit/integration tests
├── e2e/                  # Playwright end-to-end tests
└── docker-compose*.yml   # Multiple deployment configurations
```

## Development Commands

### Essential Commands
- **Start development**: `npm run dev` (starts both frontend and backend)
- **Install all dependencies**: `npm run install:all`
- **Build for production**: `npm run build`
- **Run all tests**: `npm run test:all`

### Backend Only
- **Start backend dev**: `npm run server:dev` (with nodemon auto-reload)
- **Run backend tests**: `npm test`
- **Generate test coverage**: `npm run test:coverage`

### Frontend Only
- **Start frontend dev**: `npm run client:dev` (React dev server on port 3000)
- **Run frontend tests**: `npm run test:client`

### Testing
- **Unit tests**: `npm test` (Jest for backend)
- **Frontend tests**: `npm run test:client` (React Testing Library)
- **E2E tests**: `npm run test:e2e` (Playwright)
- **E2E with UI**: `npm run test:e2e:ui`
- **Install Playwright**: `npm run install:playwright`

### Docker Deployment
- **Development**: `npm run docker:dev` or `docker-compose up --build`
- **Production**: `npm run docker:prod`
- **Simple single container**: `npm run docker:simple`
- **View logs**: `npm run docker:logs`
- **Clean up**: `npm run docker:clean`

## Code Style and Conventions

### General Standards
- Use **2-space indentation** for JavaScript/TypeScript
- Use **camelCase** for variables and functions
- Use **PascalCase** for React components
- Maximum line length: **100 characters**
- Use **TypeScript** for all new frontend code

### File Naming
- React components: `ComponentName.tsx`
- Test files: `ComponentName.test.tsx` or `filename.test.js`
- Use lowercase with hyphens for directories: `my-component/`

### Backend Patterns
- Use **Express.js** middleware pattern
- File uploads handled with **Multer**
- SCORM processing uses **JSZip** for archive manipulation
- WebSocket connections for real-time progress updates
- Error handling with try/catch and proper HTTP status codes

### Frontend Patterns
- Use **React functional components** with hooks
- **@dnd-kit** for drag-and-drop functionality
- **react-dropzone** for file uploads
- Step-based UI workflow (Upload → Sort → Merge)
- TypeScript interfaces for all data structures

## Key Dependencies

### Backend
- **express**: Web server framework
- **multer**: File upload handling
- **jszip**: ZIP archive manipulation for SCORM packages
- **xml2js**: XML parsing for SCORM manifests
- **ws**: WebSocket server for progress updates
- **uuid**: Unique identifier generation

### Frontend
- **react**: UI framework (v19+)
- **typescript**: Type safety
- **@dnd-kit**: Drag and drop functionality
- **react-dropzone**: File upload interface
- **@testing-library**: Testing utilities

### Testing
- **jest**: Backend unit testing
- **supertest**: API endpoint testing
- **@playwright/test**: End-to-end browser testing

## SCORM Processing Logic

### Key Concepts
- **SCORM packages** are ZIP files containing learning content + manifest
- **imsmanifest.xml** defines package structure and navigation
- **Merging process**: Extract → Parse manifests → Combine → Repackage
- **Course menu** automatically generated for navigation between merged modules

### File Handling
- **Upload limit**: 200MB per file, 500MB total
- **Temporary storage**: `./uploads/` for incoming files, `./temp/` for output
- **Docker volumes**: `backend_uploads` and `backend_temp` for persistence

## Testing Strategy

### Unit Tests (Backend)
- Test SCORM processing functions in isolation
- Mock file system operations
- Validate XML parsing and manifest generation

### Integration Tests
- Test complete file upload → process → download workflow
- Test WebSocket progress updates
- Validate generated SCORM package structure

### E2E Tests (Playwright)
- Test full user journey: upload → sort → merge → download
- Cross-browser testing (Chrome, Firefox, Safari)
- File upload and download verification

## Deployment Options

### Container Images (GitHub Container Registry)
- **Full app**: `ghcr.io/ndsrf/scorm-merge/scorm-merge-full:main`
- **Backend only**: `ghcr.io/ndsrf/scorm-merge/scorm-merge-backend:main`
- **Frontend only**: `ghcr.io/ndsrf/scorm-merge/scorm-merge-frontend:main`

### Deployment Methods
1. **Docker Compose** (recommended): Use `docker-compose.deploy.yml`
2. **Individual containers**: Manual container orchestration
3. **Local development**: `npm run dev`

### Environment Configuration
- **PORT**: Backend server port (default: 5000)
- **NODE_ENV**: Runtime environment (development/production)
- **Frontend proxy**: Development proxy to backend at localhost:5000

## Troubleshooting Common Issues

### Build Issues
- Run `npm run install:all` to ensure all dependencies installed
- Clear Docker cache: `docker system prune -a`
- Check Node.js version (requires 18+)

### Test Failures
- Backend tests: Ensure no processes using port 5000
- E2E tests: Install browsers with `npm run install:playwright`
- File permissions: Check upload/temp directories are writable

### Docker Issues
- Port conflicts: Check nothing using ports 80, 3000, 5000
- Memory: Ensure adequate RAM allocation (4GB+ recommended)
- Volumes: Use `docker volume ls` to check persistent storage

## Performance Considerations

### File Processing
- Large SCORM packages (>50MB) take 10-30 seconds to process
- Memory usage scales with file size (~50MB per concurrent merge)
- WebSocket progress updates prevent UI blocking

### Optimization Tips
- Use SSD storage for better I/O performance
- Monitor disk space for uploaded/temporary files
- Consider cleanup strategies for old temporary files

## Security Notes

- File uploads validated for ZIP format and SCORM structure
- Temporary files cleaned up after processing
- No authentication required (consider adding for production)
- CORS enabled for development (configure for production domains)

## Contributing Guidelines

1. **Run tests**: Always run `npm run test:all` before committing
2. **Code style**: Follow existing patterns and naming conventions
3. **Documentation**: Update this file when adding major features
4. **Testing**: Add tests for new functionality
5. **Docker**: Verify Docker builds work with `npm run docker:dev`

## Useful References

- [SCORM 2004 Specification](https://adlnet.gov/projects/scorm/)
- [React Documentation](https://react.dev/)
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [Project Issues](https://github.com/ndsrf/scorm-merge/issues)