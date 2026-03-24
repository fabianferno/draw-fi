'use client';

import { useYellowClientContext } from '@/contexts/YellowClientContext';

export function useYellowClient() {
  return useYellowClientContext();
}
