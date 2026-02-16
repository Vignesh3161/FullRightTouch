import mongoose from "mongoose";
import TechnicianProfile from "../Schemas/TechnicianProfile.js";
import Service from "../Schemas/Service.js";
import ServiceBooking from "../Schemas/ServiceBooking.js";
import JobBroadcast from "../Schemas/TechnicianBroadcast.js";
import { broadcastPendingJobsToTechnician } from "../Utils/technicianMatching.js";
import { handleLocationUpdate } from "../Utils/technicianLocation.js";
import { getTechnicianJobEligibility } from "../Utils/technicianEligibility.js";

// ================= UPDATE TECHNICIAN LIVE LOCATION ================= //sk
export const updateTechnicianLocation = async (req, res) => {
  try {
    const technicianProfileId = req.user?.technicianProfileId;
    const { latitude, longitude } = req.body;

    if (!technicianProfileId || !mongoose.Types.ObjectId.isValid(technicianProfileId)) {
      return res.status(401).json({ success: false, message: "Unauthorized", result: {} });
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ success: false, message: "Invalid coordinates", result: {} });
    }

    const result = await handleLocationUpdate(technicianProfileId, latitude, longitude, req.io);

    return res.json({
      success: true,
      message: result.matchCalculation ? "Location updated and jobs calculated" : "Location updated (matching rate limited)",
      result
    });
  } catch (error) {
    console.error("updateTechnicianLocation Error:", error);
    return res.status(500).json({ success: false, message: error.message, result: { error: error.message } });
  }
};

const isValidObjectId = mongoose.Types.ObjectId.isValid;
const TECHNICIAN_STATUSES = ["pending", "trained", "approved", "suspended", "deleted"];

const validateSkills = (skills) => {
  if (skills === undefined) return true;
  if (!Array.isArray(skills)) return false;
  return skills.every((item) =>
    item && item.serviceId && isValidObjectId(item.serviceId)
  );
};

const normalizeServiceIdsInput = (body) => {
  const raw = body?.serviceIds ?? body?.serviceId;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];

  const normalized = list
    .map((v) => (typeof v === "string" ? v.trim() : v))
    .filter(Boolean)
    .map(String);

  // de-dupe
  return Array.from(new Set(normalized));
};

/* ================= ADD TECHNICIAN SKILLS (APPEND) ================= */
export const addTechnicianSkills = async (req, res) => {
  try {
    const technicianProfileId = req.user?.technicianProfileId;

    if (!technicianProfileId || !isValidObjectId(technicianProfileId)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
        result: {},
      });
    }

    const serviceIds = normalizeServiceIdsInput(req.body);
    if (serviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "serviceIds (or serviceId) is required",
        result: {},
      });
    }

    const invalidIds = serviceIds.filter((id) => !isValidObjectId(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid serviceIds",
        result: { invalidIds },
      });
    }

    const serviceObjectIds = serviceIds.map((id) => new mongoose.Types.ObjectId(id));

    // Optional safety: ensure services exist & active
    const activeServices = await Service.find({ _id: { $in: serviceObjectIds }, isActive: true })
      .select("_id")
      .lean();
    const activeSet = new Set(activeServices.map((s) => String(s._id)));
    const missingOrInactive = serviceIds.filter((id) => !activeSet.has(String(id)));
    if (missingOrInactive.length > 0) {
      return res.status(404).json({
        success: false,
        message: "Some services were not found or inactive",
        result: { missingOrInactive },
      });
    }

    const technician = await TechnicianProfile.findByIdAndUpdate(
      technicianProfileId,
      {
        $addToSet: {
          skills: { $each: serviceObjectIds.map((sid) => ({ serviceId: sid })) },
        },
      },
      { new: true, runValidators: true }
    )
      .populate("skills.serviceId", "serviceName")
      .select("-password");

    if (!technician) {
      return res.status(404).json({
        success: false,
        message: "Technician profile not found",
        result: {},
      });
    }

    return res.status(200).json({
      success: true,
      message: "Skills added successfully",
      result: technician,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      result: { error: error.message },
    });
  }
};

