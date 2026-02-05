import mongoose from "mongoose";
import JobBroadcast from "../Schemas/TechnicianBroadcast.js";
import ServiceBooking from "../Schemas/ServiceBooking.js";
import TechnicianKyc from "../Schemas/TechnicianKYC.js";
import TechnicianProfile from "../Schemas/TechnicianProfile.js";
import { notifyCustomerJobAccepted, notifyJobTaken } from "../Utils/sendNotification.js";

/* ================= TECHNICIAN ACTIVATION CHECK ================= */
const checkTechnicianActivation = async (technicianProfileId) => {
  try {
    // Fetch KYC data
    const kyc = await TechnicianKyc.findOne({
      technicianId: technicianProfileId,
    }).select("verificationStatus bankVerified");

    // Check KYC approval
    if (!kyc || kyc.verificationStatus !== "approved") {
      return {
        isActive: false,
        message: "Complete KYC, bank verification, and training to activate technician account",
      };
    }

    // Check bank verification
    if (!kyc.bankVerified) {
      return {
        isActive: false,
        message: "Complete KYC, bank verification, and training to activate technician account",
      };
    }

    // Fetch technician profile
    const profile = await TechnicianProfile.findById(technicianProfileId).select("trainingCompleted");

    // Check training completion
    if (!profile || !profile.trainingCompleted) {
      return {
        isActive: false,
        message: "Complete KYC, bank verification, and training to activate technician account",
      };
    }

    // All conditions met
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

/* ================= GET MY JOBS ================= */
export const getMyJobs = async (req, res) => {
  try {
    const technicianProfileId = req.user?.technicianProfileId;
    if (!technicianProfileId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
        result: {},
      });
    }

    // Check technician activation status
    const activation = await checkTechnicianActivation(technicianProfileId);
    if (!activation.isActive) {
      return res.status(200).json({
        success: true,
        message: activation.message,
        result: [],
      });
    }

    // Only show jobs that are broadcasted to this technician and not yet accepted, with geo filter
    const broadcasts = await JobBroadcast.find({
      technicianId: technicianProfileId,
      status: "sent",
    }).select("bookingId");

    const bookingIds = broadcasts.map(b => b.bookingId);

    // Fetch technician's location for geo filter
    const technician = await mongoose.model("TechnicianProfile").findById(technicianProfileId).select("location");
    let geoFilter = {};
    if (technician && technician.location && technician.location.type === "Point" && Array.isArray(technician.location.coordinates)) {
      geoFilter = {
        $or: [
          { location: { $exists: false } },
          {
            location: {
              $geoWithin: {
                $centerSphere: [
                  technician.location.coordinates,
                  10000 / 6378100 // 10km in radians
                ]
              }
            },
          },
        ],
      };
    }

    const bookings = await ServiceBooking.find({
      _id: { $in: bookingIds },
      status: "broadcasted",
      technicianId: null,
      ...geoFilter,
    })
      .populate([
        { path: "serviceId", select: "serviceName" },
        { path: "customerId", select: "firstName lastName mobileNumber" },
        { path: "addressId", select: "name phone addressLine city state pincode latitude longitude" },
      ])
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Jobs fetched successfully",
      result: bookings,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
      result: { error: err.message },
    });
  }
};


/* ================= RESPOND TO JOB ================= */
export const respondToJob = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const { status } = req.body;
    const technicianProfileId = req.user?.technicianProfileId;

    // Check technician activation status
    const activation = await checkTechnicianActivation(technicianProfileId);
    if (!activation.isActive) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: activation.message,
      });
    }

    // Check JobBroadcast existence for this technician and booking
    const broadcast = await JobBroadcast.findOne({
      bookingId: id,
      technicianId: technicianProfileId,
      status: "sent",
    }).session(session);
    if (!broadcast) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: "Job not assigned to this technician",
      });
    }

    // Technician eligibility checks (workStatus, isOnline)
    const TechnicianProfile = mongoose.model("TechnicianProfile");
    const technician = await TechnicianProfile.findById(technicianProfileId).session(session);
    if (!technician || technician.workStatus !== "approved" || !technician.availability?.isOnline) {
      await session.abortTransaction();
      return res.status(403).json({ success: false, message: "Technician not eligible for job acceptance", result: {} });
    }

    // Atomically assign booking if still open
    const booking = await ServiceBooking.findOneAndUpdate(
      { _id: id, status: { $in: ["requested", "broadcasted"] }, technicianId: null },
      { technicianId: technicianProfileId, status: "accepted", assignedAt: new Date() },
      { new: true, session }
    );
    if (!booking) {
      await session.abortTransaction();
      return res.status(409).json({ success: false, message: "Booking already taken", result: {} });
    }
    // Update JobBroadcast status for this technician
    await JobBroadcast.updateOne(
      { bookingId: id, technicianId: technicianProfileId },
      { status: "accepted" },
      { session }
    );
    // Mark all other broadcasts as expired
    await JobBroadcast.updateMany(
      { bookingId: id, technicianId: { $ne: technicianProfileId } },
      { status: "expired" },
      { session }
    );
    await session.commitTransaction();
    return res.status(200).json({ success: true, message: "Job accepted successfully", result: booking });
  } catch (err) {
    await session.abortTransaction();
    return res.status(500).json({ success: false, message: err.message, result: { error: err.message } });
  } finally {
    session.endSession();
  }
};

