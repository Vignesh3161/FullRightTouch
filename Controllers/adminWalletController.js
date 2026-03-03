import mongoose from "mongoose";
import TechnicianProfile from "../Schemas/TechnicianProfile.js";
import WithdrawalRequest from "../Schemas/WithdrawalRequest.js";
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
  try {
    ensureAdmin(req);

    const payments = await Payment.find({ status: "success" });
    const withdrawals = await WithdrawalRequest.find({ status: "approved" });

    const totalCollected = payments.reduce((acc, p) => acc + (p.totalAmount || 0), 0);
    const totalCommission = payments.reduce((acc, p) => acc + (p.commissionAmount || 0), 0);
    const totalWithdrawn = withdrawals.reduce((acc, w) => acc + (w.amount || 0), 0);

    res.json({
      success: true,
      result: {
        totalCollected: Math.round(totalCollected),
        totalCommission: Math.round(totalCommission),
        availableBalance: Math.round(totalCollected - totalWithdrawn),
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

/* ALL WITHDRAWALS */
export const getAllWithdrawalRequests = async (req, res) => {
  try {
    ensureAdmin(req);

    const data = await WithdrawalRequest.find()
      .populate({
        path: "technicianId",
        select: "walletBalance",
        populate: { path: "userId", select: "fname lname mobileNumber" }
      })
      .sort({ createdAt: -1 });

    res.json({ success: true, result: data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Approve Withdrawal (Done: Balance already deducted at request time)
 */
export const approveWithdrawal = async (req, res) => {
  try {
    ensureAdmin(req);

    const withdrawal = await WithdrawalRequest.findById(req.params.id);
    if (!withdrawal || !["pending", "requested"].includes(withdrawal.status)) {
      return res.status(400).json({ success: false, message: "Invalid or non-pending request" });
    }

    withdrawal.status = "approved";
    withdrawal.approvedAt = new Date();
    withdrawal.adminNote = req.body.adminNote || "Approved by Admin";
    await withdrawal.save();

    res.json({ success: true, message: "Withdrawal approved successfully" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Reject Withdrawal (Refund balance)
 */
export const rejectWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    ensureAdmin(req);

    const withdrawal = await WithdrawalRequest.findById(req.params.id);
    if (!withdrawal || !["pending", "requested"].includes(withdrawal.status)) {
      return res.status(400).json({ success: false, message: "Invalid or non-pending request" });
    }

    await session.withTransaction(async () => {
      // 1. Update status
      withdrawal.status = "rejected";
      withdrawal.rejectedAt = new Date();
      withdrawal.adminNote = req.body.adminNote || "Rejected by Admin";
      await withdrawal.save({ session });

      // 2. Refund balance
      await TechnicianProfile.updateOne(
        { _id: withdrawal.technicianId },
        { $inc: { walletBalance: withdrawal.amount } },
        { session }
      );

      // 3. Create Refund Transaction Record
      await WalletTransaction.create([
        {
          technicianId: withdrawal.technicianId,
          amount: withdrawal.amount,
          type: "credit",
          source: "adjustment",
          note: `Refund for rejected withdrawal #${withdrawal._id}`,
        }
      ], { session });
    });

    res.json({ success: true, message: "Withdrawal rejected and balance refunded" });
  } catch (error) {
    console.error("rejectWithdrawal Error:", error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};
