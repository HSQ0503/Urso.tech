// @urso/types — the domain contract shared by the Next.js web app and the Expo
// mobile app (Phase 6). Everything here must stay free of server-only imports
// (next/headers, next/cache, Supabase) and of any DOM or React Native API, so
// both runtimes can consume it unchanged.
//
// The web app still imports from "@/lib/canes/types" and "@/lib/canes/crew-types";
// those files are now one-line re-exports of this package, so no call site moved.

export * from "./types";
export * from "./crew-types";
