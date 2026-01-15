# 2FA CLI

A terminal-based two-factor authentication (2FA/TOTP) manager with a beautiful TUI, built with [OpenTUI](https://github.com/anomalyco/opentui).

## Features

- Generate TOTP codes with live countdown timer
- Add accounts by:
  - Screenshotting a QR code (reads from clipboard)
  - Pasting an `otpauth://` URI
  - Pasting a raw base32 secret key
- Copy codes to clipboard with a single keypress
- Secure local storage at `~/.2fa-cli/accounts.json`
- Cross-platform support (macOS, Linux, Windows)

## Installation

### Quick Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/shkumbinhasani/2fa-cli/main/install | bash
```

### From Source

Requires [Bun](https://bun.sh) v1.0 or later.

```bash
git clone https://github.com/shkumbinhasani/2fa-cli.git
cd 2fa-cli
bun install
bun start
```

## Usage

```bash
2fa
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` / `c` | Copy selected code to clipboard |
| `a` | Add new account |
| `d` | Delete selected account |
| `j` / `Down` | Move selection down |
| `k` / `Up` | Move selection up |
| `r` | Refresh codes |
| `q` | Quit |

### Adding Accounts

1. Press `a` to enter add mode
2. Copy one of the following to your clipboard:
   - A **screenshot** of a QR code (Cmd+Shift+4 on macOS)
   - An **otpauth:// URI** (e.g., `otpauth://totp/GitHub:user@example.com?secret=ABC123...`)
   - A **secret key** in base32 format (e.g., `JBSWY3DPEHPK3PXP`)
3. Press `Enter` to add from clipboard

## Building from Source

```bash
# Build native executable
bun build --compile --minify src/index.tsx --outfile 2fa

# Run the built executable
./2fa
```

## How It Works

- **TOTP Generation**: Implements RFC 6238 using Web Crypto API (HMAC-SHA1)
- **QR Code Reading**: Uses [jsQR](https://github.com/cozmo/jsQR) and [Jimp](https://github.com/jimp-dev/jimp) to decode QR codes from clipboard images
- **TUI**: Built with [@opentui/react](https://github.com/anomalyco/opentui) for a beautiful terminal interface
- **Storage**: Accounts stored locally in JSON format at `~/.2fa-cli/accounts.json`

## Security

- Secrets are stored locally on your machine
- No data is sent to any external servers
- Consider encrypting your home directory for additional security

## License

MIT

## Credits

- [OpenTUI](https://github.com/anomalyco/opentui) - Terminal UI framework
- [jsQR](https://github.com/cozmo/jsQR) - QR code decoder
- [Bun](https://bun.sh) - JavaScript runtime and bundler
