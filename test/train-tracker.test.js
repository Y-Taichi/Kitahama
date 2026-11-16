import test from "node:test";
import assert from "node:assert/strict";
import { filterAndSortKitahamaTrains } from "../lib/train-tracker.js";
import { getStationName } from "../lib/stations.js";

test("getStationName: 堺筋線および阪急線の駅名解決", () => {
  assert.equal(getStationName("K14"), "北浜");
  assert.equal(getStationName("K11"), "天神橋筋六丁目");
  assert.equal(getStationName("K20"), "天下茶屋");
  assert.equal(getStationName("HK95"), "北千里");
  assert.equal(getStationName("HK72"), "高槻市");
  assert.equal(getStationName("HK86"), "京都河原町");
  assert.equal(getStationName("HK69"), "茨木市");
  // 未知コード
  assert.equal(getStationName("UNKNOWN_CODE"), "UNKNOWN_CODE");
  assert.equal(getStationName(""), "");
});

test("filterAndSortKitahamaTrains: 空配列・不正値への防御", () => {
  assert.deepEqual(filterAndSortKitahamaTrains([]), []);
  assert.deepEqual(filterAndSortKitahamaTrains(null), []);
  assert.deepEqual(filterAndSortKitahamaTrains(undefined), []);
  assert.deepEqual(filterAndSortKitahamaTrains("invalid"), []);
});

test("filterAndSortKitahamaTrains (上り・天六方面): 北浜駅停車中の電車", () => {
  const rawList = [
    {
      directionId: "A",
      fromStationCode: "K14",
      toStationCode: "",
      progress: "0",
      terminalStationCode: "HK95",
      vehicleNumber: "66601"
    }
  ];

  const result = filterAndSortKitahamaTrains(rawList, "A");
  assert.equal(result.length, 1);
  assert.equal(result[0].destination, "北千里");
  assert.equal(result[0].isAtKitahama, true);
  assert.equal(result[0].distanceLabel, "当駅停車中");
  assert.equal(result[0].orderLabel, "当駅停車");
  assert.equal(result[0].distanceScore, 0.0);
});

test("filterAndSortKitahamaTrains (上り・天六方面): 北浜駅を出発済みの電車は除外される", () => {
  const rawList = [
    // 北浜を出て南森町(K13)へ走行中
    {
      directionId: "A",
      fromStationCode: "K14",
      toStationCode: "K13",
      progress: "1.0",
      terminalStationCode: "HK72",
      vehicleNumber: "7301"
    },
    // すでに南森町(K13)に停車中
    {
      directionId: "A",
      fromStationCode: "K13",
      toStationCode: "",
      progress: "0",
      terminalStationCode: "HK72",
      vehicleNumber: "7302"
    }
  ];

  const result = filterAndSortKitahamaTrains(rawList, "A");
  assert.equal(result.length, 0); // 北浜からは乗れないため0件
});

test("filterAndSortKitahamaTrains (上り・天六方面): 接近電車の順序ソート検証", () => {
  const rawList = [
    // 3駅手前: 日本橋(K17) 停車中 (score: 3 - 0 = 3.0)
    {
      directionId: "A",
      fromStationCode: "K17",
      toStationCode: "",
      progress: "0",
      terminalStationCode: "K11",
      vehicleNumber: "1003"
    },
    // 1駅手前: 堺筋本町(K15) -> 北浜(K14) 走行中 (score: 1 - 0.4 = 0.6)
    {
      directionId: "A",
      fromStationCode: "K15",
      toStationCode: "K14",
      progress: "1.0",
      terminalStationCode: "HK69",
      vehicleNumber: "1001"
    },
    // 2駅手前: 長堀橋(K16) 停車中 (score: 2 - 0 = 2.0)
    {
      directionId: "A",
      fromStationCode: "K16",
      toStationCode: "",
      progress: "0",
      terminalStationCode: "HK95",
      vehicleNumber: "1002"
    },
    // 1駅手前: 堺筋本町(K15) 接近中 (score: 1 - 0.7 = 0.3)
    {
      directionId: "A",
      fromStationCode: "K15",
      toStationCode: "K14",
      progress: "2.0",
      terminalStationCode: "HK72",
      vehicleNumber: "1000"
    },
    // 反対方向（下り）の電車（混ざっていても無視されること）
    {
      directionId: "B",
      fromStationCode: "K12",
      toStationCode: "K13",
      progress: "1.0",
      terminalStationCode: "K20",
      vehicleNumber: "2000"
    }
  ];

  const result = filterAndSortKitahamaTrains(rawList, "A");

  assert.equal(result.length, 4);

  // 1番目: 1000 (堺筋本町接近中, score: 0.3)
  assert.equal(result[0].vehicleNumber, "1000");
  assert.equal(result[0].destination, "高槻市");
  assert.equal(result[0].orderLabel, "先発");
  assert.equal(result[0].distanceLabel, "まもなく到着");

  // 2番目: 1001 (堺筋本町走行中, score: 0.6)
  assert.equal(result[1].vehicleNumber, "1001");
  assert.equal(result[1].destination, "茨木市");
  assert.equal(result[1].orderLabel, "次発");
  assert.equal(result[1].distanceLabel, "次駅接近");

  // 3番目: 1002 (長堀橋停車中, score: 2.0)
  assert.equal(result[2].vehicleNumber, "1002");
  assert.equal(result[2].destination, "北千里");
  assert.equal(result[2].orderLabel, "次々発");

  // 4番目: 1003 (日本橋停車中, score: 3.0)
  assert.equal(result[3].vehicleNumber, "1003");
  assert.equal(result[3].orderLabel, "4番目");
});

test("filterAndSortKitahamaTrains (下り・天下茶屋方面): 判定とソート検証", () => {
  const rawList = [
    // 北浜停車中 (score: 0.0)
    {
      directionId: "B",
      fromStationCode: "K14",
      toStationCode: "",
      progress: "0",
      terminalStationCode: "K20",
      vehicleNumber: "66610"
    },
    // 南森町(K13) 停車中 (score: 1.0)
    {
      directionId: "B",
      fromStationCode: "K13",
      toStationCode: "",
      progress: "0",
      terminalStationCode: "K20",
      vehicleNumber: "66611"
    },
    // 通過済み: 堺筋本町(K15) にいる下り電車 (除外されること)
    {
      directionId: "B",
      fromStationCode: "K15",
      toStationCode: "",
      progress: "0",
      terminalStationCode: "K20",
      vehicleNumber: "66612"
    }
  ];

  const result = filterAndSortKitahamaTrains(rawList, "B");

  assert.equal(result.length, 2);
  assert.equal(result[0].vehicleNumber, "66610");
  assert.equal(result[0].isAtKitahama, true);
  assert.equal(result[0].orderLabel, "当駅停車");

  assert.equal(result[1].vehicleNumber, "66611");
  assert.equal(result[1].orderLabel, "次発");
  assert.equal(result[1].distanceLabel, "1駅手前");
});
