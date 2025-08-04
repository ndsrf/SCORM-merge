import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { ScormPackage } from '../App';

interface UploadStepProps {
  sessionId: string;
  onUploadComplete: (packages: ScormPackage[]) => void;
}

const UploadStep: React.FC<UploadStepProps> = ({ sessionId, onUploadComplete }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const maxFileSize = 200 * 1024 * 1024; // 200MB
    const maxTotalFiles = 100;
    
    const validFiles = acceptedFiles.filter(file => {
      if (!(file.type === 'application/zip' || file.name.endsWith('.zip'))) {
        return false;
      }
      if (file.size > maxFileSize) {
        alert(`File "${file.name}" is too large. Maximum size is 200MB per file.`);
        return false;
      }
      return true;
    });
    
    if (validFiles.length !== acceptedFiles.length) {
      const invalidCount = acceptedFiles.length - validFiles.length;
      alert(`${invalidCount} file(s) were rejected. Only ZIP files under 200MB are allowed.`);
    }
    
    const newTotalFiles = uploadedFiles.length + validFiles.length;
    if (newTotalFiles > maxTotalFiles) {
      alert(`Cannot add ${validFiles.length} files. Maximum total is ${maxTotalFiles} files.`);
      const allowedCount = maxTotalFiles - uploadedFiles.length;
      setUploadedFiles(prev => [...prev, ...validFiles.slice(0, allowedCount)]);
    } else {
      setUploadedFiles(prev => [...prev, ...validFiles]);
    }
  }, [uploadedFiles.length]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/zip': ['.zip']
    },
    multiple: true,
    maxSize: 200 * 1024 * 1024, // 200MB
    maxFiles: 100
  });

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (!sessionId || uploadedFiles.length === 0) return;

    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('sessionId', sessionId);
      
      uploadedFiles.forEach(file => {
        formData.append('scormPackages', file);
      });

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload failed:', response.status, errorText);
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      onUploadComplete(result.packages);
    } catch (error) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="upload-step">
      <h2>Step 1: Upload SCORM Packages</h2>
      <p>Select up to 100 SCORM packages (.zip files) to merge together.</p>
      {process.env.NODE_ENV === 'development' && (
        <div style={{padding: '10px', background: '#f0f0f0', marginBottom: '10px', fontSize: '12px'}}>
          Debug: Session ID = "{sessionId}" | Files = {uploadedFiles.length}
        </div>
      )}
      
      <div className="upload-area">
        <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
          <input {...getInputProps()} />
          {isDragActive ? (
            <p>Drop the SCORM packages here...</p>
          ) : (
            <div className="upload-content">
              <div className="upload-icon">📁</div>
              <p>Drag & drop SCORM packages here, or click to select files</p>
              <small>Only .zip files are accepted (max 200MB per file, 100 files total)</small>
            </div>
          )}
        </div>
        
        {uploadedFiles.length > 0 && (
          <div className="file-list">
            <h3>Selected Files ({uploadedFiles.length})</h3>
            {uploadedFiles.map((file, index) => (
              <div key={index} className="file-item">
                <span className="file-name">{file.name}</span>
                <span className="file-size">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
                <button 
                  onClick={() => removeFile(index)}
                  className="remove-btn"
                  type="button"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        
        {uploadedFiles.length > 0 && (
          <div className="upload-actions">
            <button 
              onClick={uploadFiles}
              disabled={uploading || !sessionId}
              className="upload-btn"
            >
              {uploading ? 'Uploading...' : `Upload ${uploadedFiles.length} Package${uploadedFiles.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadStep;