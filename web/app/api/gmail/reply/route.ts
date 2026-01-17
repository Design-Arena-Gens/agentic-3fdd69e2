import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { createGmailClient } from "@/lib/google";

type ReplyPayload = {
  messageId?: string;
  threadId?: string | null;
  to?: string | null;
  subject?: string | null;
  body?: string;
  messageHeaderId?: string | null;
};

type EncodedEmailInput = {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
};

function encodeEmail({ to, subject, body, inReplyTo }: EncodedEmailInput) {
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=\"UTF-8\"",
    "Content-Transfer-Encoding: 7bit",
  ];

  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
    headers.push(`References: ${inReplyTo}`);
  }

  const lines = [...headers, "", body];

  return Buffer.from(lines.join("\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const payload = (await request.json()) as ReplyPayload;

  if (!payload.messageId || !payload.threadId || !payload.to || !payload.subject || !payload.body) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  try {
    const gmail = createGmailClient(session.accessToken, session.refreshToken);

    const raw = encodeEmail({
      to: payload.to,
      subject: payload.subject.startsWith("Re:") ? payload.subject : `Re: ${payload.subject}`,
      body: payload.body,
      inReplyTo: payload.messageHeaderId ?? undefined,
    });

    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
        threadId: payload.threadId ?? undefined,
      },
    });

    await gmail.users.messages.modify({
      userId: "me",
      id: payload.messageId,
      requestBody: {
        removeLabelIds: ["UNREAD"],
        addLabelIds: ["STARRED"],
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to send reply", error);
    return NextResponse.json(
      { error: "Failed to send reply" },
      { status: 500 },
    );
  }
}
