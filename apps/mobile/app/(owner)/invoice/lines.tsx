// The line editor — the one screen in this app that rewrites a bill.
//
// invoice_items were WRITE-ONCE everywhere else in the codebase (the web has no
// line editing at all, only the adjustment lever), so the server refuses more
// here than anywhere: draft only, never once a Square invoice exists, never
// once ANY payment is recorded — a draft CAN carry a deposit, so status alone
// does not imply that one — and never down to zero lines. Those rules are NOT
// re-implemented here as hidden buttons; each is a sentence written for the
// reader and it arrives on Save, verbatim.
//
// The single exception is the empty bill. Removing the last line is prevented
// at the UI with a plain explanation, because the server would refuse it anyway
// and nobody should learn that rule by tapping Save.
//
// MONEY is integer cents. This screen computes ONE advisory figure — the
// running preview the reader is quoting out loud — and the server recomputes
// the bill on save. The only dollars→cents conversion is inputToCents at an
// input's edge, copied character for character from the web builder.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { QueryKey } from "@tanstack/react-query";
import {
  fmtMoney,
  invoiceBalanceCents,
  INVOICE_STATUS_LABEL,
  type CatalogItem,
  type InvoiceItem,
} from "@urso/types";
import { invoiceActions, type InvoiceLineInput } from "@/api";
import { Notice } from "@/components/notice";
import { keys, useCatalog, useInvoice } from "@/queries";
import { noticeFrom, useAction } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

