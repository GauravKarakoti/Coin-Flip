import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, Coins, ExternalLink, LogOut } from "lucide-react";
import { placeBet } from "@/lib/flip.functions";
import {
  getBalanceSol,
  getPhantom,
  sendBetTransaction,
} from "@/lib/wallet";
import { BET_AMOUNTS, PLATFORM_WALLET_ADDRESS } from "@/lib/solana-config";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SolFlip — On-chain coin flip on Solana" },
      {
        name: "description",
        content:
          "Connect your Solana wallet, pick heads or tails, double your SOL on devnet.",
      },
      { property: "og:title", content: "SolFlip — Coin flip on Solana" },
      {
        property: "og:description",
        content: "Pick a side. Flip the coin. Win 1.94× your bet.",
      },
    ],
  }),
  component: Index,
  ssr: false,
});

type Side = "heads" | "tails";
type FlipResult = {
  outcome: Side;
  won: boolean;
  payoutSignature: string | null;
  payoutSol: number;
};

function short(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function Index() {
  const placeBetFn = useServerFn(placeBet);
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [side, setSide] = useState<Side>("heads");
  const [amount, setAmount] = useState<number>(0.1);
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState<FlipResult | null>(null);
  const [busy, setBusy] = useState(false);

  // Auto-reconnect if previously trusted
  useEffect(() => {
    const phantom = getPhantom();
    if (!phantom) return;
    phantom
      .connect({ onlyIfTrusted: true })
      .then((res) => setPubkey(res.publicKey.toString()))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!pubkey) {
      setBalance(null);
      return;
    }
    let active = true;
    getBalanceSol(pubkey)
      .then((b) => active && setBalance(b))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pubkey, result]);

  async function connect() {
    const phantom = getPhantom();
    if (!phantom) {
      toast.error("Phantom wallet not found", {
        description: "Install Phantom and refresh this page.",
        action: {
          label: "Install",
          onClick: () => window.open("https://phantom.app/", "_blank"),
        },
      });
      return;
    }
    try {
      const res = await phantom.connect();
      setPubkey(res.publicKey.toString());
      toast.success("Wallet connected");
    } catch {
      toast.error("Connection rejected");
    }
  }

  async function disconnect() {
    const phantom = getPhantom();
    await phantom?.disconnect().catch(() => {});
    setPubkey(null);
    setResult(null);
  }

  async function flip() {
    if (!pubkey) return;
    if (balance !== null && balance < amount + 0.005) {
      toast.error("Not enough SOL", {
        description: "You need devnet SOL. Get some from a faucet.",
        action: {
          label: "Faucet",
          onClick: () =>
            window.open("https://faucet.solana.com/", "_blank"),
        },
      });
      return;
    }
    setBusy(true);
    setResult(null);
    setFlipping(true);
    try {
      toast.info("Approve the bet in your wallet…");
      const sig = await sendBetTransaction(pubkey, amount);
      toast.success("Bet locked in. Flipping…");
      const res = (await placeBetFn({
        data: {
          txSignature: sig,
          playerPubkey: pubkey,
          side,
          amountSol: amount,
        },
      })) as FlipResult;
      // Let coin spin finish
      await new Promise((r) => setTimeout(r, 2200));
      setResult(res);
      if (res.won) {
        toast.success(`You won ${res.payoutSol.toFixed(4)} SOL!`);
      } else {
        toast.error(`Coin landed on ${res.outcome}. Better luck next flip.`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bet failed";
      toast.error(msg);
    } finally {
      setFlipping(false);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <Toaster theme="dark" position="top-center" richColors />

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5 md:px-10">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl text-primary-foreground" style={{ background: "var(--gradient-gold)", boxShadow: "var(--shadow-gold)" }}>
            <Coins className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-lg font-bold tracking-tight">SolFlip</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Devnet · Double or nothing
            </div>
          </div>
        </div>
        {pubkey ? (
          <div className="flex items-center gap-2">
            <div className="hidden rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur sm:block">
              {balance !== null ? `${balance.toFixed(3)} SOL` : "…"}
            </div>
            <div className="rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-medium backdrop-blur">
              {short(pubkey)}
            </div>
            <button
              onClick={disconnect}
              className="rounded-full border border-border bg-card/60 p-2 text-muted-foreground transition hover:text-foreground"
              aria-label="Disconnect"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={connect}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground transition active:scale-95"
            style={{ background: "var(--gradient-gold)", boxShadow: "var(--shadow-gold)" }}
          >
            <Wallet className="h-4 w-4" /> Connect wallet
          </button>
        )}
      </header>

      {/* Main */}
      <main className="mx-auto flex max-w-3xl flex-col items-center px-6 pb-24 pt-6 md:pt-12">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-4xl font-black tracking-tight md:text-6xl"
        >
          Flip the coin.
          <br />
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "var(--gradient-gold)" }}
          >
            Double your SOL.
          </span>
        </motion.h1>
        <p className="mt-3 max-w-md text-center text-sm text-muted-foreground md:text-base">
          Pick a side, place a bet, and win <strong className="text-foreground">1.94×</strong> instantly.
          3% platform fee on wins.
        </p>

        {/* Coin */}
        <div className="my-10 grid h-56 w-56 place-items-center md:h-64 md:w-64" style={{ perspective: 1200 }}>
          <div
            key={flipping ? "spin" : result?.outcome ?? side}
            className={flipping ? "coin-flipping" : ""}
            style={{ transformStyle: "preserve-3d" }}
          >
            <Coin face={result?.outcome ?? side} />
          </div>
        </div>

        <AnimatePresence>
          {result && !flipping && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mb-6 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest ${
                result.won ? "text-[oklch(0.72_0.18_145)]" : "text-[oklch(0.7_0.18_25)]"
              }`}
              style={{
                background: result.won
                  ? "oklch(0.72 0.18 145 / 0.12)"
                  : "oklch(0.7 0.18 25 / 0.12)",
              }}
            >
              {result.won
                ? `Won +${result.payoutSol.toFixed(4)} SOL`
                : `Lost ${amount} SOL`}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Card */}
        <div className="w-full rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl md:p-7">
          {/* Side toggle */}
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-background/40 p-1.5">
            {(["heads", "tails"] as Side[]).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                disabled={busy}
                className={`rounded-xl py-3 text-sm font-bold uppercase tracking-wider transition ${
                  side === s
                    ? "text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                style={
                  side === s ? { background: "var(--gradient-gold)" } : undefined
                }
              >
                {s}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Bet amount
              </span>
              <span className="text-xs text-muted-foreground">
                Win pays {(amount * 1.94).toFixed(4)} SOL
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
              {BET_AMOUNTS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAmount(a)}
                  disabled={busy}
                  className={`rounded-xl border py-2.5 text-sm font-semibold transition ${
                    amount === a
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background/30 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={pubkey ? flip : connect}
            disabled={busy}
            className="mt-6 w-full rounded-2xl py-4 text-base font-bold text-primary-foreground transition active:scale-[0.99] disabled:opacity-60"
            style={{ background: "var(--gradient-gold)", boxShadow: "var(--shadow-gold)" }}
          >
            {!pubkey
              ? "Connect wallet to play"
              : busy
                ? "Flipping…"
                : `Bet ${amount} SOL on ${side}`}
          </button>

          {result?.payoutSignature && (
            <a
              href={`https://explorer.solana.com/tx/${result.payoutSignature}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              View payout on Solana Explorer <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          Running on Solana devnet · Platform wallet{" "}
          <a
            className="underline-offset-2 hover:underline"
            href={`https://explorer.solana.com/address/${PLATFORM_WALLET_ADDRESS}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
          >
            {short(PLATFORM_WALLET_ADDRESS)}
          </a>
        </p>
      </main>
    </div>
  );
}

function Coin({ face }: { face: Side }) {
  const isHeads = face === "heads";
  return (
    <div
      className="relative grid h-48 w-48 place-items-center rounded-full md:h-56 md:w-56"
      style={{
        background: "var(--gradient-gold)",
        boxShadow:
          "var(--shadow-gold), inset 0 0 0 6px oklch(0.95 0.1 90 / 0.6), inset 0 -10px 30px oklch(0.4 0.1 60 / 0.5)",
      }}
    >
      <div
        className="grid h-36 w-36 place-items-center rounded-full md:h-44 md:w-44"
        style={{
          background:
            "radial-gradient(circle at 40% 30%, oklch(0.95 0.12 95), oklch(0.7 0.18 60))",
          boxShadow: "inset 0 0 0 3px oklch(0.5 0.15 60 / 0.5)",
        }}
      >
        <span
          className="select-none text-5xl font-black tracking-tight md:text-6xl"
          style={{ color: "oklch(0.3 0.08 60)" }}
        >
          {isHeads ? "H" : "T"}
        </span>
      </div>
    </div>
  );
}
