import mongoose from "mongoose";
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
  try {
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
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

/* ALL WITHDRAWS */
export const getAllWithdrawRequests = async (req, res) => {
  try {
    ensureAdmin(req);

    const data = await WithdrawRequest.find()
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
export const approveWithdraw = async (req, res) => {
  try {
    ensureAdmin(req);

    const withdraw = await WithdrawRequest.findById(req.params.id);
    if (!withdraw || withdraw.status !== "pending") {
      return res.status(400).json({ success: false, message: "Invalid or non-pending request" });
    }

    withdraw.status = "approved";
    withdraw.approvedAt = new Date();
    withdraw.adminNote = req.body.adminNote || "Approved by Admin";
    await withdraw.save();

    res.json({ success: true, message: "Withdrawal approved successfully" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Reject Withdrawal (Refund balance)
 */
export const rejectWithdraw = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    ensureAdmin(req);

    const withdraw = await WithdrawRequest.findById(req.params.id);
    if (!withdraw || withdraw.status !== "pending") {
      return res.status(400).json({ success: false, message: "Invalid or non-pending request" });
    }

    await session.withTransaction(async () => {
      // 1. Update status
      withdraw.status = "rejected";
      withdraw.rejectedAt = new Date();
      withdraw.adminNote = req.body.adminNote || "Rejected by Admin";
      await withdraw.save({ session });

      // 2. Refund balance
      await TechnicianProfile.updateOne(
        { _id: withdraw.technicianId },
        { $inc: { walletBalance: withdraw.amount } },
        { session }
      );

      // 3. Create Refund Transaction Record
      await WalletTransaction.create([
        {
          technicianId: withdraw.technicianId,
          amount: withdraw.amount,
          type: "credit",
          source: "adjustment",
          note: `Refund for rejected withdrawal #${withdraw._id}`,
        }
      ], { session });
    });

    res.json({ success: true, message: "Withdrawal rejected and balance refunded" });
  } catch (error) {
    console.error("rejectWithdraw Error:", error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};
