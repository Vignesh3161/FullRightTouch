import mongoose from "mongoose";
import User from "../Schemas/User.js";
import TechnicianProfile from "../Schemas/TechnicianProfile.js";
import TechnicianKyc from "../Schemas/TechnicianKYC.js";
import Address from "../Schemas/Address.js";

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

      if (user.role === "Customer") {
        await Address.deleteMany({ customerId: userId }).session(session);

        await User.updateOne(
          { _id: userId },
          {
            $set: {
              ...baseUserUpdate,
              mobileNumber: deletedMobileNumber,
              email: deletedEmail,
              fname: null,
              lname: null,
              gender: null,
              profileComplete: false,
            },
          },
          { session, runValidators: false }
        );

        return;
      }

      if (user.role === "Technician") {
        const techProfile = await TechnicianProfile.findOne({ userId })
          .select("_id")
          .session(session);

        if (techProfile) {
          await TechnicianProfile.updateOne(
            { _id: techProfile._id },
            {
              $set: {
                workStatus: "deleted",
                "availability.isOnline": false,
                profileComplete: false,
              },
            },
            { session }
          );

          await TechnicianKyc.updateOne(
            { technicianId: techProfile._id },
            {
              $set: {
                aadhaarNumber: null,
                panNumber: null,
                drivingLicenseNumber: null,
                documents: {},
                kycVerified: false,
                verificationStatus: "pending",
                rejectionReason: null,
                verifiedBy: null,
                verifiedAt: null,
                bankDetails: null,
                bankVerified: false,
                bankUpdateRequired: false,
                bankVerificationStatus: "pending",
                bankRejectionReason: null,
                bankVerifiedBy: null,
                bankVerifiedAt: null,
                bankEditableUntil: null,
              },
            },
            { session, runValidators: false }
          );
        }

        await User.updateOne(
          { _id: userId },
          {
            $set: {
              ...baseUserUpdate,
              mobileNumber: deletedMobileNumber,
              email: deletedEmail,
            },
          },
          { session, runValidators: false }
        );

        return;
      }

      await User.updateOne(
        { _id: userId },
        {
          $set: {
            ...baseUserUpdate,
            mobileNumber: deletedMobileNumber,
            email: deletedEmail,
          },
        },
        { session, runValidators: false }
      );
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
