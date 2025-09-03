const JSZip = require('jszip');
const xml2js = require('xml2js');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class ScormProcessor {
  /**
   * Converts a filename to a friendly display name
   * Examples: 
   * "my-course-module.zip" -> "My Course Module"
   * "lesson_01_intro.zip" -> "Lesson 01 Intro"
   * "CourseModule1.zip" -> "Course Module 1"
   */
  generateFriendlyNameFromFilename(filename) {
    // Remove file extension
    let name = filename.replace(/\.[^/.]+$/, '');
    
    // Replace common separators with spaces
    name = name.replace(/[-_]/g, ' ');
    
    // Insert spaces before capital letters that follow lowercase letters or numbers
    name = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    
    // Insert spaces between letters and numbers
    name = name.replace(/([a-zA-Z])([0-9])/g, '$1 $2');
    name = name.replace(/([0-9])([a-zA-Z])/g, '$1 $2');
    
    // Clean up multiple spaces and trim
    name = name.replace(/\s+/g, ' ').trim();
    
    // Capitalize first letter of each word
    name = name.replace(/\b\w/g, l => l.toUpperCase());
    
    return name || 'Untitled Course';
  }

  /**
   * Gets the display title for a package, using friendly filename if title is "Untitled"
   */
  getDisplayTitle(pkg) {
    if (pkg.title && pkg.title !== 'Untitled' && pkg.title !== 'Untitled SCORM Package') {
      return pkg.title;
    }
    
    if (pkg.filename) {
      return this.generateFriendlyNameFromFilename(pkg.filename);
    }
    
    return pkg.title || 'Untitled Course';
  }

  async validateAndParsePackage(packagePath, filename = null) {
    try {
      const zipData = await fs.readFile(packagePath);
      const zip = new JSZip();
      const zipContents = await zip.loadAsync(zipData);
      
      const manifestFile = zipContents.file('imsmanifest.xml');
      if (!manifestFile) {
        throw new Error('No imsmanifest.xml found at root level');
      }
      
      const manifestXml = await manifestFile.async('string');
      const parser = new xml2js.Parser();
      const manifest = await parser.parseStringPromise(manifestXml);
      
      const metadata = this.extractMetadata(manifest);
      const organizations = this.extractOrganizations(manifest);
      const resources = this.extractResources(manifest);
      
      // Extract content sample for description generation
      let contentSample = '';
      try {
        contentSample = await this.extractContentSample(zipContents);
      } catch (error) {
        console.log('Could not extract content sample:', error.message);
      }
      
      return {
        title: metadata.title || 'Untitled SCORM Package',
        description: metadata.description || '', // Include existing description
        version: metadata.version || 'Unknown',
        identifier: metadata.identifier || uuidv4(),
        organizations,
        resources,
        manifest: manifestXml,
        zipContents,
        contentSample,
        filename: filename || null
      };
    } catch (error) {
      throw new Error(`Invalid SCORM package: ${error.message}`);
    }
  }
  
  extractMetadata(manifest) {
    const metadata = manifest?.manifest?.metadata?.[0];
    
    let title = 'Untitled';
    let description = '';
    let version = 'Unknown';
    let identifier = manifest?.manifest?.$?.identifier;
    
    // Try different LOM structures for title
    if (metadata?.lom?.[0]?.general?.[0]?.title?.[0]?.string?.[0]?._) {
      title = metadata.lom[0].general[0].title[0].string[0]._;
    } else if (metadata?.lom?.[0]?.general?.[0]?.title?.[0]?.string?.[0]) {
      title = metadata.lom[0].general[0].title[0].string[0];
    } else if (metadata?.['lom:lom']?.[0]?.['lom:general']?.[0]?.['lom:title']?.[0]?.['lom:string']?.[0]?._) {
      title = metadata['lom:lom'][0]['lom:general'][0]['lom:title'][0]['lom:string'][0]._;
    }

    // Try different LOM structures for description
    if (metadata?.lom?.[0]?.general?.[0]?.description?.[0]?.string?.[0]?._) {
      description = metadata.lom[0].general[0].description[0].string[0]._;
    } else if (metadata?.lom?.[0]?.general?.[0]?.description?.[0]?.string?.[0]) {
      description = metadata.lom[0].general[0].description[0].string[0];
    } else if (metadata?.['lom:lom']?.[0]?.['lom:general']?.[0]?.['lom:description']?.[0]?.['lom:string']?.[0]?._) {
      description = metadata['lom:lom'][0]['lom:general'][0]['lom:description'][0]['lom:string'][0]._;
    } else if (metadata?.['lom:lom']?.[0]?.['lom:general']?.[0]?.['lom:description']?.[0]?.['lom:string']?.[0]) {
      description = metadata['lom:lom'][0]['lom:general'][0]['lom:description'][0]['lom:string'][0];
    }
    
    if (metadata?.schemaversion?.[0]) {
      version = metadata.schemaversion[0];
    }
    
    return { title, description, version, identifier };
  }

  /**
   * Extracts content from HTML files in the SCORM package for description generation
   */
  async extractContentSample(zipContents, maxLength = 2000) {
    const config = require('./config');
    const maxContentLength = config.get('descriptions.maxContentLength') || maxLength;
    
    try {
      let contentSample = '';
      let bestContent = '';
      let bestScore = 0;
      
      // Look for common HTML files in order of preference
      const htmlFiles = ['index.html', 'index.htm', 'main.html', 'start.html', 'content.html', 'lesson.html'];
      
      for (const filename of htmlFiles) {
        const file = zipContents.file(filename);
        if (file) {
          try {
            const htmlContent = await file.async('string');
            const processedContent = this.extractMeaningfulContent(htmlContent);
            
            if (processedContent.score > bestScore) {
              bestContent = processedContent.text;
              bestScore = processedContent.score;
            }
            
            // If we found really good content, use it
            if (bestScore > 80) {
              break;
            }
          } catch (error) {
            console.log(`Could not read ${filename}:`, error.message);
            continue;
          }
        }
      }
      
      // If no main HTML file found good content, look at any HTML file
      if (bestScore < 50) {
        const htmlFiles = Object.keys(zipContents.files)
          .filter(filename => filename.toLowerCase().endsWith('.html') && !zipContents.files[filename].dir)
          .slice(0, 5); // Limit to first 5 HTML files to avoid processing too many
          
        for (const filename of htmlFiles) {
          try {
            const file = zipContents.files[filename];
            const htmlContent = await file.async('string');
            const processedContent = this.extractMeaningfulContent(htmlContent);
            
            if (processedContent.score > bestScore) {
              bestContent = processedContent.text;
              bestScore = processedContent.score;
            }
          } catch (error) {
            continue;
          }
        }
      }
      
      return bestContent.substring(0, maxContentLength);
    } catch (error) {
      console.error('Error extracting content sample:', error);
      return '';
    }
  }

  /**
   * Extract meaningful content from HTML and score its quality
   */
  extractMeaningfulContent(htmlContent) {
    try {
      // Remove scripts, styles, and comments
      let textContent = htmlContent
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

      // Extract text from specific HTML elements that typically contain course content
      const meaningfulElements = [];
      
      // Look for headings (course structure)
      const headings = textContent.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi);
      if (headings) {
        meaningfulElements.push(...headings.map(h => h.replace(/<[^>]*>/g, ' ').trim()));
      }

      // Look for paragraphs and divs with substantial text
      const paragraphs = textContent.match(/<(?:p|div)[^>]*>([\s\S]*?)<\/(?:p|div)>/gi);
      if (paragraphs) {
        paragraphs.forEach(p => {
          const text = p.replace(/<[^>]*>/g, ' ').trim();
          if (text.length > 30) { // Only include substantial paragraphs
            meaningfulElements.push(text);
          }
        });
      }

      // Look for list items (learning objectives, topics)
      const listItems = textContent.match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
      if (listItems) {
        listItems.forEach(li => {
          const text = li.replace(/<[^>]*>/g, ' ').trim();
          if (text.length > 10) {
            meaningfulElements.push(text);
          }
        });
      }

      // Combine and clean up the meaningful content
      let cleanText = meaningfulElements
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      // If we didn't get much from structured elements, fall back to all text
      if (cleanText.length < 100) {
        cleanText = textContent
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      // Score the content quality
      let score = 0;
      
      // Length scoring (prefer substantial content)
      if (cleanText.length > 200) score += 20;
      if (cleanText.length > 500) score += 20;
      
      // Educational content indicators
      const educationalKeywords = [
        'learn', 'course', 'lesson', 'module', 'objective', 'goal', 'skill', 'knowledge',
        'understand', 'practice', 'exercise', 'activity', 'assessment', 'quiz', 'test',
        'complete', 'finish', 'achieve', 'master', 'develop', 'improve', 'apply'
      ];
      
      const lowerText = cleanText.toLowerCase();
      educationalKeywords.forEach(keyword => {
        if (lowerText.includes(keyword)) score += 5;
      });

      // Prefer content with structured information
      if (cleanText.includes(':')) score += 5; // Likely has structured info
      if (cleanText.match(/\d+\./)) score += 5; // Has numbered lists
      if (cleanText.match(/[•\-\*]/)) score += 5; // Has bullet points

      return {
        text: cleanText,
        score: Math.min(score, 100) // Cap at 100
      };
    } catch (error) {
      return { text: '', score: 0 };
    }
  }

  /**
   * Generate description for a package using OpenAI or fallback methods
   */
  async generateDescription(packageData) {
    const openaiService = require('./openaiService');
    
    // If package already has a description, use it
    if (packageData.description && packageData.description.trim().length > 10) {
      console.log(`Using existing description for "${packageData.title}"`);
      return packageData.description.trim();
    }
    
    // Prepare data for description generation
    const courseData = {
      title: this.getDisplayTitle(packageData),
      filename: packageData.filename,
      contentSample: packageData.contentSample || '',
      existingDescription: packageData.description || ''
    };
    
    try {
      const description = await openaiService.generateDescription(courseData);
      return description;
    } catch (error) {
      console.error('Error generating description:', error);
      return openaiService.getFallbackDescription(courseData);
    }
  }
  
  extractOrganizations(manifest) {
    const organizations = manifest?.manifest?.organizations?.[0];
    if (!organizations?.organization) return [];
    
    return organizations.organization.map(org => ({
      identifier: org.$.identifier,
      title: org.title?.[0] || 'Untitled Organization',
      items: this.extractItems(org.item || [])
    }));
  }
  
  extractItems(items) {
    return items.map(item => ({
      identifier: item.$.identifier,
      title: item.title?.[0] || 'Untitled Item',
      identifierref: item.$.identifierref,
      items: this.extractItems(item.item || [])
    }));
  }
  
  extractResources(manifest) {
    const resources = manifest?.manifest?.resources?.[0];
    if (!resources?.resource) return [];
    
    return resources.resource.map(resource => ({
      identifier: resource.$.identifier,
      type: resource.$.type,
      href: resource.$.href,
      files: resource.file?.map(file => file.$.href) || []
    }));
  }
  
  async mergePackages(packages, progressCallback) {
    const mergedZip = new JSZip();
    const mergedManifest = this.createMergedManifest(packages);
    
    progressCallback?.({ step: 'Creating merged manifest', progress: 5 });
    
    mergedZip.file('imsmanifest.xml', mergedManifest);
    
    progressCallback?.({ step: 'Creating course menu', progress: 10 });
    
    // Add menu files
    const menuFiles = this.createMenuFiles(packages);
    for (const [filePath, content] of Object.entries(menuFiles)) {
      mergedZip.file(filePath, content);
    }
    
    let processedPackages = 0;
    
    for (const [index, pkg] of packages.entries()) {
      const packageFolder = `package_${index + 1}`;
      progressCallback?.({ 
        step: `Processing package: ${pkg.title}`, 
        progress: 15 + (processedPackages / packages.length) * 70 
      });
      
      const zipData = await fs.readFile(pkg.path);
      const zip = new JSZip();
      const zipContents = await zip.loadAsync(zipData);
      
      for (const [filename, file] of Object.entries(zipContents.files)) {
        if (filename !== 'imsmanifest.xml' && !file.dir) {
          let content = await file.async('nodebuffer');
          
          // Inject finish handler script into HTML files
          if (filename.toLowerCase().endsWith('.html') || filename.toLowerCase().endsWith('.htm')) {
            try {
              let htmlContent = content.toString('utf8');
              const finishHandlerScript = this.createFinishHandlerScript();
              
              // Try to inject before closing </head> tag
              if (htmlContent.includes('</head>')) {
                htmlContent = htmlContent.replace('</head>', finishHandlerScript + '\n</head>');
              }
              // If no </head>, try before </body>
              else if (htmlContent.includes('</body>')) {
                htmlContent = htmlContent.replace('</body>', finishHandlerScript + '\n</body>');
              }
              // If no </body>, try before </html>
              else if (htmlContent.includes('</html>')) {
                htmlContent = htmlContent.replace('</html>', finishHandlerScript + '\n</html>');
              }
              // If none of the above, append at the end
              else {
                htmlContent += finishHandlerScript;
              }
              
              content = Buffer.from(htmlContent, 'utf8');
            } catch (error) {
              console.log(`Could not inject finish handler into ${filename}: ${error.message}`);
              // Use original content if injection fails
            }
          }
          
          mergedZip.file(`${packageFolder}/${filename}`, content);
        }
      }
      
      processedPackages++;
    }
    
    progressCallback?.({ step: 'Generating final package', progress: 90 });
    
    const mergedBuffer = await mergedZip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    
    const outputPath = path.join(__dirname, '../temp', `merged-scorm-${Date.now()}.zip`);
    await fs.writeFile(outputPath, mergedBuffer);
    
    progressCallback?.({ step: 'Complete', progress: 100 });
    
    return outputPath;
  }
  
  createMergedManifest(packages) {
    const manifestId = uuidv4();
    const organizationId = `org_${manifestId}`;
    const menuResourceId = 'menu_resource';
    
    let organizations = `
        <item identifier="menu_item" identifierref="${menuResourceId}">
          <title>Course Menu</title>
        </item>`;
    
    let resources = `
        <resource identifier="${menuResourceId}" type="webcontent" adlcp:scormType="sco" href="menu/index.html">
          <file href="menu/index.html" />
          <file href="menu/menu.js" />
          <file href="menu/style.css" />
        </resource>`;
    
    for (const [index, pkg] of packages.entries()) {
      const packageFolder = `package_${index + 1}`;
      const packageId = `pkg_${index + 1}`;
      const itemId = `item_${index + 1}`;
      
      const displayTitle = this.getDisplayTitle(pkg);
      organizations += `
        <item identifier="${itemId}" identifierref="resource_${packageId}">
          <title>${this.escapeXml(displayTitle)}</title>
        </item>`;
      
      // Find the main resource file for this package
      let mainHref = 'index.html';
      if (pkg.resources && pkg.resources.length > 0) {
        const mainResource = pkg.resources.find(r => r.href) || pkg.resources[0];
        if (mainResource && mainResource.href) {
          mainHref = mainResource.href;
        }
      }
      
      resources += `
        <resource identifier="resource_${packageId}" type="webcontent" adlcp:scormType="sco" href="${packageFolder}/${mainHref}">
          <file href="${packageFolder}/${mainHref}" />`;
      
      // Add all files from the package
      if (pkg.resources) {
        for (const resource of pkg.resources) {
          if (resource.files) {
            for (const file of resource.files) {
              resources += `
          <file href="${packageFolder}/${file}" />`;
            }
          }
        }
      }
      
      resources += `
        </resource>`;
    }
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${manifestId}" version="1.3" 
          xmlns="http://www.imsglobal.org/xsd/imscp_v1p1" 
          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3" 
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
          xsi:schemaLocation="http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd http://www.adlnet.org/xsd/adlcp_v1p3 adlcp_v1p3.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 3rd Edition</schemaversion>
    <lom:lom xmlns:lom="http://ltsc.ieee.org/xsd/LOM">
      <lom:general>
        <lom:title>
          <lom:string language="en">Merged SCORM Package</lom:string>
        </lom:title>
      </lom:general>
    </lom:lom>
  </metadata>
  <organizations default="${organizationId}">
    <organization identifier="${organizationId}">
      <title>Merged SCORM Package</title>${organizations}
    </organization>
  </organizations>
  <resources>${resources}
  </resources>
</manifest>`;
  }
  
  createFinishHandlerScript() {
    return `
<!-- SCORM Merge Finish Handler -->
<script>
(function() {
    'use strict';
    
    // Global function to return to main menu
    function returnToMenu() {
        try {
            // Try to complete SCORM if available
            if (window.API && window.API.LMSSetValue) {
                window.API.LMSSetValue("cmi.core.lesson_status", "completed");
                window.API.LMSCommit("");
                window.API.LMSFinish("");
            }
        } catch (e) {
            console.log('SCORM completion attempted:', e.message);
        }
        
        // Navigate back to menu
        const menuPath = sessionStorage.getItem('menuPath');
        if (menuPath) {
            window.location.href = menuPath;
        } else {
            // Fallback navigation
            window.location.href = '../menu/index.html';
        }
    }
    
    // Make function globally available
    window.returnToMenu = returnToMenu;
    window.parent.returnToMenu = returnToMenu;
    
    // Intercept common finish patterns when page loads
    document.addEventListener('DOMContentLoaded', function() {
        // Look for common finish elements and add our handler
        const finishSelectors = [
            'a[href*="close"]', 'a[href*="exit"]', 'a[href*="finish"]',
            'button[onclick*="close"]', 'button[onclick*="exit"]', 'button[onclick*="finish"]',
            'input[value*="Finish"]', 'input[value*="Exit"]', 'input[value*="Close"]',
            '.finish', '.exit', '.close', '#finish', '#exit', '#close',
            '[id*="finish"]', '[id*="exit"]', '[id*="close"]'
        ];
        
        finishSelectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    // Check if element text suggests it's a finish action
                    const text = element.textContent || element.value || element.title || '';
                    if (/\\b(finish|exit|close|done|complete)\\b/i.test(text)) {
                        // Override the click handler
                        element.addEventListener('click', function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            returnToMenu();
                        }, true); // Use capture phase
                        
                        // Also override href if it's a link
                        if (element.tagName.toLowerCase() === 'a') {
                            element.href = 'javascript:returnToMenu();';
                        }
                    }
                });
            } catch (e) {
                // Ignore selector errors
            }
        });
        
        // Also intercept window.close() calls
        const originalClose = window.close;
        window.close = function() {
            returnToMenu();
        };
        
        // Intercept common SCORM finish patterns
        if (window.API) {
            const originalFinish = window.API.LMSFinish;
            if (originalFinish) {
                window.API.LMSFinish = function(param) {
                    const result = originalFinish.call(this, param);
                    setTimeout(returnToMenu, 500); // Delay to allow SCORM to complete
                    return result;
                };
            }
        }
    });
})();
</script>
`;
  }

  createMenuFiles(packages) {
    const menuHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Course Menu</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="menu-container">
        <h1>Course Menu</h1>
        <p>Select a course module to begin:</p>
        <div class="menu-list">
            ${packages.map((pkg, index) => {
                const displayTitle = this.getDisplayTitle(pkg);
                const description = pkg.description || 'SCORM learning module';
                return `
            <div class="menu-item" data-package="${index + 1}">
                <h3>${this.escapeXml(displayTitle)}</h3>
                <p class="package-description">${this.escapeXml(description)}</p>
                <p class="package-info">SCORM ${pkg.version} • ${pkg.filename}</p>
                <button onclick="launchPackage(${index + 1})">Launch Module</button>
            </div>
            `;
            }).join('')}
        </div>
    </div>
    <script src="menu.js"></script>
</body>
</html>`;

    const menuJs = `
// SCORM API detection and initialization
let scormAPI = null;

function findAPI(win) {
    let findAPITries = 0;
    while ((win.API == null) && (win.parent != null) && (win.parent != win)) {
        findAPITries++;
        if (findAPITries > 7) {
            return null;
        }
        win = win.parent;
    }
    return win.API;
}

function initializeSCORM() {
    scormAPI = findAPI(window);
    if (scormAPI) {
        scormAPI.LMSInitialize("");
        scormAPI.LMSSetValue("cmi.core.lesson_status", "incomplete");
        scormAPI.LMSCommit("");
    }
}

function finishSCORM() {
    if (scormAPI) {
        scormAPI.LMSSetValue("cmi.core.lesson_status", "completed");
        scormAPI.LMSCommit("");
        scormAPI.LMSFinish("");
    }
}

function launchPackage(packageNum) {
    const packageFolder = 'package_' + packageNum;
    const packageData = ${JSON.stringify(packages.map(pkg => ({
        title: this.getDisplayTitle(pkg),
        mainFile: pkg.resources?.[0]?.href || 'index.html'
    })))};
    
    const pkg = packageData[packageNum - 1];
    if (pkg) {
        // Set lesson status to completed since user is progressing
        if (scormAPI) {
            scormAPI.LMSSetValue("cmi.core.lesson_status", "completed");
            scormAPI.LMSCommit("");
        }
        
        // Store current package info in sessionStorage for finish handling
        sessionStorage.setItem('currentPackage', packageNum.toString());
        sessionStorage.setItem('menuPath', window.location.pathname);
        
        // Open the selected package in the same window
        window.location.href = '../' + packageFolder + '/' + pkg.mainFile;
    }
}

// Global function to return to main menu (can be called by individual packages)
function returnToMenu() {
    const menuPath = sessionStorage.getItem('menuPath');
    if (menuPath) {
        // Complete the current package in SCORM
        if (scormAPI) {
            scormAPI.LMSSetValue("cmi.core.lesson_status", "completed");
            scormAPI.LMSCommit("");
        }
        window.location.href = menuPath;
    } else {
        // Fallback: navigate relative to current location
        window.location.href = '../menu/index.html';
    }
}

// Make returnToMenu globally accessible
window.returnToMenu = returnToMenu;
window.parent.returnToMenu = returnToMenu;

// Initialize SCORM when page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeSCORM();
});

// Handle page unload
window.addEventListener('beforeunload', function() {
    finishSCORM();
});
`;

    const menuCss = `
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
    margin: 0;
    padding: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    color: #333;
}

.menu-container {
    max-width: 800px;
    margin: 0 auto;
    background: white;
    border-radius: 12px;
    padding: 2rem;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

h1 {
    text-align: center;
    color: #333;
    margin-bottom: 0.5rem;
    font-size: 2.5rem;
}

.menu-container > p {
    text-align: center;
    color: #666;
    margin-bottom: 2rem;
    font-size: 1.1rem;
}

.menu-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.menu-item {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 1.5rem;
    border-left: 4px solid #667eea;
    transition: all 0.3s ease;
    cursor: pointer;
}

.menu-item:hover {
    background: #e9ecef;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.menu-item h3 {
    margin: 0 0 0.5rem 0;
    color: #333;
    font-size: 1.3rem;
}

.package-description {
    color: #555;
    font-size: 0.95rem;
    margin: 0 0 0.75rem 0;
    line-height: 1.4;
    font-style: italic;
}

.package-info {
    color: #666;
    font-size: 0.9rem;
    margin: 0 0 1rem 0;
}

.menu-item button {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
    transition: transform 0.2s ease;
}

.menu-item button:hover {
    transform: translateY(-1px);
}

@media (max-width: 768px) {
    .menu-container {
        margin: 0;
        padding: 1rem;
        border-radius: 0;
    }
    
    h1 {
        font-size: 2rem;
    }
    
    .menu-item {
        padding: 1rem;
    }
}
`;

    return {
      'menu/index.html': menuHtml,
      'menu/menu.js': menuJs,
      'menu/style.css': menuCss
    };
  }
  
  escapeXml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

module.exports = new ScormProcessor();