"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyApprover = notifyApprover;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function notifyApprover(io, approverId, message) {
    // Find approver
    const approver = await prisma.user.findUnique({ where: { id: approverId } });
    if (!approver)
        return console.warn(`Approver ${approverId} not found.`);
    // Skip if no phone or SMS notifications disabled
    if (!approver.phoneNumber || !approver.smsNotification)
        return;
    // 1️⃣ Save to SMS queue (for your SMS gateway to pick up)
    await prisma.sMSQueue.create({
        data: {
            number: approver.phoneNumber,
            message,
        },
    });
    // 2️⃣ Emit to connected SMS service (your RN Socket listener)
    io.emit("new_sms", {
        number: approver.phoneNumber,
        message,
    });
    console.log(`📲 SMS queued for ${approver.phoneNumber}`);
}
