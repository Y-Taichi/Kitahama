(() => {
  const trainCardsContainer = document.getElementById("train-cards-container");

  // スロットアンカー要素（右端バーの5つの位置）
  const anchors = {
    "STOPPED:K16": document.getElementById("anchor-K16"),
    "RUNNING:K16->K15": document.getElementById("anchor-K16-K15"),
    "STOPPED:K15": document.getElementById("anchor-K15"),
    "RUNNING:K15->K14": document.getElementById("anchor-K15-K14"),
    "STOPPED:K14": document.getElementById("anchor-K14")
  };

  let activeTrains = [];
  let isFetching = false;

  // 車両番号から images 配下の画像パスを決定
  // 何も当てはまらない、画像がない場合は 66000.png
  function getTrainImageUrl(vehicleNumber) {
    const v = String(vehicleNumber || "").trim();
    if (v.startsWith("13")) return "/images/1300.png";
    if (v.startsWith("53")) return "/images/5300.png";
    if (v.startsWith("73")) return "/images/7300.png";
    if (v.startsWith("83")) return "/images/8300.png";
    if (v.startsWith("93")) return "/images/9300.png";
    if (v.startsWith("66")) return "/images/66000.png";
    return "/images/66000.png";
  }

  // 行先フォーマット（「行」をつける。例: 北千里行）
  function formatDestination(dest) {
    if (!dest) return "天神橋筋六丁目行";
    const str = String(dest).trim();
    if (str.endsWith("行")) return str;
    return str + "行";
  }

  // 車番フォーマット（「号」を付けず、数字のみ。例: 7305）
  function formatVehicleNumber(vNum) {
    if (!vNum) return "";
    return String(vNum).replace(/[^0-9A-Za-z]/g, "");
  }

  // 画面全体のレンダリング
  function render() {
    const now = Date.now();

    // 1. 右端のバーのアンカーをクリア
    Object.values(anchors).forEach(el => {
      if (el) el.innerHTML = "";
    });

    // 2. 右端のバーに電車アイコンと経過秒数をプロット
    activeTrains.forEach(t => {
      let key = "";
      if (t.status === "STOPPED") {
        key = `STOPPED:${t.fromStationCode}`;
      } else if (t.status === "RUNNING") {
        key = `RUNNING:${t.fromStationCode}->${t.toStationCode}`;
      }

      const anchor = anchors[key];
      if (!anchor) return;

      // 絶対時刻 (since) からの正確な経過秒数
      const liveElapsed = Math.max(0, Math.floor((now - t.stateSince) / 1000));
      const imgUrl = getTrainImageUrl(t.vehicleNumber);

      anchor.innerHTML = `
        <div class="bar-train-unit">
          <!-- 電車の真上に秒数（今の今までこの状態は何秒間続けられていたか） -->
          <div class="bar-train-seconds">${liveElapsed}秒</div>
          <!-- 車番系列に沿った電車画像（未該当は66000.png） -->
          <img src="${imgUrl}" class="bar-train-img" alt="${t.vehicleNumber}" />
        </div>
      `;
    });

    // 3. 左側本画面の描画
    if (activeTrains.length === 0) {
      trainCardsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">天神橋筋六丁目 方面</div>
          <div class="empty-desc">長堀橋〜北浜の区間に走行中の列車はありません</div>
        </div>
      `;
      return;
    }

    // 先発列車（最も北浜に近いメイン列車）
    const primaryTrain = activeTrains[0];
    const liveElapsed = Math.max(0, Math.floor((now - primaryTrain.stateSince) / 1000));

    // 行先と車番（白字、数字のみ）
    const destText = formatDestination(primaryTrain.destination);
    const carNoText = formatVehicleNumber(primaryTrain.vehicleNumber);

    const isAtKitahama = primaryTrain.fromStationCode === "K14" && primaryTrain.status === "STOPPED";

    let forecastHtml = "";

    if (isAtKitahama) {
      forecastHtml = `
        <div class="arrived-banner">
          北浜 到着済
          <div class="arrived-sub">(当駅停車中)</div>
        </div>
      `;
    } else {
      // 1本前、2本前、3本前の北浜駅への合計到着予想時間と次の状態になるのに必要な予想時間
      const preds = primaryTrain.predictions || {};
      const p1 = preds.prev1 || { kitahamaRemaining: 55, nextStateRemaining: 25 };
      const p2 = preds.prev2 || { kitahamaRemaining: 60, nextStateRemaining: 28 };
      const p3 = preds.prev3 || { kitahamaRemaining: 58, nextStateRemaining: 26 };

      // クライアント側で elapsed の進みに合わせてリアルタイムにカウントダウン
      // 基準時からの差分秒
      const diffSec = liveElapsed - (primaryTrain.baseElapsed || 0);

      const remArr1 = Math.max(0, (p1.kitahamaRemaining != null ? p1.kitahamaRemaining : 55) - diffSec);
      const remArr2 = Math.max(0, (p2.kitahamaRemaining != null ? p2.kitahamaRemaining : 60) - diffSec);
      const remArr3 = Math.max(0, (p3.kitahamaRemaining != null ? p3.kitahamaRemaining : 58) - diffSec);

      const remNext1 = Math.max(0, (p1.nextStateRemaining != null ? p1.nextStateRemaining : 25) - diffSec);
      const remNext2 = Math.max(0, (p2.nextStateRemaining != null ? p2.nextStateRemaining : 28) - diffSec);
      const remNext3 = Math.max(0, (p3.nextStateRemaining != null ? p3.nextStateRemaining : 26) - diffSec);

      forecastHtml = `
        <!-- 予告: 北浜駅 到着予想（1本前、2本前、3本前） -->
        <div class="forecast-section">
          <div class="forecast-header header-arrival">北浜駅 到着予想</div>
          <div class="history-3grid">
            <div class="history-card">
              <span class="history-label">1本前</span>
              <div><span class="arrival-giant-num">${remArr1}</span><span class="arrival-unit">秒</span></div>
            </div>
            <div class="history-card">
              <span class="history-label">2本前</span>
              <div><span class="arrival-giant-num">${remArr2}</span><span class="arrival-unit">秒</span></div>
            </div>
            <div class="history-card">
              <span class="history-label">3本前</span>
              <div><span class="arrival-giant-num">${remArr3}</span><span class="arrival-unit">秒</span></div>
            </div>
          </div>
        </div>

        <!-- 予告: 次の状態まで（1本前、2本前、3本前） -->
        <div class="forecast-section">
          <div class="forecast-header header-next">次の状態まで</div>
          <div class="history-3grid">
            <div class="history-card">
              <span class="history-label">1本前</span>
              <div><span class="next-sub-num">${remNext1}</span><span class="next-unit">秒</span></div>
            </div>
            <div class="history-card">
              <span class="history-label">2本前</span>
              <div><span class="next-sub-num">${remNext2}</span><span class="next-unit">秒</span></div>
            </div>
            <div class="history-card">
              <span class="history-label">3本前</span>
              <div><span class="next-sub-num">${remNext3}</span><span class="next-unit">秒</span></div>
            </div>
          </div>
        </div>
      `;
    }

    // 2本目（次発列車）がある場合のシンプルな要約表示
    let secondaryHtml = "";
    if (activeTrains.length > 1) {
      const secTrain = activeTrains[1];
      const secDest = formatDestination(secTrain.destination);
      const secCar = formatVehicleNumber(secTrain.vehicleNumber);
      const secPreds = secTrain.predictions || {};
      const secP1 = secPreds.prev1 || { kitahamaRemaining: 110 };
      const secDiff = Math.max(0, Math.floor((now - secTrain.stateSince) / 1000) - (secTrain.baseElapsed || 0));
      const secRem = Math.max(0, (secP1.kitahamaRemaining != null ? secP1.kitahamaRemaining : 110) - secDiff);

      secondaryHtml = `
        <div class="secondary-summary-row">
          <span>次発: <strong>${escapeHtml(secDest)}</strong> ${escapeHtml(secCar)}</span>
          <span>北浜まで あと <strong class="secondary-sec">${secRem}秒</strong></span>
        </div>
      `;
    }

    trainCardsContainer.innerHTML = `
      <div class="clean-main-display">
        <!-- 行先と車番（白字・大きな文字） -->
        <div class="dest-and-car-row">
          <span class="dest-text">${escapeHtml(destText)}</span>
          <span class="car-number-text">${escapeHtml(carNoText)}</span>
        </div>

        <!-- その下の予告（到着予想 ＆ 次の状態まで） -->
        ${forecastHtml}

        <!-- 次発列車（存在する場合） -->
        ${secondaryHtml}
      </div>
    `;
  }

  // サーバーデータのマージ
  function updateData(trains) {
    const now = Date.now();
    // 天神橋筋六丁目に向かう電車（上り: A）のみ
    const upTrains = (trains || []).filter(t => t.direction === "A");

    // 北浜に近い順にソート
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

    activeTrains = upTrains.map(t => {
      const serverElapsed = t.elapsedSeconds || 0;
      // サーバー側の since があれば使用、なければ現在時刻から逆算
      const stateSince = t.since || (now - serverElapsed * 1000);

      return {
        ...t,
        stateSince,
        baseElapsed: serverElapsed,
        fetchedAt: now
      };
    });

    render();
  }

  // 定期フェッチ
  async function fetchTrainData() {
    if (isFetching) return;
    isFetching = true;

    try {
      const res = await fetch("/api/trains?dir=A", {
        headers: { "Accept": "application/json" }
      });
      if (!res.ok) return;

      const data = await res.json();
      const targetTrains = data.targetTrains || data.allTargetTrains || [];
      updateData(targetTrains);
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

  // 初回フェッチ
  fetchTrainData();

  // 1.5秒ごとにサーバーと同期フェッチ
  setInterval(fetchTrainData, 1500);

  // 200msごとに高頻度で正確にカウントダウン/カウントアップを滑らかに描画
  // （秒数が変わった瞬間にパッとスムーズに更新、巻き戻り・もっさり感ゼロ）
  setInterval(render, 200);

  // バックグラウンド復帰時の即時同期
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      fetchTrainData();
      render();
    }
  });
})();
