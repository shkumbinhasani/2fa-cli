import { createCliRenderer, TextAttributes } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { useState, useEffect, useCallback } from "react";
import { $ } from "bun";
import { generateTOTP, getTimeRemaining, parseOtpAuthUrl } from "./totp";
import { getAccounts, addAccount, removeAccount, type Account } from "./storage";
import { readQRFromClipboard } from "./qr";

async function copyToClipboard(text: string): Promise<void> {
  const platform = process.platform;
  if (platform === "darwin") {
    await $`echo -n ${text} | pbcopy`.quiet();
  } else if (platform === "linux") {
    await $`echo -n ${text} | xclip -selection clipboard`.quiet();
  } else if (platform === "win32") {
    await $`echo ${text} | clip`.quiet();
  }
}

async function readTextFromClipboard(): Promise<string | null> {
  try {
    const platform = process.platform;
    let text = "";
    if (platform === "darwin") {
      text = await $`pbpaste`.text();
    } else if (platform === "linux") {
      text = await $`xclip -selection clipboard -o`.text();
    } else if (platform === "win32") {
      text = await $`powershell -command "Get-Clipboard"`.text();
    }
    return text.trim() || null;
  } catch {
    return null;
  }
}

function isValidBase32(str: string): boolean {
  // Base32 alphabet: A-Z and 2-7, optionally with = padding
  const cleaned = str.toUpperCase().replace(/\s/g, "").replace(/=+$/, "");
  return /^[A-Z2-7]+$/.test(cleaned) && cleaned.length >= 16;
}

type View = "list" | "add" | "add-key" | "delete-confirm";

interface AccountWithCode extends Account {
  code: string;
}

