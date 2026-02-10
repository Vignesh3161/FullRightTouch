import express from "express";
import { Auth } from "../Middleware/Auth.js";

import {
  getTechnicianWallet,
  getWalletTransactions,
  requestWithdraw,
  getMyWithdrawRequests
} from "../Controllers/technicianWalletController.js";

const router = express.Router();

/* ================= TECHNICIAN WALLET ================= */


// Wallet balance
router.get("/wallet", Auth, getTechnicianWallet);

// Wallet transactions (credits / debits)
router.get("/wallet/transactions", Auth, getWalletTransactions);

// Withdraw request
router.post("/wallet/withdraw", Auth, requestWithdraw);

// My withdraw history
router.get("/wallet/withdraws", Auth, getMyWithdrawRequests);

export default router;
