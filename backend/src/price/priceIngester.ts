import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface PriceEvent {
  ticker: string;
  price: number;
  timestamp: number;
}

export class PriceIngester extends EventEmitter {
  private ws: WebSocket | null = null;
  private tickers: Set<string>;
  private wssUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private isConnecting = false;
  private shouldReconnect = true;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastMessageTime = 0;

  constructor(tickers: string[], wssUrl: string = 'wss://stream.bybit.com/v5/public/spot') {
    super();
    this.tickers = new Set(tickers);
    this.wssUrl = wssUrl;
  }

  public async start(): Promise<void> {
    console.log(`[PriceIngester] Starting with tickers: ${[...this.tickers].join(', ')}`);
    this.shouldReconnect = true;
    await this.connect();
  }

  public stop(): void {
    console.log('[PriceIngester] Stopping');
    this.shouldReconnect = false;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  public addTicker(ticker: string): void {
    if (this.tickers.has(ticker)) return;
    this.tickers.add(ticker);
    console.log(`[PriceIngester] Added ticker: ${ticker}`);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.subscribeTo([`tickers.${ticker}`]);
    }
  }

  public getTickers(): string[] {
    return [...this.tickers];
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private async connect(): Promise<void> {
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      this.ws = new WebSocket(this.wssUrl);

      this.ws.on('open', () => {
        console.log('[PriceIngester] WebSocket connected');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.isConnecting = false;
        this.subscribeAll();
        this.startHeartbeat();
        this.emit('connected');
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error: Error) => {
        console.error('[PriceIngester] WebSocket error:', error.message);
      });

      this.ws.on('close', () => {
        console.log('[PriceIngester] WebSocket closed');
        this.isConnecting = false;
        this.ws = null;
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
        }
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('ping', () => {
        this.ws?.pong();
      });
    } catch (error) {
      console.error('[PriceIngester] Connection failed:', error);
      this.isConnecting = false;
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  private subscribeAll(): void {
    const topics = [...this.tickers].map(t => `tickers.${t}`);
    this.subscribeTo(topics);
  }

  private subscribeTo(topics: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg = { op: 'subscribe', args: topics };
    console.log(`[PriceIngester] Subscribing to: ${topics.join(', ')}`);
    this.ws.send(JSON.stringify(msg));
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());

      if (message.op === 'ping') {
        this.ws?.send(JSON.stringify({ op: 'pong' }));
        return;
      }

      if (message.op === 'subscribe' && message.success) {
        console.log(`[PriceIngester] Subscribed successfully`);
        return;
      }

      if (message.topic && message.topic.startsWith('tickers.') && message.data) {
        this.lastMessageTime = Date.now();
        const ticker = message.topic.replace('tickers.', '');
        const price = parseFloat(message.data.lastPrice);
        const timestamp = message.ts || Date.now();

        if (isNaN(price) || price <= 0) return;

        const event: PriceEvent = { ticker, price, timestamp };
        this.emit('price', event);
      }
    } catch (error) {
      console.error('[PriceIngester] Parse error:', error);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[PriceIngester] Max reconnect attempts reached');
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );
    console.log(`[PriceIngester] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => {
      if (this.shouldReconnect) this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      if (this.lastMessageTime > 0 && Date.now() - this.lastMessageTime > 30000) {
        console.warn('[PriceIngester] No messages for 30s, reconnecting');
        this.ws?.close();
      }
    }, 10000);
  }
}
