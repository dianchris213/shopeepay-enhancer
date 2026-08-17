import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { AddTransactionSheet } from "@/components/AddTransactionSheet";
import { hydrateCategories } from "@/lib/categories-store";
import { clearToasts, getToasts } from "@/lib/toast-store";
import {
  ensureShopeePayAccount,
  hydrateState,
  initialState,
  shopeePayAccount,
  type Account,
} from "@/lib/finance-store";

/**
 * Form defaults of the Add Transaction modal:
 *   - Expense opens with an empty category plus the interactive Settings hint.
 *   - Income on the Shopeepay (driver) wallet preselects "Driver COD".
 */

const cash: Account = {
  id: "a1",
  name: "Cash",
  type: "Cash",
  amount: 100_000,
  color: "#22c55e",
  icon: "Banknote",
  sub: "Cash",
};

describe("AddTransactionSheet defaults", () => {
  beforeEach(() => {
    hydrateState({ ...initialState, accounts: [cash], transactions: [], bills: [] });
    ensureShopeePayAccount();
    clearToasts();
    // Categories are never seeded; the Driver COD row is created explicitly.
    hydrateCategories([{ id: "cod", name: "Driver COD", icon: "transport", kind: "income" }]);
  });

  it("opens with no wallet preselected when Shopeepay is the only fallback", async () => {
    render(<AddTransactionSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    const walletGroup = screen.getByRole("group", { name: /Wallet Source|Sumber/i });
    const active = Array.from(walletGroup.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-pressed") === "true",
    );
    // Shopeepay must never be auto-selected for Pemasukan or Pengeluaran.
    expect(active).toBeUndefined();
    expect(screen.queryByText(shopeePayAccount()!.name)).toBeTruthy();
    // No wallet, so no categories: the empty state shows.
    expect(screen.getByTestId("tx-empty-categories")).toBeTruthy();
  });



  it("opens on Expense with no category selected and an interactive Settings hint", async () => {
    const user = userEvent.setup();
    render(<AddTransactionSheet open onClose={() => {}} />);

    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: cash.name }));
    const categoryGroup = screen.getByRole("group", { name: /Category|Kategori/i });
    for (const button of Array.from(categoryGroup.querySelectorAll("button"))) {
      expect(button.getAttribute("aria-pressed")).not.toBe("true");
    }

    const hint =
      screen.queryByTestId("tx-create-category-hint") ?? screen.getByTestId("tx-empty-categories");
    expect(hint.textContent).toContain("Please select or create a category first in");

    const link =
      screen.queryByTestId("tx-create-category-link") ??
      screen.getByTestId("tx-empty-categories-link");
    expect(link.tagName).toBe("BUTTON");

    await user.click(link);
    // The category manager opens on top without closing the transaction sheet.
    await waitFor(() => expect(screen.getAllByRole("dialog").length).toBeGreaterThan(1));
  });

  it("shows an inline error when saving an Expense with no category", async () => {
    const user = userEvent.setup();
    render(<AddTransactionSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    await user.type(screen.getByLabelText("Amount in rupiah"), "25000");
    // The save button is disabled while invalid; its wrapper marks the form as
    // touched so the inline errors appear.
    const save = screen.getByRole("button", { name: /Simpan|Save/i });
    expect(save).toBeDisabled();
    await user.click(save.parentElement!);

    expect(screen.getByTestId("tx-category-required")).toBeTruthy();
  });

  it("preselects Driver COD for Income on the Shopeepay wallet", async () => {
    const user = userEvent.setup();
    render(<AddTransactionSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: /Pemasukan|income/i }));
    const driverName = shopeePayAccount()!.name;
    expect(driverName).toBe("Shopeepay");
    await user.click(screen.getByRole("button", { name: driverName }));

    await waitFor(() => {
      const group = screen.getByRole("group", { name: /Category|Kategori/i });
      expect(
        Array.from(group.querySelectorAll("button")).map((button) => button.textContent?.trim()),
      ).toEqual(["Driver COD"]);
      const active = Array.from(group.querySelectorAll("button")).find(
        (b) => b.getAttribute("aria-pressed") === "true",
      );
      expect(active?.textContent?.trim()).toBe("Driver COD");
    });
    // The redundant "Kategori ShopeePay: Driver COD" note is gone.
    expect(screen.queryByTestId("tx-driver-cod-default-hint")).toBeNull();
    expect(screen.queryByTestId("tx-create-category-hint")).toBeNull();
  });

  it("keeps the category empty when toggling back to Expense", async () => {
    const user = userEvent.setup();
    render(<AddTransactionSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: /Pemasukan|income/i }));
    await user.click(screen.getByRole("button", { name: shopeePayAccount()!.name }));
    await user.click(screen.getByRole("button", { name: /Pengeluaran|expense/i }));
    const categoryGroup = screen.getByRole("group", { name: /Category|Kategori/i });
    expect(categoryGroup.querySelectorAll("button[aria-pressed]")).toHaveLength(0);

    expect(
      screen.queryByTestId("tx-create-category-hint") ?? screen.getByTestId("tx-empty-categories"),
    ).toBeTruthy();
  });

  it("explains the empty list for Expense + Shopeepay and links to Settings", async () => {
    const user = userEvent.setup();
    render(<AddTransactionSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: shopeePayAccount()!.name }));

    const empty = await screen.findByTestId("tx-empty-categories");
    expect(empty.textContent).toContain("No category available for this wallet.");

    await user.click(screen.getByTestId("tx-empty-categories-link"));
    await waitFor(() => expect(screen.getAllByRole("dialog").length).toBeGreaterThan(1));
  });

  it("refuses to submit an Expense on Shopeepay without a category", async () => {
    const user = userEvent.setup();
    render(<AddTransactionSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: shopeePayAccount()!.name }));
    await user.type(screen.getByLabelText("Amount in rupiah"), "25000");

    const save = screen.getByRole("button", { name: /Simpan|Save/i });
    expect(save).toBeDisabled();
    await user.click(save.parentElement!);

    expect(screen.getByTestId("tx-category-required")).toBeTruthy();
    expect(shopeePayAccount()!.amount).toBe(0);
  });

  it("toasts and focuses the category picker on an Expense + Shopeepay submit", async () => {
    const user = userEvent.setup();
    render(<AddTransactionSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: shopeePayAccount()!.name }));
    await user.type(screen.getByLabelText("Amount in rupiah"), "25000");
    const save = screen.getByRole("button", { name: /Simpan|Save/i });
    await user.click(save.parentElement!);

    await waitFor(() => expect(getToasts().length).toBeGreaterThan(0));
    const toast = getToasts()[0]!;
    expect(toast.tone).toBe("error");
    expect(toast.body).toContain("no category selected");
    // Focus lands inside the category picker (its first control, or the group).
    expect(screen.getByTestId("tx-category-group").contains(document.activeElement)).toBe(true);
  });

  it("opens a quick-create draft from the empty Expense + Shopeepay link", async () => {
    const user = userEvent.setup();
    render(<AddTransactionSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: shopeePayAccount()!.name }));
    await user.click(screen.getByTestId("tx-empty-categories-link"));

    const draft = await screen.findByLabelText("New category name");
    expect(draft).toBeTruthy();
  });
});
