import { createServer } from "node:http";
import { router } from "./router.js";

const PORT = process.env["PORT"] ?? "3001";

// No DB injected at startup in dev; auth routes return 503 until DB is connected.
const server = createServer(router());

server.listen(Number(PORT), () => {
  console.log(`AlinaMatrix API listening on port ${PORT}`);
});
