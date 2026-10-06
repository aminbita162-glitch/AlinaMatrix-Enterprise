import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { router } from "../src/router.js";
import type { HealthResponse } from "../src/router.js";

// router() with no db — health works, auth routes return 503
function startTestServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer(router());
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Unexpected address"));
        return;
      }
      resolve({ server, port: addr.port });
    });
  });
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe("GET /health", () => {
  it("returns 200 with correct JSON shape", async () => {
    const { server, port } = await startTestServer();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as HealthResponse;
      expect(body.status).toBe("ok");
      expect(body.version).toBe("1.0.0");
      expect(body.maturity).toBe("enterprise-candidate");
    } finally {
      await stopServer(server);
    }
  });

  it("returns 404 for unknown routes", async () => {
    const { server, port } = await startTestServer();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/unknown`);
      expect(res.status).toBe(404);
    } finally {
      await stopServer(server);
    }
  });
});
