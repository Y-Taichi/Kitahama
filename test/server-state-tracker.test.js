import test from "node:test";
import assert from "node:assert/strict";
import { TrainStateTracker, filterTargetSectionTrains } from "../lib/train-tracker.js";

test("TrainStateTracker: 初回検知と状態維持での経過秒数カウント", () => {
  const tracker = new TrainStateTracker();
  const t0 = 1700000000000;

  // 1. 初回: 北浜(K14)に停車中の列車
  const list1 = [
    {
      directionId: "A",
      fromStationCode: "K14",
      toStationCode: "",
      progress: "0",
      terminalStationCode: "HK95",
      vehicleNumber: "66601"
    }
  ];

  const res1 = tracker.process(list1, t0);
  assert.equal(res1.length, 1);
  assert.equal(res1[0].vehicleNumber, "66601");
  assert.equal(res1[0].status, "STOPPED");
  assert.equal(res1[0].elapsedSeconds, 0);

  // 2. 15秒後: まだ北浜に停車中
  const t1 = t0 + 15000;
  const res2 = tracker.process(list1, t1);
  assert.equal(res2.length, 1);
  assert.equal(res2[0].status, "STOPPED");
  assert.equal(res2[0].elapsedSeconds, 15);

  // 3. 30秒後: 北浜を出発し、南森町(K13)へ走行中 (状態変化！)
  const t2 = t0 + 30000;
  const list2 = [
    {
      directionId: "A",
      fromStationCode: "K14",
      toStationCode: "K13",
      progress: "1.0",
      terminalStationCode: "HK95",
      vehicleNumber: "66601"
    }
  ];
  const res3 = tracker.process(list2, t2);
  assert.equal(res3.length, 1);
  assert.equal(res3[0].status, "RUNNING");
  assert.equal(res3[0].elapsedSeconds, 0, "状態変化直後は0秒にリセットされる");

  // 4. その20秒後 (t0 + 50秒): まだ走行中
  const t3 = t2 + 20000;
  const res4 = tracker.process(list2, t3);
  assert.equal(res4.length, 1);
  assert.equal(res4[0].status, "RUNNING");
  assert.equal(res4[0].elapsedSeconds, 20);
});

test("filterTargetSectionTrains: 北浜・堺筋本町・長堀橋およびその間のみ抽出", () => {
  const tracker = new TrainStateTracker();
  const now = Date.now();

  const mockList = [
    // 1. 北浜(K14) 停車中 -> 対象
    {
      directionId: "A",
      fromStationCode: "K14",
      toStationCode: "",
      progress: "0",
      terminalStationCode: "HK95",
      vehicleNumber: "66601"
    },
    // 2. 堺筋本町(K15) -> 北浜(K14) 走行中 (上り) -> 対象
    {
      directionId: "A",
      fromStationCode: "K15",
      toStationCode: "K14",
      progress: "1.0",
      terminalStationCode: "HK72",
      vehicleNumber: "1301"
    },
    // 3. 堺筋本町(K15) 停車中 (下り) -> 対象
    {
      directionId: "B",
      fromStationCode: "K15",
      toStationCode: "",
      progress: "0",
      terminalStationCode: "K20",
      vehicleNumber: "66602"
    },
    // 4. 堺筋本町(K15) -> 長堀橋(K16) 走行中 (下り) -> 対象
    {
      directionId: "B",
      fromStationCode: "K15",
      toStationCode: "K16",
      progress: "1.0",
      terminalStationCode: "K20",
      vehicleNumber: "7301"
    },
    // 5. 長堀橋(K16) 停車中 -> 対象
    {
      directionId: "B",
      fromStationCode: "K16",
      toStationCode: "",
      progress: "0",
      terminalStationCode: "K20",
      vehicleNumber: "8301"
    },
    // 6. 天神橋筋六丁目(K11) 停車中 -> 対象外！
    {
      directionId: "B",
      fromStationCode: "K11",
      toStationCode: "",
      progress: "0",
      terminalStationCode: "K20",
      vehicleNumber: "9301"
    },
    // 7. 南森町(K13) -> 北浜(K14) 走行中 -> 対象外！（北浜より北）
    {
      directionId: "B",
      fromStationCode: "K13",
      toStationCode: "K14",
      progress: "1.0",
      terminalStationCode: "K20",
      vehicleNumber: "9302"
    },
    // 8. 日本橋(K17) 停車中 -> 対象外！
    {
      directionId: "A",
      fromStationCode: "K17",
      toStationCode: "",
      progress: "0",
      terminalStationCode: "HK95",
      vehicleNumber: "3301"
    },
    // 9. 日本橋(K17) -> 長堀橋(K16) 走行中 -> 対象外！（長堀橋より南）
    {
      directionId: "A",
      fromStationCode: "K17",
      toStationCode: "K16",
      progress: "1.0",
      terminalStationCode: "HK95",
      vehicleNumber: "3302"
    }
  ];

  const processed = tracker.process(mockList, now);
  const filtered = filterTargetSectionTrains(processed);

  assert.equal(filtered.length, 5);
  const vNums = filtered.map(t => t.vehicleNumber).sort();
  assert.deepEqual(vNums, ["1301", "66601", "66602", "7301", "8301"]);
});

