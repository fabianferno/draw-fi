import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../backend/.env.local') });

async function getWalletAddress(privateKey: string): Promise<string> {
  const wallet = new ethers.Wallet(privateKey);
  return wallet.address;
}

async function deploy() {
  const privateKey = process.env.ETHEREUM_SEPOLIA_PRIVATE_KEY?.replace(/"/g, '');

  if (!privateKey) {
    throw new Error('ETHEREUM_SEPOLIA_PRIVATE_KEY not found in environment');
  }

  const walletAddress = await getWalletAddress(privateKey);
  console.log(`\n📋 Deployment Configuration:`);
  console.log(`   Wallet Address: ${walletAddress}`);
  console.log(`   Network: Ethereum Sepolia`);
  console.log(`   RPC URL: ${process.env.ETHEREUM_RPC_URL || 'https://rpc.sepolia.org'}\n`);

  // Step 1: Deploy PriceOracle
  console.log('🚀 Step 1: Deploying PriceOracle...');
  const oracleDeployCmd = `npx hardhat ignition deploy --network sepolia ignition/modules/PriceOracle.ts --parameters '{"PriceOracleModule":{"submitterAddress":"${walletAddress}"}}' --reset`;

  console.log(`   Running: ${oracleDeployCmd}\n`);
  const execOpts = {
    encoding: 'utf-8' as const,
    cwd: join(__dirname, '..'),
    stdio: 'pipe' as const,
    env: {
      ...process.env,
      HARDHAT_IGNITION_CONFIRM_DEPLOYMENT: 'false',
      HARDHAT_IGNITION_CONFIRM_RESET: 'false',
    },
  };
  const oracleOutput = execSync(oracleDeployCmd, execOpts);

  // Extract oracle address from output
  const oracleMatch = oracleOutput.match(/deployed to (0x[a-fA-F0-9]{40})/i);
  if (!oracleMatch) {
    throw new Error('Failed to extract oracle address from deployment output');
  }
  const oracleAddress = oracleMatch[1];
  console.log(`   ✅ PriceOracle deployed to: ${oracleAddress}\n`);

  // Step 2: Deploy LineFutures
  console.log('🚀 Step 2: Deploying LineFutures...');
  const futuresDeployCmd = `npx hardhat ignition deploy --network sepolia ignition/modules/LineFutures.ts --parameters '{"LineFuturesModule":{"pnlServerAddress":"${walletAddress}","priceOracleAddress":"${oracleAddress}"}}' --reset`;

  console.log(`   Running: ${futuresDeployCmd}\n`);
  const futuresOutput = execSync(futuresDeployCmd, execOpts);

  // Extract futures address from output
  const futuresMatch = futuresOutput.match(/deployed to (0x[a-fA-F0-9]{40})/i);
  if (!futuresMatch) {
    throw new Error('Failed to extract LineFutures address from deployment output');
  }
  const futuresAddress = futuresMatch[1];
  console.log(`   ✅ LineFutures deployed to: ${futuresAddress}\n`);

  // Summary
  console.log('\n✨ Deployment Complete!\n');
  console.log('📝 Update your backend/.env.local with:');
  console.log(`   CONTRACT_ADDRESS=${oracleAddress}`);
  console.log(`   FUTURES_CONTRACT_ADDRESS=${futuresAddress}`);
  console.log(`   ORACLE_CONTRACT_ADDRESS=${oracleAddress}\n`);

  return {
    oracleAddress,
    futuresAddress,
    walletAddress
  };
}

deploy().catch((error) => {
  console.error('❌ Deployment failed:', error);
  process.exit(1);
});
