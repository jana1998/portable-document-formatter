# MarkItDown Integration Documentation

## Overview

This document describes the MarkItDown backend integration for the Portable Document Formatter application. The integration provides multi-format document processing capabilities by spawning and managing a Python microservice that wraps Microsoft's MarkItDown library.

## Architecture

### Components

1. **MarkItDownService** (`src/main/services/markitdown-service.ts`)
   - Main service class for subprocess lifecycle management
   - Handles process spawning, monitoring, and shutdown
   - Implements health checking and auto-restart logic
   - Manages port assignment and availability

2. **IPC Handlers** (`src/main/main.ts`)
   - `document:convert` - Convert documents to Markdown
   - `markitdown:health` - Check service health status

3. **Python Backend** (to be implemented)
   - FastAPI microservice wrapping MarkItDown
   - `/health` endpoint for health checks
   - `/convert` endpoint for document conversion

## Features

### Subprocess Management

The `MarkItDownService` class provides comprehensive subprocess lifecycle management:

```typescript
const service = new MarkItDownService({
  port: 0,                      // Auto-assign port
  pythonPath: 'python3',        // Python executable
  maxRestartAttempts: 3,        // Max restart attempts
  restartDelay: 2000,           // Delay between restarts (ms)
  healthCheckInterval: 30000,   // Health check interval (ms)
  healthCheckTimeout: 5000,     // Health check timeout (ms)
  startupTimeout: 30000,        // Startup timeout (ms)
});

await service.start();
```

### Port Management

The service automatically finds available ports if `port: 0` is specified:

- Scans starting from port 8000
- Retries with incremented port numbers if unavailable
- Exposes `getPort()` method to retrieve assigned port

### Health Checking

Periodic health checks ensure service availability:

- **Interval**: Configurable (default: 30 seconds)
- **Timeout**: Configurable (default: 5 seconds)
- **Endpoint**: `GET http://localhost:{port}/health`
- **Response**: `{ status: "ok", uptime: <seconds> }`

Health status is tracked and can be queried:

```typescript
const health = service.getHealthStatus();
// {
//   isHealthy: boolean,
//   port: number,
//   uptime: number,
//   lastCheck: Date,
//   error?: string
// }
```

### Auto-Restart on Failure

The service automatically restarts on failures:

- **Max Attempts**: Configurable (default: 3)
- **Backoff Strategy**: Exponential backoff
- **Delay Formula**: `baseDelay * 2^(attempt - 1)`
- **Example**: 2s, 4s, 8s delays for 3 attempts

Restart triggers:
- Process exits unexpectedly
- Health check failures
- Uncaught errors in subprocess

### Graceful Shutdown

Clean shutdown procedure:

1. Send SIGTERM for graceful shutdown
2. Wait up to 5 seconds for process to exit
3. Force kill (SIGKILL) if timeout exceeded
4. Clean up resources and timers

```typescript
await service.stop();
```

The application automatically shuts down the service on `before-quit` event.

## API Reference

### MarkItDownService Class

#### Constructor

```typescript
new MarkItDownService(config?: MarkItDownConfig)
```

**Config Options:**
- `port`: Port for Python service (0 = auto-assign)
- `pythonPath`: Python executable path (default: 'python3')
- `servicePath`: Path to Python service script
- `maxRestartAttempts`: Max restart attempts (default: 3)
- `restartDelay`: Base delay between restarts (default: 2000ms)
- `healthCheckInterval`: Health check interval (default: 30000ms)
- `healthCheckTimeout`: Health check timeout (default: 5000ms)
- `startupTimeout`: Startup timeout (default: 30000ms)

#### Methods

##### `async start(): Promise<void>`

Start the Python subprocess.

**Throws:**
- If service is already running
- If Python environment verification fails
- If service fails to start within timeout

##### `async stop(): Promise<void>`

Stop the service gracefully.

##### `async checkHealth(): Promise<boolean>`

Check if service is healthy.

**Returns:** `true` if healthy, `false` otherwise

##### `async convertDocument(request: ConversionRequest): Promise<ConversionResponse>`

Convert a document to Markdown.

**Request:**
```typescript
{
  filePath: string;
  fileType?: string;
  options?: {
    preserveFormatting?: boolean;
    extractImages?: boolean;
    pageRange?: [number, number];
  };
}
```

**Response:**
```typescript
{
  success: boolean;
  markdown: string;
  metadata?: {
    pageCount?: number;
    wordCount?: number;
    format: string;
  };
  error?: string;
}
```

##### `getStatus(): object`

Get current service status.

**Returns:**
```typescript
{
  isRunning: boolean;
  port: number;
  uptime: number;
  restartAttempts: number;
}
```

##### `getHealthStatus(): HealthStatus | null`

Get last health check result.

##### `isServiceRunning(): boolean`

Check if service is running.

##### `getPort(): number`

Get service port.

## IPC Integration

### Renderer Process Usage

```typescript
// Convert a document
const result = await window.electronAPI.convertDocument({
  filePath: '/path/to/document.pdf',
  fileType: 'pdf',
  options: {
    preserveFormatting: true,
  }
});

if (result.success) {
  console.log('Markdown:', result.markdown);
} else {
  console.error('Error:', result.error);
}

// Check service health
const health = await window.electronAPI.checkMarkItDownHealth();
console.log('Service status:', health);
```

