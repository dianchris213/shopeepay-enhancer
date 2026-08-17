import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Loader2, ShieldAlert } from "lucide-react";

import { Sheet } from "@/components/Sheet";
import { listCategoryAudit } from "@/lib/category-audit.functions";
import { diffSnapshots, isRuleEntry, type CategoryAuditEntry } from "@/lib/category-audit";
import { useT } from "@/lib/i18n";

type Props = { open: boolean; onClose: () => void };

type Tab = "changes" | "rules";

const actionLabel: Record<string, string> = {
  category_created: "audit.created",
  category_updated: "audit.updated",
  category_deleted: "audit.deleted",
  rule_changed: "audit.ruleChanged",
  rule_enforced: "audit.ruleEnforced",
  transaction_rejected_missing_category: "audit.ruleRejected",
};

function when(iso: string, lang: string) {
  return new Date(iso).toLocaleString(lang === "id" ? "id-ID" : "en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Category audit viewer: a before → after diff for every category edit, plus
 * the enforcement history of the "category is mandatory" rule.
 */
export function CategoryAuditSheet({ open, onClose }: Props) {
  const { t, lang } = useT();
  const [tab, setTab] = useState<Tab>("changes");
  const [entries, setEntries] = useState<CategoryAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listCategoryAudit({ data: { limit: 100 } });
      setEntries(rows);
    } catch {
      setError(t("audit.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const visible = entries.filter((e) => (tab === "rules" ? isRuleEntry(e) : !isRuleEntry(e)));

  const tabClass = (active: boolean) =>
    `tap flex-1 rounded-full px-3 py-2 text-[12px] font-semibold transition-colors ${
      active ? "bg-primary text-primary-foreground" : "glass text-muted-foreground"
    }`;

  return (
    <Sheet open={open} onClose={onClose} title={t("audit.title")}>
      <p className="text-muted-foreground mt-3 text-[11px] leading-relaxed">{t("audit.hint")}</p>

      <div className="mt-3 flex gap-2">
        <button type="button" className={tabClass(tab === "changes")} onClick={() => setTab("changes")}>
          {t("audit.tabChanges")}
        </button>
        <button type="button" className={tabClass(tab === "rules")} onClick={() => setTab("rules")}>
          {t("audit.tabRules")}
        </button>
      </div>

      {tab === "rules" && (
        <div className="glass mt-3 flex items-start gap-2.5 rounded-2xl p-3.5">
          <ShieldAlert className="text-primary mt-0.5 size-4 shrink-0" strokeWidth={1.9} />
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            {t("audit.ruleState")}
          </p>
        </div>
      )}

      <div className="mt-3 mb-4 max-h-[52vh] space-y-2 overflow-auto" data-testid="category-audit-list">
        {loading && (
          <p className="text-muted-foreground flex items-center gap-2 py-6 text-[12px]">
            <Loader2 className="size-4 animate-spin" /> {t("audit.loading")}
          </p>
        )}

        {!loading && error && (
          <div className="glass rounded-2xl p-3.5">
            <p className="text-expense text-[12px]">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="tap glass mt-2 rounded-full px-3 py-1.5 text-[11px] font-semibold"
            >
              {t("audit.retry")}
            </button>
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <p className="text-muted-foreground py-6 text-[12px]">{t("audit.empty")}</p>
        )}

        {!loading &&
          !error &&
          visible.map((entry) => {
            const diffs = diffSnapshots(entry.details?.before, entry.details?.after);
            return (
              <article key={entry.id} className="glass rounded-2xl p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold">
                    {t(
                      (actionLabel[entry.action] ?? "audit.other") as Parameters<typeof t>[0],
                    )}
                  </p>
                  <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
                    {when(entry.created_at, lang)}
                  </span>
                </div>

                {entry.category_name && (
                  <p className="text-muted-foreground mt-0.5 text-[11px]">{entry.category_name}</p>
                )}

                {diffs.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {diffs.map((d) => (
                      <li key={d.field} className="flex items-center gap-2 text-[11px]">
                        <span className="text-muted-foreground w-14 shrink-0 capitalize">
                          {d.field}
                        </span>
                        <span className="text-expense line-through">{d.before || "—"}</span>
                        <ArrowRight className="text-muted-foreground size-3" strokeWidth={2} />
                        <span className="text-income font-medium">{d.after || "—"}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {isRuleEntry(entry) && (
                  <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
                    {entry.details?.reason ?? ""}
                    {entry.details?.wallet_name ? ` · ${entry.details.wallet_name}` : ""}
                    {entry.details?.source ? ` · ${entry.details.source}` : ""}
                  </p>
                )}
              </article>
            );
          })}
      </div>
    </Sheet>
  );
}
