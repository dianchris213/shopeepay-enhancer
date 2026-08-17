import { useSyncExternalStore } from "react";

import { requireAuthUserId } from "@/lib/auth-user";
import { hydrateFromCloud } from "@/lib/supabase-sync";

/**
 * Tiny external store behind the manual "Refresh balances" action so both the
 * wallet strip skeletons and the refresh button read a single flag.
 */
let refreshing = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isRefreshingWallets() {
  return refreshing;
}

export function setRefreshingWallets(next: boolean) {
  if (refreshing === next) return;
  refreshing = next;
  emit();
}

export function useWalletsRefreshing() {
  return useSyncExternalStore(
    subscribe,
    () => refreshing,
    () => false,
  );
}

/**
 * Re-pulls every wallet (Driver Shopee + Shopeepay included) from the cloud.
 * Resolves to true when the balances were refreshed.
 */
export async function refreshWallets(): Promise<boolean> {
  if (refreshing) return false;
  setRefreshingWallets(true);
  try {
    const uid = await requireAuthUserId();
    await hydrateFromCloud(uid);
    return true;
  } catch (error) {
    console.error("[wallet refresh]", error);
    return false;
  } finally {
    setRefreshingWallets(false);
  }
}