### Preload Script

Add to `src/main/preload.ts`:

```typescript
{
  convertDocument: (request) => ipcRenderer.invoke('document:convert', request),
  checkMarkItDownHealth: () => ipcRenderer.invoke('markitdown:health'),
}
```

## Python Backend Requirements

The Python microservice should implement:

### 1. FastAPI Application

```python
from fastapi import FastAPI
import uvicorn
import argparse

app = FastAPI()
start_time = time.time()

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "uptime": time.time() - start_time
    }

@app.post("/convert")
async def convert(request: ConversionRequest):
    # Use MarkItDown to convert document
    result = markitdown.convert(request.file_path)
    return {
        "success": True,
        "markdown": result.markdown,
        "metadata": {
            "format": result.format,
            "pageCount": result.page_count,
        }
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()

    uvicorn.run(app, host="127.0.0.1", port=args.port)
```

### 2. Dependencies

Create `backend/requirements.txt`:

```
fastapi>=0.104.0
uvicorn>=0.24.0
markitdown>=0.1.0
python-multipart>=0.0.6
```

### 3. Installation

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Testing

### Unit Tests

Run the comprehensive test suite:

```bash
npm test -- src/tests/markitdown-service.test.ts
```

Test coverage includes:
- Service initialization and configuration
- Lifecycle management (start/stop)
- Port management
- Health checking
- Error handling
- Auto-restart logic
- Type safety
- IPC integration readiness

### Manual Testing

1. **Start the service:**
   ```bash
   npm run dev
   ```

2. **Check logs:**
   Look for `[MarkItDownService] Started successfully on port XXXX`

3. **Test health endpoint:**
   ```bash
   curl http://localhost:XXXX/health
   ```

4. **Test conversion (when Python backend is ready):**
   ```bash
   curl -X POST http://localhost:XXXX/convert \
     -H "Content-Type: application/json" \
     -d '{"filePath": "/path/to/doc.pdf"}'
   ```

## Error Handling

### Common Errors

1. **"Python environment verification failed"**
   - Ensure Python 3 is installed
   - Check `pythonPath` configuration
   - Verify Python is in PATH

2. **"Service script not found"**
   - Ensure Python backend script exists
   - Check `servicePath` configuration
   - Verify file permissions

3. **"Failed to start within timeout"**
   - Check Python dependencies are installed
   - Increase `startupTimeout` if needed
   - Check for port conflicts

4. **"Max restart attempts reached"**
   - Check Python service logs for errors
   - Verify MarkItDown dependencies
   - Check available system resources

### Logging

Service logs are prefixed for easy filtering:

- `[MarkItDownService]` - Service lifecycle events
- `[MarkItDown STDOUT]` - Python stdout
- `[MarkItDown STDERR]` - Python stderr
- `[Main]` - Main process integration

## Performance Considerations

### Resource Usage

- **Memory**: ~50-100MB per Python process
- **CPU**: Minimal when idle, spikes during conversion
- **Startup Time**: ~2-5 seconds (depending on Python load time)

### Optimization Tips

1. **Port Assignment**: Use fixed port in production for faster startup
2. **Health Checks**: Increase interval for lower overhead
3. **Restart Attempts**: Lower max attempts for faster failure detection

## Production Deployment

### Build Configuration

1. **Bundle Python backend:**
   ```json
   {
     "build": {
       "extraResources": [
         {
           "from": "backend/",
           "to": "backend/"
         }
       ]
     }
   }
   ```

2. **Include Python runtime (optional):**
   - Bundle Python interpreter for self-contained app
   - Or require Python installation

### Platform-Specific Notes

**macOS:**
- Python 3 usually pre-installed
- May need to install via Homebrew for newer versions

**Windows:**
- Require Python installation or bundle with app
- Use `python` instead of `python3`

**Linux:**
- Python 3 typically available
- May need to install via package manager

## Future Enhancements

1. **Process Pooling**: Support multiple Python workers
2. **Batch Processing**: Queue multiple conversions
3. **Caching**: Cache conversion results with IndexedDB
4. **Progress Tracking**: Real-time conversion progress
5. **Fallback Support**: Auto-fallback to Tesseract.js
6. **Metrics**: Track conversion times and success rates

## Troubleshooting

### Service Won't Start

1. Check Python installation:
   ```bash
   python3 --version
   ```

2. Verify service script exists:
   ```bash
   ls -l backend/markitdown_service.py
   ```

3. Check logs in DevTools console

### Health Checks Failing

1. Verify service is running:
   ```bash
   ps aux | grep markitdown
   ```

2. Test endpoint manually:
   ```bash
   curl http://localhost:8000/health
   ```

3. Check firewall settings

### Conversions Failing

1. Check Python service logs
2. Verify file path is accessible
3. Test with different file formats
4. Check MarkItDown library installation

## Contributing

When modifying the MarkItDown integration:

1. Run tests: `npm test`
2. Check TypeScript compilation: `npm run build:main`
3. Test manually with dev build: `npm run dev`
4. Update this documentation
5. Add test coverage for new features

## License

This integration is part of the Portable Document Formatter project (MIT License).
