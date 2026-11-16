import test from "node:test";
import assert from "node:assert/strict";
import { processAllSakaisujiTrains, identifyTrainType } from "../lib/train-tracker.js";

test("identifyTrainType: 車番からの所属と形式判別", () => {
  const metroTrain = identifyTrainType("66601");
  assert.equal(metroTrain.company, "Osaka Metro");
  assert.equal(metroTrain.series, "66系");
  assert.equal(metroTrain.isHankyu, false);

  const hankyu1300 = identifyTrainType("1303");
  assert.equal(hankyu1300.company, "阪急電鉄");
  assert.equal(hankyu1300.series, "1300系");
  assert.equal(hankyu1300.isHankyu, true);

  const hankyu8300 = identifyTrainType("8332");
  assert.equal(hankyu8300.company, "阪急電鉄");
  assert.equal(hankyu8300.series, "8300系");
});

test("processAllSakaisujiTrains: 駅停車中 vs 駅間3スロット (出発直後・走行中・停車寸前)", () => {
  const rawList = [
    // 1. 北浜(K14) 停車中
    {
      directionId: "A",
      fromStationCode: "K14",
      toStationCode: "",
      progress: "0",
      terminalStationCode: "HK66",
      vehicleNumber: "66601"
    },
    // 2. 堺筋本町(K15) 出発直後 (progress: 2.0 だが出発側または接近側)
    // 3. 長堀橋(K16) -> 堺筋本町(K15) 走行中 (progress: 1.0)
    {
      directionId: "A",
      fromStationCode: "K16",
      toStationCode: "K15",
      progress: "1.0",
      terminalStationCode: "HK72",
      vehicleNumber: "1303"
    },
    // 4. 日本橋(K17) -> 長堀橋(K16) 停車寸前 (progress: 2.0)
    {
      directionId: "A",
      fromStationCode: "K17",
      toStationCode: "K16",
      progress: "2.0",
      terminalStationCode: "HK95",
      vehicleNumber: "7322"
    }
  ];

  const result = processAllSakaisujiTrains(rawList, "A");
  assert.equal(result.length, 3);

  // 北浜停車中
  const t1 = result.find(t => t.vehicleNumber === "66601");
  assert.equal(t1.slotType, "STATION");
  assert.equal(t1.atStationCode, "K14");
  assert.equal(t1.isAtKitahama, true);

  // 長堀橋 -> 堺筋本町 走行中
  const t2 = result.find(t => t.vehicleNumber === "1303");
  assert.equal(t2.slotType, "BETWEEN");
  assert.equal(t2.subPosition, "RUNNING");
  assert.equal(t2.betweenSection.from, "K16");
  assert.equal(t2.betweenSection.to, "K15");

  // 日本橋 -> 長堀橋 接近中
  const t3 = result.find(t => t.vehicleNumber === "7322");
  assert.equal(t3.slotType, "BETWEEN");
  assert.equal(t3.subPosition, "APPROACHING");
});
