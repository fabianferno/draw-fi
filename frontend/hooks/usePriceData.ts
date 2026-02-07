'use client';

import { useEffect, useReducer, useRef } from 'react';
import type { PricePoint, PriceDataState } from '@/types/price';

type Action =
  | { type: 'ADD_PRICE'; payload: PricePoint }
  | { type: 'ERROR'; payload: Error }
  | { type: 'LOADING' }
  | { type: 'CONNECTED' };

// Generate dummy historical data
function generateDummyHistory(): PricePoint[] {
  const history: PricePoint[] = [];
  const now = Math.floor(Date.now() / 1000);
  const basePrice = 0.98;
  
  // Generate 2 minutes of historical data (120 seconds)
  // One point every 2 seconds for smoother display
  for (let i = 120; i >= 0; i -= 2) {
    const timestamp = now - i;
    // Add some realistic price variation around 0.98
    const variation = (Math.sin(i / 20) * 0.01) + (Math.random() - 0.5) * 0.005;
    const price = basePrice + variation;
    
    history.push({
      time: timestamp,
      value: Math.max(0.95, Math.min(1.01, price)), // Keep within reasonable range
    });
  }
  
  return history;
}

const initialState: PriceDataState = {
  data: generateDummyHistory(), // Start with dummy history
  isLoading: true,
  error: null,
};

function priceDataReducer(state: PriceDataState, action: Action): PriceDataState {
  switch (action.type) {
    case 'LOADING':
      return { ...state, isLoading: true, error: null };
    case 'CONNECTED':
      return { ...state, isLoading: false, error: null };
    case 'ADD_PRICE': {
      const newData = [...state.data, action.payload];
      // Keep 2 minutes of history (120 seconds, assuming ~1 point per second)
      const maxPoints = 120; // Keep 2 minutes of history
      const trimmedData = newData.length > maxPoints ? newData.slice(-maxPoints) : newData;
      return { data: trimmedData, isLoading: false, error: null };
    }
    case 'ERROR':
      return { ...state, isLoading: false, error: action.payload };
    default:
      return state;
  }
}

export function usePriceData(tickerSymbol: string = 'BTCUSDT') {
  const [state, dispatch] = useReducer(priceDataReducer, initialState);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const currentTickerRef = useRef<string>(tickerSymbol);

  useEffect(() => {
    isMountedRef.current = true;
    currentTickerRef.current = tickerSymbol;

    function connect() {
      // Don't connect if component is unmounted
      if (!isMountedRef.current) return;

      const wsUrl = "wss://stream.bybit.com/v5/public/spot";
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) {
          ws.close();
          return;
        }
        dispatch({ type: 'CONNECTED' });

        const ticker = `tickers.${currentTickerRef.current}`;
        ws.send(JSON.stringify({
          op: "subscribe",
          args: [ticker]
        }));
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;

        const msg = JSON.parse(event.data);

        if (!msg.data || !msg.topic) return;
        if (!msg.topic.startsWith("tickers.")) return;

        const t = msg.data;

        if (t.lastPrice) {
          const timestamp = Math.floor(Date.now() / 1000);
          const pricePoint: PricePoint = {
            time: timestamp,
            value: Number(t.lastPrice),
          };

          dispatch({ type: 'ADD_PRICE', payload: pricePoint });
        }
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        dispatch({ type: 'LOADING' });
        reconnectTimeoutRef.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        // Only close if WebSocket is in OPEN or CONNECTING state
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      };
    }

    connect();

    // Cleanup
    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        // Only close if not already closing/closed
        if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.close();
        }
        wsRef.current = null;
      }
    };
  }, [tickerSymbol]);

  return state;
}
