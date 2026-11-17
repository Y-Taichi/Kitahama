import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { filterAndSortKitahamaTrains } from "../lib/train-tracker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

test("Integration Test: ローカルHTTPサーバーの動作検証", async () => {
  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);
    if (reqUrl.pathname === "/api/trains") {
      const mockList = [
        {
          directionId: "A",
          fromStationCode: "K15",
          toStationCode: "K14",
          progress: "1.0",
          terminalStationCode: "HK72",
          vehicleNumber: "7303"
        }
      ];
      const trains = filterAndSortKitahamaTrains(mockList, "A");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ targetStation: "北浜", trains }));
      return;
    }

    if (reqUrl.pathname === "/" || reqUrl.pathname === "/index.html") {
      const content = fs.readFileSync(path.join(rootDir, "public", "index.html"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(content);
      return;
    }

    if (reqUrl.pathname === "/style.css") {
      const content = fs.readFileSync(path.join(rootDir, "public", "style.css"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
      res.end(content);
      return;
    }

    if (reqUrl.pathname === "/app.js") {
      const content = fs.readFileSync(path.join(rootDir, "public", "app.js"), "utf-8");
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end(content);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // 1. GET /
    const htmlRes = await fetch(`http://localhost:${port}/`);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.ok(html.includes("canvas"));

    // 2. GET /style.css
    const cssRes = await fetch(`http://localhost:${port}/style.css`);
    assert.equal(cssRes.status, 200);
    const css = await cssRes.text();
    assert.ok(css.includes("canvas") || css.includes("100dvh"));

    // 3. GET /app.js
    const jsRes = await fetch(`http://localhost:${port}/app.js`);
    assert.equal(jsRes.status, 200);
    const js = await jsRes.text();
    assert.ok(js.includes("fetchTrainData"));

    // 4. GET /api/trains
    const apiRes = await fetch(`http://localhost:${port}/api/trains?dir=A`);
    assert.equal(apiRes.status, 200);
    const data = await apiRes.json();
    assert.equal(data.targetStation, "北浜");
    assert.equal(data.trains.length, 1);
    assert.equal(data.trains[0].destination, "高槻市");
    assert.equal(data.trains[0].orderLabel, "先発");
  } finally {
    server.close();
  }
});
