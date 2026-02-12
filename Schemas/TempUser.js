import mongoose from "mongoose";

const tempUserSchema = new mongoose.Schema(
  {
    identifier: {
      type: String, // email
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["Owner", "Admin", "Customer", "Technician"],
      required: true,
      index: true,
    },
    tempstatus: {
      type: String,
      enum: ["Pending", "Verified", "Expired"],
      default: "Pending",
    },
    termsAndServices: {
      type: Boolean,
      default: false,
    },
    privacyPolicy: {
      type: Boolean,
      default: false,
    },
    termsAndServicesAt: {
      type: Date,
      default: null,
    },
    privacyPolicyAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);


tempUserSchema.index({ identifier: 1, role: 1 }, { unique: true });

export default mongoose.models.TempUser ||
  mongoose.model("TempUser", tempUserSchema);
