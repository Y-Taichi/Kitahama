import { getStationName, SAKAISUJI_ORDERED_STATIONS } from "./stations.js";

export const KITAHAMA_STATION_CODE = "K14";
export const KITAHAMA_STATION_NUM = 14;
export const SAKAISUJI_HOMMACHI_CODE = "K15";
export const NAGAHORIBASHI_CODE = "K16";
export const TARGET_STATION_CODES = new Set(["K14", "K15", "K16"]);

export const PROGRESS = {
  STOPPED: "0",        // 停車中
  RUNNING: "1.0",      // 駅間走行中
  APPROACHING: "2.0"   // 接近中・停車寸前 / 出発直後
};

/**
 * 車両番号から images 配下の画像ファイル名を決定
 * 当てはまらない、画像がない場合は 66000.png
 */
export function getTrainImageFilename(vehicleNumber) {
  const v = String(vehicleNumber || "").trim();
  if (v.startsWith("13")) return "1300.png";
  if (v.startsWith("53")) return "5300.png";
  if (v.startsWith("73")) return "7300.png";
  if (v.startsWith("83")) return "8300.png";
  if (v.startsWith("93")) return "9300.png";
  if (v.startsWith("66")) return "66000.png";
  return "66000.png";
}

/**
 * サーバー側で走行中・停車中になってからの経過秒数を追跡・カウントし、
 * 直近3本（1本前、2本前、3本前）の実績に基づく予測を算出するクラス
 */
export class TrainStateTracker {
  constructor() {
    // vehicleNumber -> { status: "STOPPED"|"RUNNING", locationKey: string, since: number, lastSeen: number }
    this.trainStates = new Map();
    // locationKey -> [durationSec1, durationSec2, durationSec3, ...] (最新順に記録)
    this.durationHistory = new Map();

    // 堺筋線のリアルな走行・停車時間（1本前、2本前、3本前で独立した妥当なシード初期値）
    // 走行時間: 約56〜62秒、停車時間: 約24〜28秒
    this.defaultHistory = {
      "STOPPED:K16": [24, 28, 25],      // 長堀橋 停車
      "RUNNING:K16->K15": [58, 62, 59], // 長堀橋 -> 堺筋本町 走行
      "STOPPED:K15": [26, 30, 28],      // 堺筋本町 停車
      "RUNNING:K15->K14": [56, 60, 58], // 堺筋本町 -> 北浜 走行
      "STOPPED:K14": [25, 28, 26],      // 北浜 停車
      "RUNNING:K14->K15": [58, 62, 60],
      "RUNNING:K15->K16": [58, 62, 60]
    };
  }

  /**
   * ある状態（ロケーション）の直近3本（1本前、2本前、3本前）の実績所要秒数を取得
   * @param {string} locationKey
   * @returns {[number, number, number]} [1本前, 2本前, 3本前]
   */
  getHistory3(locationKey) {
    const list = this.durationHistory.get(locationKey) || [];
    const defaults = this.defaultHistory[locationKey] || [25, 60, 25];

    return [
      list.length >= 1 ? list[0] : defaults[0],
      list.length >= 2 ? list[1] : defaults[1],
      list.length >= 3 ? list[2] : defaults[2]
    ];
  }

  /**
   * 過去の実績を記録
   */
  recordDuration(locationKey, durationSec) {
    if (durationSec < 5 || durationSec > 600) return; // 異常値ガード
    if (!this.durationHistory.has(locationKey)) {
      this.durationHistory.set(locationKey, []);
    }
    const list = this.durationHistory.get(locationKey);
    list.unshift(durationSec);
    if (list.length > 20) list.pop();
  }

