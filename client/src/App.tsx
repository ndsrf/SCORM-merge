import React, { useState, useEffect } from 'react';
import './App.css';
import UploadStep from './components/UploadStep';
import SortStep from './components/SortStep';
import MergeStep from './components/MergeStep';

export interface ScormPackage {
  id: string;
  filename: string;
  title: string;
  version: string;
  error?: string;
}

export interface ProgressUpdate {
  step: string;
  progress: number;
}

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [packages, setPackages] = useState<ScormPackage[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);

  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsHost = process.env.NODE_ENV === 'development' ? 'localhost:5000' : window.location.host;
    const wsPath = process.env.NODE_ENV === 'development' ? '' : '/ws';
    const wsUrl = `${wsProtocol}://${wsHost}${wsPath}`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    const websocket = new WebSocket(wsUrl);
    
    let connectionTimeout = setTimeout(() => {
      console.warn('WebSocket connection timeout, creating fallback session');
      if (!sessionId) {
        setSessionId(`fallback-${Date.now()}`);
      }
    }, 5000);
    
    websocket.onopen = () => {
      console.log('WebSocket connected successfully');
      clearTimeout(connectionTimeout);
    };
    
    websocket.onmessage = (event) => {
      console.log('WebSocket message received:', event.data);
      const data = JSON.parse(event.data);
      
      if (data.type === 'session') {
        console.log('Session ID received:', data.sessionId);
        clearTimeout(connectionTimeout);
        setSessionId(data.sessionId);
      } else if (data.type === 'progress') {
        setProgress(data.progress);
      }
    };
    
    websocket.onclose = (event) => {
      console.log('WebSocket disconnected', event.code, event.reason);
      if (!sessionId) {
        console.warn('Creating fallback session after WebSocket close');
        setSessionId(`fallback-${Date.now()}`);
      }
    };
    
    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      clearTimeout(connectionTimeout);
      if (!sessionId) {
        console.warn('Creating fallback session after WebSocket error');
        setSessionId(`fallback-${Date.now()}`);
      }
    };

    return () => {
      clearTimeout(connectionTimeout);
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.close();
      }
    };
  }, [sessionId]);

  const handleUploadComplete = (uploadedPackages: ScormPackage[]) => {
    setPackages(uploadedPackages);
    setCurrentStep(2);
  };

  const handleSortComplete = (sortedPackages: ScormPackage[]) => {
    setPackages(sortedPackages);
    setCurrentStep(3);
  };

  const handleBackTo = (step: number) => {
    setCurrentStep(step);
    setProgress(null);
  };

  const renderStepIndicator = () => (
    <div className="step-indicator">
      <div className={`step ${currentStep >= 1 ? 'active' : ''}`}>
        <span className="step-number">1</span>
        <span className="step-label">Upload</span>
      </div>
      <div className={`step ${currentStep >= 2 ? 'active' : ''}`}>
        <span className="step-number">2</span>
        <span className="step-label">Sort</span>
      </div>
      <div className={`step ${currentStep >= 3 ? 'active' : ''}`}>
        <span className="step-number">3</span>
        <span className="step-label">Merge</span>
      </div>
    </div>
  );

  return (
    <div className="App">
      <header className="App-header">
        <h1>SCORM Package Merger</h1>
        <p>Merge multiple SCORM packages into a single package</p>
      </header>
      
      <main className="main-content">
        {renderStepIndicator()}
        
        {currentStep === 1 && (
          <UploadStep 
            sessionId={sessionId}
            onUploadComplete={handleUploadComplete}
          />
        )}
        
        {currentStep === 2 && (
          <SortStep 
            packages={packages}
            sessionId={sessionId}
            onSortComplete={handleSortComplete}
            onBack={() => handleBackTo(1)}
          />
        )}
        
        {currentStep === 3 && (
          <MergeStep 
            packages={packages}
            sessionId={sessionId}
            progress={progress}
            onBack={() => handleBackTo(2)}
          />
        )}
      </main>
    </div>
  );
};

export default App;
