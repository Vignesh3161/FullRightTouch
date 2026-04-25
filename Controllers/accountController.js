import mongoose from "mongoose";
import User from "../Schemas/User.js";
import TechnicianProfile from "../Schemas/TechnicianProfile.js";
import TechnicianKyc from "../Schemas/TechnicianKYC.js";
import Address from "../Schemas/Address.js";
import ServiceBooking from "../Schemas/ServiceBooking.js";
import JobBroadcast from "../Schemas/TechnicianBroadcast.js";
import Cart from "../Schemas/Cart.js";
import Otp from "../Schemas/Otp.js";
import TempUser from "../Schemas/TempUser.js";
import WalletTransaction from "../Schemas/WalletTransaction.js";
import WithdrawalRequest from "../Schemas/WithdrawalRequest.js";
import Rating from "../Schemas/Rating.js";
import Report from "../Schemas/Report.js";

const ok = (res, message) =>
  res.status(200).json({
    success: true,
    message,
    result: {},
  });

const fail = (res, status, message) =>
  res.status(status).json({
    success: false,
    message,
    result: {},
  });

const buildDeletedMobileNumber = (userId) =>
  `deleted_${userId}_${Date.now()}`;

const buildDeletedEmail = (userId) =>
  `deleted_${userId}_${Date.now()}@example.invalid`;

export const deleteMyAccount = async (req, res) => {
  const userId = req.user?.userId;
  const tokenRole = req.user?.role;

  if (!userId) {
    return fail(res, 401, "Unauthorized");
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(userId).session(session);
      if (!user) {
        throw new Error("ACCOUNT_NOT_FOUND");
      }

      if (tokenRole && user.role !== tokenRole) {
        throw new Error("ROLE_MISMATCH");
      }

      if (user.role === "Owner") {
        const activeOwners = await User.countDocuments({
          role: "Owner",
          status: "Active",
          _id: { $ne: userId },
        }).session(session);

        if (activeOwners < 1) {
          throw new Error("OWNER_REQUIRED");
        }
      }

      const deletedMobileNumber = buildDeletedMobileNumber(userId);
      const deletedEmail = buildDeletedEmail(userId);
      const baseUserUpdate = {
        password: null,
        status: "Deleted",
        lastLoginAt: null,
      };

      // 🧹 Personal Data Cleanup (Requested Schemas Only)
      await Address.deleteMany({ customerId: userId }).session(session);
      await Address.deleteMany({ userId }).session(session);

      if (user.role === "Technician") {
        const techProfile = await TechnicianProfile.findOne({ userId })
          .select("_id")
          .session(session);

        if (techProfile) {
          const techProfileId = techProfile._id;

          // Update all ServiceBookings with technician snapshot before hard-deletion of profile link
          await ServiceBooking.updateMany(
            { technicianId: techProfileId },
            {
              $set: {
                "technicianSnapshot.name": `${user.fname || ""} ${user.lname || ""}`.trim() || "Unknown",
                "technicianSnapshot.mobile": user.mobileNumber || "",
                "technicianSnapshot.deleted": true,
              },
            },
            { session }
          );

          // Hard delete technician-specific records
          await TechnicianProfile.deleteOne({ _id: techProfileId }).session(session);
          await TechnicianKyc.deleteOne({ technicianId: techProfileId }).session(session);
          // Note: JobBroadcast, WalletTransaction, etc. are kept as per user instruction "others dont touch"
        }
      }

      // Final cleanup for any user-related OTP/Temp records (Identity management)
      await Otp.deleteMany({ identifier: user.mobileNumber }).session(session);
      await TempUser.deleteMany({ identifier: user.mobileNumber }).session(session);

      // HARD DELETE User record
      await User.deleteOne({ _id: userId }).session(session);
    });

    return ok(res, "Account deleted successfully");
  } catch (err) {
    if (err.message === "ACCOUNT_NOT_FOUND") {
      return fail(res, 404, "Account not found");
    }
    if (err.message === "OWNER_REQUIRED") {
      return fail(res, 400, "At least one active owner required");
    }
    if (err.message === "ROLE_MISMATCH") {
      return fail(res, 401, "Unauthorized");
    }

    console.error("deleteMyAccount Error:", err);
    return fail(res, 500, "Internal server error");
  } finally {
    session.endSession();
  }
};
