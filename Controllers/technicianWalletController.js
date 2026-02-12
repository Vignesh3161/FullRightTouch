import mongoose from "mongoose";
import TechnicianProfile from "../Schemas/TechnicianProfile.js";
import WalletTransaction from "../Schemas/WalletTransaction.js";
import WithdrawRequest from "../Schemas/WithdrawRequest.js";
import ServiceBooking from "../Schemas/ServiceBooking.js";

const isValidObjectId = mongoose.Types.ObjectId.isValid;

// Helper to handle money values safely
const toMoney = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Internal utility to get system config
const getConfig = () => {
  const minWithdrawal = toMoney(process.env.MIN_WITHDRAWAL_AMOUNT) ?? 500;
  const cooldownDays = toMoney(process.env.WITHDRAWAL_COOLDOWN_DAYS) ?? 7;
  return {
    minWithdrawal,
    cooldownMs: Math.max(0, cooldownDays) * 24 * 60 * 60 * 1000,
  };
};

/**
 * @desc    Add Wallet Transaction (Owner/Admin only)
 * @route   POST /api/technician/wallet/transaction
 */
export const createWalletTransaction = async (req, res) => {
  try {
    const { technicianId, bookingId, amount, type, source, note } = req.body;

    if (req.user?.role !== "Owner" && req.user?.role !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "Owner or Admin access only",
      });
    }

    if (!technicianId || !isValidObjectId(technicianId)) {
      return res.status(400).json({
        success: false,
        message: "Valid technicianId is required",
      });
    }

    const value = Number(amount);
    if (isNaN(value) || value <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a positive number",
      });
    }

    if (!["credit", "debit"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid transaction type (credit/debit)",
      });
    }

    const tech = await TechnicianProfile.findById(technicianId);
    if (!tech) {
      return res.status(404).json({
        success: false,
        message: "Technician not found",
      });
    }

    // Atomic Balance Update
    const balanceChange = type === "credit" ? value : -value;

    // Prevent negative balance if debiting
    if (type === "debit" && tech.walletBalance < value) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance for this debit",
      });
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await WalletTransaction.create([
          {
            technicianId,
            bookingId: bookingId || null,
            amount: value,
            type,
            source: source || "adjustment",
            note: note || `Manual ${type} by ${req.user.role}`,
          }
        ], { session });

        await TechnicianProfile.updateOne(
          { _id: technicianId },
          { $inc: { walletBalance: balanceChange } },
          { session }
        );
      });
    } finally {
      session.endSession();
    }

    res.status(201).json({
      success: true,
      message: `Wallet ${type}ed successfully`,
    });
  } catch (error) {
    console.error("createWalletTransaction Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get Wallet Balance & Stats
 * @route   GET /api/technician/wallet/me
 */
export const getTechnicianWallet = async (req, res) => {
  try {
    const tech = req.technician; // From isTechnician middleware
    const techId = tech._id;

    // Calculate total earnings (sum of all credit transactions from jobs)
    const statsResult = await WalletTransaction.aggregate([
      { $match: { technicianId: techId } },
      {
        $group: {
          _id: null,
          totalEarnings: {
            $sum: { $cond: [{ $and: [{ $eq: ["$type", "credit"] }, { $eq: ["$source", "job"] }] }, "$amount", 0] }
          },
          totalAdjustments: {
            $sum: { $cond: [{ $eq: ["$source", "adjustment"] }, { $cond: [{ $eq: ["$type", "credit"] }, "$amount", { $multiply: ["$amount", -1] }] }, 0] }
          }
        }
      }
    ]);

    const withdrawalStats = await WithdrawRequest.aggregate([
      { $match: { technicianId: techId } },
      {
        $group: {
          _id: null,
          approvedTotal: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, "$amount", 0] } },
          pendingTotal: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0] } },
          pendingCount: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } }
        }
      }
    ]);

    const walletStats = statsResult[0] || { totalEarnings: 0, totalAdjustments: 0 };
    const withdrawStats = withdrawalStats[0] || { approvedTotal: 0, pendingTotal: 0, pendingCount: 0 };

    res.json({
      success: true,
      result: {
        balance: tech.walletBalance || 0,
        totalEarnings: walletStats.totalEarnings,
        totalAdjustments: walletStats.totalAdjustments,
        withdrawals: {
          approved: withdrawStats.approvedTotal,
          pending: withdrawStats.pendingTotal,
          pendingCount: withdrawStats.pendingCount
        }
      }
    });
  } catch (error) {
    console.error("getTechnicianWallet Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc    Get Wallet Transaction History
 * @route   GET /api/technician/wallet/history
 */
export const getWalletTransactions = async (req, res) => {
  try {
    const techId = req.technician._id;
    const { type, source, startDate, endDate } = req.query;

    const query = { technicianId: techId };

    if (type) query.type = type;
    if (source) query.source = source;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    const transactions = await WalletTransaction.find(query)
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      result: transactions,
    });
  } catch (error) {
    console.error("getWalletTransactions Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc    Request Withdrawal
 * @route   POST /api/technician/wallet/withdrawals/request
 */
export const requestWithdraw = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const tech = req.technician;
    const { amount } = req.body;
    const config = getConfig();

    // 1. Withdrawal timing check (Optional: Fridays only as per user previous code)
    const today = new Date();
    // if (today.getDay() !== 5) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Withdrawal requests are only allowed on Fridays"
    //   });
    // }

    const value = Number(amount);
    if (isNaN(value) || value <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    if (value < config.minWithdrawal) {
      return res.status(400).json({
        success: false,
        message: `Minimum withdrawal amount is ₹${config.minWithdrawal}`
      });
    }

    if (tech.walletBalance < value) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance",
      });
    }

    // Check for pending requests to avoid duplicates
    const existingPending = await WithdrawRequest.findOne({
      technicianId: tech._id,
      status: "pending"
    });

    if (existingPending) {
      return res.status(400).json({
        success: false,
        message: "You already have a pending withdrawal request",
      });
    }

    let withdrawalResult;

    await session.withTransaction(async () => {
      // 1. Create Transaction (Debit Pending)
      // We don't deduct from balance yet? Usually, we deduct immediately to "lock" the funds.
      // If rejected, we credit it back.

      withdrawalResult = await WithdrawRequest.create([
        {
          technicianId: tech._id,
          amount: value,
          status: "pending",
        }
      ], { session });

      // 2. Deduct from balance
      await TechnicianProfile.updateOne(
        { _id: tech._id },
        { $inc: { walletBalance: -value } },
        { session }
      );

      // 3. Create Wallet Transaction Record
      await WalletTransaction.create([
        {
          technicianId: tech._id,
          amount: value,
          type: "debit",
          source: "withdraw",
          note: `Withdrawal request for ₹${value}`,
        }
      ], { session });
    });

    res.json({
      success: true,
      message: "Withdrawal request submitted successfully",
      result: withdrawalResult[0],
    });
  } catch (error) {
    console.error("requestWithdraw Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  } finally {
    session.endSession();
  }
};

