(() => {
  const REFRESH_INTERVAL_MS = 1000;
  const trainCardsContainer = document.getElementById("train-cards-container");

  // スロットアンカー要素（右端バーの5つの位置）
  const anchors = {
    "STOPPED:K16": document.getElementById("anchor-K16"),
    "RUNNING:K16->K15": document.getElementById("anchor-K16-K15"),
    "STOPPED:K15": document.getElementById("anchor-K15"),
    "RUNNING:K15->K14": document.getElementById("anchor-K15-K14"),
    "STOPPED:K14": document.getElementById("anchor-K14")
  };

  let isFetching = false;
  let timerId = null;
  let lastFetchedData = [];
  let fetchTimestamp = Date.now();

  // 公式電車SVGのパス決定（Osaka Metro 66系 vs 阪急1300系 等）
  function getOfficialTrainSvgUrl(train) {
    const isHankyu = train.typeInfo && train.typeInfo.isHankyu;
    if (isHankyu) {
      return "/icons/train_6_13.svg";
    }
    const vNum = String(train.vehicleNumber || "");
    if (vNum.startsWith("66")) {
      return "/icons/train_6_66.svg";
    }
    return "/icons/train_K.svg";
  }

  // 最後のアクティビティ文言（例: 71秒前に長堀橋出発、10秒前に堺筋本町停車）
  function formatActivityText(train, liveElapsed) {
    const sec = Math.max(0, liveElapsed);
    if (train.status === "STOPPED") {
      let stName = train.fromStation || "当駅";
      if (train.fromStationCode === "K16") stName = "長堀橋";
      if (train.fromStationCode === "K15") stName = "堺筋本町";
      if (train.fromStationCode === "K14") stName = "北浜";
      return `${sec}秒前に${stName}停車`;
    }
    if (train.status === "RUNNING") {
      let depName = "駅";
      if (train.fromStationCode === "K16") depName = "長堀橋";
      if (train.fromStationCode === "K15") depName = "堺筋本町";
      return `${sec}秒前に${depName}出発`;
    }
    return `${sec}秒前`;
  }

  // 画面全体のレンダリング
  function renderAll(trains) {
    // 天神橋筋六丁目に向かう電車（上り: A）のみを抽出（天下茶屋行きは除外）
    const upTrains = trains.filter(t => t.direction === "A");

    // 1. 右端のバーのアンカーをクリア
    Object.values(anchors).forEach(el => {
      if (el) el.innerHTML = "";
    });

    const now = Date.now();
    const ageSec = Math.floor((now - fetchTimestamp) / 1000);

    // 2. 右端のバーに電車アイコンをプロット
    upTrains.forEach(t => {
      let key = "";
      if (t.status === "STOPPED") {
        key = `STOPPED:${t.fromStationCode}`;
      } else if (t.status === "RUNNING") {
        key = `RUNNING:${t.fromStationCode}->${t.toStationCode}`;
      }

      const anchor = anchors[key];
      if (!anchor) return;

      const liveElapsed = (t.elapsedSeconds || 0) + ageSec;
      const svgUrl = getOfficialTrainSvgUrl(t);

      anchor.innerHTML = `
        <div class="bar-train-unit">
          <!-- 電車の真上に秒数（今の今までこの状態は何秒間続けられていたか） -->
          <div class="bar-train-seconds">${liveElapsed}秒</div>
          <!-- 公式ベクター電車画像 -->
          <img src="${svgUrl}" class="bar-train-svg" alt="train" />
        </div>
      `;
    });

    // 3. 本画面（メイン画面エリア）のレンダリング
    if (upTrains.length === 0) {
      trainCardsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">天神橋筋六丁目 方面</div>
          <div class="empty-desc">長堀橋〜北浜の区間に走行中の列車はありません</div>
        </div>
      `;
      return;
    }

    // 北浜に近い順にソート（北浜停車中 -> 堺筋本町〜北浜間 -> 堺筋本町停車中 -> 長堀橋〜堺筋本町間 -> 長堀橋停車中）
    const priorityOrder = {
      "STOPPED:K14": 1,
      "RUNNING:K15->K14": 2,
      "STOPPED:K15": 3,
      "RUNNING:K16->K15": 4,
      "STOPPED:K16": 5
    };

    upTrains.sort((a, b) => {
      const keyA = a.status === "STOPPED" ? `STOPPED:${a.fromStationCode}` : `RUNNING:${a.fromStationCode}->${a.toStationCode}`;
      const keyB = b.status === "STOPPED" ? `STOPPED:${b.fromStationCode}` : `RUNNING:${b.fromStationCode}->${b.toStationCode}`;
      return (priorityOrder[keyA] || 99) - (priorityOrder[keyB] || 99);
    });

    // 先発列車（最も北浜に近いメイン列車）
    const primaryTrain = upTrains[0];
    const liveElapsedPrimary = (primaryTrain.elapsedSeconds || 0) + ageSec;
    const activityTextPrimary = formatActivityText(primaryTrain, liveElapsedPrimary);

    // 北浜駅到達予測（ライブ計算）
    const arrPred = (primaryTrain.prediction && primaryTrain.prediction.kitahamaArrival) || {};
    const isAtKitahama = arrPred.isAtKitahama || primaryTrain.fromStationCode === "K14";

    let countdownHtml = "";
    if (isAtKitahama) {
      countdownHtml = `
        <div class="arrival-countdown-box">
          <div class="giant-arrived">北浜駅 到着済<br><span style="font-size:1.2rem; color:#A0AEC0;">(当駅停車中)</span></div>
        </div>
      `;
    } else {
      // 1本前の実績ペースと3本平均ペースでの残り到達秒数をライブ計算
      const totalLastBase = arrPred.totalLast != null ? arrPred.totalLast : 60;
      const totalAvg3Base = arrPred.totalAvg3 != null ? arrPred.totalAvg3 : 60;

      // リアルタイムにカウントダウン
      const remLast = Math.max(0, totalLastBase - ageSec);
      const remAvg3 = Math.max(0, totalAvg3Base - ageSec);

      countdownHtml = `
        <div class="arrival-countdown-box">
          <div class="arrival-target-label">北浜駅 到達まで</div>
          <!-- 一際大きなフォントで表示 -->
          <div class="giant-countdown">
            <span class="countdown-prefix">あと</span>
            <span class="giant-seconds">${remAvg3}</span>
            <span class="countdown-unit">秒</span>
          </div>
          <!-- 直前1本ペースと3本平均ペースの比較 -->
          <div class="prediction-comparison-row">
            <div class="comparison-item">
              <span class="comp-badge">3本平均</span>
              <span>あと <strong class="comp-num">${remAvg3}</strong> 秒</span>
            </div>
            <div class="comparison-item">
              <span class="comp-badge">直前1本</span>
              <span>あと <strong class="comp-num">${remLast}</strong> 秒</span>
            </div>
          </div>
        </div>
      `;
    }

    const isHankyu = primaryTrain.typeInfo && primaryTrain.typeInfo.isHankyu;
    const modelTagClass = isHankyu ? "model-hankyu" : "model-metro";
    const modelTagName = isHankyu ? "阪急電鉄 直通車" : "Osaka Metro 66系";

    let primaryCardHtml = `
      <div class="primary-train-card">
        <!-- 1. 行き先と車番（大きな文字） -->
        <div>
          <div class="train-header-row">
            <div class="train-dest-box">
              <span class="train-dest-name">${escapeHtml(primaryTrain.destination || "天神橋筋六丁目")}</span>
              <span class="train-dest-suffix">行</span>
            </div>
            <span class="train-car-number">${escapeHtml(primaryTrain.vehicleNumber || "")}号</span>
          </div>
          <span class="train-model-tag ${modelTagClass}">${modelTagName}</span>
        </div>

        <!-- 2. 最後のアクティビティ（大きな文字） -->
        <div class="activity-box">
          <div class="activity-text">${escapeHtml(activityTextPrimary)}</div>
        </div>

        <!-- 3. 北浜駅到達カウントダウン（一際大きな特大フォント） -->
        ${countdownHtml}
      </div>
    `;

    // 2本目（次発列車）がある場合のコンパクト表示
    let secondaryHtml = "";
    if (upTrains.length > 1) {
      const secTrain = upTrains[1];
      const liveElapsedSec = (secTrain.elapsedSeconds || 0) + ageSec;
      const activityTextSec = formatActivityText(secTrain, liveElapsedSec);
      const arrPredSec = (secTrain.prediction && secTrain.prediction.kitahamaArrival) || {};
      const remAvg3Sec = Math.max(0, (arrPredSec.totalAvg3 || 120) - ageSec);

      secondaryHtml = `
        <div class="secondary-train-card">
          <div class="secondary-title">
            <span>次発: ${escapeHtml(secTrain.destination || "")}行 (${escapeHtml(secTrain.vehicleNumber || "")}号)</span>
          </div>
          <div class="secondary-activity">
            ${escapeHtml(activityTextSec)} (あと${remAvg3Sec}秒)
          </div>
        </div>
      `;
    }

    trainCardsContainer.innerHTML = primaryCardHtml + secondaryHtml;
  }

  // 1秒ごとのUIライブ更新（カウントダウン・カウントアップをスムーズに描画）
  function tickLive() {
    if (lastFetchedData.length > 0) {
      renderAll(lastFetchedData);
    }
  }

  // データフェッチ
  async function fetchTrainData() {
    if (isFetching) return;
    isFetching = true;

    try {
      const res = await fetch("/api/trains?dir=A", {
        headers: { "Accept": "application/json" }
      });
      if (!res.ok) return;

      const data = await res.json();
      lastFetchedData = data.targetTrains || data.allTargetTrains || [];
      fetchTimestamp = Date.now();
      renderAll(lastFetchedData);
    } catch (err) {
      // ignore
    } finally {
      isFetching = false;
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // 初期化と定期実行
  fetchTrainData();
  timerId = setInterval(() => {
    fetchTrainData();
    tickLive();
  }, REFRESH_INTERVAL_MS);

  // バックグラウンド時はタイマー停止で省エネ
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (timerId) clearInterval(timerId);
    } else {
      fetchTrainData();
      if (timerId) clearInterval(timerId);
      timerId = setInterval(() => {
        fetchTrainData();
        tickLive();
      }, REFRESH_INTERVAL_MS);
    }
  });
})();