  /**
   * 1本前、2本前、3本前の北浜駅への合計到着予想時間と、次の状態になるのに必要な予想時間を計算
   * @param {string} locationKey
   * @param {string} direction "A" | "B"
   * @param {number} elapsedSeconds 現在の状態ですでに経過した秒数
   */
  calculatePredictions(locationKey, direction, elapsedSeconds) {
    if (direction === "B") {
      const isAtKitahama = locationKey === "STOPPED:K14";
      return {
        isAtKitahama,
        prev1: { kitahamaRemaining: isAtKitahama ? 0 : null, nextStateRemaining: 0, nextStateRequired: 0 },
        prev2: { kitahamaRemaining: isAtKitahama ? 0 : null, nextStateRemaining: 0, nextStateRequired: 0 },
        prev3: { kitahamaRemaining: isAtKitahama ? 0 : null, nextStateRemaining: 0, nextStateRequired: 0 }
      };
    }

    const hStop16 = this.getHistory3("STOPPED:K16");
    const hRun16_15 = this.getHistory3("RUNNING:K16->K15");
    const hStop15 = this.getHistory3("STOPPED:K15");
    const hRun15_14 = this.getHistory3("RUNNING:K15->K14");

    const records = [0, 1, 2].map(i => {
      let kitahamaRemaining = 0;
      let nextStateRemaining = 0;
      let nextStateRequired = 0;

      if (locationKey === "STOPPED:K16") {
        nextStateRequired = hStop16[i];
        nextStateRemaining = Math.max(0, nextStateRequired - elapsedSeconds);
        kitahamaRemaining = nextStateRemaining + hRun16_15[i] + hStop15[i] + hRun15_14[i];
      } else if (locationKey === "RUNNING:K16->K15") {
        nextStateRequired = hRun16_15[i];
        nextStateRemaining = Math.max(0, nextStateRequired - elapsedSeconds);
        kitahamaRemaining = nextStateRemaining + hStop15[i] + hRun15_14[i];
      } else if (locationKey === "STOPPED:K15") {
        nextStateRequired = hStop15[i];
        nextStateRemaining = Math.max(0, nextStateRequired - elapsedSeconds);
        kitahamaRemaining = nextStateRemaining + hRun15_14[i];
      } else if (locationKey === "RUNNING:K15->K14") {
        nextStateRequired = hRun15_14[i];
        nextStateRemaining = Math.max(0, nextStateRequired - elapsedSeconds);
        kitahamaRemaining = nextStateRemaining;
      } else if (locationKey === "STOPPED:K14") {
        nextStateRequired = 0;
        nextStateRemaining = 0;
        kitahamaRemaining = 0;
      }

      return {
        kitahamaRemaining,
        nextStateRemaining,
        nextStateRequired
      };
    });

    return {
      isAtKitahama: locationKey === "STOPPED:K14",
      prev1: records[0], // 1本前
      prev2: records[1], // 2本前
      prev3: records[2]  // 3本前
    };
  }

  /**
   * 既存互換用: 北浜駅停車までの合計所要時間を予測計算
   */
  calculateKitahamaArrival(locationKey, direction, elapsedSeconds) {
    const pred = this.calculatePredictions(locationKey, direction, elapsedSeconds);
    return {
      isAtKitahama: pred.isAtKitahama,
      isPassed: direction === "B" && locationKey !== "STOPPED:K14",
      totalLast: pred.prev1.kitahamaRemaining,
      totalAvg3: Math.round((pred.prev1.kitahamaRemaining + pred.prev2.kitahamaRemaining + pred.prev3.kitahamaRemaining) / 3)
    };
  }

  /**
   * ある状態の直前1本と3本平均の実績所要秒数を取得（互換用）
   */
  getDurationStats(locationKey) {
    const h = this.getHistory3(locationKey);
    return {
      last: h[0],
      avg3: Math.round((h[0] + h[1] + h[2]) / 3)
    };
  }