test("TrainStateTracker: 状態遷移の履歴蓄積、直前1本・3本平均、および北浜停車予測の計算", () => {
  const tracker = new TrainStateTracker();
  let time = 1700000000000;

  // 1本目の電車: 長堀橋停車(30秒) -> 堺筋本町へ走行(70秒) -> 堺筋本町停車(40秒) -> 北浜へ走行(80秒) -> 北浜停車
  tracker.process([{ directionId: "A", fromStationCode: "K16", toStationCode: "", progress: "0", vehicleNumber: "1001" }], time);
  time += 30000;
  tracker.process([{ directionId: "A", fromStationCode: "K16", toStationCode: "K15", progress: "1.0", vehicleNumber: "1001" }], time);
  time += 70000;
  tracker.process([{ directionId: "A", fromStationCode: "K15", toStationCode: "", progress: "0", vehicleNumber: "1001" }], time);
  time += 40000;
  tracker.process([{ directionId: "A", fromStationCode: "K15", toStationCode: "K14", progress: "1.0", vehicleNumber: "1001" }], time);
  time += 80000;
  tracker.process([{ directionId: "A", fromStationCode: "K14", toStationCode: "", progress: "0", vehicleNumber: "1001" }], time);

  // 2本目の電車: 長堀橋停車(34秒)
  time += 5000;
  tracker.process([{ directionId: "A", fromStationCode: "K16", toStationCode: "", progress: "0", vehicleNumber: "1002" }], time);
  time += 34000;
  tracker.process([{ directionId: "A", fromStationCode: "K16", toStationCode: "K15", progress: "1.0", vehicleNumber: "1002" }], time);

  // 3本目の電車: 長堀橋停車(26秒)
  time += 5000;
  tracker.process([{ directionId: "A", fromStationCode: "K16", toStationCode: "", progress: "0", vehicleNumber: "1003" }], time);
  time += 26000;
  tracker.process([{ directionId: "A", fromStationCode: "K16", toStationCode: "K15", progress: "1.0", vehicleNumber: "1003" }], time);

  // これで "STOPPED:K16" には 26秒 (直前), 34秒, 30秒 の3件の履歴がある！
  const statsK16 = tracker.getDurationStats("STOPPED:K16");
  assert.equal(statsK16.last, 26, "直前の1本の実績");
  assert.equal(statsK16.avg3, 30, "3本の平均: (26 + 34 + 30) / 3 = 30");

  // 4本目の電車が長堀橋に停車中（10秒経過時点）での予測チェック
  time += 10000;
  const currentTrains = [
    {
      directionId: "A",
      fromStationCode: "K16",
      toStationCode: "",
      progress: "0",
      terminalStationCode: "HK95",
      vehicleNumber: "1004"
    }
  ];
  // 10秒経過
  tracker.process(currentTrains, time - 10000);
  const result = tracker.process(currentTrains, time);
  assert.equal(result.length, 1);
  const t = result[0];
  assert.equal(t.elapsedSeconds, 10);

  // 次の状態（長堀橋〜堺筋本町走行）になるまでの実績
  assert.equal(t.prediction.nextState.last, 26);
  assert.equal(t.prediction.nextState.avg3, 30);
  assert.equal(t.prediction.nextState.remainingLast, 16); // 26 - 10
  assert.equal(t.prediction.nextState.remainingAvg3, 20); // 30 - 10

  // 北浜へ最終的に停車状態になるまでの合計
  // 直前基準: 残り16s + 走行70s + 停車40s + 走行80s = 206s
  assert.equal(t.prediction.kitahamaArrival.totalLast, 206);
  // 3本平均基準: 残り20s + 走行70s(1件平均) + 停車40s(1件平均) + 走行80s(1件平均) = 210s
  assert.equal(t.prediction.kitahamaArrival.totalAvg3, 210);
});
