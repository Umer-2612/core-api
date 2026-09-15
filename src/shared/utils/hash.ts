import { compare, hash } from "bcryptjs";

/** Hashing utilities (bcrypt). */
export class Hash {
  /** Hashes a password (12 rounds). */
  static async hashPassword(password: string): Promise<string> {
    if (!password || typeof password !== "string") {
      throw new Error("Password is required");
    }
    return hash(password, 12);
  }

  /** Compares a plaintext password against a bcrypt hash. */
  static async comparePassword(password: string, hashedPassword: string): Promise<boolean> {
    if (!password || !hashedPassword) return false;
    return compare(password, hashedPassword);
  }
}
