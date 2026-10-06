/**
 * OpenAPI 3.1 specification for existing API routes — Phase A.
 *
 * Covers only routes that already exist in the router (no invented routes).
 * Served at /docs as Swagger UI and at /openapi.json as the raw document.
 *
 * Directive Phase A: "OpenAPI 3.1 for existing routes only. Swagger UI at /docs."
 *
 * Status: Enterprise Candidate — Active Development
 */

export const OPENAPI_DOCUMENT = {
  openapi: "3.1.0",
  info: {
    title: "AlinaMatrix Enterprise API",
    version: "1.0.0",
    description:
      "Evidence-to-artifact pipeline API. " +
      "Status: Enterprise Candidate — Active Development. " +
      "No production claim is made.",
  },
  servers: [
    { url: "/", description: "API root" },
  ],
  tags: [
    { name: "Health",    description: "Health check" },
    { name: "Auth",      description: "Authentication and session" },
    { name: "Sources",   description: "Source upload and ingestion" },
    { name: "Review",    description: "Human review (Phase 7)" },
    { name: "Claims",    description: "Claim-level decisions (Phase 7)" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        description: "Returns service health, version, and maturity.",
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:    { type: "string", enum: ["ok"] },
                    version:   { type: "string" },
                    maturity:  { type: "string", enum: ["enterprise-candidate"] },
                  },
                  required: ["status", "version", "maturity"],
                },
              },
            },
          },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in and create a session",
        description:
          "Verifies credentials with argon2id, creates a session, and sets an " +
          "HttpOnly Secure SameSite=Lax session cookie. Returns the user id " +
          "and tenant id (server-derived from membership).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email:    { type: "string", format: "email" },
                  password: { type: "string", minLength: 1, maxLength: 1024 },
                },
                required: ["email", "password"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Session created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    userId:   { type: "string", format: "uuid" },
                    tenantId: { type: "string", format: "uuid" },
                    email:    { type: "string", format: "email" },
                  },
                  required: ["userId", "tenantId", "email"],
                },
              },
            },
          },
          "400": { description: "Invalid JSON or validation failed" },
          "401": { description: "Invalid credentials" },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Log out and destroy the session",
        description: "Destroys the current session and clears the session cookie.",
        responses: {
          "204": { description: "Session destroyed" },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get the current session user",
        description:
          "Returns the authenticated user id and tenant id derived from the " +
          "HttpOnly session cookie. Used by the review UI instead of a " +
          "hardcoded reviewer id.",
        responses: {
          "200": {
            description: "Current session user",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    userId:   { type: "string", format: "uuid" },
                    tenantId: { type: "string", format: "uuid" },
                  },
                  required: ["userId", "tenantId"],
                },
              },
            },
          },
          "401": { description: "No active session" },
          "503": { description: "Auth database not wired" },
        },
      },
    },
    "/sources/upload": {
      post: {
        tags: ["Sources"],
        summary: "Upload a source document",
        description:
          "Multipart/form-data upload. Ingests a source document, extracts " +
          "fragments, and records an audit event.",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  projectId:      { type: "string", format: "uuid" },
                  name:           { type: "string" },
                  mimeType:       { type: "string" },
                  idempotencyKey: { type: "string" },
                  file:           { type: "string", format: "binary" },
                },
                required: ["projectId", "name", "mimeType", "idempotencyKey", "file"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Source ingested" },
          "400": { description: "Invalid upload fields" },
          "401": { description: "Unauthorized" },
          "422": { description: "Ingestion validation error" },
          "503": { description: "Service unavailable" },
        },
      },
    },
    "/review-tasks": {
      get: {
        tags: ["Review"],
        summary: "List open review tasks",
        description: "Returns open review tasks for the current tenant.",
        responses: {
          "200": {
            description: "List of review tasks",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/ReviewTask" },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "503": { description: "Service unavailable" },
        },
      },
      post: {
        tags: ["Review"],
        summary: "Create a review task",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  workflowRunId: { type: "string", format: "uuid" },
                  projectId:     { type: "string", format: "uuid" },
                  draftId:       { type: "string", format: "uuid", nullable: true },
                  authorId:      { type: "string", format: "uuid" },
                },
                required: ["workflowRunId", "projectId", "authorId"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Review task created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReviewTask" },
              },
            },
          },
          "400": { description: "Invalid request" },
          "401": { description: "Unauthorized" },
          "503": { description: "Service unavailable" },
        },
      },
    },
    "/review-tasks/{taskId}": {
      get: {
        tags: ["Review"],
        summary: "Get a review task with approvals and comments",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "Review task detail",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    task:       { $ref: "#/components/schemas/ReviewTask" },
                    approvals:  { type: "array", items: { $ref: "#/components/schemas/Approval" } },
                    comments:   { type: "array", items: { $ref: "#/components/schemas/Comment" } },
                  },
                  required: ["task", "approvals", "comments"],
                },
              },
            },
          },
          "404": { description: "Review task not found" },
          "503": { description: "Service unavailable" },
        },
      },
    },
    "/review-tasks/{taskId}/approvals": {
      get: {
        tags: ["Review"],
        summary: "List approvals for a review task",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "Approvals",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Approval" } },
              },
            },
          },
          "503": { description: "Service unavailable" },
        },
      },
      post: {
        tags: ["Review"],
        summary: "Add an approval (four-eyes enforced)",
        description:
          "Adds an approval decision. When decision is 'approved', the " +
          "four-eyes rule is enforced: the task author cannot be the sole " +
          "approver.",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  approverId: { type: "string", format: "uuid" },
                  decision:   { type: "string", enum: ["approved", "rejected"] },
                  note:       { type: "string", nullable: true, maxLength: 4096 },
                },
                required: ["approverId", "decision"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Approval recorded",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Approval" },
              },
            },
          },
          "400": { description: "Invalid request" },
          "401": { description: "Unauthorized" },
          "404": { description: "Review task not found" },
          "422": { description: "Four-eyes rule violated" },
          "503": { description: "Service unavailable" },
        },
      },
    },
    "/review-tasks/{taskId}/comments": {
      get: {
        tags: ["Review"],
        summary: "List comments for a review task",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "Comments",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Comment" } },
              },
            },
          },
          "503": { description: "Service unavailable" },
        },
      },
      post: {
        tags: ["Review"],
        summary: "Add an immutable comment",
        description:
          "Adds a comment. Comments are immutable: a correction is a new " +
          "comment, not an edit. UPDATE/DELETE are not routed and are " +
          "rejected by a DB trigger.",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  authorId: { type: "string", format: "uuid" },
                  body:     { type: "string", minLength: 1, maxLength: 8192 },
                },
                required: ["authorId", "body"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Comment recorded",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Comment" },
              },
            },
          },
          "400": { description: "Invalid request" },
          "401": { description: "Unauthorized" },
          "404": { description: "Review task not found" },
          "503": { description: "Service unavailable" },
        },
      },
    },
    "/claims/{claimId}/decision": {
      post: {
        tags: ["Claims"],
        summary: "Approve or reject a claim",
        parameters: [
          { name: "claimId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  decision:   { type: "string", enum: ["approved", "rejected"] },
                  reviewerId: { type: "string", format: "uuid" },
                },
                required: ["decision", "reviewerId"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Claim decision recorded",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    claimId:         { type: "string", format: "uuid" },
                    reviewerStatus:  { type: "string", enum: ["pending", "accepted", "rejected"] },
                  },
                  required: ["claimId", "reviewerStatus"],
                },
              },
            },
          },
          "400": { description: "Invalid request" },
          "401": { description: "Unauthorized" },
          "503": { description: "Service unavailable" },
        },
      },
    },
  },
  components: {
    schemas: {
      ReviewTask: {
        type: "object",
        properties: {
          id:            { type: "string", format: "uuid" },
          tenantId:      { type: "string", format: "uuid" },
          projectId:     { type: "string", format: "uuid" },
          workflowRunId: { type: "string", format: "uuid" },
          draftId:       { type: "string", format: "uuid", nullable: true },
          authorId:      { type: "string", format: "uuid" },
          state:         { type: "string", enum: ["open", "approved", "rejected"] },
          createdAt:      { type: "string", format: "date-time" },
          updatedAt:      { type: "string", format: "date-time" },
        },
        required: ["id", "tenantId", "projectId", "workflowRunId", "authorId", "state", "createdAt", "updatedAt"],
      },
      Approval: {
        type: "object",
        properties: {
          id:         { type: "string", format: "uuid" },
          tenantId:   { type: "string", format: "uuid" },
          taskId:     { type: "string", format: "uuid" },
          approverId: { type: "string", format: "uuid" },
          decision:   { type: "string", enum: ["approved", "rejected"] },
          note:       { type: "string", nullable: true },
          createdAt:  { type: "string", format: "date-time" },
        },
        required: ["id", "tenantId", "taskId", "approverId", "decision", "createdAt"],
      },
      Comment: {
        type: "object",
        properties: {
          id:        { type: "string", format: "uuid" },
          tenantId:  { type: "string", format: "uuid" },
          taskId:    { type: "string", format: "uuid" },
          authorId:  { type: "string", format: "uuid" },
          body:      { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "tenantId", "taskId", "authorId", "body", "createdAt"],
      },
    },
  },
} as const;

/**
 * Swagger UI HTML page that renders the OpenAPI document at /docs.
 *
 * Uses the Swagger UI CDN (unpkg) — no local install required. The spec is
 * served at /openapi.json and loaded by the Swagger UI bundle.
 */
export const SWAGGER_UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AlinaMatrix Enterprise — API Docs</title>
  <meta name="x-alinamatrix-status" content="Enterprise Candidate — Active Development" />
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>
    body { margin: 0; }
    .topbar { background: #0a0a0f; color: #94a3b8; padding: 0.5rem 1rem; font-size: 0.75rem; font-family: ui-monospace, monospace; }
  </style>
</head>
<body>
  <div class="topbar">AlinaMatrix Enterprise — Enterprise Candidate — Active Development</div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
      });
    };
  </script>
</body>
</html>`;
