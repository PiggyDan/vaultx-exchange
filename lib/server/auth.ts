import bcrypt from "bcryptjs";
import { z } from "zod";

export const credentials = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{3,20}$/, "Username must be 3–20 letters, numbers or underscores"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72, "Password is too long"),
});

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

// Compared against when the user doesn't exist, so login timing doesn't reveal valid usernames.
// (Hash of a random throwaway string — matches no password.)
export const DUMMY_HASH = "$2b$12$z39OD3u0.hr6pXVr0Prl5O4.XJgsD6gZGkYyzBlQ/1QvryMXu1gXy";
