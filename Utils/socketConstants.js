/**
 * 🛰 SOCKET EVENT CONSTANTS
 * Centralized registry of all socket events to ensure consistency between
 * server-side logic and client-side implementation.
 */

export const SOCKET_EVENTS = {
    // 🔌 Connection Events
    CONNECTION: "connection",
    DISCONNECT: "disconnect",
    ERROR: "error",

    // 👤 User/Customer Events
    CUSTOMER_JOIN: "customer:join", // Optional manual join
    JOB_ACCEPTED_NOTIFY: "job_accepted", // Notifies customer

    // 👨‍🔧 Technician Events
    TECH_JOIN: "technician:join",
    TECH_LOCATION_UPDATE: "technician:location_update",
    TECH_GET_JOBS: "technician:get_jobs",
    TECH_JOBS_LIST: "technician:jobs_list",

    // 📋 Job/Booking Events
    JOB_NEW: "job:new",
    JOB_TAKEN: "job_taken",
    NEW_BOOKING_ALERT: "new_booking", // Admin/global alert

    // 📍 Location Events
    LOCATION_UPDATE_EMIT: "location_update", // Emitted to customer

    // 🚀 Internal/System
    REDIS_CONNECTED: "redis:connected",
};

/**
 * 🔒 SOCKET ROOM PREFIXES
 */
export const SOCKET_ROOMS = {
    TECHNICIAN: (id) => `technician_${id}`,
    CUSTOMER: (id) => `customer_${id}`,
    BOOKING: (id) => `booking_${id}`,
};
