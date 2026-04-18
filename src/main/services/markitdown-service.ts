import { ChildProcess, spawn } from 'child_process';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Configuration options for MarkItDown service
 */
export interface MarkItDownConfig {
  /** Port for the Python microservice (0 = auto-assign) */
  port?: number;
  /** Python executable path (defaults to 'python3') */
  pythonPath?: string;
  /** Path to the Python service script */
  servicePath?: string;
  /** Maximum restart attempts on failure */
  maxRestartAttempts?: number;
  /** Delay between restart attempts (ms) */
  restartDelay?: number;
  /** Health check interval (ms) */
  healthCheckInterval?: number;
  /** Timeout for health checks (ms) */
  healthCheckTimeout?: number;
  /** Startup timeout (ms) */
  startupTimeout?: number;
}

/**
 * Health status of the MarkItDown service
 */
export interface HealthStatus {
  isHealthy: boolean;
  port: number;
  uptime: number;
  lastCheck: Date;
  error?: string;
}

/**
 * Document conversion request
 */
export interface ConversionRequest {
  filePath: string;
  fileType?: string;
  options?: {
    preserveFormatting?: boolean;
    extractImages?: boolean;
    pageRange?: [number, number];
  };
}

/**
 * Document conversion response
 */
export interface ConversionResponse {
  success: boolean;
  markdown: string;
  metadata?: {
    pageCount?: number;
    wordCount?: number;
    format: string;
  };
  error?: string;
}

/**
 * MarkItDownService manages the Python subprocess that runs the MarkItDown backend
 *
 * Features:
 * - Subprocess lifecycle management (spawn, monitor, shutdown)
 * - Health checking with automatic recovery
 * - Auto-restart on failure with exponential backoff
 * - Port management with automatic port finding
 * - Graceful shutdown with cleanup
 *
 * Usage:
 * ```typescript
 * const service = new MarkItDownService();
 * await service.start();
 * const result = await service.convertDocument({ filePath: 'doc.pdf' });
 * await service.stop();
 * ```
 */
export class MarkItDownService {
  private process: ChildProcess | null = null;
  private port: number = 0;
  private config: Required<MarkItDownConfig>;
  private isRunning: boolean = false;
  private startTime: Date | null = null;
  private restartAttempts: number = 0;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private isShuttingDown: boolean = false;
  private lastHealthCheck: HealthStatus | null = null;

  constructor(config: MarkItDownConfig = {}) {
    this.config = {
      port: config.port ?? 0, // 0 means auto-assign
      pythonPath: config.pythonPath ?? 'python3',
      servicePath: config.servicePath ?? this.getDefaultServicePath(),
      maxRestartAttempts: config.maxRestartAttempts ?? 3,
      restartDelay: config.restartDelay ?? 2000,
      healthCheckInterval: config.healthCheckInterval ?? 30000, // 30 seconds
      healthCheckTimeout: config.healthCheckTimeout ?? 5000, // 5 seconds
      startupTimeout: config.startupTimeout ?? 30000, // 30 seconds
    };
  }

  /**
   * Get default path to Python service script
   */
  private getDefaultServicePath(): string {
    // In development: src/backend/markitdown_service.py
    // In production: resources/backend/markitdown_service.py
    const isDev = process.env.NODE_ENV === 'development' || !process.resourcesPath;
    if (isDev) {
      return path.join(__dirname, '../../../backend/markitdown_service.py');
    }
    // In production, the backend folder should be bundled in resources
    return path.join(process.resourcesPath, 'backend', 'markitdown_service.py');
  }

