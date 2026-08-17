import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CategoryAuditEntry } from "@/lib/category-audit";

/**
 * Reads the signed-in user's category audit trail. RLS already scopes the
 * table to the owner; the explicit `user_id` filter is a second belt.
 */
export const listCategoryAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ limit: z.number().int().min(1).max(200).default(100) })
      .default({ limit: 100 })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<CategoryAuditEntry[]> => {
    const { data: rows, error } = await context.supabase
      .from("category_audit_log")
      .select("id, action, category_id, category_name, category_type, details, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (error) {
      console.error("[category-audit] read failed", error.message);
      throw new Error("Could not load the category audit log.");
    }

    return (rows ?? []) as unknown as CategoryAuditEntry[];
  });
