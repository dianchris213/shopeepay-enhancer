/**
 * Remote confirmation hook for the optimistic "Isi Uang" (Top Up) flow.
 *
 * The finance store is local-first: `topUpAccount` mutates the UI instantly
 * and the Supabase layer mirrors the change in the background. For top ups we
 * additionally want a *confirmed* result so the balance can be rolled back
 * when the write never lands. Anything that can verify the write (the cloud
 * sync layer in production, a mock in tests) registers itself here.
 *
 * With no handler registered the app stays in its current offline-friendly
 * behaviour: the commit resolves successfully and the queued write retries on
 * its own.
 */
export type TopUpCommit = (input: {
  accountId: string;
  amount: number;
  source: string;
  transactionId?: string | undefined;
}) => Promise<{ ok: boolean; error?: string }>;

let handler: TopUpCommit | null = null;

export function setTopUpCommitHandler(next: TopUpCommit | null) {
  handler = next;
}

export async function commitTopUp(
  input: Parameters<TopUpCommit>[0],
): Promise<{ ok: boolean; error?: string }> {
  if (!handler) return { ok: true };
  try {
    return await handler(input);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
