import cron from "node-cron";
import ServiceBooking from "../Schemas/ServiceBooking.js";
import TechnicianProfile from "../Schemas/TechnicianProfile.js";
import { matchAndBroadcastBooking } from "./technicianMatching.js";

export const initBookingCrons = (io) => {
    // ⏰ CRON 1: Instant Booking Management (Every 10 min)
    // Reminds every 10 min, Cancels after 40 min total if no acceptance.
    cron.schedule("*/10 * * * *", async () => {
        try {
            const now = new Date();
            const fortyMinsAgo = new Date(now.getTime() - 40 * 60 * 1000);

            // Fetch pending instant jobs
            const pendingJobs = await ServiceBooking.find({
                bookingType: "instant",
                status: "pending"
            });

            for (const booking of pendingJobs) {
                if (booking.createdAt > fortyMinsAgo) {
                    // Still within 40 min window -> Remind technicians
                    await matchAndBroadcastBooking(booking._id, io);
                    console.log(`[Cron:Reminder] Re-broadcasted live instant job ${booking._id}`);
                } else {
                    // Exceeded 40 min -> Auto-Cancel
                    booking.status = "cancelled";
                    booking.cancelReason = "no_technician_accept";
                    booking.cancelledBy = "system";
                    await booking.save();

                    io.emit("booking_cancelled", {
                        bookingId: booking._id,
                        reason: "no_technician_accept",
                        message: "No technician accepted your request within 40 minutes."
                    });
                    console.log(`[Cron:Cancel] Auto-cancelled instant job (40m Timeout): ${booking._id}`);
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

    // ⏰ CRON 3: Technician No-Action Check (Every 5 mins)
    // Accept after 30 minutes respond to start if not start mean cancel.
    cron.schedule("*/5 * * * *", async () => {
        try {
            const now = new Date();
            const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);
            const tenMinsPastScheduled = new Date(now.getTime() - 10 * 60 * 1000);

            // 🟢 PART A: ALL ACCEPTED JOBS (Technician hasn't clicked "Start")
            const assignedJobs = await ServiceBooking.find({
                status: "accepted",
                technicianId: { $ne: null }
            });

            for (const booking of assignedJobs) {
                let shouldCancel = false;

                if (booking.bookingType === "instant") {
                    // Instant: 30 minutes from assignment to click start
                    if (booking.assignedAt <= thirtyMinsAgo) shouldCancel = true;
                } else {
                    // Scheduled: 10 minutes past scheduled time to click start
                    if (booking.scheduledAt <= tenMinsPastScheduled) shouldCancel = true;
                }

                if (shouldCancel) {
                    // Penalize technician
                    const tech = await TechnicianProfile.findByIdAndUpdate(booking.technicianId, {
                        $inc: { jobRejectCount: 1 }
                    }, { new: true });

                    // BLOCK technician if they reach 3+ rejects
                    if (tech && tech.jobRejectCount >= 3) {
                        tech.workStatus = "suspended"; // Blocked until admin unblocks
                        await tech.save();
                        console.log(`[Cron:Block] Technician ${tech._id} SUSPENDED (3+ rejects)`);
                    }

                    booking.retryCount += 1;

                    if (booking.retryCount >= 3) {
                        // Fully cancel after 3 rebroadcast failures
                        booking.status = "cancelled";
                        booking.cancelReason = booking.bookingType === "instant" ? "no_technician_accept" : "technician_no_action";
                        booking.cancelledBy = "system";
                        await booking.save();
                        io.emit("booking_cancelled", { bookingId: booking._id, reason: booking.cancelReason });
                        console.log(`[Cron:End] Job ${booking._id} fully cancelled after 3 fails.`);
                    } else {
                        // Rebroadcast
                        booking.status = "pending";
                        booking.technicianId = null;
                        booking.assignedAt = null;
                        await booking.save();

                        await matchAndBroadcastBooking(booking._id, io);
                        io.emit("booking:rebroadcast", { bookingId: booking._id, message: "Finding a replacement technician..." });
                        console.log(`[Cron:Retry] Job ${booking._id} rebroadcasted (Attempt ${booking.retryCount})`);
                    }
                }
            }
        } catch (err) {
            console.error("[Cron:No-Action Error]", err);
        }
    });
};