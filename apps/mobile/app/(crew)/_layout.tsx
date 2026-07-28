import { Stack } from "expo-router";

// Every crew screen paints its own black chrome header, so the navigator draws
// none of its own.
export default function CrewLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
