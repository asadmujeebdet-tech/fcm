import assert from "node:assert/strict";
import test from "node:test";
import {
  getPayloadSizeBytes,
  getRetryDelayMs,
  isRetryableFcmStatus,
  isValidTopic,
  normalizeTopic,
  parseRetryAfterMs,
  resolveMessageStatus,
} from "../lib/fcm-utils.ts";

test("normalizes topic names", () => {
  assert.equal(normalizeTopic(" simpleapplicationtech "), "simpleapplicationtech");
  assert.equal(normalizeTopic("/topics/simpleapplicationtech"), "simpleapplicationtech");
});

test("calculates UTF-8 payload size", () => {
  const payload = { message: { topic: "topic", notification: { title: "Test", body: "Hello" } } };
  assert.equal(getPayloadSizeBytes(payload), Buffer.byteLength(JSON.stringify(payload), "utf8"));
});

test("only retries transient FCM statuses", () => {
  assert.equal(isRetryableFcmStatus(429), true);
  assert.equal(isRetryableFcmStatus(500), true);
  assert.equal(isRetryableFcmStatus(503), true);
  assert.equal(isRetryableFcmStatus(400), false);
  assert.equal(isRetryableFcmStatus(401), false);
  assert.equal(isRetryableFcmStatus(403), false);
});

test("parses Retry-After seconds and HTTP dates", () => {
  assert.equal(parseRetryAfterMs("5"), 5000);
  const future = new Date(Date.now() + 5000).toUTCString();
  const parsed = parseRetryAfterMs(future);
  assert.ok(parsed !== null && parsed >= 0 && parsed <= 5000);
});

test("retry delay honors Retry-After and remains bounded", () => {
  assert.equal(getRetryDelayMs(0, 5000), 10000);
  assert.equal(getRetryDelayMs(0, 999999), 120000);
  const delay = getRetryDelayMs(2, null);
  assert.ok(delay >= 10000 && delay <= 65000);
});

test("validates FCM topic names", () => {
  assert.equal(isValidTopic("simpleapplicationtech"), true);
  assert.equal(isValidTopic("com.videoplayer.videodownloader.hddownloader.msl"), true);
  assert.equal(isValidTopic("news_v2-beta~1%"), true);
  assert.equal(isValidTopic(""), false);
  assert.equal(isValidTopic("has space"), false);
  assert.equal(isValidTopic("/topics/x"), false);
  assert.equal(isValidTopic("emoji😀"), false);
});

test("resolves final message status from target totals", () => {
  assert.equal(resolveMessageStatus(3, 0), "sent");
  assert.equal(resolveMessageStatus(2, 1), "partial_failure");
  assert.equal(resolveMessageStatus(0, 3), "failed");
  assert.equal(resolveMessageStatus(0, 0), "failed");
});