/* ================= REMOVE TECHNICIAN SKILLS ================= */
export const removeTechnicianSkills = async (req, res) => {
  try {
    const technicianProfileId = req.user?.technicianProfileId;

    if (!technicianProfileId || !isValidObjectId(technicianProfileId)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
        result: {},
      });
    }

    const serviceIds = normalizeServiceIdsInput(req.body);
    if (serviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "serviceIds (or serviceId) is required",
        result: {},
      });
    }

    const invalidIds = serviceIds.filter((id) => !isValidObjectId(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid serviceIds",
        result: { invalidIds },
      });
    }

    const serviceObjectIds = serviceIds.map((id) => new mongoose.Types.ObjectId(id));

    const technician = await TechnicianProfile.findByIdAndUpdate(
      technicianProfileId,
      {
        $pull: {
          skills: { serviceId: { $in: serviceObjectIds } },
        },
      },
      { new: true, runValidators: true }
    )
      .populate("skills.serviceId", "serviceName")
      .select("-password");

    if (!technician) {
      return res.status(404).json({
        success: false,
        message: "Technician profile not found",
        result: {},
      });
    }

    return res.status(200).json({
      success: true,
      message: "Skills removed successfully",
      result: technician,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      result: { error: error.message },
    });
  }
};

/* ================= CREATE / INITIALIZE TECHNICIAN DATA ================= */
export const createTechnician = async (req, res) => {
  try {
    const {
      user,
      profileImage,
      location,
      locality,
      address,
      city,
      state,
      pincode,
      experienceYears,
      specialization,
      skills,
      profileComplete
    } = req.body;

    const technicianProfileId = req.user?.technicianProfileId;
    const userId = req.user?.userId;

    if (!technicianProfileId || !isValidObjectId(technicianProfileId)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
        result: {},
      });
    }

    // 1. Update User Data if provided (supports nested or flat for legacy)
    const userUpdate = {};
    const userData = user || req.body; // Fallback to req.body for flat structure

    if (userData.fname !== undefined) userUpdate.fname = userData.fname;
    if (userData.lname !== undefined) userUpdate.lname = userData.lname;
    if (userData.gender !== undefined) userUpdate.gender = userData.gender;
    if (userData.email !== undefined) userUpdate.email = userData.email;
    if (userData.mobileNumber !== undefined) userUpdate.mobileNumber = userData.mobileNumber;
    if (userData.status !== undefined) userUpdate.status = userData.status;
    if (userData.profileComplete !== undefined) userUpdate.profileComplete = userData.profileComplete;

    if (Object.keys(userUpdate).length > 0 && userId) {
      await mongoose.model("User").findByIdAndUpdate(userId, userUpdate, {
        new: true,
        runValidators: true,
      });
    }

    // 2. Update Profile Data
    const profileUpdate = {};
    if (profileImage !== undefined) profileUpdate.profileImage = profileImage;
    if (location !== undefined) profileUpdate.location = location;
    if (locality !== undefined) profileUpdate.locality = locality;
    if (address !== undefined) profileUpdate.address = address;
    if (city !== undefined) profileUpdate.city = city;
    if (state !== undefined) profileUpdate.state = state;
    if (pincode !== undefined) profileUpdate.pincode = pincode;
    if (experienceYears !== undefined) profileUpdate.experienceYears = experienceYears;
    if (specialization !== undefined) profileUpdate.specialization = specialization;
    if (profileComplete !== undefined) profileUpdate.profileComplete = profileComplete;

    if (skills !== undefined) {
      if (!validateSkills(skills)) {
        return res.status(400).json({
          success: false,
          message: "Invalid skills format",
          result: {},
        });
      }
      profileUpdate.skills = skills;
    }

    const technician = await TechnicianProfile.findByIdAndUpdate(
      technicianProfileId,
      profileUpdate,
      { new: true, runValidators: true }
    ).select("-password");

    if (!technician) {
      return res.status(404).json({
        success: false,
        message: "Technician profile not found",
        result: {},
      });
    }

    // Re-fetch with populated user for response consistency
    const updatedTech = await TechnicianProfile.findById(technicianProfileId)
      .populate("skills.serviceId", "serviceName")
      .populate({
        path: "userId",
        select: "-password",
      });

    const techObj = updatedTech.toObject();
    const finalResult = {
      user: techObj.userId,
      profileImage: techObj.profileImage,
      location: techObj.location,
      locality: techObj.locality,
      address: techObj.address,
      city: techObj.city,
      state: techObj.state,
      pincode: techObj.pincode,
      experienceYears: techObj.experienceYears,
      specialization: techObj.specialization,
      rating: techObj.rating,
      availability: techObj.availability,
      skills: techObj.skills,
      walletBalance: techObj.walletBalance,
      workStatus: techObj.workStatus,
      trainingCompleted: techObj.trainingCompleted,
      profileComplete: techObj.profileComplete
    };

    return res.status(200).json({
      success: true,
      message: "Technician data initialized successfully",
      result: finalResult,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      result: { error: error.message },
    });
  }
};

