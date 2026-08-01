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
};

// A lead narrowed to the shape a visit row can rely on.
type Visit = Lead & { appointment_at: string };

type ViewMode = "day" | "week";

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
function buildWindow(): Window {
  const todayKey = etDateKey(new Date().toISOString());
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

// The week list's day headers. Index 0 is always today (buildWindow starts
// there), so the two friendly names are positional rather than a date compare.
function weekLabel(index: number, cell: DayCell): string {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  return fmtEt(cell.instant, { weekday: "short", month: "short", day: "numeric" });
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

function JobRow({
  job,
  crewName,
  onPress,
}: {
  job: BoardJob;
  crewName: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={job.customer_name ?? "Customer"}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressedSurface]}
    >
      <View style={styles.rowTop}>
        <Text style={styles.time}>{fmtEtTimeRange(job.scheduled_at, job.ends_at)}</Text>
        {/* Green only where green MEANS something. Rendering every status in the
            sold-job colour made the chip pure decoration: a job in progress and
            one merely scheduled looked identical, which is the one distinction
            an owner glancing at the day actually needs. */}
        <Text style={IN_FLIGHT.includes(job.status) ? styles.statusLive : styles.status}>
          {JOB_STATUS_LABEL[job.status]}
        </Text>
      </View>
      <Text style={styles.customer} numberOfLines={1}>
        {job.customer_name ?? "Customer"}
      </Text>
      <Text style={styles.address} numberOfLines={1}>
        {job.job_address ?? "Address pending"}
      </Text>
      {/* Unassigned is the highest-signal item on this screen — a job nobody is
          going to — and it was rendering in the faintest, smallest token in the
          system, visually identical to a named crew. */}
      {crewName !== null && (
        <Text style={crewName === UNASSIGNED ? styles.crewUnassigned : styles.crew}>
          {crewName}
        </Text>
      )}
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
      style={({ pressed }) => [styles.row, pressed && styles.pressedSurface]}
    >
      <View style={styles.rowTop}>
        <Text style={styles.time}>
          {fmtEt(visit.appointment_at, { hour: "numeric", minute: "2-digit" })}
        </Text>
        <Text style={styles.visitTag}>Quote visit</Text>
      </View>
      <Text style={styles.customer} numberOfLines={1}>
        {visit.name ?? "Estimate visit"}
      </Text>
      <Text style={styles.address} numberOfLines={1}>
        {visit.address ?? "Address pending"}
      </Text>
      <Text style={styles.crew}>
        {visit.service !== null
          ? `${STATUS_LABEL[visit.status]} · ${visit.service}`
          : STATUS_LABEL[visit.status]}
      </Text>
    </Pressable>
  );
}

