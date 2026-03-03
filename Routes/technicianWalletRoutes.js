import express from "express";
import { Auth } from "../Middleware/Auth.js";
import isTechnician from "../Middleware/isTechnician.js";

import {
  getTechnicianWallet,
  getWalletTransactions,
  requestWithdrawal,
  getMyWithdrawalRequests
} from "../Controllers/technicianWalletController.js";

const router = express.Router();

/* ================= TECHNICIAN WALLET ================= */


// Wallet balance
router.get("/wallet", Auth, isTechnician, getTechnicianWallet);

// Wallet transactions (credits / debits)
router.get("/wallet/transactions", Auth, isTechnician, getWalletTransactions);

// Withdraw request
router.post("/wallet/withdrawal", Auth, isTechnician, requestWithdrawal);

// My withdrawal history
router.get("/wallet/withdrawalhistory", Auth, isTechnician, getMyWithdrawalRequests);

export default router;
