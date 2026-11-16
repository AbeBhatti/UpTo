import type { Message, Room } from "@upto/contracts";
import { toPublicUser } from "../verification/users.js";
import type { ChatDb, MessageWithSender, RoomWithDetails } from "./db.js";

/** Presents a Message exactly as packages/contracts declares it. */
export function toMessage(message: MessageWithSender): Message {
  return {
    id: message.id,
    roomId: message.roomId,
    sender: toPublicUser(message.sender),
    content: message.content,
    revision: message.revision,
    createdAt: message.createdAt.toISOString(),
  };
}

/** Messages from others since the viewer last read the room. */
export async function unreadCountFor(db: ChatDb, room: RoomWithDetails, viewerId: string): Promise<number> {
  const membership = room.members.find((member) => member.userId === viewerId);
  return db.message.count({
    where: {
      roomId: room.id,
      senderId: { not: viewerId },
      ...(membership?.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {}),
    },
  });
}

/** Presents a Room for one viewer: their unread count and their mute. */
export function toRoom(room: RoomWithDetails, viewerId: string, unreadCount: number): Room {
  const membership = room.members.find((member) => member.userId === viewerId);
  const latest = room.messages[0];
  return {
    id: room.id,
    type: room.type,
    name: room.name,
    members: room.members.map((member) => toPublicUser(member.user)),
    lastMessage: latest ? toMessage(latest) : null,
    unreadCount,
    mutedUntil: membership?.mutedUntil ? membership.mutedUntil.toISOString() : null,
  };
}

export async function presentRoom(db: ChatDb, room: RoomWithDetails, viewerId: string): Promise<Room> {
  return toRoom(room, viewerId, await unreadCountFor(db, room, viewerId));
}
