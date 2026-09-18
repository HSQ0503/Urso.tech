import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { documentActions } from "@/api";
import { keys } from "@/queries";
import { noticeFrom, unwrap, useAction } from "@/query";
import { color, HIT, space } from "@/theme";
import { Notice } from "./notice";
import type { DocumentKind } from "@urso/types";
export function ArchivedRecords() {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const records = useQuery({
    queryKey: ["owner", "archives"],
    queryFn: () => documentActions.archives().then(unwrap),
    enabled: open,
  });
  const restore = useAction(
    (row: { kind: DocumentKind; id: string }) =>
      documentActions.restore(row.kind, row.id),
    { invalidates: [...keys.workflow(), ["owner", "archives"]] },
  );
  return (
    <View style={{ padding: space.lg, gap: space.md }}>
      <Pressable
        accessibilityRole="button"
        style={{ minHeight: HIT }}
        onPress={() => {
          setOpen(!open);
          if (!open) void records.refetch();
        }}
      >
        <Text style={{ color: color.brandDeep }}>
          Archived records {open ? "−" : "+"}
        </Text>
      </Pressable>
      {open ? (
        <>
          <Notice text={notice ?? noticeFrom(records.error)} />
          {records.data?.map((row) => (
            <View key={`${row.kind}:${row.id}`} style={{ gap: space.sm }}>
              <Text style={{ color: color.ink }}>{row.label}</Text>
              <Pressable
                accessibilityRole="button"
                disabled={restore.isPending}
                style={{ minHeight: HIT }}
                onPress={() =>
                  void restore
                    .mutateAsync(row)
                    .then((result) =>
                      setNotice(
                        result.ok
                          ? (result.data.notice ?? "Restored.")
                          : result.notice,
                      ),
                    )
                }
              >
                <Text style={{ color: color.brandDeep }}>Restore to lists</Text>
              </Pressable>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}