  /**
   * 大阪メトロAPIの生列車リストを受け取り、状態追跡・秒数カウントおよび予測を付与した列車リストを返す
   * @param {Array} rawTrainList
   * @param {number} [currentTime]
   * @returns {Array}
   */
  process(rawTrainList, currentTime = Date.now()) {
    if (!Array.isArray(rawTrainList)) return [];

    const result = [];

    for (const raw of rawTrainList) {
      const vNum = String(raw.vehicleNumber || "").trim();
      if (!vNum) continue;

      const dir = raw.directionId || "A";
      const fromCode = raw.fromStationCode || "";
      const toCode = raw.toStationCode || "";
      const progress = String(raw.progress || "0");

      const isStopped = progress === PROGRESS.STOPPED || !toCode;
      const status = isStopped ? "STOPPED" : "RUNNING";
      const locationKey = isStopped
        ? `STOPPED:${fromCode}`
        : `RUNNING:${fromCode}->${toCode}`;

      let record = this.trainStates.get(vNum);
      if (!record || record.locationKey !== locationKey) {
        // 状態が変化した時、前回の状態の滞在時間を実績として記録！
        if (record && record.locationKey) {
          const durationSec = Math.round((currentTime - record.since) / 1000);
          this.recordDuration(record.locationKey, durationSec);
        }

        record = {
          status,
          locationKey,
          since: currentTime,
          lastSeen: currentTime
        };
        this.trainStates.set(vNum, record);
      } else {
        record.lastSeen = currentTime;
      }

      const elapsedSeconds = Math.max(0, Math.floor((currentTime - record.since) / 1000));
      const destName = getStationName(raw.terminalStationCode) || (dir === "A" ? "天神橋筋六丁目" : "天下茶屋");
      const typeInfo = identifyTrainType(vNum);

      // 直前1本と3本平均の実績秒数（次の状態になるまでの所要時間）
      const stats = this.getDurationStats(locationKey);
      const remainingLast = Math.max(0, stats.last - elapsedSeconds);
      const remainingAvg3 = Math.max(0, stats.avg3 - elapsedSeconds);

      // 北浜駅最終停車までの予測合計
      const kitahamaArrival = this.calculateKitahamaArrival(locationKey, dir, elapsedSeconds);

      // 最後のアクティビティ（例: 71秒前に長堀橋出発、10秒前に堺筋本町停車）
      let lastActivity = "";
      if (status === "STOPPED") {
        const stName = getStationName(fromCode) || "当駅";
        lastActivity = `${elapsedSeconds}秒前に${stName}停車`;
      } else {
        const depName = getStationName(fromCode) || "駅";
        lastActivity = `${elapsedSeconds}秒前に${depName}出発`;
      }

      // 1本前、2本前、3本前の個別予測データ
      const predictions = this.calculatePredictions(locationKey, dir, elapsedSeconds);
      const imageFilename = getTrainImageFilename(vNum);

      result.push({
        vehicleNumber: vNum,
        direction: dir,
        fromStationCode: fromCode,
        toStationCode: toCode,
        fromStation: getStationName(fromCode),
        toStation: getStationName(toCode),
        progress,
        status,
        locationKey,
        since: record.since,
        elapsedSeconds,
        destination: destName,
        typeInfo,
        terminalStationCode: raw.terminalStationCode,
        imageFilename,
        lastActivity,
        // 1本前、2本前、3本前の到着予想時間および次状態必要時間
        predictions,
        // 既存互換用
        prediction: {
          nextState: {
            last: stats.last,
            avg3: stats.avg3,
            remainingLast,
            remainingAvg3
          },
          kitahamaArrival
        }
      });
    }

    // 10分以上見られなくなった車両データをクリーンアップ
    const expireTime = currentTime - 10 * 60 * 1000;
    for (const [key, val] of this.trainStates.entries()) {
      if (val.lastSeen < expireTime) {
        this.trainStates.delete(key);
      }
    }

    return result;
  }
}

/**
 * 北浜(K14)、堺筋本町(K15)、長堀橋(K16)、およびその間（北浜〜堺筋本町、堺筋本町〜長堀橋）のみを抽出
 * @param {Array} trackedTrains
 * @param {string|null} [targetDirection] "A" (上り/天六方面) または "B" (下り/天下茶屋方面)
 * @returns {Array}
 */
export function filterTargetSectionTrains(trackedTrains, targetDirection = null) {
  if (!Array.isArray(trackedTrains)) return [];

  return trackedTrains.filter(t => {
    if (targetDirection && t.direction !== targetDirection) {
      return false;
    }

    // 1. 停車中: 北浜(K14), 堺筋本町(K15), 長堀橋(K16) のみ
    if (t.status === "STOPPED") {
      return TARGET_STATION_CODES.has(t.fromStationCode);
    }

    // 2. 走行中: 北浜〜堺筋本町、堺筋本町〜長堀橋 のみ
    if (t.status === "RUNNING") {
      const from = t.fromStationCode;
      const to = t.toStationCode;

      if (t.direction === "A") {
        // 上り: 長堀橋(K16) -> 堺筋本町(K15) または 堺筋本町(K15) -> 北浜(K14)
        return (from === "K16" && to === "K15") || (from === "K15" && to === "K14");
      }

      if (t.direction === "B") {
        // 下り: 北浜(K14) -> 堺筋本町(K15) または 堺筋本町(K15) -> 長堀橋(K16)
        return (from === "K14" && to === "K15") || (from === "K15" && to === "K16");
      }
    }

    return false;
  });
}


