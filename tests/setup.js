const fs = require('fs').promises;
const path = require('path');

// Setup test environment
beforeAll(async () => {
  // Create test directories
  await fs.mkdir('test-uploads', { recursive: true });
  await fs.mkdir('test-temp', { recursive: true });
});

afterAll(async () => {
  // Cleanup test directories
  try {
    await fs.rmdir('test-uploads', { recursive: true });
    await fs.rmdir('test-temp', { recursive: true });
  } catch (error) {
    // Ignore cleanup errors
  }
});

// Mock console.log for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};