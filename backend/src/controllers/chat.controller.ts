import type { ApiResponse, ErrorCode, Message, Room } from "@upto/contracts";
import { ROOM_INCLUDE, type ChatDb } from "../services/chat/db.js";
import { presentRoom, toMessage } from "../services/chat/rooms.js";
import {
  addMembersSchema,
  createRoomSchema,
  muteRoomSchema,
  renameRoomSchema,
  reportMessageSchema,
  sendMessageSchema,
} from "../validators/chat.validator.js";

/**
 * Chat over REST: rooms, members, messages, mute, report. No sockets this
 * week. Every function takes the signed-in user's id and returns
 * { status, body }; the route file adapts it to Express.
 *
 * A room you are not a member of answers 404, not 403, so its existence does
 * not leak.
 */

export interface ChatDeps {
  db: ChatDb;
  now: () => Date;
}

export interface Reply<T> {
  status: number;
  body: ApiResponse<T>;
}

export const MESSAGES_PAGE_MAX = 100;
const MESSAGES_PAGE_DEFAULT = 50;

function fail<T>(status: number, code: ErrorCode, message: string, field?: string): Reply<T> {
  return { status, body: { ok: false, error: field ? { code, message, field } : { code, message } } };
}

function invalid<T>(error: { issues: ReadonlyArray<{ message: string; path: ReadonlyArray<PropertyKey> }> }): Reply<T> {
  const issue = error.issues[0];
  const field = issue?.path[0];
  return fail(400, "invalid_request", issue?.message ?? "Invalid request", typeof field === "string" ? field : undefined);
}

const ok = <T>(data: T, status = 200): Reply<T> => ({ status, body: { ok: true, data } });

const noRoom = <T>() => fail<T>(404, "not_found", "Room not found");

async function isMember(db: ChatDb, roomId: string, userId: string): Promise<boolean> {
  return (await db.roomMember.findUnique({ where: { roomId_userId: { roomId, userId } } })) !== null;
}

