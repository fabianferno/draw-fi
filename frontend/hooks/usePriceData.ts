'use client';

import { useEffect, useReducer, useRef } from 'react';
import type { PricePoint, PriceDataState } from '@/types/price';

type Action =
  | { type: 'ADD_PRICE'; payload: PricePoint }
  | { type: 'ERROR'; payload: Error }
  | { type: 'LOADING' }
  | { type: 'CONNECTED' };

const initialState: PriceDataState = {
  data: [],
  isLoading: true,
  error: null,
};

const MAX_POINTS = 300; // ~5 minutes at 1 tick/sec

function priceDataReducer(state: PriceDataState, action: Action): PriceDataState {
  switch (action.type) {
    case 'LOADING':
      return { ...state, isLoading: true, error: null };
    case 'CONNECTED':
      return { ...state, isLoading: false, error: null };
    case 'ADD_PRICE': {
      // Deduplicate: if the last point has the same timestamp, replace it
      // instead of pushing a new one (Bybit sends multiple ticks/sec)
      const lastIdx = state.data.length - 1;
      let newData: PricePoint[];
      if (lastIdx >= 0 && state.data[lastIdx].time === action.payload.time) {
        newData = [...state.data];
        newData[lastIdx] = action.payload;
      } else {
        newData = [...state.data, action.payload];
      }
      const trimmedData = newData.length > MAX_POINTS ? newData.slice(-MAX_POINTS) : newData;
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
