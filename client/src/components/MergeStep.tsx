import React, { useState } from 'react';
import { ScormPackage, ProgressUpdate } from '../App';

interface MergeStepProps {
  packages: ScormPackage[];
  sessionId: string;
  progress: ProgressUpdate | null;
  onBack: () => void;
}

const MergeStep: React.FC<MergeStepProps> = ({ packages, sessionId, progress, onBack }) => {
  const [merging, setMerging] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validPackages = packages.filter(pkg => !pkg.error);

  const startMerge = async () => {
    setMerging(true);
    setError(null);
    setDownloadUrl(null);

    try {
      const response = await fetch('/api/merge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Merge failed');
      }

      const result = await response.json();
      setDownloadUrl(result.downloadUrl);
    } catch (error) {
      console.error('Merge error:', error);
      setError(error instanceof Error ? error.message : 'Merge failed');
    } finally {
      setMerging(false);
    }
  };

  const downloadPackage = () => {
    if (downloadUrl) {
      const fullUrl = process.env.NODE_ENV === 'development' 
        ? `http://localhost:5000${downloadUrl}`
        : downloadUrl;
      window.location.href = fullUrl;
    }
  };

  return (
    <div className="merge-step">
      <h2>Step 3: Merge Packages</h2>
      
      <div className="merge-summary">
        <h3>Merge Summary</h3>
        <p>Ready to merge {validPackages.length} SCORM package{validPackages.length !== 1 ? 's' : ''}:</p>
        
        <div className="package-summary-list">
          {validPackages.map((pkg, index) => (
            <div key={pkg.id} className="package-summary-item">
              <span className="order">{index + 1}.</span>
              <div className="package-details">
                <div className="package-title">{pkg.title}</div>
                <div className="package-meta">
                  {pkg.filename} • SCORM {pkg.version}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {!merging && !downloadUrl && !error && (
        <div className="merge-actions">
          <button onClick={onBack} className="back-btn">
            Back to Sort
          </button>
          <button 
            onClick={startMerge}
            className="merge-btn"
            disabled={validPackages.length === 0}
          >
            Start Merge Process
          </button>
        </div>
      )}

      {merging && (
        <div className="merge-progress">
          <h3>Merging Packages...</h3>
          {progress && (
            <div className="progress-container">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${progress.progress}%` }}
                ></div>
              </div>
              <div className="progress-text">
                <span className="progress-step">{progress.step}</span>
                <span className="progress-percentage">{progress.progress}%</span>
              </div>
            </div>
          )}
          <p className="merge-note">
            This may take a few minutes depending on the size and number of packages...
          </p>
        </div>
      )}

      {error && (
        <div className="merge-error">
          <h3>Merge Failed</h3>
          <p className="error-message">{error}</p>
          <div className="error-actions">
            <button onClick={onBack} className="back-btn">
              Back to Sort
            </button>
            <button onClick={startMerge} className="retry-btn">
              Try Again
            </button>
          </div>
        </div>
      )}

      {downloadUrl && (
        <div className="merge-success">
          <h3>Merge Complete!</h3>
          <p>Your merged SCORM package is ready for download.</p>
          
          <div className="download-info">
            <div className="success-icon">✅</div>
            <div className="success-details">
              <p><strong>Merged Package Contains:</strong></p>
              <ul>
                {validPackages.map((pkg, index) => (
                  <li key={pkg.id}>
                    Section {index + 1}: {pkg.title}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="download-actions">
            <button onClick={downloadPackage} className="download-btn">
              Download Merged SCORM Package
            </button>
            <button onClick={() => window.location.reload()} className="start-over-btn">
              Start Over
            </button>
          </div>

          <div className="usage-note">
            <h4>Using Your Merged Package:</h4>
            <p>
              The downloaded ZIP file is a valid SCORM package that can be uploaded 
              to any SCORM-compliant Learning Management System (LMS). Each original 
              package will appear as a separate section in the course structure.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MergeStep;