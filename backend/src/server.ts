import { createApp } from "./app.js";
import { disconnectPrisma } from "./deps.js";

try {
  process.loadEnvFile();
} catch (error) {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") {
    throw error;
  }
}

const port = Number(process.env.PORT ?? 4000);
const app = createApp();
const server = app.listen(port, () => {
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
