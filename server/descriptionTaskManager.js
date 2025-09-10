const openaiService = require('./openaiService');
const { v4: uuidv4 } = require('uuid');

class DescriptionTaskManager {
  constructor() {
    this.activeTasks = new Map(); // sessionId -> task info
    this.taskResults = new Map(); // sessionId -> results
  }

  /**
   * Start background description generation for a session
   * @param {string} sessionId - Session identifier
   * @param {Array} packages - Array of SCORM packages
   * @param {Function} progressCallback - Callback for progress updates
   * @param {Function} updateCallback - Callback for individual description updates
   * @returns {string} Task ID
   */
  async startDescriptionGeneration(sessionId, packages, progressCallback, updateCallback) {
    console.log('DescriptionTaskManager.startDescriptionGeneration called');
    console.log('SessionId:', sessionId);
    console.log('Packages count:', packages.length);
    
    const taskId = uuidv4();
    
    // Cancel any existing task for this session
    await this.cancelTask(sessionId);
    
    const task = {
      id: taskId,
      sessionId,
      status: 'running',
      startTime: Date.now(),
      packages: packages.filter(pkg => !pkg.error), // Only process valid packages
      completed: 0,
      total: 0,
      results: {},
      cancelled: false
    };
    
    console.log('Created task:', taskId);
    this.activeTasks.set(sessionId, task);
    this.taskResults.set(sessionId, {});
    
    // Start background processing
    this.processDescriptions(task, progressCallback, updateCallback).catch(error => {
      console.error('Description generation task failed:', error);
      if (task.status === 'running') {
        task.status = 'failed';
        task.error = error.message;
        progressCallback({
          type: 'error',
          message: `Description generation failed: ${error.message}`,
          progress: 0
        });
      }
    });
    
    console.log('Task started, returning taskId:', taskId);
    return taskId;
  }

  /**
   * Process descriptions in the background
   */
  async processDescriptions(task, progressCallback, updateCallback) {
    console.log('processDescriptions called');
    const { sessionId, packages } = task;
    task.total = packages.length;
    
    console.log(`Starting description generation for ${packages.length} packages in session ${sessionId}`);
    
    // Send initial progress
    progressCallback({
      type: 'started',
      message: `Generating descriptions for ${packages.length} packages...`,
      progress: 0,
      total: packages.length
    });

    for (let i = 0; i < packages.length; i++) {
      // Check if task was cancelled
      if (task.cancelled) {
        console.log(`Description generation cancelled for session ${sessionId}`);
        task.status = 'cancelled';
        progressCallback({
          type: 'cancelled',
          message: 'Description generation cancelled',
          progress: Math.round((task.completed / task.total) * 100)
        });
        return;
      }

      const packageData = packages[i];
      
      try {
        // Update progress
        const progress = Math.round((i / packages.length) * 100);
        progressCallback({
          type: 'progress',
          message: `Generating description for: ${packageData.title}`,
          progress,
          current: i + 1,
          total: packages.length
        });

        // Generate description
        const description = await openaiService.generateDescription({
          title: packageData.title,
          filename: packageData.filename,
          contentSample: packageData.contentSample || '',
          existingDescription: packageData.description || ''
        });

        // Store result
        task.results[packageData.id] = description;
        this.taskResults.get(sessionId)[packageData.id] = description;
        task.completed++;

        // Send individual update
        updateCallback({
          type: 'description_updated',
          packageId: packageData.id,
          description,
          progress: Math.round(((i + 1) / packages.length) * 100)
        });

        console.log(`Generated description for ${packageData.title}: ${description.substring(0, 50)}...`);

        // Small delay to prevent overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error generating description for ${packageData.title}:`, error);
        
        // Use fallback description
        const fallbackDescription = openaiService.getFallbackDescription({
          title: packageData.title,
          filename: packageData.filename,
          contentSample: packageData.contentSample || '',
          existingDescription: packageData.description || ''
        });

        task.results[packageData.id] = fallbackDescription;
        this.taskResults.get(sessionId)[packageData.id] = fallbackDescription;
        task.completed++;

        // Send fallback update
        updateCallback({
          type: 'description_updated',
          packageId: packageData.id,
          description: fallbackDescription,
          progress: Math.round(((i + 1) / packages.length) * 100),
          fallback: true
        });
      }
    }

    // Task completed
    if (!task.cancelled) {
      task.status = 'completed';
      console.log(`Description generation completed for session ${sessionId}`);
      
      progressCallback({
        type: 'completed',
        message: `Generated descriptions for ${task.completed} packages`,
        progress: 100,
        total: task.completed
      });
    }
  }

  /**
   * Cancel a running task
   * @param {string} sessionId - Session identifier
   */
  async cancelTask(sessionId) {
    const task = this.activeTasks.get(sessionId);
    if (task && task.status === 'running') {
      task.cancelled = true;
      task.status = 'cancelled';
      console.log(`Cancelled description generation task for session ${sessionId}`);
      return true;
    }
    return false;
  }

  /**
   * Get task status
   * @param {string} sessionId - Session identifier
   */
  getTaskStatus(sessionId) {
    const task = this.activeTasks.get(sessionId);
    if (!task) {
      return { status: 'not_found' };
    }

    return {
      id: task.id,
      status: task.status,
      progress: task.total > 0 ? Math.round((task.completed / task.total) * 100) : 0,
      completed: task.completed,
      total: task.total,
      startTime: task.startTime,
      duration: Date.now() - task.startTime,
      cancelled: task.cancelled,
      error: task.error
    };
  }

  /**
   * Get task results
   * @param {string} sessionId - Session identifier
   */
  getTaskResults(sessionId) {
    return this.taskResults.get(sessionId) || {};
  }

  /**
   * Clean up completed tasks
   * @param {string} sessionId - Session identifier
   */
  cleanupTask(sessionId) {
    this.activeTasks.delete(sessionId);
    this.taskResults.delete(sessionId);
  }

  /**
   * Get all active tasks (for monitoring)
   */
  getAllActiveTasks() {
    const tasks = [];
    for (const [sessionId, task] of this.activeTasks) {
      tasks.push({
        sessionId,
        ...this.getTaskStatus(sessionId)
      });
    }
    return tasks;
  }
}

// Export singleton instance
module.exports = new DescriptionTaskManager();
