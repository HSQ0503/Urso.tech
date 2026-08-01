// The estimate builder — the quote itself, shaped with a thumb in a driveway.
//
// This is the densest interaction in the app: a stack of money inputs on a
// phone, with a keyboard that wants to cover both the field being typed and the
// control that commits it. Three decisions come out of that:
//
//  1. THE TOTAL AND SAVE LIVE IN THE BLACK CHROME. The keyboard rises from the
//     bottom, so the one place it can never reach is the top. Sebastian is
//     saying the number out loud while he types, so the running total is the
//     biggest thing on the screen — bigger than the estimate number — and it
//     sits next to the control that commits it. The save refusal renders there
//     too: a sentence shown at the top of a long scroll is a sentence he never
//     reads if he tapped Save from the bottom.
//  2. THE SCROLLER USES automaticallyAdjustKeyboardInsets, the same mechanism
//     job/[id].tsx uses to keep its edit form clear of the keyboard. With Save
//     in the chrome there is no bottom bar to defend, so no KeyboardAvoidingView
//     is needed and nothing double-pads.
//  3. REMOVAL IS AN EXPLICIT LABELLED CONTROL, never a swipe. A swipe that
//     deletes a $2,000 line in a driveway is the failure this screen is designed
//     against: a priced line asks first, and the last removal stays undoable.
//
// Money is integer cents everywhere. The app formats with fmtMoney and computes
// ONLY the advisory running preview — mirroring lineTotalCents/itemCounts/
// computeTotals in actions.ts so the number never lags the tap. The server
// recomputes on save and is the authority (it also settles tax, which this
// preview deliberately omits). The single sanctioned conversion is the
// inputToCents/centsToInput pair at an input's edge, copied character for
// character from the web builder.

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
  ESTIMATE_STATUS_LABEL,
  fmtMoney,
  type CatalogItem,
  type CatalogKind,
  type EstimateItem,
} from "@urso/types";
import { estimateActions, type EstimateLineInput } from "@/api";
import { Notice } from "@/components/notice";
import { keys, useCatalog, useEstimate } from "@/queries";
import { noticeFrom, useAction } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

