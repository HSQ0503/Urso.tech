// The owner's dispatch view — a day at a time, or the week he already fetched.
//
// The web console renders a drag-and-drop grid. A phone cannot, and a shrunken
// grid is worse than no grid: too small to read, too fiddly to move a job with a
// thumb. What Sebastian needs away from the desk is narrower — what is happening
// today, what is happening next, and what is still sitting in the tray unbooked.
// So this is an agenda, not a calendar: one day at a time, a WEEK when he wants
// the shape of the run, and the unscheduled pile pinned at the bottom where it
// can't be forgotten.
//
// MONTH is deliberately absent. The web keeps it because a desktop planner has
// the pixels for it; a 42-cell grid on a 390pt screen gives each day roughly
// 55x60pt, which fits a number and nothing else — no customer, no time, no crew.
// A month view here would be a picture of a month rather than a way to read one,
// and the day strip plus the week list already answer "what is coming" at the
// range a phone can actually show.
//
// Three objects share the board: JOBS (sold work), QUOTE VISITS (a lead with an
// appointment — tappable, offering the four things the web's VisitSheet offers),
// and CALENDAR EVENTS (time off, blocks, holidays), which this screen can now
// CREATE but cannot yet draw — see the note over calendarEventCreate.
//
// EVERY timestamp is America/New_York. Days are derived with fmtEt and ET wall
// times with etLocalToIso; no local calendar method is ever read, or a phone
// that has travelled shows a dispatcher the wrong day's work.