/* ================= GET NEARBY JOBS WITH DISTANCE ================= */
export const getNearbyJobs = async (req, res) => {
  try {
    const technicianProfileId = req.user?.technicianProfileId;
    // Allow params from query (GET standard) or body (optional flexibility)
    const input = { ...req.query, ...req.body };
    const { latitude, longitude, radius } = input;

    if (!technicianProfileId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
        result: {},
      });
    }

    // Check technician activation status
    const activation = await checkTechnicianActivation(technicianProfileId);
    if (!activation.isActive) {
      return res.status(200).json({
        success: true,
        message: activation.message,
        result: [],
      });
    }

    // Resolve Location: Use provided coords OR fallback to stored technician location
    let lat = Number(latitude);
    let lng = Number(longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      // Fallback to stored location
      const techProfile = await TechnicianProfile.findById(technicianProfileId).select("location");
      if (
        techProfile &&
        techProfile.location &&
        techProfile.location.coordinates &&
        techProfile.location.type === "Point"
      ) {
        // GeoJSON: [longitude, latitude]
        lng = techProfile.location.coordinates[0];
        lat = techProfile.location.coordinates[1];
      } else {
        return res.status(400).json({
          success: false,
          message: "Location not found. Please provide latitude/longitude or update your profile location.",
          result: { received: input },
        });
      }
    }

    // Get broadcasted IDs for this technician
    const broadcasts = await JobBroadcast.find({
      technicianId: technicianProfileId,
      status: "sent",
    }).select("bookingId");

    const bookingIds = broadcasts.map((b) => b.bookingId);

    if (bookingIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No jobs available",
        result: [],
      });
    }

    const maxDist = radius ? Number(radius) : 20000; // Default 20km

    // Aggregate to find nearby jobs and calculate distance
    const jobs = await ServiceBooking.aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [lng, lat] },
          distanceField: "distance", // Distance in meters
          maxDistance: maxDist,
          query: {
            _id: { $in: bookingIds },
            status: "broadcasted",
            technicianId: null,
          },
          spherical: true,
        },
      },
      // Populate Service
      {
        $lookup: {
          from: "services", // Collection name (plural of model name usually)
          localField: "serviceId",
          foreignField: "_id",
          as: "service",
        },
      },
      { $unwind: { path: "$service", preserveNullAndEmptyArrays: true } },
      // Populate Customer
      {
        $lookup: {
          from: "users",
          localField: "customerId",
          foreignField: "_id",
          as: "customer",
          pipeline: [{ $project: { firstName: 1, lastName: 1, mobileNumber: 1 } }],
        },
      },
      { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
      // Populate Address (if addressId exists, though addressSnapshot is usually on booking)
      {
        $lookup: {
          from: "addresses",
          localField: "addressId",
          foreignField: "_id",
          as: "addressDetails",
        },
      },
      { $unwind: { path: "$addressDetails", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          distance: 1, // Include distance
          serviceName: "$service.serviceName",
          customer: 1,
          addressSnapshot: 1,
          address: 1,
          baseAmount: 1,
          scheduledAt: 1,
          status: 1,
          location: 1,
          addressDetails: 1
        }
      },
      { $sort: { distance: 1 } } // Sort by distance (closest first)
    ]);

    return res.status(200).json({
      success: true,
      message: "Nearby jobs fetched successfully",
      result: jobs,
    });
  } catch (err) {
    console.error("getNearbyJobs Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
      result: { error: err.message },
    });
  }
};
