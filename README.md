# SCORM Package Merger

A powerful web application that allows you to merge multiple SCORM packages into a single, cohesive SCORM package. Perfect for educators and training professionals who need to combine multiple learning modules into one unified course.

![SCORM Package Merger](https://img.shields.io/badge/SCORM-2004%203rd%20Edition-blue)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![React](https://img.shields.io/badge/React-18+-blue)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED)
![License](https://img.shields.io/badge/License-ISC-yellow)

## ✨ Features

### 🎯 Core Functionality
- **Merge Multiple SCORM Packages** - Combine up to 100 SCORM packages into one
- **Drag & Drop Interface** - Intuitive file upload with drag-and-drop support
- **Package Reordering** - Sort merged packages in your preferred order
- **Progress Tracking** - Real-time progress updates during merge operations
- **Course Menu System** - Automatically creates a navigation menu for the merged package
- **AI-Powered Descriptions** - Generate intelligent course descriptions using OpenAI
- **Smart Finish Navigation** - Finish links in individual courses return to main menu

### 📦 SCORM Support
- **SCORM 2004 3rd Edition** compatible
- **SCORM 1.2** compatible
- **Automatic Validation** - Validates SCORM packages before merging
- **Manifest Parsing** - Intelligent parsing of imsmanifest.xml files
- **LMS Compatibility** - Generated packages work with standard LMSs

### 🚀 Technical Features
- **Large File Support** - Handles packages up to 200MB each
- **Memory Efficient** - Optimized for processing large files
- **Real-time Updates** - WebSocket-powered progress tracking
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Docker Ready** - Multiple deployment options
- **OpenAI Integration** - Configurable AI-powered content analysis
- **Content Extraction** - Intelligent parsing of course content for descriptions
- **Comprehensive Testing** - 52+ automated tests ensuring reliability

## Screenshot

<img width="1222" height="860" alt="image" src="https://github.com/user-attachments/assets/e7320136-a3c1-4d4f-93b2-ddf5fb3443e7" />


## 🏃‍♂️ Quick Start

### Option 1: Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/ndsrf/scorm-merge.git
cd scorm-merge

# Start with Docker (interactive setup)
./start-docker.sh

# Or use npm scripts
npm run docker:simple    # Single container
npm run docker:dev       # Development mode
```

Access the application at `http://localhost` (or `http://localhost:5000` for simple mode)

### Option 2: Local Development

```bash
# Clone and install dependencies
git clone https://github.com/ndsrf/scorm-merge.git
cd scorm-merge
npm run install:all

# Start development servers
npm run dev
```

Access the application at `http://localhost:3000`

## 🤖 OpenAI Integration (Optional)

The application can generate intelligent course descriptions using OpenAI. This is completely optional - the system works perfectly without it using smart fallback descriptions.

### Setup OpenAI (Optional)
1. **Get an API key** from [OpenAI Platform](https://platform.openai.com/)
2. **Configure the key:**
   ```bash
   # Environment variable (recommended)
   export OPENAI_API_KEY="sk-your-key-here"
   
   # Or in Docker
   docker run -e OPENAI_API_KEY="sk-your-key-here" ...
   ```
3. **Restart the application** - OpenAI integration will be automatically enabled

### Features
- **Intelligent Descriptions** - AI analyzes course content to generate specific, engaging descriptions
- **Content Analysis** - Extracts meaningful information from SCORM package HTML files
- **Smart Fallbacks** - 10+ subject-specific fallback descriptions when AI is unavailable
- **Cost Effective** - ~$0.0001-0.0002 per package with gpt-4o-mini

### Configuration
Edit `config/default.json` to customize:
```json
{
  "openai": {
    "model": "gpt-4o-mini",
    "maxTokens": 150,
    "enabled": true
  }
}
```

## 📋 Requirements

- **Node.js** 18+ 
- **npm** 8+
- **Docker** 20.10+ (optional)
- **Docker Compose** 2.0+ (optional)

## 🎮 How to Use

### Step 1: Upload SCORM Packages
1. Drag and drop your SCORM packages (.zip files) onto the upload area
2. Or click to browse and select files
3. The system automatically validates each package
4. Click "Upload Packages" to proceed

### Step 2: Sort Package Order
1. Review the uploaded packages
2. Drag and drop to reorder packages as needed
3. Invalid packages are clearly marked with error messages
4. Click "Continue to Merge" when satisfied with the order

### Step 3: Merge and Download
1. Review the merge summary
2. Click "Start Merge Process"
3. Monitor real-time progress updates
4. Download your merged SCORM package when complete

### Using the Merged Package
The merged SCORM package includes:
- **Course Menu** - Main navigation interface with course descriptions
- **Individual Modules** - Each original package as a separate section
- **SCORM API Integration** - Full LMS compatibility
- **Progress Tracking** - Proper completion status handling
- **Smart Navigation** - Finish links in individual courses automatically return to main menu
- **Seamless Experience** - No broken links or navigation issues

## 🛠️ Development

### Project Structure
```
scorm-merge/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   └── App.tsx        # Main application
│   └── package.json
├── server/                 # Node.js backend
│   ├── index.js           # Express server
│   ├── scormProcessor.js  # SCORM processing logic
│   ├── openaiService.js   # OpenAI integration
│   └── config.js          # Configuration loader
├── config/                 # Configuration files
│   ├── default.json       # Default configuration
│   └── README.md          # Configuration documentation
├── tests/                  # Backend tests (52+ tests)
├── e2e/                   # End-to-end tests
├── docker-compose.yml     # Docker configuration
└── package.json          # Main package file
```

### Available Scripts

#### Development
```bash
npm run dev              # Start both frontend and backend
npm run server:dev       # Start backend only
npm run client:dev       # Start frontend only
npm run build           # Build frontend for production
```

#### Testing
```bash
npm test                # Run backend unit tests
npm run test:client     # Run frontend tests
npm run test:e2e        # Run end-to-end tests
npm run test:all        # Run all tests
npm run test:coverage   # Generate coverage report
```

#### Docker
```bash
npm run docker:build    # Build Docker images
npm run docker:up       # Start containers
npm run docker:down     # Stop containers
npm run docker:logs     # View container logs
npm run docker:simple   # Single container deployment
npm run docker:prod     # Production deployment
```

### Development Setup

1. **Clone and install:**
   ```bash
   git clone https://github.com/ndsrf/scorm-merge.git
   cd scorm-merge
   npm run install:all
   ```

2. **Start development:**
   ```bash
   npm run dev
   ```

3. **Run tests:**
   ```bash
   npm run test:all
   ```

## 🐳 Docker Deployment

### Quick Deploy Options

| Command | Description | Access |
|---------|-------------|--------|
| `npm run docker:simple` | Single container | `http://localhost:5000` |
| `npm run docker:dev` | Multi-service development | `http://localhost` |
| `npm run docker:prod` | Production ready | `http://localhost` |

### Docker Compose Files

- `docker-compose.yml` - Main multi-service setup
- `docker-compose.simple.yml` - Single container
- `docker-compose.prod.yml` - Production overrides
- `docker-compose.override.yml` - Development overrides

For detailed Docker documentation, see [README-Docker.md](README-Docker.md).

## 🧪 Testing

The project includes comprehensive testing:

### Backend Tests (Jest)
- **Unit Tests** - SCORM processor functionality
- **API Tests** - Express endpoints and file handling
- **Integration Tests** - Full workflow testing

### Frontend Tests (React Testing Library)
- **Component Tests** - Individual React components
- **Integration Tests** - User interactions and workflows

### End-to-End Tests (Playwright)
- **Full Workflow** - Complete user journey testing
- **Cross-Browser** - Chrome, Firefox, Safari support
- **File Upload** - Real file handling scenarios

Run tests with:
```bash
npm run test:all    # All tests
npm test           # Backend only
npm run test:client # Frontend only
npm run test:e2e   # E2E only
```

## 📊 Performance

### File Size Limits
- **Per Package:** 200MB maximum
- **Total Upload:** 500MB maximum
- **Package Count:** 100 packages maximum

### Memory Usage
- **Backend:** ~200MB base + ~50MB per concurrent merge
- **Frontend:** ~50MB (React bundle ~93KB gzipped)
- **Docker:** ~300MB total (Alpine-based images)

### Processing Speed
- **Small Packages** (<10MB): ~2-5 seconds per package
- **Large Packages** (>50MB): ~10-30 seconds per package
- **Network Transfer:** Progress tracking for large uploads

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Runtime environment |
| `PORT` | `5000` | Backend server port |
| `OPENAI_API_KEY` | `""` | OpenAI API key for course descriptions |
| `OPENAI_ENABLED` | `auto` | Enable/disable OpenAI (auto-enabled with API key) |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model to use |

### File Storage
- **Uploads:** `./uploads/` (temporary storage)
- **Output:** `./temp/` (merged packages)
- **Docker Volumes:** Persistent storage in containers

## 🚀 Production Deployment

### Using Docker (Recommended)
```bash
# Clone and deploy
git clone https://github.com/ndsrf/scorm-merge.git
cd scorm-merge
npm run docker:prod
```

### Manual Deployment
```bash
# Install and build
npm run install:all
npm run build

# Start production server
NODE_ENV=production npm start
```

### Reverse Proxy Setup
For production, use nginx or similar:
```nginx
server {
    location / {
        proxy_pass http://localhost:5000;
        client_max_body_size 500M;
    }
}
```

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Guidelines
- Follow existing code style
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass

## 🐛 Troubleshooting

### Common Issues

**Upload fails with large files:**
```bash
# Check disk space
df -h
# Increase upload limits in server/index.js
```

**WebSocket connection fails:**
```bash
# Check firewall settings
# Verify port 5000 is accessible
```

**Docker build fails:**
```bash
# Clean Docker cache
docker system prune -a
npm run docker:clean
```

**Tests fail:**
```bash
# Install all dependencies
npm run install:all
# Run tests individually
npm test
npm run test:client
```

### Getting Help
- Check the [Issues](https://github.com/YOUR_USERNAME/scorm-merge/issues) page
- Review [README-Docker.md](README-Docker.md) for Docker-specific help
- Create a new issue with detailed information

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **SCORM Community** - For the standards and documentation
- **React Team** - For the excellent frontend framework
- **Node.js Community** - For the robust backend platform
- **Docker** - For containerization technology

## 📈 Roadmap

### ✅ Recently Completed
- [x] **AI-Powered Descriptions** - OpenAI integration for intelligent course descriptions
- [x] **Smart Finish Navigation** - Automatic return to menu from individual courses
- [x] **Enhanced Testing** - Comprehensive test suite with 52+ automated tests
- [x] **Configuration System** - Flexible configuration with environment variable support

### 🚀 Upcoming Features
- [ ] **SCORM 1.3/2004 4th Edition** enhanced support
- [ ] **Batch Processing** for multiple merge operations
- [ ] **Cloud Storage** integration (AWS S3, Google Drive)
- [ ] **API Keys** for programmatic access
- [ ] **User Management** and authentication
- [ ] **Package Analytics** and reporting
- [ ] **Custom Themes** for merged packages
- [ ] **Multi-language Support** for course descriptions

---

**Built with ❤️ for the e-learning community**

If you find this project helpful, please consider giving it a ⭐ on GitHub!