import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  etLocalToIso,
  fmtEt,
  fmtEtTimeRange,
  fmtMoney,
  fmtPhone,
  JOB_STATUS_LABEL,
  STATUS_LABEL,
  type CalendarEventKind,
  type Crew,
  type Job,
  type JobStatus,
  type Lead,
  type LeadStatus,
} from "@urso/types";
import {
  API_BASE,
  callActions,
  estimateActions,
  jobActions,
  SessionExpiredError,
  type ApiResult,
} from "@/api";
import { getAccessToken, signOut } from "@/auth";
import { getAdminToken } from "@/session";
import { NavigateButton } from "@/components/navigate";
import { Notice } from "@/components/notice";
import { isCompleteWhen, SlotPicker } from "@/components/slot-picker";
import { keys, useCrews, useLeads, useScheduleBoard, useUnscheduled } from "@/queries";
import { noticeFrom, useAction, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

// Statuses where the green actually means "this is happening / happened".
const IN_FLIGHT: JobStatus[] = ["in_progress", "completed", "invoiced", "paid"];
const UNASSIGNED = "Unassigned";

// A quote visit is a lead with an appointment, in exactly the two statuses the
// server's own listVisitsInRange accepts (lib/canes/data.ts). Mirrored rather
// than invented, so the phone and the board never disagree about what a visit is.
const VISIT_STATUSES: LeadStatus[] = ["appointment_set", "confirmed"];

const DAYS = 7;
const DAY_MS = 86_400_000;

// What the board actually returns is JobWithItems[] (lib/canes/estimates.ts
// getScheduleBoard → joinJobs): the job row joined to its item snapshot and its
// crew. The api client types it `unknown` because the domain type lives
// server-side, so this is the slice this screen reads — nothing more.
type BoardJob = {
  id: string;
  status: JobStatus;
  customer_name: string | null;
  job_address: string | null;
  scheduled_at: string | null;
  ends_at: string | null;
  crew_id: string | null;
  // Already in the payload — getScheduleBoard returns JobWithItems[], and Job
  // carries total_cents. This local narrowing simply had not declared it, so
  // the money was arriving and being thrown away.
  total_cents: number;
};

// A lead narrowed to the shape a visit row can rely on.
type Visit = Lead & { appointment_at: string };

type DayCell = {
  key: string; // ET calendar key, "2026-07-28"
  instant: string; // ET noon on that day, as an instant — safe to format
  weekday: string;
  day: string;
};

type Window = { days: DayCell[]; fromIso: string; toIso: string };

type Row =
  | { kind: "section"; key: string; label: string; meta: string | null }
  | { kind: "job"; key: string; job: BoardJob; crewName: string | null }
  | { kind: "visit"; key: string; visit: Visit }
  | { kind: "tray"; key: string; job: Job }
  // The whole selected day as one hour-rail item. It replaces that day's rows
  // rather than sitting beside them — the same events drawn twice, once as a
  // list and once on a grid, is two answers to one question.
  | { kind: "timeline"; key: string; blocks: Block[] }
  | { kind: "calm"; key: string; text: string };

// fmtEt formats en-US, so 2-digit parts arrive as MM/DD/YYYY. Reordered here
// into the ET calendar key that etLocalToIso takes and that days are grouped by.
function etDateKey(iso: string): string {
  const [month, day, year] = fmtEt(iso, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).split("/");
  return `${year}-${month}-${day}`;
}

// Next ET calendar day as YYYY-MM-DD, for the all-day end bound. Anchoring at
// UTC noon keeps the +1 stable across DST. Copied from the web's own
// create-event-sheet so both builders bound an all-day block identically.
function nextDayKey(ymd: string): string {
  const anchor = new Date(`${ymd}T12:00:00Z`);
  return new Date(anchor.getTime() + DAY_MS).toISOString().slice(0, 10);
}

// Seven days starting today, plus the instants the board is asked for.
//
// Epoch arithmetic is timezone-neutral, so days are stepped from ET NOON: a DST
// change shifts the wall clock by an hour, which lands at 11am or 1pm and still
// inside the intended calendar day. Stepping from midnight would slide onto the
// day before. The window itself is ET midnight to ET midnight seven days on.
// `fromKey` anchors the strip somewhere other than today. It defaults to today,
// which is what every existing caller wants and what the app opens on; the
// parameter exists so the week arrows can move the window without a second
// window-building path to keep in step with this one.
function buildWindow(fromKey?: string): Window {
  const todayKey = fromKey ?? etDateKey(new Date().toISOString());
  const noon = Date.parse(etLocalToIso(`${todayKey}T12:00`));

  const days: DayCell[] = [];
  for (let i = 0; i < DAYS; i++) {
    const instant = new Date(noon + i * DAY_MS).toISOString();
    days.push({
      key: etDateKey(instant),
      instant,
      weekday: fmtEt(instant, { weekday: "short" }),
      day: fmtEt(instant, { day: "numeric" }),
    });
  }

  const endKey = etDateKey(new Date(noon + DAYS * DAY_MS).toISOString());
  return {
    days,
    fromIso: etLocalToIso(`${todayKey}T00:00`),
    toIso: etLocalToIso(`${endKey}T00:00`),
  };
}

function toBoardJobs(value: unknown): BoardJob[] {
  return Array.isArray(value) ? (value as BoardJob[]) : [];
}

// The week list's day headers. This USED to be positional — index 0 was always
// today because buildWindow started there. The week arrows broke that: a window
// anchored three weeks out still has an index 0, and calling it "Today" would
// be a confident lie about a date. Compare the day key instead.
function weekLabel(cell: DayCell): string {
  const todayKey = etDateKey(new Date().toISOString());
  if (cell.key === todayKey) return "Today";
  if (cell.key === nextDayKey(todayKey)) return "Tomorrow";
  return fmtEt(cell.instant, { weekday: "short", month: "short", day: "numeric" });
}

function weekTitle(days: DayCell[]): string {
  const first = days[0];
  const last = days.at(-1);
  if (!first || !last) return "";
  const firstMonth = fmtEt(first.instant, { month: "short" });
  const lastMonth = fmtEt(last.instant, { month: "short" });
  const firstDay = fmtEt(first.instant, { day: "numeric" });
  const lastDay = fmtEt(last.instant, { day: "numeric" });
  return `${firstMonth} ${firstDay} – ${lastMonth} ${lastDay}`;
}

// The figure on the right of a date band. Only JOBS carry money — a quote visit
// is work that has not been sold — so a day of visits returns null and the band
// simply has no figure. Rendering $0.00 there would say the day earned nothing,
// which is a different and wrong claim.
function dayTotal(
  entries: readonly { kind: string; job?: { total_cents: number } }[],
): string | null {
  const cents = entries.reduce(
    (sum, entry) => (entry.kind === "job" && entry.job ? sum + entry.job.total_cents : sum),
    0,
  );
  return cents > 0 ? fmtMoney(cents) : null;
}

// A success payload can carry a sentence of its own (apiResult keeps ok:true
// notices, several of which are qualified successes rather than confirmations).
// Read it without claiming a shape the action types don't promise.
function successNotice(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const notice = (data as { notice?: unknown }).notice;
  return typeof notice === "string" && notice.length > 0 ? notice : null;
}

// The green sibling of Notice — same shape, good colours — for the ok:true
// sentences. Local to the screen, same as job/[id] and lead/[id].
function GoodNotice({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <View style={styles.goodNotice}>
      <Text style={styles.goodNoticeText}>{text}</Text>
    </View>
  );
}

function Notices({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.noticeStack}>
      {items.map((text) => (
        // Server refusals are shown in the server's own words — they are written
        // for the reader and often name the exact permission that is missing.
        <View key={text} style={styles.notice}>
          <Text style={styles.noticeText}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

// ── The one client call src/api.ts does not carry yet ────────────────────────
//
// POST /canes/calendar-events/actions has NO namespace in src/api.ts, and src/
// was not mine to edit in this pass — so this file carries a local twin of that
// module's private `request`: same envelope, same token order (admin first — an
// owner is not a Supabase user at all), same 401 → signOut → SessionExpiredError,
// same two transport sentences, character for character. It deviates in nothing.
//
// This is a PLACEHOLDER, not a home. The moment `calendarEventActions.create`
// lands in src/api.ts this whole block deletes and the sheet below calls that
// instead; the signature it should take is the signature this function takes.
// Until then every other mutation on the phone routes through one file and this
// one does not, which is exactly the second copy the codebase spends its
// comments warning about.
async function calendarEventCreate(input: {
  title: string;
  startIso: string;
  endIso: string;
  allDay: boolean;
  crewId: string | null;
  kind: CalendarEventKind;
  notes?: string;
}): Promise<ApiResult<Record<string, unknown>>> {
  const token = (await getAdminToken()) ?? (await getAccessToken());
  if (!token) throw new SessionExpiredError();

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1/canes/calendar-events/actions`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "create", ...input }),
    });
  } catch {
    return { ok: false, notice: "No connection. Showing the last update.", transient: true };
  }

  if (res.status === 401) {
    await signOut();
    throw new SessionExpiredError();
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, notice: "The server sent something unexpected.", transient: true };
  }

  const body = payload as { ok?: boolean; data?: Record<string, unknown>; notice?: string } | null;
  if (body && body.ok === true) return { ok: true, data: body.data ?? {} };
  return { ok: false, notice: body?.notice ?? "That didn't go through — try again." };
}

// @urso/types has no label map for CalendarEventKind — STATUS_LABEL and its
// siblings cover leads, jobs, estimates, invoices and rewards, not this. The web
// sheet declares the same four locally; this is that list, not a second
// vocabulary, and it belongs in the types package the moment anyone else needs it.
const KINDS: { value: CalendarEventKind; label: string }[] = [
  { value: "block", label: "Block" },
  { value: "time_off", label: "Time off" },
  { value: "holiday", label: "Holiday" },
  { value: "note", label: "Note" },
];

// ── Book from the tray ───────────────────────────────────────────────────────
//
// The unscheduled pile is the biggest thing on this screen and, until now, the
// only thing on it he could not act on: booking meant tapping into the job
// sheet, finding Schedule, picking, and coming back. Four screens to move sold
// work onto a day, on the screen whose entire job is deciding which day.
//
// Deliberately NOT a crew picker. The tray row's question is "when", and the
// job already carries a crew (or does not, which is a normal way to book).
// jobActions.schedule's crewId is required-and-nullable, so passing the job's
// own value means booking from here can never silently unassign — crew changes
// stay on the job sheet, where they are the point rather than a side effect.
function BookSheet({ job, onClose }: { job: Job; onClose: () => void }) {
  const [slot, setSlot] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const book = useAction(
    (vars: { iso: string }) =>
      jobActions.schedule(job.id, vars.iso, job.duration_minutes ?? 120, job.crew_id ?? null),
    { invalidates: [["owner", "schedule"], keys.schedule.unscheduled(), keys.agenda(), keys.overview()] },
  );

  const ready = isCompleteWhen(slot);
  const busy = book.isPending;

  const onBook = async () => {
    setNotice(null);
    const r = await book.mutateAsync({ iso: etLocalToIso(slot) });
    if (!r.ok) {
      setNotice(r.notice);
      return;
    }
    // The job has left the tray, so the sheet has nothing left to act on.
    onClose();
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.sheetHead}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8}>
            <Text style={styles.sheetCancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.sheetTitle}>Book</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Book this job"
            disabled={!ready || busy}
            onPress={() => void onBook()}
            hitSlop={8}
          >
            <Text style={[styles.sheetSave, (!ready || busy) && styles.sheetSaveOff]}>
              {busy ? "Booking…" : "Book"}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          <Notice text={notice} />
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Job</Text>
            <Text style={styles.body}>{job.customer_name ?? "Customer"}</Text>
            <Text style={styles.muted}>{job.job_address ?? "Address pending"}</Text>
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>When</Text>
            {/* No allowPast: sold work being booked is future work. Back-dating
                belongs on the job sheet, where reopening and back-dating a
                completed job is a deliberate, separate act. */}
            <SlotPicker value={slot} onChange={setSlot} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Create event ─────────────────────────────────────────────────────────────
//
// The lean answer to Markate's "Create Event", mirroring the web sheet: title,
// when, all-day, crew, kind. Jobs are NOT born here — they come from an approved
// estimate, or from New job above — so there is no work-order form to build.
function CreateEventSheet({
  crews,
  crewsNotice,
  onClose,
}: {
  crews: Crew[];
  crewsNotice: string | null;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<CalendarEventKind>("block");
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [crewId, setCrewId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [good, setGood] = useState<string | null>(null);

  // ["owner","schedule"] is the board prefix covering every fetched window — the
  // same literal job/[id] invalidates with, for the same reason: the window is
  // part of the key, so no single factory call names them all.
  const create = useAction(calendarEventCreate, {
    invalidates: [["owner", "schedule"]],
  });

  // A day-only pick emits "YYYY-MM-DD"; a full pick appends the time. An all-day
  // block only ever needs the day.
  const day = start.slice(0, 10);
  const ready = allDay ? day.length === 10 : isCompleteWhen(start) && isCompleteWhen(end);
  const busy = create.isPending;

  const onStartChange = (v: string) => {
    setStart(v);
    // The end picker defaults its own displayed day to TOMORROW while it holds
    // nothing, so a start picked for Thursday would silently pair with a
    // Wednesday end. Seeding the end with the start's day keeps the two together
    // until he deliberately taps a later day on the second picker.
    setEnd((prev) => (isCompleteWhen(prev) ? prev : v.slice(0, 10)));
  };

  const submit = async () => {
    setNotice(null);
    setGood(null);
    // All-day spans the whole ET day (00:00 → next-day 00:00); a timed block
    // uses the two picks. etLocalToIso resolves both as ET wall time, which is
    // what makes them the ISO INSTANTS the route insists on — a naive string
    // would resolve in the server's zone and land the block hours off.
    const startIso = allDay ? etLocalToIso(`${day}T00:00`) : etLocalToIso(start);
    const endIso = allDay ? etLocalToIso(`${nextDayKey(day)}T00:00`) : etLocalToIso(end);

    const r = await create.mutateAsync({
      // Untrimmed on purpose: the action trims and answers "A title is
      // required." in its own words, and it owns "End must be after start." too.
      // Refusing either here would be a second copy of a rule that already has a
      // sentence written for the reader.
      title,
      startIso,
      endIso,
      allDay,
      crewId,
      kind,
      notes: notes.trim().length > 0 ? notes : undefined,
    });
    if (!r.ok) {
      setNotice(r.notice);
      return;
    }
    // The sheet deliberately stays open. This board reads JOBS — there is no
    // calendar-events read on the phone yet — so closing on success would leave
    // him staring at a week that looks exactly as it did before, with nothing to
    // show the block exists. The sentence is the only evidence there is.
    setGood(
      successNotice(r.data) ??
        "Event created. It won't appear on this board yet — the phone reads jobs, not blocks.",
    );
    setTitle("");
    setNotes("");
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.sheetHead}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            disabled={busy}
            onPress={onClose}
            hitSlop={space.sm}
            style={({ pressed }) => [styles.sheetControl, pressed && styles.dim]}
          >
            <Text style={styles.sheetCancel}>Close</Text>
          </Pressable>
          <Text style={styles.sheetTitle}>Create event</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create event"
            disabled={!ready || busy}
            onPress={() => void submit()}
            hitSlop={space.sm}
            style={({ pressed }) => [
              styles.sheetControl,
              styles.sheetControlEnd,
              (!ready || busy) && styles.disabled,
              pressed && styles.dim,
            ]}
          >
            <Text style={styles.sheetSave}>{busy ? "Creating…" : "Create"}</Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.sheetFill}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <Notice text={notice} />
            <GoodNotice text={good} />

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                editable={!busy}
                placeholder="Crew B afternoon off"
                placeholderTextColor={color.faint}
                autoCapitalize="sentences"
                accessibilityLabel="Title"
                style={styles.formInput}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Kind</Text>
              <View style={styles.chipRow}>
                {KINDS.map((k) => {
                  const on = k.value === kind;
                  return (
                    <Pressable
                      key={k.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      disabled={busy}
                      onPress={() => setKind(k.value)}
                      style={({ pressed }) => [
                        styles.chip,
                        on && styles.chipOn,
                        pressed && !on && styles.pressedSurface,
                      ]}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{k.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allDay, disabled: busy }}
              accessibilityLabel="All day"
              disabled={busy}
              onPress={() => setAllDay((v) => !v)}
              style={({ pressed }) => [styles.checkRow, pressed && styles.pressedSurface]}
            >
              <View style={[styles.box, allDay && styles.boxOn]}>
                <Text style={styles.boxMark}>{allDay ? "✓" : ""}</Text>
              </View>
              <Text style={styles.body}>All day</Text>
            </Pressable>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{allDay ? "Day" : "Start"}</Text>
              {/* allowPast so a block can still cover this morning — an owner
                  recording time off he already took is a real thing, and the
                  future-only guard belongs to lead appointments, not to this. */}
              <SlotPicker value={start} onChange={onStartChange} allowPast />
            </View>

            {allDay ? (
              <Text style={styles.muted}>
                An all-day block still needs two instants — this one runs midnight to midnight, ET.
              </Text>
            ) : (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>End</Text>
                <SlotPicker value={end} onChange={setEnd} allowPast />
              </View>
            )}

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Crew</Text>
              {/* The crews read is gated on its own. Refused, this falls back to
                  Everyone — which is a real answer, not a broken form. */}
              <Notice text={crewsNotice} />
              <View style={styles.picker}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: crewId === null }}
                  disabled={busy}
                  onPress={() => setCrewId(null)}
                  style={({ pressed }) => [styles.pickerRow, pressed && styles.pressedSurface]}
                >
                  <Text style={styles.body}>Everyone</Text>
                  {crewId === null ? <Text style={styles.pickerMark}>Selected</Text> : null}
                </Pressable>
                {crews.map((crew) => (
                  <Pressable
                    key={crew.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: crewId === crew.id }}
                    disabled={busy}
                    onPress={() => setCrewId(crew.id)}
                    style={({ pressed }) => [
                      styles.pickerRow,
                      styles.divided,
                      pressed && styles.pressedSurface,
                    ]}
                  >
                    <Text style={styles.body}>{crew.name}</Text>
                    {crewId === crew.id ? <Text style={styles.pickerMark}>Selected</Text> : null}
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                editable={!busy}
                multiline
                placeholder="Anything worth remembering"
                placeholderTextColor={color.faint}
                accessibilityLabel="Notes"
                style={[styles.formInput, styles.formMultiline]}
              />
            </View>

            <Text style={styles.muted}>Times are Eastern (ET).</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── Quote visit ──────────────────────────────────────────────────────────────
//
// The web's VisitSheet, composed rather than rebuilt: the Twilio bridge from
// callActions, the maps hand-off from NavigateButton, the lead screen and the
// estimate builder from the router. Not one of these four is new behaviour — the
// app simply never offered any of them from the board.
function VisitSheet({
  visit,
  onClose,
  onOpenLead,
  onOpenEstimate,
}: {
  visit: Visit;
  onClose: () => void;
  onOpenLead: (id: string) => void;
  onOpenEstimate: (estimateId: string) => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [good, setGood] = useState<string | null>(null);
  const [builtId, setBuiltId] = useState<string | null>(null);

  // The bridge writes a call row and a lead event, so the lead reads and the
  // thread reads both go stale. keys.leads.all() is the PREFIX of every lead
  // detail/events/calls key, so one entry covers all of them.
  const callRun = useAction(
    (vars: { phone: string; leadId: string }) => callActions.bridge(vars.phone, vars.leadId),
    { invalidates: [keys.leads.all(), keys.threads.all()] },
  );
  // createEstimateFromLead prefills from this lead, files the quote under its
  // contact, and logs an event on the lead.
  const estimateRun = useAction((leadId: string) => estimateActions.createFromLead(leadId), {
    invalidates: [keys.estimates(), keys.leads.all()],
  });

  const busy = callRun.isPending || estimateRun.isPending;

  const onCall = async () => {
    setNotice(null);
    setGood(null);
    if (visit.phone === null) return;
    const r = await callRun.mutateAsync({ phone: visit.phone, leadId: visit.id });
    // ok:true here IS the sentence — "Calling your phone now — answer to
    // connect." — and it is the only feedback there is, because the ring lands
    // on the handset rather than anywhere in the app.
    if (r.ok) setGood(successNotice(r.data) ?? "Calling your phone now.");
    else setNotice(r.notice);
  };

  const onBuildEstimate = async () => {
    setNotice(null);
    setGood(null);
    const r = await estimateRun.mutateAsync(visit.id);
    if (!r.ok) {
      setNotice(r.notice);
      return;
    }
    const estimateId = r.data.estimateId;
    if (estimateId === undefined) {
      // The draft exists but this payload never named it. Saying so beats going
      // nowhere, which would leave a real quote nobody knows was made.
      setNotice("The quote was created, but this phone didn't get its id. Find it in Estimates.");
      return;
    }
    const sentence = successNotice(r.data);
    if (sentence !== null) {
      // The server QUALIFIED the success. Navigating closes this sheet and takes
      // its sentence with it, so the builder becomes one more tap and the
      // sentence stays on screen where it can be read.
      setGood(sentence);
      setBuiltId(estimateId);
      return;
    }
    onOpenEstimate(estimateId);
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.sheetHead}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            hitSlop={space.sm}
            style={({ pressed }) => [styles.sheetControl, pressed && styles.dim]}
          >
            <Text style={styles.sheetCancel}>Close</Text>
          </Pressable>
          <Text style={styles.sheetTitle}>Quote visit</Text>
          {/* A spacer, so the title sits centred against the single control. */}
          <View style={styles.sheetControl} />
        </View>

        <ScrollView contentContainerStyle={styles.sheetBody}>
          <View style={styles.card}>
            <View style={styles.pad}>
              <View style={styles.rowTop}>
                <Text style={styles.customerLead} numberOfLines={1}>
                  {visit.name ?? "Estimate visit"}
                </Text>
                <Text style={styles.visitTag}>{STATUS_LABEL[visit.status]}</Text>
              </View>
              <Text style={styles.fieldValue}>{fmtEt(visit.appointment_at)}</Text>
              {visit.service !== null ? <Text style={styles.muted}>{visit.service}</Text> : null}
            </View>
          </View>

          <Notice text={notice} />
          <GoodNotice text={good} />

          <View style={styles.actionRow}>
            {visit.phone !== null ? (
              // The BRIDGE, not a tel: link — it rings Sebastian first and dials
              // out with the business number, writing the call into the record.
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Call this visit"
                disabled={busy}
                onPress={() => void onCall()}
                style={({ pressed }) => [
                  styles.action,
                  pressed && styles.pressedSurface,
                  busy && styles.disabled,
                ]}
              >
                <Feather name="phone-call" size={15} color={color.brandDeep} />
                {/* "Business line", not bare "Call" — this is the BRIDGE, which
                    rings Sebastian's own handset first and shows the customer
                    the shop's number. The two other bridge surfaces say so; a
                    button here reading "Call" would look like the tel: dial it
                    is not. */}
                <Text style={styles.actionText}>
                  {callRun.isPending ? "Calling…" : "Business line"}
                </Text>
              </Pressable>
            ) : null}
            {/* Renders nothing at all when there is no address — the same
                component the job sheet uses, with the same silence. */}
            <NavigateButton address={visit.address} onFail={setNotice} />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Contact</Text>
            <View style={styles.card}>
              <View style={styles.pad}>
                <Text style={styles.fieldValue}>
                  {visit.phone !== null ? fmtPhone(visit.phone) : "No phone"}
                </Text>
                <Text style={styles.muted}>{visit.address ?? "No address"}</Text>
              </View>
            </View>
          </View>

          {visit.notes !== null ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Notes</Text>
              <View style={styles.card}>
                <View style={styles.pad}>
                  <Text style={styles.body}>{visit.notes}</Text>
                </View>
              </View>
            </View>
          ) : null}

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Links</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenLead(visit.id)}
              style={({ pressed }) => [styles.button, pressed && styles.pressedSurface]}
            >
              <Text style={styles.buttonText}>Open the lead</Text>
            </Pressable>
            {builtId !== null ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onOpenEstimate(builtId)}
                style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
              >
                <Text style={styles.primaryText}>Open the quote</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void onBuildEstimate()}
                style={({ pressed }) => [
                  styles.primary,
                  pressed && styles.primaryPressed,
                  busy && styles.disabled,
                ]}
              >
                <Text style={styles.primaryText}>
                  {estimateRun.isPending ? "Starting…" : "Build an estimate"}
                </Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// Markate's row anatomy, applied to a booked job: the NAME leads at full weight
// with the money on the same line, and everything that qualifies it — the time,
// the address, the crew — sits underneath in one muted stack. Their list rows
// read that way because the two things being scanned for are who and how much;
// the old row led with the time, which is the one fact the date band above it
// has already established.
function JobRow({
  job,
  crewName,
  onPress,
}: {
  job: BoardJob;
  crewName: string | null;
  onPress: () => void;
}) {
  const total = job.total_cents > 0 ? fmtMoney(job.total_cents) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={job.customer_name ?? "Customer"}
      onPress={onPress}
      style={({ pressed }) => [styles.row, styles.jobCard, pressed && styles.pressedSurface]}
    >
      {/* Markate leads the card with the TIME and puts the money opposite it,
          then stacks who and where underneath. The time earns the lead here (it
          did not on a flat list) because the card is inside a day already — what
          you scan for next is when, not which day. */}
      <View style={styles.rowTop}>
        <Text style={styles.time}>{fmtEtTimeRange(job.scheduled_at, job.ends_at)}</Text>
        {total !== null && <Text style={styles.money}>{total}</Text>}
      </View>
      <Text style={styles.customerLead} numberOfLines={1}>
        {job.customer_name ?? "Customer"}
      </Text>
      <Text style={styles.address} numberOfLines={1}>
        {job.job_address ?? "Address pending"}
      </Text>
      <View style={styles.rowMeta}>
        {/* Green only where green MEANS something. Rendering every status in the
            sold-job colour made the chip pure decoration: a job in progress and
            one merely scheduled looked identical, which is the one distinction
            an owner glancing at the day actually needs. */}
        <View style={IN_FLIGHT.includes(job.status) ? styles.pillLive : styles.pill}>
          <Text style={IN_FLIGHT.includes(job.status) ? styles.statusLive : styles.status}>
            {JOB_STATUS_LABEL[job.status]}
          </Text>
        </View>
        {/* Unassigned is the highest-signal item on this screen — a job nobody is
            going to — and it was rendering in the faintest, smallest token in the
            system, visually identical to a named crew. */}
        {crewName !== null && (
          <Text style={crewName === UNASSIGNED ? styles.crewUnassigned : styles.crew}>
            {crewName}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// A visit sits in the same slot a job does, but says a different word in a
// different colour where the job says its status — the web's two-object
// discipline (sold work green, quotes purple), carried over without borrowing
// the board's shapes.
function VisitRow({ visit, onPress }: { visit: Visit; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Quote visit — ${visit.name ?? "no name"}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, styles.quoteCard, pressed && styles.pressedSurface]}
    >
      {/* Same card as a job, in the quote rail's colour — Markate's whole
          calendar is readable at a glance because sold work and quotes are two
          colours, never two layouts. Where a job prints money a visit prints
          nothing: a quote is not sold work, and $0.00 would claim it was. */}
      <View style={styles.rowTop}>
        <Text style={styles.time}>
          {fmtEt(visit.appointment_at, { hour: "numeric", minute: "2-digit" })}
        </Text>
      </View>
      <Text style={styles.customerLead} numberOfLines={1}>
        {visit.name ?? "Estimate visit"}
      </Text>
      <Text style={styles.address} numberOfLines={1}>
        {visit.address ?? "Address pending"}
      </Text>
      <View style={styles.rowMeta}>
        <View style={styles.pillQuote}>
          <Text style={styles.visitTag}>Quote visit</Text>
        </View>
        <Text style={styles.crew} numberOfLines={1}>
          {visit.service !== null
            ? `${STATUS_LABEL[visit.status]} · ${visit.service}`
            : STATUS_LABEL[visit.status]}
        </Text>
      </View>
    </Pressable>
  );
}

// ── Day timeline ─────────────────────────────────────────────────────────────
//
// Markate's Day View: an hour rail down the left and events drawn as coloured
// blocks positioned and sized by their real times, so a day reads as shape
// before it reads as text — where the gaps are, what overlaps, how long the
// morning job actually runs.
//
// ALL TIME MATH IS ET. Minutes-from-midnight is derived through Intl with an
// explicit timeZone, never through getHours(): a phone that has travelled would
// otherwise draw every block at the wrong height on the rail, which is a
// worse failure than a wrong label because it looks authoritative.

const HOUR_HEIGHT = 62;
const RAIL_WIDTH = 56;
// A 30-minute block is 31pt tall, which is under the tap floor and too short
// for two lines. Blocks never render shorter than this; they just overlap their
// own slot slightly, which is what Markate does too.
const MIN_BLOCK = 40;

const ET_CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// "14:30" → 870. Returns null rather than guessing if the platform hands back
// something unparseable — a block at the wrong height is worse than no block.
function etMinutes(iso: string): number | null {
  const parts = ET_CLOCK.format(new Date(iso)).match(/(\d{1,2}):(\d{2})/);
  if (!parts) return null;
  const hours = Number(parts[1]) % 24;
  const minutes = Number(parts[2]);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}

function hourLabel(hour: number): string {
  const h = hour % 24;
  if (h === 0) return "12AM";
  if (h === 12) return "12PM";
  return h < 12 ? `${h}AM` : `${h - 12}PM`;
}

type Block = {
  key: string;
  kind: "job" | "visit";
  startMin: number;
  endMin: number;
  title: string;
  sub: string | null;
  onPress: () => void;
};

// Column packing for overlaps: walk blocks in start order and drop each into
// the first column whose last block has already ended. Two jobs at the same
// hour then sit side by side instead of on top of each other.
function packColumns(blocks: Block[]): { block: Block; column: number; columns: number }[] {
  const ordered = [...blocks].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const columnEnds: number[] = [];
  const placed = ordered.map((block) => {
    let column = columnEnds.findIndex((end) => end <= block.startMin);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(block.endMin);
    } else {
      columnEnds[column] = block.endMin;
    }
    return { block, column };
  });
  // One width for the whole day rather than per-cluster: a block that changes
  // width as you scroll past an unrelated overlap reads as a different object.
  const columns = Math.max(1, columnEnds.length);
  return placed.map((entry) => ({ ...entry, columns }));
}

function DayTimeline({ blocks }: { blocks: Block[] }): React.ReactElement {
  const packed = packColumns(blocks);

  // The visible span: the day's own events, padded an hour either side, but
  // never narrower than a working day. An empty day still shows a real
  // calendar rather than a single blank hour.
  const startHour = Math.max(
    0,
    Math.min(8, ...blocks.map((b) => Math.floor(b.startMin / 60) - 1)),
  );
  const endHour = Math.min(
    24,
    Math.max(19, ...blocks.map((b) => Math.ceil(b.endMin / 60) + 1)),
  );
  const hours = Array.from({ length: Math.max(1, endHour - startHour) }, (_, i) => startHour + i);
  const originMin = startHour * 60;

  return (
    <View style={styles.timeline}>
      {hours.map((hour) => (
        <View key={hour} style={styles.hourRow}>
          <Text style={styles.hourLabel}>{hourLabel(hour)}</Text>
          <View style={styles.hourLine} />
        </View>
      ))}

      {/* Absolute layer over the rail. pointerEvents box-none so the empty grid
          underneath keeps scrolling normally where there is no block. */}
      <View style={styles.blockLayer} pointerEvents="box-none">
        {packed.map(({ block, column, columns }) => {
          const top = ((block.startMin - originMin) / 60) * HOUR_HEIGHT;
          const height = Math.max(
            MIN_BLOCK,
            ((block.endMin - block.startMin) / 60) * HOUR_HEIGHT,
          );
          const widthPct = 100 / columns;
          return (
            <Pressable
              key={block.key}
              accessibilityRole="button"
              accessibilityLabel={block.title}
              onPress={block.onPress}
              style={({ pressed }) => [
                styles.block,
                block.kind === "job" ? styles.blockJob : styles.blockVisit,
                {
                  top,
                  height,
                  left: `${column * widthPct}%`,
                  width: `${widthPct}%`,
                },
                pressed && styles.blockPressed,
              ]}
            >
              <Text style={styles.blockTitle} numberOfLines={1}>
                {block.title}
              </Text>
              {block.sub !== null && height > 52 ? (
                <Text style={styles.blockSub} numberOfLines={1}>
                  {block.sub}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TrayRow({
  job,
  onPress,
  onBook,
}: {
  job: Job;
  onPress: () => void;
  onBook: () => void;
}) {
  // The name leads, not the amount. Every row in this section is by definition
  // unscheduled, so repeating "UNSCHEDULED" on each one said nothing the section
  // header had not already said, while the customer — the thing being scanned
  // for — sat second. A zero total is left blank rather than shown as $0.00:
  // an unpriced job is not a nothing job, and rendering it as money reads as one.
  const total = job.total_cents > 0 ? fmtMoney(job.total_cents) : null;
  // The card and the Book button are SIBLINGS, not parent and child. Nesting a
  // Pressable inside a Pressable looked tidier and lost the tap to the outer
  // one — tapping Book opened the job sheet, which is the screen this button
  // exists to save him from. Two targets side by side cannot be ambiguous
  // about which one was pressed, to the runtime or to the reader.
  return (
    <View style={styles.trayRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Schedule ${job.customer_name ?? "customer"}`}
        onPress={onBook}
        style={({ pressed }) => [styles.trayBody, pressed && styles.pressedSurface]}
      >
        <View style={styles.rowTop}>
          <Text style={styles.customerLead} numberOfLines={1}>
            {job.customer_name ?? "Customer"}
          </Text>
          {total !== null && <Text style={styles.money}>{total}</Text>}
        </View>
        <Text style={styles.address} numberOfLines={1}>
          {job.job_name ?? job.job_address ?? "Job"}
        </Text>
        <Text style={styles.tapToSchedule}>Tap to schedule</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open actions for ${job.customer_name ?? "this job"}`}
        onPress={onPress}
        style={({ pressed }) => [styles.trayBook, pressed && styles.pressedSurface]}
      >
        <Feather name="more-horizontal" size={20} color={color.faint} />
      </Pressable>
    </View>
  );
}

export default function ScheduleScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const openJob = useCallback(
    (id: string) => {
      router.push({ pathname: "/(owner)/job/[id]", params: { id } });
    },
    [router],
  );

  const [win, setWin] = useState<Window>(buildWindow);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showAllUnscheduled, setShowAllUnscheduled] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  // The job whose "Book" was tapped, held by value rather than by id: the tray
  // it came from re-reads the moment the booking lands, and looking the job up
  // again through a list it has just left would find nothing.
  const [bookJob, setBookJob] = useState<Job | null>(null);
  const [visitId, setVisitId] = useState<string | null>(null);

  // Recomputed on every focus and every pull so an app left open overnight
  // rolls onto the new day the moment it is picked back up. The board's query
  // key carries the window, so a rolled window fetches itself.
  // null means "anchored on today, and rolling" — the original behaviour. A
  // week arrow pins it, and the pin is what stops a focus (coming back from a
  // job sheet he opened three weeks out) snapping the board back to today under
  // him. "Today" clears the pin and resumes rolling.
  const [anchorKey, setAnchorKey] = useState<string | null>(null);

  const rollWindow = useCallback(() => {
    const next = buildWindow(anchorKey ?? undefined);
    setWin(next);
    setSelectedKey((key) => (key !== null && next.days.some((d) => d.key === key) ? key : null));
  }, [anchorKey]);
  useFocusEffect(rollWindow);

  // Seven days at a time, matching the window the board already fetches — so a
  // jump is one read, not a scroll through reads. Three weeks out is three
  // taps rather than a long swipe on a strip that only moves a day at a time.
  const shiftWeeks = useCallback((weeks: number) => {
    setSelectedKey(null);
    setAnchorKey((current) => {
      const from = current ?? etDateKey(new Date().toISOString());
      const noon = Date.parse(etLocalToIso(`${from}T12:00`));
      return etDateKey(new Date(noon + weeks * DAYS * DAY_MS).toISOString());
    });
  }, []);

  const goToday = useCallback(() => {
    const next = buildWindow();
    setAnchorKey(null);
    setSelectedKey(null);
    setWin(next);
  }, []);

  // One trip each, in parallel: the board covers the whole week, so switching
  // days — or switching to the WEEK view — is instant and offline-friendly. The
  // week is presentation over data already in hand, not a second read.
  //
  // The board route takes (from, days) and defaults days to 7 — `to` is part
  // of the client signature but the server derives the end itself. DAYS is 7
  // for exactly that reason: the strip and the fetched window are the same
  // seven days, not two windows that drift apart.
  const boardQuery = useScheduleBoard(win.fromIso, win.toIso);
  const trayQuery = useUnscheduled();
  const crewsQuery = useCrews();
  // Quote visits are leads with an appointment. There is no visits route on the
  // API yet, so this is the lead list narrowed by the same rule the server's own
  // listVisitsInRange applies. Note it is gated on `leads`, NOT on `schedule` —
  // an account with the board but not the pipeline gets a refusal here alone,
  // which is why it never joins the dead-screen test below.
  const leadsQuery = useLeads();

  useRefetchOnFocus(boardQuery.refetch);
  useRefetchOnFocus(trayQuery.refetch);
  useRefetchOnFocus(crewsQuery.refetch);
  useRefetchOnFocus(leadsQuery.refetch);

  const { refreshing, onRefresh } = usePullToRefresh(() => {
    rollWindow();
    return Promise.all([
      boardQuery.refetch(),
      trayQuery.refetch(),
      crewsQuery.refetch(),
      leadsQuery.refetch(),
    ]);
  });

  // Each read is permission-gated on its own, so one refusal must not discard
  // the other answers. Whatever came back stays on screen (query data survives
  // an error state); every refusal is collected and shown verbatim.
  const board = useMemo(
    () => (boardQuery.data === undefined ? null : toBoardJobs(boardQuery.data)),
    [boardQuery.data],
  );
  const tray = trayQuery.data ?? null;
  const crews = useMemo(() => (crewsQuery.data ?? []).filter((c) => c.active), [crewsQuery.data]);
  const crewNames = useMemo(
    () => new Map<string, string>((crewsQuery.data ?? []).map((c) => [c.id, c.name])),
    [crewsQuery.data],
  );
  const crewsNotice = noticeFrom(crewsQuery.error);
  const notices = useMemo(() => {
    const failures = [boardQuery.error, trayQuery.error, crewsQuery.error, leadsQuery.error]
      .map(noticeFrom)
      .filter((notice): notice is string => notice !== null);
    return [...new Set(failures)];
  }, [boardQuery.error, trayQuery.error, crewsQuery.error, leadsQuery.error]);

  const visits = useMemo<Visit[]>(() => {
    const from = Date.parse(win.fromIso);
    const to = Date.parse(win.toIso);
    return (leadsQuery.data ?? [])
      .filter(
        (lead): lead is Visit =>
          lead.appointment_at !== null && VISIT_STATUSES.includes(lead.status),
      )
      .filter((lead) => {
        const at = Date.parse(lead.appointment_at);
        return at >= from && at < to;
      });
  }, [leadsQuery.data, win.fromIso, win.toIso]);

  const activeVisit = visitId === null ? null : visits.find((v) => v.id === visitId) ?? null;

  const countsByDay = useMemo(() => {
    const counts = new Map<string, number>();
    const bump = (iso: string) => {
      const key = etDateKey(iso);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    };
    for (const job of board ?? []) if (job.scheduled_at) bump(job.scheduled_at);
    for (const visit of visits) bump(visit.appointment_at);
    return counts;
  }, [board, visits]);

  // A refused board and a refused lead list are different failures; either one
  // answering is enough to have something honest to draw under the header.
  const calendarReadable = board !== null || leadsQuery.data !== undefined;

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];

    // Jobs and visits share a day, interleaved by clock time — the order he will
    // physically drive them in, which is the only order that helps from a truck.
    const entriesFor = (dayKey: string): Row[] => {
      const dayJobs = (board ?? [])
        .filter((job) => job.scheduled_at !== null && etDateKey(job.scheduled_at) === dayKey)
        .map((job) => ({
          at: job.scheduled_at as string,
          row: {
            kind: "job" as const,
            key: job.id,
            job,
            // A scheduled job with nobody on it is the thing a dispatcher is
            // hunting for, so it is stated rather than left blank. A crew we
            // cannot name (the crews read was refused) says nothing instead.
            crewName: job.crew_id === null ? UNASSIGNED : crewNames.get(job.crew_id) ?? null,
          },
        }));
      const dayVisits = visits
        .filter((visit) => etDateKey(visit.appointment_at) === dayKey)
        .map((visit) => ({
          at: visit.appointment_at,
          row: { kind: "visit" as const, key: `visit-${visit.id}`, visit },
        }));
      return [...dayJobs, ...dayVisits]
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
        .map((entry) => entry.row);
    };

    // Match the mobile website: urgent unscheduled work comes first and is
    // capped at three rows until explicitly expanded.
    if (tray !== null && tray.length > 0) {
      out.push({
        kind: "section",
        key: "section-tray",
        label: `Unscheduled · ${tray.length}`,
        meta: null,
      });
      const visibleTray = showAllUnscheduled ? tray : tray.slice(0, 3);
      for (const job of visibleTray) out.push({ kind: "tray", key: `tray-${job.id}`, job });
    }

    if (calendarReadable) {
      if (selectedKey !== null) {
        const entries = entriesFor(selectedKey);
        out.push({
          kind: "section",
          key: "section-day",
          label: weekLabel(win.days.find((day) => day.key === selectedKey) ?? win.days[0]),
          // The money booked on the day, the way Markate ends every date band
          // with that day's figure. Only JOBS contribute — a quote visit is not
          // sold work, so a day of visits shows no figure rather than $0.00,
          // which would read as a day that earned nothing.
          meta: dayTotal(entries),
        });
        if (entries.length === 0) {
          out.push({ kind: "calm", key: "calm-day", text: "Nothing booked for this day." });
        } else {
          // A single day is drawn on the hour rail, not listed. The week view
          // keeps the list — seven days of grid would be a scroll, not a glance.
          const blocks: Block[] = [];
          for (const entry of entries) {
            if (entry.kind === "job") {
              const start = entry.job.scheduled_at === null ? null : etMinutes(entry.job.scheduled_at);
              if (start === null) continue;
              const end =
                entry.job.ends_at === null ? null : etMinutes(entry.job.ends_at);
              blocks.push({
                key: entry.key,
                kind: "job",
                startMin: start,
                // No end on the row means an unbounded job; an hour is the
                // schedule's own default duration, so it is what we draw.
                endMin: end !== null && end > start ? end : start + 60,
                title:
                  entry.job.total_cents > 0
                    ? fmtMoney(entry.job.total_cents)
                    : (entry.job.customer_name ?? "Job"),
                sub: entry.crewName ?? entry.job.customer_name,
                onPress: () => openJob(entry.job.id),
              });
            } else {
              const start = etMinutes(entry.visit.appointment_at);
              if (start === null) continue;
              blocks.push({
                key: entry.key,
                kind: "visit",
                startMin: start,
                // A quote visit carries no end time. Thirty minutes is what the
                // slot picker offers for one, so it is what the block shows.
                endMin: start + 30,
                title: `Quote — ${entry.visit.name ?? "Estimate visit"}`,
                sub: entry.visit.service,
                onPress: () => setVisitId(entry.visit.id),
              });
            }
          }
          out.push({ kind: "timeline", key: "timeline-day", blocks });
        }
      } else {
        // Empty days are skipped rather than listed. Seven "nothing booked"
        // lines is the same information as one, spread over a scroll.
        let any = false;
        win.days.forEach((cell) => {
          const entries = entriesFor(cell.key);
          if (entries.length === 0) return;
          any = true;
          out.push({
            kind: "section",
            key: `section-${cell.key}`,
            label: weekLabel(cell),
            meta: dayTotal(entries),
          });
          out.push(...entries);
        });
        if (!any) {
          out.push({ kind: "calm", key: "calm-week", text: "Nothing booked this week." });
        }
      }
    }

    return out;
  }, [
    board,
    tray,
    visits,
    selectedKey,
    crewNames,
    win.days,
    calendarReadable,
    showAllUnscheduled,
  ]);

  const selected = win.days.find((d) => d.key === selectedKey) ?? win.days[0];
  // "Loading" in the old sense — any of the reads in flight. isPending alone
  // would drop the spinner during the dead screen's Try again, where the
  // queries sit in error state while fetching again.
  const loading =
    boardQuery.isFetching || trayQuery.isFetching || crewsQuery.isFetching || leadsQuery.isFetching;
  const showSpinner = loading && board === null && tray === null;
  const dead = !loading && board === null && tray === null;

  const header = (
    <View style={[styles.chrome, { paddingTop: insets.top + space.md }]}>
      <View style={styles.chromeText}>
        <Text style={styles.title}>
          Schedule<Text style={styles.stop}>.</Text>
        </Text>
        <Text style={styles.subtitle}>Tap a job to schedule it. Tap anything on the calendar for details.</Text>
      </View>
    </View>
  );

  // The website's mobile scheduler has one compact week control. Day/week and
  // Event controls belong to the desktop board and consumed almost the entire
  // first viewport when copied onto a phone.
  const bar = (
    <View style={styles.weekNav}>
      <Text style={styles.weekTitle}>{weekTitle(win.days)}</Text>
      <View style={styles.weekActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to today"
          onPress={goToday}
          style={({ pressed }) => [styles.todayButton, pressed && styles.pressedSurface]}
        >
          <Text style={styles.todayText}>Today</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          onPress={() => shiftWeeks(-1)}
          style={({ pressed }) => [styles.weekArrow, pressed && styles.pressedSurface]}
        >
          <Feather name="chevron-left" size={17} color={color.ink} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next week"
          onPress={() => shiftWeeks(1)}
          style={({ pressed }) => [styles.weekArrow, pressed && styles.pressedSurface]}
        >
          <Feather name="chevron-right" size={17} color={color.ink} />
        </Pressable>
      </View>
    </View>
  );

  // Seven 44pt-or-larger cells fit at 375pt with compact gaps. Keeping the
  // whole week visible is the reason this control exists.
  const strip = (
    <View style={styles.strip}>
      {win.days.map((cell) => {
        const marked = cell.key === selectedKey;
        const today = cell.key === etDateKey(new Date().toISOString());
        const count = countsByDay.get(cell.key) ?? 0;
        return (
          <Pressable
            key={cell.key}
            accessibilityRole="button"
            accessibilityState={{ selected: marked }}
            accessibilityLabel={fmtEt(cell.instant, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
            onPress={() => {
              setSelectedKey((current) => (current === cell.key ? null : cell.key));
            }}
            style={({ pressed }) => [
              styles.cell,
              marked && styles.cellOn,
              pressed && !marked && styles.pressedSurface,
            ]}
          >
            <Text style={[styles.cellDay, today && !marked && styles.cellToday, marked && styles.cellInkOn]}>
              {cell.day}
            </Text>
            <Text style={[styles.cellWeekday, marked && styles.cellInkOn]}>
              {cell.weekday}{count > 0 ? ` · ${count}` : ""}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  // Mounted in every branch: a refused board is exactly the moment he still
  // wants to block out the afternoon.
  const eventSheet = (
    <>
      <Modal
        visible={createOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateOpen(false)}
      >
        <View style={styles.menuOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close create menu"
            onPress={() => setCreateOpen(false)}
            style={styles.menuBackdrop}
          />
          <View style={[styles.createMenu, { paddingBottom: insets.bottom + space.lg }]}>
            <View style={styles.createMenuHead}>
              <Text style={styles.createMenuTitle}>Create</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setCreateOpen(false)}
                style={({ pressed }) => [styles.menuClose, pressed && styles.pressedSurface]}
              >
                <Feather name="x" size={20} color={color.muted} />
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setCreateOpen(false);
                router.push(`/(owner)/job/new?day=${encodeURIComponent(selected.key)}`);
              }}
              style={({ pressed }) => [styles.createChoice, pressed && styles.pressedSurface]}
            >
              <Feather name="tool" size={18} color={color.brandDeep} />
              <View style={styles.createChoiceBody}>
                <Text style={styles.createChoiceTitle}>Job</Text>
                <Text style={styles.createChoiceSub}>Add manual work for a customer</Text>
              </View>
              <Feather name="chevron-right" size={18} color={color.faint} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setCreateOpen(false);
                setEventOpen(true);
              }}
              style={({ pressed }) => [styles.createChoice, pressed && styles.pressedSurface]}
            >
              <Feather name="calendar" size={18} color={color.brandDeep} />
              <View style={styles.createChoiceBody}>
                <Text style={styles.createChoiceTitle}>Event</Text>
                <Text style={styles.createChoiceSub}>Block time, time off, or a holiday</Text>
              </View>
              <Feather name="chevron-right" size={18} color={color.faint} />
            </Pressable>
          </View>
        </View>
      </Modal>
      {eventOpen ? (
        <CreateEventSheet
          crews={crews}
          crewsNotice={crewsNotice}
          onClose={() => setEventOpen(false)}
        />
      ) : null}
      {bookJob !== null ? (
        <BookSheet job={bookJob} onClose={() => setBookJob(null)} />
      ) : null}
    </>
  );

  if (showSpinner) {
    return (
      <View style={styles.screen}>
        {header}
        {bar}
        {strip}
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} size="large" />
        </View>
        {eventSheet}
      </View>
    );
  }

  if (dead) {
    return (
      <View style={styles.screen}>
        {header}
        {bar}
        {strip}
        <View style={styles.centre}>
          <Notices items={notices.length > 0 ? notices : ["The schedule isn't available."]} />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              rollWindow();
              void boardQuery.refetch();
              void trayQuery.refetch();
              void crewsQuery.refetch();
              void leadsQuery.refetch();
            }}
            style={({ pressed }) => [styles.button, pressed && styles.pressedSurface]}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
        {eventSheet}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      {bar}
      {strip}
      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.xxl }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={color.brand}
            colors={[color.brand]}
          />
        }
        ListHeaderComponent={<Notices items={notices} />}
        renderItem={({ item }) => {
          if (item.kind === "section") {
            return (
              <View>
                {/* Markate's date band: a full-width tinted strip with the day
                    on the left and what it is worth on the right, rather than a
                    faint label floating over the rows. It is the piece that
                    makes their lists scannable — you find the day, then the
                    money, without reading a single row. */}
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionLabel} numberOfLines={1}>
                    {item.label}
                  </Text>
                  {item.key === "section-tray" && (tray?.length ?? 0) > 3 ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setShowAllUnscheduled((shown) => !shown)}
                      hitSlop={space.sm}
                    >
                      <Text style={styles.sectionAction}>
                        {showAllUnscheduled ? "Show less" : `Show all ${tray?.length ?? 0}`}
                      </Text>
                    </Pressable>
                  ) : item.meta !== null ? (
                    <Text style={styles.sectionMeta}>{item.meta}</Text>
                  ) : null}
                </View>
                {item.key === "section-tray" ? (
                  <Text style={styles.sectionHint}>Swipe left or tap ••• to remove old jobs.</Text>
                ) : null}
              </View>
            );
          }
          if (item.kind === "timeline") return <DayTimeline blocks={item.blocks} />;
          if (item.kind === "calm") return <Text style={styles.calm}>{item.text}</Text>;
          if (item.kind === "tray") {
            return (
              <TrayRow
                job={item.job}
                onPress={() => openJob(item.job.id)}
                onBook={() => setBookJob(item.job)}
              />
            );
          }
          if (item.kind === "visit") {
            return <VisitRow visit={item.visit} onPress={() => setVisitId(item.visit.id)} />;
          }
          return (
            <JobRow job={item.job} crewName={item.crewName} onPress={() => openJob(item.job.id)} />
          );
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create"
        onPress={() => setCreateOpen(true)}
        style={({ pressed }) => [styles.fab, pressed && styles.chromeActionPressed]}
      >
        <Feather name="plus" size={25} color={color.surface} />
      </Pressable>
      {eventSheet}
      {activeVisit !== null ? (
        <VisitSheet
          visit={activeVisit}
          onClose={() => setVisitId(null)}
          // A native Modal floats above every pushed screen, so it has to come
          // down BEFORE the push, or it would cover the screen it just opened.
          onOpenLead={(id) => {
            setVisitId(null);
            router.push({ pathname: "/(owner)/lead/[id]", params: { id } });
          }}
          onOpenEstimate={(estimateId) => {
            setVisitId(null);
            router.push({ pathname: "/(owner)/estimate/new", params: { id: estimateId } });
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg, gap: space.md },

  chrome: {
    backgroundColor: color.bg,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  chromeText: { flex: 1, gap: space.xs },
  title: { ...type.chromeTitle, color: color.ink },
  stop: { color: color.brand },
  subtitle: { ...type.body, color: color.muted },
  chromeActionPressed: { opacity: 0.6 },

  strip: {
    flexDirection: "row",
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    paddingHorizontal: 1,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  cellOn: { backgroundColor: color.brandFill, borderColor: color.brandFill },
  pressedSurface: { backgroundColor: color.hover },
  dim: { opacity: 0.6 },
  disabled: { opacity: 0.5 },
  cellWeekday: {
    fontFamily: font.body,
    fontSize: 10.5,
    lineHeight: 13,
    color: color.muted,
    fontVariant: ["tabular-nums"],
  },
  cellDay: {
    fontFamily: font.bodySemi,
    fontSize: 14,
    lineHeight: 17,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  cellToday: { color: color.brandDeep },
  cellInkOn: { color: color.chromeInk },

  list: { paddingHorizontal: space.lg, paddingTop: space.xs },

  noticeStack: { gap: space.sm, marginBottom: space.md },
  notice: { backgroundColor: color.dangerBg, borderRadius: radius.md, padding: space.md },
  noticeText: { ...type.small, color: color.danger },
  goodNotice: { backgroundColor: color.goodBg, borderRadius: radius.md, padding: space.md },
  goodNoticeText: { ...type.small, color: color.good },

  // The date band. Tinted and full-bleed to the list's padding so it reads as a
  // divider between days rather than as another row.
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    minHeight: 42,
    paddingHorizontal: 14,
    marginHorizontal: -space.md,
    marginTop: space.md,
    marginBottom: space.sm,
    backgroundColor: color.hover,
  },
  sectionLabel: { ...type.rule, color: color.ink, flexShrink: 1 },
  sectionMeta: {
    fontFamily: font.monoMedium,
    fontSize: 14,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  sectionAction: { ...type.small, fontFamily: font.bodySemi, color: color.brandDeep },
  sectionHint: { ...type.smaller, color: color.muted, marginBottom: space.sm },

  // The event card. A thick coloured rail down the left and a wash of the same
  // colour across the card — Markate's calendar reads as green work and purple
  // quotes before a single word is read, and the rail is what does it.
  row: {
    minHeight: HIT,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderLeftWidth: 6,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.sm,
  },
  jobCard: { borderLeftColor: color.job, backgroundColor: color.jobBg, borderColor: color.line },
  quoteCard: {
    borderLeftColor: color.quote,
    backgroundColor: color.quoteBg,
    borderColor: color.line,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  time: { ...type.small, color: color.muted, flexShrink: 1, fontVariant: ["tabular-nums"] },
  money: {
    fontFamily: font.monoMedium,
    fontSize: 14,
    color: color.ink,
    flexShrink: 0,
    fontVariant: ["tabular-nums"],
  },
  // The outlined status pill Markate ends every list row with.
  rowMeta: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm },
  pill: {
    borderRadius: radius.chip,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillLive: {
    borderRadius: radius.chip,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.good,
    backgroundColor: color.goodBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  status: { ...type.ruleSm, color: color.muted },
  statusLive: { ...type.ruleSm, color: color.job },
  visitTag: { ...type.ruleSm, color: color.quote },
  pillQuote: {
    borderRadius: radius.chip,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.quote,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  customer: { ...type.title, color: color.ink, marginTop: space.sm },
  // TrayRow puts the name IN the top row beside the amount, so it must not
  // carry the stacked variant's top margin.
  customerLead: { ...type.title, color: color.ink, flexShrink: 1 },
  address: { ...type.small, color: color.muted, marginTop: space.xs },
  // No top margin: these now sit inside rowMeta, which owns the spacing.
  crew: { ...type.ruleSm, color: color.muted, flexShrink: 1 },
  crewUnassigned: { ...type.small, color: color.danger, flexShrink: 1 },

  // ── Day timeline ───────────────────────────────────────────────────────────
  timeline: {
    position: "relative",
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: space.sm,
  },
  hourRow: { height: HOUR_HEIGHT, flexDirection: "row", alignItems: "flex-start" },
  hourLabel: {
    width: RAIL_WIDTH,
    paddingTop: 6,
    paddingLeft: 10,
    ...type.ruleSm,
    color: color.muted,
    fontVariant: ["tabular-nums"],
  },
  // The rule sits at the TOP of its hour, so a block's offset and the line it
  // starts against are the same coordinate.
  hourLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: color.line },
  blockLayer: {
    position: "absolute",
    left: RAIL_WIDTH,
    right: 4,
    top: 0,
    bottom: 0,
  },
  block: {
    position: "absolute",
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
    justifyContent: "flex-start",
    gap: 2,
    // Blocks in adjacent columns must not touch, or two jobs read as one.
    borderWidth: 1.5,
    borderColor: color.surface,
  },
  blockJob: { backgroundColor: color.job },
  blockVisit: { backgroundColor: color.quote },
  blockPressed: { opacity: 0.82 },
  blockTitle: { ...type.smaller, fontFamily: font.bodySemi, color: color.surface },
  blockSub: { ...type.smaller, color: color.surface, opacity: 0.86 },

  calm: { ...type.body, color: color.muted, paddingVertical: space.md },

  button: {
    minHeight: HIT,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    paddingHorizontal: space.lg,
  },
  buttonText: { ...type.body, color: color.ink },
  primary: {
    minHeight: HIT,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: color.brandFill,
    paddingHorizontal: space.lg,
  },
  primaryPressed: { backgroundColor: color.brandDown },
  primaryText: { ...type.title, color: color.chromeInk },

  // ── Sheets (Modal), matching lead/[id] and customer/[id] ───────────────────
  sheet: { flex: 1, backgroundColor: color.bg, paddingTop: space.sm },
  sheetFill: { flex: 1 },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
    paddingHorizontal: space.lg,
  },
  sheetControl: { minHeight: HIT, minWidth: 56, justifyContent: "center" },
  sheetControlEnd: { alignItems: "flex-end" },
  sheetTitle: { ...type.title, color: color.ink },
  sheetCancel: { ...type.body, color: color.muted },
  sheetSave: { ...type.body, fontFamily: font.bodySemi, color: color.brand },
  sheetSaveOff: { color: color.faint },
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
    gap: space.sm,
  },
  weekTitle: {
    flexShrink: 1,
    fontFamily: font.displayMedium,
    fontSize: 16,
    lineHeight: 20,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  weekActions: { flexDirection: "row", alignItems: "center", gap: space.xs },
  todayButton: {
    minHeight: HIT,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  todayText: { ...type.small, fontFamily: font.bodySemi, color: color.ink },
  weekArrow: {
    width: HIT,
    height: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  trayRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
    overflow: "hidden",
  },
  trayBody: {
    flex: 1,
    minHeight: HIT,
    backgroundColor: color.surface,
    padding: space.md,
  },
  trayBook: {
    minWidth: HIT,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.surface,
  },
  tapToSchedule: {
    ...type.smaller,
    color: color.brandDeep,
    fontFamily: font.bodySemi,
    marginTop: 2,
  },
  fab: {
    position: "absolute",
    right: space.lg,
    bottom: space.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.brandFill,
    shadowColor: color.chrome,
    shadowOpacity: 0.2,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  menuOverlay: { flex: 1, justifyContent: "flex-end" },
  menuBackdrop: {
    position: "absolute",
    inset: 0,
    backgroundColor: color.scrim,
  },
  createMenu: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: space.sm,
  },
  createMenuHead: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  createMenuTitle: { ...type.heading, color: color.ink },
  menuClose: {
    width: HIT,
    height: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  createChoice: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  createChoiceBody: { flex: 1, minWidth: 0 },
  createChoiceTitle: { ...type.title, color: color.ink },
  createChoiceSub: { ...type.small, color: color.muted, marginTop: 2 },
  sheetBody: { padding: space.lg, gap: space.lg },

  body: { ...type.body, color: color.ink },
  muted: { ...type.small, color: color.muted },
  fieldGroup: { gap: space.sm },
  fieldLabel: { ...type.micro, color: color.faint },
  fieldValue: { ...type.body, color: color.ink },
  formInput: {
    // No lineHeight — the iOS placeholder-tracking gotcha every TextInput in
    // this app avoids.
    fontFamily: font.body,
    fontSize: 15,
    color: color.ink,
    minHeight: HIT,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  formMultiline: { minHeight: 96, paddingVertical: space.md, textAlignVertical: "top" },

  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    overflow: "hidden",
  },
  pad: { padding: space.lg, gap: space.sm },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.xs + 2 },
  chip: {
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  chipOn: { backgroundColor: color.brandFill, borderColor: color.brandFill },
  chipText: { ...type.body, color: color.ink },
  chipTextOn: { color: color.chromeInk },

  checkRow: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  box: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: color.goodBg, borderColor: color.good },
  boxMark: { ...type.body, color: color.good },

  picker: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    overflow: "hidden",
  },
  pickerRow: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
  },
  pickerMark: { ...type.micro, color: color.brandDeep },

  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  action: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  actionText: { ...type.small, color: color.brandDeep },
});
