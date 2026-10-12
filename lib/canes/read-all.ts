type Page = { data: unknown[] | null; error: { message: string } | null };

// Callers order by a unique key; screen limits must never become report totals.
export async function readAll<T>(
  query: (from: number, to: number) => PromiseLike<Page>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await query(from, from + 999);
    if (page.error)
      throw new Error(`The ledger could not be loaded: ${page.error.message}`);
    rows.push(...((page.data ?? []) as T[]));
    if ((page.data?.length ?? 0) < 1000) return rows;
  }
}
