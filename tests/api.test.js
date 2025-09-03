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
        const packageInfo = await scormProcessor.validateAndParsePackage(file.path, file.originalname);
        const packageData = {
          id: Date.now() + Math.random(),
          filename: file.originalname,
          path: file.path,
          ...packageInfo
        };
        // Use friendly display title for frontend
        packageData.title = scormProcessor.getDisplayTitle(packageData);
        
        // Generate description for tests (use fallback to avoid API calls)
        try {
          packageData.description = await scormProcessor.generateDescription(packageData);
        } catch (error) {
          console.error('Error generating description in test:', error);
          packageData.description = 'SCORM learning module';
        }
        
        packages.push(packageData);
      } catch (error) {
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

    // Sort packages alphabetically by title (using display title which includes friendly names)
    validPackages.sort((a, b) => {
      const titleA = scormProcessor.getDisplayTitle(a).toLowerCase();
      const titleB = scormProcessor.getDisplayTitle(b).toLowerCase();
      return titleA.localeCompare(titleB);
    });

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

    test('should use friendly names for packages with no metadata title', async () => {
      // Create a SCORM package without LOM title metadata - will default to "Untitled SCORM Package"
      const zip = new JSZip();
      const untitledManifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="untitled-package" version="1.3"
          xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 3rd Edition</schemaversion>
  </metadata>
  <organizations default="test-org">
    <organization identifier="test-org">
      <title>Untitled Organization</title>
    </organization>
  </organizations>
  <resources>
    <resource identifier="test-resource" href="index.html">
      <file href="index.html" />
    </resource>
  </resources>
</manifest>`;

      zip.file('imsmanifest.xml', untitledManifest);
      zip.file('index.html', '<html><body><h1>Test</h1></body></html>');

      const untitledPackage = await zip.generateAsync({ type: 'nodebuffer' });

      const response = await request(app)
        .post('/api/upload')
        .field('sessionId', testSessionId)
        .attach('scormPackages', untitledPackage, 'advanced-javascript-course.zip')
        .expect(200);

      expect(response.body.packages).toHaveLength(1);
      const pkg = response.body.packages[0];
      
      // Should use friendly filename instead of generic titles
      expect(pkg.title).toBe('Advanced Javascript Course');
      expect(pkg.filename).toBe('advanced-javascript-course.zip');
    });

    test('should return packages with descriptions', async () => {
      const response = await request(app)
        .post('/api/upload')
        .field('sessionId', testSessionId)
        .attach('scormPackages', testScormPackage, 'test-package.zip')
        .expect(200);

      expect(response.body.packages).toHaveLength(1);
      const pkg = response.body.packages[0];
      
      // Should include description field
      expect(pkg).toHaveProperty('description');
      expect(typeof pkg.description).toBe('string');
      expect(pkg.description.length).toBeGreaterThan(0);
    });

    test('should return packages in alphabetical order by title', async () => {
      // Upload packages with titles that are NOT in alphabetical order
      const sessionId = 'alphabetical-test-' + Date.now();
      
      // Create packages: Zebra, Apple, Middle (uploaded in non-alphabetical order)
      const zebraPackage = new JSZip();
      const zebraManifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="zebra-pkg" version="1.3" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1">
  <metadata>
    <lom xmlns="http://ltsc.ieee.org/xsd/LOM">
      <general>
        <title><string language="en">Zebra Course</string></title>
      </general>
    </lom>
  </metadata>
  <organizations default="zebra-org">
    <organization identifier="zebra-org">
      <title>Zebra Course</title>
    </organization>
  </organizations>
  <resources><resource identifier="zebra-res" href="zebra.html"><file href="zebra.html"/></resource></resources>
</manifest>`;
      zebraPackage.file('imsmanifest.xml', zebraManifest);
      zebraPackage.file('zebra.html', '<html><body>Zebra</body></html>');
      const zebraBuffer = await zebraPackage.generateAsync({ type: 'nodebuffer' });

      const applePackage = new JSZip();
      const appleManifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="apple-pkg" version="1.3" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1">
  <metadata>
    <lom xmlns="http://ltsc.ieee.org/xsd/LOM">
      <general>
        <title><string language="en">Apple Course</string></title>
      </general>
    </lom>
  </metadata>
  <organizations default="apple-org">
    <organization identifier="apple-org">
      <title>Apple Course</title>
    </organization>
  </organizations>
  <resources><resource identifier="apple-res" href="apple.html"><file href="apple.html"/></resource></resources>
</manifest>`;
      applePackage.file('imsmanifest.xml', appleManifest);
      applePackage.file('apple.html', '<html><body>Apple</body></html>');
      const appleBuffer = await applePackage.generateAsync({ type: 'nodebuffer' });

      // Third package uses filename for friendly name (Untitled -> "Middle Course")
      const middlePackage = new JSZip();
      const middleManifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="middle-pkg" version="1.3" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1">
  <metadata/>
  <organizations default="middle-org">
    <organization identifier="middle-org">
      <title>Untitled</title>
    </organization>
  </organizations>
  <resources><resource identifier="middle-res" href="middle.html"><file href="middle.html"/></resource></resources>
</manifest>`;
      middlePackage.file('imsmanifest.xml', middleManifest);
      middlePackage.file('middle.html', '<html><body>Middle</body></html>');
      const middleBuffer = await middlePackage.generateAsync({ type: 'nodebuffer' });

      // Upload in wrong order: Zebra first, Apple second, Middle third
      const response = await request(app)
        .post('/api/upload')
        .field('sessionId', sessionId)
        .attach('scormPackages', zebraBuffer, 'zebra-course.zip')
        .attach('scormPackages', appleBuffer, 'apple-course.zip')
        .attach('scormPackages', middleBuffer, 'middle-course.zip')
        .expect(200);

      expect(response.body.packages).toHaveLength(3);
      
      // Should be returned in alphabetical order: Apple, Middle Course, Zebra
      expect(response.body.packages[0].title).toBe('Apple Course');
      expect(response.body.packages[1].title).toBe('Middle Course'); // Friendly name from filename
      expect(response.body.packages[2].title).toBe('Zebra Course');
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

    test('should merge packages in alphabetical order by title', async () => {
      // Create multiple test packages with different titles  
      const sessionId = 'test-alphabetical-' + Date.now();
      
      // Package 1: "Zebra Course" (will be last alphabetically)
      const package1 = new JSZip();
      const manifest1 = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="zebra-package" version="1.3" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 3rd Edition</schemaversion>
    <lom xmlns="http://ltsc.ieee.org/xsd/LOM">
      <general>
        <title>
          <string language="en">Zebra Course</string>
        </title>
      </general>
    </lom>
  </metadata>
  <organizations default="zebra-org">
    <organization identifier="zebra-org">
      <title>Zebra Course</title>
      <item identifier="zebra-item" identifierref="zebra-resource">
        <title>Zebra Item</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="zebra-resource" href="zebra.html">
      <file href="zebra.html" />
    </resource>
  </resources>
</manifest>`;
      package1.file('imsmanifest.xml', manifest1);
      package1.file('zebra.html', '<html><body>Zebra</body></html>');
      const package1Buffer = await package1.generateAsync({ type: 'nodebuffer' });

      // Package 2: "Apple Course" (will be first alphabetically)
      const package2 = new JSZip();
      const manifest2 = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="apple-package" version="1.3" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 3rd Edition</schemaversion>
    <lom xmlns="http://ltsc.ieee.org/xsd/LOM">
      <general>
        <title>
          <string language="en">Apple Course</string>
        </title>
      </general>
    </lom>
  </metadata>
  <organizations default="apple-org">
    <organization identifier="apple-org">
      <title>Apple Course</title>
      <item identifier="apple-item" identifierref="apple-resource">
        <title>Apple Item</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="apple-resource" href="apple.html">
      <file href="apple.html" />
    </resource>
  </resources>
</manifest>`;
      package2.file('imsmanifest.xml', manifest2);
      package2.file('apple.html', '<html><body>Apple</body></html>');
      const package2Buffer = await package2.generateAsync({ type: 'nodebuffer' });

      // Package 3: Uses filename for friendly name - will be middle
      const package3 = new JSZip();
      const manifest3 = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="middle-package" version="1.3" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 3rd Edition</schemaversion>
  </metadata>
  <organizations default="middle-org">
    <organization identifier="middle-org">
      <title>Untitled</title>
      <item identifier="middle-item" identifierref="middle-resource">
        <title>Middle Item</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="middle-resource" href="middle.html">
      <file href="middle.html" />
    </resource>
  </resources>
</manifest>`;
      package3.file('imsmanifest.xml', manifest3);
      package3.file('middle.html', '<html><body>Middle</body></html>');
      const package3Buffer = await package3.generateAsync({ type: 'nodebuffer' });

      // Upload packages in wrong order (Zebra first, Apple second, Middle third)
      await request(app)
        .post('/api/upload')
        .field('sessionId', sessionId)
        .attach('scormPackages', package1Buffer, 'zebra-course.zip')
        .attach('scormPackages', package2Buffer, 'apple-course.zip')
        .attach('scormPackages', package3Buffer, 'middle-course.zip')
        .expect(200);

      // Merge packages
      const mergeResponse = await request(app)
        .post('/api/merge')
        .send({ sessionId })
        .expect(200);

      expect(mergeResponse.body).toHaveProperty('downloadUrl');

      // Verify the merged manifest has packages in alphabetical order
      const downloadUrl = mergeResponse.body.downloadUrl;
      const filename = downloadUrl.split('/').pop();
      const mergedPath = path.join(__dirname, '../temp', filename);
      
      // Read the merged ZIP and check manifest
      const mergedData = await fs.readFile(mergedPath);
      const mergedZip = new JSZip();
      const zipContents = await mergedZip.loadAsync(mergedData);
      const manifestFile = zipContents.file('imsmanifest.xml');
      const manifestXml = await manifestFile.async('string');

      // Check that packages appear in alphabetical order: Apple, Middle Course, Zebra
      const appleIndex = manifestXml.indexOf('Apple Course');
      const middleIndex = manifestXml.indexOf('Middle Course');
      const zebraIndex = manifestXml.indexOf('Zebra Course');

      expect(appleIndex).toBeGreaterThan(0);
      expect(middleIndex).toBeGreaterThan(0);
      expect(zebraIndex).toBeGreaterThan(0);

      // Verify alphabetical order
      expect(appleIndex).toBeLessThan(middleIndex);
      expect(middleIndex).toBeLessThan(zebraIndex);

      // Cleanup
      await fs.unlink(mergedPath);
    }, 15000);
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