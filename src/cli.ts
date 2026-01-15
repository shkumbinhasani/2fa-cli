import { $ } from "bun";
import { generateTOTP, getTimeRemaining, parseOtpAuthUrl } from "./totp";
import { getAccounts, addAccount, removeAccount, type Account } from "./storage";
import { readQRFromClipboard } from "./qr";

const VERSION = "0.1.0";

const HELP = `
2FA CLI - Terminal-based TOTP authenticator

USAGE:
  2fa [command] [options]

COMMANDS:
  (none)          Launch interactive TUI
  list, ls        List all accounts with current codes
  add <secret>    Add account with secret key or otpauth:// URI
  add -c          Add from clipboard (QR screenshot, URI, or key)
  get <query>     Get code for account matching query
  copy <query>    Copy code to clipboard for account matching query
  remove <query>  Remove account matching query

OPTIONS:
  -h, --help      Show this help message
  -v, --version   Show version number
  -c, --clipboard Read from clipboard (for add command)
  -n, --name      Account name (for add command with raw secret)

EXAMPLES:
  2fa                                    # Launch TUI
  2fa list                               # List all codes
  2fa add JBSWY3DPEHPK3PXP -n GitHub     # Add with secret key
  2fa add "otpauth://totp/GitHub:user?secret=ABC123&issuer=GitHub"
  2fa add -c                             # Add from clipboard
  2fa get github                         # Get GitHub code
  2fa copy github                        # Copy GitHub code
  2fa remove github                      # Remove GitHub account
`;

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
  const cleaned = str.toUpperCase().replace(/\s/g, "").replace(/=+$/, "");
  return /^[A-Z2-7]+$/.test(cleaned) && cleaned.length >= 16;
}

function findAccount(accounts: Account[], query: string): Account | null {
  const lowerQuery = query.toLowerCase();
  return accounts.find(
    (a) =>
      a.account.toLowerCase().includes(lowerQuery) ||
      a.issuer.toLowerCase().includes(lowerQuery) ||
      a.id === query
  ) || null;
}

async function cmdList(): Promise<void> {
  const accounts = await getAccounts();

  if (accounts.length === 0) {
    console.log("No accounts found. Add one with: 2fa add <secret>");
    return;
  }

  const timeRemaining = getTimeRemaining();
  console.log(`\n  Codes refresh in ${timeRemaining}s\n`);

  for (const account of accounts) {
    const code = await generateTOTP(account.secret, account.digits, account.period);
    const formattedCode = code.replace(/(.{3})/g, "$1 ").trim();
    const name = account.issuer
      ? `${account.issuer} (${account.account})`
      : account.account;
    console.log(`  ${formattedCode}  ${name}`);
  }
  console.log();
}

async function cmdAdd(args: string[]): Promise<void> {
  let secret: string | null = null;
  let name: string | null = null;
  let fromClipboard = false;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-c" || arg === "--clipboard") {
      fromClipboard = true;
    } else if (arg === "-n" || arg === "--name") {
      name = args[++i];
    } else if (!arg.startsWith("-")) {
      secret = arg;
    }
  }

  if (fromClipboard) {
    // Try text clipboard first
    const clipboardText = await readTextFromClipboard();

    if (clipboardText) {
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
          console.log(`Added: ${parsed.issuer || parsed.account}`);
          return;
        }
      }

      const cleanedKey = clipboardText.replace(/\s/g, "").replace(/=+$/, "");
      if (isValidBase32(cleanedKey)) {
        if (!name) {
          console.error("Error: Secret key found but no name provided. Use: 2fa add -c -n <name>");
          process.exit(1);
        }
        await addAccount({
          issuer: "",
          account: name,
          secret: cleanedKey.toUpperCase(),
          digits: 6,
          period: 30,
        });
        console.log(`Added: ${name}`);
        return;
      }
    }

    // Try QR from clipboard
    console.log("Reading QR code from clipboard...");
    const qrData = await readQRFromClipboard();

    if (!qrData) {
      console.error("Error: No valid data found in clipboard (QR, URI, or secret key)");
      process.exit(1);
    }

    const parsed = parseOtpAuthUrl(qrData);
    if (!parsed) {
      console.error("Error: Invalid QR code - not a valid authenticator URL");
      process.exit(1);
    }

    await addAccount({
      issuer: parsed.issuer || "Unknown",
      account: parsed.account,
      secret: parsed.secret,
      digits: parsed.digits,
      period: parsed.period,
    });
    console.log(`Added: ${parsed.issuer || parsed.account}`);
    return;
  }

  if (!secret) {
    console.error("Error: No secret provided. Usage: 2fa add <secret> [-n name]");
    process.exit(1);
  }

  // Check if it's an otpauth:// URI
  if (secret.startsWith("otpauth://")) {
    const parsed = parseOtpAuthUrl(secret);
    if (!parsed) {
      console.error("Error: Invalid otpauth:// URI");
      process.exit(1);
    }
    await addAccount({
      issuer: parsed.issuer || "Unknown",
      account: parsed.account,
      secret: parsed.secret,
      digits: parsed.digits,
      period: parsed.period,
    });
    console.log(`Added: ${parsed.issuer || parsed.account}`);
    return;
  }

  // It's a raw secret key
  const cleanedKey = secret.replace(/\s/g, "").replace(/=+$/, "");
  if (!isValidBase32(cleanedKey)) {
    console.error("Error: Invalid secret key (must be base32 encoded, at least 16 characters)");
    process.exit(1);
  }

  if (!name) {
    console.error("Error: Name required for raw secret key. Use: 2fa add <secret> -n <name>");
    process.exit(1);
  }

  await addAccount({
    issuer: "",
    account: name,
    secret: cleanedKey.toUpperCase(),
    digits: 6,
    period: 30,
  });
  console.log(`Added: ${name}`);
}

