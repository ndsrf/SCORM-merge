import React, { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ScormPackage, DescriptionProgress } from '../App';

interface SortStepProps {
  packages: ScormPackage[];
  sessionId: string;
  onSortComplete: (packages: ScormPackage[]) => void;
  onBack: () => void;
  descriptionProgress?: DescriptionProgress | null;
  descriptionTaskId?: string | null;
  onStartDescriptionGeneration: () => void;
  onCancelDescriptionGeneration: () => void;
}

interface SortableItemProps {
  id: string;
  package: ScormPackage;
  index: number;
}

const SortableItem: React.FC<SortableItemProps> = ({ id, package: pkg, index }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`sortable-item ${pkg.error ? 'error' : ''}`}
    >
      <div className="drag-handle">⋮⋮</div>
      <div className="package-info">
        <div className="package-header">
          <span className="package-order">{index + 1}.</span>
          <span className="package-title">{pkg.title}</span>
          {pkg.error && <span className="error-badge">Error</span>}
        </div>
        {pkg.description && (
          <div className="package-description">{pkg.description}</div>
        )}
        <div className="package-details">
          <span className="filename">{pkg.filename}</span>
          <span className="version">SCORM {pkg.version}</span>
        </div>
        {pkg.error && (
          <div className="error-message">{pkg.error}</div>
        )}
      </div>
    </div>
  );
};

