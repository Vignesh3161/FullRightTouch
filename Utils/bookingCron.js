import cron from "node-cron";
import ServiceBooking from "../Schemas/ServiceBooking.js";
import TechnicianProfile from "../Schemas/TechnicianProfile.js";
import JobBroadcast from "../Schemas/TechnicianBroadcast.js";
import { matchAndBroadcastBooking } from "./technicianMatching.js";
import User from "../Schemas/User.js";
import sendSms from "./sendSMS.js";

/**
 * Helper to notify customer via SMS
 */
const notifyCustomer = async (booking, message) => {
    try {
        if (!booking.customerId) return;
        const customer = await User.findById(booking.customerId).select("mobileNumber");
        if (customer?.mobileNumber) {
            await sendSms(customer.mobileNumber, `RightTouch: ${message}`);
        }
    } catch (err) {
        console.error("notifyCustomer error:", err.message);
    }
};

export const initBookingCrons = (io) => {
    console.log("⏰ Initializing consolidated booking crons...");

    /**
     * ─── CRON 1: EXPIRY & AUTO-CANCEL (Every 5 mins) ─────────────────────
     * 1. Instant jobs expire 1 hour after creation (handled by autoCancelAt).
     * 2. Scheduled jobs expire 5 hours before start (handled by autoCancelAt).
     * ─────────────────────────────────────────────────────────────────────
     */
    cron.schedule("*/5 * * * *", async () => {
        try {
            const now = new Date();
            const expiredJobs = await ServiceBooking.find({
                status: { $in: ["pending", "SEARCHING", "broadcasted", "requested"] },
                autoCancelAt: { $lte: now },
                technicianId: null
            });

            for (const booking of expiredJobs) {
                booking.status = "expired";
                booking.cancelReason = "no_technician_accept";
                booking.cancelledBy = "system";
                await booking.save();

                await JobBroadcast.updateMany({ bookingId: booking._id }, { status: "expired" });

                const message = booking.bookingType === "instant"
                    ? "We couldn't find a technician for your immediate booking. It has expired. Please try again later."
                    : "No technician accepted your scheduled booking 5 hours before the start. It has been cancelled automatically.";

                await notifyCustomer(booking, message);

                if (io) {
                    io.emit("booking_cancelled", {
                        bookingId: booking._id,
                        reason: "no_technician_accept",
                        message
                    });
                }
                console.log(`[Cron:Expiry] Auto-cancelled ${booking.bookingType} job ${booking._id}`);
            }
        } catch (err) {
            console.error("[Cron:Expiry Error]", err);
        }
    });

    /**
     * ─── CRON 2: RE-BROADCAST / REMINDERS (Every 10 mins) ──────────────────
     * Keeps unaccepted jobs visible to technicians by re-broadcasting.
     * ──────────────────────────────────────────────────────────────────────
     */
    cron.schedule("*/10 * * * *", async () => {
        try {
            const now = new Date();
            const jobsToBroadcast = await ServiceBooking.find({
                status: { $in: ["pending", "SEARCHING", "broadcasted", "requested"] },
                technicianId: null,
                autoCancelAt: { $gt: now }
            }).select("_id");

            for (const booking of jobsToBroadcast) {
                await matchAndBroadcastBooking(booking._id, io);
                console.log(`[Cron:Broadcast] Re-broadcasted job ${booking._id}`);
            }
        } catch (err) {
            console.error("[Cron:Broadcast Error]", err);
        }
    });

    /**
     * ─── CRON 3: SCHEDULED TRAVEL ENFORCEMENT ALERTS (Every 1 min) ─────────
     * Alert technician 35 minutes before the job starts.
     * (Automatic unassign/no-show reset removed per user request)
     * ──────────────────────────────────────────────────────────────────────
     */
    cron.schedule("* * * * *", async () => {
        try {
            const now = new Date();
            const alertMin = new Date(now.getTime() + 34 * 60 * 1000);
            const alertMax = new Date(now.getTime() + 40 * 60 * 1000);

            const pendingAlerts = await ServiceBooking.find({
                status: { $in: ["accepted", "ACCEPTED"] },
                bookingType: "schedule",
                scheduledAt: { $gte: alertMin, $lte: alertMax },
                "remindersSent.enforceOTW": false,
                technicianId: { $ne: null }
            });

            for (const b of pendingAlerts) {
                // Send alert to technician via socket
                if (io) {
                    io.to(`technician_${b.technicianId}`).emit("booking:travel_reminder", {
                        bookingId: b._id,
                        message: "Reminder: Your scheduled job starts in 35 minutes. Please start your travel soon."
                    });
                }
                
                await ServiceBooking.updateOne(
                    { _id: b._id },
                    { 
                        $set: { 
                            "remindersSent.enforceOTW": true,
                            enforcementAlertAt: now
                        } 
                    }
                );
                console.log(`[Cron:Enforcement] Travel reminder sent for job ${b._id}`);
            }
        } catch (err) {
            console.error("[Cron:Enforcement Error]", err);
        }
    });

    console.log("✅ Consolidated booking crons are active.");
};