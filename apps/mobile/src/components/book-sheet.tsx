import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { etLocalToIso, type Job } from "@urso/types";
import { jobActions } from "@/api";
import { Notice } from "@/components/notice";
import { isCompleteWhen, SlotPicker } from "@/components/slot-picker";
import { keys } from "@/queries";
import { useAction } from "@/query";
import { color, font, HIT, space, type } from "@/theme";

// Book an unscheduled job onto a day and time, in place.
//
// Deliberately NOT a crew picker. The row's question is "when", and the job
// already carries a crew (or does not, which is a normal way to book).
// jobActions.schedule's crewId is required-and-nullable, so passing the job's
// own value means booking from here can never silently unassign — crew changes
// stay on the job sheet, where they are the point rather than a side effect.
//
// No allowPast: sold work being booked is future work. Back-dating belongs on
// the job sheet, where it is a deliberate, separate act.
export function BookSheet({
  job,
  onClose,
  onBooked,
}: {
  job: Job;
  onClose: () => void;
  onBooked?: (job: Job) => void;
}) {
  const [slot, setSlot] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const book = useAction(
    (vars: { iso: string }) =>
      jobActions.schedule(job.id, vars.iso, job.duration_minutes ?? 120, job.crew_id ?? null),
    {
      invalidates: [
        keys.jobs.all(),
        keys.jobs.one(job.id),
        ["owner", "schedule"],
        keys.schedule.unscheduled(),
        keys.agenda(),
        keys.overview(),
      ],
    },
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
    onBooked?.(job);
    onClose();
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.sheetHead}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8}>
            <Text style={styles.sheetCancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.sheetTitle}>Schedule</Text>
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
            <Text style={styles.muted}>{job.job_name ?? job.job_address ?? "Address pending"}</Text>
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>When</Text>
            <SlotPicker value={slot} onChange={setSlot} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: color.bg, paddingTop: space.sm },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
    paddingHorizontal: space.lg,
    minHeight: HIT,
  },
  sheetTitle: { ...type.title, color: color.ink },
  sheetCancel: { ...type.body, color: color.muted },
  sheetSave: { ...type.body, fontFamily: font.bodySemi, color: color.brand },
  sheetSaveOff: { color: color.faint },
  sheetBody: { padding: space.lg, gap: space.lg },
  body: { ...type.body, color: color.ink },
  muted: { ...type.small, color: color.muted },
  fieldGroup: { gap: space.sm },
  fieldLabel: { ...type.micro, color: color.faint },
});
