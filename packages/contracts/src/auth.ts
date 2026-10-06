/**
 * Zod schemas for authentication and tenant API contracts.
 * Status: Enterprise Candidate — Active Development
 */
import { z } from "zod";

// ----------------------------------------------------------------
// Login
// ----------------------------------------------------------------
export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(1024),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  email: z.string().email(),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// ----------------------------------------------------------------
// Session (server-derived; never from client)
// ----------------------------------------------------------------
export const SessionSchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  expiresAt: z.string().datetime(),
});
export type Session = z.infer<typeof SessionSchema>;

// ----------------------------------------------------------------
// Tenant
// ----------------------------------------------------------------
export const TenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  isFixture: z.boolean(),
  createdAt: z.string().datetime(),
});
export type Tenant = z.infer<typeof TenantSchema>;

// ----------------------------------------------------------------
// API error envelope
// ----------------------------------------------------------------
export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
