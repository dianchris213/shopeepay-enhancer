import { useSyncExternalStore } from "react";
import {
  Bus,
  Clapperboard,
  Coins,
  Gift,
  HeartPulse,
  Home,
  Landmark,
  Plane,
  Receipt,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { renameCategoryEverywhere } from "@/lib/finance-store";

export type CategoryKind = "expense" | "income";

export type Category = {
  id: string;
  name: string;
  icon: IconKey;
  kind: CategoryKind;
  /**
   * When set, the category belongs to exactly one "Custom" wallet and is
   * invisible everywhere else — no leaking into system categories or into
   * another custom wallet's list.
   */
  walletId?: string;
};

export const iconMap = {
  food: UtensilsCrossed,
  transport: Bus,
  bills: Receipt,
  shopping: ShoppingBag,
  entertainment: Clapperboard,
  health: HeartPulse,
  home: Home,
  travel: Plane,
  salary: Landmark,
  invest: TrendingUp,
  gift: Gift,
  coins: Coins,
  sparkles: Sparkles,
  wallet: Wallet,
} satisfies Record<string, LucideIcon>;

export type IconKey = keyof typeof iconMap;

export const iconKeys = Object.keys(iconMap) as IconKey[];

const STORAGE_KEY = "c2h.categories.v1";

/** Category booked as a debt against the Shopee Pay balance. */
export const DRIVER_COD_CATEGORY = "Driver COD";

/** Legacy category names that older installs stored without a wallet scope. */
export const CUSTOM_CATEGORY_NAMES = [
  "Uang Ibu",
  "Belanja Custom",
  "Tabungan Custom",
  "Lainnya Custom",
] as const;

export function isCustomCategory(name: string) {
  return CUSTOM_CATEGORY_NAMES.some((n) => n.toLowerCase() === name.trim().toLowerCase());
}

/** Local mirror of the finance-store check (kept import-free on purpose). */
export function isDriverCodCategoryName(name: string) {
  return name.trim().toLowerCase() === DRIVER_COD_CATEGORY.toLowerCase();
}

/** Every category attached to one specific custom wallet. */
export function categoriesForWallet(list: Category[], walletId: string) {
  return list.filter((c) => c.walletId === walletId);
}

export function isDriverCategory(name: string) {
  return name.toLowerCase().includes("driver");
}

/**
 * Every install starts with an empty category list — the user creates the
 * categories they actually need from Settings › Manage Categories.
 */
const defaults: Category[] = [];

/**
 * Rows seeded by older builds. They were injected on every hydration, so they
 * kept reappearing in Manage Categories even though the Add Transaction picker
 * hides them. They are pruned once, by id and by legacy name.
 */
const legacySeedIds = new Set(Array.from({ length: 18 }, (_, i) => `c${i + 1}`));

/**
 * Only the deterministic ids (`c1`…`c18`) written by the old seeding build are
 * pruned. Matching by name is deliberately gone: it also ate identical names a
 * user had created themselves, so they vanished after a refresh.
 */
const isLegacySeed = (c: Category) => !c.walletId && legacySeedIds.has(c.id);

/** Normalises a hydrated list: drops the legacy seeded rows, keeps user data. */
function withReserved(list: Category[]): Category[] {
  return list.filter((c) => !isLegacySeed(c));
}

let categories: Category[] = withReserved(defaults);

let hydrated = false;

const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
  } catch {
    /* ignore */
  }
}

type CategorySyncHandler = (prev: Category[], next: Category[]) => void;
let categorySyncHandler: CategorySyncHandler | null = null;

export function setCategorySyncHandler(handler: CategorySyncHandler | null) {
  categorySyncHandler = handler;
}

function commit(next: Category[]) {
  const prev = categories;
  categories = next;
  persist();
  categorySyncHandler?.(prev, next);
  listeners.forEach((l) => l());
}

/** Replace categories with server data without echoing back to the server. */
export function hydrateCategories(next: Category[]) {
  hydrated = true;
  categories = withReserved(next);
  persist();
  listeners.forEach((l) => l());
}

export const defaultCategories = defaults;

function subscribe(listener: () => void) {
  if (!hydrated) {
    hydrated = true;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Category[];
        if (Array.isArray(parsed) && parsed.length) categories = withReserved(parsed);
      }
    } catch {
      /* ignore */
    }
  }

  listeners.add(listener);
  return () => listeners.delete(listener);
}

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export type CategoryResult =
  { ok: true } | { ok: false; reason: "duplicate" | "invalid-name" | "not-found" };

