import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SortStep from './SortStep';
import { ScormPackage } from '../App';

// Mock fetch
global.fetch = jest.fn();

// Mock the drag and drop kit
jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) => <div data-testid="dnd-context">{children}</div>,
  closestCenter: jest.fn(),
  KeyboardSensor: jest.fn(),
  PointerSensor: jest.fn(),
  useSensor: jest.fn(),
  useSensors: jest.fn(() => [])
}));

jest.mock('@dnd-kit/sortable', () => ({
  arrayMove: jest.fn((items, oldIndex, newIndex) => {
    const result = [...items];
    const [removed] = result.splice(oldIndex, 1);
    result.splice(newIndex, 0, removed);
    return result;
  }),
  SortableContext: ({ children }: any) => <div data-testid="sortable-context">{children}</div>,
  sortableKeyboardCoordinates: jest.fn(),
  verticalListSortingStrategy: jest.fn(),
  useSortable: jest.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null
  }))
}));

jest.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: jest.fn(() => '')
    }
  }
}));

const mockOnSortComplete = jest.fn();
const mockOnBack = jest.fn();
const mockOnStartDescriptionGeneration = jest.fn();
const mockOnCancelDescriptionGeneration = jest.fn();

const validPackages: ScormPackage[] = [
  {
    id: '1',
    filename: 'package1.zip',
    title: 'Package 1',
    version: '2004 3rd Edition'
  },
  {
    id: '2',
    filename: 'package2.zip',
    title: 'Package 2',
    version: '1.2'
  }
];

const packagesWithErrors: ScormPackage[] = [
  ...validPackages,
  {
    id: '3',
    filename: 'invalid.zip',
    title: 'Invalid Package',
    version: 'Unknown',
    error: 'No imsmanifest.xml found'
  }
];

const defaultProps = {
  packages: validPackages,
  sessionId: 'test-session-123',
  onSortComplete: mockOnSortComplete,
  onBack: mockOnBack,
  onStartDescriptionGeneration: mockOnStartDescriptionGeneration,
  onCancelDescriptionGeneration: mockOnCancelDescriptionGeneration
};

