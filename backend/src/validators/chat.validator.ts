import { z } from "zod";

/**
 * Chat validators (Lab 5, RoomMessage.test.ts — 9 tests).
 *
 *   Group name   1 to 80, trimmed, no line breaks
 *   Add members  1 to 20, exactly one list supplied (userIds OR usernames)
 *   Revision     integer 0 to 50
 *   Report       reason an exact enum value; details at most 500
 *   Mute         null unmutes, an ISO timestamp mutes
 *
 * Every object schema is .strict(): an unexpected key is a 400, not ignored.
 */

export const ROOM_NAME_MAX = 80;
export const MEMBERS_MIN = 1;
export const MEMBERS_MAX = 20;
export const MESSAGE_MAX = 4000;
export const REVISION_MAX = 50;
export const REPORT_DETAILS_MAX = 500;

export const REPORT_REASONS = ["ABOUT_A_PERSON", "THREAT", "HATE", "SEXUAL", "SPAM", "OTHER"] as const;
export const ROOM_TYPES = ["DIRECT", "GROUP"] as const;

const idSchema = z.string("Id must be text").trim().min(1, "Id must not be empty").max(191, "Id is too long");

export const roomNameSchema = z
  .string("Group name must be text")
  .regex(/^[^\r\n\u2028\u2029]*$/, "Group name cannot contain line breaks")
  .trim()
  .min(1, "Group name cannot be empty")
  .max(ROOM_NAME_MAX, `Group name must be at most ${ROOM_NAME_MAX} characters`);

export const renameRoomSchema = z.object({ name: roomNameSchema }).strict();

export const createRoomSchema = z
  .object({
    type: z.enum(ROOM_TYPES, "Room type must be DIRECT or GROUP"),
    name: roomNameSchema.optional(),
    memberIds: z
      .array(idSchema, "Members must be a list")
      .min(MEMBERS_MIN, `Add at least ${MEMBERS_MIN} person`)
      .max(MEMBERS_MAX, `Add at most ${MEMBERS_MAX} people at a time`),
  })
  .strict();

const memberList = <T extends z.ZodType>(item: T) =>
  z
    .array(item, "Members must be a list")
    .min(MEMBERS_MIN, `Add at least ${MEMBERS_MIN} person`)
    .max(MEMBERS_MAX, `Add at most ${MEMBERS_MAX} people at a time`);

/** Lab 5: "adding people needs exactly one list: both or neither is rejected". */
export const addMembersSchema = z
  .object({
    userIds: memberList(idSchema).optional(),
    usernames: memberList(z.string("Username must be text").trim().min(1, "Username must not be empty").max(30)).optional(),
  })
  .strict()
  .refine((body) => (body.userIds === undefined) !== (body.usernames === undefined), {
    message: "Supply exactly one list: userIds or usernames",
  });

export const sendMessageSchema = z
  .object({
    content: z
      .string("Message must be text")
      .trim()
      .min(1, "Message cannot be empty")
      .max(MESSAGE_MAX, `Message must be at most ${MESSAGE_MAX} characters`),
  })
  .strict();

export const messageRevisionSchema = z
  .number("Revision must be a number")
  .int("Revision must be a whole number")
  .min(0, "Revision must be at least 0")
  .max(REVISION_MAX, `Revision must be at most ${REVISION_MAX}`);

/** An edited message carries the revision it was edited from. */
export const editMessageSchema = z
  .object({
    content: sendMessageSchema.shape.content,
    revision: messageRevisionSchema,
  })
  .strict();

export const reportMessageSchema = z
  .object({
    reason: z.enum(REPORT_REASONS, "Reason must be one of the listed values"),
    details: z
      .string("Details must be text")
      .trim()
      .max(REPORT_DETAILS_MAX, `Details must be at most ${REPORT_DETAILS_MAX} characters`)
      .optional(),
  })
  .strict();

/** Lab 5: "null unmutes, an ISO time mutes, plain words are rejected". */
export const muteRoomSchema = z
  .object({
    mutedUntil: z.iso.datetime({ offset: true, error: "mutedUntil must be null or an ISO timestamp" }).nullable(),
  })
  .strict();

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type AddMembersInput = z.infer<typeof addMembersSchema>;
export type ReportMessageInput = z.infer<typeof reportMessageSchema>;
export type MuteRoomInput = z.infer<typeof muteRoomSchema>;
