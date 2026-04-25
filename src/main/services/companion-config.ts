import { app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { randomBytes } from 'crypto';

export interface CompanionConfig {
  enabled: boolean;
  port: number;
  token: string;
  libraryPath: string | null;
  createdAt: string;
}

export interface LanUrl {
  iface: string;
  url: string;
}

const DEFAULT_PORT = 8421;

function configFilePath(): string {
  return path.join(app.getPath('userData'), 'companion.json');
}

function newToken(): string {
  return randomBytes(32).toString('hex');
}

function defaultConfig(): CompanionConfig {
  return {
    enabled: false,
    port: DEFAULT_PORT,
    token: newToken(),
    libraryPath: null,
    createdAt: new Date().toISOString(),
  };
}

export class CompanionConfigStore {
  private cache: CompanionConfig | null = null;

  async load(): Promise<CompanionConfig> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(configFilePath(), 'utf-8');
      const parsed = JSON.parse(raw) as Partial<CompanionConfig>;
      const merged: CompanionConfig = {
        enabled: !!parsed.enabled,
        port: typeof parsed.port === 'number' ? parsed.port : DEFAULT_PORT,
        token: typeof parsed.token === 'string' && parsed.token.length === 64 ? parsed.token : newToken(),
        libraryPath: typeof parsed.libraryPath === 'string' ? parsed.libraryPath : null,
        createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
      };
      this.cache = merged;
      return merged;
    } catch {
      const fresh = defaultConfig();
      this.cache = fresh;
      return fresh;
    }
  }

  async save(next: Partial<CompanionConfig>): Promise<CompanionConfig> {
    const current = await this.load();
    const merged: CompanionConfig = { ...current, ...next };
    await fs.writeFile(configFilePath(), JSON.stringify(merged, null, 2), 'utf-8');
    this.cache = merged;
    return merged;
  }

  async rotateToken(): Promise<CompanionConfig> {
    return this.save({ token: newToken() });
  }

  get(): CompanionConfig | null {
    return this.cache;
  }

  getLanUrls(port: number): LanUrl[] {
    const interfaces = os.networkInterfaces();
    const urls: LanUrl[] = [];
    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      if (isLikelyVirtual(name)) continue;
      for (const addr of addrs) {
        if (addr.family !== 'IPv4' || addr.internal) continue;
        urls.push({ iface: name, url: `http://${addr.address}:${port}` });
      }
    }
    // Prefer interfaces that look like physical WiFi/Ethernet first so the
    // QR code in the UI points to a routable address by default.
    urls.sort((a, b) => prefScore(b.iface) - prefScore(a.iface));
    return urls;
  }
}

// Drop VPN/virtual/loopback-ish interfaces that won't route from a phone.
function isLikelyVirtual(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.startsWith('utun') ||
    n.startsWith('awdl') ||
    n.startsWith('llw') ||
    n.startsWith('bridge') ||
    n.startsWith('gif') ||
    n.startsWith('stf') ||
    n.startsWith('anpi') ||
    n.startsWith('docker') ||
    n.startsWith('veth') ||
    n.startsWith('br-') ||
    n.startsWith('vethernet') ||
    n.startsWith('vboxnet') ||
    n.startsWith('vmnet') ||
    n.startsWith('zt') ||
    n.includes('tailscale') ||
    n.includes('loopback')
  );
}

function prefScore(name: string): number {
  const n = name.toLowerCase();
  if (n === 'en0' || n === 'wi-fi' || n === 'wlan0') return 100;
  if (n.startsWith('en') || n.startsWith('wlan') || n.startsWith('wlp')) return 80;
  if (n.startsWith('eth') || n === 'ethernet') return 60;
  return 0;
}

export const companionConfigStore = new CompanionConfigStore();
