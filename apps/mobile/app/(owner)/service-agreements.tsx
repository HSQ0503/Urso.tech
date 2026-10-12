import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import {
  SERVICE_AREAS,
  etLocalToIso,
  fmtEt,
  fmtMoney,
  serviceCancellationFee,
  type ServiceAgreement,
  type ServiceAgreementsView,
  type ServiceAgreementAction,
  type ServiceArea,
} from "@urso/types";
import { serviceAgreementActions } from "@/api";
import { keys, useServiceAgreements } from "@/queries";
import {
  noticeFrom,
  useAction,
  usePullToRefresh,
  useRefetchOnFocus,
} from "@/query";
import { SlotPicker } from "@/components/slot-picker";
import { ChromeBar } from "@/components/ledger";
import { Notice } from "@/components/notice";
import { color, HIT, space, type } from "@/canes-theme";

type Run = (input: ServiceAgreementAction) => Promise<void>;
function Field({
  label,
  value,
  onChange,
  numeric = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
}) {
  return (
    <View>
      <Text style={styles.detail}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? "decimal-pad" : "default"}
        style={styles.input}
      />
    </View>
  );
}
function AgreementCard({
  agreement,
  data,
  run,
  pending,
}: {
  agreement: ServiceAgreement;
  data: ServiceAgreementsView;
  run: Run;
  pending: boolean;
}) {
  const [setup, setSetup] = useState(false),
    [feeOpen, setFeeOpen] = useState(false),
    [history, setHistory] = useState(false);
  const [area, setArea] = useState<ServiceArea | null>(agreement.service_area),
    [crew, setCrew] = useState(agreement.crew_id ?? ""),
    [duration, setDuration] = useState(
      String(agreement.duration_minutes ?? ""),
    ),
    [appointment, setAppointment] = useState(""),
    [fee, setFee] = useState(""),
    [reason, setReason] = useState("");
  const occurrences = data.occurrences
    .filter((occurrence) => occurrence.agreement_id === agreement.id)
    .sort((a, b) => a.cycle - b.cycle);
  const next = occurrences.find((occurrence) =>
      ["needs_scheduling", "scheduled", "completed"].includes(occurrence.state),
    ),
    job = data.jobs.find((job) => job.id === next?.job_id);
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>{agreement.customer_name}</Text>
      <Text style={styles.title}>{agreement.service_name}</Text>
      <Text style={styles.detail}>{agreement.job_address}</Text>
      <Text style={styles.text}>
        {fmtMoney(agreement.recurring_price_cents)} before tax every{" "}
        {agreement.cadence_months} months
      </Text>
      <Text style={styles.detail}>
        {agreement.state.replaceAll("_", " ")} · signup savings{" "}
        {fmtMoney(agreement.signup_discount_cents)}
      </Text>
      <Text style={styles.detail}>
        {agreement.first_repeat_satisfied_at
          ? "Initial cancellation obligation satisfied."
          : `Original early-cancellation amount ${fmtMoney(serviceCancellationFee(agreement))}, before any owner waiver.`}
      </Text>
      {next ? (
        <>
          <Text style={styles.text}>Contractual due: {next.due_on}</Text>
          <Text style={styles.detail}>
            {job?.scheduled_at
              ? `Appointment: ${fmtEt(job.scheduled_at)}`
              : next.state.replaceAll("_", " ")}
          </Text>
          {next.scheduling_note ? (
            <Text style={styles.detail}>{next.scheduling_note}</Text>
          ) : null}
        </>
      ) : null}
      {job ? (
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={() =>
            router.push({
              pathname: "/(owner)/job/[id]",
              params: { id: job.id },
            })
          }
        >
          <Text style={styles.action}>Open visit</Text>
        </Pressable>
      ) : null}
      {agreement.state !== "canceled" ? (
        <>
          <Pressable
            accessibilityRole="button"
            style={styles.button}
            onPress={() => setSetup(!setup)}
          >
            <Text style={styles.action}>Scheduling setup</Text>
          </Pressable>
          {setup ? (
            <View style={styles.form}>
              <Text style={styles.detail}>
                Changes apply to unscheduled and future visits.
              </Text>
              <View style={styles.wrap}>
                {SERVICE_AREAS.map((option) => (
                  <Pressable
                    key={option.key}
                    accessibilityRole="button"
                    style={[
                      styles.button,
                      area === option.key && styles.selected,
                    ]}
                    onPress={() => setArea(option.key)}
                  >
                    <Text style={styles.text}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.detail}>Crew</Text>
              <View style={styles.wrap}>
                {data.crews.map((option) => (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    style={[
                      styles.button,
                      crew === option.id && styles.selected,
                    ]}
                    onPress={() => setCrew(option.id)}
                  >
                    <Text style={styles.text}>{option.name}</Text>
                  </Pressable>
                ))}
              </View>
              <Field
                label="Duration (minutes)"
                numeric
                value={duration}
                onChange={setDuration}
              />
              <Pressable
                accessibilityRole="button"
                style={styles.button}
                disabled={pending}
                onPress={() =>
                  void run({
                    action: "configure",
                    id: agreement.id,
                    area,
                    crewId: crew || null,
                    durationMinutes: Number(duration),
                  })
                }
              >
                <Text style={styles.action}>Save setup</Text>
              </Pressable>
              {next?.state === "needs_scheduling" ? (
                <>
                  <Text style={styles.detail}>
                    Manual appointment · Eastern time
                  </Text>
                  <SlotPicker value={appointment} onChange={setAppointment} />
                  <Pressable
                    accessibilityRole="button"
                    style={styles.button}
                    disabled={
                      pending ||
                      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(appointment) ||
                      !crew
                    }
                    onPress={() =>
                      void run({
                        action: "schedule",
                        occurrenceId: next.id,
                        scheduledAt: etLocalToIso(appointment),
                        crewId: crew,
                        durationMinutes: Number(duration),
                      })
                    }
                  >
                    <Text style={styles.action}>Schedule manually</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null}
          {agreement.activated_at ? (
            <>
              <Pressable
                accessibilityRole="button"
                disabled={pending}
                style={styles.button}
                onPress={() =>
                  void run({
                    action: "link",
                    id: agreement.id,
                    sendText: false,
                  })
                }
              >
                <Text style={styles.action}>Create cancellation link</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={pending}
                style={styles.button}
                onPress={() =>
                  void run({ action: "link", id: agreement.id, sendText: true })
                }
              >
                <Text style={styles.action}>Text cancellation link</Text>
              </Pressable>
            </>
          ) : null}
          <Pressable
            accessibilityRole="button"
            style={styles.button}
            onPress={() => setFeeOpen(!feeOpen)}
          >
            <Text style={styles.action}>Reduce or waive cancellation fee</Text>
          </Pressable>
          {feeOpen ? (
            <View style={styles.form}>
              <Field
                label="Reduced amount ($; 0 waives)"
                value={fee}
                onChange={setFee}
                numeric
              />
              <Field label="Audit reason" value={reason} onChange={setReason} />
              <Pressable
                accessibilityRole="button"
                disabled={pending}
                style={styles.button}
                onPress={() =>
                  void run({
                    action: "waive",
                    agreementId: agreement.id,
                    amountCents: Math.round(Number(fee) * 100),
                    reason,
                  })
                }
              >
                <Text style={styles.action}>Save fee reduction</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : null}
      <Pressable
        accessibilityRole="button"
        style={styles.button}
        onPress={() => setHistory(!history)}
      >
        <Text style={styles.action}>Agreement and visit history</Text>
      </Pressable>
      {history ? (
        <View style={styles.form}>
          <Text style={styles.detail}>
            Accepted by {agreement.accepted_name},{" "}
            {fmtEt(agreement.accepted_at)}. Original service:{" "}
            {agreement.original_service_on}.
          </Text>
          <Text style={styles.detail}>{agreement.terms_text}</Text>
          {occurrences.map((occurrence) => (
            <View key={occurrence.id}>
              <Text style={styles.text}>
                Due {occurrence.due_on} ·{" "}
                {occurrence.state.replaceAll("_", " ")}
              </Text>
              {occurrence.invoice_id ? (
                <Pressable
                  accessibilityRole="button"
                  style={styles.button}
                  onPress={() =>
                    router.push({
                      pathname: "/(owner)/invoice/[id]",
                      params: { id: occurrence.invoice_id! },
                    })
                  }
                >
                  <Text style={styles.action}>Open invoice</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
export default function ServiceAgreementsScreen() {
  const query = useServiceAgreements();
  useRefetchOnFocus(query.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(query.refetch);
  const action = useAction(serviceAgreementActions.save, {
    invalidates: [...keys.workflow(), ...keys.financial()],
  });
  const [notice, setNotice] = useState<string | null>(null),
    [link, setLink] = useState(""),
    [availabilityOpen, setAvailabilityOpen] = useState(false),
    [crew, setCrew] = useState(""),
    [days, setDays] = useState<number[]>([]),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [buffer, setBuffer] = useState("");
  const run: Run = async (input) => {
    const result = await action.mutateAsync(input);
    setNotice(result.ok ? (result.data.notice ?? "Saved.") : result.notice);
    if (result.ok && result.data.url) {
      if (input.action === "link") setLink(result.data.url);
      else if (input.action === "schedule") {
        const id = result.data.url.split("/").at(-1);
        if (id) router.push({ pathname: "/(owner)/job/[id]", params: { id } });
      }
    }
  };
  const minute = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  };
  const data = query.data;
  return (
    <View style={styles.screen}>
      <ChromeBar
        title="Recurring services"
        sub="Independent agreements · combined visits"
        onBack={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={color.brand}
          />
        }
      >
        <Notice text={notice ?? noticeFrom(query.error)} />
        {link ? (
          <View style={styles.card}>
            <Text selectable style={styles.detail}>
              {link}
            </Text>
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={() =>
                void Clipboard.setStringAsync(link).then(() =>
                  setNotice("Link copied."),
                )
              }
            >
              <Text style={styles.action}>Copy cancellation link</Text>
            </Pressable>
          </View>
        ) : null}
        {query.isPending && !query.error ? (
          <ActivityIndicator color={color.brand} />
        ) : null}
        {data ? (
          <>
            <Text style={styles.text}>
              {
                data.agreements.filter(
                  (agreement) => agreement.state === "active",
                ).length
              }{" "}
              active services
            </Text>
            {!data.agreements.length ? (
              <View style={styles.card}>
                <Text style={styles.heading}>
                  Start with a completed service invoice
                </Text>
                <Text style={styles.detail}>
                  Enable its recurring offer and share it with the customer.
                  Services activate after accepted terms, verified card setup
                  and settlement of the discounted current invoice.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  style={styles.button}
                  onPress={() => router.push("/(owner)/invoices")}
                >
                  <Text style={styles.action}>Open invoices</Text>
                </Pressable>
              </View>
            ) : null}
            {data.agreements.map((agreement) => (
              <AgreementCard
                key={agreement.id}
                agreement={agreement}
                data={data}
                run={run}
                pending={action.isPending}
              />
            ))}
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={() => setAvailabilityOpen(!availabilityOpen)}
            >
              <Text style={styles.action}>
                Crew working hours and travel buffer
              </Text>
            </Pressable>
            {availabilityOpen ? (
              <View style={styles.card}>
                <Text style={styles.detail}>
                  Automatic visits use area days within 14 days of their due
                  date. Sunday is manual only. Unassigned quote-visit days need
                  manual review.
                </Text>
                <View style={styles.wrap}>
                  {data.crews.map((option) => (
                    <Pressable
                      key={option.id}
                      accessibilityRole="button"
                      style={[
                        styles.button,
                        crew === option.id && styles.selected,
                      ]}
                      onPress={() => {
                        setCrew(option.id);
                        const existing = data.availability.find(
                          (item) => item.crew_id === option.id,
                        );
                        if (existing) {
                          setDays(existing.weekdays);
                          setStart(
                            `${String(Math.floor(existing.start_minute / 60)).padStart(2, "0")}:${String(existing.start_minute % 60).padStart(2, "0")}`,
                          );
                          setEnd(
                            `${String(Math.floor(existing.end_minute / 60)).padStart(2, "0")}:${String(existing.end_minute % 60).padStart(2, "0")}`,
                          );
                          setBuffer(String(existing.travel_buffer_minutes));
                        }
                      }}
                    >
                      <Text style={styles.text}>{option.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.wrap}>
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                    (day, index) => (
                      <Pressable
                        key={day}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: days.includes(index) }}
                        style={[
                          styles.button,
                          days.includes(index) && styles.selected,
                        ]}
                        onPress={() =>
                          setDays(
                            days.includes(index)
                              ? days.filter((value) => value !== index)
                              : [...days, index],
                          )
                        }
                      >
                        <Text style={styles.text}>{day}</Text>
                      </Pressable>
                    ),
                  )}
                </View>
                <Field
                  label="Start time (Eastern, HH:mm)"
                  value={start}
                  onChange={setStart}
                />
                <Field
                  label="End time (Eastern, HH:mm)"
                  value={end}
                  onChange={setEnd}
                />
                <Field
                  label="Travel buffer (minutes)"
                  value={buffer}
                  onChange={setBuffer}
                  numeric
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={action.isPending}
                  style={styles.button}
                  onPress={() =>
                    void run({
                      action: "availability",
                      crewId: crew,
                      weekdays: days,
                      startMinute: minute(start),
                      endMinute: minute(end),
                      travelBufferMinutes: Number(buffer),
                    })
                  }
                >
                  <Text style={styles.action}>Save availability</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : null}
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={() => router.push("/(owner)/recurring")}
        >
          <Text style={styles.action}>Older maintenance plans</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  body: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  card: {
    padding: space.lg,
    gap: space.md,
    backgroundColor: color.surface,
    borderRadius: 10,
  },
  form: { gap: space.md, paddingVertical: space.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  button: {
    minHeight: HIT,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    justifyContent: "center",
    backgroundColor: color.brandSoft,
    borderRadius: 8,
  },
  selected: { borderWidth: 1, borderColor: color.brand },
  heading: { ...type.heading, color: color.ink },
  title: { ...type.title, color: color.ink },
  text: { ...type.body, color: color.ink },
  detail: { ...type.small, color: color.muted },
  action: { ...type.body, color: color.brand },
  input: {
    minHeight: HIT,
    borderBottomWidth: 1,
    borderColor: color.lineStrong,
    ...type.body,
    color: color.ink,
  },
});
