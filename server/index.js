const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const WebSocket = require('ws');
const http = require('http');
const scormProcessor = require('./scormProcessor');
const descriptionTaskManager = require('./descriptionTaskManager');

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
    console.log('WebSocket closed for session:', sessionId);
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
    } else {
      // Preserve existing WebSocket connection if it exists
      console.log('Session found, preserving WebSocket connection');
    }

    if (!req.files || req.files.length === 0) {
      console.error('No files received');
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const packages = [];
    
    for (const file of req.files) {
      try {
        console.log('Processing file:', file.originalname);
        const packageInfo = await scormProcessor.validateAndParsePackage(file.path, file.originalname);
        const packageData = {
          id: Date.now() + Math.random(),
          filename: file.originalname,
          path: file.path,
          ...packageInfo
        };
        // Use friendly display title for frontend
        packageData.title = scormProcessor.getDisplayTitle(packageData);
        
        // Use fallback description initially - AI descriptions will be generated in background
        packageData.description = scormProcessor.getFallbackDescription(packageData);
        console.log(`Using fallback description for ${packageData.title}: ${packageData.description.substring(0, 50)}...`);
        
        packages.push(packageData);
      } catch (error) {
        console.error('Error processing file:', file.originalname, error.message);
        const errorPackage = {
          id: Date.now() + Math.random(),
          filename: file.originalname,
          path: file.path,
          title: 'Untitled SCORM Package', // Default title for error cases
          description: 'Error processing SCORM package',
          error: error.message
        };
        // Use friendly display title for frontend even in error cases
        errorPackage.title = scormProcessor.getDisplayTitle(errorPackage);
        packages.push(errorPackage);
      }
    }
    
    // Sort packages alphabetically by display title for consistent presentation
    packages.sort((a, b) => {
      const titleA = scormProcessor.getDisplayTitle(a).toLowerCase();
      const titleB = scormProcessor.getDisplayTitle(b).toLowerCase();
      return titleA.localeCompare(titleB);
    });
    
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
    console.log('Merge request received');
    console.log('Request body:', req.body);
    
    const { sessionId } = req.body;
    
    if (!sessionId) {
      console.error('No session ID provided in merge request');
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    let session = sessions.get(sessionId);
    console.log('Session found:', !!session);
    console.log('Session data:', session ? { packagesCount: session.packages?.length, hasWs: !!session.ws } : 'null');
    
    if (!session) {
      console.log('Session not found for merge, creating new session for:', sessionId);
      session = { packages: [] };
      sessions.set(sessionId, session);
    }

    console.log('Total packages in session:', session.packages?.length || 0);
    console.log('Package details:', session.packages?.map(pkg => ({ 
      id: pkg.id, 
      filename: pkg.filename, 
      hasError: !!pkg.error,
      error: pkg.error 
    })));

    const validPackages = session.packages.filter(pkg => !pkg.error);
    console.log('Valid packages count:', validPackages.length);
    
    if (validPackages.length === 0) {
      console.error('No valid packages to merge. Total packages:', session.packages?.length || 0);
      return res.status(400).json({ error: 'No valid SCORM packages to merge' });
    }

    // Sort packages alphabetically by title (using display title which includes friendly names)
    validPackages.sort((a, b) => {
      const titleA = scormProcessor.getDisplayTitle(a).toLowerCase();
      const titleB = scormProcessor.getDisplayTitle(b).toLowerCase();
      return titleA.localeCompare(titleB);
    });

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

    console.log('Merge completed successfully, download URL created');
    res.json({ downloadUrl: `/api/download/${path.basename(mergedPackagePath)}` });
  } catch (error) {
    console.error('Merge process error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Description generation endpoints
app.post('/api/descriptions/start', async (req, res) => {
  try {
    console.log('Description generation start request received:', req.body);
    const { sessionId } = req.body;
    
    if (!sessionId) {
      console.log('No session ID provided');
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    let session = sessions.get(sessionId);
    console.log('Session found:', !!session);
    console.log('Session has WebSocket:', session ? !!session.ws : 'no session');
    console.log('WebSocket state:', session && session.ws ? session.ws.readyState : 'no ws');
    if (!session) {
      console.log('Session not found for ID:', sessionId);
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const validPackages = session.packages.filter(pkg => !pkg.error);
    console.log('Valid packages count:', validPackages.length);
    if (validPackages.length === 0) {
      console.log('No valid packages found');
      return res.status(400).json({ error: 'No valid packages to generate descriptions for' });
    }
    
    // Start background description generation
    const taskId = await descriptionTaskManager.startDescriptionGeneration(
      sessionId,
      validPackages,
      (progress) => {
        // Send progress updates via WebSocket
        console.log('Sending progress update:', progress);
        console.log('Session has WebSocket:', !!session.ws);
        console.log('WebSocket state:', session.ws ? session.ws.readyState : 'no ws');
        if (session.ws && session.ws.readyState === WebSocket.OPEN) {
          console.log('Sending progress via WebSocket');
          session.ws.send(JSON.stringify({ 
            type: 'description_progress', 
            progress 
          }));
        } else {
          console.log('Cannot send progress - WebSocket not available or not open');
        }
      },
      (update) => {
        // Send individual description updates via WebSocket
        console.log('Sending description update:', update);
        console.log('Session has WebSocket:', !!session.ws);
        console.log('WebSocket state:', session.ws ? session.ws.readyState : 'no ws');
        if (session.ws && session.ws.readyState === WebSocket.OPEN) {
          console.log('Sending description update via WebSocket');
          session.ws.send(JSON.stringify(update));
        } else {
          console.log('Cannot send description update - WebSocket not available or not open');
        }
      }
    );
    
    res.json({ 
      success: true, 
      taskId,
      message: `Started generating descriptions for ${validPackages.length} packages`
    });
    
  } catch (error) {
    console.error('Error starting description generation:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/descriptions/cancel', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    const cancelled = await descriptionTaskManager.cancelTask(sessionId);
    
    if (cancelled) {
      res.json({ 
        success: true, 
        message: 'Description generation cancelled' 
      });
    } else {
      res.status(404).json({ 
        error: 'No active description generation task found' 
      });
    }
    
  } catch (error) {
    console.error('Error cancelling description generation:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/descriptions/status/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const status = descriptionTaskManager.getTaskStatus(sessionId);
    const results = descriptionTaskManager.getTaskResults(sessionId);
    
    res.json({ 
      status,
      results,
      hasResults: Object.keys(results).length > 0
    });
    
  } catch (error) {
    console.error('Error getting description status:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/descriptions/results/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const results = descriptionTaskManager.getTaskResults(sessionId);
    
    res.json({ 
      results,
      count: Object.keys(results).length
    });
    
  } catch (error) {
    console.error('Error getting description results:', error);
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