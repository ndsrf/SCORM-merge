import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import UploadStep from './UploadStep';

// Mock fetch
global.fetch = jest.fn();

const mockOnUploadComplete = jest.fn();

const defaultProps = {
  sessionId: 'test-session-123',
  onUploadComplete: mockOnUploadComplete
};

describe('UploadStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockClear();
  });

  test('renders upload step with correct title and description', () => {
    render(<UploadStep {...defaultProps} />);
    
    expect(screen.getByText('Step 1: Upload SCORM Packages')).toBeInTheDocument();
    expect(screen.getByText(/Select up to 100 SCORM packages/)).toBeInTheDocument();
    expect(screen.getByText(/Drag & drop SCORM packages here/)).toBeInTheDocument();
  });

  test('shows debug information in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'development',
      configurable: true
    });

    render(<UploadStep {...defaultProps} />);
    
    expect(screen.getByText(/Debug: Session ID = "test-session-123"/)).toBeInTheDocument();
    expect(screen.getByText(/Files = 0/)).toBeInTheDocument();

    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalEnv,
      configurable: true
    });
  });

  test('does not show debug information in production mode', () => {
    const originalEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true
    });

    render(<UploadStep {...defaultProps} />);
    
    expect(screen.queryByText(/Debug:/)).not.toBeInTheDocument();

    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalEnv,
      configurable: true
    });
  });

  test('shows upload button when files are selected', () => {
    render(<UploadStep {...defaultProps} />);
    
    // Initially no upload button
    expect(screen.queryByText(/Upload/)).not.toBeInTheDocument();

    // Simulate file drop
    const dropzone = screen.getByText(/Drag & drop SCORM packages here/).closest('div');
    
    const file = new File(['test content'], 'test.zip', { type: 'application/zip' });
    
    Object.defineProperty(file, 'size', { value: 1024 * 1024 }); // 1MB
    
    fireEvent.drop(dropzone!, {
      dataTransfer: {
        files: [file]
      }
    });

    // Now upload button should appear
    waitFor(() => {
      expect(screen.getByText('Upload 1 Package')).toBeInTheDocument();
    });
  });

  test('handles file size validation', () => {
    render(<UploadStep {...defaultProps} />);
    
    const dropzone = screen.getByText(/Drag & drop SCORM packages here/).closest('div');
    
    // Create a file that's too large (300MB)
    const largeFile = new File(['test'], 'large.zip', { type: 'application/zip' });
    Object.defineProperty(largeFile, 'size', { value: 300 * 1024 * 1024 });

    // Mock alert  
    window.alert = jest.fn();

    fireEvent.drop(dropzone!, {
      dataTransfer: {
        files: [largeFile]
      }
    });

    expect(window.alert).toHaveBeenCalledWith(
      'File "large.zip" is too large. Maximum size is 200MB per file.'
    );
  });

  test('handles non-ZIP file validation', () => {
    render(<UploadStep {...defaultProps} />);
    
    const dropzone = screen.getByText(/Drag & drop SCORM packages here/).closest('div');
    
    const textFile = new File(['test'], 'test.txt', { type: 'text/plain' });
    Object.defineProperty(textFile, 'size', { value: 1024 });

    window.alert = jest.fn();

    fireEvent.drop(dropzone!, {
      dataTransfer: {
        files: [textFile]
      }
    });

    expect(window.alert).toHaveBeenCalledWith(
      '1 file(s) were rejected. Only ZIP files under 200MB are allowed.'
    );
  });

  test('handles maximum file limit', () => {
    render(<UploadStep {...defaultProps} />);
    
    const dropzone = screen.getByText(/Drag & drop SCORM packages here/).closest('div');
    
    // Create 101 files (exceeds limit of 100)
    const files = Array.from({ length: 101 }, (_, i) => {
      const file = new File(['test'], `test${i}.zip`, { type: 'application/zip' });
      Object.defineProperty(file, 'size', { value: 1024 });
      return file;
    });

    window.alert = jest.fn();

    fireEvent.drop(dropzone!, {
      dataTransfer: {
        files
      }
    });

    expect(window.alert).toHaveBeenCalledWith(
      'Cannot add 101 files. Maximum total is 100 files.'
    );
  });

  test('allows removing files', async () => {
    render(<UploadStep {...defaultProps} />);
    
    const dropzone = screen.getByText(/Drag & drop SCORM packages here/).closest('div');
    
    const file = new File(['test'], 'test.zip', { type: 'application/zip' });
    Object.defineProperty(file, 'size', { value: 1024 });

    fireEvent.drop(dropzone!, {
      dataTransfer: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(screen.getByText('test.zip')).toBeInTheDocument();
    });

    // Click remove button
    const removeButton = screen.getByText('×');
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(screen.queryByText('test.zip')).not.toBeInTheDocument();
      expect(screen.queryByText(/Upload/)).not.toBeInTheDocument();
    });
  });

  test('disables upload button when session ID is missing', () => {
    render(<UploadStep sessionId="" onUploadComplete={mockOnUploadComplete} />);
    
    const dropzone = screen.getByText(/Drag & drop SCORM packages here/).closest('div');
    
    const file = new File(['test'], 'test.zip', { type: 'application/zip' });
    Object.defineProperty(file, 'size', { value: 1024 });

    fireEvent.drop(dropzone!, {
      dataTransfer: {
        files: [file]
      }
    });

    waitFor(() => {
      const uploadButton = screen.getByText('Upload 1 Package');
      expect(uploadButton).toBeDisabled();
    });
  });

  test('handles successful upload', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        packages: [
          {
            id: '1',
            filename: 'test.zip',
            title: 'Test Package',
            version: '2004 3rd Edition'
          }
        ]
      })
    });

    render(<UploadStep {...defaultProps} />);
    
    const dropzone = screen.getByText(/Drag & drop SCORM packages here/).closest('div');
    
    const file = new File(['test'], 'test.zip', { type: 'application/zip' });
    Object.defineProperty(file, 'size', { value: 1024 });

    fireEvent.drop(dropzone!, {
      dataTransfer: {
        files: [file]
      }
    });

    await waitFor(() => {
      const uploadButton = screen.getByText('Upload 1 Package');
      fireEvent.click(uploadButton);
    });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/upload', expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData)
      }));

      expect(mockOnUploadComplete).toHaveBeenCalledWith([
        {
          id: '1',
          filename: 'test.zip',
          title: 'Test Package',
          version: '2004 3rd Edition'
        }
      ]);
    });
  });

  test('handles upload error', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'Upload failed'
    });

    window.alert = jest.fn();

    render(<UploadStep {...defaultProps} />);
    
    const dropzone = screen.getByText(/Drag & drop SCORM packages here/).closest('div');
    
    const file = new File(['test'], 'test.zip', { type: 'application/zip' });
    Object.defineProperty(file, 'size', { value: 1024 });

    fireEvent.drop(dropzone!, {
      dataTransfer: {
        files: [file]
      }
    });

    await waitFor(() => {
      const uploadButton = screen.getByText('Upload 1 Package');
      fireEvent.click(uploadButton);
    });

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        'Upload failed: Failed to save order: Bad Request'
      );
    });
  });

  test('shows uploading state', async () => {
    let resolveUpload: (value: any) => void;
    const uploadPromise = new Promise(resolve => {
      resolveUpload = resolve;
    });

    (fetch as jest.Mock).mockImplementationOnce(() => uploadPromise);

    render(<UploadStep {...defaultProps} />);
    
    const dropzone = screen.getByText(/Drag & drop SCORM packages here/).closest('div');
    
    const file = new File(['test'], 'test.zip', { type: 'application/zip' });
    Object.defineProperty(file, 'size', { value: 1024 });

    fireEvent.drop(dropzone!, {
      dataTransfer: {
        files: [file]
      }
    });

    await waitFor(() => {
      const uploadButton = screen.getByText('Upload 1 Package');
      fireEvent.click(uploadButton);
    });

    // Should show uploading state
    expect(screen.getByText('Uploading...')).toBeInTheDocument();
    expect(screen.getByText('Uploading...')).toBeDisabled();

    // Resolve the upload
    resolveUpload!({
      ok: true,
      json: async () => ({ packages: [] })
    });

    await waitFor(() => {
      expect(mockOnUploadComplete).toHaveBeenCalled();
    });
  });

  test('shows file size in human readable format', async () => {
    render(<UploadStep {...defaultProps} />);
    
    const dropzone = screen.getByText(/Drag & drop SCORM packages here/).closest('div');
    
    const file = new File(['test'], 'test.zip', { type: 'application/zip' });
    Object.defineProperty(file, 'size', { value: 2.5 * 1024 * 1024 }); // 2.5MB

    fireEvent.drop(dropzone!, {
      dataTransfer: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(screen.getByText('2.50 MB')).toBeInTheDocument();
    });
  });
});