const SortStep: React.FC<SortStepProps> = ({ 
  packages, 
  sessionId, 
  onSortComplete, 
  onBack,
  descriptionProgress,
  descriptionTaskId,
  onStartDescriptionGeneration,
  onCancelDescriptionGeneration
}) => {
  const [sortedPackages, setSortedPackages] = useState(packages);
  const [saving, setSaving] = useState(false);

  // Sync with parent state changes (for real-time description updates)
  useEffect(() => {
    setSortedPackages(packages);
  }, [packages]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setSortedPackages((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over?.id);

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const saveOrder = async () => {
    setSaving(true);
    
    try {
      console.log('Saving order with sessionId:', sessionId);
      console.log('Packages to save:', sortedPackages.length);
      
      const response = await fetch('/api/reorder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          packages: sortedPackages
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Reorder failed:', response.status, errorText);
        throw new Error(`Failed to save order: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Order saved successfully:', result);
      onSortComplete(sortedPackages);
    } catch (error) {
      console.error('Save order error:', error);
      
      const shouldContinue = window.confirm(
        `Failed to save package order: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
        'Would you like to continue to merge anyway? (Your current sort order will be used)'
      );
      
      if (shouldContinue) {
        onSortComplete(sortedPackages);
      }
    } finally {
      setSaving(false);
    }
  };

  const validPackages = sortedPackages.filter(pkg => !pkg.error);
  const errorPackages = sortedPackages.filter(pkg => pkg.error);

  return (
    <div className="sort-step">
      <h2>Step 2: Sort Package Order</h2>
      <p>Drag and drop packages to set the order they will appear in the merged SCORM package.</p>
      {process.env.NODE_ENV === 'development' && (
        <div style={{padding: '10px', background: '#f0f0f0', marginBottom: '10px', fontSize: '12px'}}>
          Debug: Session ID = "{sessionId}" | Total Packages = {sortedPackages.length} | Valid = {validPackages.length}
        </div>
      )}
      
      {/* Description Generation Controls */}
      {validPackages.length > 0 && (
        <div className="description-controls" style={{marginBottom: '20px', padding: '15px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef'}}>
          <h3 style={{margin: '0 0 10px 0', fontSize: '16px', color: '#495057'}}>AI Description Generation</h3>
          <p style={{margin: '0 0 15px 0', fontSize: '14px', color: '#6c757d'}}>
            Generate intelligent descriptions for your SCORM packages using AI. You can start this process and continue with sorting while descriptions are generated in the background.
          </p>
          <p style={{margin: '0 0 15px 0', fontSize: '13px', color: '#6c757d', fontStyle: 'italic'}}>
            💡 You can proceed to the next step at any time, even while descriptions are being generated. The process will continue in the background.
          </p>
        
        {!descriptionTaskId && (
          <button 
            onClick={() => {
              console.log('Generate AI Descriptions button clicked');
              onStartDescriptionGeneration();
            }}
            className="btn btn-primary"
            style={{
              padding: '8px 16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Generate AI Descriptions
          </button>
        )}
        
        {descriptionTaskId && (
          <div>
            <button 
              onClick={onCancelDescriptionGeneration}
              className="btn btn-secondary"
              style={{
                padding: '8px 16px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                marginRight: '10px'
              }}
            >
              Cancel Generation
            </button>
            <button 
              onClick={async () => {
                console.log('Manual status check...');
                try {
                  const response = await fetch(`/api/descriptions/status/${sessionId}`);
                  const data = await response.json();
                  console.log('Manual status check result:', data);
                } catch (error) {
                  console.error('Manual status check error:', error);
                }
              }}
              className="btn btn-info"
              style={{
                padding: '8px 16px',
                backgroundColor: '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                marginRight: '10px'
              }}
            >
              Check Status
            </button>
            <button 
              onClick={async () => {
                console.log('Manual fetch results...');
                try {
                  const response = await fetch(`/api/descriptions/results/${sessionId}`);
                  const data = await response.json();
                  console.log('Manual results:', data);
                  if (data.results) {
                    // Apply results manually
                    window.location.reload(); // Simple way to refresh the page with new data
                  }
                } catch (error) {
                  console.error('Manual fetch results error:', error);
                }
              }}
              className="btn btn-success"
              style={{
                padding: '8px 16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                marginRight: '10px'
              }}
            >
              Fetch Results
            </button>
            <span style={{fontSize: '14px', color: '#495057'}}>
              Generating descriptions in background...
            </span>
          </div>
        )}
        
        {descriptionProgress && (
          <div style={{marginTop: '15px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '5px'}}>
              <span style={{fontSize: '14px', color: '#495057'}}>{descriptionProgress.message}</span>
              <span style={{fontSize: '14px', color: '#495057'}}>{descriptionProgress.progress}%</span>
            </div>
            <div style={{
              width: '100%',
              height: '8px',
              backgroundColor: '#e9ecef',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${descriptionProgress.progress}%`,
                height: '100%',
                backgroundColor: descriptionProgress.type === 'completed' ? '#28a745' : '#007bff',
                transition: 'width 0.3s ease'
              }} />
            </div>
            {descriptionProgress.total && (
              <div style={{fontSize: '12px', color: '#6c757d', marginTop: '5px'}}>
                {descriptionProgress.current || 0} of {descriptionProgress.total} packages processed
              </div>
            )}
          </div>
        )}
        </div>
      )}
      
      {validPackages.length > 0 && (
        <div className="packages-section">
          <h3>Valid Packages ({validPackages.length})</h3>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={validPackages.map(pkg => pkg.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="sortable-list">
                {validPackages.map((pkg, index) => (
                  <SortableItem
                    key={pkg.id}
                    id={pkg.id}
                    package={pkg}
                    index={index}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {errorPackages.length > 0 && (
        <div className="packages-section">
          <h3>Packages with Errors ({errorPackages.length})</h3>
          <p className="error-note">These packages will not be included in the merge:</p>
          <div className="error-list">
            {errorPackages.map((pkg, index) => (
              <div key={pkg.id} className="error-item">
                <span className="package-title">{pkg.title}</span>
                {pkg.description && (
                  <div className="package-description">{pkg.description}</div>
                )}
                <span className="filename">{pkg.filename}</span>
                <div className="error-message">{pkg.error}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="step-actions">
        <button onClick={onBack} className="back-btn">
          Back to Upload
        </button>
        <button 
          onClick={saveOrder}
          disabled={saving || validPackages.length === 0}
          className="continue-btn"
        >
          {saving ? 'Saving...' : 'Continue to Merge'}
        </button>
      </div>
      
      {validPackages.length === 0 && (
        <div className="no-valid-packages">
          <p>No valid SCORM packages found. Please go back and upload valid SCORM packages.</p>
        </div>
      )}
    </div>
  );
};

export default SortStep;