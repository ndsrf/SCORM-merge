const descriptionTaskManager = require('../server/descriptionTaskManager');

describe('DescriptionTaskManager', () => {
  beforeEach(() => {
    // Clean up any existing tasks
    descriptionTaskManager.cleanupTask('test-session-1');
    descriptionTaskManager.cleanupTask('test-session-2');
  });

  afterEach(() => {
    // Clean up after each test
    descriptionTaskManager.cleanupTask('test-session-1');
    descriptionTaskManager.cleanupTask('test-session-2');
  });

  test('should start description generation task', async () => {
    const mockPackages = [
      {
        id: 'pkg1',
        title: 'Test Package 1',
        filename: 'test1.zip',
        contentSample: 'This is a test course about JavaScript programming.',
        description: ''
      },
      {
        id: 'pkg2',
        title: 'Test Package 2',
        filename: 'test2.zip',
        contentSample: 'This is a test course about Python programming.',
        description: ''
      }
    ];

    const progressCallback = jest.fn();
    const updateCallback = jest.fn();

    const taskId = await descriptionTaskManager.startDescriptionGeneration(
      'test-session-1',
      mockPackages,
      progressCallback,
      updateCallback
    );

    expect(taskId).toBeDefined();
    expect(typeof taskId).toBe('string');

    // Check task status
    const status = descriptionTaskManager.getTaskStatus('test-session-1');
    expect(status.status).toBe('running');
    expect(status.total).toBe(2);
  });

  test('should cancel running task', async () => {
    const mockPackages = [
      {
        id: 'pkg1',
        title: 'Test Package 1',
        filename: 'test1.zip',
        contentSample: 'This is a test course.',
        description: ''
      }
    ];

    const progressCallback = jest.fn();
    const updateCallback = jest.fn();

    // Start task
    await descriptionTaskManager.startDescriptionGeneration(
      'test-session-2',
      mockPackages,
      progressCallback,
      updateCallback
    );

    // Cancel task
    const cancelled = await descriptionTaskManager.cancelTask('test-session-2');
    expect(cancelled).toBe(true);

    // Check status
    const status = descriptionTaskManager.getTaskStatus('test-session-2');
    expect(status.status).toBe('cancelled');
  });

  test('should return not_found status for non-existent task', () => {
    const status = descriptionTaskManager.getTaskStatus('non-existent-session');
    expect(status.status).toBe('not_found');
  });

  test('should return empty results for non-existent task', () => {
    const results = descriptionTaskManager.getTaskResults('non-existent-session');
    expect(results).toEqual({});
  });

  test('should cleanup task', () => {
    // This test verifies cleanup doesn't throw errors
    expect(() => {
      descriptionTaskManager.cleanupTask('non-existent-session');
    }).not.toThrow();
  });

  test('should get all active tasks', () => {
    const activeTasks = descriptionTaskManager.getAllActiveTasks();
    expect(Array.isArray(activeTasks)).toBe(true);
  });
});

