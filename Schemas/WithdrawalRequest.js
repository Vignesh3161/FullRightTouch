import mongoose from "mongoose";

const withdrawalRequestSchema = new mongoose.Schema(
  {
    technicianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TechnicianProfile",
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 1,
    },

    status: {
      type: String,
     //sk
      enum: ["pending", "requested", "approved", "rejected", "paid", "cancelled"],
      default: "pending",
      index: true,
    },

    requestedAt: {
      type: Date,
      default: Date.now,
    },
    //sk

    approvedAt: {
      type: Date,
      default: null,
    },

    rejectedAt: {
      type: Date,
      default: null,
    },

    decidedAt: {
      type: Date,
      default: null,
    },
    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    //sk

    adminNote: {
      type: String,
      default: null,
      trim: true,
    },

    decisionNote: {
      type: String,
      default: null,
      trim: true,
    },

    payoutProvider: {
      type: String,
      default: null,
      trim: true,
    },

    payoutReference: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    walletTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletTransaction",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);
//sk
// Prevent duplicate pending/requested requests
withdrawalRequestSchema.index(
  //sk
  { technicianId: 1, status: 1 },
  { 
    unique: true, 
    partialFilterExpression: { 
      status: { $in: ["pending", "requested"] } 
    } 
  }
);

export default mongoose.models.WithdrawalRequest ||
  mongoose.model("WithdrawalRequest", withdrawalRequestSchema);

