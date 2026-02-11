import TechnicianProfile from "../Schemas/TechnicianProfile.js";
import WithdrawRequest from "../Schemas/WithdrawRequest.js";
import WalletTransaction from "../Schemas/WalletTransaction.js";
import Payment from "../Schemas/Payment.js";

/* 🔐 Admin only */
const ensureAdmin = (req) => {
  const role = req.user?.role;
  if (role !== "Admin" && role !== "Owner") {
    const err = new Error("Admin or Owner access only");
    err.statusCode = 403;
    throw err;
  }
};


/* WALLET SUMMARY */
export const getAdminWalletSummary = async (req, res) => {
  ensureAdmin(req);

  const payments = await Payment.find({ status: "success" });
  const withdraws = await WithdrawRequest.find({ status: "approved" });

  const totalCollected = payments.reduce((acc, p) => acc + (p.totalAmount || 0), 0);
  const totalCommission = payments.reduce((acc, p) => acc + (p.commissionAmount || 0), 0);
  const totalWithdrawn = withdraws.reduce((acc, w) => acc + (w.amount || 0), 0);

  res.json({
    success: true,
    result: {
      totalCollected: Math.round(totalCollected),
      totalCommission: Math.round(totalCommission),
      availableBalance: Math.round(totalCollected - totalWithdrawn),
    },
  });
};

/* ALL WITHDRAWS */
export const getAllWithdrawRequests = async (req, res) => {
  ensureAdmin(req);

  const data = await WithdrawRequest.find()
    .populate("technicianId", "name mobileNumber walletBalance")
    .sort({ createdAt: -1 });

  res.json({ success: true, result: data });
};

/* APPROVE */
export const approveWithdraw = async (req, res) => {
  ensureAdmin(req);

  const withdraw = await WithdrawRequest.findById(req.params.id);
  if (!withdraw || withdraw.status !== "pending") {
    return res.status(400).json({ success: false, message: "Invalid request" });
  }

  await TechnicianProfile.updateOne(
    { _id: withdraw.technicianId },
    { $inc: { walletBalance: -withdraw.amount } }
  );

  await WalletTransaction.create({
    technicianId: withdraw.technicianId,
    amount: withdraw.amount,
    type: "debit",
    source: "withdraw",
    note: "Withdraw approved"
  });

  withdraw.status = "approved";
  await withdraw.save();

  res.json({ success: true, message: "Withdraw approved" });
};

/* REJECT */
export const rejectWithdraw = async (req, res) => {
  ensureAdmin(req);

  const withdraw = await WithdrawRequest.findById(req.params.id);
  if (!withdraw || withdraw.status !== "pending") {
    return res.status(400).json({ success: false, message: "Invalid request" });
  }

  withdraw.status = "rejected";
  await withdraw.save();

  res.json({ success: true, message: "Withdraw rejected" });
};
