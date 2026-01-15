import { homedir } from "os";
import { join } from "path";

export interface Account {
  id: string;
  issuer: string;
  account: string;
  secret: string;
  digits: number;
  period: number;
  createdAt: number;
}

interface StorageData {
  version: number;
  accounts: Account[];
}

const CONFIG_DIR = join(homedir(), ".2fa-cli");
const STORAGE_FILE = join(CONFIG_DIR, "accounts.json");

async function ensureConfigDir(): Promise<void> {
  const dir = Bun.file(CONFIG_DIR);
  try {
    await Bun.$`mkdir -p ${CONFIG_DIR}`.quiet();
  } catch {}
}

async function readStorage(): Promise<StorageData> {
  try {
    const file = Bun.file(STORAGE_FILE);
    if (await file.exists()) {
      const data = await file.json();
      return data as StorageData;
    }
  } catch {}

  return { version: 1, accounts: [] };
}

async function writeStorage(data: StorageData): Promise<void> {
  await ensureConfigDir();
  await Bun.write(STORAGE_FILE, JSON.stringify(data, null, 2));
}

export async function getAccounts(): Promise<Account[]> {
  const data = await readStorage();
  return data.accounts;
}

export async function addAccount(account: Omit<Account, "id" | "createdAt">): Promise<Account> {
  const data = await readStorage();

  const newAccount: Account = {
    ...account,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };

  data.accounts.push(newAccount);
  await writeStorage(data);

  return newAccount;
}

export async function removeAccount(id: string): Promise<boolean> {
  const data = await readStorage();
  const initialLength = data.accounts.length;

  data.accounts = data.accounts.filter((a) => a.id !== id);

  if (data.accounts.length !== initialLength) {
    await writeStorage(data);
    return true;
  }

  return false;
}

export async function getAccount(id: string): Promise<Account | undefined> {
  const data = await readStorage();
  return data.accounts.find((a) => a.id === id);
}

export async function updateAccount(id: string, updates: Partial<Omit<Account, "id" | "createdAt">>): Promise<Account | null> {
  const data = await readStorage();
  const index = data.accounts.findIndex((a) => a.id === id);

  if (index === -1) return null;

  data.accounts[index] = { ...data.accounts[index], ...updates };
  await writeStorage(data);

  return data.accounts[index];
}
