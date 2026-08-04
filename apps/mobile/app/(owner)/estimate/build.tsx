import { Redirect, useLocalSearchParams } from "expo-router";

// Backward-compatible entry for old notifications and cached navigation state.
// The Markate-style editor now owns both new and existing estimates.
export default function LegacyEstimateBuilder(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id?: string }>();
  if (typeof id !== "string" || id.length === 0) {
    return <Redirect href="/(owner)/estimates" />;
  }
  return <Redirect href={{ pathname: "/(owner)/estimate/new", params: { id } }} />;
}
