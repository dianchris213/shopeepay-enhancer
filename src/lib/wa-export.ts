/**
 * WhatsApp group export.
 *
 * Pure formatting helpers — they never mutate the store, so the summary can be
 * unit-tested and reused by any share surface.
 */
import { formatAmount, walletOf, type Account, type FinanceState } from "@/lib/finance-store";
import type { Language } from "@/lib/i18n";

/** How many recent transactions the summary lists. */
export const WA_RECENT_LIMIT = 8;

/**
 * Export scope. `walletIds` empty/undefined means "every wallet"; otherwise
 * only the picked wallets are summarised.
 */
export type WaExportScope = { walletIds?: string[] };

/** Wallets included by the scope (all of them when nothing is picked). */
export function scopedAccounts(s: FinanceState, scope: WaExportScope = {}): Account[] {
  const ids = scope.walletIds;
  if (!ids || ids.length === 0) return s.accounts;
  const set = new Set(ids);
  return s.accounts.filter((a) => set.has(a.id));
}

function isAllWallets(s: FinanceState, scope: WaExportScope = {}) {
  const ids = scope.walletIds;
  return !ids || ids.length === 0 || ids.length >= s.accounts.length;
}

/** Transactions belonging to the scoped wallets. */
export function scopedTransactions(s: FinanceState, scope: WaExportScope = {}) {
  if (isAllWallets(s, scope)) return s.transactions;
  const set = new Set(scopedAccounts(s, scope).map((a) => a.id));
  return s.transactions.filter((tx) => {
    const wallet = walletOf(s, tx);
    return wallet ? set.has(wallet.id) : false;
  });
}

/** Same rule as the dashboard: a Driver wallet in debt is not counted. */
export function scopedBalance(s: FinanceState, scope: WaExportScope = {}) {
  return scopedAccounts(s, scope).reduce(
    (sum, a) => (a.type === "Driver" && a.amount <= 0 ? sum : sum + a.amount),
    0,
  );
}

export function categoryTotals(
  s: FinanceState,
  scope: WaExportScope = {},
): { category: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const tx of scopedTransactions(s, scope)) {
    map.set(tx.category, (map.get(tx.category) ?? 0) + tx.amount);
  }
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

const labels = {
  en: {
    title: "FINANCIAL SUMMARY",
    total: "Total Balance",
    categories: "Categories",
    recent: "Recent Transactions",
    remaining: "Remaining Balance",
    none: "(none)",
    wallets: "Wallets",
    allWallets: "All wallets",
  },
  id: {
    title: "RINGKASAN KEUANGAN",
    total: "Total Saldo",
    categories: "Kategori",
    recent: "Transaksi Terbaru",
    remaining: "Sisa Saldo",
    none: "(belum ada)",
    wallets: "Dompet",
    allWallets: "Semua dompet",
  },
} satisfies Record<Language, Record<string, string>>;

/** Neat, dash-bulleted plain text sized for a WhatsApp message. */
export function buildWhatsAppSummary(
  s: FinanceState,
  now: Date = new Date(),
  scope: WaExportScope = {},
): string {
  const lang = s.settings.language;
  const currency = s.settings.currency;
  const L = labels[lang] ?? labels.en;
  const money = (v: number) => formatAmount(v, currency, lang);

  const all = isAllWallets(s, scope);
  const accounts = scopedAccounts(s, scope);
  const total = scopedBalance(s, scope);
  // Bills are not wallet-scoped, so they only belong in a full export.
  const unpaid = all ? s.bills.reduce((sum, b) => (b.paid ? sum : sum + b.amount), 0) : 0;
  const cats = categoryTotals(s, scope);
  const recent = scopedTransactions(s, scope).slice(0, WA_RECENT_LIMIT);

  const lines: string[] = [];
  lines.push(`*${L.title}*`);
  lines.push(now.toLocaleDateString(lang === "id" ? "id-ID" : "en-US"));
  lines.push("");
  lines.push(`*${L.wallets}:* ${all ? L.allWallets : accounts.map((a) => a.name).join(", ")}`);
  lines.push("");
  lines.push(`*${L.total}:* ${money(total)}`);
  if (!all) {
    for (const a of accounts) lines.push(`- ${a.name}: ${money(a.amount)}`);
  }
  lines.push("");
  lines.push(`*${L.categories}*`);
  if (cats.length === 0) lines.push(`- ${L.none}`);
  for (const { category, amount } of cats) {
    lines.push(`- ${category}: ${amount < 0 ? "−" : "+"} ${money(Math.abs(amount))}`);
  }
  lines.push("");
  lines.push(`*${L.recent}*`);
  if (recent.length === 0) lines.push(`- ${L.none}`);
  for (const tx of recent) {
    const day = new Date(tx.date).toLocaleDateString(lang === "id" ? "id-ID" : "en-US");
    lines.push(
      `- ${day} · ${tx.name} (${tx.via}): ${tx.amount < 0 ? "−" : "+"} ${money(Math.abs(tx.amount))}`,
    );
  }
  lines.push("");
  lines.push(`*${L.remaining}:* ${money(total - unpaid)}`);

  return lines.join("\n");
}

export function whatsappShareUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Opens the WhatsApp share sheet with the current summary. */
export function shareToWhatsApp(s: FinanceState, scope: WaExportScope = {}) {
  const url = whatsappShareUrl(buildWhatsAppSummary(s, new Date(), scope));
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
  return url;
}
