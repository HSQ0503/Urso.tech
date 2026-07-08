import { MessageSquare } from "lucide-react";
import { getThreadCalls, getThreadMessages, listThreads } from "@/lib/canes/data";
import { findCustomerByPhone, getCustomer } from "@/lib/canes/customers";
import { toE164, type ThreadKind } from "@/lib/canes/types";
import { Conversation } from "@/app/CanesPressure/components/inbox/conversation";
import { ContactRail, type CustomerHistory } from "@/app/CanesPressure/components/inbox/contact-rail";
import { InboxPoll, ThreadList } from "@/app/CanesPressure/components/inbox/thread-list";

export const dynamic = "force-dynamic";

// Shared inbox for SMS and calls. ?thread=<E164 phone> opens a conversation
// (the schedule's Text action links here); older links still use ?t=.
// List + conversation on desktop, plus a contact rail on wide screens;
// list ↔ conversation swap on mobile. OpenPhone is the reference.

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[]; thread?: string | string[] }>;
}) {
  const sp = await searchParams;
  // A raw "+" in the query decodes to a space — re-normalize to E.164.
  const raw = firstParam(sp.thread) ?? firstParam(sp.t);
  const activePhone = raw ? (toE164(raw) ?? raw) : null;

  const [threads, messages, calls] = await Promise.all([
    listThreads(),
    activePhone ? getThreadMessages(activePhone) : Promise.resolve([]),
    activePhone ? getThreadCalls(activePhone) : Promise.resolve([]),
  ]);
  const activeThread = activePhone
    ? (threads.find((t) => t.peer_phone === activePhone) ?? null)
    : null;

  // Deep links can target a phone with no thread yet (e.g. Text from the
  // schedule before any SMS exists) — resolve the contact by phone so the
  // conversation and rail still carry customer context.
  const fallbackContact =
    activePhone && !activeThread ? await findCustomerByPhone(activePhone) : null;
  const contact = activeThread?.contact ?? fallbackContact;
  const wantHistory = contact !== null && (activeThread ? activeThread.kind === "customer" : true);
  const detail = wantHistory && contact ? await getCustomer(contact.id) : null;
  const isCustomer = activeThread
    ? activeThread.kind === "customer"
    : (detail?.jobs.length ?? 0) > 0;
  const kind: ThreadKind = activeThread?.kind ?? (isCustomer ? "customer" : "lead");
  const history: CustomerHistory | null =
    isCustomer && detail
      ? {
          jobsCount: detail.jobs.length,
          lifetimeCents: detail.payments_total_cents,
          openBalanceCents: detail.open_balance_cents,
          lastJobAt:
            detail.jobs
              .map((j) => j.scheduled_at ?? j.created_at)
              .sort()
              .at(-1) ?? null,
        }
      : null;
  const lead = activeThread?.lead ?? detail?.lead ?? null;
  const displayName = activeThread?.display_name ?? contact?.name ?? lead?.name ?? null;

  if (threads.length === 0 && !activePhone) {
    return (
      <>
        <InboxPoll />
        <div className="mx-auto max-w-md pt-16">
          <div className="cp-card flex flex-col items-center gap-2 px-6 py-10 text-center">
            <MessageSquare size={20} strokeWidth={2} className="text-[var(--cp-faint)]" />
            <p className="cp-display text-[16px]">No conversations yet</p>
            <p className="text-[13.5px] text-[var(--cp-muted)]">
              Texts and calls to your business number will appear here.
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
          className={`${activePhone ? "hidden md:flex" : "flex"} w-full flex-col md:w-[320px] md:shrink-0 md:border-r md:border-[var(--cp-line)]`}
        >
          <ThreadList threads={threads} activePhone={activePhone} />
        </div>
        <div className={`${activePhone ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
          {activePhone ? (
            <Conversation
              peerPhone={activePhone}
              lead={lead}
              displayName={displayName}
              kind={kind}
              contactId={contact?.id ?? null}
              messages={messages}
              calls={calls}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <MessageSquare size={26} strokeWidth={2} className="text-[var(--cp-faint)]" />
              <p className="text-[13.5px] text-[var(--cp-muted)]">
                Select a conversation to read and reply.
              </p>
            </div>
          )}
        </div>
        {activePhone && (
          <div className="hidden w-[280px] shrink-0 border-l border-[var(--cp-line)] xl:block">
            <ContactRail
              peerPhone={activePhone}
              kind={kind}
              lead={lead}
              contact={contact}
              history={history}
            />
          </div>
        )}
      </div>
    </div>
  );
}
