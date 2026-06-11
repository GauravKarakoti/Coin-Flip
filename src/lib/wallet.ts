// Client-only Phantom wallet helpers
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { PLATFORM_WALLET_ADDRESS, SOLANA_RPC_URL } from "./solana-config";

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey: { toString(): string };
  }>;
  disconnect: () => Promise<void>;
  signAndSendTransaction: (
    tx: Transaction,
  ) => Promise<{ signature: string }>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
};

export function getPhantom(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { solana?: PhantomProvider };
  if (w.solana?.isPhantom) return w.solana;
  return null;
}

export function getConnection() {
  return new Connection(SOLANA_RPC_URL, "confirmed");
}

export async function sendBetTransaction(
  fromPubkeyStr: string,
  amountSol: number,
): Promise<string> {
  const phantom = getPhantom();
  if (!phantom) throw new Error("Phantom wallet not detected");
  const connection = getConnection();
  const fromPubkey = new PublicKey(fromPubkeyStr);
  const toPubkey = new PublicKey(PLATFORM_WALLET_ADDRESS);

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const tx = new Transaction({
    feePayer: fromPubkey,
    blockhash,
    lastValidBlockHeight,
  }).add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports: Math.round(amountSol * LAMPORTS_PER_SOL),
    }),
  );

  const { signature } = await phantom.signAndSendTransaction(tx);
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return signature;
}

export async function getBalanceSol(pubkeyStr: string): Promise<number> {
  const lamports = await getConnection().getBalance(new PublicKey(pubkeyStr));
  return lamports / LAMPORTS_PER_SOL;
}
