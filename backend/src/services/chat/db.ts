import type { UserRow } from "../verification/db.js";

/**
 * The slice of the database chat touches, with Prisma's method shapes.
 * Rows mirror prisma/schema.prisma (Room, RoomMember, Message, Report).
 */

export interface RoomRow {
  id: string;
  type: "DIRECT" | "GROUP";
  name: string | null;
  createdAt: Date;
}

export interface RoomMemberRow {
  id: string;
  roomId: string;
  userId: string;
  mutedUntil: Date | null;
  joinedAt: Date;
  lastReadAt: Date | null;
}

export interface MessageRow {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  revision: number;
  createdAt: Date;
}

export type MessageWithSender = MessageRow & { sender: UserRow };

export type RoomWithDetails = RoomRow & {
  members: Array<RoomMemberRow & { user: UserRow }>;
  messages: MessageWithSender[];
};

/** Include shape that produces RoomWithDetails: members with users, and the latest message. */
export const ROOM_INCLUDE = {
  members: { include: { user: true } },
  messages: { orderBy: { createdAt: "desc" }, take: 1, include: { sender: true } },
} as const;

type Filter = Record<string, unknown>;
type MemberKey = { roomId_userId: { roomId: string; userId: string } };

export interface ChatDb {
  room: {
    findMany(args: { where: Filter; include: typeof ROOM_INCLUDE; orderBy?: Filter }): Promise<RoomWithDetails[]>;
    findUnique(args: { where: { id: string }; include: typeof ROOM_INCLUDE }): Promise<RoomWithDetails | null>;
    create(args: { data: Filter; include: typeof ROOM_INCLUDE }): Promise<RoomWithDetails>;
    update(args: { where: { id: string }; data: Filter; include: typeof ROOM_INCLUDE }): Promise<RoomWithDetails>;
  };
  roomMember: {
    findUnique(args: { where: MemberKey }): Promise<RoomMemberRow | null>;
    createMany(args: { data: Array<{ roomId: string; userId: string }>; skipDuplicates: true }): Promise<{ count: number }>;
    update(args: { where: MemberKey; data: Filter }): Promise<RoomMemberRow>;
  };
  message: {
    findUnique(args: { where: { id: string } }): Promise<MessageRow | null>;
    findMany(args: { where: Filter; orderBy: Filter; take: number; include: { sender: true } }): Promise<MessageWithSender[]>;
    create(args: { data: Filter; include: { sender: true } }): Promise<MessageWithSender>;
    count(args: { where: Filter }): Promise<number>;
  };
  user: {
    findMany(args: { where: Filter }): Promise<UserRow[]>;
  };
  report: {
    create(args: { data: Filter }): Promise<{ id: string }>;
  };
}
