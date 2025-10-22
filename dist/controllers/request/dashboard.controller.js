"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRequestVolumeByBranchAndType = exports.getRequestsByCategory = exports.getRequestCountByDate = exports.getRequestStatus = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const STATUSES = ["APPROVED", "PENDING", "REJECTED"];
const getRequestStatus = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const result = await prisma.mainRequest.groupBy({
            by: ["status"],
            _count: { status: true },
            where: {
                requestDate: {
                    gte: startOfMonth,
                    lt: startOfNextMonth,
                },
            },
        });
        const data = STATUSES.map((status) => {
            const found = result.find((r) => r.status === status);
            return {
                name: status,
                value: found ? found._count.status : 0,
            };
        });
        return res.status(200).json({ success: true, data });
    }
    catch (error) {
        console.error("Error fetching request status summary:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching request status summary",
            error,
        });
    }
};
exports.getRequestStatus = getRequestStatus;
const getRequestCountByDate = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const sixDaysAgo = new Date(today);
        sixDaysAgo.setDate(today.getDate() - 6);
        const endOfToday = new Date(today);
        endOfToday.setHours(23, 59, 59, 999);
        const result = await prisma.mainRequest.groupBy({
            by: ["requestDate"],
            _count: { requestDate: true },
            where: {
                requestDate: {
                    gte: sixDaysAgo,
                    lte: endOfToday,
                },
            },
            orderBy: {
                requestDate: "asc",
            },
        });
        const data = result.map((r) => {
            const date = new Date(r.requestDate);
            const dateKey = date.toISOString().split("T")[0];
            return {
                date: dateKey,
                SevenDaysTrend: r._count.requestDate,
            };
        });
        return res.status(200).json({ success: true, data });
    }
    catch (error) {
        console.error("Error fetching request count by date:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching request count by date",
            error,
        });
    }
};
exports.getRequestCountByDate = getRequestCountByDate;
const getRequestsByCategory = async (req, res) => {
    try {
        const result = await prisma.mainRequest.groupBy({
            by: ["requestTypeId"],
            _count: { requestTypeId: true },
            where: {
                requestTypeId: { not: null },
            },
        });
        const typeIds = result.map((r) => r.requestTypeId);
        const types = await prisma.requestType.findMany({
            where: { id: { in: typeIds } },
            select: { id: true, requestName: true },
        });
        const lookup = new Map(types.map((t) => [t.id, t.requestName]));
        const formatted = result.map((r) => ({
            category: lookup.get(r.requestTypeId) ?? "Unknown",
            requests: r._count.requestTypeId,
        }));
        formatted.sort((a, b) => b.requests - a.requests);
        const total = formatted.reduce((sum, item) => sum + item.requests, 0);
        let running = 0;
        const withCumulative = formatted.map((item) => {
            running += item.requests;
            return {
                ...item,
                cumulative: (running / total) * 100,
            };
        });
        return res.status(200).json({ success: true, data: withCumulative });
    }
    catch (error) {
        console.error("Error fetching requests by category:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching requests by category",
            error,
        });
    }
};
exports.getRequestsByCategory = getRequestsByCategory;
const getRequestVolumeByBranchAndType = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const result = await prisma.mainRequest.findMany({
            where: {
                requestDate: {
                    gte: startOfMonth,
                    lte: now,
                },
            },
            select: {
                requestFrom: { select: { branchName: true } },
                requestType: { select: { requestName: true } },
            },
        });
        const map = new Map();
        for (const r of result) {
            const branch = r.requestFrom?.branchName ?? "Unknown Branch";
            const type = r.requestType?.requestName ?? "Unknown Type";
            const key = `${branch}-${type}`;
            if (!map.has(key)) {
                map.set(key, { branch, type, volume: 0 });
            }
            map.get(key).volume++;
        }
        const data = Array.from(map.values());
        return res.status(200).json({ success: true, data });
    }
    catch (error) {
        console.error("Error fetching heatmap data:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching heatmap data",
            error,
        });
    }
};
exports.getRequestVolumeByBranchAndType = getRequestVolumeByBranchAndType;
