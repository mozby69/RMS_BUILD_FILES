"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFund = void 0;
const client_1 = require("@prisma/client");
const idConverter_1 = require("../../utils/idConverter");
const notifyApprover_1 = require("../../utils/notifyApprover");
const prisma = new client_1.PrismaClient();
const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
};
const createFund = async (req, res) => {
    try {
        const io = req.app.get("io");
        const userId = toNum(req.user?.id);
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const { fundType, travelRows, cashRows, requestTypeId, branchId, dateCounted, approvers, ...data } = req.body;
        if (!fundType || !branchId || !requestTypeId) {
            return res.status(400).json({ message: "Missing required fields" });
        }
        // Step 1: request type definition
        const reqType = await prisma.requestType.findUnique({
            where: { id: Number(requestTypeId) },
            select: {
                // notedBy: { select: { id: true } },     
                checkedBy: { select: { id: true } },
                checkedBy2: { select: { id: true } },
                recomApproval: { select: { id: true } },
                recomApproval2: { select: { id: true } },
                approveBy: { select: { id: true } },
                requestName: true,
            },
        });
        if (!reqType) {
            return res.status(404).json({ message: "RequestType not found" });
        }
        if (fundType === "Travel") {
            const created = await prisma.mainRequest.create({
                data: {
                    requestDate: dateCounted ? new Date(dateCounted) : new Date(),
                    requestType: { connect: { id: Number(requestTypeId) } },
                    requestFrom: { connect: { id: Number(branchId) } },
                    requestBy: { connect: { id: userId } },
                    referenceCode: "TEMP",
                    countSheet: {
                        create: {
                            fundType: "Travel",
                            office: data.office ?? "HQ",
                            dateCount: dateCounted ? new Date(dateCounted) : new Date(),
                            fundName: data.fundName ?? "Travel Fund",
                            fundAmount: new client_1.Prisma.Decimal(data.fundAmount ?? 0),
                            reference: data.reference,
                            cashDemo: data.cashDemo ?? null,
                            repFund: new client_1.Prisma.Decimal(data.repFund ?? 0),
                            totalFund: new client_1.Prisma.Decimal(data.totalFund ?? 0),
                            cashShort: new client_1.Prisma.Decimal(data.cashShort ?? 0),
                            TravelCountSheet: {
                                create: (travelRows ?? []).map((row) => ({
                                    tagsField: row.tagsField ?? [],
                                    startDate: row.startDate ? new Date(row.startDate) : new Date(),
                                    endDate: row.endDate ? new Date(row.endDate) : new Date(),
                                    reqDate: row.travelDate ? new Date(row.travelDate) : new Date(),
                                    travelling: row.travelling,
                                    fuel: row.fuelFee ?? null,
                                    repair: row.repairs ?? [],
                                    litigation: row.litigationExp ?? null,
                                    totalFee: row.totalFunds ?? 0,
                                    kilometer: row.travelKm,
                                    remarks: row.fundRemarks,
                                })),
                            },
                        },
                    },
                },
                include: {
                    countSheet: {
                        include: { TravelCountSheet: true },
                    },
                    approval: true,
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
            const logs = await prisma.requestLogs.create({
                data: {
                    mainRequestID: created.id,
                    approverId: userId,
                    checkerType: "Travel Replenishment",
                    action: "Submit Request",
                },
            });
            const referenceCode = (0, idConverter_1.formatRefId)(created.id, "REF", 6);
            const updated = await prisma.mainRequest.update({
                where: { id: created.id },
                data: { referenceCode },
            });
            const firstApprover = approvers[0]?.id ?? null;
            if (firstApprover) {
                await prisma.notification.create({
                    data: {
                        mainRequestID: created.id,
                        senderID: userId,
                        receiverID: firstApprover,
                        message: `New Travel Replenishment request with ref no. ${updated.referenceCode} requires your approval.`,
                        type: "REQUEST_SENT",
                    },
                });
                const io = req.app.get("io");
                io.to(`user_${firstApprover}`).emit("new_request", {
                    receiverId: firstApprover,
                    requestId: created.id,
                    content: created.countSheet?.reference,
                });
            }
            // SMS Notification 
            await (0, notifyApprover_1.notifyApprover)(io, firstApprover, `New ${logs.checkerType} request ${updated.referenceCode} requires your approval.`);
            return res.status(201).json(created);
        }
        if (fundType === "Cash") {
            const created = await prisma.mainRequest.create({
                data: {
                    requestDate: dateCounted ? new Date(dateCounted) : new Date(),
                    requestType: { connect: { id: Number(requestTypeId) } },
                    requestFrom: { connect: { id: Number(branchId) } },
                    requestBy: { connect: { id: userId } },
                    referenceCode: "Temp",
                    countSheet: {
                        create: {
                            fundType: "Cash",
                            office: data.office ?? "HQ",
                            dateCount: dateCounted ? new Date(dateCounted) : new Date(),
                            fundName: data.fundName ?? "Cash Fund",
                            fundAmount: new client_1.Prisma.Decimal(data.fundAmount ?? 0),
                            reference: data.reference,
                            cashDemo: data.cashDemo ?? null,
                            repFund: new client_1.Prisma.Decimal(data.repFund ?? 0),
                            totalFund: new client_1.Prisma.Decimal(data.totalFund ?? 0),
                            cashShort: new client_1.Prisma.Decimal(data.cashShort ?? 0),
                            CashCountSheet: {
                                create: (cashRows ?? []).map((row) => ({
                                    startDate: row.startDate ? new Date(row.startDate) : new Date(),
                                    endDate: row.endDate ? new Date(row.endDate) : new Date(),
                                    reqDate: row.funDate ? new Date(row.funDate) : new Date(),
                                    payee: row.payee,
                                    remarks: row.fundRemarks,
                                    fundAmount: row.fundAmount ?? 0,
                                    miscExp: row.miscExp ?? null,
                                    billFee: row.powerLight ?? null,
                                    telFee: row.telephone ?? null,
                                    dueMh: row.dueToMh ?? null,
                                })),
                            },
                        },
                    },
                },
                include: {
                    countSheet: {
                        include: { CashCountSheet: true },
                    },
                    approval: true,
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
            const logs = await prisma.requestLogs.create({
                data: {
                    mainRequestID: created.id,
                    approverId: userId,
                    checkerType: "Fund Replenishment",
                    action: "Submit Request",
                },
            });
            // Step 4: Generate proper reference code
            const referenceCode = (0, idConverter_1.formatRefId)(created.id, "REF", 6);
            const updated = await prisma.mainRequest.update({
                where: { id: created.id },
                data: { referenceCode },
            });
            const firstApprover = approvers[0]?.id ?? null;
            if (firstApprover) {
                await prisma.notification.create({
                    data: {
                        mainRequestID: created.id,
                        senderID: userId,
                        receiverID: firstApprover,
                        message: `New Fund Replenishment request with ref no. ${updated.referenceCode} requires your approval.`,
                        type: "REQUEST_SENT",
                    },
                });
                io.to(`user_${firstApprover}`).emit("new_request", {
                    receiverId: firstApprover,
                    requestId: created.id,
                    content: created.countSheet?.reference,
                });
            }
            // SMS Notification 
            await (0, notifyApprover_1.notifyApprover)(io, firstApprover, `New ${logs.checkerType} request ${updated.referenceCode} requires your approval.`);
            return res.status(201).json(created);
        }
        return res.status(400).json({ message: "Invalid fundType" });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Error creating fund", error });
    }
};
exports.createFund = createFund;