// GET /chat/rooms
export async function listRooms(deps: ChatDeps, userId: string): Promise<Reply<Room[]>> {
  const rooms = await deps.db.room.findMany({
    where: { members: { some: { userId } } },
    include: ROOM_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return ok(await Promise.all(rooms.map((room) => presentRoom(deps.db, room, userId))));
}

// POST /chat/rooms
export async function createRoom(deps: ChatDeps, userId: string, body: unknown): Promise<Reply<Room>> {
  const parsed = createRoomSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const { type, name } = parsed.data;

  const others = [...new Set(parsed.data.memberIds)].filter((id) => id !== userId);
  if (type === "DIRECT" && others.length !== 1) {
    return fail(400, "invalid_request", "A direct chat has exactly one other person", "memberIds");
  }
  if (type === "DIRECT" && name !== undefined) {
    return fail(400, "invalid_request", "A direct chat has no name", "name");
  }
  if (others.length === 0) return fail(400, "invalid_request", "Add at least 1 person", "memberIds");

  const found = await deps.db.user.findMany({ where: { id: { in: others } } });
  if (found.length !== others.length) return fail(400, "invalid_request", "Some of those people do not exist", "memberIds");

  const room = await deps.db.room.create({
    data: {
      type,
      name: type === "GROUP" ? (name ?? null) : null,
      members: { create: [userId, ...others].map((memberId) => ({ userId: memberId })) },
    },
    include: ROOM_INCLUDE,
  });
  return ok(await presentRoom(deps.db, room, userId), 201);
}

// PATCH /chat/rooms/:id
export async function renameRoom(deps: ChatDeps, userId: string, roomId: string, body: unknown): Promise<Reply<Room>> {
  const parsed = renameRoomSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const room = await deps.db.room.findUnique({ where: { id: roomId }, include: ROOM_INCLUDE });
  if (room === null || !room.members.some((member) => member.userId === userId)) return noRoom();
  if (room.type !== "GROUP") return fail(400, "invalid_request", "Only group chats have a name", "name");

  const renamed = await deps.db.room.update({ where: { id: roomId }, data: { name: parsed.data.name }, include: ROOM_INCLUDE });
  return ok(await presentRoom(deps.db, renamed, userId));
}

// POST /chat/rooms/:id/members
export async function addMembers(deps: ChatDeps, userId: string, roomId: string, body: unknown): Promise<Reply<Room>> {
  const parsed = addMembersSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const room = await deps.db.room.findUnique({ where: { id: roomId }, include: ROOM_INCLUDE });
  if (room === null || !room.members.some((member) => member.userId === userId)) return noRoom();
  if (room.type !== "GROUP") return fail(400, "invalid_request", "People can only be added to a group chat");

  const { userIds, usernames } = parsed.data;
  const wanted = [...new Set(userIds ?? usernames ?? [])];
  const found = await deps.db.user.findMany({ where: userIds ? { id: { in: wanted } } : { username: { in: wanted } } });
  if (found.length !== wanted.length) {
    return fail(400, "invalid_request", "Some of those people do not exist", userIds ? "userIds" : "usernames");
  }

  await deps.db.roomMember.createMany({
    data: found.map((user) => ({ roomId, userId: user.id })),
    skipDuplicates: true,
  });
  const updated = await deps.db.room.findUnique({ where: { id: roomId }, include: ROOM_INCLUDE });
  if (updated === null) return noRoom();
  return ok(await presentRoom(deps.db, updated, userId));
}

// GET /chat/rooms/:id/messages — newest page, returned oldest first; marks the room read.
export async function listMessages(
  deps: ChatDeps,
  userId: string,
  roomId: string,
  query: { limit?: unknown } = {},
): Promise<Reply<Message[]>> {
  if (!(await isMember(deps.db, roomId, userId))) return noRoom();

  const requested = Number(query.limit ?? MESSAGES_PAGE_DEFAULT);
  if (!Number.isInteger(requested) || requested < 1 || requested > MESSAGES_PAGE_MAX) {
    return fail(400, "invalid_request", `limit must be a whole number from 1 to ${MESSAGES_PAGE_MAX}`, "limit");
  }

  const page = await deps.db.message.findMany({
    where: { roomId },
    orderBy: { createdAt: "desc" },
    take: requested,
    include: { sender: true },
  });
  await deps.db.roomMember.update({
    where: { roomId_userId: { roomId, userId } },
    data: { lastReadAt: deps.now() },
  });
  return ok(page.reverse().map(toMessage));
}

// POST /chat/rooms/:id/messages
export async function sendMessage(deps: ChatDeps, userId: string, roomId: string, body: unknown): Promise<Reply<Message>> {
  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  if (!(await isMember(deps.db, roomId, userId))) return noRoom();

  const message = await deps.db.message.create({
    data: { roomId, senderId: userId, content: parsed.data.content },
    include: { sender: true },
  });
  return ok(toMessage(message), 201);
}

// POST /chat/rooms/:id/mute
export async function muteRoom(deps: ChatDeps, userId: string, roomId: string, body: unknown): Promise<Reply<Room>> {
  const parsed = muteRoomSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  if (!(await isMember(deps.db, roomId, userId))) return noRoom();

  const { mutedUntil } = parsed.data;
  await deps.db.roomMember.update({
    where: { roomId_userId: { roomId, userId } },
    data: { mutedUntil: mutedUntil === null ? null : new Date(mutedUntil) },
  });
  const room = await deps.db.room.findUnique({ where: { id: roomId }, include: ROOM_INCLUDE });
  if (room === null) return noRoom();
  return ok(await presentRoom(deps.db, room, userId));
}

// POST /chat/messages/:id/report
export async function reportMessage(
  deps: ChatDeps,
  userId: string,
  messageId: string,
  body: unknown,
): Promise<Reply<{ id: string }>> {
  const parsed = reportMessageSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const message = await deps.db.message.findUnique({ where: { id: messageId } });
  if (message === null || !(await isMember(deps.db, message.roomId, userId))) {
    return fail(404, "not_found", "Message not found");
  }

  const report = await deps.db.report.create({
    data: {
      reporterId: userId,
      targetType: "MESSAGE",
      reason: parsed.data.reason,
      details: parsed.data.details || null,
      messageId,
    },
  });
  return ok({ id: report.id }, 201);
}
