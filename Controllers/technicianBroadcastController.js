import mongoose from "mongoose";
import JobBroadcast from "../Schemas/TechnicianBroadcast.js";
import ServiceBooking from "../Schemas/ServiceBooking.js";
import TechnicianKyc from "../Schemas/TechnicianKYC.js";
import TechnicianProfile from "../Schemas/TechnicianProfile.js";
import { notifyCustomerJobAccepted, notifyJobTaken } from "../Utils/sendNotification.js";
import { getTechnicianJobEligibility } from "../Utils/technicianEligibility.js";

/* ================= TECHNICIAN ACTIVATION CHECK ================= */
const checkTechnicianActivation = async (technicianProfileId) => {
  try {
    const { eligible, reasons } = await getTechnicianJobEligibility({ technicianProfileId });

    if (!eligible) {
      // Filter out 'offline' as a reason for "activation" - activation is about the account being ready
      const activationReasons = reasons.filter(r => r !== "offline");
      if (activationReasons.length > 0) {
        return {
          isActive: false,
          message: "Complete KYC, bank verification, and training to activate technician account",
          reasons: activationReasons
        };
      }
    }

    return {
      isActive: true,
      message: "Technician account is active",
    };
  } catch (error) {
    return {
      isActive: false,
      message: error.message,
    };
  }
};

/* ================= GET MY JOBS (LIVE FEED) ================= */
export const getMyJobs = async (req, res) => {
  try {
    const technicianProfileId = req.user?.technicianProfileId;
    if (!technicianProfileId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const activeJob = await ServiceBooking.findOne({
      technicianId: technicianProfileId,
      status: { $in: ["accepted", "on_the_way", "reached", "in_progress"] },
    }).select("_id status");

    if (activeJob) {
      return res.status(200).json({
        success: true,
        message: "You already have an active job. Complete it before accepting a new one.",
        result: [],
      });
    }

    const activation = await checkTechnicianActivation(technicianProfileId);
    if (!activation.isActive) {
      return res.status(200).json({ success: true, message: activation.message, result: [] });
    }

    const jobs = await fetchTechnicianJobsInternal(technicianProfileId);

    return res.status(200).json({ success: true, message: "Live jobs fetched successfully", result: jobs });
  } catch (err) {
    console.error("getMyJobs Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= RESPOND TO JOB ================= */
export const respondToJob = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const { status, response } = req.body;
    const finalStatus = (status || response || "").toLowerCase();
    const technicianProfileId = req.user?.technicianProfileId;
    if (!technicianProfileId) {
      await session.abortTransaction();
      return res.status(401).json({ success: false, message: "Unauthorized: Technician profile not found" });
    }

    const activeJob = await ServiceBooking.findOne({
      technicianId: technicianProfileId,
      status: { $in: ["accepted", "on_the_way", "reached", "in_progress"] },
    }).session(session).select("_id status");

    if (activeJob) {
      await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: "You already have an active job. Complete it before accepting a new one.",
      });
    }

    const broadcast = await JobBroadcast.findOne({
      bookingId: id,
      technicianId: technicianProfileId,
      status: "sent",
    }).session(session);

    if (!broadcast) {
      await session.abortTransaction();
      return res.status(403).json({ success: false, message: "Job not assigned to you or already closed" });
    }

    if (finalStatus !== "accepted" && finalStatus !== "accept") {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Invalid response status" });
    }

    const booking = await ServiceBooking.findOneAndUpdate(
      { _id: id, status: { $in: ["requested", "broadcasted"] }, technicianId: null },
      { technicianId: technicianProfileId, status: "accepted", assignedAt: new Date() },
      { new: true, session }
    ).populate("customerId");

    if (!booking) {
      await session.abortTransaction();
      return res.status(409).json({ success: false, message: "Too late! Booking already taken" });
    }

    await JobBroadcast.updateOne({ bookingId: id, technicianId: technicianProfileId }, { status: "accepted" }, { session });

    const otherBroadcasts = await JobBroadcast.find({
      bookingId: id,
      technicianId: { $ne: technicianProfileId },
      status: "sent"
    }).session(session).select("technicianId");
    const otherTechIds = otherBroadcasts.map(b => b.technicianId.toString());

    await JobBroadcast.updateMany({ bookingId: id, technicianId: { $ne: technicianProfileId } }, { status: "expired" }, { session });

    await session.commitTransaction();

    if (req.io) {
      if (booking.customerId) {
        notifyCustomerJobAccepted(req.io, booking.customerId._id, {
          bookingId: booking._id,
          technicianId: technicianProfileId,
          status: "accepted"
        });
      }
      if (otherTechIds.length > 0) notifyJobTaken(req.io, otherTechIds, booking._id);
    }

    return res.status(200).json({ success: true, message: "Job accepted successfully", result: booking });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    console.error("respondToJob Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
};
