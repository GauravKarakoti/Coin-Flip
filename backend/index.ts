import express from 'express';
// import { Connection, Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import dotenv from 'dotenv';
dotenv.config();
const app = express();
// const keypair = Keypair.fromSecretKey(process.env.PLATFORM_WALLET_PRIVATE_KEY! as unknown as Uint8Array);
// const connection = new Connection("https://api.devnet.solana.com");
app.get("/flip", (req, res) => {
    console.log("Received flip request with body:", req.body);
    const wonCoin = Math.random() < 0.5;
    // const publicKey = req.body.publicKey;
    const amountBet = req.body.amount;
    // const txn = req.body.txn;
    // TODO: Parse the amount from the txn signature
    if(wonCoin) {
        // send them 2x of the amount they bet
        // const winTransaction = new Transaction().add(
        //     SystemProgram.transfer({
        //         fromPubkey: keypair.publicKey,
        //         toPubkey: publicKey,
        //         lamports: Math.floor(amountBet * 2);
        //     })
        // );
        // await connection.sendTransaction(winTransaction, [keypair]);
        console.log("Player won! Sending them", amountBet * 2, "SOL");
        res.json({
            message: "You won",
            amount: amountBet * 2,
            won: true
        });
    } else {
        console.log("Player lost! Not sending any SOL");
        res.json({
            message: "You lost",
            amount: 0,
            won: false
        });
    }
})
app.listen(3000, () => {
    console.log("Backend is running!!");
});