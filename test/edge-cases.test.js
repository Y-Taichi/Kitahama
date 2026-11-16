import test from "node:test";
import assert from "node:assert/strict";
import { filterAndSortKitahamaTrains } from "../lib/train-tracker.js";

test("Edge Cases: 未知の駅コードや異常値のフォールバック", () => {
  const rawList = [
    {
      directionId: "A",
      fromStationCode: "K16",
      toStationCode: "UNKNOWN_STATION",
      progress: "9.9", // 未知のprogress
      terminalStationCode: "HK999", // 未知の行先コード
      vehicleNumber: "" // 車両番号なし
    }
  ];

  const result = filterAndSortKitahamaTrains(rawList, "A");
  assert.equal(result.length, 1);
  assert.equal(result[0].destination, "HK999"); // 未知コードがそのままフォールバック
  assert.equal(result[0].vehicleNumber, "");
  assert.equal(result[0].orderLabel, "先発");
  assert.ok(result[0].locationDescription.length > 0);
});

test("Edge Cases: 堺筋線以外の線区コードが混入した場合 (例: 御堂筋線 M15)", () => {
  const rawList = [
    {
      directionId: "A",
      fromStationCode: "M15",
      toStationCode: "M14",
      progress: "1.0",
      terminalStationCode: "M11",
      vehicleNumber: "21601"
    }
  ];

  const result = filterAndSortKitahamaTrains(rawList, "A");
  assert.equal(result.length, 0); // Kコード以外はスキップされること
});

test("Edge Cases: 同一駅に複数列車がいる場合の安定ソート", () => {
  const rawList = [
    {
      directionId: "A",
      fromStationCode: "K20",
      toStationCode: "",
      progress: "0",
      terminalStationCode: "HK95",
      vehicleNumber: "66601"
    },
    {
      directionId: "A",
      fromStationCode: "K20",
      toStationCode: "",
      progress: "0",
      terminalStationCode: "HK72",
      vehicleNumber: "66602"
    }
  ];

  const result = filterAndSortKitahamaTrains(rawList, "A");
  assert.equal(result.length, 2);
  assert.equal(result[0].orderLabel, "先発");
  assert.equal(result[1].orderLabel, "次発");
});
