/**
 * 📢 NOTIFICATION UTILITY
 * Handles push notifications, SMS, and real-time socket notifications
 */

/**
 * Send push notification to technician
 * @param {String} technicianId - Technician profile ID
 * @param {Object} payload - Notification payload
 */
export const sendPushNotification = async (technicianId, payload) => {
  try {
    // TODO: Integrate with Firebase Cloud Messaging (FCM) or similar service
    // For now, just log the notification
    console.log(`📱 Push Notification to Technician ${technicianId}:`, {
      title: payload.title,
      body: payload.body,
      data: payload.data,
    });

    // Example FCM implementation:
    // const message = {
    //   notification: {
    //     title: payload.title,
    //     body: payload.body,
    //   },
    //   data: payload.data,
    //   token: deviceToken, // Get from TechnicianProfile or separate DeviceTokens collection
    // };
    // await admin.messaging().send(message);

    return { success: true, message: "Push notification sent" };
  } catch (error) {
    console.error("❌ Push notification error:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send socket notification (real-time)
 * @param {Object} io - Socket.io instance
 * @param {String} technicianId - Technician profile ID
 * @param {String} event - Socket event name
 * @param {Object} data - Event data
 */
export const sendSocketNotification = (io, technicianId, event, data) => {
  try {
    if (!io) {
      console.warn("⚠️ Socket.io not initialized");
      return { success: false, message: "Socket.io not available" };
    }

    // Emit to specific technician room
    io.to(`technician_${technicianId}`).emit(event, data);

    console.log(`🔌 Socket notification sent to Technician ${technicianId}:`, event);
    return { success: true, message: "Socket notification sent" };
  } catch (error) {
    console.error("❌ Socket notification error:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Notify a single technician about a new job
 * @param {Object} io - Socket.io instance
 * @param {String} technicianId - Technician profile ID
 * @param {Object} jobData - Job data
 */
export const notifyTechnicianOfNewJob = async (io, technicianId, jobData) => {
  try {
    // 1️⃣ Send push notification
    const pushResult = await sendPushNotification(technicianId, {
      title: "🆕 New Job Available",
      body: `New ${jobData.serviceName || "service"} job in your area`,
      data: {
        type: "new_job",
        bookingId: jobData.bookingId.toString(),
        serviceId: jobData.serviceId?.toString(),
        scheduledAt: jobData.scheduledAt,
      },
    });

    // 2️⃣ Send socket notification (if available)
    let socketResult = { success: false, message: "Socket.io not available" };
    if (io) {
      socketResult = sendSocketNotification(
        io,
        technicianId,
        "job:new",
        {
          ...jobData,
          amount: jobData.baseAmount,
        }
      );
    }

    return { success: true, push: pushResult, socket: socketResult };
  } catch (error) {
    console.error(`❌ Error notifying technician ${technicianId}:`, error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Broadcast new job to technicians
 * @param {Object} io - Socket.io instance (optional)
 * @param {Array} technicianIds - Array of technician profile IDs
 * @param {Object} jobData - Job broadcast data
 */
export const broadcastJobToTechnicians = async (io, technicianIds, jobData) => {
  try {
    const results = {
      push: [],
      socket: [],
    };

    for (const technicianId of technicianIds) {
      const notifyResult = await notifyTechnicianOfNewJob(io, technicianId, jobData);
      results.push.push({ technicianId, ...notifyResult.push });
      results.socket.push({ technicianId, ...notifyResult.socket });
    }

    console.log(`✅ Broadcast completed: ${technicianIds.length} technicians notified`);
    return { success: true, results };
  } catch (error) {
    console.error("❌ Broadcast error:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Notify customer about job acceptance
 * @param {String} customerProfileId - Customer profile ID
 * @param {Object} jobData - Job acceptance data
 */
export const notifyCustomerJobAccepted = async (io, customerProfileId, jobData) => {
  try {
    console.log(`📱 Notifying Customer ${customerProfileId} - Job Accepted`);

    // Socket notification (real-time)
    if (io) {
      io.to(`customer_${customerProfileId}`).emit("job_accepted", {
        bookingId: jobData.bookingId?.toString?.() || jobData.bookingId,
        technicianId: jobData.technicianId?.toString?.() || jobData.technicianId,
        status: jobData.status || "accepted",
        timestamp: new Date(),
      });
    }

    // TODO: Push notification to customer (FCM)
    // TODO: SMS/WhatsApp notification if needed

    return { success: true, message: "Customer notified" };
  } catch (error) {
    console.error("❌ Customer notification error:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Notify other technicians that job was taken
 * @param {Array} technicianIds - Array of technician IDs to notify
 * @param {String} bookingId - Booking ID that was accepted
 */
export const notifyJobTaken = (io, technicianIds, bookingId) => {
  try {
    if (!io) return { success: false, message: "Socket.io not available" };

    technicianIds.forEach((technicianId) => {
      io.to(`technician_${technicianId}`).emit("job_taken", {
        bookingId,
        message: "This job has been accepted by another technician",
        timestamp: new Date(),
      });
    });

    console.log(`✅ Notified ${technicianIds.length} technicians - Job taken`);
    return { success: true };
  } catch (error) {
    console.error("❌ Job taken notification error:", error.message);
    return { success: false, error: error.message };
  }
};

