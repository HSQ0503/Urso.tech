import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  Fraunces_600SemiBold,
  Fraunces_600SemiBold_Italic,
} from "@expo-google-fonts/fraunces";
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from "@expo-google-fonts/ibm-plex-sans";
import { IBMPlexMono_400Regular } from "@expo-google-fonts/ibm-plex-mono";
import { QueryProvider } from "@/query";
import { color } from "@/theme";

// Root layout. Every screen draws its own true-black chrome header, so the
// navigator itself is headerless — a stack header would fight the Canes
// wordmark bar rather than replace it.

export default function RootLayout(): React.ReactElement | null {
  // The shorthand keys are the family names theme.ts refers to, so registering
  // and consuming a font can never drift apart.
  const [loaded, error] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_600SemiBold_Italic,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_400Regular,
  });

  // Hold the app back rather than flash system type and reflow under the crew's
  // hands. A load failure still renders — falling back to system fonts beats a
  // permanently blank app on a truck in a yard.
  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <QueryProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            // Bone, not white, so a push never flashes a bright card-shaped gap.
            contentStyle: { backgroundColor: color.bg },
          }}
        />
      </QueryProvider>
    </SafeAreaProvider>
  );
}