/* ================= GET ALL TECHNICIANS ================= */
export const getAllTechnicians = async (req, res) => {
  try {
    const { workStatus, search } = req.query;
    const query = {};

    if (workStatus) {
      if (!TECHNICIAN_STATUSES.includes(workStatus)) {
        return res.status(400).json({
          success: false,
          message: "Invalid workStatus filter",
          result: {},
        });
      }
      query.workStatus = workStatus;
    }

    if (search) {
      query.$or = [
        { fname: { $regex: search, $options: "i" } },
        { lname: { $regex: search, $options: "i" } },
        { workStatus: { $regex: search, $options: "i" } },
      ];
    }

    const technicians = await TechnicianProfile.find(query)
      .populate("skills.serviceId", "serviceName")
      .populate({
        path: "userId",
        select: "fname lname gender mobileNumber email",
      })
      .select("-password");

    return res.status(200).json({
      success: true,
      message: "Technicians fetched successfully",
      result: technicians,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      result: { error: error.message },
    });
  }
};

/* ================= GET TECHNICIAN BY ID ================= */
export const getTechnicianById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Technician ID",
        result: {},
      });
    }

    const technician = await TechnicianProfile.findById(id)
      .populate("skills.serviceId", "serviceName")
      .populate({
        path: "userId",
        select: "fname lname gender mobileNumber email",
      })
      .select("-password");

    if (!technician) {
      return res.status(404).json({
        success: false,
        message: "Technician not found",
        result: {},
      });
    }

    return res.status(200).json({
      success: true,
      message: "Technician fetched successfully",
      result: technician,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      result: { error: error.message },
    });
  }
};

/* ================= GET MY TECHNICIAN (FROM TOKEN) ================= */
export const getMyTechnician = async (req, res) => {
  try {
    const technicianProfileId = req.user?.technicianProfileId;

    if (!technicianProfileId || !isValidObjectId(technicianProfileId)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
        result: {},
      });
    }

    const technician = await TechnicianProfile.findById(technicianProfileId)
      .populate("skills.serviceId", "serviceName")
      .populate({
        path: "userId",
        select: "-password",
      })
      .select("-password");

    if (!technician) {
      return res.status(404).json({
        success: false,
        message: "Technician profile not found",
        result: {},
      });
    }

    const techObj = technician.toObject();

    // Consolidated format for Technician CRUD
    const result = {
      user: techObj.userId,
      profileImage: techObj.profileImage,
      location: techObj.location,
      locality: techObj.locality,
      address: techObj.address,
      city: techObj.city,
      state: techObj.state,
      pincode: techObj.pincode,
      experienceYears: techObj.experienceYears,
      specialization: techObj.specialization,
      rating: techObj.rating,
      availability: techObj.availability,
      skills: techObj.skills,
      walletBalance: techObj.walletBalance,
      workStatus: techObj.workStatus,
      trainingCompleted: techObj.trainingCompleted,
      profileComplete: techObj.profileComplete,
      totalJobsCompleted: techObj.totalJobsCompleted
    };

    return res.status(200).json({
      success: true,
      message: "Technician fetched successfully",
      result: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      result: { error: error.message },
    });
  }
};