/**
 * 車両番号から所属会社と形式を判定
 * @param {string} vNum
 * @returns {{ company: string, series: string, color: string }}
 */
export function identifyTrainType(vNum) {
  if (!vNum) {
    return { company: "Osaka Metro", series: "堺筋線 車両", color: "#81472C" };
  }

  const str = String(vNum).trim();

  // Osaka Metro 66系 (66601〜66617など)
  if (str.startsWith("66")) {
    return {
      company: "Osaka Metro",
      series: "66系",
      color: "#81472C", // 堺筋線ブラウン
      isHankyu: false
    };
  }

  // 阪急電鉄 直通車両 (1300系, 3300系, 5300系, 7300系, 8300系, 9300系など)
  let series = "直通車";
  if (str.startsWith("13")) series = "1300系";
  else if (str.startsWith("33")) series = "3300系";
  else if (str.startsWith("53")) series = "5300系";
  else if (str.startsWith("73")) series = "7300系";
  else if (str.startsWith("83")) series = "8300系";
  else if (str.startsWith("93")) series = "9300系";

  return {
    company: "阪急電鉄",
    series: series,
    color: "#5C061F", // 阪急マルーン
    isHankyu: true
  };
}

/**
 * 混雑度テキスト変換
 * @param {string} congestionCsv カンマ区切り
 * @returns {Array<{ car: number, level: number, text: string }>}
 */
export function parseCongestion(congestionCsv) {
  if (!congestionCsv) return [];
  const labels = ["", "空席あり", "ゆったり立てる", "やや混雑", "混雑", "大変混雑"];
  return congestionCsv.split(",").map((v, i) => {
    const lvl = parseInt(v, 10) || 0;
    return {
      car: i + 1,
      level: lvl,
      text: labels[lvl] || ""
    };
  });
}

/**
 * 車内温度パース
 * @param {string} tempCsv カンマ区切り
 * @returns {Array<{ car: number, temp: number }>}
 */
export function parseTemperature(tempCsv) {
  if (!tempCsv) return [];
  return tempCsv.split(",").map((v, i) => ({
    car: i + 1,
    temp: parseFloat(v) || null
  }));
}

/**
 * 堺筋線の全列車をトラック・路線図形式で配置可能なデータ構造に変換
 * @param {Array} rawTrainList APIレスポンスの trainLocationList
 * @param {"A" | "B"} targetDirection "A": 天神橋筋六丁目・阪急方面 (上り), "B": 天下茶屋方面 (下り)
 * @returns {Array} 処理済みの全列車リスト
 */
