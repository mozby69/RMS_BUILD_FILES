"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateAsStated = void 0;
const client_1 = require("@prisma/client");
const idConverter_1 = require("../../utils/idConverter");
const notifyApprover_1 = require("../../utils/notifyApprover");
const prisma = new client_1.PrismaClient();
const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
};
const CreateAsStated = async (req, res) => {
    try {
        const userId = toNum(req.user?.id);
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const { statedTo, statedFrom, statedDate, statedSub, statedDetails, statedTable, requestTypeId, approvers, ...data } = req.body;
        // ✅ Cast numbers from strings
        const parsedStatedTo = statedTo ? Number(statedTo) : null;
        const parsedStatedFrom = statedFrom ? Number(statedFrom) : null;
        const parsedRequestTypeId = requestTypeId ? Number(requestTypeId) : null;
        // ✅ Parse JSON table
        let parsedTable = null;
        if (statedTable) {
            try {
                parsedTable = typeof statedTable === "string" ? JSON.parse(statedTable) : statedTable;
            }
            catch (e) {
                console.error("Invalid statedTable JSON:", e);
            }
        }
        let parsedApprovers = [];
        if (approvers) {
            try {
                const raw = typeof approvers === "string" ? JSON.parse(approvers) : approvers;
                parsedApprovers = Array.isArray(raw)
                    ? raw.map((a) => ({
                        id: a.id ? Number(a.id) : null,
                        roleType: a.roleType ?? null,
                    }))
                    : [];
            }
            catch (e) {
                console.error("Invalid approvers JSON:", e);
            }
        }
        if (!parsedStatedFrom || !parsedStatedTo || !parsedRequestTypeId) {
            return res.status(400).json({ message: "Missing required fields" });
        }
        // ✅ Build image records from multer files
        const imageRecords = req.files && Array.isArray(req.files)
            ? req.files.map((file) => ({
                uploadedAt: new Date(),
                imgPath: `${process.env.APP_URL}/uploads/asStatedImgs/${file.filename}`,
            }))
            : [];
        // Fetch request type
        const reqType = await prisma.requestType.findUnique({
            where: { id: parsedRequestTypeId },
            select: {
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
        // ✅ Create mainRequest
        const created = await prisma.mainRequest.create({
            data: {
                requestDate: statedDate ? new Date(statedDate) : new Date(),
                requestType: { connect: { id: parsedRequestTypeId } },
                requestFrom: { connect: { id: parsedStatedFrom } },
                requestBy: { connect: { id: userId } },
                referenceCode: "TEMP",
                asStated: {
                    create: {
                        statedTo: parsedStatedTo,
                        statedFrom: parsedStatedFrom,
                        statedDate: statedDate ? new Date(statedDate) : new Date(),
                        statedSub,
                        statedDetails,
                        statedTable: parsedTable,
                        AsStatedImg: {
                            create: imageRecords,
                        },
                    },
                },
            },
            include: {
                asStated: { include: { AsStatedImg: true } },
                approval: true,
            },
        });
        const referenceCode = (0, idConverter_1.formatRefId)(created.id, "REF", 6);
        const updated = await prisma.mainRequest.update({
            where: { id: created.id },
            data: { referenceCode },
        });
        await prisma.approvalTable.createMany({
            data: parsedApprovers
                .filter(a => a.id)
                .map((a, idx) => ({
                mainRequestID: created.id,
                approverId: a.id,
                sequence: idx + 1,
                roleType: a.roleType ?? "",
                status: "PENDING",
                isActive: idx === 0,
            })),
        });
        await prisma.requestLogs.create({
            data: {
                mainRequestID: created.id,
                approverId: userId,
                checkerType: "As Stated",
                action: "Submit Request",
            },
        });
        const firstApprover = parsedApprovers[0]?.id ?? null;
        if (firstApprover) {
            await prisma.notification.create({
                data: {
                    mainRequestID: created.id,
                    senderID: userId,
                    receiverID: firstApprover,
                    message: `New As Stated request with ref no. ${updated.referenceCode} requires your approval.`,
                    type: "REQUEST_SENT",
                },
            });
            const io = req.app.get("io");
            io.to(`user_${firstApprover}`).emit("new_request", {
                receiverId: firstApprover,
                requestId: created.id,
                content: created.asStated?.statedDetails,
            });
            // SMS Notification 
            await (0, notifyApprover_1.notifyApprover)(io, firstApprover, `New ${reqType?.requestName} request ${updated.referenceCode} requires your approval.`);
        }
        return res.status(201).json(created);
    }
    catch (error) {
        console.error("Error creating AsStated:", error);
        return res.status(500).json({ message: "Error creating AsStated", error });
    }
};
exports.CreateAsStated = CreateAsStated;
