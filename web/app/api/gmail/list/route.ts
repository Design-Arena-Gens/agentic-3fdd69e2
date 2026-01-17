import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { createGmailClient } from "@/lib/google";

const METADATA_HEADERS = ["Subject", "From", "Date", "Message-ID"];

type MessageHeader = {
  name?: string | null;
  value?: string | null;
};

function parseEmailAddress(headerValue: string | null | undefined) {
  if (!headerValue) {
    return { name: null, address: null };
  }

  const match = headerValue.match(/^(.*?)(?:\s*<(.+?)>)?$/);
  if (!match) {
    return { name: null, address: headerValue };
  }

  const name = match[2] ? match[1].replace(/"/g, "").trim() : null;
  const address = match[2] ?? match[1];
  return {
    name: name?.length ? name : null,
    address: address?.trim() ?? null,
  };
}

function headerValue(headers: MessageHeader[] | null | undefined, key: string) {
  return headers?.find((header) => header.name === key)?.value ?? null;
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const gmail = createGmailClient(session.accessToken, session.refreshToken);

    const { data } = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      q: "is:unread",
      maxResults: 15,
    });

    const messages = data.messages ?? [];

    if (!messages.length) {
      return NextResponse.json({ messages: [] });
    }

    const detailed = await Promise.all(
      messages.map(async ({ id, threadId }) => {
        if (!id) return null;

        const detail = await gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: METADATA_HEADERS,
        });

        const headers = detail.data.payload?.headers ?? [];
        const subject = headerValue(headers, "Subject") ?? "(no subject)";
        const fromHeader = headerValue(headers, "From");
        const date = headerValue(headers, "Date");
        const messageIdHeader = headerValue(headers, "Message-ID");
        const { name, address } = parseEmailAddress(fromHeader);

        return {
          id,
          threadId: threadId ?? detail.data.threadId ?? null,
          subject,
          from: fromHeader,
          fromName: name,
          fromAddress: address,
          snippet: detail.data.snippet ?? "",
          internalDate: detail.data.internalDate ?? null,
          date,
          messageIdHeader,
        };
      }),
    );

    return NextResponse.json({
      messages: detailed.filter(
        (message): message is NonNullable<typeof message> => Boolean(message),
      ),
    });
  } catch (error) {
    console.error("Failed to list Gmail messages", error);
    return NextResponse.json(
      { error: "Failed to load messages" },
      { status: 500 },
    );
  }
}
