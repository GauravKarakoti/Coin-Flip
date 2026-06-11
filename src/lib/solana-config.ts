// Shared Solana config (safe for client + server)
export const SOLANA_NETWORK = "devnet" as const;
export const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
export const PLATFORM_WALLET_ADDRESS =
  "9nnn19NzGyrsFVks8GMySjcN3EtoAJCsWXw9XhmWzCes";

export const BET_AMOUNTS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6] as const;
export const PLATFORM_FEE_BPS = 300; // 3%
