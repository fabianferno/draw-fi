# Contract Deployment Guide for Ethereum Sepolia

## Prerequisites

1. Install dependencies: `cd contracts && pnpm install`
2. Ensure you have Sepolia ETH in your deployment wallet
3. The private key from `backend/.env.local` will be used

## Step 1: Get Your Wallet Address

The wallet address is derived from your private key. You can get it by running:

```bash
cd contracts
node -e "const { ethers } = require('ethers'); const wallet = new ethers.Wallet('YOUR_PRIVATE_KEY'); console.log(wallet.address);"
```

Or use the address: `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb` (derived from your private key)

## Step 2: Deploy PriceOracle

```bash
cd contracts
export ETHEREUM_RPC_URL=https://rpc.sepolia.org
export ETHEREUM_SEPOLIA_PRIVATE_KEY=your_private_key_here

pnpm exec hardhat ignition deploy --network sepolia ignition/modules/PriceOracle.ts \
  --parameters '{"PriceOracleModule":{"submitterAddress":"0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"}}'
```

**Save the deployed oracle address** from the output.

## Step 3: Deploy LineFutures

Replace `ORACLE_ADDRESS` with the address from Step 2:

```bash
pnpm exec hardhat ignition deploy --network sepolia ignition/modules/LineFutures.ts \
  --parameters '{"LineFuturesModule":{"pnlServerAddress":"0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb","priceOracleAddress":"ORACLE_ADDRESS"}}'
```

**Save the deployed LineFutures address** from the output.

## Step 4: Update Backend Environment

Update `backend/.env.local`:

```env
CONTRACT_ADDRESS=<oracle_address_from_step_2>
FUTURES_CONTRACT_ADDRESS=<linefutures_address_from_step_3>
ORACLE_CONTRACT_ADDRESS=<oracle_address_from_step_2>
```

## Step 5: Verify on Etherscan

- Sepolia Etherscan: https://sepolia.etherscan.io/
- Search for your deployed contract addresses

## Notes

- Make sure your wallet has enough Sepolia ETH for gas fees
- The submitter and PnL server addresses should be the same (your backend wallet)
- After deployment, restart your backend server
