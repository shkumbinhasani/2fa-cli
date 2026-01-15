import jsQR from "jsqr";
import { Jimp } from "jimp";
import { $ } from "bun";
import { tmpdir } from "os";
import { join } from "path";

export async function readQRFromClipboard(): Promise<string | null> {
  const platform = process.platform;

  if (platform === "darwin") {
    return readQRFromClipboardMacOS();
  } else if (platform === "linux") {
    return readQRFromClipboardLinux();
  } else if (platform === "win32") {
    return readQRFromClipboardWindows();
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

async function readQRFromClipboardMacOS(): Promise<string | null> {
  const tempFile = join(tmpdir(), `2fa-clipboard-${Date.now()}.png`);

  try {
    // Use AppleScript to save clipboard image to temp file
    const script = `
      set tempFile to POSIX file "${tempFile}"
      try
        set imageData to the clipboard as «class PNGf»
        set fileRef to open for access tempFile with write permission
        write imageData to fileRef
        close access fileRef
        return "success"
      on error errMsg
        return "error: " & errMsg
      end try
    `;

    const result = await $`osascript -e ${script}`.text();

    if (result.trim().startsWith("error:")) {
      return null;
    }

    // Read the image and decode QR
    const qrData = await decodeQRFromFile(tempFile);

    // Clean up temp file
    await Bun.file(tempFile).exists() && await $`rm ${tempFile}`.quiet();

    return qrData;
  } catch (error) {
    // Clean up on error
    try {
      await $`rm ${tempFile}`.quiet();
    } catch {}
    return null;
  }
}

async function readQRFromClipboardLinux(): Promise<string | null> {
  const tempFile = join(tmpdir(), `2fa-clipboard-${Date.now()}.png`);

  try {
    // Try xclip first
    await $`xclip -selection clipboard -t image/png -o > ${tempFile}`.quiet();
    const qrData = await decodeQRFromFile(tempFile);
    await $`rm ${tempFile}`.quiet();
    return qrData;
  } catch {
    try {
      // Try xsel as fallback
      await $`xsel --clipboard --output > ${tempFile}`.quiet();
      const qrData = await decodeQRFromFile(tempFile);
      await $`rm ${tempFile}`.quiet();
      return qrData;
    } catch {
      return null;
    }
  }
}

async function readQRFromClipboardWindows(): Promise<string | null> {
  const tempFile = join(tmpdir(), `2fa-clipboard-${Date.now()}.png`);

  try {
    // PowerShell script to save clipboard image
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      $img = [System.Windows.Forms.Clipboard]::GetImage()
      if ($img -ne $null) {
        $img.Save('${tempFile.replace(/\\/g, "\\\\")}', [System.Drawing.Imaging.ImageFormat]::Png)
        Write-Output "success"
      } else {
        Write-Output "no-image"
      }
    `;

    const result = await $`powershell -Command ${psScript}`.text();

    if (result.trim() !== "success") {
      return null;
    }

    const qrData = await decodeQRFromFile(tempFile);
    await $`del ${tempFile}`.quiet();
    return qrData;
  } catch {
    return null;
  }
}

async function decodeQRFromFile(filePath: string): Promise<string | null> {
  try {
    const image = await Jimp.read(filePath);
    const { data, width, height } = image.bitmap;

    // Convert RGBA to Uint8ClampedArray for jsQR
    const imageData = new Uint8ClampedArray(data);

    const qrCode = jsQR(imageData, width, height);

    if (qrCode) {
      return qrCode.data;
    }

    return null;
  } catch (error) {
    return null;
  }
}

export async function decodeQRFromImagePath(imagePath: string): Promise<string | null> {
  return decodeQRFromFile(imagePath);
}
