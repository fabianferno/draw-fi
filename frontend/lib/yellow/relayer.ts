/**
 * EIP-712 signing for Yellow relayer (Phase 2)
 * User signs authorization for relayer to open position on their behalf
 */
import type { Signer } from 'ethers';

export const EIP712_DOMAIN = {
  name: 'Draw-Fi',
  version: '1',
  chainId: 11155111,
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

export interface FundPositionMessage {
  userAddress: string;
  amountWei: bigint;
  leverage: number;
  commitmentId: string;
  nonce: bigint;
  deadline: bigint;
}

export async function signFundPosition(
  signer: Signer,
  message: FundPositionMessage
): Promise<string> {
  const signerAddress = await signer.getAddress();
  const msg = { ...message, userAddress: signerAddress };
  return signer.signTypedData(
    EIP712_DOMAIN,
    { FundPosition: FUND_POSITION_TYPES.FundPosition },
    msg
  );
}