  /**
   * Find an available port
   */
  private async findAvailablePort(startPort: number = 8000): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();

      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          // Port is in use, try next one
          resolve(this.findAvailablePort(startPort + 1));
        } else {
          reject(err);
        }
      });

      server.once('listening', () => {
        const address = server.address();
        const port = typeof address === 'object' && address !== null ? address.port : startPort;
        server.close(() => resolve(port));
      });

      server.listen(startPort);
    });
  }

  /**
   * Verify that Python and required dependencies are available
   */
  private async verifyPythonEnvironment(): Promise<void> {
    try {
      // Check if Python is available
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(this.config.pythonPath, ['--version']);
        proc.on('error', reject);
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Python check failed with code ${code}`));
        });
      });

      // Check if service script exists
      try {
        await fs.access(this.config.servicePath);
      } catch {
        throw new Error(`Service script not found at: ${this.config.servicePath}`);
      }
    } catch (error) {
      throw new Error(`Python environment verification failed: ${error}`);
    }
  }

  /**
   * Start the MarkItDown Python subprocess
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Service is already running');
    }

    if (this.isShuttingDown) {
      throw new Error('Service is shutting down');
    }

    try {
      // Verify Python environment
      await this.verifyPythonEnvironment();

      // Find available port if not specified
      if (this.config.port === 0) {
        this.port = await this.findAvailablePort(8000);
      } else {
        this.port = this.config.port;
      }

      // Spawn Python subprocess
      this.process = spawn(
        this.config.pythonPath,
        [this.config.servicePath, '--port', String(this.port)],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1', // Ensure output is not buffered
          },
        }
      );

      // Set up event handlers
      this.setupProcessHandlers();

      // Wait for service to be ready
      await this.waitForServiceReady();

      this.isRunning = true;
      this.startTime = new Date();
      this.restartAttempts = 0;

      // Start health check monitoring
      this.startHealthCheckMonitoring();

      console.log(`[MarkItDownService] Started successfully on port ${this.port}`);
    } catch (error) {
      this.cleanup();
      throw new Error(`Failed to start MarkItDown service: ${error}`);
    }
  }

  /**
   * Set up process event handlers
   */
  private setupProcessHandlers(): void {
    if (!this.process) return;

    this.process.stdout?.on('data', (data) => {
      console.log(`[MarkItDown STDOUT] ${data.toString().trim()}`);
    });

    this.process.stderr?.on('data', (data) => {
      console.error(`[MarkItDown STDERR] ${data.toString().trim()}`);
    });

    this.process.on('error', (error) => {
      console.error(`[MarkItDownService] Process error:`, error);
      this.handleProcessFailure(error);
    });

    this.process.on('exit', (code, signal) => {
      console.log(`[MarkItDownService] Process exited with code ${code}, signal ${signal}`);

      if (!this.isShuttingDown && this.isRunning) {
        this.handleProcessFailure(new Error(`Process exited unexpectedly: code=${code}, signal=${signal}`));
      }
    });
  }

  /**
   * Wait for the service to be ready by checking health endpoint
   */
  private async waitForServiceReady(): Promise<void> {
    const startTime = Date.now();
    const timeout = this.config.startupTimeout;

    while (Date.now() - startTime < timeout) {
      try {
        const isReady = await this.checkHealth();
        if (isReady) {
          return;
        }
      } catch {
        // Service not ready yet, continue waiting
      }

      // Wait a bit before next check
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`Service failed to start within ${timeout}ms`);
  }

  /**
   * Check if the service is healthy
   */
  async checkHealth(): Promise<boolean> {
    if (!this.process || !this.isRunning) {
      return false;
    }

    try {
      // Use native fetch (available in Node.js 18+)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.healthCheckTimeout);

      const response = await fetch(`http://localhost:${this.port}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json() as { status: string; uptime?: number };

        this.lastHealthCheck = {
          isHealthy: true,
          port: this.port,
          uptime: data.uptime ?? 0,
          lastCheck: new Date(),
        };

        return true;
      }

      return false;
    } catch (error) {
      this.lastHealthCheck = {
        isHealthy: false,
        port: this.port,
        uptime: 0,
        lastCheck: new Date(),
        error: String(error),
      };

      return false;
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus(): HealthStatus | null {
    return this.lastHealthCheck;
  }

  /**
   * Start periodic health check monitoring
   */
  private startHealthCheckMonitoring(): void {
    this.stopHealthCheckMonitoring();

    this.healthCheckTimer = setInterval(async () => {
      const isHealthy = await this.checkHealth();

      if (!isHealthy && this.isRunning && !this.isShuttingDown) {
        console.warn('[MarkItDownService] Health check failed, attempting restart');
        await this.handleProcessFailure(new Error('Health check failed'));
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop health check monitoring
   */
  private stopHealthCheckMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Handle process failure with auto-restart
   */
  private async handleProcessFailure(error: Error): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isRunning = false;
    this.cleanup();

    if (this.restartAttempts < this.config.maxRestartAttempts) {
      this.restartAttempts++;

      console.log(
        `[MarkItDownService] Attempting restart ${this.restartAttempts}/${this.config.maxRestartAttempts}`
      );

      // Exponential backoff
      const delay = this.config.restartDelay * Math.pow(2, this.restartAttempts - 1);

      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        await this.start();
        console.log('[MarkItDownService] Restart successful');
      } catch (restartError) {
        console.error('[MarkItDownService] Restart failed:', restartError);

        if (this.restartAttempts >= this.config.maxRestartAttempts) {
          console.error('[MarkItDownService] Max restart attempts reached, giving up');
        }
      }
    } else {
      console.error('[MarkItDownService] Max restart attempts reached:', error);
    }
  }

  /**
   * Convert a document to Markdown
   */
  async convertDocument(request: ConversionRequest): Promise<ConversionResponse> {
    if (!this.isRunning) {
      throw new Error('Service is not running');
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

      const response = await fetch(`http://localhost:${this.port}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json() as ConversionResponse;
      return result;
    } catch (error) {
      return {
        success: false,
        markdown: '',
        error: `Conversion failed: ${error}`,
      };
    }
  }

  /**
   * Stop the service gracefully
   */
  async stop(): Promise<void> {
    if (!this.isRunning && !this.process) {
      return;
    }

    this.isShuttingDown = true;
    this.stopHealthCheckMonitoring();

    console.log('[MarkItDownService] Initiating graceful shutdown');

    try {
      // Try graceful shutdown first
      if (this.process && !this.process.killed) {
        // Send SIGTERM for graceful shutdown
        this.process.kill('SIGTERM');

        // Wait for process to exit (with timeout)
        await Promise.race([
          new Promise<void>((resolve) => {
            this.process?.once('exit', () => resolve());
          }),
          new Promise<void>((resolve) => setTimeout(resolve, 5000)),
        ]);

        // Force kill if still running
        if (this.process && !this.process.killed) {
          console.warn('[MarkItDownService] Graceful shutdown timeout, forcing kill');
          this.process.kill('SIGKILL');
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } finally {
      this.cleanup();
      console.log('[MarkItDownService] Shutdown complete');
    }
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    this.isRunning = false;
    this.process = null;
    this.startTime = null;
    this.stopHealthCheckMonitoring();
  }

  /**
   * Get service status information
   */
  getStatus(): {
    isRunning: boolean;
    port: number;
    uptime: number;
    restartAttempts: number;
  } {
    return {
      isRunning: this.isRunning,
      port: this.port,
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      restartAttempts: this.restartAttempts,
    };
  }

  /**
   * Check if service is running
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get service port
   */
  getPort(): number {
    return this.port;
  }
}
