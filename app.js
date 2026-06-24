// ============================================================
// app.js — 傘忘れ防止アプリ メインスクリプト
//
// 授業で習った fetch() を使って OpenWeatherMap API から
// 天気データを取得し、画面に表示 + LINE通知を送ります。
// ============================================================

const OWM_URL = "https://api.openweathermap.org/data/2.5/forecast";
const LINE_URL = "https://api.line.me/v2/bot/message/push";

// グローバル変数
let forecastData  = null;
let maxPopToday   = 0;
let willRainToday = false;

// スケジュール管理
let scheduleJobs = [];
let sentFlags    = {};


// ============================================================
//  1. 天気データを取得する（fetch を使う）
// ============================================================
const fetchWeather = async () => {
  const url = `${OWM_URL}?lat=${CONFIG.LAT}&lon=${CONFIG.LON}&appid=${CONFIG.OPENWEATHER_API_KEY}&units=metric&lang=ja&cnt=40`;
  const res  = await fetch(url);
  const data = await res.json();
  console.log("取得した天気データ:", data);
  return data;
};


// ============================================================
//  2. 今日の時間ごとの降水確率を表示する
// ============================================================
const displayForecast = (data) => {
  const list     = document.getElementById("forecast-list");
  list.innerHTML = "";

  const now      = new Date();
  const todayStr = now.toLocaleDateString("ja-JP");
  let hasToday   = false;
  maxPopToday    = 0;

  data.list.forEach((item) => {
    const dt    = new Date(item.dt * 1000);
    const dtStr = dt.toLocaleDateString("ja-JP");
    if (dtStr !== todayStr) return;
    hasToday = true;

    const hour    = dt.getHours();
    const pop     = item.pop;
    if (pop > maxPopToday) maxPopToday = pop;

    const percent = Math.round(pop * 100);
    const el      = document.createElement("div");
    el.className  = "forecast-item";
    el.innerHTML  = `
      <span class="forecast-time">${hour}時</span>
      <div class="bar-wrap">
        <div class="bar ${percent >= SETTINGS.rainThreshold ? 'high' : 'low'}"
             style="width: ${percent}%"></div>
      </div>
      <span class="forecast-pop">${percent}%</span>
    `;
    list.appendChild(el);
  });

  if (!hasToday) {
    list.innerHTML = '<p style="color:var(--text-sub);font-size:0.85rem;">今日のデータがありません</p>';
  }

  willRainToday = maxPopToday >= (SETTINGS.rainThreshold / 100);
};


// ============================================================
//  3. 傘アドバイスカードを更新する
// ============================================================
const updateAdviceCard = () => {
  const card    = document.getElementById("advice-card");
  const icon    = document.getElementById("advice-icon");
  const title   = document.getElementById("advice-title");
  const desc    = document.getElementById("advice-desc");
  const percent = Math.round(maxPopToday * 100);

  if (willRainToday) {
    card.className    = "card rain";
    icon.textContent  = "☂️";
    title.textContent = "今日は傘を持っていきましょう！";
    desc.textContent  = `最大降水確率 ${percent}% の予報です。\n折りたたみ傘をカバンに入れることをおすすめします。`;
  } else {
    card.className    = "card clear";
    icon.textContent  = "☀️";
    title.textContent = "今日は傘は不要です！";
    desc.textContent  = `最大降水確率 ${percent}% の予報です。\nお出かけ日和ですね！`;
  }
};


// ============================================================
//  4. LINE プレビューを更新する
// ============================================================
const updateLinePreview = () => {
  const percent = Math.round(maxPopToday * 100);
  const city    = CONFIG.CITY_NAME;
  const msg     = willRainToday
    ? `🌂【今日のお出かけ前チェック】\n\n${city}の今日は雨の予報です（降水確率 ${percent}%）。\n\n折りたたみ傘をお忘れなく！`
    : `☀️【今日は晴れです！】\n\n${city}の今日は傘は不要です（降水確率 ${percent}%）。\n\n良い一日を！`;
  document.getElementById("line-preview-text").textContent = msg;
};


