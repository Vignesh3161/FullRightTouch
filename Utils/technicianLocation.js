import TechnicianProfile from "../Schemas/TechnicianProfile.js";
import { broadcastPendingJobsToTechnician } from "./technicianMatching.js";

/**
 * Common logic to update technician location from HTTP or Socket.
 * Includes rate limiting and distance threshold checks.
 * 
 * @param {String} technicianProfileId 
 * @param {Number} latitude 
 * @param {Number} longitude 
 * @param {Object} io - Socket.io instance
 * @returns {Object} result
 */
export const handleLocationUpdate = async (technicianProfileId, latitude, longitude, io) => {
    const profile = await TechnicianProfile.findById(technicianProfileId).select("location lastMatchingAt availability workStatus");
    if (!profile) throw new Error("Technician profile not found");

    const [oldLng, oldLat] = profile.location?.coordinates || [0, 0];

    // 1. Distance Gate (Moved > 5 meters)
    const toRad = deg => (deg * Math.PI) / 180;
    const R = 6371000; // meters
    const dLat = toRad(latitude - oldLat);
    const dLng = toRad(longitude - oldLng);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(oldLat)) * Math.cos(toRad(latitude)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c;

    const significantMove = dist > 5;
    const neverUpdated = !profile.location || !profile.location.coordinates;

    if (significantMove || neverUpdated) {
        await TechnicianProfile.updateOne(
            { _id: technicianProfileId },
            {
                location: {
                    type: "Point",
                    coordinates: [longitude, latitude],
                },
                "availability.isOnline": true,
            }
        );
        console.log(`📍 Tech ${technicianProfileId} moved ${dist.toFixed(1)}m. Location updated.`);
    }

    // 2. Rate Limit Gate (Job matching once every 30 seconds)
    const lastMatch = profile.lastMatchingAt ? new Date(profile.lastMatchingAt).getTime() : 0;
    const now = Date.now();
    const secondsSinceLastMatch = (now - lastMatch) / 1000;

    if (secondsSinceLastMatch >= 30) {
        console.log(`🔍 Tech ${technicianProfileId}: Triggering job matching (last match ${secondsSinceLastMatch.toFixed(0)}s ago)`);

        // Update lastMatchingAt BEFORE calculation to prevent race conditions
        await TechnicianProfile.updateOne(
            { _id: technicianProfileId },
            { lastMatchingAt: new Date() }
        );

        // Perform calculation
        const matchResult = await broadcastPendingJobsToTechnician(technicianProfileId, io);
        return {
            success: true,
            locationUpdated: significantMove || neverUpdated,
            matchCalculation: true,
            jobsFound: matchResult.count || 0
        };
    }

    return {
        success: true,
        locationUpdated: significantMove || neverUpdated,
        matchCalculation: false,
        memo: "Matching rate limited (30s)"
    };
};
