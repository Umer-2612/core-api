import crypto from "node:crypto";

/** Generates a cryptographically secure, URL-safe token. Used for invitation and session-invite links. */
export const generateSecureToken = (bytes = 32): string => crypto.randomBytes(bytes).toString("hex");
