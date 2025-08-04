import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

// Helper function to create a test SCORM package
async function createTestScormPackage(title: string, identifier: string): Promise<Buffer> {
  const zip = new JSZip();
  
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${identifier}" version="1.3"
          xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 3rd Edition</schemaversion>
    <lom:lom xmlns:lom="http://ltsc.ieee.org/xsd/LOM">
      <lom:general>
        <lom:title>
          <lom:string language="en">${title}</lom:string>
        </lom:title>
      </lom:general>
    </lom:lom>
  </metadata>
  <organizations default="${identifier}-org">
    <organization identifier="${identifier}-org">
      <title>${title}</title>
      <item identifier="${identifier}-item" identifierref="${identifier}-resource">
        <title>${title} Item</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="${identifier}-resource" type="webcontent" adlcp:scormType="sco" href="index.html">
      <file href="index.html" />
      <file href="script.js" />
    </resource>
  </resources>
</manifest>`;

  const html = `<!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <script src="script.js"></script>
</head>
<body>
    <h1>${title}</h1>
    <p>This is a test SCORM package for ${title}.</p>
    <button onclick="completeLesson()">Complete Lesson</button>
</body>
</html>`;

  const script = `
function completeLesson() {
    if (window.parent && window.parent.API) {
        window.parent.API.LMSSetValue('cmi.core.lesson_status', 'completed');
        window.parent.API.LMSCommit('');
        alert('Lesson completed!');
    } else {
        alert('SCORM API not found - lesson completed locally');
    }
}
`;

  zip.file('imsmanifest.xml', manifest);
  zip.file('index.html', html);
  zip.file('script.js', script);

  return await zip.generateAsync({ type: 'nodebuffer' });
}

test.describe('SCORM Merge Application', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the main page with correct title', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('SCORM Package Merger');
    await expect(page.locator('header p')).toHaveText('Merge multiple SCORM packages into a single package');
  });

  test('should show step indicator with upload active', async ({ page }) => {
    const stepIndicator = page.locator('.step-indicator');
    await expect(stepIndicator).toBeVisible();
    
    const steps = stepIndicator.locator('.step');
    await expect(steps).toHaveCount(3);
    
    await expect(steps.nth(0)).toHaveClass(/active/);
    await expect(steps.nth(0).locator('.step-label')).toHaveText('Upload');
    await expect(steps.nth(1).locator('.step-label')).toHaveText('Sort');
    await expect(steps.nth(2).locator('.step-label')).toHaveText('Merge');
  });

  test('should show upload step initially', async ({ page }) => {
    await expect(page.locator('h2')).toHaveText('Step 1: Upload SCORM Packages');
    await expect(page.locator('.dropzone')).toBeVisible();
    await expect(page.locator('.dropzone')).toContainText('Drag & drop SCORM packages here');
  });

  test('should show session ID in debug mode', async ({ page }) => {
    // Wait for WebSocket connection and session ID
    await page.waitForFunction(() => {
      const debugElement = document.querySelector('[style*="background: #f0f0f0"]');
      return debugElement && debugElement.textContent?.includes('Session ID');
    }, { timeout: 10000 });

    const debugPanel = page.locator('[style*="background: #f0f0f0"]').first();
    await expect(debugPanel).toContainText('Session ID');
    await expect(debugPanel).toContainText('Files = 0');
  });

  test('complete workflow: upload, sort, and merge SCORM packages', async ({ page }) => {
    // Create test SCORM packages
    const package1 = await createTestScormPackage('Math Basics', 'math-basics');
    const package2 = await createTestScormPackage('Science Fundamentals', 'science-fund');

    // Write test files to temporary location
    const testDir = path.join(__dirname, '../temp-test');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const package1Path = path.join(testDir, 'math-basics.zip');
    const package2Path = path.join(testDir, 'science-fundamentals.zip');

    fs.writeFileSync(package1Path, package1);
    fs.writeFileSync(package2Path, package2);

    try {
      // Step 1: Upload packages
      await expect(page.locator('h2')).toHaveText('Step 1: Upload SCORM Packages');

      // Wait for session ID to be available
      await page.waitForFunction(() => {
        const debugElement = document.querySelector('[style*="background: #f0f0f0"]');
        return debugElement && debugElement.textContent?.includes('Session ID') && 
               !debugElement.textContent?.includes('Session ID = ""');
      }, { timeout: 10000 });

      // Upload first package
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(package1Path);

      // Wait for file to appear in the list
      await expect(page.locator('.file-item')).toContainText('math-basics.zip');

      // Upload second package
      await fileInput.setInputFiles([package1Path, package2Path]);

      // Wait for both files to appear
      await expect(page.locator('.file-item')).toHaveCount(2);
      await expect(page.locator('.file-item').nth(0)).toContainText('math-basics.zip');
      await expect(page.locator('.file-item').nth(1)).toContainText('science-fundamentals.zip');

      // Click upload button
      const uploadButton = page.locator('.upload-btn');
      await expect(uploadButton).toContainText('Upload 2 Packages');
      await uploadButton.click();

      // Wait for upload to complete and move to step 2
      await expect(page.locator('h2')).toHaveText('Step 2: Sort Package Order', { timeout: 15000 });

      // Step 2: Sort packages
      await expect(page.locator('.packages-section h3')).toContainText('Valid Packages (2)');
      await expect(page.locator('.sortable-item')).toHaveCount(2);
      
      // Verify package titles are displayed
      await expect(page.locator('.package-title').nth(0)).toContainText('Math Basics');
      await expect(page.locator('.package-title').nth(1)).toContainText('Science Fundamentals');

      // Click continue to merge
      const continueButton = page.locator('.continue-btn');
      await expect(continueButton).toContainText('Continue to Merge');
      await continueButton.click();

      // Wait for step 3
      await expect(page.locator('h2')).toHaveText('Step 3: Merge Packages', { timeout: 10000 });

      // Step 3: Merge packages
      await expect(page.locator('.merge-summary h3')).toHaveText('Merge Summary');
      await expect(page.locator('.package-summary-item')).toHaveCount(2);

      // Start merge process
      const mergeButton = page.locator('.merge-btn');
      await expect(mergeButton).toContainText('Start Merge Process');
      await mergeButton.click();

      // Wait for merge to complete
      await expect(page.locator('h3')).toContainText('Merge Complete!', { timeout: 30000 });

      // Verify success message and download button
      await expect(page.locator('.merge-success')).toContainText('Your merged SCORM package is ready for download');
      await expect(page.locator('.download-btn')).toContainText('Download Merged SCORM Package');

      // Verify success details
      await expect(page.locator('.success-details')).toContainText('Section 1: Math Basics');
      await expect(page.locator('.success-details')).toContainText('Section 2: Science Fundamentals');

      // Verify usage instructions
      await expect(page.locator('.usage-note')).toContainText('Using Your Merged Package:');
      await expect(page.locator('.usage-note')).toContainText('The downloaded ZIP file is a valid SCORM package');

    } finally {
      // Cleanup test files
      if (fs.existsSync(package1Path)) fs.unlinkSync(package1Path);
      if (fs.existsSync(package2Path)) fs.unlinkSync(package2Path);
      if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
    }
  });

  test('should handle invalid SCORM packages', async ({ page }) => {
    // Create invalid ZIP file (no manifest)
    const invalidZip = new JSZip();
    invalidZip.file('readme.txt', 'This is not a SCORM package');
    const invalidPackage = await invalidZip.generateAsync({ type: 'nodebuffer' });

    const testDir = path.join(__dirname, '../temp-test');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const invalidPath = path.join(testDir, 'invalid.zip');
    fs.writeFileSync(invalidPath, invalidPackage);

    try {
      // Wait for session ID
      await page.waitForFunction(() => {
        const debugElement = document.querySelector('[style*="background: #f0f0f0"]');
        return debugElement && debugElement.textContent?.includes('Session ID') && 
               !debugElement.textContent?.includes('Session ID = ""');
      }, { timeout: 10000 });

      // Upload invalid package
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(invalidPath);

      await expect(page.locator('.file-item')).toContainText('invalid.zip');

      const uploadButton = page.locator('.upload-btn');
      await uploadButton.click();

      // Should still move to step 2
      await expect(page.locator('h2')).toHaveText('Step 2: Sort Package Order', { timeout: 15000 });

      // Should show error packages section
      await expect(page.locator('.packages-section').nth(1).locator('h3')).toContainText('Packages with Errors (1)');
      await expect(page.locator('.error-item')).toContainText('No imsmanifest.xml found');

      // Continue button should be disabled
      await expect(page.locator('.continue-btn')).toBeDisabled();
      await expect(page.locator('.no-valid-packages')).toContainText('No valid SCORM packages found');

    } finally {
      // Cleanup
      if (fs.existsSync(invalidPath)) fs.unlinkSync(invalidPath);
      if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
    }
  });

  test('should handle back navigation', async ({ page }) => {
    // Create a test package
    const testPackage = await createTestScormPackage('Test Package', 'test-pkg');
    const testDir = path.join(__dirname, '../temp-test');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const packagePath = path.join(testDir, 'test.zip');
    fs.writeFileSync(packagePath, testPackage);

    try {
      // Upload and get to step 2
      await page.waitForFunction(() => {
        const debugElement = document.querySelector('[style*="background: #f0f0f0"]');
        return debugElement && debugElement.textContent?.includes('Session ID') && 
               !debugElement.textContent?.includes('Session ID = ""');
      }, { timeout: 10000 });

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(packagePath);
      await page.locator('.upload-btn').click();

      await expect(page.locator('h2')).toHaveText('Step 2: Sort Package Order', { timeout: 15000 });

      // Click back button
      await page.locator('.back-btn').click();
      await expect(page.locator('h2')).toHaveText('Step 1: Upload SCORM Packages');

      // Go forward again and then to step 3
      await fileInput.setInputFiles(packagePath);
      await page.locator('.upload-btn').click();
      await expect(page.locator('h2')).toHaveText('Step 2: Sort Package Order', { timeout: 15000 });

      await page.locator('.continue-btn').click();
      await expect(page.locator('h2')).toHaveText('Step 3: Merge Packages', { timeout: 10000 });

      // Click back to sort
      await page.locator('.back-btn').click();
      await expect(page.locator('h2')).toHaveText('Step 2: Sort Package Order');

    } finally {
      if (fs.existsSync(packagePath)) fs.unlinkSync(packagePath);
      if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
    }
  });

  test('should show progress during merge', async ({ page }) => {
    // Create test package
    const testPackage = await createTestScormPackage('Progress Test', 'progress-test');
    const testDir = path.join(__dirname, '../temp-test');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const packagePath = path.join(testDir, 'progress-test.zip');
    fs.writeFileSync(packagePath, testPackage);

    try {
      // Get to merge step
      await page.waitForFunction(() => {
        const debugElement = document.querySelector('[style*="background: #f0f0f0"]');
        return debugElement && debugElement.textContent?.includes('Session ID') && 
               !debugElement.textContent?.includes('Session ID = ""');
      }, { timeout: 10000 });

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(packagePath);
      await page.locator('.upload-btn').click();
      await expect(page.locator('h2')).toHaveText('Step 2: Sort Package Order', { timeout: 15000 });

      await page.locator('.continue-btn').click();
      await expect(page.locator('h2')).toHaveText('Step 3: Merge Packages', { timeout: 10000 });

      // Start merge and check for progress
      await page.locator('.merge-btn').click();

      // Should show merging state
      await expect(page.locator('.merge-progress h3')).toContainText('Merging Packages...', { timeout: 5000 });

      // Wait for completion
      await expect(page.locator('h3')).toContainText('Merge Complete!', { timeout: 30000 });

    } finally {
      if (fs.existsSync(packagePath)) fs.unlinkSync(packagePath);
      if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
    }
  });

  test('should handle file size limits', async ({ page }) => {
    // Note: This test would require creating a file larger than 200MB, 
    // which is not practical in a test environment. Instead, we'll test
    // the UI validation message.

    await expect(page.locator('.dropzone small')).toContainText('max 200MB per file, 100 files total');
  });

  test('should show responsive design on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE size

    await expect(page.locator('.App-header h1')).toBeVisible();
    await expect(page.locator('.step-indicator')).toBeVisible();
    await expect(page.locator('.dropzone')).toBeVisible();

    // Check that layout adapts to mobile
    const mainContent = page.locator('.main-content');
    await expect(mainContent).toHaveCSS('padding', '16px');
  });
});