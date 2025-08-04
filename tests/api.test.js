const request = require('supertest');
const fs = require('fs').promises;
const path = require('path');
const JSZip = require('jszip');

// Create a minimal Express app for testing
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const scormProcessor = require('../server/scormProcessor');

const app = express();

app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir('test-uploads', { recursive: true });
      cb(null, 'test-uploads/');
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
    fileSize: 200 * 1024 * 1024,
    files: 100,
    fieldSize: 200 * 1024 * 1024
  }
});

let sessions = new Map();

// Error handler for multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 200MB per file.' });
    }
    return res.status(400).json({ error: `Upload error: ${error.message}` });
  }
  if (error.message === 'Only ZIP files are allowed') {
    return res.status(400).json({ error: error.message });
  }
  next(error);
};

app.post('/api/upload', upload.array('scormPackages', 100), handleMulterError, async (req, res) => {
  try {
    const { sessionId } = req.body;
    let session = sessions.get(sessionId);
    
    if (!session) {
      session = { packages: [] };
      sessions.set(sessionId, session);
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const packages = [];
    
    for (const file of req.files) {
      try {
        const packageInfo = await scormProcessor.validateAndParsePackage(file.path);
        packages.push({
          id: Date.now() + Math.random(),
          filename: file.originalname,
          path: file.path,
          ...packageInfo
        });
      } catch (error) {
        packages.push({
          id: Date.now() + Math.random(),
          filename: file.originalname,
          path: file.path,
          error: error.message
        });
      }
    }
    
    session.packages = packages;
    res.json({ packages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reorder', (req, res) => {
  try {
    const { sessionId, packages } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    if (!packages) {
      return res.status(400).json({ error: 'Packages are required' });
    }
    
    let session = sessions.get(sessionId);
    
    if (!session) {
      session = { packages: [] };
      sessions.set(sessionId, session);
    }
    
    session.packages = packages;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/merge', async (req, res) => {
  try {
    const { sessionId } = req.body;
    let session = sessions.get(sessionId);
    
    if (!session) {
      session = { packages: [] };
      sessions.set(sessionId, session);
    }

    const validPackages = session.packages.filter(pkg => !pkg.error);
    
    if (validPackages.length === 0) {
      return res.status(400).json({ error: 'No valid SCORM packages to merge' });
    }

    const mergedPackagePath = await scormProcessor.mergePackages(validPackages);
    res.json({ downloadUrl: `/api/download/${path.basename(mergedPackagePath)}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

describe('API Endpoints', () => {
  let testScormPackage;
  let testSessionId;

  beforeAll(async () => {
    // Create test SCORM package
    const zip = new JSZip();
    
    const testManifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="test-api-package" version="1.3"
          xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
          xmlns:lom="http://ltsc.ieee.org/xsd/LOM">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 3rd Edition</schemaversion>
    <lom xmlns="http://ltsc.ieee.org/xsd/LOM">
      <general>
        <title>
          <string language="en">API Test Package</string>
        </title>
      </general>
    </lom>
  </metadata>
  <organizations default="test-org">
    <organization identifier="test-org">
      <title>Test Organization</title>
    </organization>
  </organizations>
  <resources>
    <resource identifier="test-resource" href="index.html">
      <file href="index.html" />
    </resource>
  </resources>
</manifest>`;

    zip.file('imsmanifest.xml', testManifest);
    zip.file('index.html', '<html><body><h1>API Test</h1></body></html>');

    testScormPackage = await zip.generateAsync({ type: 'nodebuffer' });
    testSessionId = 'test-session-' + Date.now();

    // Cleanup any existing test files
    try {
      const files = await fs.readdir('test-uploads');
      for (const file of files) {
        await fs.unlink(path.join('test-uploads', file));
      }
    } catch (error) {
      // Directory doesn't exist yet
    }
  });

  afterEach(() => {
    // Clear sessions after each test
    sessions.clear();
  });

  describe('POST /api/upload', () => {
    test('should upload and parse SCORM package successfully', async () => {
      const response = await request(app)
        .post('/api/upload')
        .field('sessionId', testSessionId)
        .attach('scormPackages', testScormPackage, 'test-package.zip')
        .expect(200);

      expect(response.body).toHaveProperty('packages');
      expect(response.body.packages).toHaveLength(1);
      
      const pkg = response.body.packages[0];
      expect(pkg).toHaveProperty('title', 'API Test Package');
      expect(pkg).toHaveProperty('version', '2004 3rd Edition');
      expect(pkg).toHaveProperty('filename', 'test-package.zip');
      expect(pkg).not.toHaveProperty('error');
    });

    test('should handle invalid SCORM package', async () => {
      const invalidZip = new JSZip();
      invalidZip.file('test.txt', 'This is not a SCORM package');
      const invalidPackage = await invalidZip.generateAsync({ type: 'nodebuffer' });

      const response = await request(app)
        .post('/api/upload')
        .field('sessionId', testSessionId)
        .attach('scormPackages', invalidPackage, 'invalid.zip')
        .expect(200);

      expect(response.body.packages).toHaveLength(1);
      expect(response.body.packages[0]).toHaveProperty('error');
      expect(response.body.packages[0].error).toContain('No imsmanifest.xml found');
    });

    test('should reject non-ZIP files', async () => {
      await request(app)
        .post('/api/upload')
        .field('sessionId', testSessionId)
        .attach('scormPackages', Buffer.from('not a zip'), 'test.txt')
        .expect(400);
    });

    test('should handle missing session ID', async () => {
      await request(app)
        .post('/api/upload')
        .attach('scormPackages', testScormPackage, 'test.zip')
        .expect(200); // Should create new session automatically
    });

    test('should handle no files uploaded', async () => {
      const response = await request(app)
        .post('/api/upload')
        .field('sessionId', testSessionId)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'No files uploaded');
    });

    test('should handle multiple packages', async () => {
      const zip2 = new JSZip();
      zip2.file('imsmanifest.xml', `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="package-2">
  <metadata><schema>ADL SCORM</schema></metadata>
  <organizations><organization identifier="org-2"><title>Package 2</title></organization></organizations>
  <resources><resource identifier="res-2" href="main.html"><file href="main.html" /></resource></resources>
</manifest>`);
      zip2.file('main.html', '<html><body>Package 2</body></html>');
      const package2 = await zip2.generateAsync({ type: 'nodebuffer' });

      const response = await request(app)
        .post('/api/upload')
        .field('sessionId', testSessionId)
        .attach('scormPackages', testScormPackage, 'package1.zip')
        .attach('scormPackages', package2, 'package2.zip')
        .expect(200);

      expect(response.body.packages).toHaveLength(2);
      expect(response.body.packages[0].filename).toBe('package1.zip');
      expect(response.body.packages[1].filename).toBe('package2.zip');
    });
  });

  describe('POST /api/reorder', () => {
    test('should reorder packages successfully', async () => {
      const packages = [
        { id: '1', title: 'Package 1', filename: 'pkg1.zip' },
        { id: '2', title: 'Package 2', filename: 'pkg2.zip' }
      ];

      const response = await request(app)
        .post('/api/reorder')
        .send({ sessionId: testSessionId, packages })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    test('should require session ID', async () => {
      const response = await request(app)
        .post('/api/reorder')
        .send({ packages: [] })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Session ID is required');
    });

    test('should require packages array', async () => {
      const response = await request(app)
        .post('/api/reorder')
        .send({ sessionId: testSessionId })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Packages are required');
    });

    test('should create session if not exists', async () => {
      const packages = [{ id: '1', title: 'Package 1' }];

      const response = await request(app)
        .post('/api/reorder')
        .send({ sessionId: 'new-session', packages })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('POST /api/merge', () => {
    beforeEach(async () => {
      // Upload a test package first
      await request(app)
        .post('/api/upload')
        .field('sessionId', testSessionId)
        .attach('scormPackages', testScormPackage, 'test.zip');
    });

    test('should merge packages successfully', async () => {
      const response = await request(app)
        .post('/api/merge')
        .send({ sessionId: testSessionId })
        .expect(200);

      expect(response.body).toHaveProperty('downloadUrl');
      expect(response.body.downloadUrl).toContain('/api/download/');
      expect(response.body.downloadUrl).toContain('merged-scorm-');
    }, 10000);

    test('should handle session with no valid packages', async () => {
      // Create session with invalid package
      sessions.set('invalid-session', {
        packages: [{ 
          id: '1', 
          filename: 'invalid.zip', 
          error: 'Invalid package' 
        }]
      });

      const response = await request(app)
        .post('/api/merge')
        .send({ sessionId: 'invalid-session' })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'No valid SCORM packages to merge');
    });

    test('should create session if not exists', async () => {
      const response = await request(app)
        .post('/api/merge')
        .send({ sessionId: 'non-existent-session' })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'No valid SCORM packages to merge');
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/reorder')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
    });

    test('should handle server errors gracefully', async () => {
      // Mock scormProcessor to throw error
      const originalValidate = scormProcessor.validateAndParsePackage;
      scormProcessor.validateAndParsePackage = jest.fn().mockRejectedValue(new Error('Test error'));

      await request(app)
        .post('/api/upload')
        .field('sessionId', testSessionId)
        .attach('scormPackages', testScormPackage, 'test.zip')
        .expect(200); // Should still return 200 but with error in package

      // Restore original function
      scormProcessor.validateAndParsePackage = originalValidate;
    });
  });
});