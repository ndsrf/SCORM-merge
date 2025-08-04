const JSZip = require('jszip');
const xml2js = require('xml2js');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class ScormProcessor {
  async validateAndParsePackage(packagePath) {
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
      
      return {
        title: metadata.title || 'Untitled SCORM Package',
        version: metadata.version || 'Unknown',
        identifier: metadata.identifier || uuidv4(),
        organizations,
        resources,
        manifest: manifestXml,
        zipContents
      };
    } catch (error) {
      throw new Error(`Invalid SCORM package: ${error.message}`);
    }
  }
  
  extractMetadata(manifest) {
    const metadata = manifest?.manifest?.metadata?.[0];
    
    let title = 'Untitled';
    let version = 'Unknown';
    let identifier = manifest?.manifest?.$?.identifier;
    
    // Try different LOM structures
    if (metadata?.lom?.[0]?.general?.[0]?.title?.[0]?.string?.[0]?._) {
      title = metadata.lom[0].general[0].title[0].string[0]._;
    } else if (metadata?.lom?.[0]?.general?.[0]?.title?.[0]?.string?.[0]) {
      title = metadata.lom[0].general[0].title[0].string[0];
    } else if (metadata?.['lom:lom']?.[0]?.['lom:general']?.[0]?.['lom:title']?.[0]?.['lom:string']?.[0]?._) {
      title = metadata['lom:lom'][0]['lom:general'][0]['lom:title'][0]['lom:string'][0]._;
    }
    
    if (metadata?.schemaversion?.[0]) {
      version = metadata.schemaversion[0];
    }
    
    return { title, version, identifier };
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
          const content = await file.async('nodebuffer');
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
      
      organizations += `
        <item identifier="${itemId}" identifierref="resource_${packageId}">
          <title>${this.escapeXml(pkg.title)}</title>
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
            ${packages.map((pkg, index) => `
            <div class="menu-item" data-package="${index + 1}">
                <h3>${this.escapeXml(pkg.title)}</h3>
                <p class="package-info">SCORM ${pkg.version} • ${pkg.filename}</p>
                <button onclick="launchPackage(${index + 1})">Launch Module</button>
            </div>
            `).join('')}
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
        title: pkg.title,
        mainFile: pkg.resources?.[0]?.href || 'index.html'
    })))};
    
    const pkg = packageData[packageNum - 1];
    if (pkg) {
        // Set lesson status to completed since user is progressing
        if (scormAPI) {
            scormAPI.LMSSetValue("cmi.core.lesson_status", "completed");
            scormAPI.LMSCommit("");
        }
        
        // Open the selected package in the same window
        window.location.href = '../' + packageFolder + '/' + pkg.mainFile;
    }
}

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