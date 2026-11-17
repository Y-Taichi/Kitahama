(() => {
  const REFRESH_INTERVAL_MS = 1000;
  const canvas = document.getElementById("canvas");
  const infraLayer = document.getElementById("track-infrastructure");
  const trainsLayer = document.getElementById("trains-layer");

  let isFetching = false;
  let timerId = null;

  // 静的インフラ（線路・ホーム・駅サイン）の描画
  function buildInfrastructure() {
    let svg = "";

    // 1. 枕木（スリーパー）: 左レール(X=80) と 右レール(X=280)
    for (let y = 16; y <= 624; y += 18) {
      svg += `<rect x="58" y="${y}" width="44" height="6" rx="1.5" fill="#1C212B" />`;
      svg += `<rect x="258" y="${y}" width="44" height="6" rx="1.5" fill="#1C212B" />`;
    }

    // 2. レール（鉄路）
    // 左線路 (上り線 ↑)
    svg += `<line x1="68" y1="0" x2="68" y2="640" stroke="#3A4454" stroke-width="3" stroke-linecap="square"/>`;
    svg += `<line x1="92" y1="0" x2="92" y2="640" stroke="#3A4454" stroke-width="3" stroke-linecap="square"/>`;

    // 右線路 (下り線 ↓)
    svg += `<line x1="268" y1="0" x2="268" y2="640" stroke="#3A4454" stroke-width="3" stroke-linecap="square"/>`;
    svg += `<line x1="292" y1="0" x2="292" y2="640" stroke="#3A4454" stroke-width="3" stroke-linecap="square"/>`;

    // 3. 走行方向ベクター矢印（レール上のピクトグラム）
    // 上り線: 上向き矢印 ↑ (Y=200, Y=440)
    svg += createDirectionArrow(80, 200, "up");
    svg += createDirectionArrow(80, 440, "up");
    // 下り線: 下向き矢印 ↓ (Y=200, Y=440)
    svg += createDirectionArrow(280, 200, "down");
    svg += createDirectionArrow(280, 440, "down");

    // 4. 駅プラットフォーム（北浜、堺筋本町、長堀橋の3駅のみ）
    // 北浜 (K14, Y=80)
    svg += createStationPlatform(80, "K14");
    // 堺筋本町 (K15, Y=320)
    svg += createStationPlatform(320, "K15");
    // 長堀橋 (K16, Y=560)
    svg += createStationPlatform(560, "K16");

    infraLayer.innerHTML = svg;
  }

  // 方向矢印ピクトグラム（ベクター）
  function createDirectionArrow(cx, cy, dir) {
    if (dir === "up") {
      return `
        <g opacity="0.35">
          <path d="M${cx} ${cy - 16} L${cx - 7} ${cy - 5} L${cx - 3} ${cy - 5} L${cx - 3} ${cy + 14} L${cx + 3} ${cy + 14} L${cx + 3} ${cy - 5} L${cx + 7} ${cy - 5} Z" fill="#60A5FA" />
        </g>
      `;
    }
    return `
      <g opacity="0.35">
        <path d="M${cx} ${cy + 16} L${cx - 7} ${cy + 5} L${cx - 3} ${cy + 5} L${cx - 3} ${cy - 14} L${cx + 3} ${cy - 14} L${cx + 3} ${cy + 5} L${cx + 7} ${cy + 5} Z" fill="#F87171" />
      </g>
    `;
  }

  // 駅プラットフォームと駅ナンバリングサイン（ベクター）
  function createStationPlatform(cy, code) {
    const top = cy - 35;
    const height = 70;
    return `
      <!-- ホーム床面 -->
      <rect x="114" y="${top}" width="132" height="${height}" rx="5" fill="#151A23" stroke="#252E3E" stroke-width="1.5" />
      <!-- 点字ブロック（黄色ライン） -->
      <line x1="120" y1="${top + 2}" x2="120" y2="${top + height - 2}" stroke="#D97706" stroke-width="2.5" stroke-dasharray="3,2" />
      <line x1="240" y1="${top + 2}" x2="240" y2="${top + height - 2}" stroke="#D97706" stroke-width="2.5" stroke-dasharray="3,2" />
      <!-- ホーム安全柵ピクトグラム -->
      <rect x="124" y="${top + 6}" width="4" height="${height - 12}" rx="1" fill="#2C3748" />
      <rect x="232" y="${top + 6}" width="4" height="${height - 12}" rx="1" fill="#2C3748" />
      <!-- 駅ナンバリングサイン (茶色サークル + コード) -->
      <circle cx="180" cy="${cy}" r="19" fill="#81472C" stroke="#FFFFFF" stroke-width="2.5" />
      <text x="180" y="${cy + 5}" text-anchor="middle" fill="#FFFFFF" font-size="12" font-weight="900" font-family="Arial, sans-serif" letter-spacing="0.5">${code}</text>
    `;
  }

  // 電車のベクターイラスト描画
  function renderTrainSvg(train, cx, cy, isUpward) {
    const isHankyu = train.typeInfo && train.typeInfo.isHankyu;
    const bodyColor = isHankyu ? "#5C061F" : "#718096"; // 阪急マルーン vs メトロシルバー
    const stripeColor = isHankyu ? "#F3EFE0" : "#81472C"; // アイボリー vs 堺筋線茶色
    const roofColor = isHankyu ? "#3B0314" : "#4A5568";

    const width = 32;
    const height = 48;
    const x = cx - width / 2;
    const y = cy - height / 2;

    // 前面（進行方向）の向き
    // 上り: 上向き（前照灯が上、赤尾灯が下）
    // 下り: 下向き（前照灯が下、赤尾灯が上）
    const headLightY = isUpward ? y + 5 : y + height - 5;
    const tailLightY = isUpward ? y + height - 5 : y + 5;
    const windowY = isUpward ? y + 10 : y + 24;
    const pantographY = isUpward ? y + height - 2 : y + 2;

    return `
      <g>
        <!-- パンタグラフ -->
        <path d="M${cx - 6} ${pantographY} L${cx} ${isUpward ? pantographY + 5 : pantographY - 5} L${cx + 6} ${pantographY}" stroke="#A0AEC0" stroke-width="1.5" fill="none"/>

        <!-- 車体ベース -->
        <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" fill="${bodyColor}" stroke="#1A202C" stroke-width="1.5" />
        
        <!-- 屋根/帯 -->
        <rect x="${x + 2}" y="${y + 2}" width="${width - 4}" height="6" rx="2" fill="${roofColor}" />
        <rect x="${x}" y="${cy - 2}" width="${width}" height="4" fill="${stripeColor}" />

        <!-- 窓ガラス -->
        <rect x="${x + 4}" y="${windowY}" width="${width - 8}" height="14" rx="2" fill="#1A365D" stroke="#2B6CB0" stroke-width="1" />

        <!-- 前照灯（ヘッドライト点灯・イエロー） -->
        <circle cx="${x + 6}" cy="${headLightY}" r="2" fill="#FBBF24" />
        <circle cx="${x + width - 6}" cy="${headLightY}" r="2" fill="#FBBF24" />

        <!-- 赤色尾灯（テールライト・レッド） -->
        <circle cx="${x + 6}" cy="${tailLightY}" r="1.5" fill="#EF4444" />
        <circle cx="${x + width - 6}" cy="${tailLightY}" r="1.5" fill="#EF4444" />

        <!-- 車輪/台車ピクトグラム -->
        <rect x="${x + 2}" y="${y + 8}" width="2" height="6" rx="1" fill="#1A202C" />
        <rect x="${x + width - 4}" y="${y + 8}" width="2" height="6" rx="1" fill="#1A202C" />
        <rect x="${x + 2}" y="${y + height - 14}" width="2" height="6" rx="1" fill="#1A202C" />
        <rect x="${x + width - 4}" y="${y + height - 14}" width="2" height="6" rx="1" fill="#1A202C" />
      </g>
    `;
  }

  // 電車の数字・行先・経過秒数、および予測（次状態までの直前1本/3本平均・北浜停車合計）の描画
  function renderTrainBadge(train, cx, cy, isUpward) {
    const badgeW = 76;
    const badgeH = 54;
    // 上り線(X=80)は中央寄り X=99 に配置 (99〜175)
    // 下り線(X=280)は中央寄り X=185 に配置 (185〜261)
    const bx = isUpward ? 99 : 185;
    const by = cy - badgeH / 2;

    const vNum = escapeXml(train.vehicleNumber || "");
    const dest = escapeXml(train.destination || "");
    const sec = `${Math.max(0, parseInt(train.elapsedSeconds, 10) || 0)}s`;

    // 予測データ
    const pred = train.prediction || {};
    const nextPred = pred.nextState || {};
    const arrPred = pred.kitahamaArrival || {};

    const nextLast = nextPred.last != null ? `${nextPred.last}s` : "-";
    const nextAvg3 = nextPred.avg3 != null ? `${nextPred.avg3}s` : "-";

    let arrivalText = "";
    if (arrPred.isAtKitahama) {
      arrivalText = "北浜: 0s (当駅)";
    } else if (arrPred.totalLast != null && arrPred.totalAvg3 != null) {
      arrivalText = `北浜: ${arrPred.totalLast}s / ${arrPred.totalAvg3}s`;
    } else {
      arrivalText = `次: ${nextLast} / ${nextAvg3}`;
    }

    return `
      <g>
        <!-- バッジ背景 -->
        <rect x="${bx}" y="${by}" width="${badgeW}" height="${badgeH}" rx="4" fill="#0E141F" stroke="#252F42" stroke-width="1.2" />
        
        <!-- 1行目: 電車の数字（車番）と行先 -->
        <text x="${bx + 4}" y="${by + 13}" fill="#FFFFFF" font-size="10" font-weight="800" font-family="-apple-system, sans-serif">${vNum}</text>
        <text x="${bx + badgeW - 4}" y="${by + 13}" text-anchor="end" fill="#FBBF24" font-size="9" font-weight="700" font-family="-apple-system, sans-serif">${dest}</text>
        
        <!-- 2行目: 経過秒数 -->
        <text x="${bx + 4}" y="${by + 26}" fill="#38BDF8" font-size="9.5" font-weight="800" font-family="-apple-system, sans-serif">経過: ${sec}</text>

        <!-- 3行目: 次の状態までの実績（直前1本 / 以前3本平均） -->
        <text x="${bx + 4}" y="${by + 38}" fill="#94A3B8" font-size="8" font-weight="600" font-family="-apple-system, sans-serif">次: ${nextLast} / ${nextAvg3}</text>

        <!-- 4行目: 北浜停車までの合計（直前 / 3本平均） -->
        <text x="${bx + 4}" y="${by + 49}" fill="#34D399" font-size="8" font-weight="800" font-family="-apple-system, sans-serif">${arrivalText}</text>
      </g>
    `;
  }

  // 列車を描画
  function renderTrains(trains) {
    let svg = "";

    // 列車位置のスロットマッピング
    // 上り: X=80 (進行方向: 上)
    // 下り: X=280 (進行方向: 下)
    const POSITIONS = {
      // 北浜(K14) 停車中
      "STOPPED:K14:A": { x: 80, y: 80, isUpward: true },
      "STOPPED:K14:B": { x: 280, y: 80, isUpward: false },
      // 北浜〜堺筋本町 走行中
      "RUNNING:K15->K14:A": { x: 80, y: 200, isUpward: true },
      "RUNNING:K14->K15:B": { x: 280, y: 200, isUpward: false },
      // 堺筋本町(K15) 停車中
      "STOPPED:K15:A": { x: 80, y: 320, isUpward: true },
      "STOPPED:K15:B": { x: 280, y: 320, isUpward: false },
      // 堺筋本町〜長堀橋 走行中
      "RUNNING:K16->K15:A": { x: 80, y: 440, isUpward: true },
      "RUNNING:K15->K16:B": { x: 280, y: 440, isUpward: false },
      // 長堀橋(K16) 停車中
      "STOPPED:K16:A": { x: 80, y: 560, isUpward: true },
      "STOPPED:K16:B": { x: 280, y: 560, isUpward: false }
    };

    const slotCounts = {};

    trains.forEach(t => {
      let key = "";
      if (t.status === "STOPPED") {
        key = `STOPPED:${t.fromStationCode}:${t.direction}`;
      } else if (t.status === "RUNNING") {
        key = `RUNNING:${t.fromStationCode}->${t.toStationCode}:${t.direction}`;
      }

      const slot = POSITIONS[key];
      if (!slot) return;

      // 複数列車重複時の微調整オフセット
      slotCounts[key] = (slotCounts[key] || 0) + 1;
      const count = slotCounts[key];
      const yOffset = (count - 1) * 20;

      const px = slot.x;
      const py = slot.y + yOffset;

      svg += renderTrainSvg(t, px, py, slot.isUpward);
      svg += renderTrainBadge(t, px, py, slot.isUpward);
    });

    trainsLayer.innerHTML = svg;
  }

  // データ取得
  async function fetchTrainData() {
    if (isFetching) return;
    isFetching = true;

    try {
      const res = await fetch("/api/trains", {
        headers: { "Accept": "application/json" }
      });
      if (!res.ok) return;

      const data = await res.json();
      const targetTrains = data.allTargetTrains || data.targetTrains || [];
      renderTrains(targetTrains);
    } catch (err) {
      // エラー時もアニメーションや余計な文字は表示しない
    } finally {
      isFetching = false;
    }
  }

  function escapeXml(unsafe) {
    if (!unsafe) return "";
    return String(unsafe).replace(/[<>&'"]/g, c => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
      }
    });
  }

  // 初期化
  buildInfrastructure();
  fetchTrainData();

  // 定期更新（1秒間隔、アニメーションなしでスパッと更新）
  timerId = setInterval(fetchTrainData, REFRESH_INTERVAL_MS);

  // バックグラウンド時はタイマー停止で超省エネ
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (timerId) clearInterval(timerId);
    } else {
      fetchTrainData();
      if (timerId) clearInterval(timerId);
      timerId = setInterval(fetchTrainData, REFRESH_INTERVAL_MS);
    }
  });
})();
