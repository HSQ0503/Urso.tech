// The owner's calendar — a month at a glance, then a day in full.
//
// Sebastian, 2026-09-13: "The scheduling should be how Markate is, where it's
// a month view, then you can click on each day to see your booked jobs." So
// this is that: a Sun–Sat month grid with a dot under every day that has work
// (green for sold jobs, purple for quote visits) and the day's booked money
// under the number, and beneath it the selected day as a list — time,
// customer, address, crew, price — in the order he will drive it.
//
// The unscheduled pile is NOT here any more. Sold-but-unbooked work lives in
// Work orders (its Unscheduled tab), exactly where Markate keeps it; this
// screen is only ever about days that have something on them.
//
// Three objects share the board: JOBS (sold work), QUOTE VISITS (a lead with
// an appointment — tappable, offering what the web's VisitSheet offers), and
// CALENDAR EVENTS (time off, blocks, holidays), which this screen can create
// but does not yet draw — see the note over calendarEventCreate.
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
  type JobStatus,
  type Lead,
  type LeadStatus,
} from "@urso/types";
import { calendarEventActions, callActions, estimateActions } from "@/api";
import { NavigateButton } from "@/components/navigate";
import { Notice } from "@/components/notice";
import { isCompleteWhen, SlotPicker } from "@/components/slot-picker";
import { keys, useCrews, useLeads, useScheduleBoard } from "@/queries";
import { noticeFrom, useAction, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

// Statuses where the green actually means "this is happening / happened".
const IN_FLIGHT: JobStatus[] = ["in_progress", "completed", "invoiced", "paid"];
const UNASSIGNED = "Unassigned";

// A quote visit is a lead with an appointment, in exactly the two statuses the
// server's own listVisitsInRange accepts (lib/canes/data.ts). Mirrored rather
// than invented, so the phone and the board never disagree about what a visit is.
const VISIT_STATUSES: LeadStatus[] = ["appointment_set", "confirmed"];

const DAY_MS = 86_400_000;
// Six Sun–Sat rows cover any month; the grid never changes height between
// months, so the day list below never jumps.
const GRID_CELLS = 42;

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
  total_cents: number;
};

// A lead narrowed to the shape a visit row can rely on.
type Visit = Lead & { appointment_at: string };

type DayCell = {
  key: string; // ET calendar key, "2026-07-28"
  instant: string; // ET noon on that day, as an instant — safe to format
  day: string; // "28"
  inMonth: boolean; // padding days from the neighbouring months are drawn faint
};

type MonthWindow = {
  monthKey: string; // "2026-09"
  title: string; // "September 2026"
  cells: DayCell[]; // 42, Sunday-first
  fromIso: string; // ET midnight of the first cell
  days: number; // cells.length — what the board is asked for
};

type Row =
  | { kind: "job"; key: string; job: BoardJob; crewName: string | null }
  | { kind: "visit"; key: string; visit: Visit }
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

