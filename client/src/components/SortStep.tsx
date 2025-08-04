import React, { useState } from 'react';
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
import { ScormPackage } from '../App';

interface SortStepProps {
  packages: ScormPackage[];
  sessionId: string;
  onSortComplete: (packages: ScormPackage[]) => void;
  onBack: () => void;
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

const SortStep: React.FC<SortStepProps> = ({ packages, sessionId, onSortComplete, onBack }) => {
  const [sortedPackages, setSortedPackages] = useState(packages);
  const [saving, setSaving] = useState(false);

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