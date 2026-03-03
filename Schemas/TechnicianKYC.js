import mongoose from "mongoose";

const technicianKycSchema = new mongoose.Schema(
  {
    technicianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TechnicianProfile",
      required: true,
      unique: true,
      index: true,
    },

    /* ==========================
       📋 KYC DOCUMENTS (PLAINTEXT)
    ========================== */
    aadhaarNumber: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
      // select: true (default)
    },

    panNumber: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
      index: true,
    },

    drivingLicenseNumber: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
      index: true,
    },

    documents: {
      aadhaarUrl: [String],
      panUrl: [String],
      dlUrl: [String],
    },

    kycVerified: {
      type: Boolean,
      default: false,
    },

    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    rejectionReason: {
      type: String,
      trim: true,
    },

    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // admin
    },

    verifiedAt: {
      type: Date,
    },

    /* ==========================
       💳 BANK & SALARY PAYOUT DETAILS
    ========================== */
    bankDetails: {
      accountHolderName: {
        type: String,
        trim: true,
      },

      bankName: {
        type: String,
        trim: true,
      },

      accountNumber: {
        type: String,
        trim: true,
        sparse: true,
      },

      ifscCode: {
        type: String,
        trim: true,
        uppercase: true,
      },

      branchName: {
        type: String,
        trim: true,
      },

      upiId: {
        type: String,
        trim: true,
        lowercase: true,
      },
    },

    bankVerified: {
      type: Boolean,
      default: false,
    },

    bankUpdateRequired: {
      type: Boolean,
      default: false,
    },

    bankVerificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    bankRejectionReason: {
      type: String,
      trim: true,
    },

    bankVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // admin
    },

    bankVerifiedAt: {
      type: Date,
    },

    bankEditableUntil: {
      type: Date, // After verification, this is set to null
    },
  },
  { timestamps: true }
);

// No more encryption hooks or methods needed

export default mongoose.models.TechnicianKyc || mongoose.model("TechnicianKyc", technicianKycSchema);