/* ================= UPDATE TECHNICIAN ================= */
export const updateTechnician = async (req, res) => {
  try {
    const {
      user,
      profileImage,
      location,
      locality,
      address,
      city,
      state,
      pincode,
      experienceYears,
      specialization,
      availability,
      skills,
      profileComplete
    } = req.body;

    const technicianProfileId = req.user?.technicianProfileId;
    const userId = req.user?.userId;

    if (!technicianProfileId || !isValidObjectId(technicianProfileId)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
        result: {},
      });
    }

    // 1. Update User Data if provided
    if (user && userId) {
      const userUpdate = {};
      if (user.fname !== undefined) userUpdate.fname = user.fname;
      if (user.lname !== undefined) userUpdate.lname = user.lname;
      if (user.email !== undefined) userUpdate.email = user.email;
      if (user.gender !== undefined) userUpdate.gender = user.gender;
      if (user.mobileNumber !== undefined) userUpdate.mobileNumber = user.mobileNumber;
      if (user.status !== undefined) userUpdate.status = user.status;
      if (user.profileComplete !== undefined) userUpdate.profileComplete = user.profileComplete;

      if (Object.keys(userUpdate).length > 0) {
        await mongoose.model("User").findByIdAndUpdate(userId, userUpdate, {
          new: true,
          runValidators: true,
        });
      }
    }

    // 2. Fetch and Update Technician Profile
    const technician = await TechnicianProfile.findById(technicianProfileId);
    if (!technician) {
      return res.status(404).json({
        success: false,
        message: "Technician not found",
        result: {},
      });
    }

    // Update Profile Fields
    if (profileImage !== undefined) technician.profileImage = profileImage;
    if (location !== undefined) technician.location = location;
    if (locality !== undefined) technician.locality = locality;
    if (address !== undefined) technician.address = address;
    if (city !== undefined) technician.city = city;
    if (state !== undefined) technician.state = state;
    if (pincode !== undefined) technician.pincode = pincode;
    if (experienceYears !== undefined) technician.experienceYears = experienceYears;
    if (specialization !== undefined) technician.specialization = specialization;
    if (profileComplete !== undefined) technician.profileComplete = profileComplete;

    if (skills !== undefined) {
      if (!validateSkills(skills)) {
        return res.status(400).json({
          success: false,
          message: "Invalid skills format",
          result: {},
        });
      }
      technician.skills = skills;
    }

    if (availability?.isOnline !== undefined) {
      const isGoingOnline = Boolean(availability.isOnline);

      if (isGoingOnline && !technician.availability.isOnline) {
        // 🔒 Validation checks for going online
        const eligibility = await getTechnicianJobEligibility({ technicianProfileId });

        if (!eligibility.eligible) {
          // If the only reason they are not 'eligible' is because they are currently offline, 
          // that's fine because they are trying to go online.
          const barriers = eligibility.reasons.filter(r => r !== "offline");

          if (barriers.length > 0) {
            return res.status(403).json({
              success: false,
              message: "Cannot go online. Requirements not met: " + barriers.join(", "),
              result: {
                reasons: barriers,
                status: eligibility.status
              },
            });
          }
        }
      }

      technician.availability.isOnline = isGoingOnline;
    }

    await technician.save();

    // Trigger proactive matching if they just went online
    if (availability?.isOnline === true) {
      await broadcastPendingJobsToTechnician(technicianProfileId, req.io);
    }

    // Re-fetch with populated user for response
    const updatedTech = await TechnicianProfile.findById(technicianProfileId)
      .populate("skills.serviceId", "serviceName")
      .populate({
        path: "userId",
        select: "-password",
      });

    const techObj = updatedTech.toObject();
    const finalResult = {
      user: techObj.userId,
      profileImage: techObj.profileImage,
      location: techObj.location,
      locality: techObj.locality,
      address: techObj.address,
      city: techObj.city,
      state: techObj.state,
      pincode: techObj.pincode,
      experienceYears: techObj.experienceYears,
      specialization: techObj.specialization,
      rating: techObj.rating,
      availability: techObj.availability,
      skills: techObj.skills,
      walletBalance: techObj.walletBalance,
      workStatus: techObj.workStatus,
      trainingCompleted: techObj.trainingCompleted,
      profileComplete: techObj.profileComplete
    };

    return res.status(200).json({
      success: true,
      message: "Technician updated successfully",
      result: finalResult,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      result: { error: error.message },
    });
  }
};

