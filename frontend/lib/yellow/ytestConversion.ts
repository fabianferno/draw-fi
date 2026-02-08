/**
 * ytest.usd ↔ ETH conversion for the predict flow.
 * Backend uses the same rate (YELLOW_ETH_TO_ytest_RATE): 1 ETH = rate ytest.usd (default 100).
 * User balance and position amounts are in ytest.usd; the contract uses ETH (wei).
 */

const ETH_DECIMALS = 18;
const YTEST_DECIMALS = 6;

/** 1 ETH = this many ytest.usd. Must match backend config.yellowEthToYtestRate. */
export function getYtestToEthRate(): number {
  const v = parseFloat(
    process.env.NEXT_PUBLIC_YELLOW_ETH_TO_ytest_RATE || '100'
  );
  return Number.isFinite(v) && v > 0 ? v : 100;
}

/** Convert human ytest.usd amount to ETH wei (for API/contract). */
export function ytestToEthWei(ytestAmount: number): bigint {
  const rate = BigInt(Math.floor(getYtestToEthRate()));
  // 1 ytest.usd = 1/rate ETH => wei = ytestAmount * 1e18 / rate
  const wei =
    (BigInt(Math.floor(ytestAmount * 10 ** YTEST_DECIMALS)) *
      BigInt(10 ** ETH_DECIMALS)) /
    (rate * BigInt(10 ** YTEST_DECIMALS));
  return wei;
}

/** Convert ETH wei to human ytest.usd amount. */
export function ethWeiToYtestHuman(wei: bigint): number {
  const rate = BigInt(Math.floor(getYtestToEthRate()));
  const ytestUnits =
    (wei * rate * BigInt(10 ** YTEST_DECIMALS)) / BigInt(10 ** ETH_DECIMALS);
  return Number(ytestUnits) / 10 ** YTEST_DECIMALS;
}

/** Minimum position size in ETH (contract). Same as backend MIN_POSITION_AMOUNT_WEI. */
const MIN_ETH = 0.001;

/** Minimum amount in ytest.usd (so that converted wei >= 0.001 ETH). */
export function getMinYtestAmount(): number {
  const rate = getYtestToEthRate();
  return MIN_ETH * rate; // 0.1 at rate 100
}
