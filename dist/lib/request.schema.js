"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserSchema = exports.registerSchema = exports.RoleEnum = exports.updateRequestTypeSchema = exports.requestTypeSchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
exports.requestTypeSchema = zod_1.z.strictObject({
    requestName: zod_1.z.string().min(1, "Request name is required"),
    checkedById: zod_1.z.number().nullable(),
    checkedBy2Id: zod_1.z.number().nullable(),
    checkedBy3Id: zod_1.z.number().nullable(),
    checkedBy4Id: zod_1.z.number().nullable(),
    recomApprovalId: zod_1.z.number().nullable(),
    recomApproval2Id: zod_1.z.number().nullable(),
    approveById: zod_1.z.number().nullable(),
    approveBy2Id: zod_1.z.number().nullable(),
});
exports.updateRequestTypeSchema = exports.requestTypeSchema.partial().extend({
    id: zod_1.z.number().int().positive().optional(),
    createdAt: zod_1.z.string().optional(),
    updateAt: zod_1.z.string().optional(),
});
exports.RoleEnum = zod_1.z.nativeEnum(client_1.Role);
exports.registerSchema = zod_1.z.strictObject({
    id: zod_1.z.number().optional(),
    name: zod_1.z.string().min(2),
    email: zod_1.z.string().optional(),
    username: zod_1.z.string().min(1),
    password: zod_1.z.string().min(6),
    role: exports.RoleEnum.default("User"),
    branchId: zod_1.z.coerce.number().optional(),
    approver: zod_1.z.coerce.boolean().default(false),
    position: zod_1.z.string().optional(),
    initial: zod_1.z.string().optional(),
    phoneNumber: zod_1.z.string().max(11).optional(),
});
exports.updateUserSchema = exports.registerSchema.partial().extend({
    id: zod_1.z.number().int().positive().optional(),
    password: zod_1.z.string().optional(),
    email: zod_1.z.string().optional(),
    createdAt: zod_1.z.string().optional(),
    updateAt: zod_1.z.string().optional(),
});
