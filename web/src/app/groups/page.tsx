"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { localeFor, type UiLanguage } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { AppHeader, EmptyState, Footer, LoadingSkeleton } from "@/components";
import { cx } from "@/lib/cx";

// ---------------------------------------------------------------------------
// /groups — study groups (list + detail with chat/announcements/drive/members
// tabs, mirroring the backend GroupSpace parity surface). Client-side selected
// group state, no sub-routes; chat polls the same ?after= ISO cursor as DMs.
// ---------------------------------------------------------------------------

interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  faculty: { id: string; name: string };
  year: { id: string; label: string };
  joinPolicy: string;
  memberCount: number | null;
  myRole: string | null;
  createdAt: string;
}

interface GroupMessage {
  id: string;
  userId: string;
  senderName: string | null;
  body: string;
  createdAt: string;
}

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  authorName: string | null;
  createdAt: string;
}

interface AttachmentRow {
  id: string;
  title: string;
  url: string;
  uploadedBy: string | null;
  createdAt: string;
}

interface MemberRow {
  userId: string;
  role: string;
  joinedAt: string;
  fullName: string | null;
}

interface JoinRequestRow {
  userId: string;
  fullName: string | null;
  requestedAt: string;
}

interface FacultyRow {
  id: string;
  name: string;
}

interface YearRow {
  id: string;
  label: string;
}

type Tab = "chat" | "announcements" | "drive" | "members";

const CHAT_POLL_MS = 4000;

