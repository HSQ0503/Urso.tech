import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import * as Crypto from "expo-crypto";
import { fmtMoney, type BusinessExpense, type ExpenseRule } from "@urso/types";
import { expenseActions } from "@/api";
import { keys, useExpenseLedger } from "@/queries";
import { noticeFrom, useAction, useRefetchOnFocus } from "@/query";
import { todayEt } from "@/dates";
import { color, HIT, radius, space, type } from "@/theme";
import { Notice } from "./notice";

const inputStyle = {
  minHeight: HIT,
  borderWidth: 1,
  borderColor: color.lineStrong,
  borderRadius: radius.sm,
  paddingHorizontal: space.md,
  color: color.ink,
  backgroundColor: color.surface,
};
const buttonStyle = {
  minHeight: HIT,
  padding: space.md,
  justifyContent: "center" as const,
  borderRadius: radius.sm,
  backgroundColor: color.brandDown,
};

export function ExpenseLedgerControls() {
  const query = useExpenseLedger();
  useRefetchOnFocus(query.refetch);
  const action = useAction(expenseActions.ledger, {
    invalidates: [keys.expenses(), ...keys.financial()],
  });
  const [employeeId, setEmployeeId] = useState("");
  const [newName, setNewName] = useState("");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayEt);
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [requestKey, setRequestKey] = useState(Crypto.randomUUID);
  const [notice, setNotice] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const run = async (body: Record<string, unknown>) => {
    const result = await action.mutateAsync(body);
    setNotice(result.ok ? (result.data.notice ?? "Saved.") : result.notice);
    if (result.ok && body.action === "pay") {
      setRequestKey(Crypto.randomUUID());
      setAmount("");
      setNote("");
      setFormOpen(false);
    }
    if (result.ok && body.action === "addEmployee") setNewName("");
  };
  return (
    <View style={{ gap: space.md }}>
      <Notice text={notice ?? noticeFrom(query.error)} />
      <Text style={[type.heading, { color: color.ink }]}>
        Employee payments
      </Text>
      <Text style={[type.small, { color: color.muted }]}>
        Record payments already made. These count once as Labor expenses.
      </Text>
      {query.data?.employees.map((employee) => (
        <Pressable
          key={employee.id}
          accessibilityRole="button"
          accessibilityLabel={`Record payment to ${employee.name}`}
          onPress={() => {
            setEmployeeId(employee.id);
            setFormOpen(true);
          }}
          style={{
            padding: space.md,
            backgroundColor: color.surface,
            borderRadius: radius.md,
          }}
        >
          <Text style={[type.title, { color: color.ink }]}>
            {employee.name}
          </Text>
          <Text style={[type.small, { color: color.muted }]}>
            This month {fmtMoney(employee.monthCents)} · All time{" "}
            {fmtMoney(employee.allTimeCents)}
          </Text>
        </Pressable>
      ))}
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <TextInput
          accessibilityLabel="New employee name"
          placeholder="Employee name"
          placeholderTextColor={color.muted}
          style={[inputStyle, { flex: 1 }]}
          value={newName}
          onChangeText={setNewName}
        />
        <Pressable
          accessibilityRole="button"
          disabled={action.isPending || !newName.trim()}
          style={buttonStyle}
          onPress={() => void run({ action: "addEmployee", name: newName })}
        >
          <Text style={{ color: "white" }}>Add</Text>
        </Pressable>
      </View>
      {formOpen ? (
        <View style={{ gap: space.sm }}>
          <TextInput
            accessibilityLabel="Employee payment amount in dollars"
            placeholder="Amount paid ($)"
            placeholderTextColor={color.muted}
            keyboardType="decimal-pad"
            style={inputStyle}
            value={amount}
            onChangeText={setAmount}
          />
          <TextInput
            accessibilityLabel="Employee payment date YYYY-MM-DD"
            style={inputStyle}
            value={paidOn}
            onChangeText={setPaidOn}
          />
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}
          >
            {["cash", "check", "bank", "card", "other"].map((choice) => (
              <Pressable
                key={choice}
                accessibilityRole="radio"
                accessibilityState={{ checked: method === choice }}
                style={[
                  buttonStyle,
                  {
                    backgroundColor:
                      method === choice ? color.brandDown : color.chrome,
                  },
                ]}
                onPress={() => setMethod(choice)}
              >
                <Text style={{ color: "white" }}>{choice}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            accessibilityLabel="Employee payment note"
            placeholder="Optional note"
            placeholderTextColor={color.muted}
            style={inputStyle}
            value={note}
            onChangeText={setNote}
          />
          <Pressable
            accessibilityRole="button"
            disabled={action.isPending}
            style={buttonStyle}
            onPress={() =>
              void run({
                action: "pay",
                employeeId,
                amountCents: Math.round(Number(amount) * 100),
                paidOn,
                method,
                note,
                requestKey,
              })
            }
          >
            <Text style={{ color: "white" }}>Record payment</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={{ minHeight: HIT, justifyContent: "center" }}
            onPress={() => setFormOpen(false)}
          >
            <Text style={{ color: color.muted }}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
      <Text style={[type.title, { color: color.ink }]}>
        Recent payment history
      </Text>
      {query.data?.entries
        .filter((entry) => entry.employee_id)
        .map((entry) => (
          <View key={entry.id} style={{ paddingVertical: space.sm }}>
            <Text style={{ color: color.ink }}>
              {entry.incurred_on} · {entry.name} ·{" "}
              {fmtMoney(entry.amount_cents)}
            </Text>
            <Text style={{ color: color.muted }}>
              {entry.payment_method}
              {entry.note ? ` · ${entry.note}` : ""}
            </Text>
          </View>
        ))}
      <Text style={[type.heading, { color: color.ink }]}>
        Edit dated expenses
      </Text>
      {query.data?.entries
        .filter((entry) => !entry.employee_id)
        .map((entry) => (
          <EntryEditor
            key={`${entry.id}:${entry.amount_cents}:${entry.skipped}`}
            entry={entry}
            busy={action.isPending}
            onSave={(body) =>
              void run({ action: "entry", id: entry.id, ...body })
            }
          />
        ))}
      <Text style={[type.heading, { color: color.ink }]}>
        Recurring expense rules
      </Text>
      {query.data?.rules.map((rule) => (
        <RuleEditor
          key={`${rule.id}:${rule.next_due_on}:${rule.amount_cents}:${rule.active}`}
          rule={rule}
          busy={action.isPending}
          onSave={(body) => void run({ action: "rule", id: rule.id, ...body })}
        />
      ))}
    </View>
  );
}

function RuleEditor({
  rule,
  busy,
  onSave,
}: {
  rule: ExpenseRule;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState((rule.amount_cents / 100).toFixed(2));
  const [date, setDate] = useState(rule.next_due_on);
  const [end, setEnd] = useState(rule.ends_on ?? "");
  return (
    <View
      style={{
        padding: space.md,
        gap: space.sm,
        borderWidth: 1,
        borderColor: color.line,
        borderRadius: radius.md,
      }}
    >
      <Text style={[type.title, { color: color.ink }]}>
        {rule.name} · {fmtMoney(rule.amount_cents)}
      </Text>
      <Text style={{ color: color.muted }}>
        {rule.active ? `Next: ${rule.next_due_on}` : "Paused"} ·{" "}
        {rule.frequency}
      </Text>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          style={buttonStyle}
          onPress={() => onSave({ active: !rule.active })}
        >
          <Text style={{ color: "white" }}>
            {rule.active ? "Pause" : "Resume"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={buttonStyle}
          onPress={() => setOpen(!open)}
        >
          <Text style={{ color: "white" }}>Edit future expenses</Text>
        </Pressable>
      </View>
      {open ? (
        <>
          <TextInput
            accessibilityLabel={`Amount for ${rule.name}`}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            style={inputStyle}
          />
          <TextInput
            accessibilityLabel="Next expense date YYYY-MM-DD"
            value={date}
            onChangeText={setDate}
            style={inputStyle}
          />
          <TextInput
            accessibilityLabel="End date YYYY-MM-DD or blank"
            placeholder="End date (optional)"
            placeholderTextColor={color.muted}
            value={end}
            onChangeText={setEnd}
            style={inputStyle}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={buttonStyle}
            onPress={() =>
              onSave({
                amountCents: Math.round(Number(amount) * 100),
                nextDueOn: date,
                endsOn: end || null,
              })
            }
          >
            <Text style={{ color: "white" }}>Save future expenses</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

function EntryEditor({
  entry,
  busy,
  onSave,
}: {
  entry: BusinessExpense;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState((entry.amount_cents / 100).toFixed(2));
  const [note, setNote] = useState(entry.note ?? "");
  return (
    <View
      style={{
        gap: space.sm,
        padding: space.md,
        borderWidth: 1,
        borderColor: color.line,
      }}
    >
      <Pressable
        accessibilityRole="button"
        style={{ minHeight: HIT }}
        onPress={() => setOpen(!open)}
      >
        <Text style={{ color: color.ink }}>
          {entry.incurred_on} · {entry.name} · {fmtMoney(entry.amount_cents)}
          {entry.skipped ? " · Skipped" : ""}
        </Text>
      </Pressable>
      {open ? (
        <>
          <TextInput
            accessibilityLabel="Expense amount"
            style={inputStyle}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
          <TextInput
            accessibilityLabel="Expense note"
            style={inputStyle}
            value={note}
            onChangeText={setNote}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={buttonStyle}
            onPress={() =>
              onSave({ amountCents: Math.round(Number(amount) * 100), note })
            }
          >
            <Text style={{ color: "white" }}>Save this entry</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={buttonStyle}
            onPress={() => onSave({ skipped: !entry.skipped })}
          >
            <Text style={{ color: "white" }}>
              {entry.skipped ? "Restore this entry" : "Skip this entry"}
            </Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}
