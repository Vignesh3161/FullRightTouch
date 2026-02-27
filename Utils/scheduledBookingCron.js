/**
 * ⏰ SCHEDULED BOOKING CRON JOBS
 *
 * 5 cron jobs that power the scheduled booking system:
 *
 *  1. activateScheduledBookings  — Every 5 min: Activate bookings due within 15 min
 *  2. sendReminders24h           — Every 15 min: Remind technician 24h before
 *  3. sendReminders1h            — Every 5 min:  Remind technician 1h before
 *  4. sendReminders15min         — Every 1 min:  Remind technician 15min before + nav link
 *  5. handleNoShowSafety         — Every 2 min:  Unassign technician who didn't start in 30 min
 *
 * Call initScheduledBookingCrons(io) once during server startup (in index.js).
 */

import cron from "node-cron";
import ServiceBooking from "../Schemas/ServiceBooking.js";
import { matchAndBroadcastBooking } from "./technicianMatching.js";
import { sendScheduledReminder, notifyCustomerOfRebroadcast } from "./sendReminder.js";

/**
 * ──────────────────────────────────────────────────────────
 * CRON 1: Activate Scheduled Bookings (every 5 min)
 * Find bookings with status="scheduled" that start ≤ 15 min
 * from now → flip to "requested" → broadcast to technicians.
 * ──────────────────────────────────────────────────────────
 */
const activateScheduledBookings = (io) =>
    cron.schedule("*/5 * * * *", async () => {
        try {
            const now = new Date();
            const windowEnd = new Date(now.getTime() + 15 * 60 * 1000); // now + 15 min

            const bookings = await ServiceBooking.find({
                status: "scheduled",
                scheduledAt: { $lte: windowEnd },
            }).select("_id scheduledAt");

            if (bookings.length === 0) return;

            console.log(`⏰ [CRON:ACTIVATE] Found ${bookings.length} scheduled booking(s) to activate`);

            for (const booking of bookings) {
                try {
                    // Flip status → requested
                    await ServiceBooking.updateOne(
                        { _id: booking._id, status: "scheduled" }, // double-check status (race guard)
                        { $set: { status: "requested" } }
                    );

                    // Broadcast to nearby technicians
                    const result = await matchAndBroadcastBooking(booking._id, io);
                    console.log(
                        `✅ [CRON:ACTIVATE] Booking ${booking._id} activated. Broadcast to ${result.count ?? 0} technicians.`
                    );
                } catch (err) {
                    console.error(`❌ [CRON:ACTIVATE] Error for booking ${booking._id}:`, err.message);
                }
            }
        } catch (err) {
            console.error("❌ [CRON:ACTIVATE] Fatal error:", err.message);
        }
    });

/**
 * ──────────────────────────────────────────────────────────
 * CRON 2: 24-Hour Reminder (every 15 min)
 * ──────────────────────────────────────────────────────────
 */
const sendReminders24h = (io) =>
    cron.schedule("*/15 * * * *", async () => {
        try {
            const now = new Date();
            const windowMin = new Date(now.getTime() + 23 * 60 * 60 * 1000); // now + 23h
            const windowMax = new Date(now.getTime() + 25 * 60 * 60 * 1000); // now + 25h

            const bookings = await ServiceBooking.find({
                status: "accepted",
                scheduledAt: { $gte: windowMin, $lte: windowMax },
                "remindersSent.h24": false,
            }).select("_id technicianId scheduledAt");

            if (bookings.length === 0) return;
            console.log(`🔔 [CRON:24H] Sending 24h reminders to ${bookings.length} technician(s)`);

            for (const booking of bookings) {
                try {
                    await sendScheduledReminder(booking, "h24", io);
                    await ServiceBooking.updateOne(
                        { _id: booking._id },
                        { $set: { "remindersSent.h24": true } }
                    );
                } catch (err) {
                    console.error(`❌ [CRON:24H] Booking ${booking._id}:`, err.message);
                }
            }
        } catch (err) {
            console.error("❌ [CRON:24H] Fatal error:", err.message);
        }
    });

/**
 * ──────────────────────────────────────────────────────────
 * CRON 3: 1-Hour Reminder (every 5 min)
 * ──────────────────────────────────────────────────────────
 */
const sendReminders1h = (io) =>
    cron.schedule("*/5 * * * *", async () => {
        try {
            const now = new Date();
            const windowMin = new Date(now.getTime() + 55 * 60 * 1000); // now + 55 min
            const windowMax = new Date(now.getTime() + 65 * 60 * 1000); // now + 65 min

            const bookings = await ServiceBooking.find({
                status: "accepted",
                scheduledAt: { $gte: windowMin, $lte: windowMax },
                "remindersSent.h1": false,
            }).select("_id technicianId scheduledAt");

            if (bookings.length === 0) return;
            console.log(`🔔 [CRON:1H] Sending 1h reminders to ${bookings.length} technician(s)`);

            for (const booking of bookings) {
                try {
                    await sendScheduledReminder(booking, "h1", io);
                    await ServiceBooking.updateOne(
                        { _id: booking._id },
                        { $set: { "remindersSent.h1": true } }
                    );
                } catch (err) {
                    console.error(`❌ [CRON:1H] Booking ${booking._id}:`, err.message);
                }
            }
        } catch (err) {
            console.error("❌ [CRON:1H] Fatal error:", err.message);
        }
    });

