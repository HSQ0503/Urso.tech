import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  PLAN_CADENCE_LABEL,
  type PlanCadence,
  type RecurringPlanDetail,
} from "@urso/types";
import { recurringActions } from "@/api";
import { keys, useCrews } from "@/queries";
import { useAction } from "@/query";
import { todayEt } from "@/dates";
import { color, HIT, space, type } from "@/theme";
import { DatePicker } from "./date-picker";
import { Notice } from "./notice";

export function RepeatSettings({
  plan,
  onClose,
}: {
  plan: RecurringPlanDetail;
  onClose: () => void;
}) {
  const next = [...plan.visits]
    .filter((visit) =>
      ["scheduled", "confirmed", "unscheduled"].includes(visit.status) && (!visit.scheduled_at || Date.parse(visit.scheduled_at)>Date.now()),
    )
    .sort((a, b) =>
      (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""),
    )[0];
  const [date, setDate] = useState(
    next?.scheduled_at
      ? todayEt(new Date(next.scheduled_at))
      : (plan.next_due_on ?? todayEt()),
  );
  const [time, setTime] = useState(plan.repeat_time?.slice(0, 5) ?? "08:00");
  const [duration, setDuration] = useState(
    String(plan.duration_minutes ?? 120),
  );
  const [crewId, setCrewId] = useState<string | null>(plan.crew_id ?? null);
  const [cadence, setCadence] = useState<PlanCadence>(plan.cadence);
  const [calendar, setCalendar] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const crews = useCrews();
  const save = useAction(
    () =>
      recurringActions.configure(plan.id, {
        startsOn: date,
        repeatTime: time,
        cadence,
        durationMinutes: Number(duration),
        crewId,
      }),
    { invalidates: [...keys.workflow()] },
  );
  const button = {
    minHeight: HIT,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  };
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: space.lg,
          gap: space.md,
          paddingBottom: 50,
          backgroundColor: color.bg,
        }}
      >
        <Text style={[type.heading, { color: color.ink }]}>
          Upcoming and future visits
        </Text>
        <Notice text={notice} />
        <Text style={{ color: color.muted }}>
          This confirms automatic booking. Existing signed agreements remain in
          history. Payments are not copied.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next repeat date"
          style={button}
          onPress={() => setCalendar(true)}
        >
          <Text style={{ color: color.ink }}>Next visit: {date}</Text>
        </Pressable>
        <Text style={{ color: color.ink }}>Repeat time (Eastern, HH:mm)</Text>
        <TextInput
          accessibilityLabel="Repeat time Eastern HH:mm"
          value={time}
          onChangeText={setTime}
          style={[button, { color: color.ink }]}
        />
        <Text style={{ color: color.ink }}>Duration in minutes</Text>
        <TextInput
          accessibilityLabel="Repeat duration minutes"
          value={duration}
          onChangeText={setDuration}
          keyboardType="number-pad"
          style={[button, { color: color.ink }]}
        />
        {Object.entries(PLAN_CADENCE_LABEL).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ checked: cadence === value }}
            style={button}
            onPress={() => setCadence(value as PlanCadence)}
          >
            <Text
              style={{ color: cadence === value ? color.brandDeep : color.ink }}
            >
              {cadence === value ? "✓ " : ""}
              {label}
            </Text>
          </Pressable>
        ))}
        <Text style={{ color: color.ink }}>Crew</Text>
        {[{ id: null, name: "Unassigned" }, ...(crews.data ?? [])].map(
          (crew) => (
            <Pressable
              key={crew.id ?? "none"}
              accessibilityRole="radio"
              accessibilityState={{ checked: crewId === crew.id }}
              style={button}
              onPress={() => setCrewId(crew.id)}
            >
              <Text
                style={{
                  color: crewId === crew.id ? color.brandDeep : color.ink,
                }}
              >
                {crewId === crew.id ? "✓ " : ""}
                {crew.name}
              </Text>
            </Pressable>
          ),
        )}
        <Pressable
          accessibilityRole="button"
          disabled={save.isPending}
          style={button}
          onPress={() =>
            void save.mutateAsync(undefined).then((result) => {
              setNotice(
                result.ok
                  ? (result.data.notice ?? "Repeat schedule saved.")
                  : result.notice,
              );
            })
          }
        >
          <Text style={{ color: color.brandDeep }}>
            {save.isPending ? "Saving…" : "Confirm repeat schedule"}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={button} onPress={onClose}>
          <Text style={{ color: color.ink }}>Close</Text>
        </Pressable>
        <DatePicker
          visible={calendar}
          title="Next repeat date"
          value={date}
          minimumDate={todayEt()}
          onChange={setDate}
          onClose={() => setCalendar(false)}
        />
      </ScrollView>
    </Modal>
  );
}