// Calendar arithmetic on YYYY-MM-DD keys is done at UTC noon, which is
// timezone-neutral and cannot straddle a DST change; the key is then handed
// to etLocalToIso when a real ET instant is needed.
function keyToNoonUtc(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

function shiftMonthKey(monthKey: string, months: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function todayKey(): string {
  return etDateKey(new Date().toISOString());
}

// The Sun–Sat grid for a month: Markate's calendar starts the week on Sunday,
// and his eyes are trained on that layout, so ours does too. (Payouts' "this
// week" starts Monday; that is a money window, not a calendar he looks at.)
function buildMonth(monthKey?: string): MonthWindow {
  const anchor = monthKey ?? todayKey().slice(0, 7);
  const [y, m] = anchor.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1, 12));
  const lead = first.getUTCDay(); // 0 = Sunday
  const start = new Date(first.getTime() - lead * DAY_MS);
  const cells: DayCell[] = [];
  for (let i = 0; i < GRID_CELLS; i++) {
    const d = new Date(start.getTime() + i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    cells.push({
      key,
      instant: etLocalToIso(`${key}T12:00`),
      day: String(d.getUTCDate()),
      inMonth: d.getUTCMonth() === m - 1,
    });
  }
  return {
    monthKey: anchor,
    title: fmtEt(etLocalToIso(`${anchor}-15T12:00`), { month: "long", year: "numeric" }),
    cells,
    fromIso: etLocalToIso(`${cells[0].key}T00:00`),
    days: GRID_CELLS,
  };
}

function toBoardJobs(value: unknown): BoardJob[] {
  return Array.isArray(value) ? (value as BoardJob[]) : [];
}

// The selected day's band label: Today / Tomorrow / "Tue, Sep 16".
function dayLabel(key: string): string {
  const today = todayKey();
  if (key === today) return "Today";
  if (key === nextDayKey(today)) return "Tomorrow";
  return fmtEt(etLocalToIso(`${key}T12:00`), { weekday: "short", month: "short", day: "numeric" });
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
  const create = useAction(calendarEventActions.create, {
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

// ── Month grid ───────────────────────────────────────────────────────────────

type DayMarks = { jobs: number; visits: number; cents: number };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "$1.4k" fits under a day number where "$1,400.00" cannot. Exact money is on
// the band and the rows below; the cell only has to say "there is money here
// and roughly how much".
function shortMoney(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 10_000) return `$${Math.round(dollars / 1000)}k`;
  if (dollars >= 1_000) return `$${(dollars / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `$${Math.round(dollars)}`;
}

function MonthGrid({
  cells,
  marks,
  selectedKey,
  onPick,
}: {
  cells: DayCell[];
  marks: Map<string, DayMarks>;
  selectedKey: string;
  onPick: (key: string) => void;
}) {
  const today = todayKey();
  return (
    <View style={styles.grid}>
      <View style={styles.gridHead}>
        {WEEKDAYS.map((label) => (
          <Text key={label} style={styles.gridHeadText}>
            {label}
          </Text>
        ))}
      </View>
      {Array.from({ length: GRID_CELLS / 7 }, (_, row) => (
        <View key={row} style={styles.gridRow}>
          {cells.slice(row * 7, row * 7 + 7).map((cell) => {
            const mark = marks.get(cell.key);
            const selected = cell.key === selectedKey;
            const isToday = cell.key === today;
            return (
              <Pressable
                key={cell.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${fmtEt(cell.instant, { weekday: "long", month: "long", day: "numeric" })}${
                  mark ? `, ${mark.jobs} job${mark.jobs === 1 ? "" : "s"}, ${mark.visits} quote visit${mark.visits === 1 ? "" : "s"}` : ""
                }`}
                onPress={() => onPick(cell.key)}
                style={({ pressed }) => [
                  styles.cell,
                  selected && styles.cellOn,
                  isToday && !selected && styles.cellToday,
                  pressed && !selected && styles.pressedSurface,
                ]}
              >
                <Text
                  style={[
                    styles.cellDay,
                    !cell.inMonth && styles.cellDayOut,
                    isToday && !selected && styles.cellDayToday,
                    selected && styles.cellInkOn,
                  ]}
                >
                  {cell.day}
                </Text>
                <View style={styles.dots}>
                  {mark && mark.jobs > 0 ? <View style={[styles.dot, styles.dotJob, selected && styles.dotOn]} /> : null}
                  {mark && mark.visits > 0 ? <View style={[styles.dot, styles.dotVisit, selected && styles.dotOn]} /> : null}
                </View>
                <Text style={[styles.cellMoney, selected && styles.cellInkOn]} numberOfLines={1}>
                  {mark && mark.cents > 0 ? shortMoney(mark.cents) : " "}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
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

  // null = the month containing today, and rolling: an app left open past
  // midnight (or past the month end) moves with the calendar on the next focus.
  // The arrows pin a month; Today clears the pin.
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [win, setWin] = useState<MonthWindow>(() => buildMonth());
  const [selectedKey, setSelectedKey] = useState<string>(todayKey);
  const [createOpen, setCreateOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [visitId, setVisitId] = useState<string | null>(null);

  const rollWindow = useCallback(() => {
    const next = buildMonth(monthKey ?? undefined);
    setWin(next);
    // Unpinned and the day rolled: follow today. Pinned: keep whatever day he
    // picked, as long as it is still on the grid.
    setSelectedKey((key) => {
      if (monthKey === null) return todayKey();
      return next.cells.some((c) => c.key === key) ? key : `${next.monthKey}-01`;
    });
  }, [monthKey]);
  useFocusEffect(rollWindow);

  const shiftMonth = useCallback((months: number) => {
    setMonthKey((current) => {
      const from = current ?? todayKey().slice(0, 7);
      const next = shiftMonthKey(from, months);
      const built = buildMonth(next);
      setWin(built);
      // Land on the 1st of the new month — or on today if we just came home.
      setSelectedKey(next === todayKey().slice(0, 7) ? todayKey() : `${next}-01`);
      return next;
    });
  }, []);

  const goToday = useCallback(() => {
    setMonthKey(null);
    setWin(buildMonth());
    setSelectedKey(todayKey());
  }, []);

  // One read covers the whole grid (42 days — inside the route's 92-day cap), so
  // tapping around the month is instant and offline-friendly.
  const boardQuery = useScheduleBoard(win.fromIso, win.days);
  const crewsQuery = useCrews();
  // Quote visits are leads with an appointment. Gated on `leads`, NOT on
  // `schedule` — an account with the board but not the pipeline gets a refusal
  // here alone, which is why it never joins the dead-screen test below.
  const leadsQuery = useLeads();

  useRefetchOnFocus(boardQuery.refetch);
  useRefetchOnFocus(crewsQuery.refetch);
  useRefetchOnFocus(leadsQuery.refetch);

  const { refreshing, onRefresh } = usePullToRefresh(() => {
    rollWindow();
    return Promise.all([boardQuery.refetch(), crewsQuery.refetch(), leadsQuery.refetch()]);
  });

  const board = useMemo(
    () => (boardQuery.data === undefined ? null : toBoardJobs(boardQuery.data)),
    [boardQuery.data],
  );
  const crews = useMemo(() => (crewsQuery.data ?? []).filter((c) => c.active), [crewsQuery.data]);
  const crewNames = useMemo(
    () => new Map<string, string>((crewsQuery.data ?? []).map((c) => [c.id, c.name])),
    [crewsQuery.data],
  );
  const crewsNotice = noticeFrom(crewsQuery.error);
  const notices = useMemo(() => {
    const failures = [boardQuery.error, crewsQuery.error, leadsQuery.error]
      .map(noticeFrom)
      .filter((notice): notice is string => notice !== null);
    return [...new Set(failures)];
  }, [boardQuery.error, crewsQuery.error, leadsQuery.error]);

  const gridKeys = useMemo(() => new Set(win.cells.map((c) => c.key)), [win.cells]);

  const visits = useMemo<Visit[]>(
    () =>
      (leadsQuery.data ?? [])
        .filter((lead): lead is Visit => lead.appointment_at !== null && VISIT_STATUSES.includes(lead.status))
        .filter((lead) => gridKeys.has(etDateKey(lead.appointment_at))),
    [leadsQuery.data, gridKeys],
  );

  const activeVisit = visitId === null ? null : visits.find((v) => v.id === visitId) ?? null;

  // What each cell shows: how many jobs, how many visits, and the day's booked
  // money (jobs only — a quote visit is not sold work).
  const marks = useMemo(() => {
    const map = new Map<string, DayMarks>();
    const at = (key: string) => {
      const existing = map.get(key);
      if (existing) return existing;
      const fresh = { jobs: 0, visits: 0, cents: 0 };
      map.set(key, fresh);
      return fresh;
    };
    for (const job of board ?? []) {
      if (!job.scheduled_at) continue;
      const mark = at(etDateKey(job.scheduled_at));
      mark.jobs += 1;
      mark.cents += job.total_cents;
    }
    for (const visit of visits) at(etDateKey(visit.appointment_at)).visits += 1;
    return map;
  }, [board, visits]);

  // The selected day, interleaved by clock time — the order he will physically
  // drive it, which is the only order that helps from a truck.
  const rows = useMemo<Row[]>(() => {
    const dayJobs = (board ?? [])
      .filter((job) => job.scheduled_at !== null && etDateKey(job.scheduled_at) === selectedKey)
      .map((job) => ({
        at: job.scheduled_at as string,
        row: {
          kind: "job" as const,
          key: job.id,
          job,
          crewName: job.crew_id === null ? UNASSIGNED : crewNames.get(job.crew_id) ?? null,
        },
      }));
    const dayVisits = visits
      .filter((visit) => etDateKey(visit.appointment_at) === selectedKey)
      .map((visit) => ({ at: visit.appointment_at, row: { kind: "visit" as const, key: `visit-${visit.id}`, visit } }));
    const entries = [...dayJobs, ...dayVisits]
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .map((entry) => entry.row);
    if (entries.length === 0) {
      return [{ kind: "calm", key: "calm-day", text: "Nothing booked for this day." }];
    }
    return entries;
  }, [board, visits, selectedKey, crewNames]);

  const dayCents = marks.get(selectedKey)?.cents ?? 0;

  const calendarReadable = board !== null || leadsQuery.data !== undefined;
  const loading = boardQuery.isFetching || crewsQuery.isFetching || leadsQuery.isFetching;
  const showSpinner = loading && !calendarReadable;
  const dead = !loading && !calendarReadable;

  const header = (
    <View style={[styles.chrome, { paddingTop: insets.top + space.md }]}>
      <View style={styles.chromeText}>
        <Text style={styles.title}>
          Schedule<Text style={styles.stop}>.</Text>
        </Text>
      </View>
    </View>
  );

  const bar = (
    <View style={styles.monthNav}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous month"
        onPress={() => shiftMonth(-1)}
        style={({ pressed }) => [styles.monthArrow, pressed && styles.pressedSurface]}
      >
        <Feather name="chevron-left" size={20} color={color.ink} />
      </Pressable>
      <Text style={styles.monthTitle}>{win.title}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next month"
        onPress={() => shiftMonth(1)}
        style={({ pressed }) => [styles.monthArrow, pressed && styles.pressedSurface]}
      >
        <Feather name="chevron-right" size={20} color={color.ink} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to today"
        disabled={monthKey === null && selectedKey === todayKey()}
        onPress={goToday}
        style={({ pressed }) => [
          styles.todayButton,
          pressed && styles.pressedSurface,
          monthKey === null && selectedKey === todayKey() && styles.disabled,
        ]}
      >
        <Text style={styles.todayText}>Today</Text>
      </Pressable>
    </View>
  );

  const grid = <MonthGrid cells={win.cells} marks={marks} selectedKey={selectedKey} onPick={setSelectedKey} />;

  // Mounted in every branch: a refused board is exactly the moment he still
  // wants to block out the afternoon.
  const eventSheet = (
    <>
      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
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
                router.push(`/(owner)/job/new?day=${encodeURIComponent(selectedKey)}`);
              }}
              style={({ pressed }) => [styles.createChoice, pressed && styles.pressedSurface]}
            >
              <Feather name="tool" size={18} color={color.brandDeep} />
              <View style={styles.createChoiceBody}>
                <Text style={styles.createChoiceTitle}>Work order</Text>
                <Text style={styles.createChoiceSub}>Add work for a customer on {dayLabel(selectedKey).toLowerCase()}</Text>
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
      {eventOpen ? <CreateEventSheet crews={crews} crewsNotice={crewsNotice} onClose={() => setEventOpen(false)} /> : null}
    </>
  );

  if (showSpinner) {
    return (
      <View style={styles.screen}>
        {header}
        {bar}
        {grid}
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
        {grid}
        <View style={styles.centre}>
          <Notices items={notices.length > 0 ? notices : ["The schedule isn't available."]} />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              rollWindow();
              void boardQuery.refetch();
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
      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.xxl + HIT }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} colors={[color.brand]} />
        }
        ListHeaderComponent={
          <View>
            {grid}
            <Notices items={notices} />
            {/* Markate's date band: the day on the left and what it is worth on
                the right. Only JOBS contribute — a quote visit is not sold
                work, so a day of visits shows no figure rather than $0.00. */}
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel} numberOfLines={1}>
                {dayLabel(selectedKey)}
                {([todayKey(), nextDayKey(todayKey())].includes(selectedKey)) ? <Text style={styles.sectionDate}>
                  {"  "}
                  {fmtEt(etLocalToIso(`${selectedKey}T12:00`), { month: "short", day: "numeric" })}
                </Text> : null}
              </Text>
              {dayCents > 0 ? <Text style={styles.sectionMeta}>{fmtMoney(dayCents)}</Text> : null}
            </View>
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === "calm") return <Text style={styles.calm}>{item.text}</Text>;
          if (item.kind === "visit") return <VisitRow visit={item.visit} onPress={() => setVisitId(item.visit.id)} />;
          return <JobRow job={item.job} crewName={item.crewName} onPress={() => openJob(item.job.id)} />;
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
  chromeText: { flex: 1 },
  title: { ...type.chromeTitle, color: color.ink },
  stop: { color: color.brand },
  chromeActionPressed: { opacity: 0.6 },

  // ── Month nav + grid ───────────────────────────────────────────────────────
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  monthTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: font.displayMedium,
    fontSize: 17,
    lineHeight: 21,
    color: color.ink,
  },
  monthArrow: {
    width: HIT,
    height: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  todayButton: {
    minHeight: HIT,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    marginLeft: space.xs,
  },
  todayText: { ...type.small, fontFamily: font.bodySemi, color: color.ink },
  grid: {
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    padding: 6,
    gap: 2,
  },
  gridHead: { flexDirection: "row", marginBottom: 2 },
  gridHeadText: { flex: 1, textAlign: "center", ...type.ruleSm, color: color.faint },
  gridRow: { flexDirection: "row", gap: 2 },
  cell: {
    flex: 1,
    minWidth: 0,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 5,
    paddingBottom: 3,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  cellOn: { backgroundColor: color.brandFill, borderColor: color.brandFill },
  cellToday: { borderColor: color.brand },
  cellDay: { fontFamily: font.bodySemi, fontSize: 14, lineHeight: 17, color: color.ink, fontVariant: ["tabular-nums"] },
  cellDayOut: { color: color.faint, fontFamily: font.body },
  cellDayToday: { color: color.brandDeep },
  cellInkOn: { color: color.chromeInk },
  dots: { flexDirection: "row", gap: 3, height: 6, marginTop: 3, alignItems: "center" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotJob: { backgroundColor: color.job },
  dotVisit: { backgroundColor: color.quote },
  dotOn: { backgroundColor: color.chromeInk },
  cellMoney: { fontFamily: font.mono, fontSize: 9, lineHeight: 12, color: color.muted, marginTop: 2 },
  pressedSurface: { backgroundColor: color.hover },
  dim: { opacity: 0.6 },
  disabled: { opacity: 0.5 },

  sectionDate: { ...type.rule, color: color.muted },

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
