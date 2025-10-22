"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.updateUser = exports.listUsers = exports.logout = exports.me = exports.login = exports.register = void 0;
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const request_schema_1 = require("../lib/request.schema");
const zod_1 = __importDefault(require("zod"));
const prisma = new client_1.PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;
const register = async (req, res) => {
    try {
        // Parse and coerce body
        const parsed = request_schema_1.registerSchema.parse({
            ...req.body,
            approver: req.body.approver,
            branchId: req.body.branchId,
        });
        console.log("Parsed Zod data:", parsed);
        // Validate uniqueness
        if (parsed.email) {
            const existing = await prisma.user.findUnique({ where: { email: parsed.email } });
            if (existing)
                return res.status(400).json({ message: "Email already exists" });
        }
        const existingUsername = await prisma.user.findUnique({
            where: { username: parsed.username },
        });
        if (existingUsername)
            return res.status(400).json({ message: "Username already exists" });
        // Optional file
        const signatureUrl = req.file
            ? `${process.env.APP_URL}/uploads/${req.file.filename}`
            : null;
        const hashed = await bcryptjs_1.default.hash(parsed.password, 10);
        const user = await prisma.user.create({
            data: {
                name: parsed.name.trim(),
                email: parsed.email?.trim() ? parsed.email.trim() : null,
                username: parsed.username.trim(),
                password: hashed,
                role: parsed.role,
                branchId: parsed.branchId ?? null,
                approver: parsed.approver,
                position: parsed.position ?? null,
                initial: parsed.initial ?? null,
                phoneNumber: parsed.phoneNumber ?? null,
                signatureUrl,
            },
        });
        res.status(201).json({
            message: "Account created successfully",
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                role: user.role,
            },
        });
    }
    catch (err) {
        console.error("Register error:", err);
        res.status(400).json({ message: "Invalid data", error: err });
    }
};
exports.register = register;
const login = async (req, res) => {
    const { username, password } = req.body;
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await bcryptjs_1.default.compare(password, user.password)))
        return res.status(401).json({ message: 'Invalid credentials' });
    const token = jsonwebtoken_1.default.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, {
        httpOnly: true,
        secure: false, // set to true in production with HTTPS
        sameSite: 'lax',
        maxAge: 86400000,
    });
    res.json({ message: 'Login successful', user: { id: user.id, email: user.email, name: user.name } });
};
exports.login = login;
const me = async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            name: true,
            email: true,
            username: true,
            position: true,
            initial: true,
            role: true,
            signatureUrl: true,
            smsNotification: true,
            approver: true,
            branch: {
                select: {
                    id: true,
                    branchCode: true,
                    branchName: true,
                    companyName: true,
                    telephone: true,
                    address: true,
                    coordinatorId: true,
                    createdAt: true,
                    updateAt: true,
                    coordinator: {
                        select: {
                            name: true,
                            position: true,
                        },
                    },
                },
            },
        },
    });
    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(user);
};
exports.me = me;
const logout = (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: false, // change to true in production (HTTPS)
        sameSite: 'lax',
    });
    res.json({ message: 'Logged out successfully' });
};
exports.logout = logout;
const listUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                email: true,
                username: true,
                role: true,
                branchId: true,
                initial: true,
                phoneNumber: true,
                position: true,
                approver: true,
                signatureUrl: true,
                createdAt: true,
                updateAt: true,
                branch: true
            },
        });
        res.status(200).json(users);
    }
    catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.listUsers = listUsers;
const updateUser = async (req, res) => {
    try {
        const userId = Number(req.params.id);
        if (!userId)
            return res.status(400).json({ message: "Invalid user ID" });
        const parsed = request_schema_1.updateUserSchema.parse(req.body);
        const existing = await prisma.user.findUnique({
            where: {
                id: userId
            },
        });
        if (!existing)
            return res.status(404).json({ message: "User not found" });
        const updateData = { ...parsed };
        if (parsed.password && parsed.password.trim() !== "") {
            updateData.password = await bcryptjs_1.default.hash(parsed.password, 10);
        }
        else {
            delete updateData.password;
        }
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                name: true,
                email: true,
                username: true,
                role: true,
                approver: true,
                branchId: true,
                position: true,
                phoneNumber: true,
                initial: true,
                createdAt: true,
                updateAt: true,
            },
        });
        return res.status(200).json({
            message: "User updated successfully",
            user: updatedUser,
        });
    }
    catch (e) {
        console.error("Error updating user:", e);
        if (e instanceof zod_1.default.ZodError) {
            return res.status(400).json({ message: "Validation error", errors: e.message });
        }
        return res.status(500).json({ message: "Internal server error", error: e });
    }
};
exports.updateUser = updateUser;
const deleteUser = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: 'Invalid ID' });
        const io = req.app.get("io"); // ✅ Good: get io instance from app
        const deleted = await prisma.user.delete({
            where: { id },
        });
        io.emit("notification", {
            message: `✅ Deleted "${id}" added successfully!`,
        });
        return res.status(200).json({
            message: 'Deleted successfully',
            data: deleted,
        });
    }
    catch (error) {
        console.error('Delete error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
};
exports.deleteUser = deleteUser;
