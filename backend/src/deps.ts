import { createRequire } from "node:module";
import type { PrismaClient } from "@prisma/client";
import type { AdminDb } from "./controllers/admin.controller.js";
import type { AuthDeps } from "./controllers/auth.controller.js";
import type { ChatDeps } from "./controllers/chat.controller.js";
import type { DropsDeps } from "./controllers/drops.controller.js";
import type { EventsDeps } from "./controllers/events.controller.js";
import type { UpTosDeps } from "./controllers/uptos.controller.js";
import type { VerificationDeps } from "./controllers/studentVerification.controller.js";
import type { AdminRouteDeps } from "./routes/admin.route.js";
import { currentUserId, startSession } from "./routes/auth.route.js";
import type { ChatRouteDeps } from "./routes/chat.route.js";
import type { DropsRouteDeps } from "./routes/drops.route.js";
import type { EventsRouteDeps } from "./routes/events.route.js";
import type { UpTosRouteDeps } from "./routes/uptos.route.js";
import type { VerificationRouteDeps } from "./routes/studentVerification.route.js";
import type { AuthDb } from "./controllers/auth.controller.js";
import type { VerificationDb } from "./services/verification/db.js";
import type { EventsDb } from "./services/events/db.js";
import type { UpTosDb } from "./services/uptos/db.js";
import type { ReportsDb } from "./services/uptos/reports.js";
import type { DropsDb } from "./services/drops/db.js";
import type { ChatDb } from "./services/chat/db.js";

export interface AppDeps {
  auth: AuthDeps;
  verification: VerificationRouteDeps;
  events: EventsRouteDeps;
  uptos: UpTosRouteDeps;
  drops: DropsRouteDeps;
  chat: ChatRouteDeps;
  admin: AdminRouteDeps;
}

let prisma: PrismaClient | undefined;

function getPrisma(): PrismaClient {
  if (!prisma) {
    const require = createRequire(import.meta.url);
    const { PrismaClient: PrismaClientConstructor } = require("@prisma/client") as {
      PrismaClient: new () => PrismaClient;
    };
    prisma = new PrismaClientConstructor();
  }
  return prisma;
}

export function createRealDeps(): AppDeps {
  const now = () => new Date();
  const sessionUserId = (request: Parameters<typeof currentUserId>[0]) => currentUserId(request, now());
  const sharedDb = new Proxy({}, {
    get: (_target, table: string) => {
      if (table === "$transaction") {
        return (...args: Parameters<PrismaClient["$transaction"]>) => getPrisma().$transaction(...args);
      }
      return new Proxy({}, {
        get: (_delegate, method: string) => (...args: unknown[]) => {
          const client = getPrisma() as unknown as Record<string, Record<string, (...methodArgs: unknown[]) => unknown>>;
          const delegate = client[table];
          return Reflect.apply(delegate[method], delegate, args);
        },
      });
    },
  }) as AuthDb & VerificationDb & EventsDb & UpTosDb & ReportsDb & DropsDb & ChatDb & AdminDb;

  return {
    auth: { db: sharedDb, now } as AuthDeps,
    verification: {
      db: sharedDb,
      now,
      deliverCode: async (email, code) => {
        if (process.env.NODE_ENV === "production") {
          throw new Error("Campus verification code delivery is not configured");
        }
        console.info(`Campus verification code for ${email}: ${code}`);
      },
      currentUserId: sessionUserId,
      startSession: (response, userId) => startSession(response, userId, now()),
    } as VerificationRouteDeps,
    events: { db: sharedDb, now, currentUserId: sessionUserId } as EventsRouteDeps,
    uptos: { db: sharedDb, now, currentUserId: sessionUserId } as UpTosRouteDeps,
    drops: { db: sharedDb, now, currentUserId: sessionUserId } as DropsRouteDeps,
    chat: { db: sharedDb, now, currentUserId: sessionUserId } as ChatRouteDeps,
    admin: { db: sharedDb, now, currentUserId: sessionUserId } as AdminRouteDeps,
  };
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    const client = prisma;
    prisma = undefined;
    await client.$disconnect();
  }
}
