/**
 * ⏰ PRODUCTION SERVICE BOOKING CRON JOBS
 *
 * This file manages the lifecycle of bookings in the SEARCHING and ACCEPTED statuses.
 */

import cron from "node-cron";
import ServiceBooking from "../Schemas/ServiceBooking.js";
import { matchAndBroadcastBooking } from "./technicianMatching.js";
import { sendScheduledReminder, notifyCustomerOfRebroadcast } from "./sendReminder.js";
import User from "../Schemas/User.js";
import sendSms from "./sendSMS.js";

/**
 * Helper to notify customer of timeout (SMS ONLY)
 */
const notifyCustomerOfTimeout = async (booking, type, io) => {
    try {
        const customerId = booking.customerId;
        if (!customerId) return;

        const customer = await User.findById(customerId).select("mobileNumber fname");
        const message = type === "EXPIRED"
            ? "We couldn't find a technician for your immediate booking. It has expired. Please try again later."
            : "No technician accepted your scheduled booking 12 hours before the start. It has been cancelled automatically.";

        // 1️⃣ SMS Notification (Primary & Mandatory)
        if (customer?.mobileNumber) {
            await sendSms(customer.mobileNumber, `RightTouch: ${message}`);
        }
    } catch (err) {
        console.error("notifyCustomerOfTimeout error:", err.message);
    }
};

/**
 * ──────────────────────────────────────────────────────────
 * CRON 1: Re-broadcast SEARCHING Bookings (every 10 min)
 * ──────────────────────────────────────────────────────────
 */
const reBroadcastSearchingJobs = (io) =>
    cron.schedule("*/10 * * * *", async () => {
        try {
            const bookings = await ServiceBooking.find({
                status: "SEARCHING",
                technicianId: null,
            }).select("_id");

            if (bookings.length === 0) return;

            console.log(`⏰ [CRON:REBROADCAST] Re-broadcasting ${bookings.length} jobs in SEARCHING status`);

            for (const booking of bookings) {
                await matchAndBroadcastBooking(booking._id, io);
            }
        } catch (err) {
            console.error("❌ [CRON:REBROADCAST] Fatal error:", err.message);
        }
    });

/**
 * ──────────────────────────────────────────────────────────
 * CRON 2: Instant Booking Expiry (every 5 min)
 * ──────────────────────────────────────────────────────────
 */
const handleInstantExpiry = (io) =>
    cron.schedule("*/5 * * * *", async () => {
        try {
            const now = new Date();
            const expiredBookings = await ServiceBooking.find({
                status: "SEARCHING",
                bookingType: "instant",
                autoCancelAt: { $lte: now },
                technicianId: null,
            });

            if (expiredBookings.length === 0) return;

            console.log(`🚨 [CRON:EXPIRY] Expiring ${expiredBookings.length} instant bookings`);

            for (const booking of expiredBookings) {
                await ServiceBooking.updateOne(
                    { _id: booking._id, status: "SEARCHING" },
                    { $set: { status: "EXPIRED" } }
                );
                await notifyCustomerOfTimeout(booking, "EXPIRED", io);
            }
        } catch (err) {
            console.error("❌ [CRON:EXPIRY] Fatal error:", err.message);
        }
    });

/**
 * ──────────────────────────────────────────────────────────
 * CRON 3: Scheduled Booking Auto-Cancel (every 30 min)
 * ──────────────────────────────────────────────────────────
 */
const handleScheduledAutoCancel = (io) =>
    cron.schedule("*/30 * * * *", async () => {
        try {
            const now = new Date();
            const cancelledBookings = await ServiceBooking.find({
                status: "SEARCHING",
                bookingType: "scheduled",
                autoCancelAt: { $lte: now },
                technicianId: null,
            });

            if (cancelledBookings.length === 0) return;

            console.log(`🚨 [CRON:AUTOCANCEL] Cancelling ${cancelledBookings.length} scheduled bookings (12h limit)`);

            for (const booking of cancelledBookings) {
                await ServiceBooking.updateOne(
                    { _id: booking._id, status: "SEARCHING" },
                    { $set: { status: "CANCELLED" } }
                );
                await notifyCustomerOfTimeout(booking, "CANCELLED", io);
            }
        } catch (err) {
            console.error("❌ [CRON:AUTOCANCEL] Fatal error:", err.message);
        }
    });

