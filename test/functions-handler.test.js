import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/trains.js";

test("Cloudflare Pages Functions: onRequestGet 疎通テスト", async () => {
  const mockContext = {
    request: new Request("https://kitahama.pages.dev/api/trains?dir=A")
  };

  const response = await onRequestGet(mockContext);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");

  const body = await response.json();
  assert.equal(body.targetStation, "北浜");
  assert.equal(body.stationCode, "K14");
  assert.equal(body.direction, "A");
  assert.equal(body.directionName, "天神橋筋六丁目・阪急線 方面（上り）");
  assert.ok(Array.isArray(body.trains));
  assert.ok(body.trains.length <= 4, "Should return at most 4 trains");
  assert.ok(body.updatedAt);
});

test("Cloudflare Pages Functions: 下り(dir=B) リクエスト", async () => {
  const mockContext = {
    request: new Request("https://kitahama.pages.dev/api/trains?dir=B")
  };

  const response = await onRequestGet(mockContext);
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.direction, "B");
  assert.equal(body.directionName, "天下茶屋 方面（下り）");
});
