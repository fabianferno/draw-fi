const DEFAULT_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export interface YellowBalance {
  asset: string;
  amount: string;
}

export async function getYellowBalance(address: string): Promise<YellowBalance[]> {
  const res = await fetch(`${DEFAULT_BACKEND_URL}/api/yellow/balance/${address}`);
  if (!res.ok) throw new Error('Failed to fetch Yellow balance');
  const json = await res.json();
  return json.balances ?? [];
}

export async function requestYellowFaucet(userAddress: string): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(`${DEFAULT_BACKEND_URL}/api/yellow/faucet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userAddress }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false, message: json.error || `Request failed (${res.status})` };
  return { success: json.success !== false, message: json.message };
}

export async function getDemoBalance(address: string): Promise<number> {
  const res = await fetch(`${DEFAULT_BACKEND_URL}/api/yellow/demo/balance/${address}`);
  if (!res.ok) throw new Error('Failed to fetch demo balance');
  const json = await res.json();
  return json.balance ?? 0;
}

export async function addDemoBalance(address: string, amount = 1000): Promise<number> {
  const res = await fetch(`${DEFAULT_BACKEND_URL}/api/yellow/demo/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, amount }),
  });
  if (!res.ok) throw new Error('Failed to add demo balance');
  const json = await res.json();
  return json.balance ?? 0;
}

export interface DemoPosition {
  id: string;
  userAddress: string;
  amount: number;
  leverage: number;
  openTimestamp: number;
  predictionCommitmentId: string;
  isOpen: boolean;
  pnl?: number;
  accuracy?: number;
  closedAt?: number;
}

export async function openDemoPosition(params: {
  userAddress: string;
  amount: number;
  leverage: number;
  predictionCommitmentId: string;
}): Promise<DemoPosition | null> {
  const res = await fetch(`${DEFAULT_BACKEND_URL}/api/yellow/demo/position`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || 'Failed to open demo position');
  }
  const json = await res.json();
  return json.position ?? null;
}

export async function closeDemoPosition(positionId: string): Promise<DemoPosition | null> {
  const res = await fetch(`${DEFAULT_BACKEND_URL}/api/yellow/demo/position/${positionId}/close`, {
    method: 'POST',
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || 'Failed to close demo position');
  }
  const json = await res.json();
  return json.position ?? null;
}

export async function getDemoPositions(address: string): Promise<DemoPosition[]> {
  const res = await fetch(`${DEFAULT_BACKEND_URL}/api/yellow/demo/positions/${address}`);
  if (!res.ok) throw new Error('Failed to fetch demo positions');
  const json = await res.json();
  return json.positions ?? [];
}

/** Get our deposit address (users transfer Yellow tokens here) */
export async function getDepositAddress(): Promise<string> {
  const res = await fetch(`${DEFAULT_BACKEND_URL}/api/yellow/deposit-address`);
  if (!res.ok) throw new Error('Failed to get deposit address');
  const json = await res.json();
  return json.depositAddress ?? '';
}

/** Get user's Yellow deposit balance (credited from transfers) */
export async function getYellowDepositBalance(address: string): Promise<string> {
  const res = await fetch(`${DEFAULT_BACKEND_URL}/api/yellow/deposit-balance/${address}`);
  if (!res.ok) throw new Error('Failed to get Yellow deposit balance');
  const json = await res.json();
  return json.balance ?? '0';
}

/** Open position using Yellow balance (off-chain fund, on-chain settle) */
export async function openPositionWithYellowBalance(params: {
  userAddress: string;
  amountWei: string;
  leverage: number;
  commitmentId: string;
  signature: string;
  nonce?: number;
  deadline?: number;
}): Promise<{ positionId: number; txHash: string }> {
  const res = await fetch(`${DEFAULT_BACKEND_URL}/api/yellow/open-with-balance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || 'Open with Yellow balance failed');
  }
  return res.json();
}

/** Phase 2: Fund position via relayer (no gas from user) */
export async function fundPositionViaRelayer(params: {
  userAddress: string;
  amountWei: string;
  leverage: number;
  commitmentId: string;
  signature: string;
  nonce?: number;
  deadline?: number;
}): Promise<{ positionId: number; txHash: string }> {
  const res = await fetch(`${DEFAULT_BACKEND_URL}/api/yellow/fund-position`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || 'Fund position failed');
  }
  return res.json();
}
