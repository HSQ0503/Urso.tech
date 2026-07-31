import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { SessionExpiredError, type ApiResult } from "./api";

// The server-state layer. TanStack Query over the existing ApiResult envelope,
// preserving the app's refusal contract exactly:
//
//   · a refusal keeps whatever data is already on screen and surfaces the
//     server's sentence VERBATIM — it is a message, not a reason to empty
//     the screen (queries: last-good data survives an error state);
//   · only transport failures retry — a refusal repeated is just the same
//     sentence twice, and a REPLAYED WRITE is the claimed-write risk, so
//     mutations never retry at all;
//   · a dead session routes to /login exactly once, here, instead of in a
//     catch block per screen.
//
// This is also the substrate M4's offline work persists — the read cache and
// the mutation queue both hang off this client, so nothing here is throwaway.

// A refusal promoted to an exception at the query boundary. `message` is the
// server's sentence, shown to the reader untouched; `transient` carries the
// transport flag from ApiResult so the retry policy can key off it.
export class NoticeError extends Error {
  readonly transient: boolean;
  constructor(notice: string, transient: boolean) {
    super(notice);
    this.name = "NoticeError";
    this.transient = transient;
  }
}

// Queries throw refusals so TanStack keeps last-good data and exposes the
// sentence as `error`; mutations do NOT go through this — for them a refusal
// is a normal result the caller shows (see useAction).
export function unwrap<T>(result: ApiResult<T>): T {
  if (result.ok) return result.data;
  throw new NoticeError(result.notice, result.transient === true);
}

// The one sentence screens used for a non-refusal failure, kept identical so
// the conversion has zero visible change.
const FALLBACK_NOTICE = "Something went wrong. Pull down to try again.";

export function noticeFrom(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  if (error instanceof NoticeError) return error.message;
  return FALLBACK_NOTICE;
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      // Session death used to be a router.replace in every screen's catch;
      // request() already cleared the stored token before throwing this.
      if (error instanceof SessionExpiredError) router.replace("/login");
    },
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        error instanceof NoticeError && error.transient && failureCount < 2,
      // Focus bounces inside this window serve cache instead of refetching;
      // useRefetchOnFocus below still forces a refresh on return to a screen.
      staleTime: 15_000,
      // React Native has no window focus; screen focus is handled explicitly.
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

export function QueryProvider({ children }: { children: ReactNode }): React.ReactElement {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

// Parity with the old useFocusEffect(load): returning to a screen reloads it.
// The FIRST focus is the mount, where useQuery is already fetching — refetch()
// there would cancel and restart that in-flight request, so it is skipped.
export function useRefetchOnFocus(refetch: () => unknown): void {
  const mounted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!mounted.current) {
        mounted.current = true;
        return;
      }
      void refetch();
    }, [refetch]),
  );
}

// Pull-to-refresh with its own local flag: `isRefetching` is also true during
// background focus refetches, and wiring it to RefreshControl made the pull
// spinner appear uninvited. The spinner belongs to the gesture alone.
export function usePullToRefresh(refetch: () => Promise<unknown>): {
  refreshing: boolean;
  onRefresh: () => void;
} {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  }, [refetch]);
  return { refreshing, onRefresh };
}

// The mutation contract (wired per-screen from O1 on). The mutationFn resolves
// with the ApiResult — a refusal is NOT an exception, it is the server's answer,
// and the caller shows result.notice verbatim. Every settled envelope
// invalidates the keys the action touches: success obviously moved the data,
// and a "this just changed — refresh and try again" refusal specifically means
// the cache is stale too.
export function useAction<TVars, TData>(
  fn: (vars: TVars) => Promise<ApiResult<TData>>,
  opts?: { invalidates?: QueryKey[] },
) {
  const client = useQueryClient();
  return useMutation({
    // Session death is absorbed HERE so mutateAsync never rejects for it: the
    // QueryCache onError above only sees queries, and every screen awaits
    // mutateAsync inside a fire-and-forget handler — an exception there is an
    // unhandled rejection and a tap that silently does nothing. Absorbing it
    // routes to /login and hands back an ordinary refusal; the screen sets a
    // notice it will never show because it is already navigating away.
    mutationFn: async (vars: TVars): Promise<ApiResult<TData>> => {
      try {
        return await fn(vars);
      } catch (error) {
        if (error instanceof SessionExpiredError) {
          router.replace("/login");
          return { ok: false, notice: error.message };
        }
        throw error;
      }
    },
    onSuccess: async () => {
      await Promise.all(
        (opts?.invalidates ?? []).map((queryKey) => client.invalidateQueries({ queryKey })),
      );
    },
  });
}
