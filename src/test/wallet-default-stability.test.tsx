import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { AddTransactionSheet } from "@/components/AddTransactionSheet";
import { hydrateCategories } from "@/lib/categories-store";
import { getState, hydrateState, initialState, type Account } from "@/lib/finance-store";

/**
 * Booking one income and one expense must not move the default wallet
 * selection, and ShopeePay must never be auto-selected on either tab.
 */

const driver: Account = {
  id: "w-driver",
  name: "Driver Shoopee",
  type: "Driver",
  amount: 100_000,
  color: "#f97316",
  icon: "Bike",
  sub: "Driver",
};

const custom: Account = {
  id: "w-custom",
  name: "Dana Custom",
  type: "Custom",
  amount: 500_000,
  color: "#22c55e",
  icon: "Wallet",
  sub: "Custom",
};

function pressedWallet(): string | null {
  const group = screen.getByRole("group", { name: /Wallet Source|Sumber/i });
  const active = Array.from(group.querySelectorAll("button")).find(
    (b) => b.getAttribute("aria-pressed") === "true",
  );
  return active?.textContent?.trim() ?? null;
}

describe("wallet defaults stay put across bookings", () => {
  beforeEach(() => {
    hydrateState({
      ...initialState,
      accounts: [driver, custom],
      transactions: [],
      bills: [],
    });
    hydrateCategories([
      { id: "cod", name: "Driver COD", icon: "transport", kind: "income" },
      { id: "food", name: "Food", icon: "food", kind: "expense" },
    ]);
  });

  it("books an income then an expense without changing the defaults", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AddTransactionSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    // Expense opens on "Dana Custom" — never ShopeePay.
    expect(pressedWallet()).toBe("Dana Custom");

    // Income tab defaults to the driver wallet.
    await user.click(screen.getByRole("button", { name: /Pemasukan|income/i }));
    expect(pressedWallet()).toBe("Driver Shoopee");

    await user.type(screen.getByLabelText("Amount in rupiah"), "50000");
    await user.click(screen.getByRole("button", { name: "Driver COD" }));
    await user.click(screen.getByRole("button", { name: /Simpan|Save/i }));
    await waitFor(() => expect(getState().transactions.length).toBe(1));
    unmount();

    // Reopening keeps the expense default.
    render(<AddTransactionSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");
    expect(pressedWallet()).toBe("Dana Custom");

    await user.type(screen.getByLabelText("Amount in rupiah"), "20000");
    await user.click(screen.getByRole("button", { name: "Food" }));
    await user.click(screen.getByRole("button", { name: /Simpan|Save/i }));
    await waitFor(() => expect(getState().transactions.length).toBe(2));

    const kinds = getState().transactions.map((t) => t.type);
    expect(kinds).toContain("income");
    expect(kinds).toContain("expense");
  });
});