// ============================================================
//  5. LINE Messaging API でメッセージを送る
// ============================================================
const sendLineMessage = async (text) => {
  const body = {
    to:       CONFIG.LINE_USER_ID,
    messages: [{ type: "text", text }],
  };

  try {
    const res = await fetch(LINE_URL, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${CONFIG.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      showToast("✅ LINEに送信しました！");
    } else {
      showToast("⚠️ 送信エラー（コンソールを確認）");
      console.error("LINE送信エラー:", await res.json());
    }
  } catch (e) {
    showToast("⚠️ CORS制限: サーバー経由での送信が必要です");
    console.warn("送信しようとしたメッセージ:", text);
  }
};

const sendEvening = () => {
  const percent = Math.round(maxPopToday * 100);
  const msg = `☂️【明日の傘リマインダー】\n\n${CONFIG.CITY_NAME}の明日は雨の予報です（降水確率 ${percent}%）。\n\n今夜のうちに折りたたみ傘をカバンに入れておきましょう！`;
  sendLineMessage(msg);
};

const sendMorning = () => {
  const percent = Math.round(maxPopToday * 100);
  const msg = willRainToday
    ? `🌂【今日のお出かけ前チェック】\n\n${CONFIG.CITY_NAME}の今日は雨の予報です（降水確率 ${percent}%）。\n\n折りたたみ傘をお忘れなく！`
    : `☀️ 今日の${CONFIG.CITY_NAME}は晴れです（降水確率 ${percent}%）。傘は不要です！`;
  sendLineMessage(msg);
};

const sendReminder = () => {
  const msg = `🌤️【傘の置き忘れに注意！】\n\n${CONFIG.CITY_NAME}では雨が止みました。\n\n職場・学校・コンビニなどに傘を置いてきていませんか？\n帰宅前にもう一度確認してみてください！`;
  sendLineMessage(msg);
};


// ============================================================
//  6. スケジュール管理（設定から動的に生成・再構築）
// ============================================================

// スケジュールのHTML要素を丸ごと再生成する
const renderScheduleList = () => {
  const list     = document.getElementById("schedule-list");
  list.innerHTML = "";

  scheduleJobs.forEach((job) => {
    const item       = document.createElement("div");
    item.className   = "schedule-item";
    item.id          = `sched-${job.id}`;
    item.innerHTML   = `
      <span class="schedule-dot" id="dot-${job.id}"></span>
      <span class="schedule-text">${job.label}</span>
      <span class="schedule-time" id="time-${job.id}">待機中</span>
    `;
    list.appendChild(item);
  });
};

// 設定が変わったときにスケジュールを再構築する
const rebuildSchedule = () => {
  // 新しいジョブリストを生成
  scheduleJobs = buildScheduleJobs();

  // 送信済みフラグを引き継ぎつつ再構築
  const newFlags = {};
  scheduleJobs.forEach((job) => {
    newFlags[job.id] = sentFlags[job.id] || false;
  });
  sentFlags = newFlags;

  // HTML を再生成してUIを更新
  renderScheduleList();
  updateScheduleUI();
};

// 各ドットと時刻テキストの状態を更新する
const updateScheduleUI = () => {
  const now  = new Date();
  const nowH = now.getHours();
  const nowM = now.getMinutes();

  scheduleJobs.forEach((job) => {
    const dot  = document.getElementById(`dot-${job.id}`);
    const time = document.getElementById(`time-${job.id}`);
    if (!dot || !time) return;

    if (sentFlags[job.id]) {
      dot.className    = "schedule-dot sent";
      time.textContent = "✅ 送信済み";
      return;
    }

    const isPast = nowH > job.hour || (nowH === job.hour && nowM >= job.min);
    dot.className    = isPast ? "schedule-dot" : "schedule-dot active";
    time.textContent = isPast ? "通知不要（晴れ）" : "待機中";
  });
};

// 毎分呼ばれる。時間が来たら通知を送る
const runScheduler = () => {
  const now  = new Date();
  const nowH = now.getHours();
  const nowM = now.getMinutes();

  scheduleJobs.forEach((job) => {
    if (sentFlags[job.id]) return;

    if (nowH === job.hour && nowM === job.min) {
      if (job.id === "evening" || willRainToday) {
        console.log(`スケジュール実行: ${job.label}`);
        job.action();
        sentFlags[job.id] = true;
        updateScheduleUI();
      }
    }
  });
};


// ============================================================
//  7. 現在時刻を表示する
// ============================================================
const updateClock = () => {
  const now = new Date();
  const str = now.toLocaleString("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  document.getElementById("city-time").textContent = `${CONFIG.CITY_NAME} ｜ ${str}`;
};


// ============================================================
//  8. トースト通知
// ============================================================
const showToast = (msg) => {
  const toast      = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
};


// ============================================================
//  9. アプリの起動処理
// ============================================================
const init = async () => {
  // ① 設定をlocalStorageから読み込む
  loadSettings();

  // ② 設定UIに反映する
  syncSettingsToUI();

  // ③ 時計をスタート
  updateClock();
  setInterval(updateClock, 1000);

  try {
    // ④ 天気データを取得
    forecastData = await fetchWeather();

    // ⑤ 各カードを表示
    document.getElementById("loading").style.display       = "none";
    document.getElementById("advice-card").style.display   = "block";
    document.getElementById("forecast-card").style.display = "block";
    document.getElementById("line-section").style.display  = "block";
    document.getElementById("settings-card").style.display = "block";
    document.getElementById("schedule-card").style.display = "block";

    // 設定パネルを初期状態（閉じた状態）に
    const body = document.getElementById("settings-body");
    body.style.maxHeight = "0";
    body.style.opacity   = "0";

    // ⑥ 天気・アドバイス・LINEプレビューを表示
    displayForecast(forecastData);
    updateAdviceCard();
    updateLinePreview();

    // ⑦ スケジュールを設定から生成して表示
    rebuildSchedule();

    // ⑧ 毎分スケジューラーを実行
    setInterval(() => {
      runScheduler();
      updateScheduleUI();
    }, 60 * 1000);

    // ⑨ 30分おきに天気を再取得
    setInterval(async () => {
      forecastData = await fetchWeather();
      displayForecast(forecastData);
      updateAdviceCard();
      updateLinePreview();
    }, 30 * 60 * 1000);

    showToast(`✅ ${CONFIG.CITY_NAME}の天気データを取得しました`);

  } catch (e) {
    document.getElementById("loading").textContent =
      "❌ データ取得エラー。config.js のAPIキーを確認してください。";
    console.error("初期化エラー:", e);
  }
};

window.addEventListener("DOMContentLoaded", init);
