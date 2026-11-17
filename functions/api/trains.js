import {
  processAllSakaisujiTrains,
  filterAndSortKitahamaTrains,
  TrainStateTracker,
  filterTargetSectionTrains
} from "../../lib/train-tracker.js";
import { SAKAISUJI_ORDERED_STATIONS } from "../../lib/stations.js";

// エッジインスタンスごとの追跡用トラッカー
const edgeTracker = new TrainStateTracker();

const OSAKA_METRO_API_URL = "https://api.mobility-operation-info.emetro-app.osakametro.co.jp/app/api/v1/trainlocation?route_code=6";
const OPERATION_INFO_URL = "https://api.mobility-operation-info.emetro-app.osakametro.co.jp/app/api/v1/operationinfo?route_code=6";
const API_KEY = "XSGUG4p5Ya5vQCehV3zZjaDheZAQMpqP9paVan8W";

/**
 * Cloudflare Pages Functions GET handler: /api/trains
 */
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const direction = url.searchParams.get("dir") === "B" ? "B" : "A"; // "A": 天六・阪急方面 (上り), "B": 天下茶屋方面 (下り)

  try {
    // 列車位置と運行情報を並行取得
    const [trainRes, opRes] = await Promise.all([
      fetch(OSAKA_METRO_API_URL, {
        method: "GET",
        headers: {
          "X-Api-Key": API_KEY,
          "Accept-Language": "ja",
          "User-Agent": "KitahamaTrainTracker/1.0"
        },
        // 1秒更新のためエッジキャッシュを1秒に設定
        cf: {
          cacheTtl: 1,
          cacheEverything: true
        }
      }),
      fetch(OPERATION_INFO_URL, {
        method: "GET",
        headers: {
          "X-Api-Key": API_KEY,
          "Accept-Language": "ja"
        },
        cf: {
          cacheTtl: 5,
          cacheEverything: true
        }
      }).catch(() => null)
    ]);

    if (!trainRes.ok) {
      return new Response(
        JSON.stringify({
          error: "Failed to fetch from Osaka Metro API",
          status: trainRes.status,
          updatedAt: new Date().toISOString()
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }

    const rawData = await trainRes.json();
    const rawList = rawData.trainLocationList || [];

    // 運行情報テキスト
    let operationStatus = "平常運転";
    let operationMessage = "";
    if (opRes && opRes.ok) {
      try {
        const opData = await opRes.json();
        if (opData.operationInfoList && opData.operationInfoList.length > 0) {
          operationStatus = "ダイヤ乱れ・運行情報あり";
          operationMessage = opData.operationInfoList.map(item => item.informationText || "").join("\n");
        }
      } catch (e) {
        // ignore
      }
    }

    // サーバー側追跡（秒数カウント）
    const trackedAll = edgeTracker.process(rawList, Date.now());
    // 天六方面に向かう電車（上り: A）のみ抽出
    const targetTrains = filterTargetSectionTrains(trackedAll, "A");

    // 全列車データを処理（トラック・マップ表示用）
    const allTrains = processAllSakaisujiTrains(rawList, direction);

    // 北浜駅接近列車リスト（先発・次発・次々発）
    const approachingTrains = filterAndSortKitahamaTrains(rawList, direction);

    // 駅リスト（上りなら天下茶屋 K20 -> 天神橋筋六丁目 K11、下りなら K11 -> K20 の順）
    const orderedStations = direction === "A"
      ? [...SAKAISUJI_ORDERED_STATIONS].reverse() // 天下茶屋(20) -> 北浜(14) -> 天六(11)
      : [...SAKAISUJI_ORDERED_STATIONS];           // 天六(11) -> 北浜(14) -> 天下茶屋(20)

    const payload = {
      targetStation: "北浜",
      stationCode: "K14",
      direction: direction,
      directionName: direction === "A" ? "天神橋筋六丁目・阪急線 方面（上り）" : "天下茶屋 方面（下り）",
      operation: {
        status: operationStatus,
        message: operationMessage
      },
      updatedAt: new Date().toISOString(),
      stations: orderedStations,
      targetTrains: targetTrains,
      allTargetTrains: targetTrains,
      trains: allTrains, // 堺筋線を走行中の全列車
      approachingTrains: approachingTrains.slice(0, 3) // 直近の先発・次発・次々発サマリー
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache"
      }
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: err.message || String(err),
        updatedAt: new Date().toISOString()
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache, no-store, must-revalidate"
        }
      }
    );
  }
}

/**
 * CORS Preflight (OPTIONS)
 */
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Access-Control-Max-Age": "86400"
    }
  });
}
