/**
 * Yellow Network WebSocket client for Nitrolite RPC
 * Manages connection to Clearnode and request/response flow
 */
import WebSocket from 'ws';
import logger from '../utils/logger.js';
import config from '../config/config.js';

export interface YellowRPCResponse {
  req?: unknown;
  res?: [number, string, Record<string, unknown>];
  error?: { code: number; message: string };
}

export class YellowClient {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private pendingRequests: Map<number, { resolve: (r: YellowRPCResponse) => void; reject: (e: Error) => void }> = new Map();
  private requestIdCounter = 1;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private messageHandler: ((data: YellowRPCResponse) => void) | null = null;

  constructor(wsUrl?: string) {
    this.wsUrl = wsUrl || config.yellowClearnodeWsUrl;
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);
        this.ws.on('open', () => {
          this.reconnectAttempts = 0;
          logger.info('Yellow WebSocket connected', { url: this.wsUrl });
          resolve();
        });
        this.ws.on('message', (data: Buffer | string) => this.handleMessage(data));
        this.ws.on('close', (code, reason) => {
          logger.warn('Yellow WebSocket closed', { code, reason: reason?.toString() });
          this.ws = null;
        });
        this.ws.on('error', (err) => {
          logger.error('Yellow WebSocket error', err);
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.pendingRequests.forEach(({ reject }) => reject(new Error('Client disconnected')));
    this.pendingRequests.clear();
  }

  private handleMessage(data: Buffer | string): void {
    try {
      const str = data.toString();
      const parsed = JSON.parse(str) as YellowRPCResponse;
      const requestId = Array.isArray(parsed.res) ? parsed.res[0] : (parsed as { res?: [number] }).res?.[0];
      const method = Array.isArray(parsed.res) ? parsed.res[1] : undefined;

      if (typeof requestId === 'number' && this.pendingRequests.has(requestId)) {
        const pending = this.pendingRequests.get(requestId)!;
        this.pendingRequests.delete(requestId);
        if (parsed.error) {
          pending.reject(new Error(parsed.error.message || 'RPC error'));
        } else {
          pending.resolve(parsed);
        }
      } else if (this.messageHandler) {
        this.messageHandler(parsed);
      }
    } catch (err) {
      logger.error('Yellow message parse error', { err, data: data.toString().slice(0, 200) });
    }
  }

  /** Send a raw JSON-RPC message and wait for response (by requestId in response) */
  async sendAndWait(messageStr: string): Promise<YellowRPCResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Yellow WebSocket not connected');
    }

    const parsed = JSON.parse(messageStr) as { req?: [number, string, unknown, number?] };
    const requestId = parsed.req?.[0] ?? this.requestIdCounter++;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingRequests.delete(requestId)) {
          reject(new Error('Yellow RPC timeout'));
        }
      }, 30000);
      this.pendingRequests.set(requestId, {
        resolve: (r) => {
          clearTimeout(timeout);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timeout);
          reject(e);
        },
      });
      this.ws!.send(messageStr);
    });
  }

  /** Register handler for unsolicited messages (e.g. auth_challenge) */
  onMessage(handler: (data: YellowRPCResponse) => void): void {
    this.messageHandler = handler;
  }
}
