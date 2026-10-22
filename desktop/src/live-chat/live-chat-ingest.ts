import type { LiveChatMessage, LiveChatMode, LiveChatProviderId } from "./types";

const MAX_INCOMING = 200;
const MAX_APPROVED = 100;

export type LiveChatIngestSession = {
  config: { mode: LiveChatMode };
  incoming: LiveChatMessage[];
  approved: LiveChatMessage[];
  current: LiveChatMessage | null;
  receivedCount: number;
  approvedCount: number;
};

function sameMessage(entry: LiveChatMessage, provider: LiveChatProviderId, providerMessageId: string): boolean {
  return entry.provider === provider && entry.providerMessageId === providerMessageId;
}

/** Returns true when the on-air message changed and the display should refresh. */
export function ingestLiveChatMessage(
  session: LiveChatIngestSession,
  message: LiveChatMessage,
): boolean {
  if (message.metadata?.deleted === true) {
    return removeLiveChatMessage(
      session,
      message.provider,
      String(message.metadata.deletedProviderMessageId || message.providerMessageId),
    );
  }
  const duplicate =
    session.incoming.some((entry) =>
      sameMessage(entry, message.provider, message.providerMessageId),
    ) ||
    session.approved.some((entry) =>
      sameMessage(entry, message.provider, message.providerMessageId),
    ) ||
    (session.current
      ? sameMessage(session.current, message.provider, message.providerMessageId)
      : false);
  if (duplicate) {
    return false;
  }
  session.receivedCount += 1;
  session.incoming = [message, ...session.incoming].slice(0, MAX_INCOMING);
  if (session.config.mode === "automatic") {
    session.approved = [message, ...session.approved].slice(0, MAX_APPROVED);
    session.current = message;
    session.approvedCount += 1;
    return true;
  }
  return false;
}

export function removeLiveChatMessage(
  session: LiveChatIngestSession,
  provider: LiveChatProviderId,
  providerMessageId: string,
): boolean {
  session.incoming = session.incoming.filter(
    (entry) => !sameMessage(entry, provider, providerMessageId),
  );
  session.approved = session.approved.filter(
    (entry) => !sameMessage(entry, provider, providerMessageId),
  );
  if (session.current && sameMessage(session.current, provider, providerMessageId)) {
    session.current = null;
    return true;
  }
  return false;
}
