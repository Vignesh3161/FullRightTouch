import mongoose from "mongoose";
import crypto from "crypto";

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
       📋 KYC DOCUMENTS
    ========================== */
    aadhaarNumber: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
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
      aadhaarUrl: String,
      panUrl: String,
      dlUrl: String,
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

      // 🔐 Encrypted account number (stored encrypted, decrypted on retrieval)
      accountNumber: {
        type: String,
        trim: true,
        select: false, // Don't return by default (sensitive data)
        sparse: true,
      },

      // Hash of plaintext account number for uniqueness checks
      accountNumberHash: {
        type: String,
        select: false,
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

    // When owner/admin requests technician to update incorrect bank details
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

// 🔐 Unique index for account number hash (plaintext hashed)
// Guard against accidental double-registration (can happen if module is evaluated twice).
const hasAccountHashIndex = technicianKycSchema
  .indexes()
  .some(([fields]) => fields && fields["bankDetails.accountNumberHash"] === 1);

if (!hasAccountHashIndex) {
  technicianKycSchema.index(
    { "bankDetails.accountNumberHash": 1 },
    { unique: true, sparse: true }
  );
}

/* ==========================
   🔐 ENCRYPTION / DECRYPTION HELPERS
========================== */
const ENCRYPTION_KEY = process.env.ACCOUNT_ENCRYPTION_KEY || "default-key-change-in-production";
const ALGORITHM = "aes-256-cbc";

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32)), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(encryptedText) {
  if (!encryptedText) return null;
  const parts = encryptedText.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32)), iv);
  let decrypted = decipher.update(Buffer.from(parts[1], "hex"));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// Auto-hash and encrypt on save
technicianKycSchema.pre("save", function (next) {
  if (this.bankDetails?.accountNumber && !this.bankDetails.accountNumber.includes(":")) {
    const plaintext = this.bankDetails.accountNumber;
    // store hash for uniqueness
    this.bankDetails.accountNumberHash = crypto
      .createHash("sha256")
      .update(plaintext)
      .digest("hex");
    // encrypt and store ciphertext
    this.bankDetails.accountNumber = encrypt(plaintext);
  }
  next();
});

// 🔐 Handle encryption for findOneAndUpdate (used in controller)
technicianKycSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  if (update.bankDetails?.accountNumber && !update.bankDetails.accountNumber.includes(":")) {
    const plaintext = update.bankDetails.accountNumber;

    // Ensure hash is also updated if not already present
    if (!update.bankDetails.accountNumberHash) {
      update.bankDetails.accountNumberHash = crypto
        .createHash("sha256")
        .update(plaintext)
        .digest("hex");
    }

    // Encrypt
    update.bankDetails.accountNumber = encrypt(plaintext);
  }
  next();
});

// Auto-decrypt on toJSON
technicianKycSchema.methods.toJSON = function () {
  const obj = this.toObject();
  if (obj.bankDetails?.accountNumber && obj.bankDetails.accountNumber.includes(":")) {
    obj.bankDetails.accountNumber = decrypt(obj.bankDetails.accountNumber);
  }
  return obj;
};

export default mongoose.models.TechnicianKyc || mongoose.model("TechnicianKyc", technicianKycSchema);
