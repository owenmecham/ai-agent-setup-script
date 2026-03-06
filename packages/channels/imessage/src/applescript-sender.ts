import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Sends an iMessage via AppleScript using the Messages.app.
 * Uses `execFile` (not `exec`) to avoid shell injection.
 */
export async function sendMessage(chatGuid: string, text: string): Promise<void> {
  const escapedText = escapeAppleScript(text);
  const escapedGuid = escapeAppleScript(chatGuid);

  const script = `tell application "Messages" to send "${escapedText}" to chat id "${escapedGuid}"`;

  await execFileAsync('osascript', ['-e', script]);
}

/**
 * Escapes special characters for AppleScript string literals.
 * AppleScript strings use double quotes, so we escape backslashes and double quotes.
 */
function escapeAppleScript(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}
