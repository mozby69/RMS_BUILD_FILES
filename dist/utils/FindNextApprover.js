"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findNextApprover = findNextApprover;
function findNextApprover(reqType, approval) {
    const appr = Array.isArray(approval) ? approval[0] : approval;
    if (!appr)
        return null;
    if (appr.notedBy === "PENDING")
        return reqType.notedBy?.id;
    if (appr.checkedBy === "PENDING")
        return reqType.checkedBy?.id;
    if (appr.checkedBy2 === "PENDING")
        return reqType.checkedBy2?.id;
    if (appr.recomApproval === "PENDING")
        return reqType.recomApproval?.id;
    if (appr.recomApproval2 === "PENDING")
        return reqType.recomApproval2?.id;
    if (appr.approveBy === "PENDING")
        return reqType.approveBy?.id;
    return "APPROVED";
}
