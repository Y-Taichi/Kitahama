(() => {
  const REFRESH_INTERVAL_MS = 1000; // 1秒間隔更新
  let currentDirection = "A"; // "A": 天六・阪急方面 (上り), "B": 天下茶屋方面 (下り)
  let timerId = null;
  let isFetching = false;
  let currentData = null;

  const routeTrackEl = document.getElementById("route-track");
  const approachingCardsEl = document.getElementById("approaching-cards");
  const lastUpdatedEl = document.getElementById("last-updated");
  const trainCountEl = document.getElementById("train-count");
  const opStatusEl = document.getElementById("op-status");
  const opBannerEl = document.getElementById("operation-banner");
  const tabButtons = document.querySelectorAll(".tab-btn");

  const detailModal = document.getElementById("detail-modal");
  const modalBody = document.getElementById("modal-body");
  const modalCloseBtn = document.getElementById("modal-close-btn");

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", () => detailModal.close());
  }

  // タブ切り替え
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("active")) return;
      tabButtons.forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");

      currentDirection = btn.getAttribute("data-dir");
      fetchTrainData();
    });
  });

  // 電車イラスト SVG の生成
  function createTrainSvg(typeInfo) {
    const isHankyu = typeInfo && typeInfo.isHankyu;
    const bodyColor = isHankyu ? "#5C061F" : "#4A5568"; // 阪急マルーン vs アルミシルバー
    const stripeColor = isHankyu ? "#E2D9B7" : "#81472C"; // 阪急アイボリー屋根帯 vs 堺筋線茶色帯
    const roofColor = isHankyu ? "#3B0314" : "#2D3748";

    return `
      <svg class="train-svg-icon" viewBox="0 0 40 30" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- パンタグラフ -->
        <path d="M16 4L20 1L24 4" stroke="#A0AEC0" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="20" y1="1" x2="20" y2="5" stroke="#A0AEC0" stroke-width="1.5"/>
        <!-- 車体ベース -->
        <rect x="2" y="5" width="36" height="20" rx="3" fill="${bodyColor}" stroke="#1A202C" stroke-width="1"/>
        <!-- 屋根 -->
        <rect x="2" y="5" width="36" height="4" rx="2" fill="${roofColor}"/>
        <!-- 帯（ラインカラー） -->
        <rect x="2" y="16" width="36" height="3" fill="${stripeColor}"/>
        <!-- 窓 -->
        <rect x="6" y="9" width="7" height="6" rx="1" fill="#63B3ED"/>
        <rect x="15" y="9" width="10" height="6" rx="1" fill="#63B3ED"/>
        <rect x="27" y="9" width="7" height="6" rx="1" fill="#63B3ED"/>
        <!-- 前照灯 (ヘッドライト) -->
        <circle cx="6" cy="21" r="1.5" fill="#FAF089"/>
        <circle cx="34" cy="21" r="1.5" fill="#FAF089"/>
        <!-- 台車 / 車輪 -->
        <circle cx="9" cy="26" r="2.5" fill="#1A202C" stroke="#718096" stroke-width="1"/>
        <circle cx="31" cy="26" r="2.5" fill="#1A202C" stroke="#718096" stroke-width="1"/>
      </svg>
    `;
  }

  // 列車バッジの HTML 生成
  function createTrainBadgeHtml(train) {
    const isHankyu = train.typeInfo && train.typeInfo.isHankyu;
    const companyClass = isHankyu ? "hankyu" : "metro";
    const companyName = isHankyu ? "阪急" : "メトロ";
    const series = train.typeInfo ? train.typeInfo.series : "";

    return `
      <div class="train-illustration-badge ${companyClass}" data-vnum="${escapeHtml(train.vehicleNumber)}">
        ${createTrainSvg(train.typeInfo)}
        <div class="train-info-stack">
          <div class="train-badge-top">
            <span class="train-car-no">${escapeHtml(train.vehicleNumber || "不明")}号</span>
            <span class="train-type-pill">${escapeHtml(companyName)} ${escapeHtml(series)}</span>
          </div>
          <div class="train-badge-dest">
            ${escapeHtml(train.destination)} <small>行</small>
          </div>
        </div>
      </div>
    `;
  }

  // データフェッチ
  async function fetchTrainData() {
    if (isFetching) return;
    isFetching = true;

    try {
      const res = await fetch(`/api/trains?dir=${currentDirection}`, {
        headers: { "Accept": "application/json" }
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      currentData = data;
      renderAll(data);
    } catch (err) {
      console.error("[Kitahama Monitor] Fetch error:", err);
    } finally {
      isFetching = false;
    }
  }

  // 画面全体のレンダリング
  function renderAll(data) {
    const now = new Date();
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    lastUpdatedEl.textContent = `最終更新: ${timeStr}`;

    // 運行情報
    if (data.operation) {
      opStatusEl.textContent = data.operation.status || "平常運転";
      if (data.operation.status !== "平常運転") {
        opBannerEl.classList.remove("normal");
        opBannerEl.classList.add("warning");
      } else {
        opBannerEl.classList.remove("warning");
        opBannerEl.classList.add("normal");
      }
    }

    // 列車総数
    const trains = data.trains || [];
    trainCountEl.textContent = `在線: ${trains.length}本`;

    renderApproachingCards(data.approachingTrains || []);
    renderRouteTrack(data.stations || [], trains);
  }

  // 北浜接近列車サマリー（先発・次発）
  function renderApproachingCards(approaching) {
    if (approaching.length === 0) {
      approachingCardsEl.innerHTML = `
        <div class="summary-card">
          <div class="sum-status">接近中の列車はありません</div>
        </div>
      `;
      return;
    }

    approachingCardsEl.innerHTML = approaching.map((t, idx) => {
      let cardClass = "summary-card";
      if (t.isAtKitahama) cardClass += " at-station";
      else if (idx === 0) cardClass += " first";

      return `
        <div class="${cardClass}">
          <div class="sum-top">
            <span class="sum-order">${escapeHtml(t.orderLabel)}</span>
            <span class="sum-car">${escapeHtml(t.vehicleNumber ? t.vehicleNumber + "号" : "")}</span>
          </div>
          <div class="sum-dest">${escapeHtml(t.destination)} <span style="font-size:0.75rem; font-weight:normal;">行</span></div>
          <div class="sum-status">${escapeHtml(t.distanceLabel)} (${escapeHtml(t.locationDescription)})</div>
        </div>
      `;
    }).join("");
  }

  // 路線図型 リアルタイム全列車位置マップ
  function renderRouteTrack(stations, trains) {
    if (stations.length === 0) {
      routeTrackEl.innerHTML = `<div class="empty-state">路線データを読み込めません</div>`;
      return;
    }

    let html = "";

    stations.forEach((st, index) => {
      const isKitahama = st.code === "K14";
      const isLast = index === stations.length - 1;

      // この駅に停車中の列車を探す
      const stoppedTrains = trains.filter(t => t.slotType === "STATION" && t.atStationCode === st.code);

      // 駅ノード
      html += `
        <div class="track-node-station ${isKitahama ? 'is-kitahama' : ''}">
          <div class="station-meta">
            <span class="st-num-badge">${escapeHtml(st.code)}</span>
            <div class="st-title-group">
              <span class="st-name-text">${escapeHtml(st.name)}</span>
              ${isKitahama ? '<span class="st-kitahama-tag">★ 当駅</span>' : ''}
            </div>
          </div>
          <div class="station-train-slot">
            ${stoppedTrains.map(t => createTrainBadgeHtml(t)).join("")}
          </div>
        </div>
      `;

      // 駅と駅の間の区間 (3段階スロット: 出発直後 => 走行中 => 停車寸前)
      if (!isLast) {
        const nextSt = stations[index + 1];

        // この駅間を走る列車を抽出
        const betweenTrains = trains.filter(t => {
          if (t.slotType !== "BETWEEN" || !t.betweenSection) return false;
          return t.betweenSection.from === st.code && t.betweenSection.to === nextSt.code;
        });

        const departed = betweenTrains.filter(t => t.subPosition === "DEPARTED");
        const running = betweenTrains.filter(t => t.subPosition === "RUNNING");
        const approaching = betweenTrains.filter(t => t.subPosition === "APPROACHING");

        const hasAnyTrain = betweenTrains.length > 0;

        html += `
          <div class="track-node-between ${hasAnyTrain ? 'has-train' : ''}">
            <!-- 1. 出発直後 -->
            <div class="between-step ${departed.length > 0 ? 'has-train' : ''}">
              <span class="step-label">▼ 出発直後</span>
              <div class="step-train-slot">
                ${departed.map(t => createTrainBadgeHtml(t)).join("")}
              </div>
            </div>

            <!-- 2. 走行中 -->
            <div class="between-step ${running.length > 0 ? 'has-train' : ''}">
              <span class="step-label">▼ 走行中</span>
              <div class="step-train-slot">
                ${running.map(t => createTrainBadgeHtml(t)).join("")}
              </div>
            </div>

            <!-- 3. 停車寸前 (次駅接近) -->
            <div class="between-step ${approaching.length > 0 ? 'has-train' : ''}">
              <span class="step-label">▼ 停車寸前</span>
              <div class="step-train-slot">
                ${approaching.map(t => createTrainBadgeHtml(t)).join("")}
              </div>
            </div>
          </div>
        `;
      }
    });

    routeTrackEl.innerHTML = html;

    // バッジクリックで詳細モーダル表示
    routeTrackEl.querySelectorAll(".train-illustration-badge").forEach(badge => {
      badge.addEventListener("click", () => {
        const vNum = badge.getAttribute("data-vnum");
        showTrainModal(vNum);
      });
    });
  }

  // モーダル表示
  function showTrainModal(vehicleNumber) {
    if (!currentData || !currentData.trains) return;
    const train = currentData.trains.find(t => String(t.vehicleNumber) === String(vehicleNumber));
    if (!train) return;

    document.getElementById("modal-title").textContent = `${train.vehicleNumber}号 車両詳細`;

    let congestionHtml = "";
    if (train.congestion && train.congestion.length > 0) {
      congestionHtml = `
        <div style="margin-top:10px;">
          <div class="modal-label" style="margin-bottom:4px;">各号車の混雑度</div>
          <div class="car-grid">
            ${train.congestion.map(c => `
              <div class="car-cell">
                <div class="car-num">${c.car}号車</div>
                <div style="color:#d29922; font-weight:bold;">${c.level ? 'Lv.' + c.level : '-'}</div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }

    let tempHtml = "";
    if (train.temperature && train.temperature.length > 0) {
      tempHtml = `
        <div style="margin-top:10px;">
          <div class="modal-label" style="margin-bottom:4px;">各号車の車内温度</div>
          <div class="car-grid">
            ${train.temperature.map(c => `
              <div class="car-cell">
                <div class="car-num">${c.car}号車</div>
                <div class="car-temp">${c.temp ? c.temp + '℃' : '-'}</div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }

    modalBody.innerHTML = `
      <div class="modal-row">
        <span class="modal-label">編成番号</span>
        <span class="modal-val">${escapeHtml(train.vehicleNumber)}号</span>
      </div>
      <div class="modal-row">
        <span class="modal-label">所属 / 形式</span>
        <span class="modal-val">${escapeHtml(train.typeInfo.company)} ${escapeHtml(train.typeInfo.series)}</span>
      </div>
      <div class="modal-row">
        <span class="modal-label">行先</span>
        <span class="modal-val">${escapeHtml(train.destination)} 行</span>
      </div>
      <div class="modal-row">
        <span class="modal-label">現在位置</span>
        <span class="modal-val">${escapeHtml(train.locationDescription)}</span>
      </div>
      <div class="modal-row">
        <span class="modal-label">北浜駅との関係</span>
        <span class="modal-val">${escapeHtml(train.distanceLabel || "-")}</span>
      </div>
      ${congestionHtml}
      ${tempHtml}
    `;

    detailModal.showModal();
  }

  // 1秒ごとのポーリングタイマー
  function startPolling() {
    if (timerId) clearInterval(timerId);
    timerId = setInterval(fetchTrainData, REFRESH_INTERVAL_MS);
  }

  // Page Visibility API
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (timerId) clearInterval(timerId);
    } else {
      fetchTrainData();
      startPolling();
    }
  });

  function pad(n) {
    return n < 10 ? "0" + n : n;
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

  // 初回実行
  fetchTrainData();
  startPolling();
})();
