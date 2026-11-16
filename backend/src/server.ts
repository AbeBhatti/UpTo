import { createApp } from "./app.js";
import { disconnectPrisma } from "./deps.js";

// The repo-root .env (README: `cp .env.example .env`). An explicit path,
// because `npm run dev -w backend` runs from backend/, where there is none.
try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch (error) {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") {
    throw error;
  }
}

// Fail at startup, not with a 500 on the first query.
if (!process.env.DATABASE_URL) {
  throw new Error("Set DATABASE_URL first (copy .env.example to .env at the repo root).");
}

const port = Number(process.env.PORT ?? 4000);
const app = createApp();
// Express 5 calls this once, with the error if the server could not listen
// (port in use, no permission). Ignoring it printed "listening" and exited 0.
const server = app.listen(port, (error?: Error) => {
  if (error) {
    const code = (error as NodeJS.ErrnoException).code;
    console.error(
      code === "EADDRINUSE"
        ? `Port ${port} is already in use. Stop whatever is on it, or set PORT to a free one.`
        : `Backend could not listen on port ${port}: ${error.message}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Backend listening at http://localhost:${port}`);
});

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; closing backend`);
  server.close(async (error) => {
    if (error) console.error("Error closing backend server", error);
    try {
      await disconnectPrisma();
    } catch (disconnectError) {
      console.error("Error disconnecting Prisma", disconnectError);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
