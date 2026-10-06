/**
 * Zod schemas for agents, workflows, jobs, usage events, and cache entries.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { z } from "zod";

// ============================================================
// Agent capabilities enum (must stay in sync with domain/agents.ts)
// ============================================================

export const AgentCapabilitySchema = z.enum([
  "READ_SOURCE",
  "READ_EVIDENCE",
  "WRITE_DRAFT",
  "RUN_VALIDATION",
  "COMPILE_ARTIFACT",
  "READ_USAGE",
  "WRITE_CACHE_METADATA",
]);
export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;

// ============================================================
// Agents
// ============================================================

export const AgentResponseSchema = z.object({
  id:           z.string().uuid(),
  name:         z.string(),
  capabilities: z.array(AgentCapabilitySchema),
  description:  z.string().nullable(),
  createdAt:    z.string().datetime(),
  updatedAt:    z.string().datetime(),
});
export type AgentResponse = z.infer<typeof AgentResponseSchema>;

// ============================================================
// Model / Prompt / Schema / Policy versions
// ============================================================

export const ModelVersionResponseSchema = z.object({
  id:          z.string().uuid(),
  modelId:     z.string(),
  provider:    z.string(),
  temperature: z.number(),
  maxTokens:   z.number().nullable(),
  description: z.string().nullable(),
  createdAt:   z.string().datetime(),
});
export type ModelVersionResponse = z.infer<typeof ModelVersionResponseSchema>;

export const CreateModelVersionRequestSchema = z.object({
  modelId:     z.string().min(1).max(256),
  provider:    z.string().min(1).max(128).default("deterministic_fake"),
  temperature: z.number().min(0).max(2).default(0),
  maxTokens:   z.number().int().positive().nullable().optional(),
  description: z.string().max(1024).nullable().optional(),
});
export type CreateModelVersionRequest = z.infer<typeof CreateModelVersionRequestSchema>;

export const PromptVersionResponseSchema = z.object({
  id:        z.string().uuid(),
  name:      z.string(),
  version:   z.number().int(),
  text:      z.string(),
  sha256:    z.string().length(64),
  createdAt: z.string().datetime(),
});
export type PromptVersionResponse = z.infer<typeof PromptVersionResponseSchema>;

export const CreatePromptVersionRequestSchema = z.object({
  name:    z.string().min(1).max(256),
  version: z.number().int().positive(),
  text:    z.string().min(1),
});
export type CreatePromptVersionRequest = z.infer<typeof CreatePromptVersionRequestSchema>;

export const SchemaVersionResponseSchema = z.object({
  id:         z.string().uuid(),
  name:       z.string(),
  version:    z.number().int(),
  schemaJson: z.record(z.string(), z.unknown()),
  sha256:     z.string().length(64),
  createdAt:  z.string().datetime(),
});
export type SchemaVersionResponse = z.infer<typeof SchemaVersionResponseSchema>;

export const CreateSchemaVersionRequestSchema = z.object({
  name:       z.string().min(1).max(256),
  version:    z.number().int().positive(),
  schemaJson: z.record(z.string(), z.unknown()),
});
export type CreateSchemaVersionRequest = z.infer<typeof CreateSchemaVersionRequestSchema>;

export const PolicyVersionResponseSchema = z.object({
  id:         z.string().uuid(),
  name:       z.string(),
  version:    z.number().int(),
  rulesJson:  z.record(z.string(), z.unknown()),
  sha256:     z.string().length(64),
  createdAt:  z.string().datetime(),
});
export type PolicyVersionResponse = z.infer<typeof PolicyVersionResponseSchema>;

export const CreatePolicyVersionRequestSchema = z.object({
  name:      z.string().min(1).max(256),
  version:   z.number().int().positive(),
  rulesJson: z.record(z.string(), z.unknown()),
});
export type CreatePolicyVersionRequest = z.infer<typeof CreatePolicyVersionRequestSchema>;

// ============================================================
// Workflows
// ============================================================

export const WorkflowResponseSchema = z.object({
  id:          z.string().uuid(),
  projectId:   z.string().uuid(),
  name:        z.string(),
  description: z.string().nullable(),
  createdAt:   z.string().datetime(),
  updatedAt:   z.string().datetime(),
});
export type WorkflowResponse = z.infer<typeof WorkflowResponseSchema>;

export const CreateWorkflowRequestSchema = z.object({
  projectId:   z.string().uuid(),
  name:        z.string().min(1).max(512),
  description: z.string().max(4096).nullable().optional(),
});
export type CreateWorkflowRequest = z.infer<typeof CreateWorkflowRequestSchema>;

// ============================================================
// Workflow runs
// ============================================================

const WorkflowStateSchema = z.enum([
  "INGESTED", "CLASSIFIED", "EXTRACTED", "EVIDENCE_READY",
  "ARCHITECTED", "GENERATED", "VALIDATING", "NEEDS_REVIEW",
  "APPROVED", "BUILDING", "BUILT", "RELEASED",
  "FAILED_RETRYABLE", "FAILED_TERMINAL",
  "CANCELLED", "EXPIRED", "QUARANTINED",
]);
export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

export const WorkflowRunResponseSchema = z.object({
  id:         z.string().uuid(),
  workflowId: z.string().uuid(),
  state:      WorkflowStateSchema,
  createdAt:  z.string().datetime(),
  updatedAt:  z.string().datetime(),
});
export type WorkflowRunResponse = z.infer<typeof WorkflowRunResponseSchema>;

export const CreateWorkflowRunRequestSchema = z.object({
  workflowId: z.string().uuid(),
});
export type CreateWorkflowRunRequest = z.infer<typeof CreateWorkflowRunRequestSchema>;

// ============================================================
// Processing jobs
// ============================================================

export const JobResponseSchema = z.object({
  id:               z.string().uuid(),
  workflowRunId:    z.string().uuid(),
  agentVersionId:   z.string().uuid().nullable(),
  idempotencyKey:   z.string(),
  state:            WorkflowStateSchema,
  createdAt:        z.string().datetime(),
  updatedAt:        z.string().datetime(),
});
export type JobResponse = z.infer<typeof JobResponseSchema>;

export const CreateJobRequestSchema = z.object({
  workflowRunId:   z.string().uuid(),
  agentVersionId:  z.string().uuid().nullable().optional(),
  idempotencyKey:  z.string().min(1).max(512),
});
export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>;

// ============================================================
// Job events
// ============================================================

export const JobEventResponseSchema = z.object({
  id:         z.string().uuid(),
  jobId:      z.string().uuid(),
  fromState:  WorkflowStateSchema,
  toState:    WorkflowStateSchema,
  reason:     z.string().nullable(),
  createdAt:  z.string().datetime(),
});
export type JobEventResponse = z.infer<typeof JobEventResponseSchema>;

// ============================================================
// Agent runs
// ============================================================

const AgentRunStateSchema = z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED"]);
export type AgentRunState = z.infer<typeof AgentRunStateSchema>;

export const AgentRunResponseSchema = z.object({
  id:               z.string().uuid(),
  jobId:            z.string().uuid(),
  agentVersionId:   z.string().uuid(),
  inputHash:        z.string().length(64),
  outputJson:       z.record(z.string(), z.unknown()).nullable(),
  state:            AgentRunStateSchema,
  failReason:       z.string().nullable(),
  createdAt:        z.string().datetime(),
  updatedAt:        z.string().datetime(),
});
export type AgentRunResponse = z.infer<typeof AgentRunResponseSchema>;

// ============================================================
// Usage events
// ============================================================

export const UsageEventResponseSchema = z.object({
  id:                z.string().uuid(),
  projectId:         z.string().uuid(),
  agentRunId:        z.string().uuid(),
  agentVersionId:    z.string().uuid(),
  modelVersionId:    z.string().uuid(),
  promptTokens:      z.number().int().nonnegative(),
  completionTokens:  z.number().int().nonnegative(),
  totalTokens:       z.number().int().nonnegative(),
  costMinorUnits:    z.number().int().nonnegative(),
  createdAt:         z.string().datetime(),
});
export type UsageEventResponse = z.infer<typeof UsageEventResponseSchema>;

// ============================================================
// Cache entries
// ============================================================

export const CacheEntryResponseSchema = z.object({
  id:               z.string().uuid(),
  cacheKey:         z.string().length(64),
  outputJson:       z.record(z.string(), z.unknown()),
  promptVersionId:  z.string().uuid(),
  modelVersionId:   z.string().uuid(),
  schemaVersionId:  z.string().uuid(),
  policyVersionId:  z.string().uuid(),
  createdAt:        z.string().datetime(),
});
export type CacheEntryResponse = z.infer<typeof CacheEntryResponseSchema>;
