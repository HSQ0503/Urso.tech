import { Text, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { fmtEt, fmtMoney, type EstimateAcceptance } from "@urso/types";
import { color, space, type } from "@/theme";

export function EstimateAcceptanceHistory({
  records,
}: {
  records?: EstimateAcceptance[];
}) {
  if (!records?.length) return null;
  return (
    <View style={{ margin: space.lg, gap: space.md }}>
      {records.map((record) => (
        <View
          key={record.id}
          style={{
            padding: space.md,
            borderWidth: 1,
            borderColor: color.line,
            gap: space.sm,
          }}
        >
          <Text style={[type.title, { color: color.ink }]}>
            Accepted version {record.revision}
          </Text>
          <Text style={{ color: color.ink }}>
            {record.signatureName} ·{" "}
            {record.source === "customer"
              ? "Customer signed"
              : "Agreed by phone / in person"}
          </Text>
          <Text style={{ color: color.muted }}>
            {fmtEt(record.approvedAt)} · {fmtMoney(record.totalCents)}
          </Text>
          {record.drawing ? (
            <Svg
              width="100%"
              height={100}
              viewBox="0 0 600 180"
              accessibilityLabel="Customer signature"
            >
              {record.drawing.strokes.map((stroke, index) => (
                <Polyline
                  key={index}
                  points={stroke.map((p) => p.join(",")).join(" ")}
                  fill="none"
                  stroke={color.ink}
                  strokeWidth={2.5}
                />
              ))}
            </Svg>
          ) : (
            <Text style={{ color: color.muted }}>
              Historical acceptance: no drawn signature was captured.
            </Text>
          )}
          {record.items.map((item, index) => (
            <Text key={index} style={{ color: color.ink }}>
              {item.name} × {item.quantity} · {fmtMoney(item.line_total_cents)}
            </Text>
          ))}
          <Text style={[type.small, { color: color.muted }]}>
            {record.terms}
          </Text>
        </View>
      ))}
    </View>
  );
}