function formatWhen(iso: string, lang: UiLanguage): string {
  try {
    return new Date(iso).toLocaleString(localeFor(lang), {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function GroupsPage() {
  const { logout } = useAuth();
  const { user, isHydrated } = useRequireAuth();
  const { lang, t } = useLanguage();

  function handleLogout() {
    void logout();
  }

  // â”€â”€ list state â”€â”€
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [mineOnly, setMineOnly] = useState(false);
  const [facultyFilter, setFacultyFilter] = useState("");
  const [faculties, setFaculties] = useState<FacultyRow[]>([]);
  const [yearsForCreate, setYearsForCreate] = useState<YearRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // â”€â”€ create form â”€â”€
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createFacultyId, setCreateFacultyId] = useState("");
  const [createYearId, setCreateYearId] = useState("");
  const [createPolicy, setCreatePolicy] = useState<"open" | "request">("open");
  const [createBusy, setCreateBusy] = useState(false);

  // â”€â”€ detail state â”€â”€
  const [selected, setSelected] = useState<GroupSummary | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [requests, setRequests] = useState<JoinRequestRow[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lastCursorRef = useRef<string | null>(null);
  const messagesRef = useRef<GroupMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const flash = useCallback((text: string) => {
    setActionNotice(text);
    setTimeout(() => setActionNotice(null), 4000);
  }, []);

  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const isMember = Boolean(selected && selected.myRole);
  const isOwner = selected?.myRole === "owner";

  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (mineOnly) params.set("mine", "true");
    if (facultyFilter) params.set("facultyId", facultyFilter);
    const data = await apiFetch<{ groups: GroupSummary[]; pagination: { total: number } }>(
      `/groups?${params.toString()}`
    );
    setGroups(data.groups);
    setTotal(data.pagination.total);
  }, [page, mineOnly, facultyFilter]);

  // Faculty list for the create form (public; no faculty/year filters in the
  // backend list query, matching the bank's public browse surface).
  useEffect(() => {
    if (!isHydrated) return;
    apiFetch<{ faculties: FacultyRow[] }>("/faculties")
      .then((data) => setFaculties(data.faculties ?? []))
      .catch(() => setFaculties([]));
  }, [isHydrated]);

  // Only fetches; clearing happens in the faculty select's onChange so the
  // effect body never calls setState synchronously (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!createFacultyId) return;
    apiFetch<{ years: YearRow[] }>(`/faculties/${createFacultyId}/years`)
      .then((data) => setYearsForCreate(data.years ?? []))
      .catch(() => setYearsForCreate([]));
  }, [createFacultyId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        if (cancelled) return;
        await loadList();
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : t("grp.loadFailed"));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    if (isHydrated) void load();
    return () => {
      cancelled = true;
    };
  }, [isHydrated, loadList, t]);

  async function openDetail(summary: GroupSummary) {
    setActionError(null);
    setDetailError(null);
    setSelected(summary);
    setTab("chat");
    setMessages([]);
    setAnnouncements([]);
    setAttachments([]);
    setMembers([]);
    setRequests([]);
    lastCursorRef.current = null;
    try {
      const data = await apiFetch<{ group: GroupSummary }>(`/groups/${summary.id}`);
      setSelected(data.group);
      await refreshDetail(data.group);
    } catch (err) {
      setDetailError(err instanceof ApiError ? err.message : t("grp.loadFailed"));
    }
  }

  async function refreshDetail(group: GroupSummary) {
    const memberId = Boolean(group.myRole);
    const jobs: Promise<void>[] = [];
    if (memberId) {
      jobs.push(
        apiFetch<{ messages: GroupMessage[] }>(`/groups/${group.id}/messages`)
          .then((data) => {
            setMessages(data.messages);
            lastCursorRef.current = data.messages.length
              ? data.messages[data.messages.length - 1].createdAt
              : null;
          })
          .catch(() => undefined)
      );
      jobs.push(
        apiFetch<{ announcements: AnnouncementRow[] }>(`/groups/${group.id}/announcements`)
          .then((data) => setAnnouncements(data.announcements))
          .catch(() => undefined)
      );
      jobs.push(
        apiFetch<{ attachments: AttachmentRow[] }>(`/groups/${group.id}/attachments`)
          .then((data) => setAttachments(data.attachments))
          .catch(() => undefined)
      );
      jobs.push(
        apiFetch<{ members: MemberRow[] }>(`/groups/${group.id}/members`)
          .then((data) => setMembers(data.members))
          .catch(() => undefined)
      );
    }
    if (group.myRole === "owner") {
      jobs.push(
        apiFetch<{ requests: JoinRequestRow[] }>(`/groups/${group.id}/requests`)
          .then((data) => setRequests(data.requests))
          .catch(() => undefined)
      );
    }
    await Promise.all(jobs);
  }

  // Chat polling — after the cursor, append anything new.
  useEffect(() => {
    if (!selected || tab !== "chat" || !selected.myRole) return;
    const groupId = selected.id;
    const interval = setInterval(() => {
      const after = lastCursorRef.current;
      apiFetch<{ messages: GroupMessage[] }>(
        `/groups/${groupId}/messages${after ? `?after=${encodeURIComponent(after)}` : ""}`
      )
        .then((data) => {
          if (data.messages.length === 0) return;
          const existing = messagesRef.current;
          const seen = new Set(existing.map((m) => m.id));
          const fresh = data.messages.filter((m) => !seen.has(m.id));
          if (fresh.length > 0) {
            setMessages([...existing, ...fresh]);
            lastCursorRef.current = fresh[fresh.length - 1].createdAt;
          }
        })
        .catch(() => undefined);
    }, CHAT_POLL_MS);
    return () => clearInterval(interval);
  }, [selected, tab]);

  async function reloadSelected() {
    if (!selected) return;
    const data = await apiFetch<{ group: GroupSummary }>(`/groups/${selected.id}`);
    setSelected(data.group);
    await refreshDetail(data.group);
  }

  async function handleJoin(groupId: string) {
    setActionError(null);
    try {
      const status = await apiFetch<{ status: string }>(`/groups/${groupId}/join`, { method: "POST" });
      if (status.status === "requested") {
        flash(t("grp.requestSentNotice"));
      } else {
        flash(t("grp.joinedNotice"));
      }
      void loadList();
      const detail = groups.find((g) => g.id === groupId);
      if (detail) await openDetail({ ...detail, myRole: status.status === "requested" ? null : "member" });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("grp.actionFailed"));
    }
  }

  async function handleLeave(groupId: string) {
    setActionError(null);
    try {
      await apiFetch(`/groups/${groupId}/leave`, { method: "POST" });
      flash(t("grp.leftNotice"));
      setSelected(null);
      void loadList();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("grp.actionFailed"));
    }
  }

  async function handleDelete(groupId: string) {
    setActionError(null);
    if (!window.confirm(t("grp.deleteConfirm"))) return;
    try {
      await apiFetch(`/groups/${groupId}`, { method: "DELETE" });
      flash(t("grp.deletedNotice"));
      setSelected(null);
      void loadList();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("grp.actionFailed"));
    }
  }

  async function handleCreate() {
    setActionError(null);
    setCreateBusy(true);
    try {
      const body: Record<string, unknown> = {
        name: createName,
        facultyId: createFacultyId,
        yearId: createYearId,
        joinPolicy: createPolicy,
      };
      if (createDescription.trim()) body.description = createDescription.trim();
      const data = await apiFetch<{ group: GroupSummary }>("/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setShowCreate(false);
      setCreateName("");
      setCreateDescription("");
      setCreatePolicy("open");
      await openDetail(data.group);
      await loadList();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("grp.actionFailed"));
    } finally {
      setCreateBusy(false);
    }
  }

  async function sendChat() {
    if (!selected || !chatInput.trim()) return;
    setBusy(true);
    try {
      const data = await apiFetch<{ message: GroupMessage }>(`/groups/${selected.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: chatInput.trim() }),
      });
      setMessages([...messagesRef.current, data.message]);
      lastCursorRef.current = data.message.createdAt;
      setChatInput("");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("grp.actionFailed"));
    } finally {
      setBusy(false);
    }
  }


  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");

  async function publishAnnouncement() {
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(`/groups/${selected.id}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: announcementTitle.trim(), body: announcementBody.trim() }),
      });
      setAnnouncementTitle("");
      setAnnouncementBody("");
      await reloadSelected();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("grp.actionFailed"));
    } finally {
      setBusy(false);
    }
  }

  const [attachmentTitle, setAttachmentTitle] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");

  async function addAttachment() {
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(`/groups/${selected.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: attachmentTitle.trim(), url: attachmentUrl.trim() }),
      });
      setAttachmentTitle("");
      setAttachmentUrl("");
      await reloadSelected();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("grp.actionFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeAttachment(attachmentId: string) {
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(`/groups/${selected.id}/attachments/${attachmentId}`, { method: "DELETE" });
      await reloadSelected();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("grp.actionFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function decideRequest(requesterId: string, action: "approve" | "reject") {
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(`/groups/${selected.id}/requests/${requesterId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await reloadSelected();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("grp.actionFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-card-padding">
        <LoadingSkeleton className="h-8 w-48" />
      </main>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="min-h-screen dark:bg-slate-950 bg-white">
      <AppHeader user={user} onLogout={handleLogout} />
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {selected ? (
          <>
            <div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                â† {t("grp.title")}
              </button>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{selected.name}</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {selected.faculty.name} Â· {selected.year.label}
                {selected.memberCount !== null
                  ? ` Â· ${t("grp.membersCount").replace("{count}", String(selected.memberCount))}`
                  : ""}
              </p>
              {selected.description && (
                <p className="text-sm text-slate-700 dark:text-slate-300 mt-2">{selected.description}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(selected.id)}
                    disabled={busy}
                    className="rounded-full border border-rose-300 dark:border-rose-800 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950 disabled:opacity-50"
                  >
                    {t("grp.delete")}
                  </button>
                )}
                {isMember && !isOwner && (
                  <button
                    type="button"
                    onClick={() => void handleLeave(selected.id)}
                    disabled={busy}
                    className="rounded-full border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-50"
                  >
                    {t("grp.leave")}
                  </button>
                )}
                {!isMember && selected.joinPolicy === "open" && (
                  <button
                    type="button"
                    onClick={() => void handleJoin(selected.id)}
                    disabled={busy}
                    className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {t("grp.join")}
                  </button>
                )}
                {!isMember && selected.joinPolicy === "request" && (
                  <button
                    type="button"
                    onClick={() => void handleJoin(selected.id)}
                    disabled={busy}
                    className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {t("grp.request")}
                  </button>
                )}
              </div>
            </div>

            {!isMember && (
              <EmptyState
                title={t("grp.notMember")}
                description={t("grp.joinFirst")}
                action={{ href: "/groups", label: t("grp.backHome") }}
              />
            )}

            {isMember && (
              <>
                <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
                  {(["chat", "announcements", "drive", "members"] as Tab[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTab(key)}
                      className={cx(
                        "px-4 py-2 text-sm font-semibold rounded-t-lg",
                        tab === key
                          ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      )}
                    >
                      {t(`grp.tabs${key.charAt(0).toUpperCase()}${key.slice(1)}` as "grp.tabsChat")}
                    </button>
                  ))}
                </nav>

            {actionNotice && (
              <p className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
                {actionNotice}
              </p>
            )}
            {actionError && (
              <p className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950 px-4 py-3 text-sm text-rose-800 dark:text-rose-200">
                {actionError}
              </p>
            )}
            {detailError && (
              <p className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950 px-4 py-3 text-sm text-rose-800 dark:text-rose-200">
                {detailError}
              </p>
            )}

                {tab === "chat" && (
                  <section className="space-y-3">
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2 min-h-[16rem] max-h-[28rem] overflow-y-auto">
                      {messages.length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t("grp.chatEmpty")}</p>
                      ) : (
                        messages.map((m) => (
                          <div key={m.id} className="text-sm">
                            <span className="font-semibold text-blue-700 dark:text-blue-300">
                              {m.senderName}
                            </span>
                            <span className="ml-2 text-xs text-slate-400">{formatWhen(m.createdAt, lang)}</span>
                            <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">{m.body}</p>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && chatInput.trim()) void sendChat();
                        }}
                        placeholder={t("grp.placeholder")}
                        className="flex-1 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => void sendChat()}
                        disabled={busy || !chatInput.trim()}
                        className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t("grp.send")}
                      </button>
                    </div>
                  </section>
                )}

                {tab === "announcements" && (
                  <section className="space-y-3">
                    {isOwner && (
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                          {t("grp.newAnnouncement")}
                        </h3>
                        <input
                          type="text"
                          value={announcementTitle}
                          onChange={(e) => setAnnouncementTitle(e.target.value)}
                          placeholder={t("grp.announcementTitleLabel")}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                        />
                        <textarea
                          value={announcementBody}
                          onChange={(e) => setAnnouncementBody(e.target.value)}
                          placeholder={t("grp.announcementBodyLabel")}
                          rows={3}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => void publishAnnouncement()}
                          disabled={busy || !announcementTitle.trim() || !announcementBody.trim()}
                          className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {t("grp.publish")}
                        </button>
                      </div>
                    )}
                    {announcements.length === 0 ? (
                      <EmptyState
                        title={t("grp.announcementsEmpty")}
                        description={t("grp.joinFirst")}
                        action={{ href: "/groups", label: t("grp.backHome") }}
                      />
                    ) : (
                      announcements.map((a) => (
                        <article
                          key={a.id}
                          className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4"
                        >
                          <h3 className="font-semibold text-slate-900 dark:text-white">{a.title}</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {a.authorName} Â· {formatWhen(a.createdAt, lang)}
                          </p>
                          <p className="mt-2 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{a.body}</p>
                        </article>
                      ))
                    )}
                  </section>
                )}

                {tab === "drive" && (
                  <section className="space-y-3">
                    {isOwner && (
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t("grp.addAttachment")}</h3>
                        <input
                          type="text"
                          value={attachmentTitle}
                          onChange={(e) => setAttachmentTitle(e.target.value)}
                          placeholder={t("grp.attachmentTitleLabel")}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                        />
                        <input
                          type="text"
                          value={attachmentUrl}
                          onChange={(e) => setAttachmentUrl(e.target.value)}
                          placeholder={t("grp.attachmentUrlLabel")}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => void addAttachment()}
                          disabled={busy || !attachmentTitle.trim() || !attachmentUrl.trim()}
                          className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {t("grp.addButton")}
                        </button>
                      </div>
                    )}
                    {attachments.length === 0 ? (
                      <EmptyState
                        title={t("grp.attachmentsEmpty")}
                        description={t("grp.joinFirst")}
                        action={{ href: "/groups", label: t("grp.backHome") }}
                      />
                    ) : (
                      <ul className="divide-y divide-slate-200 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800">
                        {attachments.map((a) => (
                          <li key={a.id} className="px-4 py-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{a.title}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {a.uploadedBy} Â· {formatWhen(a.createdAt, lang)}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <a
                                href={a.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-full border border-blue-300 dark:border-blue-800 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950"
                              >
                                {t("grp.open")}
                              </a>
                              {(isOwner || a.uploadedBy === user.fullName) && (
                                <button
                                  type="button"
                                  onClick={() => void removeAttachment(a.id)}
                                  disabled={busy}
                                  className="rounded-full border border-rose-300 dark:border-rose-800 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 disabled:opacity-50"
                                >
                                  {t("grp.remove")}
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}

                {tab === "members" && (
                  <section className="space-y-3">
                    {isOwner && (
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t("grp.requestsTitle")}</h3>
                        {requests.length === 0 ? (
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("grp.requestsEmpty")}</p>
                        ) : (
                          <ul className="mt-2 divide-y divide-slate-200 dark:divide-slate-800">
                            {requests.map((r) => (
                              <li key={r.userId} className="py-2 flex items-center justify-between gap-3 text-sm">
                                <span className="text-slate-800 dark:text-slate-200">{r.fullName ?? r.userId}</span>
                                <span className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void decideRequest(r.userId, "approve")}
                                    disabled={busy}
                                    className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    {t("grp.approve")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void decideRequest(r.userId, "reject")}
                                    disabled={busy}
                                    className="rounded-full border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-50"
                                  >
                                    {t("grp.reject")}
                                  </button>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    <ul className="divide-y divide-slate-200 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800">
                      {members.map((m) => (
                        <li key={m.userId} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                          <span className="text-slate-800 dark:text-slate-200">{m.fullName ?? m.userId}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {m.role === "owner" ? t("grp.roleOwner") : t("grp.roleMember")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <header className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t("grp.title")}</h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{t("grp.subtitle")}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate((v) => !v)}
                className="shrink-0 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {t("grp.createButton")}
              </button>
            </header>

            {error && (
              <EmptyState
                title={t("grp.loadFailed")}
                description={error}
                action={{ href: "/dashboard", label: t("grp.backHome") }}
              />
            )}

            {showCreate && (
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-3">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t("grp.createTitle")}</h2>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder={t("grp.nameLabel")}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder={t("grp.descriptionLabel")}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <select
                    value={createFacultyId}
                    onChange={(e) => {
                      setCreateFacultyId(e.target.value);
                      setCreateYearId("");
                      setYearsForCreate([]);
                    }}
                    className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="">{t("grp.facultyLabel")}</option>
                    {faculties.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={createYearId}
                    onChange={(e) => setCreateYearId(e.target.value)}
                    className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="">{t("grp.yearLabel")}</option>
                    {yearsForCreate.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCreatePolicy("open")}
                    className={cx(
                      "rounded-full px-3 py-1.5 text-xs font-semibold",
                      createPolicy === "open"
                        ? "bg-blue-600 text-white"
                        : "border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                    )}
                  >
                    {t("grp.joinPolicyOpen")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreatePolicy("request")}
                    className={cx(
                      "rounded-full px-3 py-1.5 text-xs font-semibold",
                      createPolicy === "request"
                        ? "bg-blue-600 text-white"
                        : "border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                    )}
                  >
                    {t("grp.joinPolicyRequest")}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCreate()}
                    disabled={createBusy || !createName.trim() || !createFacultyId || !createYearId}
                    className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t("grp.createSubmit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="rounded-full border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300"
                  >
                    {t("grp.cancel")}
                  </button>
                </div>
              </section>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setMineOnly(false);
                  setPage(1);
                }}
                className={cx(
                  "rounded-full px-3 py-1.5 text-xs font-semibold",
                  !mineOnly ? "bg-blue-600 text-white" : "border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                )}
              >
                {t("grp.allGroups")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMineOnly(true);
                  setPage(1);
                }}
                className={cx(
                  "rounded-full px-3 py-1.5 text-xs font-semibold",
                  mineOnly ? "bg-blue-600 text-white" : "border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                )}
              >
                {t("grp.mineOnly")}
              </button>
              <select
                value={facultyFilter}
                onChange={(e) => {
                  setFacultyFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
              >
                <option value="">{t("grp.facultyLabel")}</option>
                {(faculties as FacultyRow[]).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            {isLoading && <LoadingSkeleton className="h-96" />}

            {!isLoading && !error && groups.length === 0 && (
              <EmptyState
                title={t("grp.empty")}
                description={t("grp.emptyDesc")}
                action={{ href: "/dashboard", label: t("grp.backHome") }}
              />
            )}

            {!isLoading && !error && groups.length > 0 && (
              <ul className="space-y-3">
                {groups.map((g) => (
                  <li key={g.id}>
                    <article className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-white">{g.name}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {g.faculty.name} Â· {g.year.label}
                          {g.memberCount !== null
                            ? ` Â· ${t("grp.membersCount").replace("{count}", String(g.memberCount))}`
                            : ""}
                        </p>
                        {g.description && (
                          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{g.description}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void openDetail(g)}
                        className="shrink-0 rounded-full border border-blue-300 dark:border-blue-800 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950"
                      >
                        {g.myRole === "owner" ? t("grp.ownerBadge") : t("grp.open")}
                      </button>
                    </article>
                  </li>
                ))}
              </ul>
            )}

            {!isLoading && !error && totalPages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-full border border-slate-300 dark:border-slate-700 px-3 py-1.5 font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-50"
                >
                  â†
                </button>
                <span className="text-slate-600 dark:text-slate-400">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-full border border-slate-300 dark:border-slate-700 px-3 py-1.5 font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-50"
                >
                  â†’
                </button>
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
