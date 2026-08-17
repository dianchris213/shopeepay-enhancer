import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-side category guard for transactions.
 *
 * The UI already refuses to save a transaction without a category, but the
 * server function is the actual security boundary: a request crafted outside
 * the UI must be rejected too. Every rejection is written to
 * `category_audit_log` so QA can see *why* a submit failed.
 *
 * A database trigger (`enforce_shopeepay_expense_category`) backs this up for
 * direct Data API inserts that never reach this function.
 */

const guardSchema = z.object({
  kind: z.enum(["expense", "income"]),
  walletName: z.string().max(120).default(""),
  walletType: z.string().max(60).default(""),
  categoryId: z.string().max(64).nullable().default(null),
  categoryName: z.string().max(120).default(""),
  amount: z.number().finite().nonnegative().max(999_999_999_999).default(0),
  source: z.string().max(64).default("add-transaction-sheet"),
});

export type TransactionGuardResult = {
  ok: boolean;
  reason?: string;
  message?: string;
};

const isShopeePay = (walletType: string, walletName: string) =>
  walletType === "Driver" || walletName.replaceAll(/\s/g, "").toLowerCase() === "shopeepay";

export const checkTransactionCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => guardSchema.parse(data))
  .handler(async ({ data, context }): Promise<TransactionGuardResult> => {
    const missingCategory = !data.categoryId || data.categoryName.trim() === "";
    if (!missingCategory) return { ok: true };

    const shopee = isShopeePay(data.walletType, data.walletName);
    const reason =
      data.kind === "expense" && shopee
        ? "expense_shopeepay_requires_category"
        : "category_required";
    const message =
      reason === "expense_shopeepay_requires_category"
        ? "Expense on a ShopeePay wallet requires a category."
        : "A category is required for this transaction.";

    // QA trail: persisted, user-scoped, no PII beyond what the user typed.
    const { error } = await context.supabase.from("category_audit_log").insert({
      user_id: context.userId,
      action: "transaction_rejected_missing_category",
      category_name: "",
      category_type: data.kind,
      details: {
        reason,
        source: data.source,
        wallet_name: data.walletName,
        wallet_type: data.walletType,
        amount: data.amount,
        at: new Date().toISOString(),
      },
    });
    if (error) console.error("[tx-guard] audit log insert failed", error.message);
    console.warn("[tx-guard] rejected submit", { reason, source: data.source });

    return { ok: false, reason, message };
  });
