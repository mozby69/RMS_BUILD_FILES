"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveOSPurchasing = exports.saveTravelOrderLiquidation = exports.saveFMSItinerary = exports.saveWeeklyItineraryDeviation = exports.saveFSMTravelLiquidation = exports.savePastDueEndorsement = exports.savePreSign = exports.saveFFEPurchasing = exports.saveOSRequisition = exports.getRequestsByUserStatus = exports.saveTransmittalMemo = exports.saveProposeBudgetForm = exports.saveTravelOrderForm = exports.approveRequest = exports.addFundTransfer = void 0;
const client_1 = require("@prisma/client");
const idConverter_1 = require("../../utils/idConverter");
const notifyApprover_1 = require("../../utils/notifyApprover");
const prisma = new client_1.PrismaClient();
const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
};
const addFundTransfer = async (req, res) => {
    try {
        const userId = toNum(req.user?.id);
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const { requestContent, requestDate, requestFromId, requestTypeId, requestToId, approvers } = req.body ?? {};
        if (!requestContent || !requestFromId || !requestTypeId || !approvers?.length) {
            return res.status(400).json({ message: "Missing required fields1" });
        }
        // Step 1: Create Main Request
        const created = await prisma.mainRequest.create({
            data: {
                requestDate: requestDate ? new Date(requestDate) : new Date(),
                requestType: { connect: { id: Number(requestTypeId) } },
                requestFrom: { connect: { id: Number(requestFromId) } },
                referenceCode: "temp",
                requestBy: { connect: { id: userId } },
                fundTransfer: {
                    create: {
                        requestContent,
                        requestToId,
                    },
                },
            },
            include: { fundTransfer: true, requestType: true },
        });
        // Step 2: Save approvers in ApprovalTable
        await prisma.approvalTable.createMany({
            data: approvers
                .filter(a => a.id)
                .map((a, idx) => ({
                mainRequestID: created.id,
                approverId: a.id,
                sequence: idx + 1,
                roleType: a.roleType,
                status: "PENDING",
                isActive: idx === 0,
            })),
        });
        // Step 3: Generate proper reference code
        const referenceCode = (0, idConverter_1.formatRefId)(created.id, "REF", 6);
        const updated = await prisma.mainRequest.update({
            where: { id: created.id },
            data: { referenceCode },
        });
        // Step 4: Log submission
        await prisma.requestLogs.create({
            data: {
                mainRequestID: created.id,
                approverId: userId,
                checkerType: "Fund Transfer",
                action: "Submit Request",
                remarks: `You have submitted a Fund Transfer request with ref no. ${referenceCode}.`
            },
        });
        // Step 5: Notify first approver
        const firstApprover = approvers[0]?.id ?? null;
        if (firstApprover) {
            await prisma.notification.create({
                data: {
                    mainRequestID: created.id,
                    senderID: userId,
                    receiverID: firstApprover,
                    message: `New Fund Transfer request with ref no. ${updated.referenceCode} requires your approval.`,
                    type: "REQUEST_SENT",
                },
            });
            const io = req.app.get("io");
            // Socket Notification
            io.to(`user_${firstApprover}`).emit("new_request", {
                receiverId: firstApprover,
                requestId: created.id,
                content: created.fundTransfer?.requestContent,
            });
            // SMS Notification 
            await (0, notifyApprover_1.notifyApprover)(io, firstApprover, `New ${created.requestType?.requestName} request ${updated.referenceCode} requires your approval.`);
        }
        return res.status(201).json({ message: "Created", data: updated });
    }
    catch (err) {
        console.error("Error creating fund transfer:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.addFundTransfer = addFundTransfer;
const approveRequest = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const { id } = req.params;
        const { action, remarks } = req.body; // "APPROVED" | "REJECTED"
        if (!["APPROVED", "REJECTED"].includes(action)) {
            return res.status(400).json({ message: "Invalid action" });
        }
        const current = await prisma.approvalTable.findFirst({
            where: {
                mainRequestID: Number(id),
                approverId: userId,
                isActive: true,
                status: "PENDING",
            },
            include: {
                mainRequest: {
                    include: {
                        requestBy: { select: { id: true, name: true } },
                        requestType: { select: { id: true, requestName: true } },
                    },
                },
            },
        });
        if (!current)
            return res.status(403).json({ message: "Not your turn or already approved / rejected" });
        const io = req.app.get("io");
        // Check if the action is reject or approve
        if (action == "REJECTED") {
            // Update approval table 
            await prisma.approvalTable.update({
                where: { id: current.id },
                data: {
                    status: "REJECTED",
                    remarks
                }
            });
            // Update main request 
            await prisma.mainRequest.update({
                where: { id: current.mainRequestID },
                data: {
                    status: "REJECTED",
                    remarks
                }
            });
            // Send notifcation and real time update 
            if (current.mainRequestID && current.mainRequest?.requestById) {
                await prisma.notification.create({
                    data: {
                        mainRequestID: current.mainRequestID,
                        senderID: current.mainRequest.requestById,
                        receiverID: current.mainRequest.requestById,
                        message: `The request for "${current.mainRequest?.requestType?.requestName}" (${current.mainRequest?.referenceCode}) has been rejected.`,
                        type: "REQUEST_REJECTED",
                    },
                });
            }
            io.emit("request_rejected", {
                requestId: current.mainRequest?.requestById,
                actorId: userId, // who rejected
                receiverId: current.mainRequest?.requestById, // who created/requested
                content: "Request was rejected",
            });
            if (current.mainRequest?.requestById) {
                await (0, notifyApprover_1.notifyApprover)(io, current.mainRequest?.requestById, `The request for ${current.mainRequest?.requestType?.requestName} (${current.mainRequest?.referenceCode}) has been rejected.`);
            }
        }
        else {
            // Update approval table 
            await prisma.approvalTable.update({
                where: { id: current.id },
                data: {
                    status: "APPROVED",
                }
            });
            const next = await prisma.approvalTable.findFirst({
                where: {
                    mainRequestID: Number(id),
                    sequence: current.sequence + 1,
                    status: "PENDING"
                }
            });
            if (next) {
                await prisma.approvalTable.update({
                    where: { id: next.id },
                    data: { isActive: true },
                });
                if (next.approverId) {
                    await prisma.notification.create({
                        data: {
                            mainRequestID: Number(id),
                            senderID: userId,
                            receiverID: next.approverId,
                            message: `Request ${current.mainRequest?.referenceCode} is ready for your approval.`,
                            type: "REQUEST_SENT",
                        }
                    });
                    await (0, notifyApprover_1.notifyApprover)(io, next.approverId, `New ${current.mainRequest?.requestType?.requestName} request ${current.mainRequest?.referenceCode} requires your approval.`);
                }
                io.emit("new_request", {
                    receiverId: next.approverId,
                    requestId: Number(id),
                    requestedBy: current.mainRequest?.requestById,
                    content: current.mainRequest?.requestType?.requestName,
                });
            }
            const remainingPending = await prisma.approvalTable.count({
                where: { mainRequestID: Number(id), status: "PENDING" }
            });
            if (remainingPending === 0) {
                await prisma.mainRequest.update({
                    where: { id: Number(id) },
                    data: { status: "APPROVED" }
                });
                if (current.mainRequest?.requestById) {
                    await prisma.notification.create({
                        data: {
                            mainRequestID: Number(id),
                            senderID: userId,
                            receiverID: current.mainRequest?.requestById,
                            message: `The request for "${current.mainRequest?.requestType?.requestName}" (${current.mainRequest?.referenceCode}) has been approved.`,
                            type: "REQUEST_SENT",
                        }
                    });
                }
                io.emit("request_approved", {
                    requestId: current.mainRequest?.requestById,
                    actorId: userId, // who rejected
                    receiverId: current.mainRequest?.requestById, // who created/requested
                    content: "Request was approved",
                });
                if (current.mainRequest?.requestById) {
                    await (0, notifyApprover_1.notifyApprover)(io, current.mainRequest?.requestById, `The request for ${current.mainRequest?.requestType?.requestName} (${current.mainRequest?.referenceCode}) has been approved.`);
                }
            }
        }
        await prisma.requestLogs.create({
            data: {
                approverId: userId,
                checkerType: current.mainRequest?.requestType?.requestName ?? "",
                action: action,
                remarks: `You ${action.toLowerCase()} the ${current.mainRequest?.requestType?.requestName} request with the refrence no. ${current.mainRequest?.referenceCode}`,
                mainRequestID: Number(id),
            }
        });
        return res.json({ message: `Request ${action} successfully` });
    }
    catch (err) {
        console.error("Error approving/rejecting request:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.approveRequest = approveRequest;
const saveTravelOrderForm = async (req, res) => {
    try {
        const userId = toNum(req.user?.id);
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const { name, columnTotals, position, report_to, expenses_allowed, departure_date, destination, current_date, purpose, table_data, requestTypeId, requestFromId, approvers, requestDate } = req.body ?? {};
        if (!requestTypeId) {
            return res.status(400).json({ message: "Missing requestTypeId" });
        }
        const dep = departure_date ? new Date(departure_date) : new Date();
        const cur = current_date ? new Date(current_date) : new Date();
        if (isNaN(dep.getTime()) || isNaN(cur.getTime())) {
            return res.status(400).json({ message: "Invalid date format" });
        }
        // Step 1: Create Main Request
        const created = await prisma.mainRequest.create({
            data: {
                requestDate: requestDate ? new Date(requestDate) : new Date(),
                requestType: { connect: { id: Number(requestTypeId) } },
                requestFrom: { connect: { id: Number(requestFromId) } },
                referenceCode: "temp",
                requestBy: { connect: { id: userId } },
                travelOrder: {
                    create: {
                        name: name || "Unknown",
                        position: position || "Unknown",
                        departure_date: dep,
                        current_date: cur,
                        destination: destination || "Unknown",
                        purpose_of_travel: purpose || "Unknown",
                        table_data: table_data || [],
                        report_to: report_to,
                        expenses_allowed: expenses_allowed,
                        totalsEnabled: columnTotals,
                    },
                },
            },
            include: { travelOrder: true, requestType: true },
        });
        // Step 2: Save approvers in ApprovalTable
        await prisma.approvalTable.createMany({
            data: approvers
                .filter(a => a.id)
                .map((a, idx) => ({
                mainRequestID: created.id,
                approverId: a.id,
                sequence: idx + 1,
                roleType: a.roleType,
                status: "PENDING",
                isActive: idx === 0,
            })),
        });
        // Step 3: Generate proper reference code
        const referenceCode = (0, idConverter_1.formatRefId)(created.id, "REF", 6);
        const updated = await prisma.mainRequest.update({
            where: { id: created.id },
            data: { referenceCode },
        });
        // Step 4: Log submission
        await prisma.requestLogs.create({
            data: {
                mainRequestID: created.id,
                approverId: userId,
                checkerType: "Travel Order",
                action: "Submit Request",
                remarks: `You have submitted a Travel Order request with ref no. ${referenceCode}.`
            },
        });
        // Step 5: Notify first approver
        const firstApprover = approvers[0]?.id ?? null;
        if (firstApprover) {
            await prisma.notification.create({
                data: {
                    mainRequestID: created.id,
                    senderID: userId,
                    receiverID: firstApprover,
                    message: `New Travel Order request with ref no. ${updated.referenceCode} requires your approval.`,
                    type: "REQUEST_SENT",
                },
            });
            const io = req.app.get("io");
            io.to(`user_${firstApprover}`).emit("new_request", {
                receiverId: firstApprover,
                requestId: created.id,
                content: created.travelOrder?.purpose_of_travel,
            });
            // SMS Notification 
            await (0, notifyApprover_1.notifyApprover)(io, firstApprover, `New ${created.requestType?.requestName} request ${updated.referenceCode} requires your approval.`);
        }
        return res.status(201).json({ message: "Created", data: updated });
    }
    catch (error) {
        console.error("saveTravelOrderForm error:", error);
        res.status(500).json({ message: "error occurred" });
    }
};
exports.saveTravelOrderForm = saveTravelOrderForm;
const saveProposeBudgetForm = async (req, res) => {
    try {
        const userId = toNum(req.user?.id);
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const normalizeDecimal = (val) => val === "" || val === undefined ? null : val;
        const { items, requestTypeId: rootTypeId, requestFromId, requestDate, approvers, month_of, admin_exp = [], office_exp = [], unbudgeted_exp = [] } = req.body ?? {};
        const requestTypeId = rootTypeId ?? items?.[0]?.requestTypeId;
        if (!requestTypeId) {
            return res.status(400).json({ message: "Missing requestTypeId" });
        }
        const mapExpenses = (items, type) => items.map((it) => ({
            description: it?.item_description ?? null,
            budget: normalizeDecimal(it?.budget),
            total_expenses: normalizeDecimal(it?.total_expense),
            variance: normalizeDecimal(it?.variance),
            proposed_budget: normalizeDecimal(it?.proposed_budget),
            remarks: it?.remarks ?? null,
            expense_type: type,
            month_of: month_of,
        }));
        const incomingItems = [
            ...mapExpenses(admin_exp, "ADMIN"),
            ...mapExpenses(office_exp, "OFFICE"),
            ...mapExpenses(unbudgeted_exp, "UNBUDGETED"),
        ];
        // Step 1: Create Main Request
        const created = await prisma.mainRequest.create({
            data: {
                requestDate: requestDate ? new Date(requestDate) : new Date(),
                requestType: { connect: { id: Number(requestTypeId) } },
                requestFrom: { connect: { id: Number(requestFromId) } },
                referenceCode: "temp",
                requestBy: { connect: { id: userId } },
                remarks: "proposed budget",
                proposedBudget: {
                    create: incomingItems,
                },
            },
            include: { proposedBudget: true, requestType: true },
        });
        await prisma.approvalTable.createMany({
            data: approvers
                .filter(a => a.id)
                .map((a, idx) => ({
                mainRequestID: created.id,
                approverId: a.id,
                sequence: idx + 1,
                roleType: a.roleType,
                status: "PENDING",
                isActive: idx === 0,
            })),
        });
        // Step 3: Generate proper reference code
        const referenceCode = (0, idConverter_1.formatRefId)(created.id, "REF", 6);
        const updated = await prisma.mainRequest.update({
            where: { id: created.id },
            data: { referenceCode },
        });
        // Step 4: Log submission
        await prisma.requestLogs.create({
            data: {
                mainRequestID: created.id,
                approverId: userId,
                checkerType: "Proposed Budget",
                action: "Submit Request",
                remarks: `You have submitted a Proposed Budget request with ref no. ${referenceCode}.`
            },
        });
        // Step 5: Notify first approver
        const firstApprover = approvers[0]?.id ?? null;
        if (firstApprover) {
            await prisma.notification.create({
                data: {
                    mainRequestID: created.id,
                    senderID: userId,
                    receiverID: firstApprover,
                    message: `New Proposed Budget request with ref no. ${updated.referenceCode} requires your approval.`,
                    type: "REQUEST_SENT",
                },
            });
            const io = req.app.get("io");
            io.to(`user_${firstApprover}`).emit("new_request", {
                receiverId: firstApprover,
                requestId: created.id,
                content: created.proposedBudget?.[0]?.description,
            });
            // SMS Notification 
            await (0, notifyApprover_1.notifyApprover)(io, firstApprover, `New ${created.requestType?.requestName} request ${updated.referenceCode} requires your approval.`);
        }
        return res.status(201).json({ message: "Created", data: updated });
    }
    catch (error) {
        console.error("saveTravelOrderForm error:", error);
        res.status(500).json({ message: "error occurred" });
    }
};
exports.saveProposeBudgetForm = saveProposeBudgetForm;
const saveTransmittalMemo = async (req, res) => {
    try {
        const userId = toNum(req.user?.id);
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const { items_list, date, request_description, request_note, requestTypeId, requestFromId, approvers, requestDate, requestToId } = req.body ?? {};
        if (!requestTypeId) {
            return res.status(400).json({ message: "Missing requestTypeId" });
        }
        const created = await prisma.mainRequest.create({
            data: {
                requestDate: requestDate ? new Date(requestDate) : new Date(),
                requestType: { connect: { id: Number(requestTypeId) } },
                requestFrom: { connect: { id: Number(requestFromId) } },
                referenceCode: "temp",
                requestBy: { connect: { id: userId } },
                transmittalMemo: {
                    create: {
                        date: date ? new Date(date) : new Date(),
                        request_description: request_description || null,
                        request_note: request_note || null,
                        items_list: items_list,
                        requestToId: requestToId,
                    },
                },
            },
            include: { transmittalMemo: true, requestType: true },
        });
        await prisma.approvalTable.createMany({
            data: approvers
                .filter(a => a.id)
                .map((a, idx) => ({
                mainRequestID: created.id,
                approverId: a.id,
                sequence: idx + 1,
                roleType: a.roleType,
                status: "PENDING",
                isActive: idx === 0,
            })),
        });
        // Step 3: Generate proper reference code
        const referenceCode = (0, idConverter_1.formatRefId)(created.id, "REF", 6);
        const updated = await prisma.mainRequest.update({
            where: { id: created.id },
            data: { referenceCode },
        });
        // Step 4: Log submission
        await prisma.requestLogs.create({
            data: {
                mainRequestID: created.id,
                approverId: userId,
                checkerType: "Transmittal Memo",
                action: "Submit Request",
                remarks: `You have submitted a Transmittal Memo request with ref no. ${referenceCode}.`
            },
        });
        // Step 5: Notify first approver
        const firstApprover = approvers[0]?.id ?? null;
        if (firstApprover) {
            await prisma.notification.create({
                data: {
                    mainRequestID: created.id,
                    senderID: userId,
                    receiverID: firstApprover,
                    message: `New Transmittal Memo request with ref no. ${updated.referenceCode} requires your approval.`,
                    type: "REQUEST_SENT",
                },
            });
            const io = req.app.get("io");
            io.to(`user_${firstApprover}`).emit("new_request", {
                receiverId: firstApprover,
                requestId: created.id,
                content: created.transmittalMemo?.request_description,
            });
            // SMS Notification 
            await (0, notifyApprover_1.notifyApprover)(io, firstApprover, `New ${created.requestType?.requestName} request ${updated.referenceCode} requires your approval.`);
        }
        res.status(201).json({ message: "successfully added", created });
    }
    catch (error) {
        console.error("saveTravelOrderForm error:", error);
        res.status(500).json({ message: "error occurred" });
    }
};
exports.saveTransmittalMemo = saveTransmittalMemo;
const getRequestsByUserStatus = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        // --- Query params ---
        const status = req.query.status?.toUpperCase() || "ALL"; // PENDING, APPROVED, REJECTED, ALL
        const page = parseInt(req.query.page || "1", 10);
        const pageSize = parseInt(req.query.pageSize || "10", 10);
        const search = req.query.search || "";
        const branchId = req.query.branchId ? parseInt(req.query.branchId, 10) : undefined;
        const requestId = req.query.id ? parseInt(req.query.id, 10) : undefined;
        const requestDate = req.query.requestDate;
        const mainStatus = req.query.mainStatus?.toUpperCase();
        // --- Build approval filter depending on status ---
        let approvalFilter = { approverId: Number(userId) };
        if (status === "PENDING") {
            approvalFilter = { approverId: Number(userId), isActive: true, status: "PENDING" };
        }
        else if (status === "APPROVED") {
            approvalFilter = { approverId: Number(userId), status: "APPROVED" };
        }
        else if (status === "REJECTED") {
            approvalFilter = { approverId: Number(userId), status: "REJECTED" };
        }
        else {
            approvalFilter = { approverId: Number(userId), isActive: true }; // 👈 add this
        }
        // --- Build base filters ---
        const baseFilters = [
            ...(branchId ? [{ requestFromId: branchId }] : []),
            ...(requestId ? [{ id: requestId }] : []),
            ...(mainStatus ? [{ status: mainStatus }] : []),
            ...(search
                ? [
                    {
                        OR: [
                            { referenceCode: { contains: search, mode: client_1.Prisma.QueryMode.insensitive } },
                            { requestBy: { is: { name: { contains: search, mode: client_1.Prisma.QueryMode.insensitive } } } },
                        ],
                    },
                ]
                : []),
            ...(requestDate
                ? [
                    {
                        requestDate: {
                            gte: new Date(requestDate + "T00:00:00.000Z"),
                            lt: new Date(requestDate + "T23:59:59.999Z"),
                        },
                    },
                ]
                : []),
        ];
        // --- Fetch paginated requests ---
        const requests = await prisma.mainRequest.findMany({
            where: {
                AND: baseFilters,
                OR: [
                    { requestById: Number(userId) }, // ✅ always show if user created it
                    { approval: {
                            some: approvalFilter
                        } }
                ],
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
                formOSPurchasing: true,
                formPreSign: { include: { requestTo: { select: { id: true, name: true, position: true } } } },
                OSRequisitionForm: {
                    include: {
                        requestTo: {
                            select: { id: true, name: true, position: true },
                        },
                        OSInventoryForm: true,
                    },
                },
                FFEPurchasingForm: true,
                logs: true,
            },
            orderBy: { id: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
        // --- Count total ---
        const total = await prisma.mainRequest.count({
            where: { AND: baseFilters },
        });
        return res.json({
            data: requests,
            status,
            pagination: {
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize),
            },
        });
    }
    catch (err) {
        console.error("Error fetching requests by status:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.getRequestsByUserStatus = getRequestsByUserStatus;
const saveOSRequisition = async (req, res) => {
    try {
        const userId = toNum(req.user?.id);
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const { toId, from_name, date, request_description, items, inventory_data = [], requestToId, requestTypeId, requestFromId, approvers, requestDate } = req.body ?? {};
        if (!requestTypeId) {
            return res.status(400).json({ message: "Missing requestTypeId" });
        }
        const created = await prisma.mainRequest.create({
            data: {
                requestDate: requestDate ? new Date(requestDate) : new Date(),
                requestType: { connect: { id: Number(requestTypeId) } },
                requestFrom: { connect: { id: Number(requestFromId) } },
                referenceCode: "temp",
                requestBy: { connect: { id: userId } },
                OSRequisitionForm: {
                    create: {
                        from_name,
                        date: date ? new Date(date) : new Date(),
                        request_description,
                        table_data: items,
                        requestToId: requestToId,
                        OSInventoryForm: {
                            create: inventory_data.map((row) => ({
                                inventory_description: row.inventory_description || null,
                                unit: row.unit || null,
                                beginning: row.beginning || null,
                                ending: row.ending || null,
                                utilized: row.utilized || null,
                                remarks: row.remarks || null,
                                checkbox: row.checkbox ?? false,
                            })),
                        },
                    },
                },
            },
            include: { OSRequisitionForm: true, requestType: true },
        });
        await prisma.approvalTable.createMany({
            data: approvers
                .filter(a => a.id)
                .map((a, idx) => ({
                mainRequestID: created.id,
                approverId: a.id,
                sequence: idx + 1,
                roleType: a.roleType,
                status: "PENDING",
                isActive: idx === 0,
            })),
        });
        // Step 3: Log submission
        await prisma.requestLogs.create({
            data: {
                mainRequestID: created.id,
                approverId: userId,
                checkerType: "OS REQUISITION",
                action: "Submit Request",
            },
        });
        // Step 4: Generate proper reference code
        const referenceCode = (0, idConverter_1.formatRefId)(created.id, "REF", 6);
        const updated = await prisma.mainRequest.update({
            where: { id: created.id },
            data: { referenceCode },
        });
        // Step 5: Notify first approver
        const firstApprover = approvers[0]?.id ?? null;
        if (firstApprover) {
            await prisma.notification.create({
                data: {
                    mainRequestID: created.id,
                    senderID: userId,
                    receiverID: firstApprover,
                    message: `New OS Requisition request with ref no. ${updated.referenceCode} requires your approval.`,
                    type: "REQUEST_SENT",
                },
            });
            const io = req.app.get("io");
            io.to(`user_${firstApprover}`).emit("new_request", {
                receiverId: firstApprover,
                requestId: created.id,
                content: "requisition and inventory",
            });
            // SMS Notification 
            await (0, notifyApprover_1.notifyApprover)(io, firstApprover, `New ${created.requestType?.requestName} request ${updated.referenceCode} requires your approval.`);
        }
        res.status(201).json({ message: "successfully added", created });
    }
    catch (error) {
        console.error("saveTravelOrderForm error:", error);
        res.status(500).json({ message: "error occurred" });
    }
};
exports.saveOSRequisition = saveOSRequisition;
const saveFFEPurchasing = async (req, res) => {
    try {
        const userId = toNum(req.user?.id);
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const { date, document_number, items_list, supplier_list, requestTypeId, requestDate, requestFromId, approvers } = req.body ?? {};
        if (!requestTypeId) {
            return res.status(400).json({ message: "Missing requestTypeId" });
        }
        // Step 1: Create Main Request
        const created = await prisma.mainRequest.create({
            data: {
                requestDate: requestDate ? new Date(requestDate) : new Date(),
                requestType: { connect: { id: Number(requestTypeId) } },
                requestFrom: { connect: { id: Number(requestFromId) } },
                referenceCode: "temp",
                requestBy: { connect: { id: userId } },
                FFEPurchasingForm: {
                    create: {
                        date: date ? new Date(date) : new Date(),
                        items_list: items_list,
                        supplier_list: supplier_list,
                        document_number: Number(document_number),
                    },
                },
            },
            include: { FFEPurchasingForm: true, requestType: true },
        });
        await prisma.branch.update({
            where: { id: Number(requestFromId) },
            data: {
                document_number: Number(document_number),
            },
        });
        await prisma.approvalTable.createMany({
            data: approvers
                .filter(a => a.id)
                .map((a, idx) => ({
                mainRequestID: created.id,
                approverId: a.id,
                sequence: idx + 1,
                roleType: a.roleType,
                status: "PENDING",
                isActive: idx === 0,
            })),
        });
        // Step 3: Generate proper reference code
        const referenceCode = (0, idConverter_1.formatRefId)(created.id, "REF", 6);
        const updated = await prisma.mainRequest.update({
            where: { id: created.id },
            data: { referenceCode },
        });
        // Step 4: Log submission
        await prisma.requestLogs.create({
            data: {
                mainRequestID: created.id,
                approverId: userId,
                checkerType: "FFE PURCHASING",
                action: "Submit Request",
                remarks: `You have submitted a FFE PURCHASING request with ref no. ${referenceCode}.`
            },
        });
        // Step 5: Notify first approver
        const firstApprover = approvers[0]?.id ?? null;
        if (firstApprover) {
            await prisma.notification.create({
                data: {
                    mainRequestID: created.id,
                    senderID: userId,
                    receiverID: firstApprover,
                    message: `New FFE PURCHASING request with ref no. ${updated.referenceCode} requires your approval.`,
                    type: "REQUEST_SENT",
                },
            });
            const io = req.app.get("io");
            io.to(`user_${firstApprover}`).emit("new_request", {
                receiverId: firstApprover,
                requestId: created.id,
                content: created.FFEPurchasingForm?.date,
            });
            // SMS Notification 
            await (0, notifyApprover_1.notifyApprover)(io, firstApprover, `New ${created.requestType?.requestName} request ${updated.referenceCode} requires your approval.`);
        }
        res.status(201).json({ message: "successfully added", created });
    }
    catch (error) {
        console.error("saveTravelOrderForm error:", error);
        res.status(500).json({ message: "error occurred" });
    }
};
exports.saveFFEPurchasing = saveFFEPurchasing;
const savePreSign = async (req, res) => {
    try {
        const userId = toNum(req.user?.id);
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const { date, request_note, request_description, table_data, requestTypeId, requestFromId, requestToId, approvers, requestDate } = req.body ?? {};
        if (!requestTypeId) {
            return res.status(400).json({ message: "Missing requestTypeId" });
        }
        // Step 1: Create Main Request
        const created = await prisma.mainRequest.create({
            data: {
                requestDate: requestDate ? new Date(requestDate) : new Date(),
                requestType: { connect: { id: Number(requestTypeId) } },
                requestFrom: { connect: { id: Number(requestFromId) } },
                referenceCode: "temp",
                requestBy: { connect: { id: userId } },
                formPreSign: {
                    create: {
                        date: date ? new Date(date) : new Date(),
                        request_description: request_description,
                        request_note: request_note,
                        table_data: table_data,
                        requestToId: requestToId,
                    },
                },
            },
            include: { formPreSign: true, requestType: true },
        });
        await prisma.approvalTable.createMany({
            data: approvers
                .filter(a => a.id)
                .map((a, idx) => ({
                mainRequestID: created.id,
                approverId: a.id,
                sequence: idx + 1,
                roleType: a.roleType,
                status: "PENDING",
                isActive: idx === 0,
            })),
        });
        // Step 3: Log submission
        await prisma.requestLogs.create({
            data: {
                mainRequestID: created.id,
                approverId: userId,
                checkerType: "PRE SIGN",
                action: "Submit Request",
            },
        });
        // Step 4: Generate proper reference code
        const referenceCode = (0, idConverter_1.formatRefId)(created.id, "REF", 6);
        const updated = await prisma.mainRequest.update({
            where: { id: created.id },
            data: { referenceCode },
        });
        // Step 5: Notify first approver
        const firstApprover = approvers[0]?.id ?? null;
        if (firstApprover) {
            await prisma.notification.create({
                data: {
                    mainRequestID: created.id,
                    senderID: userId,
                    receiverID: firstApprover,
                    message: `New Pre-sign request with ref no. ${updated.referenceCode} requires your approval.`,
                    type: "REQUEST_SENT",
                },
            });
            const io = req.app.get("io");
            io.to(`user_${firstApprover}`).emit("new_request", {
                receiverId: firstApprover,
                requestId: created.id,
                content: created.formPreSign?.id,
            });
            // SMS Notification 
            await (0, notifyApprover_1.notifyApprover)(io, firstApprover, `New ${created.requestType?.requestName} request ${updated.referenceCode} requires your approval.`);
        }
        return res.status(201).json({ message: "Created", data: updated });
    }
    catch (error) {
        console.error("saveTravelOrderForm error:", error);
        res.status(500).json({ message: "error occurred" });
    }
};
exports.savePreSign = savePreSign;
const savePastDueEndorsement = async (req, res) => {
    try {
        const userId = toNum(req.user?.id);
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const { date_endorsed, id_no, name_of_pensioner, bank, type_of_pension, age, date_in, first_coll_effect, last_transaction, transaction_type, no_of_months_overdue, with_insurance_icod, reason_for_no_insurance, loan_balance_as_of, total_lr, total_ap, reason_for_non_coll_acc, co_maker, relation_to_ssp, contact_number, compromise_payment, payment_start, action_taken, total_udi, total_ide, requestTypeId, requestFromId, approvers, requestDate } = req.body ?? {};
        if (!requestTypeId) {
            return res.status(400).json({ message: "Missing requestTypeId" });
        }
        // Step 1: Create Main Request
        const created = await prisma.mainRequest.create({
            data: {
                requestDate: requestDate ? new Date(requestDate) : new Date(),
                requestType: { connect: { id: Number(requestTypeId) } },
                requestFrom: { connect: { id: Number(requestFromId) } },
                referenceCode: "temp",
                requestBy: { connect: { id: userId } },
                formPastDueEndorsement: {
                    create: {
                        date_endorsed: date_endorsed ? new Date(date_endorsed) : new Date(),
                        id_no: id_no,
                        name_of_pensioner: name_of_pensioner,
                        bank: bank,
                        type_of_pension: type_of_pension,
                        age: age,
                        date_in: date_in ? new Date(date_in) : new Date(),
                        first_coll_effect: first_coll_effect ? new Date(first_coll_effect) : new Date(),
                        last_transaction: last_transaction ? new Date(last_transaction) : new Date(),
                        transaction_type: transaction_type,
                        no_of_months_overdue: no_of_months_overdue,
                        with_insurance_icod: with_insurance_icod,
                        reason_for_no_insurance: reason_for_no_insurance,
                        loan_balance_as_of: loan_balance_as_of ? new Date(loan_balance_as_of) : new Date(),
                        total_lr: total_lr,
                        total_ap: total_ap,
                        total_udi: total_udi,
                        total_ide: total_ide,
                        reason_for_non_coll_acc: reason_for_non_coll_acc,
                        co_maker: co_maker,
                        relation_to_ssp: relation_to_ssp,
                        contact_number: contact_number,
                        compromise_payment: compromise_payment,
                        payment_start: payment_start,
                        action_taken: action_taken,
                    },
                },
            },
            include: { formPastDueEndorsement: true, requestType: true },
        });
        await prisma.approvalTable.createMany({
            data: approvers
                .filter(a => a.id)
                .map((a, idx) => ({
                mainRequestID: created.id,
                approverId: a.id,
                sequence: idx + 1,
                roleType: a.roleType,
                status: "PENDING",
                isActive: idx === 0,
            })),
        });
        const referenceCode = (0, idConverter_1.formatRefId)(created.id, "REF", 6);
        const updated = await prisma.mainRequest.update({
            where: { id: created.id },
            data: { referenceCode },
        });
        // Step 4: Log submission
        await prisma.requestLogs.create({
            data: {
                mainRequestID: created.id,
                approverId: userId,
                checkerType: "Pats Due Endorsement",
                action: "Submit Request",
                remarks: `You have submitted a Past Due Endorsement request with ref no. ${referenceCode}.`
            },
        });
        // Step 5: Notify first approver
        const firstApprover = approvers[0]?.id ?? null;
        if (firstApprover) {
            await prisma.notification.create({
                data: {
                    mainRequestID: created.id,
                    senderID: userId,
                    receiverID: firstApprover,
                    message: `New Past Due Endorsement request with ref no. ${updated.referenceCode} requires your approval.`,
                    type: "REQUEST_SENT",
                },
            });
            const io = req.app.get("io");
            io.to(`user_${firstApprover}`).emit("new_request", {
                receiverId: firstApprover,
                requestId: created.id,
                content: created.formPastDueEndorsement?.name_of_pensioner,
            });
            // SMS Notification 
            await (0, notifyApprover_1.notifyApprover)(io, firstApprover, `New ${created.requestType?.requestName} request ${updated.referenceCode} requires your approval.`);
        }
        return res.status(201).json({ message: "Created", data: updated });
    }
    catch (error) {
        console.error("saveTravelOrderForm error:", error);
        res.status(500).json({ message: "error occurred" });
    }
};
exports.savePastDueEndorsement = savePastDueEndorsement;
const saveFSMTravelLiquidation = async (req, res) => {
    try {
        const userId = toNum(req.user?.id);
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const { name, trip_ticket_number, approved_budget, destination_list, travel_details_list, gas_expense_list, computation_list, computation_date_from, computation_date_to, breakdown_expenses_list, requestTypeId, requestFromId, approvers, requestDate } = req.body ?? {};
        if (!requestTypeId) {
            return res.status(400).json({ message: "Missing requestTypeId" });
        }
        const created = await prisma.mainRequest.create({
            data: {
                requestDate: requestDate ? new Date(requestDate) : new Date(),
                requestType: { connect: { id: Number(requestTypeId) } },
                requestFrom: { connect: { id: Number(requestFromId) } },
                referenceCode: "temp",
                requestBy: { connect: { id: userId } },
                formFSMTravelLiquidation: {
                    create: {
                        name: name,
                        trip_ticket_number: trip_ticket_number,
                        approved_budget: approved_budget,
                        destination_list: destination_list,
                        travel_details_list: travel_details_list,
                        computation_list: computation_list,
                        gas_expense_list: gas_expense_list,
                        computation_date_from: computation_date_from ? new Date(computation_date_from) : new Date(),
                        computation_date_to: computation_date_to ? new Date(computation_date_to) : new Date(),
                        breakdown_expenses_list: breakdown_expenses_list,
                    },
                },
            },
            include: { formFSMTravelLiquidation: true, requestType: true },
        });
        await prisma.approvalTable.createMany({
            data: approvers
                .filter(a => a.id)
                .map((a, idx) => ({
                mainRequestID: created.id,
                approverId: a.id,
                sequence: idx + 1,
                roleType: a.roleType,
                status: "PENDING",
                isActive: idx === 0,
            })),
        });
        const referenceCode = (0, idConverter_1.formatRefId)(created.id, "REF", 6);
        const updated = await prisma.mainRequest.update({
            where: { id: created.id },
            data: { referenceCode },
        });
        // Step 4: Log submission
        await prisma.requestLogs.create({
            data: {
                mainRequestID: created.id,
                approverId: userId,
                checkerType: "FSM TRAVEL LIQUIDATION",
                action: "Submit Request",
                remarks: `You have submitted a FSM Travel Liquidation request with ref no. ${referenceCode}.`
            },
        });
        // Step 5: Notify first approver
        const firstApprover = approvers[0]?.id ?? null;
        if (firstApprover) {
            await prisma.notification.create({
                data: {
                    mainRequestID: created.id,
                    senderID: userId,
                    receiverID: firstApprover,
                    message: `New FSM Travel Liquidation request with ref no. ${updated.referenceCode} requires your approval.`,
                    type: "REQUEST_SENT",
                },
            });
            const io = req.app.get("io");
            io.to(`user_${firstApprover}`).emit("new_request", {
                receiverId: firstApprover,
                requestId: created.id,
                content: created.formFSMTravelLiquidation?.name,
            });
            // SMS Notification 
            await (0, notifyApprover_1.notifyApprover)(io, firstApprover, `New ${created.requestType?.requestName} request ${updated.referenceCode} requires your approval.`);
        }
        return res.status(201).json({ message: "Created", data: updated });
    }
    catch (error) {
        console.error("saveTravelOrderForm error:", error);
        res.status(500).json({ message: "error occurred" });
    }
};
exports.saveFSMTravelLiquidation = saveFSMTravelLiquidation;
const saveWeeklyItineraryDeviation = async (req, res) => {
    try {
        const userId = toNum(req.user?.id);
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const { cur_date, table_data, requestDate, requestFromId, requestTypeId, approvers } = req.body ?? {};
        if (!requestFromId || !requestTypeId || !approvers?.length) {
            return res.status(400).json({ message: "Missing required fields1" });
        }
        // Step 1: Create Main Request
        const created = await prisma.mainRequest.create({
            data: {
                requestDate: requestDate ? new Date(requestDate) : new Date(),
                requestType: { connect: { id: Number(requestTypeId) } },
                requestFrom: { connect: { id: Number(requestFromId) } },
                referenceCode: "temp",
                requestBy: { connect: { id: userId } },
                formWeeklyItineraryDeviation: {
                    create: {
                        cur_date,
                        table_data,
                    },
                },
            },
            include: { formWeeklyItineraryDeviation: true, requestType: true },
        });
        // Step 2: Save approvers in ApprovalTable
        await prisma.approvalTable.createMany({
            data: approvers
                .filter(a => a.id)
                .map((a, idx) => ({
                mainRequestID: created.id,
                approverId: a.id,
                sequence: idx + 1,
                roleType: a.roleType,
                status: "PENDING",
                isActive: idx === 0,
            })),
        });
        // Step 3: Generate proper reference code
        const referenceCode = (0, idConverter_1.formatRefId)(created.id, "REF", 6);
        const updated = await prisma.mainRequest.update({
            where: { id: created.id },
            data: { referenceCode },
        });
        // Step 4: Log submission
        await prisma.requestLogs.create({
            data: {
                mainRequestID: created.id,
                approverId: userId,
                checkerType: "Weekly Itinerary Deviation",
                action: "Submit Request",
                remarks: `You have submitted a Weekly Itinerary Deviation request with ref no. ${referenceCode}.`
            },
        });
        // Step 5: Notify first approver
        const firstApprover = approvers[0]?.id ?? null;
        if (firstApprover) {
            await prisma.notification.create({
                data: {
                    mainRequestID: created.id,
                    senderID: userId,
                    receiverID: firstApprover,
                    message: `Weekly Itinerary Deviation request with ref no. ${updated.referenceCode} requires your approval.`,
                    type: "REQUEST_SENT",
                },
            });
            const io = req.app.get("io");
            io.to(`user_${firstApprover}`).emit("new_request", {
                receiverId: firstApprover,
                requestId: created.id,
                content: created.formWeeklyItineraryDeviation?.cur_date,
            });
            // SMS Notification 
            await (0, notifyApprover_1.notifyApprover)(io, firstApprover, `New ${created.requestType?.requestName} request ${updated.referenceCode} requires your approval.`);
        }
        return res.status(201).json({ message: "Created", data: updated });
    }
    catch (err) {
        console.error("Error creating Weekly Itinerary Deviation:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.saveWeeklyItineraryDeviation = saveWeeklyItineraryDeviation;
const saveFMSItinerary = async (req, res) => {
    try {
        const userId = toNum(req.user?.id);
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const { from_date, to_date, table_data, requestDate, requestFromId, requestTypeId, approvers } = req.body ?? {};
        if (!requestFromId || !requestTypeId || !approvers?.length) {
            return res.status(400).json({ message: "Missing required fields1" });
        }
        const created = await prisma.mainRequest.create({
            data: {
                requestDate: requestDate ? new Date(requestDate) : new Date(),
                requestType: { connect: { id: Number(requestTypeId) } },
                requestFrom: { connect: { id: Number(requestFromId) } },
                referenceCode: "temp",
                requestBy: { connect: { id: userId } },
                formFSMItinerary: {
                    create: {
                        from_date: from_date ? new Date(from_date) : new Date(),
                        to_date: to_date ? new Date(to_date) : new Date(),
                        table_data,
                    },
                },
            },
            include: { formFSMItinerary: true, requestType: true },
        });
        await prisma.approvalTable.createMany({
            data: approvers
                .filter(a => a.id)
                .map((a, idx) => ({
                mainRequestID: created.id,
                approverId: a.id,
                sequence: idx + 1,
                roleType: a.roleType,
                status: "PENDING",
                isActive: idx === 0,
            })),
        });
        const referenceCode = (0, idConverter_1.formatRefId)(created.id, "REF", 6);
        const updated = await prisma.mainRequest.update({
            where: { id: created.id },
            data: { referenceCode },
        });
        await prisma.requestLogs.create({
            data: {
                mainRequestID: created.id,
                approverId: userId,
                checkerType: "FSM Itinerary",
                action: "Submit Request",
                remarks: `You have submitted a FSM Itinerary request with ref no. ${referenceCode}.`
            },
        });
        const firstApprover = approvers[0]?.id ?? null;
        if (firstApprover) {
            await prisma.notification.create({
                data: {
                    mainRequestID: created.id,
                    senderID: userId,
                    receiverID: firstApprover,
                    message: `FSM Itinerary request with ref no. ${updated.referenceCode} requires your approval.`,
                    type: "REQUEST_SENT",
                },
            });
            const io = req.app.get("io");
            io.to(`user_${firstApprover}`).emit("new_request", {
                receiverId: firstApprover,
                requestId: created.id,
                content: created.formFSMItinerary?.from_date,
            });
            // SMS Notification 
            await (0, notifyApprover_1.notifyApprover)(io, firstApprover, `New ${created.requestType?.requestName} request ${updated.referenceCode} requires your approval.`);
        }
        return res.status(201).json({ message: "Created", data: updated });
    }
    catch (err) {
        console.error("Error creating Weekly Itinerary Deviation:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.saveFMSItinerary = saveFMSItinerary;
const saveTravelOrderLiquidation = async (req, res) => {
    try {
        const userId = toNum(req.user?.id);
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const { name, date_covered, purpose, table_data, requestDate, requestFromId, requestTypeId, approvers } = req.body ?? {};
        if (!requestFromId || !requestTypeId || !approvers?.length) {
            return res.status(400).json({ message: "Missing required fields1" });
        }
        const created = await prisma.mainRequest.create({
            data: {
                requestDate: requestDate ? new Date(requestDate) : new Date(),
                requestType: { connect: { id: Number(requestTypeId) } },
                requestFrom: { connect: { id: Number(requestFromId) } },
                referenceCode: "temp",
                requestBy: { connect: { id: userId } },
                formTravelOrderLiquidation: {
                    create: {
                        name: name,
                        date_covered: date_covered ? new Date(date_covered) : new Date(),
                        purpose: purpose,
                        table_data,
                    },
                },
            },
            include: { formTravelOrderLiquidation: true, requestType: true },
        });
        await prisma.approvalTable.createMany({
            data: approvers
                .filter(a => a.id)
                .map((a, idx) => ({
                mainRequestID: created.id,
                approverId: a.id,
                sequence: idx + 1,
                roleType: a.roleType,
                status: "PENDING",
                isActive: idx === 0,
            })),
        });
        const referenceCode = (0, idConverter_1.formatRefId)(created.id, "REF", 6);
        const updated = await prisma.mainRequest.update({
            where: { id: created.id },
            data: { referenceCode },
        });
        await prisma.requestLogs.create({
            data: {
                mainRequestID: created.id,
                approverId: userId,
                checkerType: "Travel Order Liquidation",
                action: "Submit Request",
                remarks: `You have submitted a Travel Order Liquidation request with ref no. ${referenceCode}.`
            },
        });
        const firstApprover = approvers[0]?.id ?? null;
        if (firstApprover) {
            await prisma.notification.create({
                data: {
                    mainRequestID: created.id,
                    senderID: userId,
                    receiverID: firstApprover,
                    message: `Travel Order Liquidation request with ref no. ${updated.referenceCode} requires your approval.`,
                    type: "REQUEST_SENT",
                },
            });
            const io = req.app.get("io");
            io.to(`user_${firstApprover}`).emit("new_request", {
                receiverId: firstApprover,
                requestId: created.id,
                content: created.formTravelOrderLiquidation?.name,
            });
            // SMS Notification 
            await (0, notifyApprover_1.notifyApprover)(io, firstApprover, `New ${created.requestType?.requestName} request ${updated.referenceCode} requires your approval.`);
        }
        return res.status(201).json({ message: "Created", data: updated });
    }
    catch (err) {
        console.error("Error creating Weekly Itinerary Deviation:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.saveTravelOrderLiquidation = saveTravelOrderLiquidation;
const saveOSPurchasing = async (req, res) => {
    try {
        const userId = toNum(req.user?.id);
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const { date, document_number, items_list, requestTypeId, requestDate, requestFromId, approvers } = req.body ?? {};
        if (!requestTypeId) {
            return res.status(400).json({ message: "Missing requestTypeId" });
        }
        // Step 1: Create Main Request
        const created = await prisma.mainRequest.create({
            data: {
                requestDate: requestDate ? new Date(requestDate) : new Date(),
                requestType: { connect: { id: Number(requestTypeId) } },
                requestFrom: { connect: { id: Number(requestFromId) } },
                referenceCode: "temp",
                requestBy: { connect: { id: userId } },
                formOSPurchasing: {
                    create: {
                        date: date ? new Date(date) : new Date(),
                        items_list: items_list,
                        document_number: Number(document_number),
                    },
                },
            },
            include: { formOSPurchasing: true, requestType: true },
        });
        await prisma.branch.update({
            where: { id: Number(requestFromId) },
            data: {
                document_number: Number(document_number),
            },
        });
        await prisma.approvalTable.createMany({
            data: approvers
                .filter(a => a.id)
                .map((a, idx) => ({
                mainRequestID: created.id,
                approverId: a.id,
                sequence: idx + 1,
                roleType: a.roleType,
                status: "PENDING",
                isActive: idx === 0,
            })),
        });
        // Step 3: Generate proper reference code
        const referenceCode = (0, idConverter_1.formatRefId)(created.id, "REF", 6);
        const updated = await prisma.mainRequest.update({
            where: { id: created.id },
            data: { referenceCode },
        });
        // Step 4: Log submission
        await prisma.requestLogs.create({
            data: {
                mainRequestID: created.id,
                approverId: userId,
                checkerType: "OS PURCHASING",
                action: "Submit Request",
                remarks: `You have submitted a OS PURCHASING request with ref no. ${referenceCode}.`
            },
        });
        // Step 5: Notify first approver
        const firstApprover = approvers[0]?.id ?? null;
        if (firstApprover) {
            await prisma.notification.create({
                data: {
                    mainRequestID: created.id,
                    senderID: userId,
                    receiverID: firstApprover,
                    message: `New OS PURCHASING request with ref no. ${updated.referenceCode} requires your approval.`,
                    type: "REQUEST_SENT",
                },
            });
            const io = req.app.get("io");
            io.to(`user_${firstApprover}`).emit("new_request", {
                receiverId: firstApprover,
                requestId: created.id,
                content: created.formOSPurchasing?.date,
            });
            // SMS Notification 
            await (0, notifyApprover_1.notifyApprover)(io, firstApprover, `New ${created.requestType?.requestName} request ${updated.referenceCode} requires your approval.`);
        }
        res.status(201).json({ message: "successfully added", created });
    }
    catch (error) {
        console.error("saveTravelOrderForm error:", error);
        res.status(500).json({ message: "error occurred" });
    }
};
exports.saveOSPurchasing = saveOSPurchasing;
