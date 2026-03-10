import cron from "node-cron";
import ServiceBooking from "../Schemas/ServiceBooking.js";
import TechnicianProfile from "../Schemas/TechnicianProfile.js";
import JobBroadcast from "../Schemas/TechnicianBroadcast.js";
import { matchAndBroadcastBooking } from "./technicianMatching.js";

export const initBookingCrons = (io) => {
    // ⏰ CRON 1: Instant Booking Management (Every 5 min)
    // Reminds if still active, Cancels if past autoCancelAt
    cron.schedule("*/5 * * * *", async () => {
        try {
            const now = new Date();

            // Fetch pending instant jobs
            const pendingJobs = await ServiceBooking.find({
                bookingType: "instant",
                status: "pending"
            });

            for (const booking of pendingJobs) {
                if (!booking.autoCancelAt || booking.autoCancelAt > now) {
                    // Still within valid window -> Remind technicians
                    await matchAndBroadcastBooking(booking._id, io);
                    console.log(`[Cron:Reminder] Re-broadcasted live instant job ${booking._id}`);
                } else {
                    // Exceeded autoCancelAt -> Auto-Cancel
                    booking.status = "expired";
                    booking.cancelReason = "no_technician_accept";
                    booking.cancelledBy = "system";
                    await booking.save();

                    // Sync JobBroadcast records to expired
                    await JobBroadcast.updateMany({ bookingId: booking._id }, { status: "expired" });

                    io.emit("booking_cancelled", {
                        bookingId: booking._id,
                        reason: "no_technician_accept",
                        message: "No technician accepted your request in time. It has expired."
                    });
                    console.log(`[Cron:Cancel] Auto-cancelled instant job (Timeout): ${booking._id}`);
                }
            }
        } catch (err) {
            console.error("[Cron:Instant Error]", err);
        }
    });

    // ⏰ CRON 2: Scheduled Booking Reminders (Tiered: 30m then 10m)
    // 3h to 1h window -> Remind Every 30 mins approx.
    // Last 1 hour -> Remind Every 10 mins (Every Cron Run).
    cron.schedule("*/10 * * * *", async () => {
        try {
            const now = new Date();
            const threeHoursFromNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);

            const pendingScheduled = await ServiceBooking.find({
                bookingType: "schedule",
                status: "pending",
                scheduledAt: { $lte: threeHoursFromNow, $gt: now }
            });

            for (const booking of pendingScheduled) {
                const timeDiff = booking.scheduledAt - now;
                const minutesLeft = timeDiff / (1000 * 60);

                if (minutesLeft <= 60) {
                    // Last 1 hour -> Remind Every 10 mins (Every Cron Run)
                    await matchAndBroadcastBooking(booking._id, io);
                    console.log(`[Cron:1h] 10m broadcast for scheduled job: ${booking._id}`);
                } else if (minutesLeft <= 180 && now.getMinutes() % 30 < 10) {
                    // 3h to 1h window -> Remind Every 30 mins approx (matching on cron cycle)
                    await matchAndBroadcastBooking(booking._id, io);
                    console.log(`[Cron:3h] 30m broadcast for scheduled job: ${booking._id}`);
                }
            }
        } catch (err) {
            console.error("[Cron:Scheduled Reminder Error]", err);
        }
    });

    // ⏰ CRON 2.5: Scheduled Booking Auto-Cancel (Every 10 mins)
    // Cancels scheduled bookings if no one accepts before autoCancelAt (usually 12h prior).
    cron.schedule("*/10 * * * *", async () => {
        try {
            const now = new Date();
            const expiredScheduled = await ServiceBooking.find({
                bookingType: "schedule",
                status: "pending",
                autoCancelAt: { $lte: now }
            });

            for (const booking of expiredScheduled) {
                booking.status = "expired";
                booking.cancelReason = "no_technician_accept";
                booking.cancelledBy = "system";
                await booking.save();

                // Sync JobBroadcast records to expired
                await JobBroadcast.updateMany({ bookingId: booking._id }, { status: "expired" });

                io.emit("booking_cancelled", {
                    bookingId: booking._id,
                    reason: "no_technician_accept",
                    message: "No technician accepted your scheduled booking in time. It has been cancelled automatically."
                });
                console.log(`[Cron:Cancel] Auto-cancelled scheduled job (Timeout): ${booking._id}`);
            }
        } catch (err) {
            console.error("[Cron:Scheduled Cancel Error]", err);
        }
    });

    // ⏰ CRON 3: Technician No-Action Check (Every 5 mins)
    // If technician accepts but doesn't click "On the Way" within 30 minutes (autoCancelAt).
    cron.schedule("*/5 * * * *", async () => {
        try {
            const now = new Date();

            // 🟢 PART A: ALL ACCEPTED JOBS (Technician hasn't clicked "On the Way" yet)
            const actionRequiredJobs = await ServiceBooking.find({
                status: "accepted",
                technicianId: { $ne: null },
                autoCancelAt: { $lte: now }
            });

            for (const booking of actionRequiredJobs) {
                // Penalize technician
                const tech = await TechnicianProfile.findByIdAndUpdate(booking.technicianId, {
                    $inc: { jobRejectCount: 1 }
                }, { new: true });

                // BLOCK technician if they reach 3+ rejects
                if (tech && tech.jobRejectCount >= 3) {
                    tech.workStatus = "suspended";
                    await tech.save();
                    console.log(`[Cron:Block] Technician ${tech._id} SUSPENDED (3+ rejects)`);
                }

                booking.retryCount += 1;

                if (booking.retryCount >= 3) {
                    // Fully cancel after 3 rebroadcast failures
                    booking.status = "cancelled";
                    booking.cancelReason = "technician_no_action";
                    booking.cancelledBy = "system";
                    booking.autoCancelAt = null;
                    await booking.save();

                    // Sync JobBroadcast records to expired (Fully cancelled)
                    await JobBroadcast.updateMany({ bookingId: booking._id }, { status: "expired" });

                    io.emit("booking_cancelled", { bookingId: booking._id, reason: booking.cancelReason });
                    console.log(`[Cron:End] Job ${booking._id} fully cancelled after 3 fails.`);
                } else {
                    // Rebroadcast
                    booking.status = "pending";
                    booking.technicianId = null;
                    booking.assignedAt = null;
                    // Reset autoCancelAt to 2 hours for re-broadcasting
                    booking.autoCancelAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
                    await booking.save();

                    // Sync JobBroadcast records to expired (for OLD broadcast attempts)
                    await JobBroadcast.updateMany({ bookingId: booking._id }, { status: "expired" });

                    await matchAndBroadcastBooking(booking._id, io);
                    io.emit("booking:rebroadcast", { bookingId: booking._id, message: "Finding a replacement technician..." });
                    console.log(`[Cron:Retry] Job ${booking._id} rebroadcasted (Attempt ${booking.retryCount})`);
                }
            }
        } catch (err) {
            console.error("[Cron:No-Action Error]", err);
        }
    });
};