/* ================= UPDATE TECHNICIAN STATUS (ADMIN) ================= */
export const updateTechnicianStatus = async (req, res) => {
  try {
    const { technicianId, trainingCompleted, workStatus } = req.body;

    if (!isValidObjectId(technicianId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Technician ID",
        result: {},
      });
    }

    if (req.user?.role !== "Owner") {
      return res.status(403).json({
        success: false,
        message: "Owner access only",
      });
    }

    const technician = await TechnicianProfile.findById(technicianId);
    if (!technician) {
      return res.status(404).json({
        success: false,
        message: "Technician not found",
        result: {},
      });
    }

    if (trainingCompleted !== undefined) {
      technician.trainingCompleted = Boolean(trainingCompleted);
      if (trainingCompleted === true) {
        technician.workStatus = "trained";
      }
    }

    if (workStatus !== undefined) {
      if (!TECHNICIAN_STATUSES.includes(workStatus)) {
        return res.status(400).json({
          success: false,
          message: "Invalid workStatus value. Must be: pending, trained, approved, or suspended",
          result: {},
        });
      }

      technician.workStatus = workStatus;

      if (workStatus === "suspended") {
        technician.availability.isOnline = false;
      }
    }

    await technician.save();

    const result = technician.toObject();
    delete result.password;

    return res.status(200).json({
      success: true,
      message: "Technician status updated successfully",
      result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      result: { error: error.message },
    });
  }
};

/* ================= DELETE TECHNICIAN ================= */
export const deleteTechnician = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Technician ID",
        result: {},
      });
    }

    const technician = await TechnicianProfile.findById(id);
    if (!technician) {
      return res.status(404).json({
        success: false,
        message: "Technician not found",
        result: {},
      });
    }

    const technicianProfileId = req.user?.technicianProfileId;
    const isOwner = req.user?.role === "Owner";
    if (!isOwner && (!technicianProfileId || technician._id.toString() !== technicianProfileId.toString())) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    await technician.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Technician deleted successfully",
      result: {},
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      result: { error: error.message },
    });
  }
};

/* ================= UPDATE TECHNICIAN TRAINING STATUS (OWNER ONLY) ================= */
export const updateTechnicianTraining = async (req, res) => {
  try {
    const { technicianId } = req.params;
    const { trainingCompleted } = req.body;

    // 🛡️ Owner access only
    if (req.user?.role !== "Owner") {
      return res.status(403).json({
        success: false,
        message: "Owner access only",
        result: {},
      });
    }

    if (!isValidObjectId(technicianId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Technician ID",
        result: {},
      });
    }

    if (typeof trainingCompleted !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "trainingCompleted must be a boolean value",
        result: {},
      });
    }

    const technician = await TechnicianProfile.findById(technicianId).select("-password");

    if (!technician) {
      return res.status(404).json({
        success: false,
        message: "Technician not found",
        result: {},
      });
    }

    // Update training status
    technician.trainingCompleted = trainingCompleted;

    // If training is being set to false, force offline
    if (!trainingCompleted && technician.availability?.isOnline) {
      technician.availability.isOnline = false;
      console.log(`⚠️ Technician ${technicianId} forced offline due to incomplete training`);
    }

    await technician.save();

    return res.status(200).json({
      success: true,
      message: `Training status updated to ${trainingCompleted ? 'completed' : 'incomplete'}`,
      result: {
        technicianId: technician._id,
        trainingCompleted: technician.trainingCompleted,
        workStatus: technician.workStatus,
        isOnline: technician.availability?.isOnline || false,
      },
    });
  } catch (error) {
    console.error("Update training error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      result: { error: error.message },
    });
  }
};
/* ================= UPLOAD TECHNICIAN PROFILE IMAGE ================= */
export const uploadProfileImage = async (req, res) => {
  try {
    const technicianProfileId = req.user?.technicianProfileId;

    if (!technicianProfileId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
        result: {},
      });
    }

    if (req.user?.role !== "Technician") {
      return res.status(403).json({
        success: false,
        message: "Only technicians can upload profile image",
        result: {},
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
        result: {},
      });
    }

    const technician = await TechnicianProfile.findByIdAndUpdate(
      technicianProfileId,
      { profileImage: req.file.path },
      { new: true, runValidators: true }
    ).select("-password");

    if (!technician) {
      return res.status(404).json({
        success: false,
        message: "Technician profile not found",
        result: {},
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile image uploaded successfully",
      result: {
        profileImage: technician.profileImage,
      },
    });
  } catch (error) {
    console.error("Upload profile image error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      result: { error: error.message },
    });
  }
};
