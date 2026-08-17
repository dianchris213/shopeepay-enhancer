import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TopUpSheet } from "@/components/WalletActionSheets";
import { clearToasts, getToasts } from "@/lib/toast-store";
import { setTopUpCommitHandler } from "@/lib/topup-commit";
import {
  ensureShopeePayAccount,
  getState,
  hydrateState,
  initialState,
  type Account,
} from "@/lib/finance-store";

/**
 * Optimistic UI contract for "Isi Uang":
 *   - the wallet balance moves before the remote write resolves;
 *   - a failed remote write rolls the balance (and the ledger entry) back and
 *     raises the failure toast.
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

const confirmButton = () =>
  screen.getByRole("button", { name: /Confirm Top Up|Konfirmasi Isi Ulang/i });

async function typeAmount(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.type(screen.getByLabelText(/^Amount$/i), value);
}

describe("TopUpSheet optimistic update", () => {
  beforeEach(() => {
    hydrateState({ ...initialState, accounts: [cash], transactions: [], bills: [] });
    ensureShopeePayAccount();
    clearToasts();
  });

  afterEach(() => setTopUpCommitHandler(null));

  it("updates the balance before the remote commit resolves", async () => {
    const user = userEvent.setup();
    let resolve!: (value: { ok: boolean }) => void;
    const commit = vi.fn(
      () => new Promise<{ ok: boolean }>((r) => (resolve = r)),
    );
    setTopUpCommitHandler(commit);

    render(<TopUpSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");
    await typeAmount(user, "50000");
    await user.click(confirmButton());

    // Commit is still in flight, yet the UI already shows the new balance.
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
    expect(getState().accounts.find((a) => a.id === cash.id)!.amount).toBe(150_000);
    expect(getToasts().at(-1)?.tone).toBe("success");
    expect(screen.getByTestId("topup-status").textContent).not.toBe("");

    resolve({ ok: true });
    await waitFor(() => expect(screen.getByTestId("topup-status").textContent).toBe(""));
    expect(getState().accounts.find((a) => a.id === cash.id)!.amount).toBe(150_000);
    expect(getState().transactions).toHaveLength(1);
  });

  it("rolls the balance back and shows a failure toast when the API fails", async () => {
    const user = userEvent.setup();
    setTopUpCommitHandler(vi.fn(async () => ({ ok: false, error: "network" })));

    render(<TopUpSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");
    await typeAmount(user, "50000");
    await user.click(confirmButton());

    await waitFor(() =>
      expect(getState().accounts.find((a) => a.id === cash.id)!.amount).toBe(100_000),
    );
    // The optimistic ledger entry and its notification are gone again.
    expect(getState().transactions).toHaveLength(0);
    expect(getState().notifications.some((n) => n.title === "Top up complete")).toBe(false);

    const last = getToasts().at(-1)!;
    expect(last.tone).toBe("error");
    expect(last.body).toContain("100");
    // The sheet stays usable so the user can retry.
    expect(confirmButton()).not.toBeDisabled();
  });

  it("rolls back when the commit handler throws", async () => {
    const user = userEvent.setup();
    setTopUpCommitHandler(
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    render(<TopUpSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");
    await typeAmount(user, "25000");
    await user.click(confirmButton());

    await waitFor(() =>
      expect(getState().accounts.find((a) => a.id === cash.id)!.amount).toBe(100_000),
    );
    expect(getToasts().some((t) => t.tone === "error")).toBe(true);
  });

  it("keeps the optimistic result when no commit handler is registered", async () => {
    const user = userEvent.setup();
    render(<TopUpSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");
    await typeAmount(user, "10000");
    await user.click(confirmButton());

    await waitFor(() =>
      expect(getState().accounts.find((a) => a.id === cash.id)!.amount).toBe(110_000),
    );
  });
});
