"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchBranchSuppliers = exports.saveNewSupplier = exports.fetchBranchDocumentNumber = exports.updateSmsNotification = exports.readAllNotification = exports.readNotification = exports.fetchUserNotification = exports.fetchUserLogs = exports.deleteRequestType = exports.fetchListRequestTypes = exports.getRequestTypeById = exports.getCoordinatorDailyReport = exports.updateRequestType = exports.addRequestType = exports.deleteBranch = exports.updateBranch = exports.fetchBranches = exports.addBranch = void 0;
const client_1 = require("@prisma/client");
const request_schema_1 = require("../../lib/request.schema");
const idConverter_1 = require("../../utils/idConverter");
const prisma = new client_1.PrismaClient();
const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
};
const addBranch = async (req, res) => {
    const { branchCode, branchName, telephone, coordinatorId, bfomId, address, companyName } = req.body;
    try {
        const existing = await prisma.branch.findUnique({ where: { branchCode } });
        if (existing)
            return res.status(400).json({ message: 'Name already exists' });
        const branches = await prisma.branch.create({
            data: { branchCode: "temp",
                branchName,
                telephone,
                coordinatorId,
                bfomId,
                address,
                companyName
            },
        });
        // Step 2: Generate proper reference code
        const referenceCode = (0, idConverter_1.formatRefId)(branches.id, "EMB", 6);
        // Step 3: Update the record
        const updateRefCOde = await prisma.branch.update({
            where: { id: branches.id },
            data: { branchCode: referenceCode },
        });
        const io = req.app.get("io"); // Get Socket.IO instance from Express
        io.emit("notification", {
            message: `✅ Branch "${branches.branchCode}" added successfully!`,
        });
        return res.status(201).json({
            message: 'Branch created',
            checker: {
                branchCode: branches.branchCode,
            }
        });
    }
    catch (err) {
        console.error("Error adding checker:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.addBranch = addBranch;
const fetchBranches = async (req, res) => {
    try {
        const branch = await prisma.branch.findMany({
            include: {
                coordinator: { select: { name: true, position: true } },
                bfom: { select: { name: true, position: true } }
            },
            orderBy: { id: "asc" }
        });
        res.status(200).json(branch);
    }
    catch (error) {
        console.error("Error fetching branches:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.fetchBranches = fetchBranches;
const updateBranch = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { branchCode, branchName, coordinatorId, bfomId, telephone, address, companyName } = req.body;
        if (isNaN(id))
            return res.status(400).json({ error: 'Invalid ID' });
        const io = req.app.get('io'); // 🔁 Get Socket.IO instance
        const updated = await prisma.branch.update({
            where: { id },
            data: { branchCode, branchName, coordinatorId, bfomId, telephone, address, companyName },
        });
        // 🔁 Notify all clients that the checker was updated
        io.emit("notification", {
            message: `✅ Update "${id}"  successfully!`,
        });
        return res.status(200).json({ message: 'Branch updated', data: updated });
    }
    catch (error) {
        console.error('Update error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
};
exports.updateBranch = updateBranch;
const deleteBranch = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: 'Invalid ID' });
        const io = req.app.get("io"); // ✅ Good: get io instance from app
        const deleted = await prisma.branch.delete({
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
exports.deleteBranch = deleteBranch;
// Request type 
const addRequestType = async (req, res) => {
    try {
        // 🔍 Validate request body
        const body = request_schema_1.requestTypeSchema.parse(req.body);
        // 🔍 Check for duplicates
        const existing = await prisma.requestType.findUnique({
            where: { requestName: body.requestName },
        });
        if (existing) {
            return res.status(400).json({ message: "Request name already exists" });
        }
        const requestType = await prisma.requestType.create({
            data: body,
        });
        const io = req.app.get("io");
        io.emit("notification", {
            message: `✅ Request Type "${requestType.requestName}" added successfully!`,
        });
        return res.status(201).json({
            message: "Request Type created",
            request: requestType,
        });
    }
    catch (err) {
        if (err.name === "ZodError") {
            return res.status(400).json({
                message: "Validation failed1",
                errors: err.errors,
            });
        }
        console.error("Error adding request type:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.addRequestType = addRequestType;
const updateRequestType = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: "Invalid ID" });
        const body = request_schema_1.updateRequestTypeSchema.parse(req.body);
        const updated = await prisma.requestType.update({
            where: { id },
            data: body,
        });
        const io = req.app.get("io");
        io.emit("notification", {
            message: `✅ Request Type "${updated.requestName}" updated successfully!`,
        });
        return res.status(200).json({
            message: "Request Type updated",
            request: updated,
        });
    }
    catch (err) {
        if (err.name === "ZodError") {
            return res.status(400).json({
                message: "Validation failed",
                errors: err.errors,
            });
        }
        console.error("Error updating request type:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.updateRequestType = updateRequestType;
const getCoordinatorDailyReport = async (req, res) => {
    try {
        const userId = req.user?.id;
        // ✅ Get current date range (start → end of today)
        const now = new Date();
        const startOfDay = new Date(now.setHours(0, 0, 0, 0));
        const endOfDay = new Date(now.setHours(23, 59, 59, 999));
        if (!userId)
            return res.status(400).json({ message: "User does not exist!!" });
        const report = await prisma.mainRequest.findMany({
            where: {
                requestFrom: {
                    coordinatorId: userId
                },
                requestDate: {
                    gte: startOfDay,
                    lte: endOfDay,
                }
            },
            include: {
                approval: {
                    include: {
                        approver: {
                            select: {
                                name: true,
                                position: true,
                                signatureUrl: true,
                            },
                        },
                    },
                },
                requestBy: { select: { id: true, name: true, position: true, branchId: true, signatureUrl: true } },
                requestFrom: true,
                requestType: {
                    select: {
                        id: true,
                        requestName: true,
                        checkedBy: { select: { id: true, name: true, position: true, signatureUrl: true } },
                        checkedBy2: { select: { id: true, name: true, position: true, signatureUrl: true } },
                        checkedBy3: { select: { id: true, name: true, position: true, signatureUrl: true } },
                        recomApproval: { select: { id: true, name: true, position: true, signatureUrl: true } },
                        recomApproval2: { select: { id: true, name: true, position: true, signatureUrl: true } },
                        approveBy: { select: { id: true, name: true, position: true, signatureUrl: true } },
                        approveBy2: { select: { id: true, name: true, position: true, signatureUrl: true } },
                    },
                },
                fundTransfer: { include: { requestTo: { select: { id: true, name: true, position: true } } } },
                transmittalMemo: { include: { requestTo: { select: { id: true, name: true, position: true } } } },
                disburse: { include: { requestTo: { select: { id: true, name: true, position: true } } } },
                asStated: { include: { AsStatedImg: true } },
                countSheet: { include: { TravelCountSheet: true, CashCountSheet: true } },
                travelOrder: true,
                proposedBudget: true,
                formPastDueEndorsement: true,
                formFSMTravelLiquidation: true,
                formWeeklyItineraryDeviation: true,
                formFSMItinerary: true,
                formTravelOrderLiquidation: true,
                formPreSign: { include: { requestTo: { select: { id: true, name: true, position: true } } } },
                OSRequisitionForm: {
                    include: {
                        requestTo: {
                            select: { id: true, name: true, position: true },
                        },
                        OSInventoryForm: true,
                    },
                },
                formOSPurchasing: true,
                logs: true,
            },
        });
        return res.status(200).json(report);
    }
    catch (e) {
        console.error("Fetch coordinator daily report err:", e);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.getCoordinatorDailyReport = getCoordinatorDailyReport;
const getRequestTypeById = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const type = await prisma.requestType.findUnique({
            where: { id },
            include: {
                checkedBy: true,
                checkedBy2: true,
                checkedBy3: true,
                checkedBy4: true,
                recomApproval: true,
                recomApproval2: true,
                approveBy: true,
                approveBy2: true,
            },
        });
        if (!type)
            return res.status(404).json({ message: "Not found" });
        return res.json({ data: type });
    }
    catch (e) {
        console.error("getRequestTypeById error:", e);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.getRequestTypeById = getRequestTypeById;
const fetchListRequestTypes = async (_req, res) => {
    try {
        const types = await prisma.requestType.findMany({
            orderBy: { requestName: "asc" },
            include: {
                checkedBy: { select: { id: true, name: true, initial: true, position: true } },
                checkedBy2: { select: { id: true, name: true, initial: true, position: true } },
                checkedBy3: { select: { id: true, name: true, initial: true, position: true } },
                checkedBy4: { select: { id: true, name: true, initial: true, position: true } },
                recomApproval: { select: { id: true, name: true, initial: true, position: true } },
                recomApproval2: { select: { id: true, name: true, initial: true, position: true } },
                approveBy: { select: { id: true, name: true, initial: true, position: true } },
                approveBy2: { select: { id: true, name: true, initial: true, position: true } },
            },
        });
        return res.json({ data: types });
    }
    catch (e) {
        console.error("listRequestTypes error:", e);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.fetchListRequestTypes = fetchListRequestTypes;
const deleteRequestType = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: 'Invalid ID' });
        const io = req.app.get("io");
        const deleted = await prisma.requestType.delete({
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
exports.deleteRequestType = deleteRequestType;
const fetchUserLogs = async (req, res) => {
    try {
        const userId = toNum(req.user?.id);
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const logs = await prisma.requestLogs.findMany({
            include: {
                mainRequest: true,
            },
            orderBy: { id: "desc" },
            where: { approverId: Number(userId) },
        });
        res.status(200).json(logs);
    }
    catch (error) {
        console.error("Error fetching logs:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.fetchUserLogs = fetchUserLogs;
const fetchUserNotification = async (req, res) => {
    try {
        const userId = toNum(req.user?.id);
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        // Get all notifications
        const logs = await prisma.notification.findMany({
            orderBy: { id: "desc" },
            where: { receiverID: userId },
        });
        // Count unread (in same query or separate one)
        const unreadCount = await prisma.notification.count({
            where: { receiverID: userId, read: false },
        });
        res.status(200).json({
            notifications: logs,
            unreadCount,
        });
    }
    catch (error) {
        console.error("Error fetching logs:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.fetchUserNotification = fetchUserNotification;
const readNotification = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: 'Invalid ID' });
        const updateRead = await prisma.notification.update({
            where: { id },
            data: { read: true }
        });
        return res.status(201).json({
            message: "Notification updated successfully",
            request: updateRead.id,
        });
    }
    catch (error) {
        console.error("Error updating logs:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.readNotification = readNotification;
const readAllNotification = async (req, res) => {
    try {
        const userId = toNum(req.user?.id);
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const updateRead = await prisma.notification.updateMany({
            where: { receiverID: userId },
            data: { read: true }
        });
        return res.status(201).json({
            message: "Notification updated successfully",
            request: userId,
        });
    }
    catch (error) {
        console.error("Error updating logs:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.readAllNotification = readAllNotification;
const updateSmsNotification = async (req, res) => {
    try {
        const { id } = req.params;
        const { smsNotification } = req.body;
        if (typeof smsNotification !== "boolean") {
            return res.status(400).json({ error: "sms Notification must be a boolean" });
        }
        const user = await prisma.user.update({
            where: { id: Number(id) },
            data: { smsNotification },
        });
        return res.status(200).json({
            message: `✅ SMS notification updated for user ${user.name}`,
        });
    }
    catch (error) {
        console.error("Error updating sms notification:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.updateSmsNotification = updateSmsNotification;
// xyryl
const fetchBranchDocumentNumber = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ message: "Invalid branch ID" });
        }
        const branch = await prisma.branch.findUnique({
            where: { id: Number(id) },
            select: { document_number: true },
        });
        if (!branch) {
            return res.status(404).json({ message: "Branch not found" });
        }
        res.status(200).json(branch);
    }
    catch (error) {
        console.error("Error fetching branch document number:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.fetchBranchDocumentNumber = fetchBranchDocumentNumber;
const saveNewSupplier = async (req, res) => {
    try {
        const userId = toNum(req.user?.id);
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const { branchId, supplier_name, supplier_address } = req.body ?? {};
        if (!branchId) {
            return res.status(400).json({ message: "Branch is required" });
        }
        // ✅ Fetch existing supplier list
        const branch = await prisma.branch.findUnique({
            where: { id: Number(branchId) },
            select: { supplier_list: true },
        });
        // Convert JSON to array or start with an empty one
        const existingSuppliers = Array.isArray(branch?.supplier_list)
            ? branch.supplier_list
            : [];
        // ✅ Add new supplier
        const newSupplier = {
            supplier_name,
            supplier_address,
            created_at: new Date(),
        };
        const updatedSuppliers = [...existingSuppliers, newSupplier];
        // ✅ Update branch supplier_list JSON
        await prisma.branch.update({
            where: { id: Number(branchId) },
            data: {
                supplier_list: updatedSuppliers,
            },
        });
        res.status(201).json({ message: "Supplier added successfully" });
    }
    catch (error) {
        console.error("save supplier error:", error);
        res.status(500).json({ message: "Error occurred while saving supplier" });
    }
};
exports.saveNewSupplier = saveNewSupplier;
// controller
const fetchBranchSuppliers = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ message: "Invalid branch ID" });
        }
        const branch = await prisma.branch.findUnique({
            where: { id: Number(id) },
            select: { supplier_list: true },
        });
        const suppliers = Array.isArray(branch?.supplier_list)
            ? branch.supplier_list
            : [];
        res.status(200).json(suppliers);
    }
    catch (error) {
        console.error("Error fetching suppliers:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.fetchBranchSuppliers = fetchBranchSuppliers;