const normalize = (value: string) => value.trim().toLowerCase();

/** True when another category of the same kind already uses this name. */
export function categoryNameTaken(
  name: string,
  kind: CategoryKind,
  exceptId?: string,
  walletId?: string,
) {
  const key = normalize(name);
  return categories.some(
    (c) =>
      c.id !== exceptId &&
      c.kind === kind &&
      // Names only collide inside the same scope: global vs. one custom wallet.
      (c.walletId ?? null) === (walletId ?? null) &&
      normalize(c.name) === key,
  );
}

export function addCategory(input: {
  name: string;
  icon: IconKey;
  kind: CategoryKind;
  /** Scope the category to a single custom wallet. */
  walletId?: string;
}): CategoryResult {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "invalid-name" };
  if (categoryNameTaken(name, input.kind, undefined, input.walletId))
    return { ok: false, reason: "duplicate" };
  commit([...categories, { ...input, name, id: uid() }]);
  return { ok: true };
}

export function updateCategory(
  id: string,
  patch: { name?: string; icon?: IconKey },
): CategoryResult {
  const previous = categories.find((c) => c.id === id);
  if (!previous) return { ok: false, reason: "not-found" };

  const name = patch.name?.trim() ?? previous.name;
  if (!name) return { ok: false, reason: "invalid-name" };
  if (categoryNameTaken(name, previous.kind, id, previous.walletId))
    return { ok: false, reason: "duplicate" };

  commit(categories.map((c) => (c.id === id ? { ...c, ...patch, name } : c)));
  if (name !== previous.name) renameCategoryEverywhere(previous.name, name);
  return { ok: true };
}

/** Snapshot returned by {@link deleteCategory} so the delete can be undone. */
export type DeletedCategory = { category: Category; index: number };

export function deleteCategory(id: string): DeletedCategory | null {
  const index = categories.findIndex((c) => c.id === id);
  if (index === -1) return null;
  const category = categories[index]!;
  commit(categories.filter((c) => c.id !== id));
  return { category, index };
}

/**
 * Puts a deleted category back exactly where it was, so an undo never
 * reshuffles the manager list or the Add Transaction picker.
 */
export function restoreCategory(snapshot: DeletedCategory): CategoryResult {
  const { category, index } = snapshot;
  if (categories.some((c) => c.id === category.id)) return { ok: true };
  if (categoryNameTaken(category.name, category.kind, category.id, category.walletId))
    return { ok: false, reason: "duplicate" };
  const next = [...categories];
  next.splice(Math.min(Math.max(index, 0), next.length), 0, category);
  commit(next);
  return { ok: true };
}

export function useCategories() {
  return useSyncExternalStore(
    subscribe,
    () => categories,
    () => defaults,
  );
}

/** Current immutable category snapshot for store-level validation and tests. */
export function getCategories() {
  return categories;
}

/**
 * Category isolation between standard/Driver wallets and "Custom" wallets.
 *
 * - A Custom wallet sees ONLY categories explicitly scoped to its wallet id.
 * - Every other wallet (and the "no wallet picked yet" state) never sees the
 *   custom-exclusive ones, so the two sets can never mix or confuse the user.
 * - "Driver …" categories are always pinned to the top of the remaining list.
 */
export function visibleCategoriesFor(input: {
  categories: Category[];
  kind: CategoryKind;
  walletType?: string | null;
  /** Id of the selected wallet, used to resolve per-wallet custom categories. */
  walletId?: string | null;
}): Category[] {
  // Shopeepay is intentionally strict: Income exposes only Driver COD,
  // while Expense has no selectable categories at all.
  if (input.walletType === "Driver") {
    if (input.kind === "expense") return [];

    // Never fabricate a category: with no seed data the picker stays empty.
    const driverCod = input.categories.find(
      (c) => c.kind === "income" && isDriverCodCategoryName(c.name),
    );
    return driverCod ? [driverCod] : [];
  }

  const sameKind = input.categories
    .filter((c) => c.kind === input.kind)
    // "Driver COD" is income-only; Expense keeps the plain COD categories.
    .filter((c) => input.kind === "income" || !isDriverCodCategoryName(c.name));
  const isCustomWallet = input.walletType === "Custom";
  const scoped = isCustomWallet
    ? sameKind.filter((c) => !!input.walletId && c.walletId === input.walletId)
    : sameKind.filter((c) => !c.walletId && !isCustomCategory(c.name));
  return [...scoped].sort(
    (a, b) => Number(isDriverCategory(b.name)) - Number(isDriverCategory(a.name)),
  );
}
