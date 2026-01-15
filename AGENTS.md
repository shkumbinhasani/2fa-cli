# Agents Guide

This document helps AI agents and contributors understand and work on the 2FA CLI codebase.

## Project Overview

2FA CLI is a terminal-based TOTP authenticator with:
- An interactive TUI (Terminal User Interface) built with OpenTUI
- A command-line interface for scripting and quick access
- QR code reading from clipboard screenshots
- Local encrypted storage

## Tech Stack

- **Runtime**: [Bun](https://bun.sh) - JavaScript runtime and bundler
- **TUI Framework**: [@opentui/react](https://github.com/anomalyco/opentui) - React-based terminal UI
- **QR Decoding**: jsQR + Jimp for image processing
- **Language**: TypeScript

## Project Structure

```
src/
├── index.tsx    # Entry point - handles CLI args, then launches TUI
├── cli.ts       # CLI command implementations (list, add, get, copy, remove)
├── totp.ts      # TOTP generation (RFC 6238) using Web Crypto API
├── qr.ts        # QR code reading from clipboard images
└── storage.ts   # Account storage (~/.2fa-cli/accounts.json)

.github/
└── workflows/
    └── release.yml  # GitHub Actions for building releases

install          # Bash installer script for end users
```

## Key Files

### `src/index.tsx`
- Entry point that first checks for CLI commands
- If no CLI command handled, launches the OpenTUI React app
- Contains the main `<App>` component with all TUI views and keyboard handling

### `src/cli.ts`
- All CLI command implementations
- `runCli(args)` returns `true` if a command was handled, `false` to launch TUI
- Commands: list, add, get, copy, remove, help, version

### `src/totp.ts`
- `generateTOTP(secret, digits, period)` - Generates TOTP codes
- `getTimeRemaining(period)` - Seconds until next code refresh
- `parseOtpAuthUrl(url)` - Parses otpauth:// URIs
- Uses Web Crypto API for HMAC-SHA1

### `src/qr.ts`
- `readQRFromClipboard()` - Reads QR code from clipboard image
- Platform-specific clipboard handling (macOS, Linux, Windows)
- Uses AppleScript on macOS to extract PNG from clipboard

### `src/storage.ts`
- `getAccounts()` / `addAccount()` / `removeAccount()` - CRUD operations
- Stores accounts in `~/.2fa-cli/accounts.json`
- Account structure: `{ id, issuer, account, secret, digits, period, createdAt }`

## Development

### Prerequisites
- [Bun](https://bun.sh) v1.0+

### Commands

```bash
# Install dependencies
bun install

# Run in development (with hot reload)
bun dev

# Run directly
bun start

# Build native executable
bun run build
# or
bun build --compile --minify src/index.tsx --outfile 2fa

# Test CLI commands
bun run src/index.tsx --help
bun run src/index.tsx list
bun run src/index.tsx get <query>
```

### Testing Changes

1. **TUI changes**: Run `bun dev` and interact with the TUI
2. **CLI changes**: Test with `bun run src/index.tsx <command>`
3. **TOTP generation**: Verify codes match other authenticator apps

## Code Conventions

### Bun-Specific
- Use `Bun.file()` instead of `fs.readFile()`
- Use `Bun.$\`command\`` for shell commands
- Use `bun test` for testing (if adding tests)
- Bun auto-loads `.env` files

### TypeScript
- Strict mode enabled
- Use `type` imports for type-only imports
- Prefer `async/await` over callbacks

### React (OpenTUI)
- Use functional components with hooks
- `useKeyboard()` for keyboard input
- Available components: `box`, `text`, `input`, `select`, `ascii-font`
- `TextAttributes` enum for styling (BOLD, DIM, ITALIC, etc.)

## Adding Features

### Adding a new CLI command

1. Add the command handler in `src/cli.ts`:
```typescript
async function cmdMyCommand(args: string[]): Promise<void> {
  // Implementation
}
```

2. Add to the switch statement in `runCli()`:
```typescript
case "mycommand":
  await cmdMyCommand(args.slice(1));
  return true;
```

3. Update the `HELP` string in `src/cli.ts`

### Adding a new TUI view

1. Add to the `View` type in `src/index.tsx`:
```typescript
type View = "list" | "add" | "add-key" | "delete-confirm" | "myview";
```

2. Add keyboard handling in the `useKeyboard` hook

3. Add the view JSX in the return statement

## Release Process

1. Update version in `src/cli.ts` (`VERSION` constant)
2. Commit changes
3. Create and push a tag:
```bash
git tag v0.x.0
git push origin v0.x.0
```
4. GitHub Actions will build binaries for:
   - macOS ARM64 (Apple Silicon)
   - Linux x64
5. Binaries are uploaded to GitHub Releases

## Platform Support

### Clipboard Operations
- **macOS**: `pbcopy`/`pbpaste`, AppleScript for images
- **Linux**: `xclip` (must be installed)
- **Windows**: `clip`, PowerShell for images

### Native Binaries
OpenTUI uses platform-specific native modules (`@opentui/core-darwin-arm64`, etc.), so cross-compilation is not supported. Each platform must be built on its native runner.

## Troubleshooting

### "Could not resolve @opentui/core-..."
The native OpenTUI module for your platform isn't installed. Run `bun install`.

### QR code not detected
- Ensure the screenshot contains only the QR code
- QR code must be clear and not too small
- Try a fresh screenshot

### Clipboard not working on Linux
Install xclip: `sudo apt install xclip`
