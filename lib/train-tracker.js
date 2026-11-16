import { getStationName, SAKAISUJI_ORDERED_STATIONS } from "./stations.js";

export const KITAHAMA_STATION_CODE = "K14";
export const KITAHAMA_STATION_NUM = 14;

export const PROGRESS = {
  STOPPED: "0",        // 停車中
  RUNNING: "1.0",      // 駅間走行中
  APPROACHING: "2.0"   // 接近中・停車寸前 / 出発直後
};

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
