import express from "express";
import { Auth } from "../Middleware/Auth.js";

import {
  getAdminWalletSummary,
  getAllWithdrawalRequests,
  approveWithdrawal,
  rejectWithdrawal
} from "../Controllers/adminWalletController.js";

const router = express.Router();

/* ================= ADMIN WALLET ================= */


// Summary
router.get("/wallet", Auth, getAdminWalletSummary);

// All withdrawal requests
router.get("/wallet/withdrawalhistory", Auth, getAllWithdrawalRequests);

// Decide withdrawal
router.put("/wallet/withdrawal/:id/approve", Auth, approveWithdrawal);
router.put("/wallet/withdrawal/:id/reject", Auth, rejectWithdrawal);
router.put("/wallet/withdrawal/:id/approve", Auth, approveWithdrawal); // Alias for HTML
router.put("/wallet/withdrawal/:id/reject", Auth, rejectWithdrawal); // Alias for HTML

export default router;
