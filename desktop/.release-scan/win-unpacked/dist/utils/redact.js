"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redactLogLine = redactLogLine;
const SECRET_PATTERNS = [
    /password/i,
    /cookie/i,
    /token/i,
    /authorization/i,
    /bearer/i,
    /api[_-]?key/i,
    /service[_-]?role/i,
    /secret/i,
];
function redactLogLine(message, secrets = []) {
    let output = message;
    for (const secret of secrets) {
        if (secret && secret.length >= 4) {
            output = output.split(secret).join("[REDACTED]");
        }
    }
    for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(output)) {
            return "[REDACTED operational output]";
        }
    }
    return output.slice(0, 4000);
}
