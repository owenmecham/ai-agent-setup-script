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
 * Sends an iMessage to an arbitrary recipient (phone number or email)
 * rather than an existing chat GUID. Tries modern `participant` syntax first,
 * falls back to legacy `buddy` for older macOS.
 */
export async function sendToRecipient(recipient: string, text: string): Promise<void> {
  const escapedText = escapeAppleScript(text);
  const escapedRecipient = escapeAppleScript(recipient);

  // Modern syntax (macOS 13+): use "participant" to address by phone/email
  const modernScript = [
    'tell application "Messages"',
    `  set targetBuddy to participant "${escapedRecipient}" of account 1`,
    `  send "${escapedText}" to targetBuddy`,
    'end tell',
  ].join('\n');

  // Legacy syntax: use "buddy" (older macOS)
  const legacyScript = [
    'tell application "Messages"',
    `  set targetService to 1st account whose service type = iMessage`,
    `  set targetBuddy to participant "${escapedRecipient}" of targetService`,
    `  send "${escapedText}" to targetBuddy`,
    'end tell',
  ].join('\n');

  try {
    await execFileAsync('osascript', ['-e', modernScript]);
  } catch {
    await execFileAsync('osascript', ['-e', legacyScript]);
  }
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
