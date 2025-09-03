const fs = require('fs');
const path = require('path');

class Config {
  constructor() {
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      const configPath = path.join(__dirname, '../config/default.json');
      const configFile = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configFile);

      // Override with environment variables if present
      if (process.env.OPENAI_API_KEY) {
        config.openai.apiKey = process.env.OPENAI_API_KEY;
      }

      if (process.env.OPENAI_ENABLED) {
        config.openai.enabled = process.env.OPENAI_ENABLED === 'true';
      }

      if (process.env.OPENAI_MODEL) {
        config.openai.model = process.env.OPENAI_MODEL;
      }

      if (process.env.PORT) {
        config.server.port = parseInt(process.env.PORT);
      }

      // Enable OpenAI if API key is provided
      if (config.openai.apiKey && config.openai.apiKey.trim() !== '') {
        config.openai.enabled = true;
      }

      return config;
    } catch (error) {
      console.error('Error loading configuration:', error.message);
      // Return default configuration
      return {
        openai: {
          apiKey: process.env.OPENAI_API_KEY || '',
          model: 'gpt-3.5-turbo',
          maxTokens: 100,
          enabled: false,
          timeout: 10000,
          temperature: 0.7
        },
        descriptions: {
          fallbackEnabled: true,
          defaultDescription: 'SCORM learning module',
          extractFromContent: true,
          maxContentLength: 2000
        },
        server: {
          port: parseInt(process.env.PORT) || 5000
        }
      };
    }
  }

  get(key) {
    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  isOpenAIEnabled() {
    return this.get('openai.enabled') && this.get('openai.apiKey');
  }
}

// Export singleton instance
module.exports = new Config();