/**
 * ──────────────────────────────────────────────────────────
 * CRON 4: 15-Minute Reminder (every 1 min)
 * ──────────────────────────────────────────────────────────
 */
const sendReminders15min = (io) =>
    cron.schedule("* * * * *", async () => {
        try {
            const now = new Date();
            const windowMin = new Date(now.getTime() + 10 * 60 * 1000); // now + 10 min
            const windowMax = new Date(now.getTime() + 20 * 60 * 1000); // now + 20 min

            const bookings = await ServiceBooking.find({
                status: "accepted",
                scheduledAt: { $gte: windowMin, $lte: windowMax },
                "remindersSent.min15": false,
            }).select("_id technicianId scheduledAt addressSnapshot location");

            if (bookings.length === 0) return;
            console.log(`🔔 [CRON:15MIN] Sending 15min reminders to ${bookings.length} technician(s)`);

            for (const booking of bookings) {
                try {
                    await sendScheduledReminder(booking, "min15", io);

                    // Also emit navigation coordinates to technician via socket
                    if (io) {
                        const techId = booking.technicianId?.toString?.() || booking.technicianId;
                        const lat = booking.addressSnapshot?.latitude ?? booking.location?.coordinates?.[1];
                        const lng = booking.addressSnapshot?.longitude ?? booking.location?.coordinates?.[0];

                        if (techId && lat && lng) {
                            io.to(`technician_${techId}`).emit("booking:navigate", {
                                bookingId: booking._id,
                                latitude: lat,
                                longitude: lng,
                                message: "Navigate to customer location now",
                            });
                        }
                    }

                    await ServiceBooking.updateOne(
                        { _id: booking._id },
                        { $set: { "remindersSent.min15": true } }
                    );
                } catch (err) {
                    console.error(`❌ [CRON:15MIN] Booking ${booking._id}:`, err.message);
                }
            }
        } catch (err) {
            console.error("❌ [CRON:15MIN] Fatal error:", err.message);
        }
    });

/**
 * ──────────────────────────────────────────────────────────
 * CRON 5: No-Show Safety (every 2 min)
 *
 * If a technician has been assigned but 30+ minutes have
 * passed since scheduledAt and status is still "accepted"
 * (not on_the_way / reached / in_progress / completed),
 * we treat it as a no-show:
 *   1. Clear technicianId
 *   2. Reset status → "requested"
 *   3. Re-broadcast to all eligible technicians
 *   4. Notify customer
 * ──────────────────────────────────────────────────────────
 */
const handleNoShowSafety = (io) =>
    cron.schedule("*/2 * * * *", async () => {
        try {
            const now = new Date();
            const cutoffTime = new Date(now.getTime() - 30 * 60 * 1000); // 30 min ago

            // Jobs where technician was assigned but hasn't started AND 30+ min past schedule
            const noShows = await ServiceBooking.find({
                status: "accepted",
                scheduledAt: { $lte: cutoffTime },  // scheduled time was > 30 min ago
                noShowAt: null,                  // haven't processed this yet
                technicianId: { $ne: null },        // must have a technician assigned
            }).select("_id customerId technicianId scheduledAt");

            if (noShows.length === 0) return;
            console.log(`🚨 [CRON:NOSHOW] Detected ${noShows.length} no-show booking(s)`);

            for (const booking of noShows) {
                try {
                    const prevTechnicianId = booking.technicianId;

                    // 1. Unassign technician + mark no-show time (idempotency guard)
                    const updated = await ServiceBooking.findOneAndUpdate(
                        {
                            _id: booking._id,
                            status: "accepted",   // ensure it hasn't changed since query
                            noShowAt: null,
                        },
                        {
                            $set: {
                                technicianId: null,
                                status: "requested",
                                noShowAt: now,
                                // Reset reminder flags so new technician gets fresh reminders
                                "remindersSent.h24": false,
                                "remindersSent.h1": false,
                                "remindersSent.min15": false,
                                // Clear assignment timestamp
                                assignedAt: null,
                            },
                        },
                        { new: true }
                    );

                    if (!updated) {
                        // Already handled by another cron instance or status changed
                        continue;
                    }

                    console.log(
                        `🚨 [CRON:NOSHOW] Booking ${booking._id}: Unassigned technician ${prevTechnicianId}. Re-broadcasting...`
                    );

                    // 2. Re-broadcast to find new technician
                    const result = await matchAndBroadcastBooking(booking._id, io);
                    console.log(
                        `✅ [CRON:NOSHOW] Booking ${booking._id} re-broadcast to ${result.count ?? 0} technicians`
                    );

                    // 3. Notify customer
                    await notifyCustomerOfRebroadcast(booking, io);
                } catch (err) {
                    console.error(`❌ [CRON:NOSHOW] Error for booking ${booking._id}:`, err.message);
                }
            }
        } catch (err) {
            console.error("❌ [CRON:NOSHOW] Fatal error:", err.message);
        }
    });

/**
 * ──────────────────────────────────────────────────────────
 * INIT — Call this once in index.js
 * ──────────────────────────────────────────────────────────
 */
export const initScheduledBookingCrons = (io) => {
    console.log("⏰ Initializing scheduled booking cron jobs...");

    activateScheduledBookings(io);  // every 5 min
    sendReminders24h(io);           // every 15 min
    sendReminders1h(io);            // every 5 min
    sendReminders15min(io);         // every 1 min
    handleNoShowSafety(io);         // every 2 min

    console.log("✅ All scheduled booking crons are running.");
};
