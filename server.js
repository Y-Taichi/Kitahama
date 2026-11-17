import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  processAllSakaisujiTrains,
  filterAndSortKitahamaTrains,
  TrainStateTracker,
  filterTargetSectionTrains
} from "./lib/train-tracker.js";
import { SAKAISUJI_ORDERED_STATIONS } from "./lib/stations.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const OSAKA_METRO_API_URL = "https://api.mobility-operation-info.emetro-app.osakametro.co.jp/app/api/v1/trainlocation?route_code=6";
const OPERATION_INFO_URL = "https://api.mobility-operation-info.emetro-app.osakametro.co.jp/app/api/v1/operationinfo?route_code=6";
const API_KEY = "XSGUG4p5Ya5vQCehV3zZjaDheZAQMpqP9paVan8W";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

// サーバー側で走行中・停車中の経過秒数を常時追跡するトラッカー
const serverTracker = new TrainStateTracker();
let lastRawList = [];
let lastOperationInfo = { status: "平常運転", message: "" };
let lastFetchError = null;

async function pollOsakaMetroApi() {
  try {
    const [apiRes, opRes] = await Promise.all([
      fetch(OSAKA_METRO_API_URL, {
        headers: {
          "X-Api-Key": API_KEY,
          "Accept-Language": "ja",
          "User-Agent": "KitahamaLocalDev/1.0"
        }
      }),
      fetch(OPERATION_INFO_URL, {
        headers: {
          "X-Api-Key": API_KEY,
          "Accept-Language": "ja"
        }
      }).catch(() => null)
    ]);

    if (apiRes.ok) {
      const rawData = await apiRes.json();
      lastRawList = rawData.trainLocationList || [];
      // サーバー側で状態更新＆秒数カウントを即座に反映
      serverTracker.process(lastRawList, Date.now());
      lastFetchError = null;
    }

    if (opRes && opRes.ok) {
      try {
        const opData = await opRes.json();
        if (opData.operationInfoList && opData.operationInfoList.length > 0) {
          lastOperationInfo = {
            status: "ダイヤ乱れ・運行情報あり",
            message: opData.operationInfoList.map(item => item.informationText || "").join("\n")
          };
        } else {
          lastOperationInfo = { status: "平常運転", message: "" };
        }
      } catch (e) {}
    }
  } catch (err) {
    lastFetchError = err;
  }
}

// サーバー起動直後から1.5秒間隔でバックグラウンド追跡（スマホのアクセス前から常時カウント）
pollOsakaMetroApi();
setInterval(pollOsakaMetroApi, 1500);

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  // API エンドポイント
  if (reqUrl.pathname === "/api/trains") {
    const dirParam = reqUrl.searchParams.get("dir");
    const dir = dirParam === "B" ? "B" : dirParam === "A" ? "A" : null;

    try {
      // 直近のデータがない場合は即座にフェッチ
      if (lastRawList.length === 0) {
        await pollOsakaMetroApi();
      }

      // サーバー側で追跡された全列車リストを取得
      const trackedAll = serverTracker.process(lastRawList, Date.now());
      // 天神橋筋六丁目に向かう電車（上り: A）のみを抽出
      const targetTrains = filterTargetSectionTrains(trackedAll, "A");

      // 既存互換用
      const defaultDir = dir || "A";
      const allTrains = processAllSakaisujiTrains(lastRawList, defaultDir);
      const approachingTrains = filterAndSortKitahamaTrains(lastRawList, defaultDir);
      const orderedStations = defaultDir === "A"
        ? [...SAKAISUJI_ORDERED_STATIONS].reverse()
        : [...SAKAISUJI_ORDERED_STATIONS];

      const payload = {
        targetStation: "北浜",
        stationCode: "K14",
        direction: "A",
        directionName: "天神橋筋六丁目・阪急線 方面（上り）",
        operation: lastOperationInfo,
        updatedAt: new Date().toISOString(),
        stations: orderedStations,
        // 天神橋筋六丁目に向かう電車のみ（天下茶屋行きは除外）
        targetTrains: targetTrains,
        allTargetTrains: targetTrains,
        trains: allTrains,
        approachingTrains: approachingTrains.slice(0, 3)
      };

      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache"
      });
      res.end(JSON.stringify(payload));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 静的ファイル配信 (public ディレクトリ)
  let filePath = path.join(__dirname, "public", reqUrl.pathname === "/" ? "index.html" : reqUrl.pathname);
  const ext = path.extname(filePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(__dirname, "public", "index.html");
  }

  const contentType = MIME_TYPES[ext] || "text/html; charset=utf-8";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`[Kitahama Dev Server] Running at http://localhost:${PORT}`);
});
