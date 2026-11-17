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
 * サーバー側で走行中・停車中になってからの経過秒数を追跡・カウントし、
 * 直前1本・3本平均の実績および北浜最終停車までの所要時間を予測するクラス
 */
export class TrainStateTracker {
  constructor() {
    // vehicleNumber -> { status: "STOPPED"|"RUNNING", locationKey: string, since: number, lastSeen: number }
    this.trainStates = new Map();
    // locationKey -> [durationSec1, durationSec2, ...] (最新順に記録)
    this.durationHistory = new Map();

    // 堺筋線の標準的な実績所要時間（履歴がまだ少ない場合の初期ベース値）
    this.defaultDurations = {
      "STOPPED:K16": 30,         // 長堀橋 停車
      "RUNNING:K16->K15": 75,    // 長堀橋 -> 堺筋本町 走行
      "STOPPED:K15": 35,         // 堺筋本町 停車
      "RUNNING:K15->K14": 75,    // 堺筋本町 -> 北浜 走行
      "STOPPED:K14": 30,         // 北浜 停車
      "RUNNING:K14->K15": 75,    // 北浜 -> 堺筋本町 走行
      "RUNNING:K15->K16": 75     // 堺筋本町 -> 長堀橋 走行
    };
  }

  /**
   * ある状態（ロケーション）の直前1本と3本平均の実績所要秒数を取得
   * @param {string} locationKey
   * @returns {{ last: number, avg3: number }}
   */
  getDurationStats(locationKey) {
    const list = this.durationHistory.get(locationKey) || [];
    const fallback = this.defaultDurations[locationKey] || 60;

    const last = list.length >= 1 ? list[0] : fallback;

    let avg3 = fallback;
    if (list.length >= 3) {
      avg3 = Math.round(list.slice(0, 3).reduce((a, b) => a + b, 0) / 3);
    } else if (list.length > 0) {
      avg3 = Math.round(list.reduce((a, b) => a + b, 0) / list.length);
    }

    return { last, avg3 };
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
   * 北浜駅停車までの合計所要時間を予測計算
   * @param {string} locationKey
   * @param {string} direction "A" | "B"
   * @param {number} elapsedSeconds 現在の状態ですでに経過した秒数
   */
  calculateKitahamaArrival(locationKey, direction, elapsedSeconds) {
    if (direction === "B") {
      // 下り（天六方面 -> 北浜 -> 天下茶屋）
      if (locationKey === "STOPPED:K14") {
        return { isAtKitahama: true, isPassed: false, totalLast: 0, totalAvg3: 0 };
      }
      return { isAtKitahama: false, isPassed: true, totalLast: null, totalAvg3: null };
    }

    // 上り（天下茶屋 -> 長堀橋 -> 堺筋本町 -> 北浜）
    const statsStoppedK16 = this.getDurationStats("STOPPED:K16");
    const statsRunning16to15 = this.getDurationStats("RUNNING:K16->K15");
    const statsStoppedK15 = this.getDurationStats("STOPPED:K15");
    const statsRunning15to14 = this.getDurationStats("RUNNING:K15->K14");

    if (locationKey === "STOPPED:K16") {
      const remLast = Math.max(0, statsStoppedK16.last - elapsedSeconds);
      const remAvg3 = Math.max(0, statsStoppedK16.avg3 - elapsedSeconds);
      const postLast = statsRunning16to15.last + statsStoppedK15.last + statsRunning15to14.last;
      const postAvg3 = statsRunning16to15.avg3 + statsStoppedK15.avg3 + statsRunning15to14.avg3;
      return {
        isAtKitahama: false,
        isPassed: false,
        totalLast: remLast + postLast,
        totalAvg3: remAvg3 + postAvg3
      };
    }

    if (locationKey === "RUNNING:K16->K15") {
      const remLast = Math.max(0, statsRunning16to15.last - elapsedSeconds);
      const remAvg3 = Math.max(0, statsRunning16to15.avg3 - elapsedSeconds);
      const postLast = statsStoppedK15.last + statsRunning15to14.last;
      const postAvg3 = statsStoppedK15.avg3 + statsRunning15to14.avg3;
      return {
        isAtKitahama: false,
        isPassed: false,
        totalLast: remLast + postLast,
        totalAvg3: remAvg3 + postAvg3
      };
    }

    if (locationKey === "STOPPED:K15") {
      const remLast = Math.max(0, statsStoppedK15.last - elapsedSeconds);
      const remAvg3 = Math.max(0, statsStoppedK15.avg3 - elapsedSeconds);
      const postLast = statsRunning15to14.last;
      const postAvg3 = statsRunning15to14.avg3;
      return {
        isAtKitahama: false,
        isPassed: false,
        totalLast: remLast + postLast,
        totalAvg3: remAvg3 + postAvg3
      };
    }

    if (locationKey === "RUNNING:K15->K14") {
      const remLast = Math.max(0, statsRunning15to14.last - elapsedSeconds);
      const remAvg3 = Math.max(0, statsRunning15to14.avg3 - elapsedSeconds);
      return {
        isAtKitahama: false,
        isPassed: false,
        totalLast: remLast,
        totalAvg3: remAvg3
      };
    }

    if (locationKey === "STOPPED:K14") {
      return {
        isAtKitahama: true,
        isPassed: false,
        totalLast: 0,
        totalAvg3: 0
      };
    }

    return { isAtKitahama: false, isPassed: true, totalLast: null, totalAvg3: null };
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
      const destName = getStationName(raw.terminalStationCode);
      const typeInfo = identifyTrainType(vNum);

      // 直前1本と3本平均の実績秒数（次の状態になるまでの所要時間）
      const stats = this.getDurationStats(locationKey);
      const remainingLast = Math.max(0, stats.last - elapsedSeconds);
      const remainingAvg3 = Math.max(0, stats.avg3 - elapsedSeconds);

      // 北浜駅最終停車までの予測合計
      const kitahamaArrival = this.calculateKitahamaArrival(locationKey, dir, elapsedSeconds);

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
        // 予測データ
        prediction: {
          nextState: {
            last: stats.last,         // 直前の1本は何秒経過したら次の状態になっていたか
            avg3: stats.avg3,         // 以前の3本平均は何秒経過したら次の状態になっていたか
            remainingLast,
            remainingAvg3
          },
          kitahamaArrival             // 北浜へ最終的に停車状態になるのはいつかの合計
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
 * @returns {Array}
 */
export function filterTargetSectionTrains(trackedTrains) {
  if (!Array.isArray(trackedTrains)) return [];

  return trackedTrains.filter(t => {
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
    const destName = getStationName(raw.terminalStationCode);
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
