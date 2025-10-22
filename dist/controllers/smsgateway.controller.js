"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSMS = void 0;
const sendSMS = async (req, res) => {
    try {
        const { number, message } = req.body;
        // ✅ Basic validation
        if (!number || !message) {
            return res.status(400).json({ message: "Number and message are required." });
        }
        // ✅ Emit the socket event
        const io = req.app.get("io"); // Socket.IO instance from your index.ts
        io.emit("new_sms", { number, message });
        console.log(`📤 SMS job emitted: ${number} → ${message}`);
        return res.status(200).json({
            success: true,
            message: "SMS job sent to gateway.",
            data: { number, message },
        });
    }
    catch (err) {
        console.error("❌ Error sending SMS:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.sendSMS = sendSMS;
