/**
 * Manual LiveWhale import. There is no cron: run it when you want fresh
 * events, then review them in the admin queue (they arrive PENDING).
 *
 *   DATABASE_URL=... npx tsx src/services/importer/cli.ts
 *   DATABASE_URL=... npx tsx src/services/importer/cli.ts --file saved.json
 *
 * --file imports a saved response instead of fetching, for when the calendar
 * is down. LIVEWHALE_URL overrides the feed; the EventSource row is keyed on
 * that URL, so changing it starts a new source.
 */

import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { importLiveWhale, type ImporterDb } from "./importer.js";
import { LIVEWHALE_FEED_URL, type LiveWhaleResponse } from "./livewhale.js";

async function load(feedUrl: string): Promise<LiveWhaleResponse> {
  const fileFlag = process.argv.indexOf("--file");
  if (fileFlag !== -1) {
    const path = process.argv[fileFlag + 1];
    if (!path) throw new Error("--file needs a path");
    return JSON.parse(await readFile(path, "utf8")) as LiveWhaleResponse;
  }
  // One request, no retry: if the calendar is down, try again later or use --file.
  const response = await fetch(feedUrl, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`LiveWhale answered ${response.status} for ${feedUrl}`);
  return (await response.json()) as LiveWhaleResponse;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL first.");
  const feedUrl = process.env.LIVEWHALE_URL ?? LIVEWHALE_FEED_URL;
  const prisma = new PrismaClient();
  try {
    const result = await importLiveWhale(prisma as unknown as ImporterDb, feedUrl, await load(feedUrl), new Date());
    console.log(`Imported from ${feedUrl}: ${result.created} new (PENDING), ${result.updated} updated, ${result.skipped.length} skipped.`);
    for (const skip of result.skipped) console.log(`  skipped ${skip.externalId}: ${skip.reason}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