describe('SortStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockClear();
    mockOnSortComplete.mockClear();
    mockOnBack.mockClear();
    mockOnStartDescriptionGeneration.mockClear();
    mockOnCancelDescriptionGeneration.mockClear();
  });

  test('renders sort step with correct title and description', () => {
    render(<SortStep {...defaultProps} />);
    
    expect(screen.getByText('Step 2: Sort Package Order')).toBeInTheDocument();
    expect(screen.getByText(/Drag and drop packages to set the order/)).toBeInTheDocument();
  });

  test('shows debug information in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'development',
      configurable: true
    });

    render(<SortStep {...defaultProps} />);
    
    expect(screen.getByText(/Debug: Session ID = "test-session-123"/)).toBeInTheDocument();
    expect(screen.getByText(/Total Packages = 2/)).toBeInTheDocument();
    expect(screen.getByText(/Valid = 2/)).toBeInTheDocument();

    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalEnv,
      configurable: true
    });
  });

  test('displays valid packages section', () => {
    render(<SortStep {...defaultProps} />);
    
    expect(screen.getByText('Valid Packages (2)')).toBeInTheDocument();
    expect(screen.getByText('Package 1')).toBeInTheDocument();
    expect(screen.getByText('Package 2')).toBeInTheDocument();
    expect(screen.getByText('package1.zip')).toBeInTheDocument();
    expect(screen.getByText('SCORM 2004 3rd Edition')).toBeInTheDocument();
  });

  test('displays packages with errors section', () => {
    render(
      <SortStep 
        {...defaultProps} 
        packages={packagesWithErrors}
      />
    );
    
    expect(screen.getByText('Packages with Errors (1)')).toBeInTheDocument();
    expect(screen.getByText('These packages will not be included in the merge:')).toBeInTheDocument();
    expect(screen.getByText('Invalid Package')).toBeInTheDocument();
    expect(screen.getByText('No imsmanifest.xml found')).toBeInTheDocument();
  });

  test('shows back and continue buttons', () => {
    render(<SortStep {...defaultProps} />);
    
    expect(screen.getByText('Back to Upload')).toBeInTheDocument();
    expect(screen.getByText('Continue to Merge')).toBeInTheDocument();
  });

  test('handles back button click', () => {
    render(<SortStep {...defaultProps} />);
    
    const backButton = screen.getByText('Back to Upload');
    fireEvent.click(backButton);
    
    expect(mockOnBack).toHaveBeenCalled();
  });

  test('handles successful save order', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true })
    });

    render(<SortStep {...defaultProps} />);
    
    const continueButton = screen.getByText('Continue to Merge');
    fireEvent.click(continueButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/reorder', expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: 'test-session-123',
          packages: validPackages
        })
      }));

      expect(mockOnSortComplete).toHaveBeenCalledWith(validPackages);
    });
  });

  test('handles save order error with retry option', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Server error'
    });

    window.confirm = jest.fn().mockReturnValue(true);

    render(<SortStep {...defaultProps} />);
    
    const continueButton = screen.getByText('Continue to Merge');
    fireEvent.click(continueButton);

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save package order')
      );
      expect(mockOnSortComplete).toHaveBeenCalledWith(validPackages);
    });
  });

  test('handles save order error with cancel option', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Server error'
    });

    window.confirm = jest.fn().mockReturnValue(false);

    render(<SortStep {...defaultProps} />);
    
    const continueButton = screen.getByText('Continue to Merge');
    fireEvent.click(continueButton);

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
      expect(mockOnSortComplete).not.toHaveBeenCalled();
    });
  });

  test('shows saving state', async () => {
    let resolveSave: (value: any) => void;
    const savePromise = new Promise(resolve => {
      resolveSave = resolve;
    });

    (fetch as jest.Mock).mockImplementationOnce(() => savePromise);

    render(<SortStep {...defaultProps} />);
    
    const continueButton = screen.getByText('Continue to Merge');
    fireEvent.click(continueButton);

    // Should show saving state
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(screen.getByText('Saving...')).toBeDisabled();

    // Resolve the save
    resolveSave!({
      ok: true,
      json: async () => ({ success: true })
    });

    await waitFor(() => {
      expect(mockOnSortComplete).toHaveBeenCalled();
    });
  });

  test('disables continue button when no valid packages', () => {
    const invalidPackages: ScormPackage[] = [
      {
        id: '1',
        filename: 'invalid.zip',
        title: 'Invalid Package',
        version: 'Unknown',
        error: 'No manifest found'
      }
    ];

    render(
      <SortStep 
        {...defaultProps} 
        packages={invalidPackages}
      />
    );
    
    const continueButton = screen.getByText('Continue to Merge');
    expect(continueButton).toBeDisabled();
    
    expect(screen.getByText('No valid SCORM packages found. Please go back and upload valid SCORM packages.')).toBeInTheDocument();
  });

  test('shows package order numbers', () => {
    render(<SortStep {...defaultProps} />);
    
    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(screen.getByText('2.')).toBeInTheDocument();
  });

  test('shows error badges for invalid packages', () => {
    render(
      <SortStep 
        {...defaultProps} 
        packages={packagesWithErrors}
      />
    );
    
    // The error badge should be in the error packages section
    const errorSection = screen.getByText('Packages with Errors (1)').closest('.packages-section');
    expect(errorSection).toBeInTheDocument();
  });

  test('handles network error during save', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    window.confirm = jest.fn().mockReturnValue(true);

    render(<SortStep {...defaultProps} />);
    
    const continueButton = screen.getByText('Continue to Merge');
    fireEvent.click(continueButton);

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith(
        expect.stringContaining('Network error')
      );
    });
  });

  test('renders drag handles for sortable items', () => {
    render(<SortStep {...defaultProps} />);
    
    // Should render drag handles (⋮⋮) for each valid package
    const dragHandles = screen.getAllByText('⋮⋮');
    expect(dragHandles).toHaveLength(2); // One for each valid package
  });

  test('shows correct package details', () => {
    render(<SortStep {...defaultProps} />);
    
    expect(screen.getByText('package1.zip')).toBeInTheDocument();
    expect(screen.getByText('package2.zip')).toBeInTheDocument();
    expect(screen.getByText('SCORM 2004 3rd Edition')).toBeInTheDocument();
    expect(screen.getByText('SCORM 1.2')).toBeInTheDocument();
  });
});