/**
 * @desc    Get My Withdrawal Requests
 * @route   GET /api/technician/wallet/withdrawals/me
 */
export const getMyWithdrawRequests = async (req, res) => {
  try {
    const data = await WithdrawRequest.find({
      technicianId: req.technician._id
    }).sort({ createdAt: -1 });

    res.json({ success: true, result: data });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc    Cancel My Withdrawal Request
 * @route   PUT /api/technician/wallet/withdrawals/:id/cancel
 */
export const cancelMyWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    const techId = req.technician._id;

    const withdraw = await WithdrawRequest.findOne({
      _id: id,
      technicianId: techId,
      status: "pending"
    });

    if (!withdraw) {
      return res.status(404).json({
        success: false,
        message: "Pending withdrawal request not found",
      });
    }

    await session.withTransaction(async () => {
      // 1. Update request status
      withdraw.status = "rejected";
      withdraw.rejectedAt = new Date();
      withdraw.adminNote = "Cancelled by technician";
      await withdraw.save({ session });

      // 2. Refund Balance
      await TechnicianProfile.updateOne(
        { _id: techId },
        { $inc: { walletBalance: withdraw.amount } },
        { session }
      );

      // 3. Create Reversal Transaction
      await WalletTransaction.create([
        {
          technicianId: techId,
          amount: withdraw.amount,
          type: "credit",
          source: "adjustment",
          note: `Refund for cancelled withdrawal #${id}`,
        }
      ], { session });
    });

    res.json({
      success: true,
      message: "Withdrawal request cancelled and amount refunded",
    });
  } catch (error) {
    console.error("cancelMyWithdrawal Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  } finally {
    session.endSession();
  }
};
