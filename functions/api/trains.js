import { filterAndSortKitahamaTrains } from "../../lib/train-tracker.js";

const OSAKA_METRO_API_URL = "https://api.mobility-operation-info.emetro-app.osakametro.co.jp/app/api/v1/trainlocation?route_code=6";
const API_KEY = "XSGUG4p5Ya5vQCehV3zZjaDheZAQMpqP9paVan8W";

/**
 * Cloudflare Pages Functions GET handler: /api/trains
 */
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const direction = url.searchParams.get("dir") === "B" ? "B" : "A"; // デフォルトは "A" (天六・阪急方面)

  try {
    const apiRes = await fetch(OSAKA_METRO_API_URL, {
      method: "GET",
      headers: {
        "X-Api-Key": API_KEY,
        "Accept-Language": "ja",
        "User-Agent": "KitahamaTrainTracker/1.0"
      },
      // Cloudflare Edge Cache: 5秒間キャッシュして上流APIへの過負荷を防ぐ
      cf: {
        cacheTtl: 5,
        cacheEverything: true
      }
    });

    if (!apiRes.ok) {
      return new Response(
        JSON.stringify({
          error: "Failed to fetch from Osaka Metro API",
          status: apiRes.status,
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

    const rawData = await apiRes.json();
    const rawList = rawData.trainLocationList || [];

    // 北浜駅向けの接近列車一覧を計算
    const trains = filterAndSortKitahamaTrains(rawList, direction);

    // 最小限のペイロードを生成 (約 300 バイト)
    const payload = {
      targetStation: "北浜",
      stationCode: "K14",
      direction: direction,
      directionName: direction === "A" ? "天神橋筋六丁目・阪急線方面" : "天下茶屋方面",
      updatedAt: new Date().toISOString(),
      trains: trains.slice(0, 4) // 次にやってくる上位4本のみ返却（通信量最小化）
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=5, s-maxage=5"
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
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
}
