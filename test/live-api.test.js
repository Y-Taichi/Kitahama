import test from "node:test";
import assert from "node:assert/strict";
import { filterAndSortKitahamaTrains } from "../lib/train-tracker.js";

const OSAKA_METRO_API_URL = "https://api.mobility-operation-info.emetro-app.osakametro.co.jp/app/api/v1/trainlocation?route_code=6";
const API_KEY = "XSGUG4p5Ya5vQCehV3zZjaDheZAQMpqP9paVan8W";

test("Live API: Osaka Metro API 疎通とデータ整合性テスト", async () => {
  const res = await fetch(OSAKA_METRO_API_URL, {
    headers: {
      "X-Api-Key": API_KEY,
      "Accept-Language": "ja",
      "User-Agent": "KitahamaTrackerTest/1.0"
    }
  });

  assert.equal(res.status, 200, `API HTTP Status should be 200 (got ${res.status})`);
  
  const data = await res.json();
  assert.ok(data && typeof data === "object", "Response should be an object");
  assert.ok(Array.isArray(data.trainLocationList), "trainLocationList should be an array");

  console.log(`[Live Test] Active trains on Sakaisuji line: ${data.trainLocationList.length}`);

  // 上り（天六・阪急方面）の北浜接近列車を計算
  const upTrains = filterAndSortKitahamaTrains(data.trainLocationList, "A");
  console.log(`[Live Test] Approaching Kitahama (Up / A): ${upTrains.length} trains`);
  for (const t of upTrains) {
    console.log(`  -> ${t.orderLabel}: [${t.destination}行] ${t.distanceLabel} (${t.locationDescription}) 車両:${t.vehicleNumber}`);
    assert.ok(t.destination, "Destination should not be empty");
    assert.ok(t.distanceLabel, "Distance label should not be empty");
    assert.ok(typeof t.distanceScore === "number", "Distance score should be a number");
  }

  // 下り（天下茶屋方面）の北浜接近列車を計算
  const downTrains = filterAndSortKitahamaTrains(data.trainLocationList, "B");
  console.log(`[Live Test] Approaching Kitahama (Down / B): ${downTrains.length} trains`);
  for (const t of downTrains) {
    console.log(`  -> ${t.orderLabel}: [${t.destination}行] ${t.distanceLabel} (${t.locationDescription}) 車両:${t.vehicleNumber}`);
  }
});
