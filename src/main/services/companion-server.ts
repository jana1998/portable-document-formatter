import * as http from 'http';
import { createRequestHandler, type CompanionRouteDeps } from './companion-routes';
import { companionConfigStore } from './companion-config';

const MAX_PORT_PROBES = 5;

export class CompanionServer {
  private server: http.Server | null = null;
  private activePort: number | null = null;

  isRunning(): boolean {
    return this.server !== null;
  }

  getActivePort(): number | null {
    return this.activePort;
  }

  async start(deps: CompanionRouteDeps): Promise<{ port: number }> {
    if (this.server) return { port: this.activePort! };
    const config = await companionConfigStore.load();
    const handler = createRequestHandler(deps);

    let lastError: unknown = null;
    for (let i = 0; i < MAX_PORT_PROBES; i++) {
      const probePort = config.port + i;
      try {
        const server = await this.bind(handler, probePort);
        this.server = server;
        this.activePort = probePort;
        if (probePort !== config.port) {
          await companionConfigStore.save({ port: probePort });
        }
        return { port: probePort };
      } catch (err) {
        lastError = err;
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'EADDRINUSE') break;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Failed to bind companion server');
  }

  private bind(
    handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
    port: number
  ): Promise<http.Server> {
    return new Promise((resolve, reject) => {
      const server = http.createServer(handler);
      const onError = (err: Error) => {
        server.removeListener('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        server.removeListener('error', onError);
        resolve(server);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '0.0.0.0');
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    this.activePort = null;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      // Drop keepalive sockets so quit/disable doesn't stall.
      const closeAll = (server as unknown as { closeAllConnections?: () => void }).closeAllConnections;
      if (typeof closeAll === 'function') closeAll.call(server);
    });
  }
}

export const companionServer = new CompanionServer();
