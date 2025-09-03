const OpenAI = require('openai');
const config = require('./config');

class OpenAIService {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.initializeClient();
  }

  initializeClient() {
    try {
      if (!config.isOpenAIEnabled()) {
        console.log('OpenAI is disabled or no API key provided');
        return;
      }

      this.client = new OpenAI({
        apiKey: config.get('openai.apiKey'),
        timeout: config.get('openai.timeout') || 10000
      });

      this.initialized = true;
      console.log('OpenAI service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize OpenAI service:', error.message);
      this.initialized = false;
    }
  }

  isEnabled() {
    return this.initialized && config.isOpenAIEnabled();
  }

  /**
   * Generate a description for a SCORM course
   * @param {Object} courseData - Object containing course information
   * @param {string} courseData.title - Course title
   * @param {string} courseData.filename - Original filename
   * @param {string} courseData.contentSample - Sample of course content
   * @param {string} courseData.existingDescription - Any existing description
   * @returns {Promise<string>} Generated description
   */
  async generateDescription(courseData) {
    if (!this.isEnabled()) {
      console.log('OpenAI service not available, using fallback description');
      return this.getFallbackDescription(courseData);
    }

    try {
      const prompt = this.buildPrompt(courseData);
      console.log(`Attempting OpenAI call for "${courseData.title}" with model: ${config.get('openai.model')}`);
      
      const response = await this.client.chat.completions.create({
        model: config.get('openai.model') || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an educational content specialist who writes engaging course descriptions for e-learning platforms. Write unique, specific descriptions that highlight what makes each course valuable. Avoid generic phrases like "learn concepts" or "master fundamentals". Focus on practical outcomes, specific skills, and real-world applications. Keep it to 1-2 sentences.'
          },
          {
            role: 'user', 
            content: prompt
          }
        ],
        max_tokens: config.get('openai.maxTokens') || 150,
        temperature: config.get('openai.temperature') || 0.7
      });

      const description = response.choices[0]?.message?.content?.trim();
      
      if (description && description.length > 10) {
        console.log(`✓ OpenAI generated description for "${courseData.title}": ${description.substring(0, 80)}...`);
        return description;
      } else {
        console.log('OpenAI returned empty or short description, using fallback');
        return this.getFallbackDescription(courseData);
      }

    } catch (error) {
      console.error(`✗ Error generating description with OpenAI for "${courseData.title}":`, error.message);
      console.error('Full error details:', error);
      return this.getFallbackDescription(courseData);
    }
  }

  /**
   * Build a prompt for OpenAI based on course data
   */
  buildPrompt(courseData) {
    let prompt = `Write an engaging description for this SCORM e-learning course:\n\n`;
    
    prompt += `Course Title: "${courseData.title}"\n`;
    
    if (courseData.filename && courseData.filename !== courseData.title) {
      prompt += `File Name: "${courseData.filename}"\n`;
    }
    
    if (courseData.contentSample && courseData.contentSample.length > 50) {
      // Extract key topics and learning objectives from content
      const contentPreview = courseData.contentSample.substring(0, 800);
      prompt += `Course Content Preview:\n"${contentPreview}"\n`;
    }
    
    if (courseData.existingDescription && courseData.existingDescription.trim() && courseData.existingDescription !== 'SCORM learning module') {
      prompt += `Current Description: "${courseData.existingDescription}"\n`;
    }
    
    prompt += `\nRequirements:
- Write a unique, specific description (avoid generic phrases)
- Focus on what learners will actually DO or CREATE
- Mention specific skills, tools, or outcomes when possible
- Keep it professional but engaging (1-2 sentences)
- Don't just repeat the title with "learn" or "master"

Description:`;
    
    return prompt;
  }

  /**
   * Get fallback description when OpenAI is not available
   */
  getFallbackDescription(courseData) {
    const config = require('./config');
    const fallbackEnabled = config.get('descriptions.fallbackEnabled');
    const defaultDescription = config.get('descriptions.defaultDescription') || 'Interactive SCORM learning module';

    if (!fallbackEnabled) {
      return '';
    }

    // Analyze content sample for better fallback descriptions
    let contentInsights = '';
    if (courseData.contentSample && courseData.contentSample.length > 100) {
      const content = courseData.contentSample.toLowerCase();
      const insights = [];
      
      // Look for specific topics or learning objectives
      if (content.includes('quiz') || content.includes('question') || content.includes('assessment')) {
        insights.push('includes interactive assessments');
      }
      if (content.includes('video') || content.includes('multimedia')) {
        insights.push('features multimedia content');
      }
      if (content.includes('exercise') || content.includes('practice') || content.includes('activity')) {
        insights.push('provides hands-on exercises');
      }
      if (content.includes('certificate') || content.includes('completion')) {
        insights.push('offers completion certification');
      }
      
      if (insights.length > 0) {
        contentInsights = ` that ${insights.slice(0, 2).join(' and ')}`;
      }
    }

    // Generate more specific descriptions based on title analysis
    if (courseData.title && courseData.title !== 'Untitled' && courseData.title.length > 3) {
      const title = courseData.title.toLowerCase();
      
      // Programming and technical topics
      if (title.includes('javascript') || title.includes('js')) {
        return `Build dynamic web applications using JavaScript programming techniques${contentInsights}.`;
      } else if (title.includes('python')) {
        return `Develop Python applications and automate tasks using modern programming practices${contentInsights}.`;
      } else if (title.includes('html') || title.includes('css')) {
        return `Create responsive web pages with HTML and CSS styling techniques${contentInsights}.`;
      } else if (title.includes('react') || title.includes('angular') || title.includes('vue')) {
        return `Build modern web applications using component-based frontend frameworks${contentInsights}.`;
      } else if (title.includes('sql') || title.includes('database')) {
        return `Design and query databases effectively using SQL and data management principles${contentInsights}.`;
      }
      
      // Business and professional topics
      else if (title.includes('leadership') || title.includes('management')) {
        return `Develop essential leadership skills and team management strategies for professional success${contentInsights}.`;
      } else if (title.includes('marketing') || title.includes('sales')) {
        return `Master marketing strategies and sales techniques to drive business growth${contentInsights}.`;
      } else if (title.includes('project') && title.includes('management')) {
        return `Learn project management methodologies and tools for successful project delivery${contentInsights}.`;
      } else if (title.includes('communication') || title.includes('presentation')) {
        return `Enhance communication skills and presentation techniques for professional effectiveness${contentInsights}.`;
      }
      
      // Academic subjects
      else if (title.includes('math') || title.includes('calculus') || title.includes('algebra')) {
        return `Solve mathematical problems and apply quantitative reasoning to real-world scenarios${contentInsights}.`;
      } else if (title.includes('science') || title.includes('biology') || title.includes('chemistry')) {
        return `Explore scientific principles and conduct experiments to understand natural phenomena${contentInsights}.`;
      } else if (title.includes('history') || title.includes('social')) {
        return `Examine historical events and social dynamics to understand their impact on modern society${contentInsights}.`;
      } else if (title.includes('language') || title.includes('english') || title.includes('writing')) {
        return `Improve language skills and written communication through structured learning activities${contentInsights}.`;
      }
      
      // Health and safety
      else if (title.includes('safety') || title.includes('health')) {
        return `Implement safety protocols and health practices to create a secure work environment${contentInsights}.`;
      } else if (title.includes('compliance') || title.includes('regulation')) {
        return `Understand regulatory requirements and compliance procedures for your industry${contentInsights}.`;
      }
      
      // Generic but more engaging fallback
      else {
        const cleanTitle = courseData.title.replace(/course|training|module|lesson/gi, '').trim();
        if (cleanTitle.length > 2) {
          return `Gain practical knowledge and skills in ${cleanTitle} through engaging learning activities${contentInsights}.`;
        }
      }
    }

    return `${defaultDescription}${contentInsights}.`;
  }

  /**
   * Batch generate descriptions for multiple courses
   */
  async generateDescriptions(coursesData, progressCallback) {
    const descriptions = [];
    
    for (let i = 0; i < coursesData.length; i++) {
      const courseData = coursesData[i];
      
      if (progressCallback) {
        progressCallback({
          step: `Generating description for: ${courseData.title}`,
          progress: Math.round((i / coursesData.length) * 100)
        });
      }
      
      try {
        const description = await this.generateDescription(courseData);
        descriptions.push(description);
      } catch (error) {
        console.error(`Error generating description for course ${courseData.title}:`, error);
        descriptions.push(this.getFallbackDescription(courseData));
      }
    }
    
    return descriptions;
  }
}

// Export singleton instance
module.exports = new OpenAIService();