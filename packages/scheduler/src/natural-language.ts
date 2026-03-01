import { spawn } from 'node:child_process';

export async function parseCronFromNaturalLanguage(input: string): Promise<{
  cronExpression: string;
  interpretation: string;
} | null> {
  const prompt = `Convert this natural language schedule to a cron expression. Return ONLY valid JSON with "cronExpression" and "interpretation" fields. No other text.

Input: "${input}"

Examples:
"every morning at 9am" -> {"cronExpression": "0 9 * * *", "interpretation": "Every day at 9:00 AM"}
"every weekday at 5pm" -> {"cronExpression": "0 17 * * 1-5", "interpretation": "Monday through Friday at 5:00 PM"}
"every hour" -> {"cronExpression": "0 * * * *", "interpretation": "Every hour at minute 0"}`;

  return new Promise((resolve) => {
    const proc = spawn('claude', ['-p', '--model', 'haiku', '--output-format', 'json'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }

      try {
        // Claude CLI may wrap in a result object
        let parsed = JSON.parse(stdout);
        if (parsed.result) parsed = JSON.parse(parsed.result);
        resolve({
          cronExpression: parsed.cronExpression,
          interpretation: parsed.interpretation,
        });
      } catch {
        resolve(null);
      }
    });

    proc.on('error', () => resolve(null));
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}
