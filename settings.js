// ============================================================
// settings.js — 通知時間・リマインダー設定の管理
//
// 設定値は localStorage に保存されるので、
// ページを閉じても次回開いたとき自動で復元されます。
// ============================================================

// ── デフォルト設定 ──────────────────────────────────────────
const DEFAULT_SETTINGS = {
  eveningTime:      "22:00",  // 前日アラート時刻
  morningTime:      "07:00",  // 朝チェック時刻
  reminderStart:    "09:00",  // リマインダー開始時刻
  reminderEnd:      "20:00",  // リマインダー終了時刻（この時刻より後は送らない）
  reminderInterval: 3,        // リマインダー間隔（時間）
  rainThreshold:    30,       // 雨判定の降水確率（%）
};

// 現在の設定（起動時にlocalStorageから読み込む）
let SETTINGS = { ...DEFAULT_SETTINGS };

const STORAGE_KEY = "kasaremind_settings";


// ── 設定の読み込み・保存 ────────────────────────────────────

const loadSettings = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      SETTINGS = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn("設定の読み込みに失敗しました。デフォルト値を使用します。", e);
  }
};

const saveSettings = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SETTINGS));
  } catch (e) {
    console.warn("設定の保存に失敗しました。", e);
  }
};


// ── 設定UIへの反映 ─────────────────────────────────────────

const syncSettingsToUI = () => {
  document.getElementById("set-evening").value   = SETTINGS.eveningTime;
  document.getElementById("set-morning").value   = SETTINGS.morningTime;
  document.getElementById("set-rstart").value    = SETTINGS.reminderStart;
  document.getElementById("set-rend").value      = SETTINGS.reminderEnd;
  document.getElementById("set-interval").value  = String(SETTINGS.reminderInterval);
  document.getElementById("set-threshold").value = String(SETTINGS.rainThreshold);
  document.getElementById("threshold-display").textContent = SETTINGS.rainThreshold + "%";
};


// ── 設定の適用（保存ボタン押下時） ─────────────────────────

const applySettings = () => {
  // UIから値を読み取る
  SETTINGS.eveningTime      = document.getElementById("set-evening").value;
  SETTINGS.morningTime      = document.getElementById("set-morning").value;
  SETTINGS.reminderStart    = document.getElementById("set-rstart").value;
  SETTINGS.reminderEnd      = document.getElementById("set-rend").value;
  SETTINGS.reminderInterval = parseInt(document.getElementById("set-interval").value, 10);
  SETTINGS.rainThreshold    = parseInt(document.getElementById("set-threshold").value, 10);

  // バリデーション: 開始 < 終了 かチェック
  if (SETTINGS.reminderStart >= SETTINGS.reminderEnd) {
    showToast("⚠️ リマインダーの開始時刻は終了時刻より前にしてください");
    return;
  }

  // 設定を保存
  saveSettings();

  // スケジュールを再構築して画面を更新
  rebuildSchedule();

  // 雨の閾値も反映
  willRainToday = maxPopToday >= (SETTINGS.rainThreshold / 100);
  updateAdviceCard();
  updateLinePreview();

  showToast("✅ 設定を保存しました");
};


// ── 設定パネルの開閉 ────────────────────────────────────────

let settingsOpen = false;

const toggleSettings = () => {
  settingsOpen = !settingsOpen;
  const body  = document.getElementById("settings-body");
  const arrow = document.getElementById("settings-arrow");

  if (settingsOpen) {
    body.style.maxHeight  = body.scrollHeight + "px";
    body.style.opacity    = "1";
    arrow.style.transform = "rotate(90deg)";
  } else {
    body.style.maxHeight  = "0";
    body.style.opacity    = "0";
    arrow.style.transform = "rotate(0deg)";
  }
};


// ── スケジュールジョブの生成（設定から動的に作る） ────────────

const buildScheduleJobs = () => {
  const jobs = [];

  // 前日アラート
  const [eH, eM] = SETTINGS.eveningTime.split(":").map(Number);
  jobs.push({
    id:     "evening",
    hour:   eH,
    min:    eM,
    label:  `前日 ${SETTINGS.eveningTime} ─ カバン準備アラート`,
    action: () => sendEvening(),
  });

  // 朝チェック
  const [mH, mM] = SETTINGS.morningTime.split(":").map(Number);
  jobs.push({
    id:     "morning",
    hour:   mH,
    min:    mM,
    label:  `当日 ${SETTINGS.morningTime} ─ お出かけ前チェック`,
    action: () => sendMorning(),
  });

  // 日中リマインダー（開始〜終了を間隔ごとに生成）
  const [sH, sM] = SETTINGS.reminderStart.split(":").map(Number);
  const [endH, endM] = SETTINGS.reminderEnd.split(":").map(Number);
  const interval = SETTINGS.reminderInterval;

  let h = sH;
  let m = sM;
  let idx = 1;

  while (h < endH || (h === endH && m <= endM)) {
    const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    jobs.push({
      id:     `d${idx}`,
      hour:   h,
      min:    m,
      label:  `${timeStr} ─ 雨上がりリマインダー`,
      action: () => sendReminder(),
    });
    h += interval;
    idx++;
  }

  return jobs;
};
