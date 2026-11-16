import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { processAllSakaisujiTrains, filterAndSortKitahamaTrains } from "./lib/train-tracker.js";
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

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  // API エンドポイント
  if (reqUrl.pathname === "/api/trains") {
    const dir = reqUrl.searchParams.get("dir") === "B" ? "B" : "A";

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

      if (!apiRes.ok) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to fetch from Osaka Metro API" }));
        return;
      }

      const rawData = await apiRes.json();
      const rawList = rawData.trainLocationList || [];

      let operationStatus = "平常運転";
      let operationMessage = "";
      if (opRes && opRes.ok) {
        try {
          const opData = await opRes.json();
          if (opData.operationInfoList && opData.operationInfoList.length > 0) {
            operationStatus = "ダイヤ乱れ・運行情報あり";
            operationMessage = opData.operationInfoList.map(item => item.informationText || "").join("\n");
          }
        } catch (e) {}
      }

      const allTrains = processAllSakaisujiTrains(rawList, dir);
      const approachingTrains = filterAndSortKitahamaTrains(rawList, dir);

      const orderedStations = dir === "A"
        ? [...SAKAISUJI_ORDERED_STATIONS].reverse()
        : [...SAKAISUJI_ORDERED_STATIONS];

      const payload = {
        targetStation: "北浜",
        stationCode: "K14",
        direction: dir,
        directionName: dir === "A" ? "天神橋筋六丁目・阪急線 方面（上り）" : "天下茶屋 方面（下り）",
        operation: {
          status: operationStatus,
          message: operationMessage
        },
        updatedAt: new Date().toISOString(),
        stations: orderedStations,
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