export function processAllSakaisujiTrains(rawTrainList, targetDirection = "A") {
  if (!Array.isArray(rawTrainList)) return [];

  const trains = [];

  for (const raw of rawTrainList) {
    if (raw.directionId !== targetDirection) continue;

    const fromCode = raw.fromStationCode || "";
    const toCode = raw.toStationCode || "";
    const progress = raw.progress || PROGRESS.STOPPED;

    const fromNum = parseStationNumber(fromCode);
    if (fromNum === null) continue;

    const fromName = getStationName(fromCode);
    const toName = getStationName(toCode);
    const destName = getStationName(raw.terminalStationCode) || (targetDirection === "A" ? "天神橋筋六丁目" : "天下茶屋");
    const typeInfo = identifyTrainType(raw.vehicleNumber);

    // スロット位置（駅停車、駅間出発直後、駅間走行中、駅間停車寸前）の計算
    let slotType = "STATION"; // "STATION" or "BETWEEN"
    let subPosition = "STOPPED"; // "STOPPED", "DEPARTED", "RUNNING", "APPROACHING"
    let betweenSection = null; // 例: { from: "K15", to: "K14", fromName: "堺筋本町", toName: "北浜" }
    let atStationCode = null;
    let locationDescription = "";
    let distanceLabel = "";
    let isAtKitahama = false;
    let distanceScore = 0;

    if (progress === PROGRESS.STOPPED || !toCode) {
      slotType = "STATION";
      subPosition = "STOPPED";
      atStationCode = fromCode;
      locationDescription = `${fromName} に停車中`;
      if (fromCode === KITAHAMA_STATION_CODE) {
        isAtKitahama = true;
        distanceLabel = "当駅停車中";
      }
    } else {
      slotType = "BETWEEN";
      betweenSection = {
        from: fromCode,
        to: toCode,
        fromName,
        toName
      };

      if (progress === PROGRESS.APPROACHING) {
        subPosition = "APPROACHING"; // 次駅に接近・停車寸前
        locationDescription = `${toName} に停車寸前（接近中）`;
        distanceLabel = toCode === KITAHAMA_STATION_CODE ? "まもなく到着" : `${toName} 接近`;
      } else if (progress === PROGRESS.RUNNING) {
        subPosition = "RUNNING"; // 中間走行中
        locationDescription = `${fromName} → ${toName} 走行中`;
        distanceLabel = toCode === KITAHAMA_STATION_CODE ? "次駅接近" : "駅間走行中";
      } else {
        subPosition = "DEPARTED"; // 出発直後
        locationDescription = `${fromName} を出発直後`;
        distanceLabel = `${fromName} 出発直後`;
      }
    }

    // 北浜駅との距離スコア（ソート用）
    if (targetDirection === "A") {
      // 上り (K20 -> K11)
      const diff = fromNum - KITAHAMA_NUM;
      const offset = subPosition === "APPROACHING" ? 0.7 : subPosition === "RUNNING" ? 0.4 : subPosition === "DEPARTED" ? 0.2 : 0;
      distanceScore = diff - offset;

      if (!distanceLabel) {
        if (diff === 1) distanceLabel = "1駅手前";
        else if (diff > 1) distanceLabel = `約${diff}駅手前`;
        else if (diff < 0) distanceLabel = `北浜通過済み`;
      }
    } else {
      // 下り (K11 -> K20)
      const diff = KITAHAMA_NUM - fromNum;
      const offset = subPosition === "APPROACHING" ? 0.7 : subPosition === "RUNNING" ? 0.4 : subPosition === "DEPARTED" ? 0.2 : 0;
      distanceScore = diff - offset;

      if (!distanceLabel) {
        if (diff === 1) distanceLabel = "1駅手前";
        else if (diff > 1) distanceLabel = `約${diff}駅手前`;
        else if (diff < 0) distanceLabel = `北浜通過済み`;
      }
    }

    trains.push({
      vehicleNumber: raw.vehicleNumber || "",
      destination: destName,
      terminalStationCode: raw.terminalStationCode,
      fromStationCode: fromCode,
      toStationCode: toCode,
      fromStation: fromName,
      toStation: toName,
      progress,
      slotType,
      subPosition,
      betweenSection,
      atStationCode,
      distanceScore,
      distanceLabel,
      locationDescription,
      isAtKitahama,
      typeInfo,
      congestion: parseCongestion(raw.trainCarCongestionList),
      temperature: parseTemperature(raw.trainCarTemperatureList),
      delay: raw.sameAs || null
    });
  }

  // 北浜に近い順にソート
  trains.sort((a, b) => {
    // 北浜手前〜当駅の電車を優先
    const aValid = a.distanceScore >= -0.1 ? 0 : 1;
    const bValid = b.distanceScore >= -0.1 ? 0 : 1;
    if (aValid !== bValid) return aValid - bValid;
    return a.distanceScore - b.distanceScore;
  });

  return trains;
}

/**
 * 互換性のための既存関数（北浜駅接近列車フィルター）
 */
export function filterAndSortKitahamaTrains(rawTrainList, targetDirection = "A") {
  const allTrains = processAllSakaisujiTrains(rawTrainList, targetDirection);
  
  // 北浜手前または当駅の電車のみ抽出
  const kitahamaApproaching = allTrains.filter(t => {
    if (t.isAtKitahama) return true;
    return t.distanceScore > 0;
  });

  return kitahamaApproaching.map((t, index) => {
    let orderLabel = "";
    if (index === 0) orderLabel = t.isAtKitahama ? "当駅停車" : "先発";
    else if (index === 1) orderLabel = "次発";
    else if (index === 2) orderLabel = "次々発";
    else orderLabel = `${index + 1}番目`;

    return {
      order: index + 1,
      orderLabel,
      ...t
    };
  });
}

const KITAHAMA_NUM = KITAHAMA_STATION_NUM;

function parseStationNumber(code) {
  if (!code || typeof code !== "string") return null;
  const match = code.match(/^K(\d+)$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}
