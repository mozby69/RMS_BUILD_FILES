"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    // Default admin password
    const hashedPassword = await bcryptjs_1.default.hash("123456", 10);
    // Seed default Admin user
    await prisma.user.upsert({
        where: { email: "admin@example.com" },
        update: {},
        create: {
            name: "Super Admin",
            email: "admin@example.com",
            username: "admin",
            password: hashedPassword,
            role: client_1.Role.Admin,
            position: "System Administrator",
            approver: true,
        },
    });
    // Seed default regular User
    await prisma.user.upsert({
        where: { email: "user@example.com" },
        update: {},
        create: {
            name: "Default User",
            email: "user@example.com",
            username: "user",
            password: await bcryptjs_1.default.hash("user123", 10),
            role: client_1.Role.User,
            position: "Staff",
        },
    });
    console.log("🌱 Seeding complete!");
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