// The web's dollars-to-cents contract (estimate-builder.tsx). It runs on every
// keystroke so the running total never lags the price being said out loud, and
// the field is normalised back to money on blur.
//
// Digits and dots only — NO minus, unlike the estimate builder's copy of this.
// An estimate line may legitimately be negative (a credit on an offer being
// shaped); a bill line may not, because a negative line is a refund and refunds
// belong in the payments ledger where they are auditable. The route refuses one
// with a 422 whose message is about shape, not about money, so stripping the
// sign here keeps the reader from ever meeting that sentence.
function inputToCents(v: string): number {
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Quantity is NOT money — hours and square footage are real, and the route
// takes any finite number ≥ 0. Digits and dots only, so decimal-pad can never
// produce the negative the route would reject.
function inputToQty(v: string): number {
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function qtyToInput(quantity: number): string {
  return String(quantity);
}

// Mirrors saveInvoiceItems' line_total_cents exactly: ONE round of qty × unit.
// There is no discount field on an invoice line (InvoiceLineInput has none).
function lineTotalCents(line: DraftLine): number {
  return Math.round(line.quantity * line.unitPriceCents);
}

// The draft carries both the number and the text the reader sees. The text is
// what a keyboard produces mid-word ("35", "35."); the number is what the
// preview and the payload use.
type DraftLine = {
  key: string;
  name: string;
  // Never edited on the phone, always carried through — saveItems is a
  // replace-all, so a description dropped here is a description deleted.
  description: string | null;
  quantity: number;
  qtyText: string;
  unitPriceCents: number;
  priceText: string;
};

// A removal held open for one undo — the draft is local, so taking a line back
// costs nothing until Save.
type Removed = { line: DraftLine; index: number };

let seq = 0;
function newKey(): string {
  seq += 1;
  return `line-${Date.now().toString(36)}-${seq}`;
}

function itemToDraft(item: InvoiceItem): DraftLine {
  return {
    key: item.id,
    name: item.name,
    description: item.description,
    quantity: item.quantity,
    qtyText: qtyToInput(item.quantity),
    unitPriceCents: item.unit_price_cents,
    priceText: centsToInput(item.unit_price_cents),
  };
}

// A catalog tap fills name, description and price. `kind` and `taxable` have
// nowhere to land — invoice_items carry neither column, and tax is settled by
// the bill's own tax_rate_bps server-side.
function catalogToDraft(item: CatalogItem): DraftLine {
  return {
    key: newKey(),
    name: item.name,
    description: item.description,
    quantity: 1,
    qtyText: "1",
    unitPriceCents: item.default_price_cents,
    priceText: centsToInput(item.default_price_cents),
  };
}

function blankDraft(): DraftLine {
  return {
    key: newKey(),
    name: "",
    description: null,
    quantity: 1,
    qtyText: "1",
    unitPriceCents: 0,
    priceText: "0.00",
  };
}

// One line, one card. Discrete objects rather than rows in a shared card: three
// inputs and a destructive control per line need the separation, and it keeps
// the remove glyphs a full card apart from each other.
function LineCard({
  line,
  index,
  canRemove,
  autoFocus,
  onPatch,
  onRemove,
}: {
  line: DraftLine;
  index: number;
  canRemove: boolean;
  autoFocus: boolean;
  onPatch: (key: string, patch: Partial<DraftLine>) => void;
  onRemove: (line: DraftLine) => void;
}) {
  const total = lineTotalCents(line);
  const label = line.name.trim().length > 0 ? line.name.trim() : `line ${index + 1}`;

  return (
    <View style={styles.lineCard}>
      <View style={styles.lineTop}>
        <TextInput
          value={line.name}
          onChangeText={(v) => onPatch(line.key, { name: v })}
          placeholder="Service name"
          placeholderTextColor={color.faint}
          returnKeyType="done"
          // A blank line is added in order to type a name into it, so the
          // keyboard comes up on the field that needs it and nowhere else.
          autoFocus={autoFocus}
          accessibilityLabel={`Line ${index + 1} name`}
          style={[styles.input, styles.grow]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            canRemove ? `Remove ${label}` : "Can't remove — a bill needs at least one line"
          }
          disabled={!canRemove}
          onPress={() => onRemove(line)}
          style={({ pressed }) => [
            styles.remove,
            pressed && styles.removePressed,
            !canRemove && styles.disabled,
          ]}
        >
          <Feather name="trash-2" size={18} color={color.danger} />
        </Pressable>
      </View>

      <View style={styles.lineFields}>
        <View style={styles.qtyField}>
          <Text style={styles.fieldLabel}>Qty</Text>
          <TextInput
            value={line.qtyText}
            onChangeText={(v) => onPatch(line.key, { qtyText: v, quantity: inputToQty(v) })}
            onBlur={() => onPatch(line.key, { qtyText: qtyToInput(line.quantity) })}
            keyboardType="decimal-pad"
            // Tapping a pre-filled number field to re-price puts the caret at
            // the end, so typing APPENDS: "150" over a stored 25.00 becomes
            // 25.00150, which blur then snaps back and the re-price is silently
            // lost. Selecting on focus makes the first keystroke replace.
            selectTextOnFocus
            placeholder="1"
            placeholderTextColor={color.faint}
            accessibilityLabel={`Line ${index + 1} quantity`}
            style={[styles.input, styles.numInput]}
          />
        </View>
        <View style={styles.priceField}>
          <Text style={styles.fieldLabel}>Unit price</Text>
          <TextInput
            value={line.priceText}
            onChangeText={(v) =>
              onPatch(line.key, {
                priceText: v,
                unitPriceCents: inputToCents(v),
              })
            }
            onBlur={() =>
              onPatch(line.key, {
                priceText: centsToInput(line.unitPriceCents),
              })
            }
            keyboardType="decimal-pad"
            selectTextOnFocus
            placeholder="0.00"
            placeholderTextColor={color.faint}
            accessibilityLabel={`Line ${index + 1} unit price in dollars`}
            style={[styles.input, styles.numInput]}
          />
        </View>
        <View style={styles.totalField}>
          <Text style={[styles.fieldLabel, styles.right]}>Line</Text>
          {/* Same box height as the two inputs beside it, so the figure sits on
              their centre line instead of floating on a guessed padding. */}
          <View style={styles.totalBox}>
            <Text
              style={styles.lineTotal}
              accessibilityLabel={`Line ${index + 1} total ${fmtMoney(total)}`}
            >
              {fmtMoney(total)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function InvoiceLinesScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  // No pull-to-refresh on an editor: a refetch would either overwrite the draft
  // under the reader's thumb or quietly do nothing. The bill is re-read on the
  // way in and rewritten on the way out.
  const invoiceQuery = useInvoice(id);
  const catalogQuery = useCatalog();

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [removed, setRemoved] = useState<Removed | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  // The blank line just added, so exactly one card mounts with the keyboard up.
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // This route is a tab screen, so it stays MOUNTED after router.back() and a
  // second visit can arrive with a different id. Seeding is therefore keyed by
  // id, not by mount — and never re-runs for the same bill, so a background
  // refetch can't overwrite work in progress.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    const items = invoiceQuery.data?.items;
    if (items === undefined || seededFor.current === id) return;
    seededFor.current = id;
    setLines(items.map(itemToDraft));
    setRemoved(null);
    setSaveNotice(null);
    setPickerOpen(false);
    setSearch("");
    setFocusKey(null);
  }, [id, invoiceQuery.data]);

  // Every surface a changed bill total moves: the bill itself, the list, the
  // job it belongs to, every board window (the ["owner","schedule"] prefix) and
  // the money on Today.
  const invoiceJobId = invoiceQuery.data?.job_id ?? null;
  const everywhere: QueryKey[] = [
    keys.invoiceOne(id),
    keys.invoices(),
    ...(invoiceJobId !== null ? [keys.jobs.one(invoiceJobId)] : []),
    ["owner", "schedule"],
    keys.overview(),
  ];
  const save = useAction((items: InvoiceLineInput[]) => invoiceActions.saveItems(id, items), {
    invalidates: everywhere,
  });

  const subtotalCents = useMemo(
    () => lines.reduce((sum, line) => sum + lineTotalCents(line), 0),
    [lines],
  );

  // Unsaved work is anything the server does not already hold, compared field
  // by field against the rows this draft was seeded from.
  const dirty = useMemo(() => {
    const items = invoiceQuery.data?.items;
    if (items === undefined) return false;
    if (items.length !== lines.length) return true;
    return lines.some((line, i) => {
      const item = items[i];
      return (
        item === undefined ||
        line.name.trim() !== item.name ||
        line.quantity !== item.quantity ||
        line.unitPriceCents !== item.unit_price_cents
      );
    });
  }, [lines, invoiceQuery.data]);

  const invoice = invoiceQuery.data ?? null;
  const notice = noticeFrom(invoiceQuery.error);
  const catalogNotice = noticeFrom(catalogQuery.error);

  const patchLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  // The unsaved-work warning lives here. Discarding also drops the draft — the
  // screen survives the navigation, and keeping edits the reader just discarded
  // would hand them straight back on the next visit.
  //
  // The Back control is NOT the only way off the screen, which an earlier
  // version of this comment claimed: Android's hardware back leaves without
  // passing through here at all. It gets the same guard below (a no-op
  // subscription on iOS), so the promise the warning makes is actually kept.
  const leave = () => {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert("Discard changes?", "The lines you edited won't be saved.", [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          setLines((invoiceQuery.data?.items ?? []).map(itemToDraft));
          setRemoved(null);
          setSaveNotice(null);
          router.back();
        },
      },
    ]);
  };

  // dirty through a ref so the subscription is registered once, not rebuilt on
  // every keystroke.
  const leaveRef = useRef(leave);
  useEffect(() => {
    leaveRef.current = leave;
  });
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (!dirtyRef.current) return false;
        leaveRef.current();
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  const header = (
    <View style={[styles.chrome, { paddingTop: insets.top + space.sm }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={leave}
        hitSlop={space.sm}
        style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
      >
        <Feather name="chevron-left" size={20} color={color.chromeMuted} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <Text style={styles.chromeName} numberOfLines={1}>
        Edit lines
      </Text>
      {invoice !== null ? (
        <Text style={styles.chromeMeta}>
          {`Invoice ${invoice.number} · ${INVOICE_STATUS_LABEL[invoice.status]}`}
        </Text>
      ) : null}
    </View>
  );

  if (invoiceQuery.isPending) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} size="large" />
        </View>
      </View>
    );
  }

  if (invoice === null) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.centre}>
          {notice !== null ? (
            <Notice text={notice} />
          ) : (
            <Text style={styles.muted}>Not found.</Text>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.button, styles.wide, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // The advisory preview. Adjustment and tax are the bill's own, shown for
  // context and never touched here; the balance goes through the SAME shared
  // helper invoice/[id] states it with, so there is one way to say this figure.
  const previewTotalCents = subtotalCents + invoice.adjustment_cents + invoice.tax_cents;
  const balanceCents = invoiceBalanceCents({
    total_cents: previewTotalCents,
    amount_paid_cents: invoice.amount_paid_cents,
  });

  const addCatalogLine = (item: CatalogItem) => {
    setLines((prev) => [...prev, catalogToDraft(item)]);
    setRemoved(null);
    setSaveNotice(null);
    // Closes so the line that just landed is what the reader sees next.
    setPickerOpen(false);
    setSearch("");
  };

  const addBlankLine = () => {
    const line = blankDraft();
    setLines((prev) => [...prev, line]);
    setFocusKey(line.key);
    setRemoved(null);
    setSaveNotice(null);
  };

  // A priced line is money coming off the bill in a driveway — it gets a
  // confirm naming the line and the amount. A zero line is a mis-tap and just
  // goes. Either way the removal is undoable until the next change.
  const removeLine = (line: DraftLine) => {
    const index = lines.findIndex((l) => l.key === line.key);
    if (index < 0 || lines.length <= 1) return;
    const cut = () => {
      setLines((prev) => prev.filter((l) => l.key !== line.key));
      setRemoved({ line, index });
      setSaveNotice(null);
    };
    const total = lineTotalCents(line);
    if (total <= 0) {
      cut();
      return;
    }
    Alert.alert(
      "Remove this line?",
      `${line.name.trim() || "This line"} — ${fmtMoney(total)} comes off the bill.`,
      [
        { text: "Keep", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: cut },
      ],
    );
  };

  const undoRemove = () => {
    if (removed === null) return;
    const { line, index } = removed;
    setLines((prev) => {
      const next = [...prev];
      next.splice(Math.min(index, next.length), 0, line);
      return next;
    });
    setRemoved(null);
  };

  const onSave = async () => {
    setSaveNotice(null);
    const items: InvoiceLineInput[] = lines.map((line) => ({
      name: line.name.trim(),
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
    }));
    const r = await save.mutateAsync(items);
    if (!r.ok) {
      setSaveNotice(r.notice);
      return;
    }
    setRemoved(null);
    // This route stays MOUNTED after router.back(), and seeding is keyed by id
    // — so without releasing the guard a later visit to the same bill would
    // show this now-stale draft instead of what the server stored.
    seededFor.current = null;
    router.back();
  };

  // Standing explanations, not surprises sprung by a tap: whichever one is true
  // sits above the Save control it is blocking.
  //
  // The first two mirror saveInvoiceItems' OTHER refusals, and they have to be
  // here rather than only at the entry door, because the commonest bill on this
  // system trips one: a job that took a booking deposit mints a DRAFT invoice
  // that already carries a payment. Without these the reader retypes a whole
  // bill and only learns at Save that the lines were frozen the entire time.
  // These are not client-side rules — the server owns them and its sentences
  // are the authority; this is the same fact said early, in the same words.
  const blockedBy =
    invoice !== null && invoice.square_invoice_id !== null
      ? "This bill is already on Square — void it and re-bill to change the lines."
      : invoice !== null && invoice.payments.length > 0
        ? "Money has already been recorded against this bill — its lines are frozen."
        : lines.length === 0
          ? "A bill needs at least one line."
          : lines.some((line) => line.name.trim().length === 0)
            ? "Every line needs a name."
            : null;
  const canSave = blockedBy === null && !save.isPending;

  const activeCatalog = (catalogQuery.data ?? []).filter((c) => c.active);
  const query = search.trim().toLowerCase();
  const matches =
    query.length === 0
      ? activeCatalog
      : activeCatalog.filter((c) => c.name.toLowerCase().includes(query));

  return (
    <View style={styles.screen}>
      {header}

      {/* The bar rides ABOVE the list, not below it, and that is the whole
          keyboard design of this screen.
          A phone keyboard covers the bottom third; the app's proven answer is
          automaticallyAdjustKeyboardInsets (job/[id], invoice/[id]), and what
          that does natively is scroll the focused field until its bottom edge
          meets the KEYBOARD'S TOP EDGE. So a bottom bar lifted on a
          KeyboardAvoidingView occupies exactly the band the field is being
          scrolled into — every line near the end of the list would land behind
          the Save control. Anchored under the chrome instead, the running total
          and Save are unburiable by construction, in every keyboard state, and
          the list keeps the scroll behaviour the rest of the app already has.
          It is also the platform convention: on iOS an editor's Save lives up
          by the title, not down by the thumb. */}
      <View style={styles.saveBar}>
        <View style={styles.saveRow}>
          <View style={styles.saveTotal}>
            <Text style={styles.fieldLabel}>Balance due</Text>
            <Text style={[styles.saveMoney, balanceCents > 0 && styles.moneyDue]}>
              {fmtMoney(balanceCents)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save lines"
            onPress={() => void onSave()}
            disabled={!canSave}
            style={({ pressed }) => [
              styles.primary,
              pressed && styles.primaryPressed,
              !canSave && styles.disabled,
            ]}
          >
            <Text style={styles.primaryText}>{save.isPending ? "Saving…" : "Save lines"}</Text>
          </Pressable>
        </View>
        {blockedBy !== null ? <Text style={styles.hint}>{blockedBy}</Text> : null}
        <Notice text={saveNotice} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled"
        // decimal-pad has no Return key on iOS; dragging the list is the way
        // out of it, and it is also how the reader gets a clear look at the
        // lines they just priced.
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <Notice text={notice} />

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Lines</Text>
          {lines.length === 0 ? (
            <View style={styles.card}>
              <View style={styles.pad}>
                <Text style={styles.muted}>
                  No lines on this bill. Add one below — a bill needs at least one.
                </Text>
              </View>
            </View>
          ) : null}
          {lines.map((line, index) => (
            <LineCard
              key={line.key}
              line={line}
              index={index}
              canRemove={lines.length > 1}
              autoFocus={line.key === focusKey}
              onPatch={patchLine}
              onRemove={removeLine}
            />
          ))}
          {removed !== null ? (
            <View style={styles.undoBar}>
              <Text style={styles.undoText} numberOfLines={1}>
                Removed {removed.line.name.trim() || "a line"}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Undo removing that line"
                onPress={undoRemove}
                style={({ pressed }) => [styles.undoButton, pressed && styles.pressed]}
              >
                <Text style={styles.undoAction}>Undo</Text>
              </Pressable>
            </View>
          ) : null}
          {/* Standing, not sprung: the greyed-out bin above says nothing on its
              own, so the reason sits under it before anyone taps. */}
          {lines.length === 1 ? (
            <Text style={styles.hint}>
              A bill needs at least one line — this one can&apos;t be removed.
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Add</Text>
          <View style={styles.card}>
            <View style={[styles.pad, styles.buttonRow]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: pickerOpen }}
                onPress={() => setPickerOpen((v) => !v)}
                style={({ pressed }) => [styles.button, styles.grow, pressed && styles.pressed]}
              >
                <Text style={styles.buttonText}>{pickerOpen ? "Close" : "Add service"}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add a blank line"
                onPress={addBlankLine}
                style={({ pressed }) => [styles.button, styles.grow, pressed && styles.pressed]}
              >
                <Text style={styles.buttonText}>Blank line</Text>
              </Pressable>
            </View>

            {pickerOpen ? (
              <>
                <View style={[styles.pad, styles.divided]}>
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search services"
                    placeholderTextColor={color.faint}
                    autoCapitalize="none"
                    autoCorrect={false}
                    clearButtonMode="while-editing"
                    returnKeyType="search"
                    accessibilityLabel="Search services"
                    style={styles.input}
                  />
                  <Notice text={catalogNotice} />
                  {catalogQuery.isPending ? (
                    <ActivityIndicator color={color.brand} />
                  ) : matches.length === 0 ? (
                    <Text style={styles.muted}>
                      {activeCatalog.length === 0
                        ? "No saved services yet — add a blank line instead."
                        : "Nothing matches that."}
                    </Text>
                  ) : null}
                </View>
                {matches.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${item.name}, ${fmtMoney(item.default_price_cents)}`}
                    onPress={() => addCatalogLine(item)}
                    style={({ pressed }) => [
                      styles.catalogRow,
                      styles.divided,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.body, styles.grow]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.money}>{fmtMoney(item.default_price_cents)}</Text>
                  </Pressable>
                ))}
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Totals</Text>
          <View style={styles.card}>
            <View style={styles.pad}>
              <View style={styles.moneyRow}>
                <Text style={styles.fieldLabel}>Subtotal</Text>
                <Text style={styles.money}>{fmtMoney(subtotalCents)}</Text>
              </View>
              {invoice.adjustment_cents !== 0 ? (
                <View style={styles.moneyRow}>
                  <Text style={styles.fieldLabel}>Adjustment</Text>
                  <Text style={styles.money}>{fmtMoney(invoice.adjustment_cents)}</Text>
                </View>
              ) : null}
              {invoice.tax_cents !== 0 ? (
                <View style={styles.moneyRow}>
                  <Text style={styles.fieldLabel}>Tax</Text>
                  <Text style={styles.money}>{fmtMoney(invoice.tax_cents)}</Text>
                </View>
              ) : null}
              <View style={styles.moneyRow}>
                <Text style={styles.fieldLabel}>Total</Text>
                <Text style={styles.moneyBig}>{fmtMoney(previewTotalCents)}</Text>
              </View>
              <View style={styles.moneyRow}>
                <Text style={styles.fieldLabel}>Amount paid</Text>
                <Text style={styles.money}>{fmtMoney(invoice.amount_paid_cents)}</Text>
              </View>
              <View style={styles.moneyRow}>
                <Text style={styles.fieldLabel}>Balance due</Text>
                <Text style={[styles.moneyBig, balanceCents > 0 && styles.moneyDue]}>
                  {fmtMoney(balanceCents)}
                </Text>
              </View>
              <Text style={styles.note}>
                Adjustment and tax stay as the bill has them. The server settles the bill when you
                save.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
    gap: space.md,
  },

  chrome: {
    backgroundColor: color.chrome,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    gap: space.xs,
  },
  back: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  backPressed: { opacity: 0.6 },
  backText: { ...type.body, color: color.chromeMuted },
  chromeName: { ...type.display, color: color.chromeInk },
  chromeMeta: { ...type.micro, color: color.chromeMuted },

  scrollBody: { padding: space.lg, gap: space.lg },
  body: { ...type.body, color: color.ink },
  muted: { ...type.small, color: color.muted },
  hint: { ...type.small, color: color.muted },
  note: { ...type.small, color: color.faint },
  right: { textAlign: "right" },

  section: { gap: space.sm },
  sectionLabel: { ...type.micro, color: color.faint },

  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    overflow: "hidden",
  },
  pad: { padding: space.lg, gap: space.sm },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },

  lineCard: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    padding: space.md,
    gap: space.sm,
  },
  lineTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  lineFields: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  qtyField: { flex: 1, gap: space.xs },
  priceField: { flex: 1.4, gap: space.xs },
  totalField: { flex: 1.1, gap: space.xs },
  totalBox: { minHeight: HIT, justifyContent: "center" },
  lineTotal: {
    fontFamily: font.bodySemi,
    fontSize: 15,
    color: color.ink,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  remove: {
    width: HIT,
    height: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  removePressed: { backgroundColor: color.dangerBg },

  undoBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: HIT,
    paddingLeft: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    overflow: "hidden",
  },
  undoText: { ...type.small, color: color.muted, flex: 1 },
  undoButton: {
    minHeight: HIT,
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  undoAction: {
    ...type.body,
    fontFamily: font.bodySemi,
    color: color.brandDeep,
  },

  catalogRow: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },

  fieldLabel: { ...type.micro, color: color.faint },
  money: { ...type.body, color: color.ink, fontVariant: ["tabular-nums"] },
  moneyBig: {
    fontFamily: font.bodySemi,
    fontSize: 17,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  moneyDue: { color: color.brandDeep },
  moneyRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },

  input: {
    // No lineHeight — the iOS placeholder-tracking gotcha every TextInput in
    // this app avoids (see customers.tsx search).
    fontFamily: font.body,
    fontSize: 15,
    color: color.ink,
    minHeight: HIT,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.bg,
  },
  numInput: { fontVariant: ["tabular-nums"] },

  primary: {
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: color.brandFill,
    paddingHorizontal: space.lg,
  },
  primaryPressed: { backgroundColor: color.brandDown },
  primaryText: { ...type.title, color: color.chromeInk },

  button: {
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    paddingHorizontal: space.lg,
  },
  buttonText: { ...type.body, color: color.ink },
  pressed: { backgroundColor: color.hover },
  wide: { alignSelf: "stretch" },
  disabled: { opacity: 0.5 },
  buttonRow: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },

  saveBar: {
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.lineStrong,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.sm,
  },
  saveRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  saveTotal: { flex: 1, gap: 2 },
  saveMoney: {
    fontFamily: font.bodySemi,
    fontSize: 22,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
});
