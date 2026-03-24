/**
 * Circle CCTP (Cross-Chain Transfer Protocol) integration.
 * Handles cross-chain USDC transfers via the CCTP bridge.
 */
import { CCTP_DOMAIN, CCTP_TOKEN_MESSENGER, CCTP_MESSAGE_TRANSMITTER, USDC_ADDRESS } from './config.js';

export interface CCTPConfig {
  domain: number;
  tokenMessenger: string;
  messageTransmitter: string;
  usdcAddress: string;
}

export function getCCTPConfig(): CCTPConfig {
  return {
    domain: CCTP_DOMAIN,
    tokenMessenger: CCTP_TOKEN_MESSENGER,
    messageTransmitter: CCTP_MESSAGE_TRANSMITTER,
    usdcAddress: USDC_ADDRESS,
  };
}

export function getUSDCAddress(): string {
  return USDC_ADDRESS;
}
