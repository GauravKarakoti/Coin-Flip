import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import {
  PLATFORM_FEE_BPS,
  PLATFORM_WALLET_ADDRESS,
  SOLANA_RPC_URL,
} from "./solana-config";
import axios from "axios";

const inputSchema = z.object({
  txSignature: z.string().min(20).max(120),
  playerPubkey: z.string().min(32).max(64),
  side: z.enum(["heads", "tails"]),
  amountSol: z.number().min(0.1).max(0.6),
});
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";

function loadPlatformKeypair(): Keypair {
  const raw = process.env.PLATFORM_WALLET_PRIVATE_KEY;
  if (!raw) throw new Error("Platform wallet not configured");
  const trimmed = raw.trim();
  // Support base58 or JSON array secret keys
  try {
    if (trimmed.startsWith("[")) {
      const arr = JSON.parse(trimmed) as number[];
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    return Keypair.fromSecretKey(bs58.decode(trimmed));
  } catch (e) {
    throw new Error("Invalid PLATFORM_WALLET_PRIVATE_KEY format");
  }
}

export const placeBet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }) => {
    const connection = new Connection(SOLANA_RPC_URL, "confirmed");
    const platformKey = loadPlatformKeypair();
    const platformPubkey = new PublicKey(PLATFORM_WALLET_ADDRESS);
    if (!platformKey.publicKey.equals(platformPubkey)) {
      throw new Error("Platform wallet key mismatch");
    }

    const playerPubkey = new PublicKey(data.playerPubkey);
    const expectedLamports = Math.round(data.amountSol * LAMPORTS_PER_SOL);

    // Verify the player's bet transaction
    let tx = await connection.getParsedTransaction(data.txSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    // Retry briefly if not yet indexed
    for (let i = 0; i < 5 && !tx; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      tx = await connection.getParsedTransaction(data.txSignature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
    }
    if (!tx) throw new Error("Bet transaction not found on chain");
    if (tx.meta?.err) throw new Error("Bet transaction failed on chain");

    // Find a system transfer from player -> platform of the expected amount
    const instrs = tx.transaction.message.instructions as Array<{
      program?: string;
      parsed?: {
        type?: string;
        info?: { source?: string; destination?: string; lamports?: number };
      };
    }>;
    const ok = instrs.some(
      (ix) =>
        ix.program === "system" &&
        ix.parsed?.type === "transfer" &&
        ix.parsed.info?.source === playerPubkey.toBase58() &&
        ix.parsed.info?.destination === platformPubkey.toBase58() &&
        ix.parsed.info?.lamports === expectedLamports,
    );
    if (!ok) throw new Error("Bet transaction does not match expected transfer");

    // const rand = new Uint8Array(1);
    // crypto.getRandomValues(rand);
    // const outcome: "heads" | "tails" = rand[0] % 2 === 0 ? "heads" : "tails";
    console.log("Player bet", data.amountSol, "SOL on", data.side);
    const response = await axios.post(`${BACKEND_URL}/flip`, {
      expectedLamports
    });
    const won = response.data.won;
    console.log("Player", won ? "won!" : "lost.");
    const outcome = won ? data.side : data.side === "heads" ? "tails" : "heads";

    let payoutSignature: string | null = null;
    let payoutLamports = 0;
    if (won) {
      // const gross = expectedLamports * 2;
      const gross = response.data.amount;
      const fee = Math.floor((gross * PLATFORM_FEE_BPS) / 10_000);
      payoutLamports = gross - fee;
      const ix = SystemProgram.transfer({
        fromPubkey: platformPubkey,
        toPubkey: playerPubkey,
        lamports: payoutLamports,
      });
      const payoutTx = new Transaction().add(ix);
      payoutSignature = await sendAndConfirmTransaction(
        connection,
        payoutTx,
        [platformKey],
        { commitment: "confirmed" },
      );
    }

    return {
      outcome,
      won,
      payoutSignature,
      payoutSol: payoutLamports / LAMPORTS_PER_SOL,
    };
  });
