import mongoose from "mongoose";
import TechnicianProfile from "../Schemas/TechnicianProfile.js";
import TechnicianKyc from "../Schemas/TechnicianKYC.js";
import WithdrawalRequest from "../Schemas/WithdrawalRequest.js";
import WalletTransaction from "../Schemas/WalletTransaction.js";
import Payment from "../Schemas/Payment.js";
import User from "../Schemas/User.js";
import {
  createRazorpayContact,
  createFundAccount,
  createPayout,
} from "./razorpayXController.js";

const getStartOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getEndOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const buildRangeFromQuery = (query = {}) => {
  const type = String(query.type || "").toLowerCase();
  const now = new Date();

  if (type === "day" && query.date) {
    const date = new Date(`${query.date}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return { type, start: getStartOfDay(date), end: getEndOfDay(date) };
    }
    return null;
  }

  if (type === "month" && query.month) {
    let year;
    let monthIndex;

    if (String(query.month).includes("-")) {
      const [y, m] = String(query.month).split("-");
      year = Number(y);
      monthIndex = Number(m) - 1;
    } else {
      year = Number(query.year || now.getFullYear());
      monthIndex = Number(query.month) - 1;
    }

    if (
      Number.isInteger(year) &&
      Number.isInteger(monthIndex) &&
      monthIndex >= 0 &&
      monthIndex <= 11
    ) {
      const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
      const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
      return { type, start, end };
    }
    return null;
  }

  if (type === "year" && query.year) {
    const year = Number(query.year);
    if (Number.isInteger(year) && year > 0) {
      const start = new Date(year, 0, 1, 0, 0, 0, 0);
      const end = new Date(year, 11, 31, 23, 59, 59, 999);
      return { type, start, end };
    }
    return null;
  }

  return null;
};

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

    const filterRange = buildRangeFromQuery(req.query);

    const allPayments = await Payment.find({ status: "success" });
    const allApprovedWithdrawals = await WithdrawalRequest.find({ status: "approved" });

    const paymentQuery = { status: "success" };
    const withdrawalQuery = { status: "approved" };

    if (filterRange) {
      paymentQuery.createdAt = { $gte: filterRange.start, $lte: filterRange.end };
      withdrawalQuery.createdAt = { $gte: filterRange.start, $lte: filterRange.end };
    }

    const payments = await Payment.find(paymentQuery);
    const withdrawals = await WithdrawalRequest.find(withdrawalQuery);

    const allTimeCollected = allPayments.reduce((acc, p) => acc + (p.totalAmount || 0), 0);
    const allTimeCommission = allPayments.reduce((acc, p) => acc + (p.commissionAmount || 0), 0);
    const allTimeWithdrawn = allApprovedWithdrawals.reduce((acc, w) => acc + (w.amount || 0), 0);

    const totalCollected = payments.reduce((acc, p) => acc + (p.totalAmount || 0), 0);
    const totalCommission = payments.reduce((acc, p) => acc + (p.commissionAmount || 0), 0);
    const totalWithdrawn = withdrawals.reduce((acc, w) => acc + (w.amount || 0), 0);

    const startToday = getStartOfDay(new Date());
    const endToday = getEndOfDay(new Date());

    const todayPayments = await Payment.find({
      status: "success",
      createdAt: { $gte: startToday, $lte: endToday },
    });
    const todayWithdrawals = await WithdrawalRequest.find({
      status: "approved",
      createdAt: { $gte: startToday, $lte: endToday },
    });

    const todayCollected = todayPayments.reduce((acc, p) => acc + (p.totalAmount || 0), 0);
    const todayCommission = todayPayments.reduce((acc, p) => acc + (p.commissionAmount || 0), 0);
    const todayWithdrawn = todayWithdrawals.reduce((acc, w) => acc + (w.amount || 0), 0);

    const [totalPendingWithdrawals, approvedWithdrawCount, rejectedWithdrawCount] = await Promise.all([
      WithdrawalRequest.aggregate([
        { $match: { status: { $in: ["pending", "requested"] } } },
        { $group: { _id: null, sum: { $sum: "$amount" } } },
      ]),
      WithdrawalRequest.countDocuments({ status: "approved" }),
      WithdrawalRequest.countDocuments({ status: "rejected" }),
    ]);

    res.json({
      success: true,
      result: {
        totalCollected: Math.round(totalCollected),
        totalCommission: Math.round(totalCommission),
        availableBalance: Math.round(totalCollected - totalWithdrawn),
        totalWithdrawn: Math.round(totalWithdrawn),
        totalPendingWithdrawals: Math.round(totalPendingWithdrawals?.[0]?.sum || 0),
        approvedWithdrawCount,
        rejectedWithdrawCount,
        todayCollected: Math.round(todayCollected),
        todayCommission: Math.round(todayCommission),
        todayAvailableBalance: Math.round(todayCollected - todayWithdrawn),
        allTimeCollected: Math.round(allTimeCollected),
        allTimeCommission: Math.round(allTimeCommission),
        allTimeAvailableBalance: Math.round(allTimeCollected - allTimeWithdrawn),
        filter: filterRange
          ? {
              type: filterRange.type,
              from: filterRange.start,
              to: filterRange.end,
            }
          : null,
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

    const filterRange = buildRangeFromQuery(req.query);
    const query = {};
    if (filterRange) {
      query.createdAt = { $gte: filterRange.start, $lte: filterRange.end };
    }

    const data = await WithdrawalRequest.find(query)
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

/**
 * @desc  Pay Withdrawal via Razorpay X (Payout API)
 *        Initiates a real bank / UPI transfer to the technician.
 *
 * Steps:
 *  1. Validate withdrawal is pending/approved
 *  2. Ensure technician has bankDetails
 *  3. Create / reuse Razorpay Contact + Fund Account (cached on TechnicianProfile)
 *  4. Initiate Razorpay X Payout
 *  5. In a DB transaction:
 *     - Mark withdrawal as "paid", store payoutReference
 *     - Deduct walletBalance from TechnicianProfile
 *     - Create debit WalletTransaction
 *
 * @route  PUT /admin/wallet/withdrawal/:id/pay
 */
export const payWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    ensureAdmin(req);

    /* ── 1. Load withdrawal ── */
    const withdrawal = await WithdrawalRequest.findById(req.params.id);
    if (!withdrawal) {
      return res.status(404).json({ success: false, message: "Withdrawal request not found" });
    }
    if (!["pending", "requested", "approved"].includes(withdrawal.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot pay a withdrawal with status "${withdrawal.status}"`,
      });
    }

    /* ── 2. Load technician profile + user ── */
    const techProfile = await TechnicianProfile.findById(withdrawal.technicianId).populate(
      "userId",
      "fname lname mobileNumber email"
    );
    if (!techProfile) {
      return res.status(404).json({ success: false, message: "Technician profile not found" });
    }

    const user = techProfile.userId; // populated
    const technicianKyc = await TechnicianKyc.findOne({
      technicianId: withdrawal.technicianId,
    }).select("bankDetails");

    // Prefer KYC bank details; fallback kept for backward compatibility.
    const bankDetails = technicianKyc?.bankDetails || techProfile.bankDetails || {};
    const hasBank = bankDetails.accountNumber && bankDetails.ifscCode;
    const hasUpi = !!bankDetails.upiId;

    if (!hasBank && !hasUpi) {
      return res.status(400).json({
        success: false,
        message:
          "Technician has no bank account or UPI ID. Update bankDetails in TechnicianKYC before paying.",
      });
    }

    /* ── 3. Get or create Razorpay Contact ── */
    let contactId = techProfile.razorpayContactId;
    if (!contactId) {
      contactId = await createRazorpayContact({
        name: user ? `${user.fname || ""} ${user.lname || ""}`.trim() : "Technician",
        email: user?.email || undefined,
        contact: user?.mobileNumber || undefined,
        referenceId: String(techProfile._id),
      });
      techProfile.razorpayContactId = contactId;
      await techProfile.save();
    }

    /* ── 4. Get or create Razorpay Fund Account ── */
    let fundAccountId = techProfile.razorpayFundAccountId;
    if (!fundAccountId) {
      fundAccountId = await createFundAccount({ contactId, bankDetails });
      techProfile.razorpayFundAccountId = fundAccountId;
      await techProfile.save();
    }

    /* ── 5. Determine payout mode ── */
    const payoutMode = hasUpi ? "UPI" : "IMPS";

    /* ── 6. Initiate Razorpay X Payout ── */
    const rzpPayout = await createPayout({
      fundAccountId,
      amountInPaisa: Math.round(withdrawal.amount * 100),
      mode: payoutMode,
      referenceId: String(withdrawal._id),
      narration: req.body.narration || "RightTouch Technician Payout",
    });

    /* ── 7. Atomically update DB ── */
    await session.withTransaction(async () => {
      // 7a. Mark withdrawal paid
      withdrawal.status = "paid";
      withdrawal.approvedAt = withdrawal.approvedAt || new Date();
      withdrawal.decidedAt = new Date();
      withdrawal.payoutProvider = "razorpay_x";
      withdrawal.payoutReference = rzpPayout.id;
      withdrawal.adminNote = req.body.adminNote || `Paid via Razorpay X (${payoutMode})`;
      await withdrawal.save({ session });

      // 7b. Deduct from wallet balance
      await TechnicianProfile.updateOne(
        { _id: withdrawal.technicianId },
        { $inc: { walletBalance: -withdrawal.amount } },
        { session }
      );

      // 7c. Log debit transaction
      await WalletTransaction.create(
        [
          {
            technicianId: withdrawal.technicianId,
            amount: withdrawal.amount,
            type: "debit",
            source: "withdraw",
            note: `Razorpay X payout ${rzpPayout.id} (${payoutMode}) – withdrawal #${withdrawal._id}`,
          },
        ],
        { session }
      );
    });

    return res.json({
      success: true,
      message: "Payout initiated successfully",
      result: {
        payoutId: rzpPayout.id,
        payoutStatus: rzpPayout.status,
        mode: payoutMode,
        amount: withdrawal.amount,
        withdrawalStatus: "paid",
      },
    });
  } catch (error) {
    console.error("payWithdrawal Error:", error);
    // Razorpay errors come with a statusCode and sometimes error.error.description
    const message =
      error?.error?.description || error?.message || "Payout failed";
    return res.status(error.statusCode || 500).json({ success: false, message });
  } finally {
    session.endSession();
  }
};

