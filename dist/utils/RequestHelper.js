"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindRequestSequence = FindRequestSequence;
exports.RequestSequenceChecker = RequestSequenceChecker;
function FindRequestSequence(reqType, userId) {
    if (reqType.notedById === userId)
        return 0;
    if (reqType.checkedById === userId)
        return 1;
    if (reqType.checkedBy2Id === userId)
        return 2;
    if (reqType.recomApprovalId === userId)
        return 3;
    if (reqType.recomApproval2Id === userId)
        return 4;
    if (reqType.approveById === userId)
        return 5;
    return null;
}
const APPROVAL_FLOW = [
    "notedBy",
    "checkedBy",
    "checkedBy2",
    "recomApproval",
    "recomApproval2",
    "approveBy",
];
function RequestSequenceChecker(sequenceNumber, approval, status) {
    if (status !== "ALL") {
        if (approval[APPROVAL_FLOW[sequenceNumber]] === status) {
            for (let i = sequenceNumber + 1; i >= 0; i--) {
                let sequenceCheck = sequenceNumber - 1;
                const key = APPROVAL_FLOW[sequenceCheck];
                const approvalStatus = approval[key];
                if (approvalStatus === "PENDING" || approvalStatus === "REJECTED") {
                    console.log("Blocked at step", sequenceCheck, "| Key:", key, "| Status:", approvalStatus);
                    return false; // 🚫 stop here because this or a prior step is still pending
                }
                else if (status === "APPROVED") {
                    return true;
                }
                else {
                    sequenceCheck--;
                    continue;
                }
            }
            return true; // ✅ all steps up to sequenceNumber are approved
        }
    }
    else {
        if (approval[APPROVAL_FLOW[sequenceNumber]] === "APPROVED" || approval[APPROVAL_FLOW[sequenceNumber]] === "REJECTED") {
            return true;
        }
        else {
            for (let i = sequenceNumber + 1; i >= 0; i--) {
                let sequenceCheck = sequenceNumber - 1;
                const key = APPROVAL_FLOW[sequenceCheck];
                const approvalStatus = approval[key];
                if (approvalStatus === "PENDING" || approvalStatus === "REJECTED") {
                    console.log("Blocked at step", sequenceCheck, "| Key:", key, "| Status:", approvalStatus);
                    return false; // 🚫 stop here because this or a prior step is still pending
                }
                else if (approvalStatus === "APPROVED") {
                    return true;
                }
                else {
                    sequenceCheck--;
                    continue;
                }
            }
            return true;
        }
    }
    return false;
}
