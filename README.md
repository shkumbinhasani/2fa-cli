# 2FA CLI

A terminal-based two-factor authentication (2FA/TOTP) manager with both an interactive TUI and command-line interface, built with [OpenTUI](https://github.com/anomalyco/opentui).

## Features

- Interactive TUI with live countdown timer
- Command-line interface for scripting and quick access
- Add accounts by:
  - Screenshotting a QR code (reads from clipboard)
  - Pasting an `otpauth://` URI
  - Pasting a raw base32 secret key
- Copy codes to clipboard
- Secure local storage at `~/.2fa-cli/accounts.json`
- Cross-platform support (macOS, Linux)

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

### Interactive TUI

```bash
2fa
```

### Command Line

```bash
# Show help
2fa --help

# List all accounts with codes
2fa list

# Get code for an account (outputs just the code)
2fa get github
2fa github              # shorthand

# Copy code to clipboard
2fa copy github

# Add account from otpauth:// URI
2fa add "otpauth://totp/GitHub:user?secret=ABCD1234&issuer=GitHub"

# Add account from secret key
2fa add JBSWY3DPEHPK3PXP -n "My Account"

# Add from clipboard (QR screenshot, URI, or key)
2fa add -c
2fa add -c -n "Account Name"   # if clipboard has raw key

# Remove an account
2fa remove github
```

### CLI Commands

| Command | Description |
|---------|-------------|
| `2fa` | Launch interactive TUI |
| `2fa list` | List all accounts with current codes |
| `2fa get <query>` | Get code for account matching query |
| `2fa copy <query>` | Copy code to clipboard |
| `2fa add <secret>` | Add account from secret or URI |
| `2fa add -c` | Add from clipboard |
| `2fa remove <query>` | Remove account |
| `2fa --help` | Show help |
| `2fa --version` | Show version |

### TUI Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` / `c` | Copy selected code to clipboard |
| `a` | Add new account |
| `d` | Delete selected account |
| `j` / `Down` | Move selection down |
| `k` / `Up` | Move selection up |
| `r` | Refresh codes |
| `q` | Quit |

## Examples

```bash
# Quick one-liner to get a code
2fa github

# Use in scripts
CODE=$(2fa get github)
echo "Your code is: $CODE"

# Add from QR screenshot
# 1. Take screenshot of QR (Cmd+Shift+4 on macOS)
# 2. Run:
2fa add -c

# Pipe code somewhere
2fa get github | pbcopy
```

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
