'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrivyProvider } from '@privy-io/react-auth';
import { defineChain } from 'viem';
import { TokenPairProvider } from '@/contexts/TokenPairContext';

const queryClient = new QueryClient();

// Define Ethereum Sepolia chain for Privy
const ethereumSepoliaChain = defineChain({
  id: 11155111,
  name: 'Ethereum Sepolia',
  network: 'sepolia',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL ||
          'https://rpc.sepolia.org',
      ],
    },
  },
  blockExplorers: {
    default: {
      name: 'Etherscan Sepolia',
      url: 'https://sepolia.etherscan.io/',
    },
  },
  testnet: true,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    console.warn(
      'NEXT_PUBLIC_PRIVY_APP_ID is not set. PrivyProvider will not initialize correctly.',
    );
  }

  return (
    <PrivyProvider
      appId={appId ?? ''}
      config={{
        embeddedWallets: {
          createOnLogin: 'all-users',
          noPromptOnSignature: true,
          showWalletUIs: false,
        },
        defaultChain: ethereumSepoliaChain,
        supportedChains: [ethereumSepoliaChain],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <TokenPairProvider>
          {children}
        </TokenPairProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
