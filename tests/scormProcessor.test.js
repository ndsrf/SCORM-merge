const fs = require('fs').promises;
const path = require('path');
const JSZip = require('jszip');
const scormProcessor = require('../server/scormProcessor');

describe('ScormProcessor', () => {
  let testScormPackage;
  let testPackagePath;

  beforeAll(async () => {
    // Create a test SCORM package
    const zip = new JSZip();
    
    const testManifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="test-package" version="1.3"
          xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
          xmlns:lom="http://ltsc.ieee.org/xsd/LOM">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 3rd Edition</schemaversion>
    <lom xmlns="http://ltsc.ieee.org/xsd/LOM">
      <general>
        <title>
          <string language="en">Test SCORM Package</string>
        </title>
      </general>
    </lom>
  </metadata>
  <organizations default="test-org">
    <organization identifier="test-org">
      <title>Test Organization</title>
      <item identifier="test-item" identifierref="test-resource">
        <title>Test Item</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="test-resource" type="webcontent" adlcp:scormType="sco" href="index.html">
      <file href="index.html" />
      <file href="test.js" />
    </resource>
  </resources>
</manifest>`;

    const testHtml = `<!DOCTYPE html>
<html>
<head><title>Test SCORM</title></head>
<body><h1>Test SCORM Content</h1></body>
</html>`;

    const testJs = `console.log('Test SCORM JavaScript');`;

    zip.file('imsmanifest.xml', testManifest);
    zip.file('index.html', testHtml);
    zip.file('test.js', testJs);

    testScormPackage = await zip.generateAsync({ type: 'nodebuffer' });
    testPackagePath = path.join('test-uploads', 'test-package.zip');
    
    await fs.writeFile(testPackagePath, testScormPackage);
  });

  afterAll(async () => {
    try {
      await fs.unlink(testPackagePath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('validateAndParsePackage', () => {
    test('should successfully parse a valid SCORM package', async () => {
      const result = await scormProcessor.validateAndParsePackage(testPackagePath);
      
      expect(result).toHaveProperty('title', 'Test SCORM Package');
      expect(result).toHaveProperty('version', '2004 3rd Edition');
      expect(result).toHaveProperty('identifier', 'test-package');
      expect(result).toHaveProperty('organizations');
      expect(result).toHaveProperty('resources');
      expect(result).toHaveProperty('manifest');
      expect(result).toHaveProperty('zipContents');
      
      expect(result.organizations).toHaveLength(1);
      expect(result.organizations[0]).toHaveProperty('identifier', 'test-org');
      expect(result.organizations[0]).toHaveProperty('title', 'Test Organization');
      
      expect(result.resources).toHaveLength(1);
      expect(result.resources[0]).toHaveProperty('identifier', 'test-resource');
      expect(result.resources[0]).toHaveProperty('href', 'index.html');
    });

    test('should throw an error for non-existent package', async () => {
      await expect(scormProcessor.validateAndParsePackage('non-existent.zip'))
        .rejects.toThrow();
    });

    test('should throw an error for package without imsmanifest.xml', async () => {
      const zip = new JSZip();
      zip.file('index.html', '<html><body>No manifest</body></html>');
      
      const invalidPackage = await zip.generateAsync({ type: 'nodebuffer' });
      const invalidPath = path.join('test-uploads', 'invalid-package.zip');
      
      await fs.writeFile(invalidPath, invalidPackage);
      
      await expect(scormProcessor.validateAndParsePackage(invalidPath))
        .rejects.toThrow('No imsmanifest.xml found at root level');
      
      await fs.unlink(invalidPath);
    });
  });

  describe('extractMetadata', () => {
    test('should extract metadata from manifest', () => {
      const mockManifest = {
        manifest: {
          $: { identifier: 'test-id' },
          metadata: [{
            schemaversion: ['1.2'],
            lom: [{
              general: [{
                title: [{
                  string: [{ _: 'Test Title' }]
                }]
              }]
            }]
          }]
        }
      };

      const metadata = scormProcessor.extractMetadata(mockManifest);
      
      expect(metadata.title).toBe('Test Title');
      expect(metadata.version).toBe('1.2');
      expect(metadata.identifier).toBe('test-id');
    });

    test('should handle missing metadata gracefully', () => {
      const mockManifest = {
        manifest: {
          $: { identifier: 'test-id' }
        }
      };

      const metadata = scormProcessor.extractMetadata(mockManifest);
      
      expect(metadata.title).toBe('Untitled');
      expect(metadata.version).toBe('Unknown');
      expect(metadata.identifier).toBe('test-id');
    });
  });

  describe('extractOrganizations', () => {
    test('should extract organizations from manifest', () => {
      const mockManifest = {
        manifest: {
          organizations: [{
            organization: [{
              $: { identifier: 'org-1' },
              title: ['Organization 1'],
              item: [{
                $: { identifier: 'item-1', identifierref: 'resource-1' },
                title: ['Item 1']
              }]
            }]
          }]
        }
      };

      const organizations = scormProcessor.extractOrganizations(mockManifest);
      
      expect(organizations).toHaveLength(1);
      expect(organizations[0].identifier).toBe('org-1');
      expect(organizations[0].title).toBe('Organization 1');
      expect(organizations[0].items).toHaveLength(1);
      expect(organizations[0].items[0].identifier).toBe('item-1');
      expect(organizations[0].items[0].title).toBe('Item 1');
    });

    test('should return empty array for missing organizations', () => {
      const mockManifest = { manifest: {} };
      const organizations = scormProcessor.extractOrganizations(mockManifest);
      expect(organizations).toEqual([]);
    });
  });

  describe('extractResources', () => {
    test('should extract resources from manifest', () => {
      const mockManifest = {
        manifest: {
          resources: [{
            resource: [{
              $: { 
                identifier: 'resource-1', 
                type: 'webcontent', 
                href: 'index.html' 
              },
              file: [
                { $: { href: 'index.html' } },
                { $: { href: 'style.css' } }
              ]
            }]
          }]
        }
      };

      const resources = scormProcessor.extractResources(mockManifest);
      
      expect(resources).toHaveLength(1);
      expect(resources[0].identifier).toBe('resource-1');
      expect(resources[0].type).toBe('webcontent');
      expect(resources[0].href).toBe('index.html');
      expect(resources[0].files).toEqual(['index.html', 'style.css']);
    });

    test('should return empty array for missing resources', () => {
      const mockManifest = { manifest: {} };
      const resources = scormProcessor.extractResources(mockManifest);
      expect(resources).toEqual([]);
    });
  });

  describe('createMergedManifest', () => {
    test('should create a valid merged manifest', () => {
      const packages = [
        {
          title: 'Package 1',
          version: '1.2',
          identifier: 'pkg1',
          resources: [{ href: 'index.html', files: ['index.html'] }]
        },
        {
          title: 'Package 2',
          version: '2004 3rd Edition',
          identifier: 'pkg2',
          resources: [{ href: 'main.html', files: ['main.html', 'script.js'] }]
        }
      ];

      const manifest = scormProcessor.createMergedManifest(packages);
      
      expect(manifest).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(manifest).toContain('<manifest identifier=');
      expect(manifest).toContain('Merged SCORM Package');
      expect(manifest).toContain('Course Menu');
      expect(manifest).toContain('Package 1');
      expect(manifest).toContain('Package 2');
      expect(manifest).toContain('menu/index.html');
      expect(manifest).toContain('package_1/index.html');
      expect(manifest).toContain('package_2/main.html');
    });

    test('should handle packages with no resources', () => {
      const packages = [
        {
          title: 'Package 1',
          version: '1.2',
          identifier: 'pkg1',
          resources: []
        }
      ];

      const manifest = scormProcessor.createMergedManifest(packages);
      
      expect(manifest).toContain('Package 1');
      expect(manifest).toContain('package_1/index.html'); // Default fallback
    });
  });

  describe('createMenuFiles', () => {
    test('should create menu files with correct structure', () => {
      const packages = [
        {
          title: 'Test Package 1',
          version: '1.2',
          filename: 'package1.zip',
          resources: [{ href: 'index.html' }]
        },
        {
          title: 'Test Package 2',
          version: '2004',
          filename: 'package2.zip',
          resources: [{ href: 'main.html' }]
        }
      ];

      const menuFiles = scormProcessor.createMenuFiles(packages);
      
      expect(Object.keys(menuFiles)).toContain('menu/index.html');
      expect(Object.keys(menuFiles)).toContain('menu/menu.js');
      expect(Object.keys(menuFiles)).toContain('menu/style.css');
      
      const html = menuFiles['menu/index.html'];
      expect(html).toContain('Test Package 1');
      expect(html).toContain('Test Package 2');
      expect(html).toContain('Launch Module');
      
      const js = menuFiles['menu/menu.js'];
      expect(js).toContain('launchPackage');
      expect(js).toContain('initializeSCORM');
      expect(js).toContain('findAPI');
      
      const css = menuFiles['menu/style.css'];
      expect(css).toContain('.menu-container');
      expect(css).toContain('.menu-item');
    });

    test('should handle empty packages array', () => {
      const menuFiles = scormProcessor.createMenuFiles([]);
      
      expect(Object.keys(menuFiles)).toContain('menu/index.html');
      expect(Object.keys(menuFiles)).toContain('menu/menu.js');
      expect(Object.keys(menuFiles)).toContain('menu/style.css');
      
      const html = menuFiles['menu/index.html'];
      expect(html).toContain('Course Menu');
    });
  });

  describe('escapeXml', () => {
    test('should escape XML special characters', () => {
      const input = 'Test & "quotes" <tags> \'apostrophes\'';
      const expected = 'Test &amp; &quot;quotes&quot; &lt;tags&gt; &#39;apostrophes&#39;';
      
      const result = scormProcessor.escapeXml(input);
      expect(result).toBe(expected);
    });

    test('should handle empty string', () => {
      const result = scormProcessor.escapeXml('');
      expect(result).toBe('');
    });
  });

  describe('mergePackages', () => {
    test('should merge packages successfully', async () => {
      const packages = [{
        title: 'Test Package',
        version: '1.2',
        identifier: 'test-pkg',
        path: testPackagePath,
        resources: [{ href: 'index.html', files: ['index.html'] }]
      }];

      const progressCallback = jest.fn();
      
      const outputPath = await scormProcessor.mergePackages(packages, progressCallback);
      
      expect(outputPath).toBeTruthy();
      expect(outputPath).toContain('merged-scorm-');
      expect(outputPath).toContain('.zip');
      
      // Verify progress callback was called
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ step: 'Creating merged manifest', progress: 5 })
      );
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ step: 'Complete', progress: 100 })
      );
      
      // Verify the merged package exists and contains expected files
      const mergedData = await fs.readFile(outputPath);
      const mergedZip = new JSZip();
      const zipContents = await mergedZip.loadAsync(mergedData);
      
      expect(zipContents.file('imsmanifest.xml')).toBeTruthy();
      expect(zipContents.file('menu/index.html')).toBeTruthy();
      expect(zipContents.file('menu/menu.js')).toBeTruthy();
      expect(zipContents.file('menu/style.css')).toBeTruthy();
      expect(zipContents.file('package_1/index.html')).toBeTruthy();
      expect(zipContents.file('package_1/test.js')).toBeTruthy();
      
      // Verify manifest content
      const manifestContent = await zipContents.file('imsmanifest.xml').async('string');
      expect(manifestContent).toContain('Merged SCORM Package');
      expect(manifestContent).toContain('Course Menu');
      expect(manifestContent).toContain('Test Package');
      
      // Cleanup
      await fs.unlink(outputPath);
    }, 15000);

    test('should handle multiple packages', async () => {
      // Create second test package
      const zip2 = new JSZip();
      zip2.file('imsmanifest.xml', `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="test-package-2" version="1.3">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="org-2">
    <organization identifier="org-2">
      <title>Test Package 2</title>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res-2" href="main.html">
      <file href="main.html" />
    </resource>
  </resources>
</manifest>`);
      zip2.file('main.html', '<html><body><h1>Package 2</h1></body></html>');
      
      const testPackage2 = await zip2.generateAsync({ type: 'nodebuffer' });
      const testPackagePath2 = path.join('test-uploads', 'test-package-2.zip');
      await fs.writeFile(testPackagePath2, testPackage2);

      const packages = [
        {
          title: 'Test Package 1',
          version: '2004 3rd Edition',
          path: testPackagePath,
          resources: [{ href: 'index.html' }]
        },
        {
          title: 'Test Package 2',
          version: '1.2',
          path: testPackagePath2,
          resources: [{ href: 'main.html' }]
        }
      ];

      const outputPath = await scormProcessor.mergePackages(packages);
      
      const mergedData = await fs.readFile(outputPath);
      const mergedZip = new JSZip();
      const zipContents = await mergedZip.loadAsync(mergedData);
      
      expect(zipContents.file('package_1/index.html')).toBeTruthy();
      expect(zipContents.file('package_2/main.html')).toBeTruthy();
      
      // Cleanup
      await fs.unlink(outputPath);
      await fs.unlink(testPackagePath2);
    }, 15000);
  });
});