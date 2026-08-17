import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { TopUpSheet } from "@/components/WalletActionSheets";
import { clearToasts, getToasts } from "@/lib/toast-store";
import {
  ensureShopeePayAccount,
  getState,
  hydrateState,
  initialState,
  shopeePayAccount,
  type Account,
} from "@/lib/finance-store";

/**
 * "Isi Uang" (Top Up) end-to-end interaction: amount entry, destination
 * selection, balance mutation and the success / failure toasts.
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

async function typeAmount(user: ReturnType<typeof userEvent.setup>, value: string) {
  const field = screen.getByLabelText(/^Amount$/i);
  await user.type(field, value);
}

describe("TopUpSheet (Isi Uang)", () => {
  beforeEach(() => {
    hydrateState({ ...initialState, accounts: [cash], transactions: [], bills: [] });
    ensureShopeePayAccount();
    clearToasts();
  });

  it("disables the confirm button until a positive amount is entered", async () => {
    const user = userEvent.setup();
    render(<TopUpSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    const confirm = screen.getByRole("button", { name: /Confirm Top Up|Konfirmasi Isi Ulang/i });
    expect(confirm).toBeDisabled();

    await typeAmount(user, "50000");
    expect(confirm).not.toBeDisabled();
  });

  it("credits the selected wallet and toasts the new balance", async () => {
    const user = userEvent.setup();
    render(<TopUpSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    await typeAmount(user, "75000");
    await user.click(screen.getByRole("button", { name: /Confirm Top Up|Konfirmasi Isi Ulang/i }));

    await waitFor(() => expect(getToasts().length).toBeGreaterThan(0));
    const toast = getToasts().at(-1)!;
    expect(toast.tone).toBe("success");
    expect(toast.body).toContain("175");

    const wallet = getState().accounts.find((a) => a.id === cash.id)!;
    expect(wallet.amount).toBe(175_000);
    expect(getState().transactions[0]?.category).toBe("Top Up");
  });

  it("honours a preset destination wallet", async () => {
    const user = userEvent.setup();
    const shopee = shopeePayAccount()!;
    render(<TopUpSheet open onClose={() => {}} presetAccountId={shopee.id} />);
    await screen.findByRole("dialog");

    await typeAmount(user, "20000");
    await user.click(screen.getByRole("button", { name: /Confirm Top Up|Konfirmasi Isi Ulang/i }));

    await waitFor(() =>
      expect(getState().accounts.find((a) => a.id === shopee.id)!.amount).toBe(20_000),
    );
  });

  it("lets the user switch the destination wallet", async () => {
    const user = userEvent.setup();
    const shopee = shopeePayAccount()!;
    render(<TopUpSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: shopee.name }));
    await typeAmount(user, "30000");
    await user.click(screen.getByRole("button", { name: /Confirm Top Up|Konfirmasi Isi Ulang/i }));

    await waitFor(() =>
      expect(getState().accounts.find((a) => a.id === shopee.id)!.amount).toBe(30_000),
    );
    expect(getState().accounts.find((a) => a.id === cash.id)!.amount).toBe(100_000);
  });

  it("shows an error toast when the top up cannot be applied", async () => {
    const user = userEvent.setup();
    render(<TopUpSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    await typeAmount(user, "10000");
    // The destination disappears (deleted elsewhere) right before confirming.
    hydrateState({ ...getState(), accounts: getState().accounts.filter((a) => a.id !== cash.id) });
    clearToasts();
    await user.click(screen.getByRole("button", { name: /Confirm Top Up|Konfirmasi Isi Ulang/i }));

    await waitFor(() => expect(getToasts().length).toBeGreaterThan(0));
    expect(getToasts().some((t) => t.tone === "error")).toBe(true);
  });
});