async function cmdGet(query: string): Promise<void> {
  if (!query) {
    console.error("Error: No query provided. Usage: 2fa get <query>");
    process.exit(1);
  }

  const accounts = await getAccounts();
  const account = findAccount(accounts, query);

  if (!account) {
    console.error(`Error: No account found matching "${query}"`);
    process.exit(1);
  }

  const code = await generateTOTP(account.secret, account.digits, account.period);
  console.log(code);
}

async function cmdCopy(query: string): Promise<void> {
  if (!query) {
    console.error("Error: No query provided. Usage: 2fa copy <query>");
    process.exit(1);
  }

  const accounts = await getAccounts();
  const account = findAccount(accounts, query);

  if (!account) {
    console.error(`Error: No account found matching "${query}"`);
    process.exit(1);
  }

  const code = await generateTOTP(account.secret, account.digits, account.period);
  await copyToClipboard(code);

  const name = account.issuer
    ? `${account.issuer} (${account.account})`
    : account.account;
  console.log(`Copied code for ${name}: ${code}`);
}

async function cmdRemove(query: string): Promise<void> {
  if (!query) {
    console.error("Error: No query provided. Usage: 2fa remove <query>");
    process.exit(1);
  }

  const accounts = await getAccounts();
  const account = findAccount(accounts, query);

  if (!account) {
    console.error(`Error: No account found matching "${query}"`);
    process.exit(1);
  }

  const name = account.issuer
    ? `${account.issuer} (${account.account})`
    : account.account;

  await removeAccount(account.id);
  console.log(`Removed: ${name}`);
}

export async function runCli(args: string[]): Promise<boolean> {
  // Check for help/version flags anywhere in args
  if (args.includes("-h") || args.includes("--help") || args.includes("help")) {
    console.log(HELP);
    return true;
  }

  if (args.includes("-v") || args.includes("--version") || args.includes("version")) {
    console.log(`2fa v${VERSION}`);
    return true;
  }

  const command = args[0];

  if (!command || command === "tui") {
    return false; // Launch TUI
  }

  switch (command) {
    case "list":
    case "ls":
      await cmdList();
      return true;

    case "add":
      await cmdAdd(args.slice(1));
      return true;

    case "get":
      await cmdGet(args[1]);
      return true;

    case "copy":
    case "cp":
      await cmdCopy(args[1]);
      return true;

    case "remove":
    case "rm":
    case "delete":
      await cmdRemove(args[1]);
      return true;

    default:
      // Check if it looks like a query - try to get code for it
      if (!command.startsWith("-")) {
        const accounts = await getAccounts();
        const account = findAccount(accounts, command);
        if (account) {
          const code = await generateTOTP(account.secret, account.digits, account.period);
          console.log(code);
          return true;
        }
      }
      console.error(`Unknown command: ${command}`);
      console.log("Run '2fa --help' for usage information.");
      process.exit(1);
  }
}
