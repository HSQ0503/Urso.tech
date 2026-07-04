import { MessageSquare } from "lucide-react";
import { getSettings, getThreadMessages, listThreads } from "@/lib/canes/data";
import { toE164 } from "@/lib/canes/types";
import { Conversation } from "@/app/CanesPressure/components/inbox/conversation";
import { InboxPoll, ThreadList } from "@/app/CanesPressure/components/inbox/thread-list";

export const dynamic = "force-dynamic";

// Shared SMS inbox. ?t=<peer_phone> opens a thread: two panes on desktop,
// list ↔ conversation swap on mobile.

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawT = Array.isArray(sp.t) ? sp.t[0] : sp.t;
  // A raw "+" in the query decodes to a space — re-normalize to E.164.
  const activePhone = rawT ? (toE164(rawT) ?? rawT) : null;

  const [threads, settings, messages] = await Promise.all([
    listThreads(),
    getSettings(),
    activePhone ? getThreadMessages(activePhone) : Promise.resolve([]),
  ]);
  const activeThread = activePhone
    ? (threads.find((t) => t.peer_phone === activePhone) ?? null)
    : null;

  if (threads.length === 0 && !activePhone) {
    return (
      <>
        <InboxPoll />
        <div className="mx-auto max-w-md pt-16">
          <div className="cp-card flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--cp-brand-soft)] text-[var(--cp-brand)]">
              <MessageSquare size={20} />
            </span>
            <p className="cp-display text-[16px]">No conversations yet</p>
            <p className="text-[13.5px] text-[var(--cp-muted)]">
              Texts to your business number will appear here.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="h-[calc(100dvh-120px)] md:h-[calc(100dvh-64px)]">
      <InboxPoll />
      <div className="cp-card flex h-full w-full overflow-hidden">
        <div
          className={`${activePhone ? "hidden md:flex" : "flex"} w-full flex-col md:w-[340px] md:shrink-0 md:border-r md:border-[var(--cp-line)]`}
        >
          <ThreadList
            threads={threads}
            activePhone={activePhone}
            vendorPhones={settings.lead_vendor_phones}
          />
        </div>
        <div className={`${activePhone ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
          {activePhone ? (
            <Conversation
              peerPhone={activePhone}
              lead={activeThread?.lead ?? null}
              messages={messages}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <MessageSquare size={26} className="text-[var(--cp-faint)]" />
              <p className="text-[13.5px] text-[var(--cp-muted)]">
                Select a conversation to read and reply.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
