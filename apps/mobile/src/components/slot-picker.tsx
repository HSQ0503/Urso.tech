import { useMemo, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { ET } from "@urso/types";
import { Feather } from "@expo/vector-icons";
import { DatePicker } from "@/components/date-picker";
import { dateLabel, isCalendarDate } from "@/dates";
import { color, font, HIT, radius, space, type } from "@/theme";

// Tap-to-book scheduler, ported line-for-line from the web SchedulePicker
// (components/leads/schedule-picker.tsx): day chips for the coming week, hour
// slots 8 AM–6 PM, and a quarter-hour row — Sebastian's ask, 15-minute starts.
// All Eastern time. Emits the same naive "YYYY-MM-DDTHH:mm" string the web
// picker does, so etLocalToIso at the call site keeps owning the timezone
// conversion; a day-only pick emits "YYYY-MM-DD", which callers treat as
// incomplete. The fixed 8–18 hour range is also the AM/PM guard: a slot that
// can only be daytime cannot be mis-booked to 2 AM.
//
// The calendar extends the quick picks to any date without changing the time.

const HOURS = ["08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18"];
const QUARTERS = ["00", "15", "30", "45"];

export function isCompleteWhen(v: string): boolean {
  return /T\d{2}:\d{2}$/.test(v);
}

// "8 AM" for an "HH", "8:15 AM" for an "HH:mm" off the hour.
function slotLabel(t: string): string {
  const h = Number(t.slice(0, 2));
  const m = t.slice(3, 5);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m && m !== "00" ? `:${m}` : ""} ${h >= 12 ? "PM" : "AM"}`;
}

type Day = { date: string; label: string; sub: string };

// Calendar days in ET starting today. Anchoring at UTC noon keeps the
// day-by-day walk stable across DST transitions.
function nextDays(count: number): Day[] {
  const todayEt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const anchor = new Date(`${todayEt}T12:00:00Z`);
  const days: Day[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(anchor.getTime() + i * 86_400_000);
    days.push({
      date: d.toISOString().slice(0, 10),
      label:
        i === 0
          ? "Today"
          : i === 1
            ? "Tomorrow"
            : d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      sub: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    });
  }
  return days;
}

function etNowHm(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ET,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

function Slot({
  label,
  sub,
  selected,
  disabled,
  onPress,
  flex,
}: {
  label: string;
  sub?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  flex?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: disabled ?? false }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.slot,
        flex && styles.slotFlex,
        selected && styles.slotSelected,
        disabled && styles.slotDisabled,
        pressed && !disabled && styles.slotPressed,
      ]}
    >
      <Text style={[styles.slotText, selected && styles.slotTextSelected]}>{label}</Text>
      {sub ? (
        <Text style={[styles.slotSub, selected && styles.slotTextSelected]}>{sub}</Text>
      ) : null}
    </Pressable>
  );
}

export function SlotPicker({
  value,
  onChange,
  allowPast = false,
}: {
  value: string;
  onChange: (v: string) => void;
  // Job flows pass true so Sebastian can back-date work he forgot to log;
  // lead-appointment flows keep the future-only guard.
  allowPast?: boolean;
}) {
  const days = useMemo(() => nextDays(7), []);
  const [calendarOpen, setCalendarOpen] = useState(false);
  // ET "now" is captured per render of a picker that lives inside a sheet the
  // user just opened — fresh enough, and it keeps the maths identical to web.
  const [nowHm] = useState(etNowHm);

  const pickedDay = value.slice(0, 10);
  const time = isCompleteWhen(value) ? value.slice(11, 16) : "";
  const hour = time.slice(0, 2);
  const minute = time.slice(3, 5);
  // Nothing picked yet reads as tomorrow — the most common booking.
  const day = isCalendarDate(pickedDay) ? pickedDay : days[1].date;
  const isToday = day === days[0].date;
  const isPast = (t: string) => !allowPast && (day < days[0].date || (isToday && t <= nowHm));

  function pickDay(date: string) {
    Keyboard.dismiss();
    const keep = time && (allowPast || date > days[0].date || (date === days[0].date && time > nowHm));
    onChange(keep ? `${date}T${time}` : date);
  }

  // Tapping an hour keeps the chosen quarter when it still works, else falls
  // to the hour's first future quarter.
  function pickHour(hh: string) {
    Keyboard.dismiss();
    const mm =
      minute && !isPast(`${hh}:${minute}`)
        ? minute
        : (QUARTERS.find((q) => !isPast(`${hh}:${q}`)) ?? "00");
    onChange(`${day}T${hh}:${mm}`);
  }

  const summary = time
    ? (() => {
        const d = days.find((x) => x.date === day);
        if (!d) return `${dateLabel(day)} · ${slotLabel(time)} ET`;
        const dayName = d.label === "Today" || d.label === "Tomorrow" ? d.label : `${d.label} ${d.sub}`;
        return `${dayName} · ${slotLabel(time)} ET`;
      })()
    : "";

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {days.map((d) => (
          <Slot
            key={d.date}
            label={d.label}
            sub={d.sub}
            selected={d.date === day}
            onPress={() => pickDay(d.date)}
          />
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose another date"
        onPress={() => { Keyboard.dismiss(); setCalendarOpen(true); }}
        style={({ pressed }) => [styles.dateButton, pressed && styles.slotPressed]}
      >
        <Feather name="calendar" size={20} color={color.brandDeep} />
        <View style={{ flex: 1 }}>
          <Text style={styles.dateTitle}>{isCalendarDate(pickedDay) ? dateLabel(pickedDay) : "Choose another date"}</Text>
          <Text style={styles.dateHint}>Browse any month or enter a date</Text>
        </View>
        <Feather name="chevron-right" size={20} color={color.brandDeep} />
      </Pressable>
      <DatePicker visible={calendarOpen} value={day} minimumDate={allowPast ? undefined : days[0].date} onChange={pickDay} onClose={() => setCalendarOpen(false)} />

      <View style={styles.row}>
        {HOURS.map((hh) => (
          <Slot
            key={hh}
            label={slotLabel(hh)}
            selected={hh === hour}
            // The hour is gone only once its last quarter is behind us.
            disabled={isPast(`${hh}:45`)}
            onPress={() => pickHour(hh)}
          />
        ))}
      </View>

      <View style={styles.rowEven}>
        {QUARTERS.map((mm) => (
          <Slot
            key={mm}
            flex
            label={`:${mm}`}
            selected={hour !== "" && mm === minute}
            disabled={!hour || isPast(`${hour}:${mm}`)}
            onPress={() => onChange(`${day}T${hour}:${mm}`)}
          />
        ))}
      </View>

      <Text style={styles.summary}>
        {summary || "Pick a day and a time (ET)."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.xs + 2 },
  rowEven: { flexDirection: "row", gap: space.xs + 2 },

  dateButton: { minHeight: HIT, flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: color.brandWash, borderWidth: 1, borderColor: color.brandEdgeSoft },
  dateTitle: { fontFamily: font.bodyMedium, fontSize: 15, color: color.ink },
  dateHint: { ...type.small, color: color.muted, marginTop: 3 },
  slot: {
    minHeight: HIT,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  slotFlex: { flex: 1, minWidth: 0 },
  slotSelected: { backgroundColor: color.brandFill, borderColor: color.brandFill },
  slotDisabled: { opacity: 0.35 },
  slotPressed: { backgroundColor: color.hover },
  slotText: { fontFamily: font.bodyMedium, fontSize: 14, color: color.ink },
  slotTextSelected: { color: color.chromeInk },
  slotSub: { ...type.micro, color: color.faint, marginTop: 1 },

  summary: { ...type.small, color: color.muted },
});
