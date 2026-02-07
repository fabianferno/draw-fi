/**
 * Phase 2: Relayer - open LineFutures positions on behalf of users
 * User signs EIP-712 authorization; relayer submits with its ETH.
 * Note: LineFutures uses msg.sender as position owner - payout goes to relayer.
 * We track positionId->user for accounting; forward payouts to user separately.
 */
import { ethers } from 'ethers';
import config from '../config/config.js';
import { getEthereumProvider } from '../ethereumProvider.js';
import logger from '../utils/logger.js';

const LINEFUTURES_ABI = [
  'function openPosition(uint16 _leverage, string _predictionCommitmentId) external payable returns (uint256)',
  'event PositionOpened(uint256 indexed positionId, address indexed user, uint256 amount, uint16 leverage, uint256 timestamp, string predictionCommitmentId)',
];

export const EIP712_DOMAIN = {
  name: 'Draw-Fi',
  version: '1',
  chainId: 11155111, // Sepolia
};

export const FUND_POSITION_TYPES = {
  FundPosition: [
    { name: 'userAddress', type: 'address' },
    { name: 'amountWei', type: 'uint256' },
    { name: 'leverage', type: 'uint16' },
    { name: 'commitmentId', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/** LineFutures contract minimum position size (0.001 ETH) */
const MIN_POSITION_AMOUNT_WEI = 10n ** 15n;

const nonces: Map<string, number> = new Map();
const positionToUser: Map<number, string> = new Map();

function getNonce(address: string): number {
  const key = address.toLowerCase();
  const n = (nonces.get(key) ?? 0) + 1;
  nonces.set(key, n);
  return n;
}

export interface FundPositionParams {
  userAddress: string;
  amountWei: bigint;
  leverage: number;
  commitmentId: string;
  signature: string;
  nonce?: number;
  deadline?: number;
}

export function getPositionUser(positionId: number): string | undefined {
  return positionToUser.get(positionId);
}

/** Position IDs opened by the relayer on behalf of this user (Yellow flow). */
export function getPositionIdsForUser(userAddress: string): number[] {
  const normalized = userAddress.toLowerCase();
  const ids: number[] = [];
  for (const [id, user] of positionToUser.entries()) {
    if (user.toLowerCase() === normalized) ids.push(id);
  }
  return ids;
}

export class RelayerService {
  private provider: ethers.Provider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;

  constructor() {
    const key = config.yellowPrivateKey || config.ethereumPrivateKey;
    if (!key) throw new Error('YELLOW_RELAYER_PRIVATE_KEY or ETHEREUM_SEPOLIA_PRIVATE_KEY required');
    this.provider = getEthereumProvider();
    this.wallet = new ethers.Wallet(key, this.provider);
    this.contract = new ethers.Contract(config.futuresContractAddress, LINEFUTURES_ABI, this.wallet);
  }

  /** Verify EIP-712 signature and open position. Relayer's ETH used; we track user for accounting. */
  async fundPosition(params: FundPositionParams): Promise<{ positionId: number; txHash: string }> {
    if (!config.yellowRelayerEnabled) {
      throw new Error('Relayer is not enabled. Set YELLOW_RELAYER_ENABLED=true');
    }

    const { userAddress, amountWei, leverage, commitmentId, signature } = params;
    const deadline = params.deadline ?? Math.floor(Date.now() / 1000) + 300; // 5 min default
    const nonce = params.nonce ?? getNonce(userAddress);

    if (Math.floor(Date.now() / 1000) > deadline) {
      throw new Error('Authorization expired');
    }

    const message = {
      userAddress: userAddress as `0x${string}`,
      amountWei,
      leverage,
      commitmentId,
      nonce: BigInt(nonce),
      deadline: BigInt(deadline),
    };

    const digest = ethers.TypedDataEncoder.hash(
      { ...EIP712_DOMAIN, chainId: 11155111 },
      { FundPosition: FUND_POSITION_TYPES.FundPosition },
      message
    );
    const recoveredAddr = ethers.recoverAddress(ethers.getBytes(digest), signature);
    if (recoveredAddr.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error('Invalid signature');
    }

    if (amountWei < MIN_POSITION_AMOUNT_WEI) {
      throw new Error(
        `Position amount below contract minimum. Required at least ${ethers.formatEther(MIN_POSITION_AMOUNT_WEI)} ETH, got ${ethers.formatEther(amountWei)} ETH.`
      );
    }

    const balance = await this.provider.getBalance(this.wallet.address);
    if (balance < amountWei) {
      const addr = this.wallet.address;
      throw new Error(
        `Relayer has insufficient ETH balance. ` +
        `Address: ${addr}. ` +
        `Required: ${ethers.formatEther(amountWei)} ETH (position size). ` +
        `Current: ${ethers.formatEther(balance)} ETH. ` +
        `Send Sepolia ETH to ${addr} (use a Sepolia faucet if on testnet).`
      );
    }

    const tx = await this.contract.openPosition(leverage, commitmentId, { value: amountWei });
    const receipt = await tx.wait();

    let positionId: number | null = null;
    for (const log of receipt.logs || []) {
      try {
        const parsed = this.contract.interface.parseLog(log);
        if (parsed?.name === 'PositionOpened') {
          positionId = Number(parsed.args.positionId.toString());
          break;
        }
      } catch {
        // ignore
      }
    }

    if (positionId === null) {
      throw new Error('Position opened but could not read positionId from logs');
    }

    positionToUser.set(positionId, userAddress);
    logger.info('Relayer funded position', { positionId, userAddress, amountWei: amountWei.toString() });
    return { positionId, txHash: receipt.hash };
  }

  /** Get relayer ETH balance */
  async getRelayerBalance(): Promise<bigint> {
    return this.provider.getBalance(this.wallet.address);
  }
}
