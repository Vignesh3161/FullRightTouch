import mongoose from "mongoose";
import TechnicianProfile from "../Schemas/TechnicianProfile.js";
import TechnicianKyc from "../Schemas/TechnicianKYC.js";
import ServiceBooking from "../Schemas/ServiceBooking.js";
import JobBroadcast from "../Schemas/TechnicianBroadcast.js";
import Service from "../Schemas/Service.js";
import { findNearbyTechnicians } from "./findNearbyTechnicians.js";
import { broadcastJobToTechnicians, notifyTechnicianOfNewJob } from "./sendNotification.js";

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Searches for existing unassigned jobs that match a technician's profile
 * and broadcasts them specifically to that technician.
 * Used when a technician goes online or updates their location.
 */
export const broadcastPendingJobsToTechnician = async (technicianProfileId, io) => {
  try {
    const tech = await TechnicianProfile.findById(technicianProfileId);
    if (!tech) return { success: false, message: "Technician not found" };

    // Guard: Only approved and online technicians receive jobs
    if (tech.workStatus !== "approved" || !tech.availability?.isOnline) {
      console.log(`⚠️ broadcastPendingJobsToTechnician: Tech ${technicianProfileId} not eligible (status: ${tech.workStatus}, online: ${tech.availability?.isOnline})`);
      return { success: false, message: "Technician not eligible or offline" };
    }

    if (!tech.location || !tech.location.coordinates) {
      console.log(`⚠️ broadcastPendingJobsToTechnician: Tech ${technicianProfileId} has no location`);
      return { success: false, message: "Technician has no location" };
    }

    const [lng, lat] = tech.location.coordinates;
    const technicianServiceIds = tech.skills.map(s => s.serviceId).filter(Boolean);

    if (technicianServiceIds.length === 0) {
      console.log(`⚠️ broadcastPendingJobsToTechnician: Tech ${technicianProfileId} has no skills`);
      return { success: false, message: "Technician has no skills" };
    }

    // THE CALCULATION: Find 'requested' or 'broadcasted' jobs within 10km search limit
    // that the technician hasn't seen yet.
    const eligibleBookings = await ServiceBooking.find({
      serviceId: { $in: technicianServiceIds },
      technicianId: null,
      status: { $in: ["requested", "broadcasted"] },
      location: {
        $nearSphere: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: 10000, // 10km limit
        },
      },
    }).limit(20);

    if (eligibleBookings.length === 0) {
      return { success: true, count: 0, message: "No matching jobs nearby" };
    }

    let newlyBroadcastedCount = 0;

    // Create broadcast records for each matched job
    for (const booking of eligibleBookings) {
      try {
        // Attempt to create a broadcast record (fails if already exists due to unique index)
        const broadcast = await JobBroadcast.create({
          bookingId: booking._id,
          technicianId: tech._id,
          status: "sent",
        });

        if (broadcast) {
          newlyBroadcastedCount++;

          // Fetch full service details for notification
          const service = await Service.findById(booking.serviceId);

          // Send Real-time Alert
          await notifyTechnicianOfNewJob(
            io,
            tech._id.toString(),
            {
              bookingId: booking._id,
              serviceId: service?._id,
              serviceName: service?.serviceName || "New Service",
              serviceType: service?.serviceType,
              description: service?.description,
              duration: service?.duration,
              customerName: booking.addressSnapshot?.name || "Customer",
              baseAmount: booking.baseAmount,
              address: booking.address,
              scheduledAt: booking.scheduledAt,
            }
          );
        }
      } catch (err) {
        if (err.code !== 11000) {
          console.error(`❌ Error broadcasting job ${booking._id} to tech ${tech._id}:`, err);
        }
        // Duplicate is fine - means they already got the job
      }
    }

    console.log(`✅ broadcastPendingJobsToTechnician: Notified tech ${tech._id} of ${newlyBroadcastedCount} new jobs`);
    return { success: true, count: newlyBroadcastedCount };
  } catch (error) {
    console.error("Match Calculation Error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Find eligible technicians for a given service + customer location.
 * Rules:
 * - Role = Technician
 */
export const findEligibleTechniciansForService = async ({
  serviceId,
  address,
  radiusMeters = 10000,
  enableGeo = true,
  limit = 50,
  session,
} = {}) => {
  // REMOVED ALL VALIDATIONS: KYC, Online Status, Skills, workStatus, etc.
  // Any technician profile in the system is now "eligible".


  const serviceObjectId = new mongoose.Types.ObjectId(serviceId);
  const serviceIdString = String(serviceId);

  let approvedKycQuery = TechnicianKyc.find({
    verificationStatus: "approved",
    bankVerified: true
  }).select("technicianId");
  if (session) approvedKycQuery = approvedKycQuery.session(session);
  const approvedKyc = await approvedKycQuery;

  const approvedTechnicianIds = approvedKyc
    .map((d) => d.technicianId)
    .filter(Boolean);

  if (approvedTechnicianIds.length === 0) {
    return [];
  }

  const baseQuery = {
    _id: { $in: approvedTechnicianIds },
    workStatus: "approved",
    profileComplete: true,
    trainingCompleted: true,
    "availability.isOnline": true,
    $or: [
      // canonical shape: skills: [{ serviceId: ObjectId }]
      { "skills.serviceId": serviceObjectId },
      // legacy/dirty data: string stored instead of ObjectId
      { "skills.serviceId": serviceIdString },
    ],
  };

  const lat = Number(address?.latitude);
  const lng = Number(address?.longitude);

  const hasCoords =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;

  // 1) Prefer geo query when possible (requires technicians to have `location`)
  if (enableGeo && hasCoords) {
    // Only match technicians who actually have a valid GeoJSON Point.
    // Many profiles may have latitude/longitude strings but no GeoJSON `location`.
    const geoQuery = {
      ...baseQuery,
      $and: [
        { "location.type": "Point" },
        { "location.coordinates.0": { $type: "number" } },
        { "location.coordinates.1": { $type: "number" } },
        {
          location: {
            $nearSphere: {
              $geometry: {
                type: "Point",
                coordinates: [lng, lat],
              },
              $maxDistance: radiusMeters,
            },
          },
        },
      ],
    };

    let nearbyQuery = TechnicianProfile.find(geoQuery).select("_id").limit(limit);
    if (session) nearbyQuery = nearbyQuery.session(session);
    const nearby = await nearbyQuery;

    if (nearby.length > 0) return nearby;
  }

  // 2) Fallback: pincode / city matching (no coordinates available or no geo matches)
  const fallbackQuery = { ...baseQuery };

  if (address?.pincode) {
    fallbackQuery.pincode = String(address.pincode).trim();
  } else if (address?.city) {
    fallbackQuery.city = new RegExp(`^${escapeRegExp(String(address.city).trim())}$`, "i");
  } else if (address?.state) {
    fallbackQuery.state = new RegExp(`^${escapeRegExp(String(address.state).trim())}$`, "i");
  }

  let fallbackFindQuery = TechnicianProfile.find(fallbackQuery)
    .select("_id")
    .limit(limit);
  if (session) fallbackFindQuery = fallbackFindQuery.session(session);
  return fallbackFindQuery;
};

/**
 * Unifies the logic for matching and broadcasting a booking to technicians.
 * Used by both Booking Creation (single) and Checkout (cart).
 *
 * @param {string} bookingId - The ID of the booking to process
 * @param {Object} io - Socket.io instance for real-time notifications
 */
export const matchAndBroadcastBooking = async (bookingId, io) => {
  try {
    const booking = await ServiceBooking.findById(bookingId);
    if (!booking) {
      console.error(`❌ matchAndBroadcastBooking: Booking ${bookingId} not found`);
      return { success: false, message: "Booking not found" };
    }

    if (booking.status !== "requested") {
      // Already processed or cancelled
      return { success: false, message: `Booking status is ${booking.status}` };
    }

    const service = await Service.findById(booking.serviceId);
    if (!service) {
      console.error(`❌ matchAndBroadcastBooking: Service ${booking.serviceId} not found`);
      return { success: false, message: "Service not found" };
    }

    // Resolve Location for Matching
    // Booking now has 'location' GeoJSON and 'addressSnapshot'
    // We prioritize the GeoJSON coordinates.
    let latitude, longitude;

    if (booking.location && booking.location.coordinates) {
      // GeoJSON is [lng, lat]
      longitude = booking.location.coordinates[0];
      latitude = booking.location.coordinates[1];
    } else if (booking.addressSnapshot) {
      latitude = booking.addressSnapshot.latitude;
      longitude = booking.addressSnapshot.longitude;
    }

    if (!latitude || !longitude) {
      console.error(`❌ matchAndBroadcastBooking: No coordinates for booking ${bookingId}`);
      return { success: false, message: "No coordinates for booking" };
    }

    // 1. Find Technicians
    const eligibleTechnicians = await findEligibleTechniciansForService({
      serviceId: booking.serviceId,
      address: booking.addressSnapshot || {
        latitude: booking.location?.coordinates[1],
        longitude: booking.location?.coordinates[0]
      },
      limit: 100
    });

    const technicianIds = eligibleTechnicians.map(t => t._id.toString());

    if (technicianIds.length === 0) {
      console.log(`⚠️ No technicians found for booking ${bookingId}`);
      return { success: true, count: 0, message: "No technicians found" };
    }

    // 3. Create JobBroadcast Records
    const jobBroadcastDocs = technicianIds.map(technicianId => ({
      bookingId: booking._id,
      technicianId,
      status: "sent",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes expiry?
    }));

    try {
      await JobBroadcast.insertMany(jobBroadcastDocs, { ordered: false });
    } catch (e) {
      // Ignore duplicates
    }

    // 4. Update Booking Status
    await ServiceBooking.updateOne(
      { _id: booking._id },
      { status: "broadcasted", broadcastedAt: new Date() }
    );

    // 5. Send Notifications (Push + Socket)
    await broadcastJobToTechnicians(
      io,
      technicianIds,
      {
        bookingId: booking._id,
        serviceId: service._id,
        serviceName: service.serviceName,
        serviceType: service.serviceType,
        description: service.description,
        duration: service.duration,
        customerName: booking.addressSnapshot?.name || "Customer",
        baseAmount: booking.baseAmount,
        address: booking.address, // legacy string or snapshot line
        scheduledAt: booking.scheduledAt,
      }
    );

    console.log(`✅ matchAndBroadcastBooking: Broadcasted booking ${bookingId} to ${technicianIds.length} techs`);
    return { success: true, count: technicianIds.length };

  } catch (error) {
    console.error("❌ matchAndBroadcastBooking Error:", error);
    return { success: false, error: error.message };
  }
};

