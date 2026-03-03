import jwt from "jsonwebtoken";

export const socketAuth = (socket, next) => {
    try {
        const token =
            socket.handshake.auth?.token || socket.handshake.query?.token;

        if (!token) {
            return next(new Error("Authentication error: Token required"));
        }

        // Verify JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded; // Attach user to socket
        next();
    } catch (err) {
        return next(new Error("Authentication error: Invalid token"));
    }
};
