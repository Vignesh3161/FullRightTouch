import express from "express";
import { Auth } from "../Middleware/Auth.js";

const router = express.Router();

// @route   POST /api/dev/test-redis
// @desc    Test Redis Adapter Broadcast (Targets YOU based on your token)
// @access  Private (Auth required)
router.post("/test-redis", Auth, (req, res) => {
    try {
        const { event, message } = req.body;

        if (!req.io) {
            return res.status(500).json({ success: false, message: "Socket.io not initialized" });
        }

        // 🔒 SAFETY CHECK: Ensure the user is a technician
        if (req.user?.role !== "Technician" || !req.user?.technicianProfileId) {
            return res.status(403).json({
                success: false,
                message: "Access Denied: This test endpoint is only for logged-in Technicians."
            });
        }

        // ROOM is derived ONLY from the login token
        const targetRoom = `technician_${req.user.technicianProfileId}`;
        const targetEvent = event || "job:new";

        const payload = message || {
            heading: "Live Test Notification",
            timestamp: new Date(),
            technicianId: req.user.technicianProfileId,
            verified: true
        };

        // Emit via Redis-enabled Socket.io
        // This will be broadcast across all server instances via Redis
        req.io.to(targetRoom).emit(targetEvent, payload);

        return res.status(200).json({
            success: true,
            message: "Broadcast sent via Redis successfully",
            details: {
                room: targetRoom,
                event: targetEvent,
                payload
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// @route   POST /api/dev/find-techs
// @desc    Find Eligible Techs for Service & Broadcast
// @access  Private
import { findEligibleTechniciansForService } from "../Utils/technicianMatching.js";

router.post("/find-techs", Auth, async (req, res) => {
    try {
        const { serviceId, message } = req.body;

        if (!serviceId) {
            return res.status(400).json({ success: false, message: "serviceId is required" });
        }

        // 1. Find matches (Live check: Online + Skills + KYC)
        // We pass a dummy lat/lng (0,0) and enableGeo: false to just get skill matches if no location provided
        const technicians = await findEligibleTechniciansForService({
            serviceId,
            enableGeo: false
        });

        const technicianIds = technicians.map(t => t._id.toString());

        // 2. Broadcast to them
        if (req.io && technicianIds.length > 0) {
            technicianIds.forEach(techId => {
                req.io.to(`technician_${techId}`).emit("job:new", message || {
                    heading: "New Job Opportunity",
                    serviceId,
                    timestamp: new Date()
                });
            });
        }

        return res.status(200).json({
            success: true,
            count: technicianIds.length,
            technicians: technicianIds,
            message: `Broadcasted to ${technicianIds.length} technicians`
        });

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