/**
 * ──────────────────────────────────────────────────────────
 * CRON 4: Reminders for ACCEPTED jobs (24h, 1h, 15min)
 * ──────────────────────────────────────────────────────────
 */
const sendReminders = (io) => {
    // 24h Reminder (every 15 min)
    cron.schedule("*/15 * * * *", async () => {
        const now = new Date();
        const windowMin = new Date(now.getTime() + 23 * 60 * 60 * 1000);
        const windowMax = new Date(now.getTime() + 25 * 60 * 60 * 1000);

        const bookings = await ServiceBooking.find({
            status: "ACCEPTED",
            scheduledAt: { $gte: windowMin, $lte: windowMax },
            "remindersSent.h24": false,
        }).select("_id technicianId scheduledAt");

        for (const b of bookings) {
            await sendScheduledReminder(b, "h24", io);
            await ServiceBooking.updateOne({ _id: b._id }, { $set: { "remindersSent.h24": true } });
        }
    });

    // 1h Reminder (every 5 min)
    cron.schedule("*/5 * * * *", async () => {
        const now = new Date();
        const windowMin = new Date(now.getTime() + 55 * 60 * 1000);
        const windowMax = new Date(now.getTime() + 65 * 60 * 1000);

        const bookings = await ServiceBooking.find({
            status: "ACCEPTED",
            scheduledAt: { $gte: windowMin, $lte: windowMax },
            "remindersSent.h1": false,
        }).select("_id technicianId scheduledAt");

        for (const b of bookings) {
            await sendScheduledReminder(b, "h1", io);
            await ServiceBooking.updateOne({ _id: b._id }, { $set: { "remindersSent.h1": true } });
        }
    });

    // 15min Reminder (every 1 min)
    cron.schedule("* * * * *", async () => {
        const now = new Date();
        const windowMin = new Date(now.getTime() + 10 * 60 * 1000);
        const windowMax = new Date(now.getTime() + 20 * 60 * 1000);

        const bookings = await ServiceBooking.find({
            status: "ACCEPTED",
            scheduledAt: { $gte: windowMin, $lte: windowMax },
            "remindersSent.min15": false,
        }).select("_id technicianId scheduledAt addressSnapshot location");

        for (const b of bookings) {
            await sendScheduledReminder(b, "min15", io);
            await ServiceBooking.updateOne({ _id: b._id }, { $set: { "remindersSent.min15": true } });
        }
    });
};

/**
 * ──────────────────────────────────────────────────────────
 * CRON 5: No-Show Safety (every 2 min)
 * ──────────────────────────────────────────────────────────
 */
const handleNoShowSafety = (io) =>
    cron.schedule("*/2 * * * *", async () => {
        try {
            const now = new Date();
            // 45 minutes tolerance for no-show
            const cutoffTime = new Date(now.getTime() - 45 * 60 * 1000);

            const noShows = await ServiceBooking.find({
                status: "ACCEPTED",
                scheduledAt: { $lte: cutoffTime },
                noShowAt: null,
                technicianId: { $ne: null },
            }).select("_id customerId technicianId scheduledAt");

            for (const booking of noShows) {
                const updated = await ServiceBooking.findOneAndUpdate(
                    { _id: booking._id, status: "ACCEPTED", noShowAt: null },
                    {
                        $set: {
                            technicianId: null,
                            status: "SEARCHING",
                            noShowAt: now,
                            "remindersSent.h24": false,
                            "remindersSent.h1": false,
                            "remindersSent.min15": false,
                            assignedAt: null,
                        },
                    },
                    { new: true }
                );

                if (updated) {
                    await matchAndBroadcastBooking(booking._id, io);
                    await notifyCustomerOfRebroadcast(booking, io);
                }
            }
        } catch (err) {
            console.error("❌ [CRON:NOSHOW] Fatal error:", err.message);
        }
    });

/**
 * INIT
 */
export const initScheduledBookingCrons = (io) => {
    console.log("⏰ Initializing production booking crons...");

    reBroadcastSearchingJobs(io);    // 10 min
    handleInstantExpiry(io);         // 5 min
    handleScheduledAutoCancel(io);  // 30 min
    sendReminders(io);               // Reminders
    handleNoShowSafety(io);         // 2 min

    console.log("✅ All production crons are active.");
};
