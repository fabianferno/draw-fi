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
