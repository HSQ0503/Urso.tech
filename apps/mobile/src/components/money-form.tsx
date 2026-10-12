import { useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Crypto from "expo-crypto";
import {
  type MoneyMutation,
  type MoneyReport,
  type MoneyTab,
} from "@urso/types";
import { moneyActions } from "@/api";
import { keys } from "@/queries";
import { useAction } from "@/query";
import { todayEt } from "@/dates";
import { color, HIT, space, type } from "@/canes-theme";
import { Notice } from "./notice";

type Option = { id: string; name: string };
type Field = {
  key: string;
  label: string;
  numeric?: boolean;
  options?: Option[];
};
function Choice({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.input}
        onPress={() => setOpen(!open)}
      >
        <Text style={styles.text}>
          {options.find((option) => option.id === value)?.name ?? "Choose…"}
        </Text>
      </Pressable>
      {open ? (
        <View>
          <TextInput
            style={styles.input}
            placeholder="Search"
            placeholderTextColor={color.faint}
            accessibilityLabel={`Search ${label}`}
            value={search}
            onChangeText={setSearch}
          />
          <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
            {options
              .filter((option) =>
                option.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((option) => (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  style={styles.input}
                  onPress={() => {
                    onChange(option.id);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Text style={styles.text}>{option.name}</Text>
                </Pressable>
              ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

export function MoneyForm({
  report,
  tab,
}: {
  report: MoneyReport;
  tab: MoneyTab;
}) {
  const [mode, setMode] = useState(""),
    [values, setValues] = useState<Record<string, string>>({ date: todayEt() }),
    [notice, setNotice] = useState<string | null>(null);
  const request = useRef({ signature: "", key: "" });
  const action = useAction(moneyActions.save, {
    invalidates: [...keys.financial(), ...keys.workflow()],
  });
  const employee: Field = {
    key: "employee",
    label: "Worker",
    options: report.workers,
  };
  const job: Field = { key: "job", label: "Work order", options: report.jobs };
  const date: Field = { key: "date", label: "Date (YYYY-MM-DD)" };
  const amount: Field = { key: "amount", label: "Amount ($)", numeric: true };
  const reason: Field = { key: "reason", label: "Reason / description" };
  const channel: Field = {
    key: "channel",
    label: "Channel",
    options: report.channels.filter((channel) => channel.active),
  };
  const forms: Record<string, { title: string; fields: Field[] }> = {
    cost: {
      title: "Classify job cost",
      fields: [
        {
          key: "cost",
          label: "Job cost",
          options: report.jobCosts.map((cost) => ({
            id: cost.id,
            name: `${cost.label} · $${(cost.amountCents / 100).toFixed(2)}`,
          })),
        },
        {
          key: "line",
          label: "Direct service (or shared)",
          options: [
            { id: "", name: "Shared cost — allocate" },
            ...report.jobServiceLines.map((line) => ({
              id: `${line.jobId}:${line.id}`,
              name: line.name,
            })),
          ],
        },
        {
          key: "date",
          label: "Actually paid on (YYYY-MM-DD; blank if unknown)",
        },
      ],
    },
    rate: {
      title: "Set worker rate",
      fields: [
        employee,
        date,
        { key: "hourly", label: "Hourly rate ($)", numeric: true },
        {
          key: "commission",
          label: "Upsell commission % (0 disables)",
          numeric: true,
        },
      ],
    },
    approveTime: {
      title: "Approve actual hours",
      fields: [
        employee,
        job,
        date,
        { key: "hours", label: "Actual hours worked", numeric: true },
        reason,
      ],
    },
    adjustment: {
      title: "Adjust earnings",
      fields: [employee, date, amount, reason],
    },
    upsell: {
      title: "Approve upsell commission",
      fields: [
        employee,
        {
          key: "line",
          label: "Additional service",
          options: report.upsellLines.map((line) => ({
            id: `${line.invoiceId}:${line.serviceLineId}`,
            name: `${line.invoiceNumber} · ${line.name}`,
          })),
        },
        amount,
        reason,
      ],
    },
    spend: {
      title: "Record marketing spend",
      fields: [channel, date, amount, reason],
    },
    channel: {
      title: "Add marketing channel",
      fields: [{ key: "name", label: "Channel name" }],
    },
    attribution: { title: "Set acquisition channel", fields: [job, channel] },
    serviceDate: { title: "Set completion date", fields: [job, date] },
    paymentMethod: {
      title: "Classify manual payment",
      fields: [
        {
          key: "payment",
          label: "Payment",
          options: report.payments
            .filter(
              (payment) => payment.provider === "Manual" && payment.cents > 0,
            )
            .map((payment) => ({
              id: payment.paymentId,
              name: `${payment.at.slice(0, 10)} · $${(payment.cents / 100).toFixed(2)} · ${payment.method}`,
            })),
        },
        {
          key: "method",
          label: "Method",
          options: [
            "cash",
            "card",
            "check",
            "bank",
            "zelle",
            "venmo",
            "other",
          ].map((method) => ({ id: method, name: method })),
        },
      ],
    },
  };
  const modes =
    tab === "workers"
      ? ["rate", "approveTime", "upsell", "adjustment"]
      : tab === "marketing"
        ? ["spend", "attribution", "channel"]
        : tab === "payments"
          ? ["paymentMethod"]
          : tab === "services"
            ? ["serviceDate"]
            : tab === "expenses"
              ? ["cost"]
              : [];
  const form = modes.includes(mode) ? forms[mode] : undefined;
  const number = (key: string) => Math.round(Number(values[key]) * 100);
  async function save() {
    const signature = JSON.stringify({ mode, values });
    if (request.current.signature !== signature)
      request.current = { signature, key: Crypto.randomUUID() };
    const common = {
      employeeId: values.employee,
      date: values.date,
      requestKey: request.current.key,
      reason: values.reason,
    };
    let input: MoneyMutation;
    switch (mode) {
      case "cost":
        input = {
          action: mode,
          costId: values.cost,
          serviceLineId: values.line?.split(":")[1] || null,
          paidOn: values.date || null,
        };
        break;
      case "rate":
        input = {
          action: mode,
          employeeId: values.employee,
          effectiveOn: values.date,
          hourlyCents: number("hourly"),
          commissionBps: number("commission"),
        };
        break;
      case "approveTime":
        input = {
          action: mode,
          ...common,
          jobId: values.job,
          entryId: values.entry || undefined,
          minutes: Math.round(Number(values.hours) * 60),
        };
        break;
      case "adjustment":
        input = { action: mode, ...common, amountCents: number("amount") };
        break;
      case "upsell": {
        const line = report.upsellLines.find(
          (line) => `${line.invoiceId}:${line.serviceLineId}` === values.line,
        );
        input = {
          action: mode,
          employeeId: values.employee,
          invoiceId: line?.invoiceId ?? "",
          serviceLineId: line?.serviceLineId ?? "",
          additionalCents: number("amount"),
          reason: values.reason,
        };
        break;
      }
      case "spend":
        input = {
          action: mode,
          channelId: values.channel,
          date: values.date,
          amountCents: number("amount"),
          note: values.reason,
          requestKey: request.current.key,
        };
        break;
      case "channel":
        input = { action: mode, name: values.name };
        break;
      case "attribution":
        input = { action: mode, jobId: values.job, channelId: values.channel };
        break;
      case "paymentMethod":
        input = {
          action: mode,
          paymentId: values.payment,
          method: values.method,
        };
        break;
      case "serviceDate":
        input = { action: mode, jobId: values.job, date: values.date };
        break;
      default:
        return;
    }
    const result = await action.mutateAsync(input);
    setNotice(
      result.ok
        ? ((result.data.notice as string | undefined) ?? "Saved.")
        : result.notice,
    );
    if (result.ok) {
      setMode("");
      setValues({ date: todayEt() });
      request.current = { signature: "", key: "" };
    }
  }
  return (
    <View style={styles.stack}>
      <Notice text={notice} />
      {tab === "workers"
        ? report.time
            .filter((entry) => !entry.approved && entry.checkedOutAt)
            .map((entry) => (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                style={styles.button}
                onPress={() => {
                  setMode("approveTime");
                  setValues({
                    employee: entry.employeeId,
                    job: entry.jobId,
                    entry: entry.id,
                    date: new Intl.DateTimeFormat("en-CA", {
                      timeZone: "America/New_York",
                    }).format(new Date(entry.checkedInAt)),
                    hours: ((entry.minutes ?? 0) / 60).toFixed(2),
                    reason: "Reviewed clocked time",
                  });
                }}
              >
                <Text style={styles.text}>
                  Review {entry.employeeName} ·{" "}
                  {((entry.minutes ?? 0) / 60).toFixed(2)} hours
                </Text>
              </Pressable>
            ))
        : null}
      {modes.map((key) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          style={styles.button}
          onPress={() => {
            setMode(key === mode ? "" : key);
            setValues({ date: todayEt() });
          }}
        >
          <Text style={styles.action}>{forms[key].title}</Text>
        </Pressable>
      ))}
      {form ? (
        <View style={styles.form}>
          <Text style={styles.heading}>{form.title}</Text>
          {form.fields.map((field) => (
            <View key={field.key}>
              <Text style={styles.label}>{field.label}</Text>
              {field.options ? (
                <Choice
                  label={field.label}
                  options={field.options}
                  value={values[field.key] ?? ""}
                  onChange={(value) =>
                    setValues({ ...values, [field.key]: value })
                  }
                />
              ) : (
                <TextInput
                  accessibilityLabel={field.label}
                  style={styles.input}
                  placeholderTextColor={color.faint}
                  keyboardType={
                    field.numeric ? "numbers-and-punctuation" : "default"
                  }
                  value={values[field.key] ?? ""}
                  onChangeText={(value) =>
                    setValues({ ...values, [field.key]: value })
                  }
                />
              )}
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            disabled={action.isPending}
            style={styles.button}
            onPress={() => void save()}
          >
            <Text style={styles.action}>
              {action.isPending ? "Saving…" : "Save"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  stack: { gap: space.md },
  form: {
    padding: space.lg,
    backgroundColor: color.surface,
    borderRadius: 10,
    gap: space.md,
  },
  button: {
    minHeight: HIT,
    paddingHorizontal: space.md,
    justifyContent: "center",
    backgroundColor: color.brandSoft,
    borderRadius: 8,
  },
  input: {
    minHeight: HIT,
    borderBottomWidth: 1,
    borderColor: color.lineStrong,
    justifyContent: "center",
    ...type.body,
    color: color.ink,
  },
  text: { ...type.body, color: color.ink },
  action: { ...type.body, color: color.brand },
  heading: { ...type.heading, color: color.ink },
  label: { ...type.small, color: color.muted },
});
