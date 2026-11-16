(() => {
  const REFRESH_INTERVAL_SEC = 10;
  let currentDirection = "A"; // "A": 天神橋筋六丁目・阪急線方面, "B": 天下茶屋方面
  let countdown = REFRESH_INTERVAL_SEC;
  let timerId = null;
  let isFetching = false;

  const trainListEl = document.getElementById("train-list");
  const updateTimerEl = document.getElementById("update-timer");
  const lastUpdatedEl = document.getElementById("last-updated");
  const refreshBtn = document.getElementById("refresh-btn");
  const tabButtons = document.querySelectorAll(".tab-btn");

  // タブ切り替えイベント
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
      countdown = REFRESH_INTERVAL_SEC;
      fetchTrainData();
    });
  });

  // 手動更新
  refreshBtn.addEventListener("click", () => {
    countdown = REFRESH_INTERVAL_SEC;
    fetchTrainData();
  });

  // 列車データ取得
  async function fetchTrainData() {
    if (isFetching) return;
    isFetching = true;
    refreshBtn.disabled = true;

    try {
      const res = await fetch(`/api/trains?dir=${currentDirection}`, {
        headers: { "Accept": "application/json" }
      });

      if (!res.ok) {
        throw new Error(`HTTP Error: ${res.status}`);
      }

      const data = await res.json();
      renderTrains(data);

      const now = new Date();
      const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      lastUpdatedEl.textContent = `最終更新: ${timeStr}`;
    } catch (err) {
      console.error("[Kitahama Monitor] Fetch error:", err);
      // すでに画面に列車が表示されている場合は上書きせず、タイマーにエラー表示
      if (!trainListEl.querySelector(".train-card")) {
        trainListEl.innerHTML = `
          <div class="error-state">
            <p>データ取得に失敗しました</p>
            <p style="font-size:0.75rem; margin-top:4px;">自動で再試行します...</p>
          </div>
        `;
      }
    } finally {
      isFetching = false;
      refreshBtn.disabled = false;
      countdown = REFRESH_INTERVAL_SEC;
    }
  }

  // レンダリング
  function renderTrains(data) {
    const trains = data.trains || [];

    if (trains.length === 0) {
      trainListEl.innerHTML = `
        <div class="empty-state">
          <p>現在接近中の列車はありません</p>
          <p style="font-size:0.75rem; margin-top:4px;">（営業時間外または全車通過済み）</p>
        </div>
      `;
      return;
    }

    trainListEl.innerHTML = "";

    trains.forEach((t, i) => {
      const card = document.createElement("div");
      card.className = "train-card";

      if (t.isAtKitahama) {
        card.classList.add("at-station");
      } else if (i === 0) {
        card.classList.add("first");
      }

      // バッジの重要度スタイル
      let distBadgeClass = "distance-badge";
      if (t.isAtKitahama) {
        distBadgeClass += " here";
      } else if (t.distanceScore <= 0.6) {
        distBadgeClass += " urgent";
      }

      card.innerHTML = `
        <div class="card-top">
          <span class="order-badge">${escapeHtml(t.orderLabel)}</span>
          <span class="vehicle-info">${t.vehicleNumber ? escapeHtml(t.vehicleNumber) + "号" : ""}</span>
        </div>
        <div class="card-middle">
          <div class="dest-group">
            <span class="dest-name">${escapeHtml(t.destination)}</span>
            <span class="dest-label">行</span>
          </div>
          <span class="${distBadgeClass}">${escapeHtml(t.distanceLabel)}</span>
        </div>
        <div class="card-bottom">
          <span class="loc-icon">📍</span>
          <span class="loc-desc">${escapeHtml(t.locationDescription)}</span>
        </div>
      `;

      trainListEl.appendChild(card);
    });
  }

  // 秒数カウントダウン管理
  function startCountdownTimer() {
    if (timerId) clearInterval(timerId);

    timerId = setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) {
        countdown = REFRESH_INTERVAL_SEC;
        fetchTrainData();
      } else {
        updateTimerEl.textContent = `${countdown}秒後に更新`;
      }
    }, 1000);
  }

  // Page Visibility API: 非アクティブタブ時の負荷軽減
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (timerId) clearInterval(timerId);
    } else {
      countdown = REFRESH_INTERVAL_SEC;
      fetchTrainData();
      startCountdownTimer();
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
  startCountdownTimer();
})();