// The web builder's own dollars↔cents contract (estimate-builder.tsx), copied
// character for character. Nothing else in this file parses or divides money.
function inputToCents(v: string): number {
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Quantity is NOT money — hours and square footage are real, so this stays a
// plain number and never touches the cents mirror.
function inputToQty(v: string): number {
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

type DraftLine = {
  key: string;
  catalogId: string | null;
  name: string;
  description: string | null;
  kind: CatalogKind;
  quantity: number;
  // What the field shows while it is being typed ("1.", ".5"), separate from the
  // parsed value the total is computed from. Normalised on blur so a money field
  // always reads back as money.
  quantityText: string;
  unitPriceCents: number;
  priceText: string;
  // Carried through UNTOUCHED. The web builder has no discount input at all —
  // every line carries 0 or whatever the stored row already had — so inventing
  // one here would be a mobile-only field the owner cannot see or clear on the
  // web. A credit is expressed with the adjustment lever below.
  discountCents: number;
  // Also carried through: the builder has never had a taxable toggle. A catalog
  // line inherits the service's flag, a stored line keeps its own.
  taxable: boolean;
  isOption: boolean;
  isMandatory: boolean;
  packageGroup: string | null;
};

// Mirrors lineTotalCents in actions.ts: round(qty * unit) - discount.
function lineTotal(l: DraftLine): number {
  return Math.round(l.quantity * l.unitPriceCents) - l.discountCents;
}

// Mirrors the builder's lineCounts: mandatory and standard lines are in the
// total; an option is priced on the page but excluded until the customer picks
// it (saveEstimateItems seeds is_selected as "only when mandatory").
function lineCounts(l: DraftLine): boolean {
  return l.isMandatory || !l.isOption;
}

let seq = 0;
function newKey(): string {
  seq += 1;
  return `line-${Date.now().toString(36)}-${seq}`;
}

function itemToDraft(it: EstimateItem): DraftLine {
  return {
    key: it.id,
    catalogId: it.catalog_id,
    name: it.name,
    description: it.description,
    kind: it.kind,
    quantity: it.quantity,
    quantityText: String(it.quantity),
    unitPriceCents: it.unit_price_cents,
    priceText: centsToInput(it.unit_price_cents),
    discountCents: it.discount_cents,
    taxable: it.taxable,
    isOption: it.is_option,
    isMandatory: it.is_mandatory,
    packageGroup: it.package_group,
  };
}

// A catalog tap fills name, price, taxable and kind from the service — the
// whole point of the quick-add is not typing a price from memory.
function catalogToDraft(c: CatalogItem): DraftLine {
  return {
    key: newKey(),
    catalogId: c.id,
    name: c.name,
    description: c.description,
    kind: c.kind,
    quantity: 1,
    quantityText: "1",
    unitPriceCents: c.default_price_cents,
    priceText: centsToInput(c.default_price_cents),
    discountCents: 0,
    taxable: c.taxable,
    isOption: false,
    isMandatory: false,
    packageGroup: null,
  };
}

function blankDraft(isOption: boolean): DraftLine {
  return {
    key: newKey(),
    catalogId: null,
    name: "",
    description: null,
    kind: "service",
    quantity: 1,
    quantityText: "1",
    unitPriceCents: 0,
    priceText: "0.00",
    discountCents: 0,
    taxable: false,
    isOption,
    isMandatory: false,
    packageGroup: null,
  };
}

// is_option + is_mandatory are two booleans with three meanings. On a phone that
// is one control with three readings, not two switches to reason about.
type LineMode = "included" | "optional" | "required";

const MODES: { mode: LineMode; label: string; isOption: boolean; isMandatory: boolean }[] = [
  { mode: "included", label: "Included", isOption: false, isMandatory: false },
  { mode: "optional", label: "Optional", isOption: true, isMandatory: false },
  { mode: "required", label: "Required", isOption: true, isMandatory: true },
];

function modeOf(l: DraftLine): LineMode {
  if (!l.isOption) return "included";
  return l.isMandatory ? "required" : "optional";
}

const DEPOSIT_PRESETS: number[] = [0, 10, 25, 50];

// The dirty check and nothing else. Quantity is compared parsed, so "2." and "2"
// are the same quote — a caret sitting after a decimal point is not an edit.
function snapshot(lines: DraftLine[], adjustmentCents: number, depositPercent: number): string {
  return JSON.stringify({
    adjustmentCents,
    depositPercent,
    lines: lines.map((l) => [
      l.name.trim(),
      l.quantity,
      l.unitPriceCents,
      l.discountCents,
      l.taxable,
      l.isOption,
      l.isMandatory,
      l.kind,
      l.catalogId,
      l.packageGroup,
    ]),
  });
}

// Module scope, deliberately: a component declared inside the screen is a new
// component type on every render, which remounts every TextInput and drops the
// keyboard mid-word.
function LineCard({
  line,
  position,
  showOptions,
  disabled,
  onPatch,
  onRemove,
}: {
  line: DraftLine;
  position: number;
  showOptions: boolean;
  disabled: boolean;
  onPatch: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
}): React.ReactElement {
  const included = lineCounts(line);
  const mode = modeOf(line);
  const label = line.name.trim() === "" ? `Line ${position}` : line.name.trim();

  return (
    <View style={styles.card}>
      <View style={styles.pad}>
        <View style={styles.lineHead}>
          <Text style={styles.fieldLabel}>Line {position}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${label}`}
            onPress={onRemove}
            disabled={disabled}
            hitSlop={space.sm}
            style={({ pressed }) => [
              styles.remove,
              pressed && styles.removePressed,
              disabled && styles.disabled,
            ]}
          >
            <Feather name="trash-2" size={15} color={color.danger} />
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>

        <TextInput
          value={line.name}
          onChangeText={(t) => onPatch({ name: t })}
          placeholder="Service name"
          placeholderTextColor={color.faint}
          editable={!disabled}
          accessibilityLabel={`Line ${position} name`}
          style={styles.input}
        />
        {line.name.trim() === "" ? (
          <Text style={styles.hint}>Needs a name — an unnamed line is not saved.</Text>
        ) : null}

        <View style={styles.numberRow}>
          <View style={styles.qtyCell}>
            <Text style={styles.fieldLabel}>Qty</Text>
            <TextInput
              value={line.quantityText}
              onChangeText={(t) => onPatch({ quantityText: t, quantity: inputToQty(t) })}
              // Blur is where the field is made honest again: whatever was typed
              // reads back as the number the total was computed from.
              onBlur={() => onPatch({ quantityText: String(line.quantity) })}
              keyboardType="decimal-pad"
              selectTextOnFocus
              editable={!disabled}
              accessibilityLabel={`Line ${position} quantity`}
              style={[styles.input, styles.numInput]}
            />
          </View>
          <View style={styles.priceCell}>
            <Text style={styles.fieldLabel}>Unit price</Text>
            <TextInput
              value={line.priceText}
              onChangeText={(t) => onPatch({ priceText: t, unitPriceCents: inputToCents(t) })}
              onBlur={() => onPatch({ priceText: centsToInput(line.unitPriceCents) })}
              // decimal-pad has no minus key, so a negative (credit) line cannot
              // be TYPED here — a stored one survives untouched unless this field
              // is edited. Credits belong to the adjustment lever below.
              keyboardType="decimal-pad"
              selectTextOnFocus
              editable={!disabled}
              accessibilityLabel={`Line ${position} unit price in dollars`}
              style={[styles.input, styles.numInput]}
            />
          </View>
          <View style={styles.totalCell}>
            <Text style={styles.fieldLabel}>Line</Text>
            <Text
              style={[styles.lineMoney, !included && styles.excluded]}
              accessibilityLabel={`Line ${position} total ${fmtMoney(lineTotal(line))}`}
            >
              {fmtMoney(lineTotal(line))}
            </Text>
          </View>
        </View>

        {showOptions ? (
          <>
            <View style={styles.segment}>
              {MODES.map((m) => (
                <Pressable
                  key={m.mode}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mode === m.mode }}
                  accessibilityLabel={`${m.label} — line ${position}`}
                  onPress={() => onPatch({ isOption: m.isOption, isMandatory: m.isMandatory })}
                  disabled={disabled}
                  style={[styles.segmentCell, mode === m.mode && styles.segmentOn]}
                >
                  <Text style={[styles.segmentText, mode === m.mode && styles.segmentTextOn]}>
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {mode === "optional" ? (
              <Text style={styles.hint}>Priced on the quote, out of the total until they pick it.</Text>
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

export default function EstimateBuildScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  // No focus refetch and no pull-to-refresh on this screen: a refresh while the
  // draft is being typed has nothing to offer and everything to interrupt.
  const estimateQuery = useEstimate(id);
  const catalogQuery = useCatalog();

  const [lines, setLines] = useState<DraftLine[]>([]);
  // Adjustment is SIGNED — it is the discount lever — but decimal-pad has no
  // minus key. So the sign is a two-way control and the field carries magnitude
  // only, which also reads in plainer language than a typed "-50".
  const [adjustNegative, setAdjustNegative] = useState(true);
  const [adjustText, setAdjustText] = useState("0.00");
  const [depositPercent, setDepositPercent] = useState(0);
  const [depositText, setDepositText] = useState("0");
  const [depositCustom, setDepositCustom] = useState(false);
  const [search, setSearch] = useState("");
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  // One-slot undo: the last removed line and where it sat. Removal is meant to
  // feel reversible, not just confirmed.
  const [removed, setRemoved] = useState<{ line: DraftLine; index: number } | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);

  const estimate = estimateQuery.data ?? null;
  const loadNotice = noticeFrom(estimateQuery.error);
  const catalogNotice = noticeFrom(catalogQuery.error);

  // Seed ONCE per estimate. The guard holds the estimate id rather than a
  // boolean: a background refetch hands back a new object with the same id, and
  // an identity-keyed effect would re-seed from the server mid-sentence and wipe
  // whatever is being typed. Nothing but a different estimate — or leaving the
  // screen, which clears the guard below — re-seeds.
  const [seededId, setSeededId] = useState<string | null>(null);
  useEffect(() => {
    if (estimate === null) return;
    if (seededId === estimate.id) return;
    setSeededId(estimate.id);
    const seeded = estimate.items.map(itemToDraft);
    setLines(seeded);
    // A zero adjustment opens on "Take off": the lever exists to give a price
    // break, and -0 is === 0, so the sign of nothing costs nothing.
    setAdjustNegative(estimate.adjustment_cents <= 0);
    setAdjustText(centsToInput(Math.abs(estimate.adjustment_cents)));
    setDepositPercent(estimate.deposit_percent);
    setDepositText(String(estimate.deposit_percent));
    setDepositCustom(!DEPOSIT_PRESETS.includes(estimate.deposit_percent));
    setBaseline(snapshot(seeded, estimate.adjustment_cents, estimate.deposit_percent));
  }, [estimate, seededId]);

  const adjustmentCents = (adjustNegative ? -1 : 1) * Math.abs(inputToCents(adjustText));

  const totals = useMemo(() => {
    let subtotal = 0;
    for (const l of lines) {
      if (!lineCounts(l)) continue;
      subtotal += lineTotal(l);
    }
    // Advisory preview, mirroring computeTotals minus tax — the server settles
    // tax on save. The deposit percent is clamped exactly as updateEstimate
    // clamps it, so the previewed deposit is the one that will be stored.
    const total = subtotal + adjustmentCents;
    const pct = Math.max(0, Math.min(100, Math.round(depositPercent)));
    return { subtotal, total, deposit: Math.round((total * pct) / 100) };
  }, [lines, adjustmentCents, depositPercent]);

  const dirty = baseline !== null && snapshot(lines, adjustmentCents, depositPercent) !== baseline;

  // The Android hardware-back subscription reads this instead of `dirty` so it
  // is registered once, not re-registered on every keystroke.
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const confirmLeave = useCallback(() => {
    Alert.alert("Leave without saving?", "The lines and pricing you changed here will be lost.", [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          endSessionRef.current();
          router.back();
        },
      },
    ]);
  }, []);

  // Clearing the seed guard re-seeds from the server on the next render, which
  // is what "this draft is over" means on a screen that never unmounts.
  const endSession = useCallback(() => {
    setSeededId(null);
    setRemoved(null);
    setSaveNotice(null);
    setSearch("");
  }, []);
  // confirmLeave is memoised with no deps (it feeds a BackHandler subscription
  // that must not resubscribe on every keystroke), so it reaches endSession
  // through a ref rather than closing over it.
  const endSessionRef = useRef(endSession);
  useEffect(() => {
    endSessionRef.current = endSession;
  }, [endSession]);

  const onBack = useCallback(() => {
    if (dirtyRef.current) confirmLeave();
    else router.back();
  }, [confirmLeave]);

  // This screen draws its own chrome, so the Back control above is the intercept
  // point. Android's hardware back is the other way out of the screen and gets
  // the same guard (a no-op subscription on iOS).
  //
  // The cleanup removes the subscription and NOTHING ELSE. An earlier version
  // also cleared the seed guard here, reasoning that leaving ends the drafting
  // session — but blur is not leaving. This is a Tabs route, so the screen stays
  // MOUNTED when the reader taps another tab: clearing the guard re-armed the
  // seeding effect on the spot and overwrote the whole in-progress quote with
  // the server's stored lines, silently, with no undo. A glance at Today
  // mid-quote cost the quote.
  //
  // The session ends at exactly two moments — discard, and a save that landed —
  // and endSession() is called at both. That is also what makes "Discard"
  // genuinely discard on a screen the navigator never unmounts.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (!dirtyRef.current) return false;
        confirmLeave();
        return true;
      });
      return () => sub.remove();
    }, [confirmLeave]),
  );

  const quoteKeys: QueryKey[] = [keys.estimateOne(id), keys.estimates()];
  const saveLines = useAction((items: EstimateLineInput[]) => estimateActions.saveItems(id, items), {
    invalidates: quoteKeys,
  });
  const updateQuote = useAction(
    (patch: { adjustmentCents?: number; depositPercent?: number }) =>
      estimateActions.update(id, patch),
    { invalidates: quoteKeys },
  );
  const busy = saveLines.isPending || updateQuote.isPending;

  const patchLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeAt = (line: DraftLine, index: number) => {
    setRemoved({ line, index });
    setLines((prev) => prev.filter((l) => l.key !== line.key));
  };

  const onRemoveLine = (index: number) => {
    const line = lines[index];
    if (line === undefined) return;
    // A free or blank line goes without ceremony; anything carrying money asks
    // first, with the amount in the question.
    if (lineTotal(line) === 0) {
      removeAt(line, index);
      return;
    }
    Alert.alert(
      `Remove ${line.name.trim() === "" ? `line ${index + 1}` : line.name.trim()}?`,
      `That takes ${fmtMoney(lineTotal(line))} off the quote.`,
      [
        { text: "Keep it", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => removeAt(line, index) },
      ],
    );
  };

  const onUndoRemove = () => {
    if (removed === null) return;
    setLines((prev) => {
      const next = [...prev];
      next.splice(Math.min(removed.index, next.length), 0, removed.line);
      return next;
    });
    setRemoved(null);
  };

  const onAddCatalog = (c: CatalogItem) => {
    setLines((prev) => [...prev, catalogToDraft(c)]);
  };

  const onAddBlank = () => {
    setLines((prev) => [...prev, blankDraft(estimate?.estimate_type === "options")]);
  };

  const onSetDepositPreset = (p: number) => {
    setDepositCustom(false);
    setDepositPercent(p);
    setDepositText(String(p));
  };

  const onSave = async () => {
    if (estimate === null) return;
    setSaveNotice(null);
    // An unnamed line is dropped from the payload below (the web does the same)
    // — but the running total COUNTS it, so saving silently deleted priced work
    // and reported success. Refuse instead, in our own words, and say which
    // line: the reader can name it or remove it, and either way nothing
    // disappears behind their back.
    const unnamed = lines.filter((l) => l.name.trim() === "" && lineTotal(l) !== 0);
    if (unnamed.length > 0) {
      setSaveNotice(
        unnamed.length === 1
          ? `One line has a price but no name — name it or remove it before saving.`
          : `${unnamed.length} lines have a price but no name — name them or remove them before saving.`,
      );
      return;
    }
    // Details first, then items — the same order (and the same short-circuit)
    // the web builder's persist() uses: a refused patch must not be followed by
    // an items write. Only fields that actually differ from what is stored
    // travel; an absent key means "leave alone" server-side.
    const patch: { adjustmentCents?: number; depositPercent?: number } = {};
    if (adjustmentCents !== estimate.adjustment_cents) patch.adjustmentCents = adjustmentCents;
    if (depositPercent !== estimate.deposit_percent) patch.depositPercent = depositPercent;
    if (patch.adjustmentCents !== undefined || patch.depositPercent !== undefined) {
      const updated = await updateQuote.mutateAsync(patch);
      if (!updated.ok) {
        setSaveNotice(updated.notice);
        return;
      }
    }
    // Replace-all, unnamed lines dropped — exactly the web's itemsPayload().
    const items: EstimateLineInput[] = lines
      .filter((l) => l.name.trim() !== "")
      .map((l) => ({
        catalogId: l.catalogId,
        name: l.name.trim(),
        description: l.description,
        kind: l.kind,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        discountCents: l.discountCents,
        taxable: l.taxable,
        // A standard quote has no options for the customer to pick, so the flag
        // is flattened the way the web flattens it. A packages quote keeps what
        // it had rather than being silently rewritten by a phone.
        isOption: estimate.estimate_type === "standard" ? false : l.isOption,
        isMandatory: l.isMandatory,
        packageGroup: l.packageGroup,
      }));
    const saved = await saveLines.mutateAsync(items);
    if (!saved.ok) {
      setSaveNotice(saved.notice);
      return;
    }
    // useAction has already awaited the invalidations, so the quote screen is
    // refetching by the time this lands back on it. End the session too: this
    // screen stays mounted, and the saved draft must not be sitting here as an
    // "unsaved" edit the next time it opens.
    endSession();
    router.back();
  };

  const backControl = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onBack}
      hitSlop={space.sm}
      style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
    >
      <Feather name="chevron-left" size={20} color={color.chromeMuted} />
      <Text style={styles.backText}>Back</Text>
    </Pressable>
  );

  if (estimateQuery.isPending) {
    return (
      <View style={styles.screen}>
        <View style={[styles.chrome, { paddingTop: insets.top + space.sm }]}>
          {backControl}
          <Text style={styles.chromeName}>Quote</Text>
        </View>
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} size="large" />
        </View>
      </View>
    );
  }

  if (estimate === null) {
    return (
      <View style={styles.screen}>
        <View style={[styles.chrome, { paddingTop: insets.top + space.sm }]}>
          {backControl}
          <Text style={styles.chromeName}>Quote</Text>
        </View>
        <View style={styles.centre}>
          {loadNotice !== null ? (
            <Notice text={loadNotice} />
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

  // Options are a per-line choice only on an options quote; a standard quote's
  // every line is included, which is what makes it standard.
  const showOptions = estimate.estimate_type !== "standard";

  const activeCatalog = (catalogQuery.data ?? []).filter((c) => c.active);
  const query = search.trim().toLowerCase();
  // No cap on the list: a service hidden behind a "show more" is a service he
  // retypes by hand. Search narrows it instead.
  const catalogMatches =
    query === ""
      ? activeCatalog
      : activeCatalog.filter((c) => c.name.toLowerCase().includes(query));

  // The strip under the running total. Subtotal only earns its place when an
  // adjustment makes it differ from the total — repeating the same number twice
  // is noise on a header this size.
  const breakdownParts: string[] = [];
  if (adjustmentCents !== 0) {
    breakdownParts.push(`Subtotal ${fmtMoney(totals.subtotal)}`);
    breakdownParts.push(`Adjustment ${fmtMoney(adjustmentCents)}`);
  }
  if (depositPercent > 0) breakdownParts.push(`Deposit ${fmtMoney(totals.deposit)}`);
  breakdownParts.push(`${lines.length} ${lines.length === 1 ? "line" : "lines"}`);
  const breakdown = breakdownParts.join(" · ");

  // The undo strip takes the removed line's PLACE in the stack rather than
  // sitting at the top of the section: a line removed from the bottom of a long
  // quote would otherwise offer its undo somewhere off-screen.
  const undoStrip =
    removed === null ? null : (
      <Pressable
        key="undo"
        accessibilityRole="button"
        accessibilityLabel="Undo the last removal"
        onPress={onUndoRemove}
        style={({ pressed }) => [styles.undo, pressed && styles.pressed]}
      >
        <Feather name="corner-up-left" size={16} color={color.brandDeep} />
        <Text style={styles.undoText} numberOfLines={1}>
          Undo — removed{" "}
          {removed.line.name.trim() === "" ? "a blank line" : removed.line.name.trim()}
        </Text>
      </Pressable>
    );

  const lineNodes: React.ReactElement[] = [];
  lines.forEach((l, index) => {
    if (undoStrip !== null && removed !== null && removed.index === index) lineNodes.push(undoStrip);
    lineNodes.push(
      <LineCard
        key={l.key}
        line={l}
        position={index + 1}
        showOptions={showOptions}
        disabled={busy}
        onPatch={(patch) => patchLine(l.key, patch)}
        onRemove={() => onRemoveLine(index)}
      />,
    );
  });
  if (undoStrip !== null && removed !== null && removed.index >= lines.length) {
    lineNodes.push(undoStrip);
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.chrome, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.chromeTop}>
          {backControl}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save quote"
            onPress={() => void onSave()}
            disabled={busy}
            style={({ pressed }) => [
              styles.save,
              pressed && styles.savePressed,
              busy && styles.disabled,
            ]}
          >
            <Text style={styles.saveText}>{busy ? "Saving…" : "Save"}</Text>
          </Pressable>
        </View>

        <Text style={styles.chromeMeta} numberOfLines={1}>
          {estimate.number} · {ESTIMATE_STATUS_LABEL[estimate.status]}
          {dirty ? <Text style={styles.chromeDirty}> · Unsaved</Text> : null}
        </Text>
        {/* Label and number on one baseline: the header is already the tallest
            thing on a phone screen, and a stacked label costs a whole row of the
            lines below it. */}
        <View style={styles.chromeTotalRow}>
          <Text style={styles.chromeLabel}>Running total</Text>
          <Text
            style={styles.chromeTotal}
            accessibilityLabel={`Running total ${fmtMoney(totals.total)}`}
          >
            {fmtMoney(totals.total)}
          </Text>
        </View>
        <Text style={styles.chromeBreak}>{breakdown}</Text>
        {/* The refusal belongs to the control that earned it, and Save lives up
            here — a sentence rendered at the top of the scroll would be invisible
            to a tap made from the bottom of a long quote. The opaque backing is
            load-bearing: Notice's wash is a 10% red that composites to near-black
            straight onto the chrome, taking its dark-red text with it. */}
        {saveNotice !== null ? (
          <View style={styles.chromeNotice}>
            <Notice text={saveNotice} />
          </View>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled"
        // Scrolling to read the quote puts the keyboard away; the field commits
        // and reformats on blur, so nothing is lost by dismissing it.
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <Notice text={loadNotice} />

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Lines</Text>

          {lineNodes.length === 0 ? (
            <View style={styles.card}>
              <View style={styles.pad}>
                <Text style={styles.muted}>No lines yet. Add a service below.</Text>
              </View>
            </View>
          ) : (
            lineNodes
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Add</Text>
          <Notice text={catalogNotice} />
          <View style={styles.card}>
            <View style={styles.pad}>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search your services"
                placeholderTextColor={color.faint}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
                returnKeyType="search"
                accessibilityLabel="Search services"
                style={styles.input}
              />
            </View>

            {catalogMatches.map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={`Add ${c.name}, ${fmtMoney(c.default_price_cents)}`}
                onPress={() => onAddCatalog(c)}
                disabled={busy}
                style={({ pressed }) => [
                  styles.catalogRow,
                  styles.divided,
                  pressed && styles.cardPressed,
                  busy && styles.disabled,
                ]}
              >
                <View style={styles.catalogBody}>
                  <Text style={styles.body} numberOfLines={1}>
                    {c.name}
                  </Text>
                  {c.description !== null && c.description !== "" ? (
                    <Text style={styles.catalogSub} numberOfLines={1}>
                      {c.description}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.money}>{fmtMoney(c.default_price_cents)}</Text>
                <Feather name="plus" size={18} color={color.brandDeep} />
              </Pressable>
            ))}

            {catalogMatches.length === 0 ? (
              <View style={[styles.pad, styles.divided]}>
                <Text style={styles.muted}>
                  {catalogQuery.isPending
                    ? "Loading your services…"
                    : activeCatalog.length === 0
                      ? "No saved services yet — add a blank line and price it here."
                      : "No saved service matches that."}
                </Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a blank line"
              onPress={onAddBlank}
              disabled={busy}
              style={({ pressed }) => [
                styles.catalogRow,
                styles.divided,
                pressed && styles.cardPressed,
                busy && styles.disabled,
              ]}
            >
              <Text style={[styles.body, styles.grow]}>Blank line</Text>
              <Feather name="plus" size={18} color={color.brandDeep} />
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Pricing</Text>
          <View style={styles.card}>
            <View style={styles.pad}>
              <Text style={styles.fieldLabel}>Adjustment</Text>
              <View style={styles.methodRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: adjustNegative }}
                  accessibilityLabel="Adjustment takes money off"
                  onPress={() => setAdjustNegative(true)}
                  disabled={busy}
                  style={[styles.method, adjustNegative && styles.methodOn]}
                >
                  <Text style={[styles.buttonText, adjustNegative && styles.methodTextOn]}>
                    Take off
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: !adjustNegative }}
                  accessibilityLabel="Adjustment adds money on"
                  onPress={() => setAdjustNegative(false)}
                  disabled={busy}
                  style={[styles.method, !adjustNegative && styles.methodOn]}
                >
                  <Text style={[styles.buttonText, !adjustNegative && styles.methodTextOn]}>
                    Add on
                  </Text>
                </Pressable>
              </View>
              <TextInput
                value={adjustText}
                onChangeText={setAdjustText}
                onBlur={() => setAdjustText(centsToInput(Math.abs(inputToCents(adjustText))))}
                placeholder="0.00"
                placeholderTextColor={color.faint}
                keyboardType="decimal-pad"
                selectTextOnFocus
                editable={!busy}
                accessibilityLabel="Adjustment amount in dollars"
                style={styles.input}
              />
              <Text style={styles.hint}>
                {adjustNegative
                  ? "Comes off the total — the discount lever."
                  : "Added to the total — travel, access, anything extra."}
              </Text>
            </View>

            <View style={[styles.pad, styles.divided]}>
              <Text style={styles.fieldLabel}>Deposit on approval</Text>
              <View style={styles.chipRow}>
                {DEPOSIT_PRESETS.map((p) => {
                  const on = !depositCustom && depositPercent === p;
                  return (
                    <Pressable
                      key={p}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={p === 0 ? "No deposit" : `Deposit ${p} percent`}
                      onPress={() => onSetDepositPreset(p)}
                      disabled={busy}
                      style={({ pressed }) => [
                        styles.chip,
                        on && styles.chipOn,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.buttonText, on && styles.chipTextOn]}>
                        {p === 0 ? "None" : `${p}%`}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: depositCustom }}
                  accessibilityLabel="Custom deposit percent"
                  onPress={() => setDepositCustom(true)}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.chip,
                    depositCustom && styles.chipOn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.buttonText, depositCustom && styles.chipTextOn]}>Custom</Text>
                </Pressable>
              </View>
              {depositCustom ? (
                <View style={styles.percentRow}>
                  <TextInput
                    value={depositText}
                    onChangeText={(t) => {
                      const digits = t.replace(/[^0-9]/g, "");
                      setDepositText(digits);
                      // Not money, and not clamped here — updateEstimate owns
                      // the 0–100 clamp and the preview above mirrors it.
                      setDepositPercent(digits === "" ? 0 : Number(digits));
                    }}
                    placeholder="0"
                    placeholderTextColor={color.faint}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    editable={!busy}
                    accessibilityLabel="Deposit percent"
                    style={[styles.input, styles.percentInput]}
                  />
                  <Text style={styles.body}>%</Text>
                </View>
              ) : null}
            </View>

            <View style={[styles.pad, styles.divided]}>
              <View style={styles.moneyRow}>
                <Text style={styles.fieldLabel}>Subtotal</Text>
                <Text style={styles.money}>{fmtMoney(totals.subtotal)}</Text>
              </View>
              {adjustmentCents !== 0 ? (
                <View style={styles.moneyRow}>
                  <Text style={styles.fieldLabel}>Adjustment</Text>
                  <Text style={styles.money}>{fmtMoney(adjustmentCents)}</Text>
                </View>
              ) : null}
              <View style={styles.moneyRow}>
                <Text style={styles.fieldLabel}>Total</Text>
                <Text style={styles.moneyBig}>{fmtMoney(totals.total)}</Text>
              </View>
              {depositPercent > 0 ? (
                <View style={styles.moneyRow}>
                  <Text style={styles.fieldLabel}>Deposit due on approval</Text>
                  <Text style={styles.money}>{fmtMoney(totals.deposit)}</Text>
                </View>
              ) : null}
              <Text style={styles.hint}>
                A preview. Tax and the stored totals are settled by the server when you save.
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
  chromeTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  backPressed: { opacity: 0.6 },
  backText: { ...type.body, color: color.chromeMuted },
  save: {
    minHeight: HIT,
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.brandFill,
  },
  savePressed: { backgroundColor: color.brandDown },
  saveText: { ...type.title, color: color.chromeInk },
  chromeName: { ...type.display, color: color.chromeInk },
  chromeMeta: { ...type.micro, color: color.chromeMuted },
  chromeDirty: { color: color.brand },
  chromeLabel: { ...type.micro, color: color.chromeMuted },
  chromeTotalRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.md,
  },
  chromeTotal: {
    ...type.display,
    color: color.chromeInk,
    fontVariant: ["tabular-nums"],
  },
  chromeBreak: { ...type.micro, color: color.chromeMuted, fontVariant: ["tabular-nums"] },
  chromeNotice: {
    marginTop: space.xs,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    overflow: "hidden",
  },

  scrollBody: { padding: space.lg, gap: space.lg },
  body: { ...type.body, color: color.ink },
  muted: { ...type.small, color: color.muted },
  hint: { ...type.small, color: color.faint },

  section: { gap: space.sm },
  sectionLabel: { ...type.micro, color: color.faint },

  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    overflow: "hidden",
  },
  cardPressed: { backgroundColor: color.hover },
  pad: { padding: space.lg, gap: space.sm },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },

  lineHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldLabel: { ...type.micro, color: color.faint },
  remove: {
    // Full tap target, not a shrunken one: this is the control the whole screen
    // is designed to make deliberate rather than accidental.
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 2,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
  },
  removePressed: { backgroundColor: color.dangerBg },
  removeText: { ...type.small, color: color.danger },

  input: {
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
    backgroundColor: color.bg,
  },
  numInput: { fontVariant: ["tabular-nums"] },

  numberRow: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  qtyCell: { flex: 0.9, gap: 2 },
  priceCell: { flex: 1.3, gap: 2 },
  totalCell: { flex: 1, gap: 2, alignItems: "flex-end" },
  lineMoney: {
    fontFamily: font.bodySemi,
    fontSize: 15,
    color: color.ink,
    minHeight: HIT,
    paddingTop: space.md,
    fontVariant: ["tabular-nums"],
  },
  excluded: { color: color.faint, textDecorationLine: "line-through" },

  segment: {
    flexDirection: "row",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  segmentCell: {
    flex: 1,
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.surface,
  },
  segmentOn: { backgroundColor: color.brandFill },
  segmentText: { ...type.small, color: color.muted },
  segmentTextOn: { color: color.chromeInk, fontFamily: font.bodySemi },

  undo: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  undoText: { ...type.small, color: color.brandDeep, flex: 1 },

  catalogRow: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  catalogBody: { flex: 1, gap: 2 },
  catalogSub: { ...type.micro, color: color.faint },

  money: { ...type.body, color: color.ink, fontVariant: ["tabular-nums"] },
  moneyBig: {
    fontFamily: font.bodySemi,
    fontSize: 17,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  moneyRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },

  methodRow: { flexDirection: "row", gap: space.sm },
  method: {
    flex: 1,
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  methodOn: { borderColor: color.brandDeep, backgroundColor: color.brandSoft },
  methodTextOn: { color: color.brandDeep, fontFamily: font.bodySemi },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    minHeight: HIT,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  chipOn: { borderColor: color.brandDeep, backgroundColor: color.brandSoft },
  chipTextOn: { color: color.brandDeep, fontFamily: font.bodySemi },
  percentRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  percentInput: { width: 88, fontVariant: ["tabular-nums"] },

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
  grow: { flex: 1 },
});
