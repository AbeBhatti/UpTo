import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addMembersSchema,
  editMessageSchema,
  muteRoomSchema,
  renameRoomSchema,
  reportMessageSchema,
} from "../src/validators/chat.validator.js";
import { accepts, rejects } from "./support/rejects.js";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `user_${i + 1}`);

describe("Room and Message", () => {
  it("[normal] renaming a group trims the name", () => {
    const body = accepts(renameRoomSchema, { name: "   Friday Study Group  " });
    assert.equal(body.name, "Friday Study Group");
  });

  it("[edge] group name length: 1 and 80 characters pass, 81 and spaces-only fail", () => {
    accepts(renameRoomSchema, { name: "a" });
    accepts(renameRoomSchema, { name: "a".repeat(80) });
    rejects(renameRoomSchema, { name: "a".repeat(81) }, "Group name must be at most 80 characters");
    rejects(renameRoomSchema, { name: "     " }, "Group name cannot be empty");
  });

  it("[invalid] group name with a line break, a number, or None/null is rejected", () => {
    rejects(renameRoomSchema, { name: "Study\nGroup" }, "Group name cannot contain line breaks");
    rejects(renameRoomSchema, { name: 42 }, "Group name must be text");
    rejects(renameRoomSchema, { name: null }, "Group name must be text");
  });

  it("[edge] adding people: 1 and 20 people pass, 0 and 21 fail", () => {
    accepts(addMembersSchema, { userIds: ids(1) });
    accepts(addMembersSchema, { userIds: ids(20) });
    rejects(addMembersSchema, { userIds: ids(0) }, "Add at least 1 person");
    rejects(addMembersSchema, { userIds: ids(21) }, "Add at most 20 people at a time");
  });

  it("[invalid] adding people needs exactly one list: both or neither is rejected", () => {
    accepts(addMembersSchema, { usernames: ["bronco_fan"] });
    rejects(addMembersSchema, { userIds: ids(1), usernames: ["bronco_fan"] }, /^Supply exactly one list/);
    rejects(addMembersSchema, {}, /^Supply exactly one list/);
  });

  it("[normal] reporting a message with a reason and short details is accepted", () => {
    const body = accepts(reportMessageSchema, {
      reason: "SPAM",
      details: "Keeps posting the same link",
    });
    assert.equal(body.reason, "SPAM");
    assert.equal(body.details, "Keeps posting the same link");
  });

  it("[edge/invalid] message revision: 0 and 50 pass; -1, 51 and 2.5 fail", () => {
    accepts(editMessageSchema, { content: "fixed typo", revision: 0 });
    accepts(editMessageSchema, { content: "fixed typo", revision: 50 });
    rejects(editMessageSchema, { content: "fixed typo", revision: -1 }, "Revision must be at least 0");
    rejects(editMessageSchema, { content: "fixed typo", revision: 51 }, "Revision must be at most 50");
    rejects(editMessageSchema, { content: "fixed typo", revision: 2.5 }, "Revision must be a whole number");
  });

  it("[invalid] report with an unknown reason or 501-character details is rejected", () => {
    accepts(reportMessageSchema, { reason: "OTHER", details: "d".repeat(500) });
    rejects(reportMessageSchema, { reason: "RUDE" }, "Reason must be one of the listed values");
    rejects(reportMessageSchema, { reason: "spam" }, "Reason must be one of the listed values");
    rejects(reportMessageSchema, { reason: "OTHER", details: "d".repeat(501) }, "Details must be at most 500 characters");
  });

  it("[normal/invalid] mute: null unmutes, an ISO time mutes, plain words are rejected", () => {
    assert.equal(accepts(muteRoomSchema, { mutedUntil: null }).mutedUntil, null);
    accepts(muteRoomSchema, { mutedUntil: "2026-11-20T17:00:00Z" });
    accepts(muteRoomSchema, { mutedUntil: "2026-11-20T09:00:00-08:00" });
    rejects(muteRoomSchema, { mutedUntil: "tomorrow" }, "mutedUntil must be null or an ISO timestamp");
    rejects(muteRoomSchema, { mutedUntil: "forever" }, "mutedUntil must be null or an ISO timestamp");
  });
});
