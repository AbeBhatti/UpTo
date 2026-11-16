"use client";

/**
 * Chat: room list, message thread, send. REST with a refresh — no sockets.
 * Rooms and the open thread re-fetch on Refresh, after sending, and every
 * 15 seconds while the tab is visible.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ApiResponse, Me, Message, Room } from "@upto/contracts";
import { Banner, Button, cx } from "../../create/_shared/form";
import { MESSAGE_MAX, currentUser, listMessages, listRooms, sendMessage } from "../_lib/chatApi";
import c from "./chat.module.css";

const AUTO_REFRESH_MS = 15_000;

type ApiError = Extract<ApiResponse<never>, { ok: false }>["error"];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function roomTitle(room: Room, meId: string | null) {
  if (room.name) return room.name;
  const others = room.members.filter((m) => m.id !== meId);
  return others.map((m) => m.name).join(", ") || "Just you";
}

function clock(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString("en-US", sameDay ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function ChatScreen() {
  const [me, setMe] = useState<Me | null>(null);
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [roomsError, setRoomsError] = useState<ApiError | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const openIdRef = useRef<string | null>(null);
  openIdRef.current = openId;

  const loadRooms = useCallback(async () => {
    const res = await listRooms();
    if (res.ok) {
      setRooms(res.data);
      setRoomsError(null);
      setOpenId((cur) => cur ?? res.data[0]?.id ?? null);
    } else {
      setRoomsError(res.error);
    }
  }, []);

  const loadThread = useCallback(async (roomId: string) => {
    const res = await listMessages(roomId);
    if (openIdRef.current !== roomId) return; // switched rooms meanwhile
    if (res.ok) {
      setMessages(res.data);
      setThreadError(null);
      // The server marks the room read when we fetch it.
      setRooms((rs) => rs?.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r)) ?? rs);
    } else {
      setThreadError(res.error.message);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadRooms(), openIdRef.current ? loadThread(openIdRef.current) : null]);
    setRefreshing(false);
  }, [loadRooms, loadThread]);

  useEffect(() => {
    void currentUser().then((r) => r.ok && setMe(r.data));
    void loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    if (!openId) return;
    setMessages(null);
    setSendError(null);
    void loadThread(openId);
  }, [openId, loadThread]);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const trimmed = draft.trim();
  const tooLong = trimmed.length > MESSAGE_MAX;

  async function send() {
    if (!openId || !trimmed || tooLong || sending) return;
    setSending(true);
    setSendError(null);
    const res = await sendMessage(openId, trimmed);
    setSending(false);
    if (!res.ok) return setSendError(res.error.message);
    setDraft("");
    setMessages((m) => [...(m ?? []), res.data]);
    setRooms((rs) => rs?.map((r) => (r.id === openId ? { ...r, lastMessage: res.data } : r)) ?? rs);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  if (roomsError && (roomsError.code === "unauthorized" || roomsError.code === "forbidden")) {
    return <Banner tone="danger" title="Sign in to see your chats" />;
  }

  const open = rooms?.find((r) => r.id === openId) ?? null;
  const meId = me?.id ?? null;

  return (
    <div className={c.layout}>
      <section className={c.pane} aria-label="Chats">
        <div className={c.paneHead}>
          <h1 className={c.paneTitle}>Chat</h1>
          <Button variant="secondary" className={c.small} busy={refreshing} busyLabel="Refreshing…" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>
        {roomsError ? (
          <p className={c.empty}>{roomsError.message}</p>
        ) : rooms === null ? (
          <p className={c.empty}>Loading…</p>
        ) : rooms.length === 0 ? (
          <p className={c.empty}>No chats yet.</p>
        ) : (
          <ul className={c.roomList}>
            {rooms.map((r) => {
              const title = roomTitle(r, meId);
              const last = r.lastMessage;
              return (
                <li key={r.id}>
                  <button type="button" className={c.room} aria-current={r.id === openId} onClick={() => setOpenId(r.id)}>
                    <span className={c.avatar} aria-hidden>
                      {initials(title)}
                    </span>
                    <span className={c.roomText}>
                      <span className={c.roomName}>{title}</span>
                      <span className={c.roomPreview}>
                        {last ? `${last.sender.id === meId ? "You" : last.sender.name.split(" ")[0]}: ${last.content}` : "No messages yet"}
                      </span>
                    </span>
                    {r.unreadCount > 0 ? (
                      <span className={c.unread} aria-label={`${r.unreadCount} unread`}>
                        {r.unreadCount}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={c.pane} aria-label={open ? roomTitle(open, meId) : "Conversation"}>
        {open ? (
          <>
            <div className={c.paneHead}>
              <h2 className={c.paneTitle}>{roomTitle(open, meId)}</h2>
              <span className={c.paneSub}>{open.type === "GROUP" ? `${open.members.length} people` : "Direct message"}</span>
            </div>

            <div className={c.thread} ref={threadRef} aria-live="polite">
              {threadError ? (
                <p className={c.empty}>{threadError}</p>
              ) : messages === null ? (
                <p className={c.empty}>Loading…</p>
              ) : messages.length === 0 ? (
                <p className={c.empty}>Say hi.</p>
              ) : (
                messages.map((m) => {
                  const mine = m.sender.id === meId;
                  return (
                    <div key={m.id} className={cx(c.msg, mine && c.mine)}>
                      {!mine && open.type === "GROUP" ? <span className={c.sender}>{m.sender.name}</span> : null}
                      <p className={c.bubble}>{m.content}</p>
                      <span className={c.time}>{clock(m.createdAt)}</span>
                    </div>
                  );
                })
              )}
            </div>

            <form
              className={c.composer}
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              {sendError ? <Banner tone="danger">{sendError}</Banner> : null}
              <div className={c.composerRow}>
                <textarea
                  className={c.composerInput}
                  aria-label="Message"
                  placeholder="Message"
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  aria-invalid={tooLong}
                />
                <Button type="submit" busy={sending} busyLabel="Sending…" disabled={!trimmed || tooLong}>
                  Send
                </Button>
              </div>
              {trimmed.length > MESSAGE_MAX - 500 ? (
                <span className={cx(c.paneSub, tooLong && c.over)}>
                  {trimmed.length.toLocaleString()} / {MESSAGE_MAX.toLocaleString()}
                </span>
              ) : null}
            </form>
          </>
        ) : (
          <p className={c.empty}>{rooms === null ? "Loading…" : "Pick a chat."}</p>
        )}
      </section>
    </div>
  );
}
