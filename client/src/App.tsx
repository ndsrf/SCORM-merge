import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import UploadStep from './components/UploadStep';
import SortStep from './components/SortStep';
import MergeStep from './components/MergeStep';

export interface ScormPackage {
  id: string;
  filename: string;
  title: string;
  description?: string;
  version: string;
  error?: string;
}

export interface ProgressUpdate {
  step: string;
  progress: number;
}

export interface DescriptionProgress {
  type: string;
  message: string;
  progress: number;
  total?: number;
  current?: number;
}

export interface DescriptionUpdate {
  type: string;
  packageId: string;
  description: string;
  progress: number;
  fallback?: boolean;
}

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [packages, setPackages] = useState<ScormPackage[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [descriptionProgress, setDescriptionProgress] = useState<DescriptionProgress | null>(null);
  const [descriptionTaskId, setDescriptionTaskId] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const sessionIdRef = useRef<string>('');
  const taskIdRef = useRef<string | null>(null);

  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsHost = process.env.NODE_ENV === 'development' ? 'localhost:5000' : window.location.host;
    const wsPath = '/ws';
    const wsUrl = `${wsProtocol}://${wsHost}${wsPath}`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    const websocket = new WebSocket(wsUrl);
    
    let connectionTimeout = setTimeout(() => {
      console.warn('WebSocket connection timeout, creating fallback session');
      setSessionId(`fallback-${Date.now()}`);
    }, 5000);
    
    websocket.onopen = () => {
      console.log('WebSocket connected successfully');
      clearTimeout(connectionTimeout);
    };
    
    websocket.onmessage = (event) => {
      console.log('WebSocket message received:', event.data);
      const data = JSON.parse(event.data);
      console.log('Parsed WebSocket data:', data);
      
      if (data.type === 'session') {
        console.log('Session ID received:', data.sessionId);
        clearTimeout(connectionTimeout);
        setSessionId(data.sessionId);
        sessionIdRef.current = data.sessionId;
      } else if (data.type === 'progress') {
        console.log('Received progress update:', data);
        setDescriptionProgress({
          type: 'progress',
          message: data.message,
          progress: data.progress,
          current: data.current,
          total: data.total
        });
      } else if (data.type === 'started') {
        console.log('Received started update:', data);
        setDescriptionProgress({
          type: 'started',
          message: data.message,
          progress: data.progress,
          current: 0,
          total: data.total
        });
      } else if (data.type === 'completed') {
        console.log('Received completion update:', data);
        setDescriptionProgress({
          type: 'completed',
          message: data.message,
          progress: 100,
          current: data.total,
          total: data.total
        });
        // Clear task ID when completed
        setDescriptionTaskId(null);
        taskIdRef.current = null;
      } else if (data.type === 'description_updated') {
        console.log('Received description update:', data);
        console.log('Package ID to update:', data.packageId);
        console.log('New description:', data.description);
        // Update package description in real-time
        setPackages(prevPackages => {
          console.log('Previous packages before update:', prevPackages.map(p => ({ id: p.id, title: p.title, hasDescription: !!p.description })));
          const updatedPackages = prevPackages.map(pkg => 
            pkg.id === data.packageId 
              ? { ...pkg, description: data.description }
              : pkg
          );
          console.log('Updated packages after description change:', updatedPackages.map(p => ({ id: p.id, title: p.title, hasDescription: !!p.description })));
          return updatedPackages;
        });
      }
    };
    
    websocket.onclose = (event) => {
      console.log('WebSocket disconnected', event.code, event.reason);
      // Don't create fallback session here - let it reconnect
    };
    
    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      clearTimeout(connectionTimeout);
      // Create fallback session only if we don't have one
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
  }, []); // Empty dependency array - WebSocket connection should only be established once
  // sessionId is handled via ref to avoid reconnecting on every sessionId change

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

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

  const startDescriptionGeneration = async () => {
    console.log('startDescriptionGeneration called, sessionId:', sessionId);
    if (!sessionId) {
      console.error('No session ID available');
      return;
    }
    
    try {
      console.log('Sending request to /api/descriptions/start');
      const response = await fetch('/api/descriptions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      
      console.log('Response status:', response.status);
      const result = await response.json();
      console.log('Response result:', result);
      
      if (result.success) {
        console.log('Setting task ID:', result.taskId);
        setDescriptionTaskId(result.taskId);
        taskIdRef.current = result.taskId;
        console.log('Started description generation:', result.message);
        
        // Start polling for updates as a fallback
        startPollingForUpdates(result.taskId);
      } else {
        console.error('Failed to start description generation:', result.error);
        alert(`Failed to start description generation: ${result.error}`);
      }
    } catch (error) {
      console.error('Error starting description generation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Error starting description generation: ${errorMessage}`);
    }
  };

  const startPollingForUpdates = (taskId?: string) => {
    const currentTaskId = taskId || taskIdRef.current;
    console.log('Starting polling for updates with task ID:', currentTaskId);
    // Clear any existing polling
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
    
    const pollInterval = setInterval(async () => {
      const activeTaskId = taskId || taskIdRef.current;
      if (!activeTaskId) {
        console.log('No task ID, stopping polling');
        clearInterval(pollInterval);
        setPollingInterval(null);
        return;
      }
      
      try {
        console.log('Polling for status...');
        const response = await fetch(`/api/descriptions/status/${sessionIdRef.current}`);
        const data = await response.json();
        console.log('Polling response:', data);
        
        if (data.status.status === 'completed') {
          console.log('Task completed via polling');
          setDescriptionTaskId(null);
          taskIdRef.current = null;
          setDescriptionProgress(null);
          clearInterval(pollInterval);
          setPollingInterval(null);
          
          // Fetch and apply all results
          console.log('Fetching results...');
          const resultsResponse = await fetch(`/api/descriptions/results/${sessionIdRef.current}`);
          const resultsData = await resultsResponse.json();
          console.log('Results data:', resultsData);
          
          if (resultsData.results) {
            console.log('Applying results to packages...');
            console.log('Current packages:', packages);
            console.log('Results:', resultsData.results);
            setPackages(prevPackages => {
              console.log('Previous packages:', prevPackages);
              const updatedPackages = prevPackages.map(pkg => {
                console.log(`Checking package ${pkg.id}:`, pkg.title);
                if (resultsData.results[pkg.id]) {
                  console.log(`Updating package ${pkg.id} with description:`, resultsData.results[pkg.id]);
                  return { ...pkg, description: resultsData.results[pkg.id] };
                }
                return pkg;
              });
              console.log('Updated packages with results:', updatedPackages);
              return updatedPackages;
            });
          }
        } else if (data.status.status === 'running') {
          console.log('Task still running, progress:', data.status.progress);
          // Update progress if we have it
          if (data.status.progress !== undefined) {
            setDescriptionProgress({
              type: 'progress',
              message: `Generating descriptions... ${data.status.progress}%`,
              progress: data.status.progress,
              current: data.status.completed,
              total: data.status.total
            });
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000); // Poll every 2 seconds
    
    setPollingInterval(pollInterval);
  };

  const cancelDescriptionGeneration = async () => {
    if (!sessionId) return;
    
    try {
      const response = await fetch('/api/descriptions/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      
      const result = await response.json();
      if (result.success) {
        setDescriptionTaskId(null);
        taskIdRef.current = null;
        setDescriptionProgress(null);
        console.log('Cancelled description generation');
      } else {
        console.error('Failed to cancel description generation:', result.error);
      }
    } catch (error) {
      console.error('Error cancelling description generation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Cancellation error:', errorMessage);
    }
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
            descriptionProgress={descriptionProgress}
            descriptionTaskId={descriptionTaskId}
            onStartDescriptionGeneration={startDescriptionGeneration}
            onCancelDescriptionGeneration={cancelDescriptionGeneration}
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
