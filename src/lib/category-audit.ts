import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { Category } from "@/lib/categories-store";

/**
 * Category audit trail.
 *
 * Every category create / rename / icon change / delete is written to
 * `category_audit_log` with an explicit before → after snapshot, so the audit
 * screen can render a real diff instead of a vague "something changed".
 * Rule enforcement events (a submit rejected because a category was missing)
 * are written server-side by `transaction-guard.functions.ts`.
 */

export type CategoryAuditAction =
  | "category_created"
  | "category_updated"
  | "category_deleted"
  | "rule_enforced"
  | "transaction_rejected_missing_category";

export type CategorySnapshot = { name: string; icon: string; kind: string; walletId?: string };

export type CategoryAuditEntry = {
  id: string;
  action: string;
  category_id: string | null;
  category_name: string;
  category_type: string;
  created_at: string;
  details: {
    before?: CategorySnapshot | null;
    after?: CategorySnapshot | null;
    reason?: string;
    source?: string;
    wallet_name?: string;
    wallet_type?: string;
    amount?: number;
  };
};

/** Rule-history rows are the enforcement events, everything else is a change. */
export const RULE_ACTIONS = new Set([
  "rule_enforced",
  "transaction_rejected_missing_category",
  "rule_changed",
]);

export function isRuleEntry(entry: CategoryAuditEntry) {
  return RULE_ACTIONS.has(entry.action);
}

const snapshot = (c: Category): CategorySnapshot => ({
  name: c.name,
  icon: c.icon,
  kind: c.kind,
  ...(c.walletId ? { walletId: c.walletId } : {}),
});

type FieldDiff = { field: "name" | "icon" | "kind" | "walletId"; before: string; after: string };

/** Field-level differences between two snapshots, ready to render. */
export function diffSnapshots(
  before?: CategorySnapshot | null,
  after?: CategorySnapshot | null,
): FieldDiff[] {
  const fields: FieldDiff["field"][] = ["name", "icon", "kind", "walletId"];
  const out: FieldDiff[] = [];
  for (const field of fields) {
    const a = before?.[field] ?? "";
    const b = after?.[field] ?? "";
    if (a !== b) out.push({ field, before: String(a), after: String(b) });
  }
  return out;
}

type AuditRow = {
  user_id: string;
  category_id: string | null;
  action: CategoryAuditAction;
  category_name: string;
  category_type: string;
  details: Json;
};

/** Rows describing the transition from one category list to the next. */
export function buildCategoryAuditRows(
  prev: Category[],
  next: Category[],
  userId: string,
): AuditRow[] {
  const prevMap = new Map(prev.map((c) => [c.id, c]));
  const nextMap = new Map(next.map((c) => [c.id, c]));
  const rows: AuditRow[] = [];

  for (const c of next) {
    const before = prevMap.get(c.id);
    if (!before) {
      rows.push({
        user_id: userId,
        category_id: c.id,
        action: "category_created",
        category_name: c.name,
        category_type: c.kind,
        details: { before: null, after: snapshot(c) },
      });
      continue;
    }
    const changes = diffSnapshots(snapshot(before), snapshot(c));
    if (changes.length) {
      rows.push({
        user_id: userId,
        category_id: c.id,
        action: "category_updated",
        category_name: c.name,
        category_type: c.kind,
        details: { before: snapshot(before), after: snapshot(c) },
      });
    }
  }

  for (const c of prev) {
    if (nextMap.has(c.id)) continue;
    rows.push({
      user_id: userId,
      category_id: null, // the row is gone; keep the snapshot instead of a dangling FK
      action: "category_deleted",
      category_name: c.name,
      category_type: c.kind,
      details: { before: snapshot(c), after: null },
    });
  }

  return rows;
}

/** Fire-and-forget audit write; never blocks or breaks a category edit. */
export function recordCategoryAudit(prev: Category[], next: Category[], userId: string) {
  const rows = buildCategoryAuditRows(prev, next, userId);
  if (!rows.length) return;
  void supabase
    .from("category_audit_log")
    .insert(rows)
    .then(({ error }) => {
      if (error) console.warn("[category-audit] insert failed", error.message);
    });
}
