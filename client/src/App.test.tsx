import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// Mock WebSocket
const mockWebSocket = {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  close: jest.fn(),
  readyState: 1,
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
};

global.WebSocket = jest.fn(() => mockWebSocket) as any;
Object.assign(global.WebSocket, {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,  
  CLOSED: 3
});

test('renders SCORM Package Merger title', () => {
  render(<App />);
  const titleElement = screen.getByText(/SCORM Package Merger/i);
  expect(titleElement).toBeInTheDocument();
});

test('renders main description', () => {
  render(<App />);
  const descriptionElement = screen.getByText(/Merge multiple SCORM packages into a single package/i);
  expect(descriptionElement).toBeInTheDocument();
});

test('renders step indicator', () => {
  render(<App />);
  const stepElement = screen.getByText(/Upload/i);
  expect(stepElement).toBeInTheDocument();
});
