'use client';

import { useEffect, useMemo, useState } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';

import { useAuthConfigured } from '@/components/providers';

type GmailMessage = {
  id: string;
  threadId: string | null;
  subject: string;
  from: string | null;
  fromName: string | null;
  fromAddress: string | null;
  snippet: string;
  date: string | null;
  internalDate?: string | null;
  messageIdHeader?: string | null;
};

type MessagesResponse = {
  messages: GmailMessage[];
  error?: string;
};

const QUICK_REPLIES = [
  {
    id: 'acknowledge',
    label: 'Acknowledgement',
    body: (
      recipient: GmailMessage,
    ) => `Hi ${recipient.fromName ?? 'there'},\n\nThanks for reaching out about "${recipient.subject}". I received your message and will circle back with a full response soon.\n\nBest,\n`,
  },
  {
    id: 'schedule',
    label: 'Schedule a call',
    body: (
      recipient: GmailMessage,
    ) => `Hi ${recipient.fromName ?? 'there'},\n\nAppreciate the note regarding "${recipient.subject}". Happy to connect—would you have time for a quick call later this week? Let me know a few windows that work for you.\n\nThanks,\n`,
  },
  {
    id: 'follow-up',
    label: 'Ask for details',
    body: (
      recipient: GmailMessage,
    ) => `Hi ${recipient.fromName ?? 'there'},\n\nThanks for reaching out! Could you share a bit more detail about "${recipient.subject}" so I can help faster?\n\nLooking forward to your reply,\n`,
  },
];

function defaultReply(message: GmailMessage) {
  return QUICK_REPLIES[0]?.body(message) ?? '';
}