function App() {
  const [view, setView] = useState<View>("list");
  const [accounts, setAccounts] = useState<AccountWithCode[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(getTimeRemaining());
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingSecret, setPendingSecret] = useState<string | null>(null);
  const [accountName, setAccountName] = useState("");

  // Load accounts and generate codes
  const refreshAccounts = useCallback(async () => {
    const storedAccounts = await getAccounts();
    const accountsWithCodes = await Promise.all(
      storedAccounts.map(async (account) => ({
        ...account,
        code: await generateTOTP(account.secret, account.digits, account.period),
      }))
    );
    setAccounts(accountsWithCodes);
  }, []);

  // Initial load
  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  // Update timer and codes every second
  useEffect(() => {
    const interval = setInterval(async () => {
      const remaining = getTimeRemaining();
      setTimeRemaining(remaining);

      // Refresh codes when timer resets
      if (remaining === 30 || remaining === 29) {
        await refreshAccounts();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [refreshAccounts]);

  // Clear message after 3 seconds
  useEffect(() => {
    if (message) {
      const timeout = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timeout);
    }
  }, [message]);

  // Handle add from clipboard
  const handleAddFromClipboard = useCallback(async () => {
    setLoading(true);
    setMessage("Reading clipboard...");

    try {
      // First, try to read text from clipboard (URI or raw key)
      const clipboardText = await readTextFromClipboard();

      if (clipboardText) {
        // Check if it's an otpauth:// URI
        if (clipboardText.startsWith("otpauth://")) {
          const parsed = parseOtpAuthUrl(clipboardText);
          if (parsed) {
            await addAccount({
              issuer: parsed.issuer || "Unknown",
              account: parsed.account,
              secret: parsed.secret,
              digits: parsed.digits,
              period: parsed.period,
            });
            await refreshAccounts();
            setMessage(`Added: ${parsed.issuer || parsed.account}`);
            setView("list");
            setLoading(false);
            return;
          }
        }

        // Check if it's a raw base32 secret key
        const cleanedKey = clipboardText.replace(/\s/g, "").replace(/=+$/, "");
        if (isValidBase32(cleanedKey)) {
          setPendingSecret(cleanedKey.toUpperCase());
          setAccountName("");
          setView("add-key");
          setMessage("Enter a name for this account");
          setLoading(false);
          return;
        }
      }

      // Fall back to reading QR code from image
      setMessage("Reading QR code from clipboard...");
      const qrData = await readQRFromClipboard();

      if (!qrData) {
        setMessage("No valid data found. Paste a key, URI, or QR screenshot.");
        setLoading(false);
        return;
      }

      const parsed = parseOtpAuthUrl(qrData);

      if (!parsed) {
        setMessage("Invalid QR code. Not a valid authenticator URL.");
        setLoading(false);
        return;
      }

      await addAccount({
        issuer: parsed.issuer || "Unknown",
        account: parsed.account,
        secret: parsed.secret,
        digits: parsed.digits,
        period: parsed.period,
      });

      await refreshAccounts();
      setMessage(`Added: ${parsed.issuer || parsed.account}`);
      setView("list");
    } catch (error) {
      setMessage(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, [refreshAccounts]);

  // Handle saving account with manually entered name
  const handleSaveKeyAccount = useCallback(async () => {
    if (!pendingSecret || !accountName.trim()) {
      setMessage("Please enter an account name");
      return;
    }

    await addAccount({
      issuer: "",
      account: accountName.trim(),
      secret: pendingSecret,
      digits: 6,
      period: 30,
    });

    await refreshAccounts();
    setMessage(`Added: ${accountName.trim()}`);
    setPendingSecret(null);
    setAccountName("");
    setView("list");
  }, [pendingSecret, accountName, refreshAccounts]);

  // Handle copy code
  const handleCopyCode = useCallback(async () => {
    if (accounts.length === 0) return;

    const account = accounts[selectedIndex];
    await copyToClipboard(account.code);
    setMessage(`Copied: ${account.code}`);
  }, [accounts, selectedIndex]);

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (accounts.length === 0) return;

    const account = accounts[selectedIndex];
    await removeAccount(account.id);
    await refreshAccounts();
    setSelectedIndex((prev) => Math.max(0, Math.min(prev, accounts.length - 2)));
    setMessage(`Deleted: ${account.issuer || account.account}`);
    setView("list");
  }, [accounts, selectedIndex, refreshAccounts]);

  // Keyboard handling
  useKeyboard((e) => {
    if (loading) return;

    if (view === "list") {
      switch (e.name) {
        case "up":
        case "k":
          setSelectedIndex((prev) => Math.max(0, prev - 1));
          break;
        case "down":
        case "j":
          setSelectedIndex((prev) => Math.min(accounts.length - 1, prev + 1));
          break;
        case "c":
        case "enter":
        case "return":
          handleCopyCode();
          break;
        case "a":
          setView("add");
          break;
        case "d":
        case "delete":
          if (accounts.length > 0) {
            setView("delete-confirm");
          }
          break;
        case "q":
          process.exit(0);
          break;
        case "r":
          refreshAccounts();
          setMessage("Refreshed");
          break;
      }
    } else if (view === "add") {
      switch (e.name) {
        case "escape":
          setView("list");
          break;
        case "p":
        case "enter":
        case "return":
          handleAddFromClipboard();
          break;
        case "v":
          if (e.ctrl || e.meta) {
            handleAddFromClipboard();
          }
          break;
      }
    } else if (view === "add-key") {
      if (e.name === "escape") {
        setPendingSecret(null);
        setAccountName("");
        setView("list");
      } else if (e.name === "enter" || e.name === "return") {
        handleSaveKeyAccount();
      } else if (e.name === "backspace") {
        setAccountName((prev) => prev.slice(0, -1));
      } else if (e.name.length === 1 && !e.ctrl && !e.meta) {
        setAccountName((prev) => prev + e.name);
      }
    } else if (view === "delete-confirm") {
      switch (e.name) {
        case "y":
          handleDelete();
          break;
        case "n":
        case "escape":
          setView("list");
          break;
      }
    }
  });

  return (
    <box flexDirection="column" flexGrow={1}>
      {/* Header */}
      <box paddingX={1} paddingY={1}>
        <ascii-font font="tiny" text="2FA" />
        <box flexGrow={1} />
        <box flexDirection="column" alignItems="flex-end">
          <text attributes={TextAttributes.BOLD}>
            {timeRemaining}s
          </text>
          <text attributes={TextAttributes.DIM}>until refresh</text>
        </box>
      </box>

      {/* Progress bar */}
      <box paddingX={1}>
        <text>
          {"█".repeat(timeRemaining) + "░".repeat(30 - timeRemaining)}
        </text>
      </box>

      {/* Main content */}
      <box flexDirection="column" flexGrow={1} paddingX={1} paddingTop={1}>
        {view === "list" && (
          <AccountList
            accounts={accounts}
            selectedIndex={selectedIndex}
          />
        )}

        {view === "add" && (
          <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD}>Add New Account</text>
            <text attributes={TextAttributes.DIM}>
              Copy one of these to your clipboard, then press Enter:
            </text>
            <text attributes={TextAttributes.DIM}>
              - A QR code screenshot
            </text>
            <text attributes={TextAttributes.DIM}>
              - An otpauth:// URI
            </text>
            <text attributes={TextAttributes.DIM}>
              - A secret key (base32)
            </text>
            <box paddingTop={1}>
              <text attributes={TextAttributes.DIM}>[Enter/p] Add from clipboard  [Esc] Cancel</text>
            </box>
          </box>
        )}

        {view === "add-key" && (
          <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD}>Name this Account</text>
            <text attributes={TextAttributes.DIM}>
              Secret key detected. Enter a name for this account:
            </text>
            <box paddingTop={1}>
              <text>{accountName || " "}</text>
              <text attributes={TextAttributes.BLINK}>_</text>
            </box>
            <box paddingTop={1}>
              <text attributes={TextAttributes.DIM}>[Enter] Save  [Esc] Cancel</text>
            </box>
          </box>
        )}

        {view === "delete-confirm" && accounts.length > 0 && (
          <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD}>Delete Account?</text>
            <text>
              Are you sure you want to delete "{accounts[selectedIndex].issuer || accounts[selectedIndex].account}"?
            </text>
            <box paddingTop={1}>
              <text attributes={TextAttributes.DIM}>[y] Yes  [n] No</text>
            </box>
          </box>
        )}
      </box>

      {/* Message bar */}
      {message && (
        <box paddingX={1} paddingBottom={1}>
          <text attributes={TextAttributes.ITALIC}>{message}</text>
        </box>
      )}

      {/* Footer */}
      <box paddingX={1} paddingBottom={1} borderTop="single" paddingTop={1}>
        <text attributes={TextAttributes.DIM}>
          [Enter/c] Copy  [a] Add  [d] Delete  [r] Refresh  [q] Quit  [j/k] Navigate
        </text>
      </box>
    </box>
  );
}

function AccountList({ accounts, selectedIndex }: { accounts: AccountWithCode[]; selectedIndex: number }) {
  if (accounts.length === 0) {
    return (
      <box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
        <text attributes={TextAttributes.DIM}>No accounts yet</text>
        <text attributes={TextAttributes.DIM}>Press [a] to add your first account</text>
      </box>
    );
  }

  return (
    <box flexDirection="column" gap={1}>
      {accounts.map((account, index) => (
        <AccountRow
          key={account.id}
          account={account}
          selected={index === selectedIndex}
        />
      ))}
    </box>
  );
}

function AccountRow({ account, selected }: { account: AccountWithCode; selected: boolean }) {
  const displayName = account.issuer
    ? `${account.issuer} (${account.account})`
    : account.account;

  // Format code with spaces for readability (e.g., "123 456")
  const formattedCode = account.code.replace(/(.{3})/g, "$1 ").trim();

  return (
    <box
      flexDirection="row"
      paddingX={1}
      backgroundColor={selected ? "#333" : undefined}
    >
      <text attributes={selected ? TextAttributes.BOLD : 0}>
        {selected ? "▶ " : "  "}
      </text>
      <box flexDirection="column" flexGrow={1}>
        <text attributes={selected ? TextAttributes.BOLD : 0}>
          {displayName}
        </text>
      </box>
      <text attributes={TextAttributes.BOLD}>
        {formattedCode}
      </text>
    </box>
  );
}

const renderer = await createCliRenderer();
createRoot(renderer).render(<App />);
