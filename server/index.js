const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const WebSocket = require('ws');
const http = require('http');
const scormProcessor = require('./scormProcessor');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use(express.static(path.join(__dirname, '../client/build')));

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir('uploads', { recursive: true });
      cb(null, 'uploads/');
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `${timestamp}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed'), false);
    }
  },
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit per file
    files: 100, // Maximum 100 files
    fieldSize: 200 * 1024 * 1024 // 200MB field size limit
  }
});

let sessions = new Map();

wss.on('connection', (ws) => {
  const sessionId = Date.now().toString();
  sessions.set(sessionId, { ws, packages: [] });
  
  ws.send(JSON.stringify({ type: 'session', sessionId }));
  
  ws.on('close', () => {
    sessions.delete(sessionId);
  });
});

// Error handler for multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 200MB per file.' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files. Maximum is 100 files.' });
    }
    if (error.code === 'LIMIT_FIELD_VALUE') {
      return res.status(400).json({ error: 'Field value too large.' });
    }
    return res.status(400).json({ error: `Upload error: ${error.message}` });
  }
  next(error);
};

app.post('/api/upload', upload.array('scormPackages', 100), handleMulterError, async (req, res) => {
  try {
    console.log('Upload request received');
    console.log('Session ID:', req.body.sessionId);
    console.log('Files:', req.files?.length || 0);
    
    const { sessionId } = req.body;
    let session = sessions.get(sessionId);
    
    if (!session) {
      console.log('Session not found, creating new session for:', sessionId);
      session = { packages: [] };
      sessions.set(sessionId, session);
    }

    if (!req.files || req.files.length === 0) {
      console.error('No files received');
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const packages = [];
    
    for (const file of req.files) {
      try {
        console.log('Processing file:', file.originalname);
        const packageInfo = await scormProcessor.validateAndParsePackage(file.path);
        packages.push({
          id: Date.now() + Math.random(),
          filename: file.originalname,
          path: file.path,
          ...packageInfo
        });
      } catch (error) {
        console.error('Error processing file:', file.originalname, error.message);
        packages.push({
          id: Date.now() + Math.random(),
          filename: file.originalname,
          path: file.path,
          error: error.message
        });
      }
    }
    
    session.packages = packages;
    console.log('Upload successful, returning packages:', packages.length);
    res.json({ packages });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reorder', (req, res) => {
  try {
    console.log('Reorder request received');
    console.log('Session ID:', req.body.sessionId);
    console.log('Packages count:', req.body.packages?.length || 0);
    
    const { sessionId, packages } = req.body;
    
    if (!sessionId) {
      console.error('No session ID provided');
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    if (!packages) {
      console.error('No packages provided');
      return res.status(400).json({ error: 'Packages are required' });
    }
    
    let session = sessions.get(sessionId);
    
    if (!session) {
      console.log('Session not found for reorder, creating new session for:', sessionId);
      session = { packages: [] };
      sessions.set(sessionId, session);
    }
    
    session.packages = packages;
    console.log('Packages reordered successfully for session:', sessionId);
    res.json({ success: true });
  } catch (error) {
    console.error('Reorder error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/merge', async (req, res) => {
  try {
    const { sessionId } = req.body;
    let session = sessions.get(sessionId);
    
    if (!session) {
      console.log('Session not found for merge, creating new session for:', sessionId);
      session = { packages: [] };
      sessions.set(sessionId, session);
    }

    const validPackages = session.packages.filter(pkg => !pkg.error);
    
    if (validPackages.length === 0) {
      return res.status(400).json({ error: 'No valid SCORM packages to merge' });
    }

    const mergedPackagePath = await scormProcessor.mergePackages(
      validPackages,
      (progress) => {
        if (session.ws && session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(JSON.stringify({ 
            type: 'progress', 
            progress 
          }));
        }
      }
    );

    res.json({ downloadUrl: `/api/download/${path.basename(mergedPackagePath)}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint for Docker
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '../temp', filename);
  
  res.download(filePath, 'merged-scorm-package.zip', (err) => {
    if (err) {
      res.status(404).json({ error: 'File not found' });
    } else {
      fs.unlink(filePath).catch(console.error);
    }
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

setInterval(async () => {
  try {
    const files = await fs.readdir('uploads');
    const now = Date.now();
    
    for (const file of files) {
      const filePath = path.join('uploads', file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtime.getTime() > 3600000) {
        await fs.unlink(filePath);
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}, 300000);

async function startServer() {
  try {
    await fs.mkdir('uploads', { recursive: true });
    await fs.mkdir('temp', { recursive: true });
    console.log('Required directories created');
  } catch (error) {
    console.error('Error creating directories:', error);
  }

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Required directories: uploads, temp');
  });
}

startServer();