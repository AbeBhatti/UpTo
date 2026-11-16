import { PrismaClient } from "@prisma/client";
import { createApp, type AppDb } from "./app.js";

// The repo-root .env holds DATABASE_URL (Supabase session pooler).
try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  // No .env file: rely on the environment.
}

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL first (see .env.example).");

const port = Number(process.env.PORT ?? 4000);
const prisma = new PrismaClient();
// The services type the Prisma method shapes they use; the client fits at runtime.
const app = createApp({ db: prisma as unknown as AppDb });

app.listen(port, () => {
  console.log(`Backend listening at http://localhost:${port}`);
});
