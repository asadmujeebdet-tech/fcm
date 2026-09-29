export const MAX_TOPIC_PAYLOAD_BYTES = 2048;
export const MAX_FCM_ATTEMPTS = 3;

export function normalizeTopic(topic: string): string {
  return topic.trim().replace(/^\/topics\//, "");
}

// FCM topic names may only contain letters, digits and - _ . ~ %
const TOPIC_PATTERN = /^[A-Za-z0-9\-_.~%]+$/;

export function isValidTopic(topic: string): boolean {
  return TOPIC_PATTERN.test(topic);
}

export type FinalMessageStatus = "sent" | "partial_failure" | "failed";

// A message with no processed targets is a failure, never a silent "sent".
export function resolveMessageStatus(sent: number, failed: number): FinalMessageStatus {
  if (sent + failed === 0) return "failed";
  if (failed === 0) return "sent";
  if (sent === 0) return "failed";
  return "partial_failure";
}

export function getPayloadSizeBytes(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength;
}

export function isRetryableFcmStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 503;
}

export function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return null;
}

export function getRetryDelayMs(attempt: number, retryAfterMs: number | null): number {
  if (retryAfterMs !== null) {
    return Math.min(Math.max(retryAfterMs, 10_000), 120_000);
  }

  const base = Math.min(10_000 * 2 ** attempt, 60_000);
  return Math.min(base + Math.floor(Math.random() * 5_000), 65_000);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
