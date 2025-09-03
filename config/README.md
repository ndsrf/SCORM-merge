# SCORM Merge Configuration

This directory contains configuration files for the SCORM Merge application.

## Configuration File Structure

### default.json

The main configuration file contains the following sections:

#### OpenAI Configuration

```json
{
  "openai": {
    "apiKey": "",
    "model": "gpt-3.5-turbo",
    "maxTokens": 100,
    "enabled": false,
    "timeout": 10000,
    "temperature": 0.7
  }
}
```

- `apiKey`: Your OpenAI API key (can be set via environment variable `OPENAI_API_KEY`)
- `model`: OpenAI model to use for description generation (default: gpt-3.5-turbo)
- `maxTokens`: Maximum tokens for generated descriptions (default: 100)
- `enabled`: Whether OpenAI integration is enabled (automatically enabled if API key is provided)
- `timeout`: Request timeout in milliseconds (default: 10000)
- `temperature`: OpenAI temperature setting for creativity (0.0-2.0, default: 0.7)

#### Description Configuration

```json
{
  "descriptions": {
    "fallbackEnabled": true,
    "defaultDescription": "SCORM learning module",
    "extractFromContent": true,
    "maxContentLength": 2000
  }
}
```

- `fallbackEnabled`: Use fallback descriptions when OpenAI is unavailable
- `defaultDescription`: Default description for packages without specific descriptions
- `extractFromContent`: Extract content from HTML files for description generation
- `maxContentLength`: Maximum characters to extract from HTML content

## Environment Variables

You can override configuration values using environment variables:

- `OPENAI_API_KEY`: Your OpenAI API key
- `OPENAI_ENABLED`: Enable/disable OpenAI integration (true/false)
- `OPENAI_MODEL`: Override the OpenAI model
- `PORT`: Server port (default: 5000)

## Setting up OpenAI Integration

### 1. Get an OpenAI API Key

1. Sign up for an OpenAI account at https://platform.openai.com/
2. Navigate to the API Keys section
3. Create a new API key
4. Copy the key (starts with "sk-")

### 2. Configure the API Key

Choose one of these methods:

#### Method 1: Environment Variable (Recommended for production)

```bash
export OPENAI_API_KEY="sk-your-api-key-here"
npm start
```

#### Method 2: Docker Environment Variable

```bash
docker run -e OPENAI_API_KEY="sk-your-api-key-here" scorm-merge
```

#### Method 3: Configuration File (Not recommended for production)

Edit `config/default.json`:

```json
{
  "openai": {
    "apiKey": "sk-your-api-key-here"
  }
}
```

### 3. Verify Configuration

When the server starts, you should see:

```
OpenAI service initialized successfully
```

If OpenAI is disabled or unavailable, you'll see:

```
OpenAI is disabled or no API key provided
```

## How Description Generation Works

1. **First Priority**: Existing SCORM metadata descriptions
2. **Second Priority**: OpenAI-generated descriptions based on:
   - Course title
   - Filename
   - HTML content sample from the SCORM package
3. **Fallback**: Heuristic-based descriptions or default descriptions

## Cost Considerations

- Each SCORM package processed may generate 1 OpenAI API call
- Typical cost: $0.0015-0.002 per 1000 tokens
- Average description generation: 50-100 tokens per package
- Estimated cost: ~$0.0001-0.0002 per package

## Troubleshooting

### OpenAI Not Working

1. Check API key is correctly set
2. Verify you have API credits in your OpenAI account
3. Check network connectivity to OpenAI API
4. Review logs for specific error messages

### Descriptions Not Appearing

1. Ensure `descriptions.fallbackEnabled` is true for fallback descriptions
2. Check that packages have content for analysis
3. Verify frontend is displaying the `description` field

### Performance Issues

1. Reduce `maxTokens` for faster generation
2. Set `extractFromContent` to false to skip HTML analysis
3. Consider using fallback mode only for better performance

## Security Notes

- Never commit API keys to version control
- Use environment variables for production deployments
- Rotate API keys regularly
- Monitor API usage and set billing limits in OpenAI dashboard