"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = __importDefault(require("socket.io"));
const path_1 = __importDefault(require("path"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes")); // your routes
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
// --- Allowed Origins ---
const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL || "http://192.168.1.180:3000",
    "https://jgccorporatesolutions.com",
    "http://jgccorporatesolutions.com",
    "http://10.0.2.2:5000",
    "http://192.168.1.180:5000",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://192.168.1.24:8000",
    "http://192.168.1.24:3000",
];
// --- Middlewares ---
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || origin.startsWith("exp://")) {
            callback(null, true);
        }
        else {
            console.warn("❌ Blocked by CORS:", origin);
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true,
}));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.urlencoded({ extended: true }));
// --- Static uploads ---
app.use("/uploads", express_1.default.static(path_1.default.join(__dirname, "../uploads")));
const io = (0, socket_io_1.default)(server, {
    path: "/socket.io/",
    transports: ["websocket", "polling"],
    pingTimeout: 60000,
    pingInterval: 25000,
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true,
    },
    allowEIO3: true, // ✅ Works fine at runtime
});
// attach io to app (so controllers can use it)
app.set("io", io);
io.on("connection", (socket) => {
    console.log("✅ Client connected:", socket.id);
    // Listen for join
    socket.on("join", ({ userId }) => {
        const room = `user_${userId}`;
        socket.join(room);
        console.log(`👤 User ${userId} joined room ${room}`);
    });
    // Listen for disconnect
    socket.on("disconnect", () => {
        console.log("❌ Client disconnected:", socket.id);
    });
});
// --- API Routes ---
app.use("/api", auth_routes_1.default);
// --- ✅ Test route ---
app.get("/api/test-sms", (req, res) => {
    io.emit("new_sms", {
        number: "+639764721830",
        message: "Hello from Node.js",
    });
    console.log("📡 Emitted 'new_sms' to all clients");
    res.json({ ok: true });
});
// --- Start server ---
const PORT = 5000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
});
