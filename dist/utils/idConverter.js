"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatRefId = formatRefId;
function formatRefId(id, prefix = "REF", zeros = 6) {
    return `${prefix}${id.toString().padStart(zeros, "0")}`;
}