function smartReply(message: GmailMessage) {
  if (!message.fromAddress) {
    return defaultReply(message);
  }

  const cleanedSnippet = message.snippet.replace(/\s+/g, ' ').trim();
  const greeting = message.fromName ? `Hi ${message.fromName},` : 'Hello,';

  return `${greeting}\n\nThanks for getting in touch regarding "${message.subject}". ${cleanedSnippet.length ? `Here's what I understood from your note: ${cleanedSnippet}. ` : ''}I'll review the details and follow up with the next steps shortly.\n\nBest regards,\n`;
}

function formatDate(date: string | null) {
  if (!date) return 'Unknown date';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleString();
}

export default function InboxAssistant() {
  const authConfigured = useAuthConfigured();
  const { data: session, status } = useSession();
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isAuthenticated = status === 'authenticated' && authConfigured;
  const sessionError = session?.error;

  const canSend = useMemo(
    () => Object.values(replyDrafts).some((value) => value.trim().length > 0),
    [replyDrafts],
  );

  useEffect(() => {
    if (!authConfigured || !isAuthenticated) {
      setMessages([]);
      return;
    }

    let cancelled = false;

    async function loadMessages() {
      try {
        setLoadingMessages(true);
        setError(null);
        const response = await fetch('/api/gmail/list');
        const payload = (await response.json()) as MessagesResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load messages');
        }
        if (!cancelled) {
          setMessages(payload.messages);
          setReplyDrafts(
            Object.fromEntries(
              payload.messages.map((message) => [message.id, defaultReply(message)]),
            ),
          );
        }
      } catch (fetchError) {
        if (cancelled) return;
        console.error(fetchError);
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load messages');
      } finally {
        if (!cancelled) {
          setLoadingMessages(false);
        }
      }
    }

    loadMessages();

    return () => {
      cancelled = true;
    };
  }, [authConfigured, isAuthenticated]);

  useEffect(() => {
    if (!success) return;
    const timeout = setTimeout(() => setSuccess(null), 4500);
    return () => clearTimeout(timeout);
  }, [success]);

  const handleRefresh = async () => {
    if (!isAuthenticated) return;
    setLoadingMessages(true);
    setError(null);
    try {
      const response = await fetch('/api/gmail/list');
      const payload = (await response.json()) as MessagesResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to load messages');
      }
      setMessages(payload.messages);
      setReplyDrafts(
        Object.fromEntries(
          payload.messages.map((message) => [message.id, defaultReply(message)]),
        ),
      );
    } catch (refreshError) {
      console.error(refreshError);
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to refresh');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendReply = async (message: GmailMessage) => {
    if (!replyDrafts[message.id]) return;

    setSendingId(message.id);
    setError(null);

    try {
      const response = await fetch('/api/gmail/reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId: message.id,
          threadId: message.threadId,
          to: message.fromAddress ?? message.from,
          subject: message.subject,
          body: replyDrafts[message.id],
          messageHeaderId: message.messageIdHeader,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? 'Failed to send reply');
      }

      setSuccess(`Reply sent to ${message.fromName ?? message.fromAddress ?? 'recipient'}`);
      setMessages((prev) => prev.filter((item) => item.id !== message.id));
    } catch (sendError) {
      console.error(sendError);
      setError(sendError instanceof Error ? sendError.message : 'Failed to send reply');
    } finally {
      setSendingId(null);
    }
  };

  const handleSmartDraft = (message: GmailMessage) => {
    setReplyDrafts((prev) => ({
      ...prev,
      [message.id]: smartReply(message),
    }));
  };

  const handleTemplate = (message: GmailMessage, templateId: string) => {
    const template = QUICK_REPLIES.find((item) => item.id === templateId);
    if (!template) return;
    setReplyDrafts((prev) => ({
      ...prev,
      [message.id]: template.body(message),
    }));
  };

  const handleAutoAnswerAll = async () => {
    for (const message of messages) {
      if (!replyDrafts[message.id]?.trim()) continue;
      await handleSendReply(message);
    }
  };

  if (!authConfigured) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-b from-slate-900 to-slate-700 px-6 py-24 text-center text-white">
        <h1 className="text-4xl font-semibold sm:text-5xl">Finish configuring Gmail access</h1>
        <div className="max-w-xl space-y-4 text-base text-slate-200">
          <p>
            Add <code className="rounded bg-black/30 px-2 py-0.5">GOOGLE_CLIENT_ID</code>,{' '}
            <code className="rounded bg-black/30 px-2 py-0.5">GOOGLE_CLIENT_SECRET</code>, and{' '}
            <code className="rounded bg-black/30 px-2 py-0.5">NEXTAUTH_SECRET</code> environment variables, then redeploy.
          </p>
          <p>
            Once those are set, sign in with Google to start answering messages.
          </p>
        </div>
      </main>
    );
  }

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 text-zinc-500">
        <p>Loading your inbox…</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-gradient-to-b from-slate-900 to-slate-700 px-6 py-24 text-center text-white">
        <h1 className="text-4xl font-semibold sm:text-5xl">Gmail Auto-Responder</h1>
        <p className="max-w-xl text-lg text-slate-200">
          Connect your Gmail inbox and fire off thoughtful replies to unread emails in seconds. Pick a template, auto-draft a smart response, and send without leaving this page.
        </p>
        <button
          onClick={() => signIn('google')}
          className="rounded-full bg-white px-6 py-3 text-base font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-100"
        >
          Connect Gmail
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 pb-24 pt-10 text-zinc-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Unread Gmail Assistant</h1>
            <p className="text-sm text-zinc-500">
              Signed in as {session?.user?.email}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleRefresh}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:border-zinc-400 hover:bg-white"
              disabled={loadingMessages}
            >
              {loadingMessages ? 'Refreshing…' : 'Refresh inbox'}
            </button>
            <button
              onClick={() => signOut()}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              Sign out
            </button>
          </div>
        </header>

        {sessionError && (
          <div className="rounded-md bg-amber-100 px-4 py-3 text-sm text-amber-800">
            Session error: {sessionError}. Please reconnect your Google account.
          </div>
        )}

        {error && (
          <div className="rounded-md bg-rose-100 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-md bg-emerald-100 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        )}

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Quick reply templates</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Apply a template to a selected message, then personalize it before sending.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {QUICK_REPLIES.map((template) => (
              <article key={template.id} className="rounded-xl border border-zinc-200 p-4">
                <h3 className="text-sm font-semibold text-zinc-700">{template.label}</h3>
                <pre className="mt-2 whitespace-pre-wrap text-sm text-zinc-500">
                  {template.body({
                    id: 'preview',
                    threadId: null,
                    subject: 'Project update',
                    from: 'preview@example.com',
                    fromName: 'Alex',
                    fromAddress: 'preview@example.com',
                    snippet: 'Wanted to check on the status of the project.',
                    date: new Date().toISOString(),
                    messageIdHeader: undefined,
                  }).trim()}
                </pre>
              </article>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Unread emails ({messages.length})</h2>
            <button
              onClick={handleAutoAnswerAll}
              disabled={!canSend || sendingId !== null || !messages.length}
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              Answer all with drafts
            </button>
          </div>

          {loadingMessages && !messages.length ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500">
              Loading unread emails…
            </div>
          ) : null}

          {!loadingMessages && !messages.length ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500">
              No unread emails detected in your inbox.
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-6">
            {messages.map((message) => (
              <article key={message.id} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900">{message.subject}</h3>
                    <p className="text-sm text-zinc-500">
                      From {message.fromName ?? message.fromAddress ?? 'Unknown sender'} · {formatDate(message.date)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSmartDraft(message)}
                      className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold transition hover:border-zinc-400 hover:bg-white"
                    >
                      Smart draft
                    </button>
                    {QUICK_REPLIES.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleTemplate(message, template.id)}
                        className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-white"
                      >
                        {template.label}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="mt-4 rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600">
                  {message.snippet || 'No preview available.'}
                </p>

                <label className="mt-4 block text-sm font-semibold text-zinc-700" htmlFor={`reply-${message.id}`}>
                  Your reply
                </label>
                <textarea
                  id={`reply-${message.id}`}
                  className="mt-2 w-full rounded-xl border border-zinc-300 bg-white p-4 text-sm text-zinc-800 shadow-inner focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  rows={6}
                  value={replyDrafts[message.id] ?? ''}
                  onChange={(event) =>
                    setReplyDrafts((prev) => ({
                      ...prev,
                      [message.id]: event.target.value,
                    }))
                  }
                />

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-zinc-500">
                    Replies are sent as {session?.user?.email}. Messages are marked as read and starred after sending.
                  </p>
                  <button
                    onClick={() => handleSendReply(message)}
                    disabled={sendingId === message.id || !replyDrafts[message.id]?.trim()}
                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
                  >
                    {sendingId === message.id ? 'Sending…' : 'Send reply'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
