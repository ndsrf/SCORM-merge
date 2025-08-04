import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MergeStep from './MergeStep';
import { ScormPackage, ProgressUpdate } from '../App';

// Mock fetch
global.fetch = jest.fn();

const mockOnBack = jest.fn();

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
  progress: null as ProgressUpdate | null,
  onBack: mockOnBack
};

describe('MergeStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockClear();
    // Mock window.location.href
    delete (window as any).location;
    (window as any).location = { href: '' };
  });

  test('renders merge step with correct title', () => {
    render(<MergeStep {...defaultProps} />);
    
    expect(screen.getByText('Step 3: Merge Packages')).toBeInTheDocument();
  });

  test('displays merge summary with valid packages', () => {
    render(<MergeStep {...defaultProps} />);
    
    expect(screen.getByText('Merge Summary')).toBeInTheDocument();
    expect(screen.getByText('Ready to merge 2 SCORM packages:')).toBeInTheDocument();
    
    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(screen.getByText('2.')).toBeInTheDocument();
    expect(screen.getByText('Package 1')).toBeInTheDocument();
    expect(screen.getByText('Package 2')).toBeInTheDocument();
    expect(screen.getByText('package1.zip • SCORM 2004 3rd Edition')).toBeInTheDocument();
    expect(screen.getByText('package2.zip • SCORM 1.2')).toBeInTheDocument();
  });

  test('filters out packages with errors from summary', () => {
    render(
      <MergeStep 
        {...defaultProps} 
        packages={packagesWithErrors}
      />
    );
    
    expect(screen.getByText('Ready to merge 2 SCORM packages:')).toBeInTheDocument();
    expect(screen.getByText('Package 1')).toBeInTheDocument();
    expect(screen.getByText('Package 2')).toBeInTheDocument();
    expect(screen.queryByText('Invalid Package')).not.toBeInTheDocument();
  });

  test('shows back and start merge buttons initially', () => {
    render(<MergeStep {...defaultProps} />);
    
    expect(screen.getByText('Back to Sort')).toBeInTheDocument();
    expect(screen.getByText('Start Merge Process')).toBeInTheDocument();
  });

  test('handles back button click', () => {
    render(<MergeStep {...defaultProps} />);
    
    const backButton = screen.getByText('Back to Sort');
    fireEvent.click(backButton);
    
    expect(mockOnBack).toHaveBeenCalled();
  });

  test('disables merge button when no valid packages', () => {
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
      <MergeStep 
        {...defaultProps} 
        packages={invalidPackages}
      />
    );
    
    const mergeButton = screen.getByText('Start Merge Process');
    expect(mergeButton).toBeDisabled();
  });

  test('handles successful merge process', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ downloadUrl: '/api/download/merged-scorm-123.zip' })
    });

    render(<MergeStep {...defaultProps} />);
    
    const mergeButton = screen.getByText('Start Merge Process');
    fireEvent.click(mergeButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/merge', expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: 'test-session-123'
        })
      }));
    });

    await waitFor(() => {
      expect(screen.getByText('Merge Complete!')).toBeInTheDocument();
      expect(screen.getByText('Your merged SCORM package is ready for download.')).toBeInTheDocument();
      expect(screen.getByText('Download Merged SCORM Package')).toBeInTheDocument();
    });
  });

  test('shows merging progress', () => {
    const progress: ProgressUpdate = {
      step: 'Processing package: Package 1',
      progress: 45
    };

    render(
      <MergeStep 
        {...defaultProps} 
        progress={progress}
      />
    );

    // First start the merge process
    const mergeButton = screen.getByText('Start Merge Process');
    fireEvent.click(mergeButton);

    // Re-render with progress
    render(
      <MergeStep 
        {...defaultProps} 
        progress={progress}
      />
    );

    expect(screen.getByText('Merging Packages...')).toBeInTheDocument();
    expect(screen.getByText('Processing package: Package 1')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  test('handles merge error', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Merge failed due to server error' })
    });

    render(<MergeStep {...defaultProps} />);
    
    const mergeButton = screen.getByText('Start Merge Process');
    fireEvent.click(mergeButton);

    await waitFor(() => {
      expect(screen.getByText('Merge Failed')).toBeInTheDocument();
      expect(screen.getByText('Merge failed due to server error')).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });
  });

  test('handles network error during merge', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    render(<MergeStep {...defaultProps} />);
    
    const mergeButton = screen.getByText('Start Merge Process');
    fireEvent.click(mergeButton);

    await waitFor(() => {
      expect(screen.getByText('Merge Failed')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  test('shows retry button after error', async () => {
    (fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ downloadUrl: '/api/download/merged-scorm-123.zip' })
      });

    render(<MergeStep {...defaultProps} />);
    
    const mergeButton = screen.getByText('Start Merge Process');
    fireEvent.click(mergeButton);

    await waitFor(() => {
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    // Click retry
    const retryButton = screen.getByText('Try Again');
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText('Merge Complete!')).toBeInTheDocument();
    });
  });

  test('handles download button click', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ downloadUrl: '/api/download/merged-scorm-123.zip' })
    });

    const originalEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'development',
      configurable: true
    });

    render(<MergeStep {...defaultProps} />);
    
    const mergeButton = screen.getByText('Start Merge Process');
    fireEvent.click(mergeButton);

    await waitFor(() => {
      expect(screen.getByText('Download Merged SCORM Package')).toBeInTheDocument();
    });

    const downloadButton = screen.getByText('Download Merged SCORM Package');
    fireEvent.click(downloadButton);

    expect(window.location.href).toBe('http://localhost:5000/api/download/merged-scorm-123.zip');

    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalEnv,
      configurable: true
    });
  });

  test('handles start over button click', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ downloadUrl: '/api/download/merged-scorm-123.zip' })
    });

    // Mock window.location.reload
    const mockReload = jest.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: mockReload },
      writable: true
    });

    render(<MergeStep {...defaultProps} />);
    
    const mergeButton = screen.getByText('Start Merge Process');
    fireEvent.click(mergeButton);

    await waitFor(() => {
      expect(screen.getByText('Start Over')).toBeInTheDocument();
    });

    const startOverButton = screen.getByText('Start Over');
    fireEvent.click(startOverButton);

    expect(mockReload).toHaveBeenCalled();
  });

  test('shows usage instructions after successful merge', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ downloadUrl: '/api/download/merged-scorm-123.zip' })
    });

    render(<MergeStep {...defaultProps} />);
    
    const mergeButton = screen.getByText('Start Merge Process');
    fireEvent.click(mergeButton);

    await waitFor(() => {
      expect(screen.getByText('Using Your Merged Package:')).toBeInTheDocument();
      expect(screen.getByText(/The downloaded ZIP file is a valid SCORM package/)).toBeInTheDocument();
      expect(screen.getByText(/Each original package will appear as a separate section/)).toBeInTheDocument();
    });
  });

  test('shows success details with package list', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ downloadUrl: '/api/download/merged-scorm-123.zip' })
    });

    render(<MergeStep {...defaultProps} />);
    
    const mergeButton = screen.getByText('Start Merge Process');
    fireEvent.click(mergeButton);

    await waitFor(() => {
      expect(screen.getByText('Merged Package Contains:')).toBeInTheDocument();
      expect(screen.getByText('Section 1: Package 1')).toBeInTheDocument();
      expect(screen.getByText('Section 2: Package 2')).toBeInTheDocument();
    });
  });

  test('shows progress bar during merge', async () => {
    let resolveMerge: (value: any) => void;
    const mergePromise = new Promise(resolve => {
      resolveMerge = resolve;
    });

    (fetch as jest.Mock).mockImplementationOnce(() => mergePromise);

    const progress: ProgressUpdate = {
      step: 'Creating merged manifest',
      progress: 30
    };

    render(<MergeStep {...defaultProps} />);
    
    const mergeButton = screen.getByText('Start Merge Process');
    fireEvent.click(mergeButton);

    // Should show merging state
    expect(screen.getByText('Merging Packages...')).toBeInTheDocument();

    // Re-render with progress
    render(
      <MergeStep 
        {...defaultProps} 
        progress={progress}
      />
    );

    expect(screen.getByText('Creating merged manifest')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();

    // Resolve the merge
    resolveMerge!({
      ok: true,
      json: async () => ({ downloadUrl: '/api/download/test.zip' })
    });

    await waitFor(() => {
      expect(screen.queryByText('Merging Packages...')).not.toBeInTheDocument();
    });
  });

  test('shows correct singular/plural text for package count', () => {
    const singlePackage: ScormPackage[] = [
      {
        id: '1',
        filename: 'package1.zip',
        title: 'Package 1',
        version: '2004 3rd Edition'
      }
    ];

    render(
      <MergeStep 
        {...defaultProps} 
        packages={singlePackage}
      />
    );
    
    expect(screen.getByText('Ready to merge 1 SCORM package:')).toBeInTheDocument();
  });
});