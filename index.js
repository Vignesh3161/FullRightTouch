import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { Server } from "socket.io";
// import { createAdapter } from "@socket.io/redis-adapter";
// import { createClient } from "redis";

// Load environment variables
dotenv.config();

import { socketAuth } from "./Middleware/socketAuth.js";
import UserRoutes from "./Routes/User.js";
import TechnicianRoutes from "./Routes/technician.js";
import AddressRoutes from "./Routes/address.js";
import adminWalletRoutes from "./Routes/adminWalletRoutes.js";
import technicianWalletRoutes from "./Routes/technicianWalletRoutes.js";
import DevRoutes from "./Routes/dev.js";

const App = express();

// Set static folder
App.use(express.static("public"));

// Global Middlewares
App.use(cors());
App.use(bodyParser.json());
App.use(bodyParser.urlencoded({ extended: true }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: "Too many requests from this IP",
});
App.use("/api", limiter);

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Socket.IO Setup with HTTP Server
const httpServer = createServer(App);
// Ensure req.ip works behind proxies (Render/Nginx/etc.)
// Set TRUST_PROXY=true/1 in production if you're behind a reverse proxy.
const trustProxyEnv = process.env.TRUST_PROXY;
const trustProxy =
  typeof trustProxyEnv === "string"
    ? trustProxyEnv === "true" || trustProxyEnv === "1"
    : (process.env.NODE_ENV === "production" ? 1 : false);
App.set("trust proxy", trustProxy);

// 🔌 Initialize Socket.IO
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Redis Adapter Setup
// const pubClient = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" });
// const subClient = pubClient.duplicate();

// Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
//   io.adapter(createAdapter(pubClient, subClient));
//   console.log("✅ Socket.IO Redis Adapter connected");
// }).catch(err => {
//   console.error("❌ Redis Adapter Connection Failed:", err.message);
// });

// Socket.IO Middleware & Connection Handler
io.use(socketAuth);

io.on("connection", (socket) => {
  console.log(`🔌 New connection: ${socket.id} (User: ${socket.user?.userId})`);

  // Auto-join personal rooms based on role
  if (socket.user?.role === "Technician" && socket.user?.technicianProfileId) {
    const room = `technician_${socket.user.technicianProfileId}`;
    socket.join(room);
    console.log(`🏠 Technician joined room: ${room}`);
  }

  // 📍 Location Update Listener (Real-time)
  socket.on("technician:location_update", async (data) => {
    try {
      const technicianProfileId = socket.user?.technicianProfileId;
      if (!technicianProfileId) return;

      const { latitude, longitude } = data;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

      await handleLocationUpdate(technicianProfileId, latitude, longitude, io);
    } catch (err) {
      console.error("Socket Location Update Error:", err.message);
    }
  });

  // 📋 Job Fetch Listener (Real-time)
  socket.on("technician:get_jobs", async () => {
    try {
      const technicianProfileId = socket.user?.technicianProfileId;
      if (!technicianProfileId) return;

      // We'll use the internal logic from the controller but adapt for socket
      const jobs = await fetchTechnicianJobsInternal(technicianProfileId);
      socket.emit("technician:jobs_list", jobs);
    } catch (err) {
      console.error("Socket Get Jobs Error:", err.message);
    }
  });

  socket.on("disconnect", () => {
    console.log(`🔌 Disconnected: ${socket.id}`);
  });
});

import { handleLocationUpdate } from "./Utils/technicianLocation.js";
import { fetchTechnicianJobsInternal } from "./Utils/technicianJobFetch.js";

// Middleware to attach io to all requests
App.use((req, res, next) => {
  req.io = io;
  next();
});

App.use(cors());
// ✅ Single JSON parser with rawBody capture (needed for payment webhooks)
App.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf?.toString("utf8");
    },
  })
);
App.use(bodyParser.urlencoded({ extended: true }));
App.use(express.static("public"));

// 🔒 Security Note: XSS and NoSQL injection protection is handled via:
// - Comprehensive input validation in all controllers
// - ObjectId validation on all routes
// - Strict regex patterns for email, mobile, names
// - Type checking and sanitization

// 🔒 General API Rate Limiter (applies to all routes)
const getClientIp = (req) => {
  const xff = req.headers?.["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
  if (req.ip) return req.ip;
  return req.socket?.remoteAddress || "unknown";
};

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  //sk
  max: 1000, // 1000 requests per window (increased for development)
  message: {
    success: false,
    message: "Too many requests, please try again later",
    result: {},
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Don't crash the process if req.ip is temporarily unavailable (e.g. aborted connections)
  validate: { ip: false },
  keyGenerator: (req) => getClientIp(req),
  // Socket.IO uses its own transport endpoints; don't rate-limit those via Express
  skip: (req) => typeof req.path === "string" && req.path.startsWith("/socket.io"),
});

App.use(generalLimiter);

// 🔥 Global Timeout Middleware (Fix Flutter timeout)
App.use((req, res, next) => {
  res.setTimeout(60000, () => {
    console.log("⏳ Request timed out");
    return res.status(408).json({
      success: false,
      message: "Request timeout",
      result: "Request took too long to process",
    });
  });
  next();
});

mongoose.set("strictQuery", false);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB Atlas..."))
  .catch((err) => console.error("Could not connect to MongoDB...", err));

App.get("/", (req, res) => {
  res.send("welcome");
});

// Routes
App.use("/api/user", UserRoutes);
App.use("/api/technician", TechnicianRoutes);
App.use("/api/addresses", AddressRoutes);
App.use("/api/admin", adminWalletRoutes);
App.use("/api/dev", DevRoutes);

// ❗ GLOBAL ERROR HANDLER (MUST BE LAST)
App.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);
  if (err && (err.type === "entity.parse.failed" || err.status === 400)) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON body",
      result: {},
    });
  }
  const statusCode = err.statusCode || err.status || 500;
  return res.status(statusCode).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

const port = process.env.PORT || 7372;
httpServer.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`🔌 Socket.IO ready for real-time notifications`);
});