function TrayRow({ job, onPress }: { job: Job; onPress: () => void }) {
  // The name leads, not the amount. Every row in this section is by definition
  // unscheduled, so repeating "UNSCHEDULED" on each one said nothing the section
  // header had not already said, while the customer — the thing being scanned
  // for — sat second. A zero total is left blank rather than shown as $0.00:
  // an unpriced job is not a nothing job, and rendering it as money reads as one.
  const total = job.total_cents > 0 ? fmtMoney(job.total_cents) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={job.customer_name ?? "Customer"}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressedSurface]}
    >
      <View style={styles.rowTop}>
        <Text style={styles.customerLead} numberOfLines={1}>
          {job.customer_name ?? "Customer"}
        </Text>
        {total !== null && <Text style={styles.money}>{total}</Text>}
      </View>
      <Text style={styles.address} numberOfLines={1}>
        {job.job_address ?? "Address pending"}
      </Text>
    </Pressable>
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
  const [selectedKey, setSelectedKey] = useState<string>(() => win.days[0].key);
  const [view, setView] = useState<ViewMode>("day");
  const [eventOpen, setEventOpen] = useState(false);
  const [visitId, setVisitId] = useState<string | null>(null);

  // Recomputed on every focus and every pull so an app left open overnight
  // rolls onto the new day the moment it is picked back up. The board's query
  // key carries the window, so a rolled window fetches itself.
  const rollWindow = useCallback(() => {
    const next = buildWindow();
    setWin(next);
    setSelectedKey((key) => (next.days.some((d) => d.key === key) ? key : next.days[0].key));
  }, []);
  useFocusEffect(rollWindow);

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

    if (calendarReadable) {
      if (view === "day") {
        const entries = entriesFor(selectedKey);
        out.push({
          kind: "section",
          key: "section-day",
          label: "On the calendar",
          meta: entries.length > 0 ? String(entries.length) : null,
        });
        if (entries.length === 0) {
          out.push({ kind: "calm", key: "calm-day", text: "Nothing booked for this day." });
        }
        out.push(...entries);
      } else {
        // Empty days are skipped rather than listed. Seven "nothing booked"
        // lines is the same information as one, spread over a scroll.
        let any = false;
        win.days.forEach((cell, index) => {
          const entries = entriesFor(cell.key);
          if (entries.length === 0) return;
          any = true;
          out.push({
            kind: "section",
            key: `section-${cell.key}`,
            label: weekLabel(index, cell),
            meta: String(entries.length),
          });
          out.push(...entries);
        });
        if (!any) {
          out.push({ kind: "section", key: "section-week", label: "On the calendar", meta: null });
          out.push({ kind: "calm", key: "calm-week", text: "Nothing booked this week." });
        }
      }
    }

    if (tray !== null) {
      // The count alone understates the pile. Six unscheduled jobs reads as a
      // tidy list; $15,400 of sold work with no date on it reads as the problem
      // it is, and it is the number that decides whether he books today or
      // keeps scrolling. Jobs with no total simply do not add to it.
      const trayCents = tray.reduce((sum, job) => sum + Math.max(0, job.total_cents), 0);
      out.push({
        kind: "section",
        key: "section-tray",
        label: "Unscheduled",
        meta: trayCents > 0 ? `${tray.length} · ${fmtMoney(trayCents)}` : String(tray.length),
      });
      if (tray.length === 0) {
        out.push({ kind: "calm", key: "calm-tray", text: "Every sold job has a slot." });
      }
      for (const job of tray) out.push({ kind: "tray", key: `tray-${job.id}`, job });
    }

    return out;
  }, [board, tray, visits, selectedKey, crewNames, view, win.days, calendarReadable]);

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
        <Text style={styles.title}>Schedule</Text>
        <Text style={styles.subtitle}>
          {view === "day"
            ? fmtEt(selected.instant, { weekday: "long", month: "long", day: "numeric" })
            : `${fmtEt(win.days[0].instant, { month: "short", day: "numeric" })} – ${fmtEt(
                win.days[DAYS - 1].instant,
                { month: "short", day: "numeric" },
              )}`}
        </Text>
      </View>
      {/* Work that never had a quote behind it. This is where a dispatcher
          thinks about it, so this is where it starts — and the day on screen
          seeds the picker, because that is the day he is staffing.
          A plain string href, not {pathname, params}: typed routes are
          generated into .expo/types, a dev artifact, so the object form does
          not typecheck until someone runs the app. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New job"
        onPress={() => router.push(`/(owner)/job/new?day=${encodeURIComponent(selectedKey)}`)}
        style={({ pressed }) => [styles.chromeAction, pressed && styles.chromeActionPressed]}
      >
        <Feather name="plus" size={16} color={color.chromeInk} />
        <Text style={styles.chromeActionText}>New job</Text>
      </Pressable>
    </View>
  );

  // Day / Week, and the other thing that can go on a calendar: a block, a
  // holiday, an afternoon off — anything that is not a job.
  const bar = (
    <View style={styles.bar}>
      <View style={styles.segment}>
        {(["day", "week"] as ViewMode[]).map((mode, index) => {
          const on = mode === view;
          return (
            <Pressable
              key={mode}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={mode === "day" ? "Day view" : "Week view"}
              onPress={() => setView(mode)}
              style={({ pressed }) => [
                styles.segmentCell,
                index > 0 && styles.segmentDivide,
                on && styles.segmentOn,
                pressed && !on && styles.pressedSurface,
              ]}
            >
              <Text style={[styles.segmentText, on && styles.segmentTextOn]}>
                {mode === "day" ? "Day" : "Week"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create a calendar event"
        onPress={() => setEventOpen(true)}
        style={({ pressed }) => [styles.eventButton, pressed && styles.pressedSurface]}
      >
        <Feather name="plus" size={15} color={color.brandDeep} />
        <Text style={styles.eventText}>Event</Text>
      </Pressable>
    </View>
  );

  // Seven cells have to fit one screen width — a strip you scroll to see Sunday
  // defeats the point. Cells run taller than HIT so the touch area stays well
  // past the 48pt floor even on a 375pt phone, where seven columns leave ~47pt
  // of width each.
  const strip = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
    >
      {win.days.map((cell) => {
        // In week view nothing is "the selected day" — the list shows them all —
        // so no cell is marked, and a tap means "show me THIS one", which is what
        // a day-cell click means on the desktop board too.
        const marked = cell.key === selectedKey && view === "day";
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
              setSelectedKey(cell.key);
              setView("day");
            }}
            style={({ pressed }) => [
              styles.cell,
              marked && styles.cellOn,
              pressed && !marked && styles.pressedSurface,
            ]}
          >
            <Text style={[styles.cellWeekday, marked && styles.cellInkOn]}>{cell.weekday}</Text>
            <Text style={[styles.cellDay, marked && styles.cellInkOn]}>{cell.day}</Text>
            <Text style={[styles.cellCount, marked && styles.cellInkOn]}>
              {count > 0 ? count : ""}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  // Mounted in every branch: a refused board is exactly the moment he still
  // wants to block out the afternoon.
  const eventSheet = eventOpen ? (
    <CreateEventSheet crews={crews} crewsNotice={crewsNotice} onClose={() => setEventOpen(false)} />
  ) : null;

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
              <View style={styles.sectionHead}>
                <Text style={styles.sectionLabel}>{item.label}</Text>
                {item.meta !== null && <Text style={styles.sectionMeta}>{item.meta}</Text>}
              </View>
            );
          }
          if (item.kind === "calm") return <Text style={styles.calm}>{item.text}</Text>;
          if (item.kind === "tray") {
            return <TrayRow job={item.job} onPress={() => openJob(item.job.id)} />;
          }
          if (item.kind === "visit") {
            return <VisitRow visit={item.visit} onPress={() => setVisitId(item.visit.id)} />;
          }
          return (
            <JobRow job={item.job} crewName={item.crewName} onPress={() => openJob(item.job.id)} />
          );
        }}
      />
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
            router.push({ pathname: "/(owner)/estimate/build", params: { id: estimateId } });
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
    backgroundColor: color.chrome,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  chromeText: { flex: 1, gap: space.xs },
  title: { ...type.display, color: color.chromeInk },
  subtitle: { ...type.micro, color: color.chromeMuted },
  chromeAction: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.chromeLine,
    backgroundColor: color.chromeRaise,
  },
  chromeActionPressed: { opacity: 0.6 },
  chromeActionText: { ...type.body, color: color.chromeInk },

  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  segment: {
    flexDirection: "row",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    overflow: "hidden",
  },
  segmentCell: {
    minHeight: HIT,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  segmentDivide: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: color.lineStrong },
  segmentOn: { backgroundColor: color.brandFill },
  segmentText: { ...type.body, color: color.ink },
  segmentTextOn: { color: color.chromeInk },
  eventButton: {
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
  eventText: { ...type.small, color: color.brandDeep },

  strip: {
    flexDirection: "row",
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  cell: {
    // FIXED width, not flex. Seven flex cells across a 375pt phone (iPhone SE,
    // 13 mini) compute to 46.7pt each — under the HIT floor, in a control used
    // one-handed outdoors. No arrangement of seven fixed columns clears 48pt on
    // a narrow phone, so the axis scrolls instead of the cell shrinking.
    width: 56,
    minHeight: HIT + space.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  cellOn: { backgroundColor: color.brandFill, borderColor: color.brandFill },
  pressedSurface: { backgroundColor: color.hover },
  dim: { opacity: 0.6 },
  disabled: { opacity: 0.5 },
  cellWeekday: { ...type.micro, color: color.faint },
  cellDay: {
    ...type.title,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  cellCount: { ...type.micro, color: color.brand, fontVariant: ["tabular-nums"] },
  cellInkOn: { color: color.chromeInk },

  list: { paddingHorizontal: space.lg, paddingTop: space.sm },

  noticeStack: { gap: space.sm, marginBottom: space.md },
  notice: { backgroundColor: color.dangerBg, borderRadius: radius.md, padding: space.md },
  noticeText: { ...type.small, color: color.danger },
  goodNotice: { backgroundColor: color.goodBg, borderRadius: radius.md, padding: space.md },
  goodNoticeText: { ...type.small, color: color.good },

  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  sectionLabel: { ...type.micro, color: color.faint },
  sectionMeta: { ...type.micro, color: color.ink, fontVariant: ["tabular-nums"] },

  row: {
    minHeight: HIT,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.sm,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  time: { ...type.small, color: color.muted, flexShrink: 1, fontVariant: ["tabular-nums"] },
  money: { ...type.small, color: color.ink, flexShrink: 1, fontVariant: ["tabular-nums"] },
  status: { ...type.micro, color: color.muted },
  statusLive: { ...type.micro, color: color.job },
  visitTag: { ...type.micro, color: color.quote },
  customer: { ...type.title, color: color.ink, marginTop: space.sm },
  // TrayRow puts the name IN the top row beside the amount, so it must not
  // carry the stacked variant's top margin.
  customerLead: { ...type.title, color: color.ink, flexShrink: 1 },
  address: { ...type.small, color: color.muted, marginTop: space.xs },
  crew: { ...type.micro, color: color.faint, marginTop: space.sm },
  crewUnassigned: { ...type.small, color: color.danger, marginTop: space.sm },

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
