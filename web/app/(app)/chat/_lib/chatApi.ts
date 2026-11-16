/**
 * Chat routes (Abe's `controllers/chat.*`). REST with a refresh, no sockets.
 *   GET  /chat/rooms                 → Room[]
 *   GET  /chat/rooms/:id/messages    → Message[], oldest first; marks the room read
 *   POST /chat/rooms/:id/messages    → Message
 *   GET  /auth/me                    → { user: Me }  (to tell my messages apart)
 */
import type { AuthResponse, Me, Message, Room, ApiResponse } from "@upto/contracts";
import { call } from "../../create/_shared/api";

/** Same limit as Abe's sendMessageSchema: trimmed, 1 to 4,000 characters. */
export const MESSAGE_MAX = 4000;

export const listRooms = () => call<Room[]>("listRooms");

export const listMessages = (roomId: string) => call<Message[]>("listMessages", { params: { id: roomId } });

export const sendMessage = (roomId: string, content: string) =>
  call<Message>("sendMessage", { params: { id: roomId }, body: { content } });

export async function currentUser(): Promise<ApiResponse<Me>> {
  const res = await call<AuthResponse>("me");
  return res.ok ? { ok: true, data: res.data.user } : res;
}
