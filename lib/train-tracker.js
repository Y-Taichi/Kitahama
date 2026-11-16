import { getStationName } from "./stations.js";

export const KITAHAMA_STATION_CODE = "K14";
export const KITAHAMA_STATION_NUM = 14;

/**
 * 進行状況 (progress)
 * "0": 停車中
 * "1.0": 駅間走行中
 * "2.0": 次駅接近 / 出発直後
 */
export const PROGRESS = {
  STOPPED: "0",
  RUNNING: "1.0",
  APPROACHING: "2.0"
};

/**
 * 大阪メトロ列車生データから北浜駅向けの接近列車一覧を抽出・計算する
 * @param {Array} rawTrainList APIレスポンスの trainLocationList
 * @param {"A" | "B"} targetDirection "A": 天神橋筋六丁目・阪急方面 (上り), "B": 天下茶屋方面 (下り)
 * @returns {Array} 北浜駅に近い順にソートされた列車情報リスト
 */
export function filterAndSortKitahamaTrains(rawTrainList, targetDirection = "A") {
  if (!Array.isArray(rawTrainList)) return [];

  const trains = [];

  for (const raw of rawTrainList) {
    if (raw.directionId !== targetDirection) continue;

    const fromCode = raw.fromStationCode || "";
    const toCode = raw.toStationCode || "";
    const progress = raw.progress || PROGRESS.STOPPED;

    // K11〜K20 以外のコードは堺筋線外（直通先等）の可能性があるためチェック
    const fromNum = parseStationNumber(fromCode);
    if (fromNum === null) continue;

    let distanceScore = null;
    let locationDescription = "";
    let distanceLabel = "";
    let isAtKitahama = false;

    const fromName = getStationName(fromCode);
    const toName = getStationName(toCode);
    const destName = getStationName(raw.terminalStationCode);

    if (targetDirection === "A") {
      // 上り（天神橋筋六丁目・阪急方面）：K20(南) -> K11(北)
      // 北浜(K14)より手前にいるのは fromNum >= 14
      if (fromNum < KITAHAMA_NUM) {
        // すでに北浜を北へ通過した電車は除外
        continue;
      }

      const diff = fromNum - KITAHAMA_NUM; // 0なら北浜、1なら堺筋本町...

      if (diff === 0) {
        if (progress === PROGRESS.STOPPED) {
          // 北浜に停車中（乗車可能）
          distanceScore = 0.0;
          locationDescription = "当駅（北浜）に停車中";
          distanceLabel = "当駅停車中";
          isAtKitahama = true;
        } else {
          // 北浜を出発して南森町(K13)へ向かっているため乗車不可
          continue;
        }
      } else {
        // diff >= 1 (1駅以上手前)
        let offset = 0.0;
        if (progress === PROGRESS.APPROACHING) {
          offset = 0.7; // 次駅に接近
        } else if (progress === PROGRESS.RUNNING) {
          offset = 0.4; // 走行中
        }

        distanceScore = diff - offset;

        if (diff === 1) {
          // 堺筋本町(K15)
          if (progress === PROGRESS.APPROACHING) {
            locationDescription = "北浜駅にまもなく到着";
            distanceLabel = "まもなく到着";
          } else if (progress === PROGRESS.RUNNING) {
            locationDescription = "堺筋本町を出発（次は北浜）";
            distanceLabel = "次駅接近";
          } else {
            locationDescription = "堺筋本町に停車中";
            distanceLabel = "1駅手前";
          }
        } else {
          // 2駅以上手前 (長堀橋〜天下茶屋)
          if (progress === PROGRESS.RUNNING && toName) {
            locationDescription = `${fromName} → ${toName} 走行中`;
          } else if (progress === PROGRESS.APPROACHING && toName) {
            locationDescription = `${toName} に接近中`;
          } else {
            locationDescription = `${fromName} に停車中`;
          }
          distanceLabel = `約${diff}駅手前`;
        }
      }
    } else {
      // 下り（天下茶屋方面）：K11(北) -> K20(南)
      // 北浜(K14)より手前にいるのは fromNum <= 14
      if (fromNum > KITAHAMA_NUM) {
        // すでに北浜を南へ通過した電車は除外
        continue;
      }

      const diff = KITAHAMA_NUM - fromNum; // 0なら北浜、1なら南森町...

      if (diff === 0) {
        if (progress === PROGRESS.STOPPED) {
          distanceScore = 0.0;
          locationDescription = "当駅（北浜）に停車中";
          distanceLabel = "当駅停車中";
          isAtKitahama = true;
        } else {
          // 北浜を出発して堺筋本町へ向かっているため乗車不可
          continue;
        }
      } else {
        let offset = 0.0;
        if (progress === PROGRESS.APPROACHING) {
          offset = 0.7;
        } else if (progress === PROGRESS.RUNNING) {
          offset = 0.4;
        }

        distanceScore = diff - offset;

        if (diff === 1) {
          // 南森町(K13)
          if (progress === PROGRESS.APPROACHING) {
            locationDescription = "北浜駅にまもなく到着";
            distanceLabel = "まもなく到着";
          } else if (progress === PROGRESS.RUNNING) {
            locationDescription = "南森町を出発（次は北浜）";
            distanceLabel = "次駅接近";
          } else {
            locationDescription = "南森町に停車中";
            distanceLabel = "1駅手前";
          }
        } else {
          if (progress === PROGRESS.RUNNING && toName) {
            locationDescription = `${fromName} → ${toName} 走行中`;
          } else if (progress === PROGRESS.APPROACHING && toName) {
            locationDescription = `${toName} に接近中`;
          } else {
            locationDescription = `${fromName} に停車中`;
          }
          distanceLabel = `約${diff}駅手前`;
        }
      }
    }

    trains.push({
      vehicleNumber: raw.vehicleNumber || "",
      destination: destName,
      terminalStationCode: raw.terminalStationCode,
      fromStation: fromName,
      toStation: toName,
      progress,
      distanceScore,
      distanceLabel,
      locationDescription,
      isAtKitahama
    });
  }

  // 北浜駅に近い順 (distanceScore昇順) にソート
  trains.sort((a, b) => a.distanceScore - b.distanceScore);

  // 順番ラベルを付与（先発・次発・次々発・4両目...）
  return trains.map((t, index) => {
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
