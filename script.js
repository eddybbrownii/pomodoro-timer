const timeDisplay = document.getElementById('timeDisplay');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');
const muteBtn = document.getElementById('muteBtn');
const modeToggle = document.getElementById('modeToggle');
const phaseToggle = document.getElementById('phaseToggle');
const themeToggle = document.getElementById('themeToggle');
const customPanel = document.getElementById('customPanel');
const progressCircle = document.getElementById('progressCircle');
const hoursInput = document.getElementById('hoursInput');
const minutesInput = document.getElementById('minutesInput');
const secondsInput = document.getElementById('secondsInput');
const sessionCountEl = document.getElementById('sessionCount');
const breakMinutesInput = document.getElementById('breakMinutesInput');
const savePresetBtn = document.getElementById('savePresetBtn');
const focusToggle = document.getElementById('focusToggle');
const soundPicker = document.getElementById('soundPicker');
const installBtn = document.getElementById('installBtn');
const offlineBanner = document.getElementById('offlineBanner');
const customTimeEditor = document.getElementById('customTimeEditor');
const editorHours = document.getElementById('editorHours');
const editorMinutes = document.getElementById('editorMinutes');
const editorSeconds = document.getElementById('editorSeconds');
const applyTimerBtn = document.getElementById('applyTimerBtn');
const cancelTimerBtn = document.getElementById('cancelTimerBtn');
const closeTimeEditor = document.getElementById('closeTimeEditor');
const backgroundUrlInput = document.getElementById('backgroundUrlInput');
const applyBackgroundBtn = document.getElementById('applyBackgroundBtn');
const backgroundUploadInput = document.getElementById('backgroundUploadInput');
const resetBackgroundBtn = document.getElementById('resetBackgroundBtn');
const backgroundPreview = document.getElementById('backgroundPreview');
const backgroundWallpaperToggle = document.getElementById('backgroundWallpaperToggle');
const backgroundPickerBtn = document.getElementById('backgroundPickerBtn');
const panelLayoutSelect = document.getElementById('panelLayoutSelect');
const stopwatchToggle = document.getElementById('stopwatchToggle');
const refreshAppBtn = document.getElementById('refreshAppBtn');
const statusLabel = document.querySelector('.status-label');
const presetRow = document.querySelector('.preset-row');

const DEFAULT_WORK_MINUTES = 20;
const DEFAULT_BREAK_MINUTES = 5;
const DEFAULT_WORK_SECONDS = DEFAULT_WORK_MINUTES * 60;
const STORAGE_KEY = 'flow-timer-state';
const CUSTOM_PRESET_KEY = 'flow-timer-custom-preset';
const CIRCLE_LENGTH = 2 * Math.PI * 100;
const BACKGROUND_KEY = 'flow-timer-background';
const PANEL_LAYOUT_KEY = 'flow-timer-panel-layout';
const PANEL_LAYOUT_OPTIONS = ['center', 'left', 'right', 'top-left', 'top-right', 'smart'];
const TICK_MS = 250;

// Each note is [frequency Hz, start offset s, duration s].
const SOUND_PATTERNS = {
  classic: [[880, 0, 0.25]],
  chime: [[659, 0, 0.4], [880, 0.25, 0.6]],
  pulse: [[660, 0, 0.12], [660, 0.22, 0.12], [660, 0.44, 0.12]]
};

let totalSeconds = DEFAULT_WORK_SECONDS;
let remainingSeconds = DEFAULT_WORK_SECONDS;
let isRunning = false;
let timerId = null;
// Timing is based on wall-clock timestamps, so the timer stays accurate when
// the tab is in the background and can resume after a reload.
let deadline = null; // countdown: when remainingSeconds reaches 0
let startedAt = null; // stopwatch: when the elapsed count was 0
let isMuted = false;
let is24HourMode = false;
let isStopwatchMode = false;
let phase = 'work';
let darkMode = true;
let audioContext = null;
let sessionCount = 0;
let breakMinutes = DEFAULT_BREAK_MINUTES;
let customPresetMinutes = null;
let focusMode = false;
let soundMode = 'classic';
let deferredPrompt = null;
let backgroundImageUrl = '';
let shouldUseWallpaper = true;
let panelLayout = 'smart';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // storage full or blocked: settings just won't persist
  }
}

function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function getSavedState() {
  try {
    const raw = safeGetItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function getActivePresetMinutes() {
  return Number(document.querySelector('.preset-button.is-active')?.dataset.minutes ?? DEFAULT_WORK_MINUTES);
}

function persistState() {
  const state = {
    totalSeconds,
    remainingSeconds,
    isMuted,
    is24HourMode,
    phase,
    darkMode,
    sessionCount,
    breakMinutes,
    customPresetMinutes,
    currentPresetMinutes: getActivePresetMinutes(),
    focusMode,
    soundMode,
    isStopwatchMode,
    runningUntil: isRunning && !isStopwatchMode ? deadline : null,
    runningSince: isRunning && isStopwatchMode ? startedAt : null
  };

  safeSetItem(STORAGE_KEY, JSON.stringify(state));
}

function formatTime(total) {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const units = isStopwatchMode || is24HourMode || hours > 0
    ? [hours, minutes, seconds]
    : [minutes, seconds];

  return units.map((unit) => String(unit).padStart(2, '0')).join(':');
}

function updateProgressRing() {
  const ratio = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;
  const dashOffset = CIRCLE_LENGTH * (1 - ratio);

  progressCircle.style.strokeDasharray = String(CIRCLE_LENGTH);
  progressCircle.style.strokeDashoffset = String(dashOffset);
}

function updatePresetButtons(selectedMinutes) {
  let matched = false;
  document.querySelectorAll('.preset-button').forEach((button) => {
    const active = !matched && Number(button.dataset.minutes) === selectedMinutes;
    button.classList.toggle('is-active', active);
    matched = matched || active;
  });
}

function requestNotificationPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      Promise.resolve(Notification.requestPermission()).catch(() => undefined);
    }
  } catch (error) {
    // notifications unsupported
  }
}

function notifyUser(message) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(message);
    }
  } catch (error) {
    // some platforms only allow notifications from a service worker
  }
}

function getModeLabel() {
  if (isStopwatchMode) return 'Stopwatch';
  if (is24HourMode) return '24h Countdown';
  return phase === 'work' ? 'Focus Session' : 'Break Mode';
}

function updateModeButtonState() {
  phaseToggle.textContent = phase === 'work' ? 'Work' : 'Break';
  phaseToggle.setAttribute('aria-pressed', String(phase === 'work'));
  phaseToggle.classList.toggle('is-active', phase === 'work' && !is24HourMode && !isStopwatchMode);

  modeToggle.textContent = is24HourMode ? '24h On' : '24h Mode';
  modeToggle.setAttribute('aria-pressed', String(is24HourMode));
  modeToggle.classList.toggle('is-active', is24HourMode);

  stopwatchToggle.textContent = isStopwatchMode ? 'Stopwatch On' : 'Stopwatch';
  stopwatchToggle.setAttribute('aria-pressed', String(isStopwatchMode));
  stopwatchToggle.classList.toggle('is-active', isStopwatchMode);

  customPanel.classList.toggle('hidden', !is24HourMode);
}

function updateDisplay() {
  const formatted = formatTime(remainingSeconds);
  timeDisplay.textContent = formatted;
  timeDisplay.classList.toggle('long', formatted.length > 5);
  statusLabel.textContent = getModeLabel();
  sessionCountEl.textContent = String(sessionCount);
  startBtn.textContent = isRunning ? 'Running' : 'Start';
  document.title = `${formatted} • ${getModeLabel()}`;

  updateProgressRing();
  updateModeButtonState();
  persistState();
}

function setTheme(isDark) {
  darkMode = isDark;
  document.body.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  themeToggle.textContent = darkMode ? '☀️' : '🌙';
  themeToggle.setAttribute('aria-label', darkMode ? 'Switch to light mode' : 'Switch to dark mode');
  persistState();
}

function setFocusMode(enabled) {
  focusMode = enabled;
  document.body.classList.toggle('focus-mode', focusMode);
  focusToggle.textContent = focusMode ? 'Focus On' : 'Focus';
  focusToggle.setAttribute('aria-pressed', String(focusMode));
  persistState();
}

function renderMuteButton() {
  muteBtn.textContent = isMuted ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-pressed', String(isMuted));
  muteBtn.setAttribute('aria-label', isMuted ? 'Unmute sound' : 'Mute sound');
}

function toggleMute() {
  isMuted = !isMuted;
  renderMuteButton();
  persistState();
}

function setTimerByMinutes(minutes) {
  totalSeconds = clamp(minutes, 0, 1439) * 60;
  remainingSeconds = totalSeconds;
}

function fillCustomInputs(total) {
  hoursInput.value = Math.floor(total / 3600);
  minutesInput.value = Math.floor((total % 3600) / 60);
  secondsInput.value = total % 60;
}

function selectPreset(minutes) {
  stopCountdown();
  is24HourMode = false;
  isStopwatchMode = false;
  phase = 'work';
  setTimerByMinutes(minutes);
  updatePresetButtons(minutes);
  updateDisplay();
}

function setStopwatchMode(enabled) {
  stopCountdown();
  isStopwatchMode = enabled;
  is24HourMode = false;
  phase = 'work';

  if (isStopwatchMode) {
    remainingSeconds = 0;
    totalSeconds = 0;
  } else {
    setTimerByMinutes(getActivePresetMinutes());
  }

  updateDisplay();
}

function toggle24HourMode() {
  stopCountdown();
  is24HourMode = !is24HourMode;

  if (isStopwatchMode) {
    isStopwatchMode = false;
    setTimerByMinutes(getActivePresetMinutes());
  }

  if (is24HourMode) {
    totalSeconds = remainingSeconds;
    fillCustomInputs(remainingSeconds);
  } else {
    setTimerByMinutes(getActivePresetMinutes());
  }

  updateDisplay();
}

function togglePhase() {
  stopCountdown();
  is24HourMode = false;
  isStopwatchMode = false;
  phase = phase === 'work' ? 'break' : 'work';
  setTimerByMinutes(phase === 'work' ? getActivePresetMinutes() : breakMinutes);
  updateDisplay();
}

function updateBreakDuration() {
  breakMinutes = clamp(Number(breakMinutesInput.value) || DEFAULT_BREAK_MINUTES, 1, 60);
  breakMinutesInput.value = String(breakMinutes);

  if (phase === 'break' && !isRunning && !is24HourMode && !isStopwatchMode) {
    setTimerByMinutes(breakMinutes);
  }

  updateDisplay();
}

function setDurationFromInputs() {
  stopCountdown();
  const hours = clamp(Number(hoursInput.value) || 0, 0, 23);
  const minutes = clamp(Number(minutesInput.value) || 0, 0, 59);
  const seconds = clamp(Number(secondsInput.value) || 0, 0, 59);

  totalSeconds = hours * 3600 + minutes * 60 + seconds;
  remainingSeconds = totalSeconds;
  updateDisplay();
}

function createCustomPresetButton(minutes) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'preset-button';
  button.dataset.minutes = String(minutes);
  button.dataset.custom = 'true';
  button.textContent = `${minutes} min`;
  button.addEventListener('click', () => selectPreset(minutes));
  return button;
}

function saveCustomPreset() {
  const total = Number(hoursInput.value || 0) * 3600 + Number(minutesInput.value || 0) * 60 + Number(secondsInput.value || 0);

  if (total <= 0) {
    return;
  }

  const minutes = Math.max(1, Math.ceil(total / 60));
  customPresetMinutes = minutes;
  safeSetItem(CUSTOM_PRESET_KEY, String(minutes));

  // Only one custom preset is kept: replace the previous one.
  document.querySelector('.preset-button[data-custom="true"]')?.remove();
  if (!document.querySelector(`.preset-button[data-minutes="${minutes}"]`)) {
    presetRow.appendChild(createCustomPresetButton(minutes));
  }

  updatePresetButtons(minutes);
  persistState();
}

function initializeCustomPreset() {
  const storedPreset = Number(safeGetItem(CUSTOM_PRESET_KEY) || '');
  if (!storedPreset || storedPreset <= 0) return;

  customPresetMinutes = storedPreset;
  if (!document.querySelector(`.preset-button[data-minutes="${storedPreset}"]`)) {
    presetRow.appendChild(createCustomPresetButton(storedPreset));
  }
}

function resumeRunningTimer(saved) {
  const now = Date.now();

  if (isStopwatchMode && saved.runningSince) {
    remainingSeconds = Math.max(0, Math.floor((now - saved.runningSince) / 1000));
    totalSeconds = Math.max(totalSeconds, remainingSeconds);
    beginCountdown();
  } else if (!isStopwatchMode && saved.runningUntil) {
    const left = Math.ceil((saved.runningUntil - now) / 1000);
    if (left > 0) {
      remainingSeconds = Math.min(left, totalSeconds);
      beginCountdown();
    } else {
      // The timer finished while the app was closed.
      completePhase(false);
    }
  }
}

function initializeFromStorage() {
  const saved = getSavedState() || {};

  isStopwatchMode = !!saved.isStopwatchMode;
  is24HourMode = !isStopwatchMode && !!saved.is24HourMode;
  phase = saved.phase === 'break' ? 'break' : 'work';
  isMuted = !!saved.isMuted;
  darkMode = saved.darkMode !== false;
  sessionCount = Number(saved.sessionCount) || 0;
  breakMinutes = clamp(Number(saved.breakMinutes) || DEFAULT_BREAK_MINUTES, 1, 60);
  focusMode = !!saved.focusMode;
  soundMode = SOUND_PATTERNS[saved.soundMode] ? saved.soundMode : 'classic';

  if (saved.currentPresetMinutes) {
    updatePresetButtons(Number(saved.currentPresetMinutes));
  }

  if (isStopwatchMode) {
    remainingSeconds = Math.max(0, Number(saved.remainingSeconds) || 0);
    totalSeconds = Math.max(remainingSeconds, Number(saved.totalSeconds) || 0);
  } else {
    totalSeconds = Number(saved.totalSeconds) || DEFAULT_WORK_SECONDS;
    remainingSeconds = clamp(Number(saved.remainingSeconds) || totalSeconds, 0, totalSeconds);
  }

  if (is24HourMode) {
    fillCustomInputs(totalSeconds);
  }

  breakMinutesInput.value = String(breakMinutes);
  soundPicker.value = soundMode;
  setTheme(darkMode);
  setFocusMode(focusMode);
  renderMuteButton();
  resumeRunningTimer(saved);
  updateDisplay();
}

function tick() {
  const now = Date.now();
  const next = isStopwatchMode
    ? Math.floor((now - startedAt) / 1000)
    : Math.max(0, Math.ceil((deadline - now) / 1000));

  if (next === remainingSeconds) {
    return;
  }

  remainingSeconds = next;
  if (isStopwatchMode) {
    totalSeconds = Math.max(totalSeconds, remainingSeconds);
  }
  updateDisplay();

  if (!isStopwatchMode && remainingSeconds <= 0) {
    completePhase(true);
  }
}

function beginCountdown() {
  if (isRunning || (!isStopwatchMode && remainingSeconds <= 0)) {
    return;
  }

  const now = Date.now();
  if (isStopwatchMode) {
    startedAt = now - remainingSeconds * 1000;
  } else {
    deadline = now + remainingSeconds * 1000;
  }

  isRunning = true;
  timerId = setInterval(tick, TICK_MS);
  updateDisplay();
}

function stopCountdown() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }

  const wasRunning = isRunning;
  isRunning = false;
  deadline = null;
  startedAt = null;

  if (wasRunning) {
    updateDisplay();
  }
}

function completePhase(withAlert) {
  stopCountdown();

  if (withAlert) {
    playAlertSound();
    notifyUser(is24HourMode ? 'Timer complete' : phase === 'work' ? 'Focus session complete' : 'Break complete');
  }

  if (is24HourMode) {
    remainingSeconds = totalSeconds;
  } else if (phase === 'work') {
    sessionCount += 1;
    phase = 'break';
    setTimerByMinutes(breakMinutes);
  } else {
    phase = 'work';
    setTimerByMinutes(getActivePresetMinutes());
  }

  updateDisplay();
}

function resetTimer() {
  stopCountdown();

  if (isStopwatchMode) {
    remainingSeconds = 0;
    totalSeconds = 0;
  } else if (is24HourMode) {
    remainingSeconds = totalSeconds;
  } else {
    setTimerByMinutes(phase === 'break' ? breakMinutes : getActivePresetMinutes());
  }

  updateDisplay();
}

// Browsers only allow audio that was unlocked by a user gesture, so the
// AudioContext is created when the user presses Start rather than when the
// timer ends.
function ensureAudioContext() {
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;

    if (!audioContext) {
      audioContext = new AudioCtor();
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    return audioContext;
  } catch (error) {
    return null;
  }
}

function playAlertSound() {
  if (isMuted) return;

  const ctx = ensureAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    (SOUND_PATTERNS[soundMode] || SOUND_PATTERNS.classic).forEach(([frequency, offset, duration]) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const start = now + offset;

      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gainNode.gain.setValueAtTime(0.15, start);
      gainNode.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
    });
  } catch (error) {
    // ignore audio errors silently
  }
}

function openTimeEditor() {
  if (isStopwatchMode) {
    return;
  }

  editorHours.value = String(Math.floor(remainingSeconds / 3600));
  editorMinutes.value = String(Math.floor((remainingSeconds % 3600) / 60));
  editorSeconds.value = String(remainingSeconds % 60);
  customTimeEditor.classList.remove('hidden');
  editorMinutes.focus();
}

function closeEditor() {
  customTimeEditor.classList.add('hidden');
}

function applyCustomTime() {
  const hours = clamp(Number(editorHours.value) || 0, 0, 23);
  const minutes = clamp(Number(editorMinutes.value) || 0, 0, 59);
  const seconds = clamp(Number(editorSeconds.value) || 0, 0, 59);
  const newTotal = hours * 3600 + minutes * 60 + seconds;

  if (newTotal <= 0) {
    return;
  }

  stopCountdown();
  totalSeconds = newTotal;
  remainingSeconds = newTotal;
  if (is24HourMode) {
    fillCustomInputs(newTotal);
  }

  closeEditor();
  updateDisplay();
}

function saveBackgroundState() {
  safeSetItem(BACKGROUND_KEY, JSON.stringify({
    url: backgroundImageUrl,
    enabled: shouldUseWallpaper,
    layout: panelLayout
  }));
}

function renderBackground() {
  backgroundPreview.style.backgroundImage = backgroundImageUrl ? `url("${backgroundImageUrl}")` : 'none';
  document.documentElement.style.setProperty(
    '--app-background-image',
    shouldUseWallpaper && backgroundImageUrl ? `url("${backgroundImageUrl}")` : 'none'
  );
}

function applyBackgroundPreference() {
  shouldUseWallpaper = backgroundWallpaperToggle.checked;
  renderBackground();
  saveBackgroundState();
}

function applyBackgroundFromUrl() {
  const value = backgroundUrlInput.value.trim();
  if (!value) {
    return;
  }

  const isLikelyImage = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(value) || value.startsWith('data:image') || value.includes('images.unsplash') || value.includes('images.pexels');
  if (!isLikelyImage) {
    return;
  }

  backgroundImageUrl = value;
  renderBackground();
  saveBackgroundState();
}

function applyBackgroundFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    backgroundImageUrl = String(reader.result || '');
    renderBackground();
    saveBackgroundState();
  };
  reader.readAsDataURL(file);
}

function resetBackgroundImage() {
  backgroundImageUrl = '';
  backgroundUrlInput.value = '';
  shouldUseWallpaper = false;
  backgroundWallpaperToggle.checked = false;
  renderBackground();
  saveBackgroundState();
}

function restoreBackgroundState() {
  let saved = {};
  try {
    saved = JSON.parse(safeGetItem(BACKGROUND_KEY) || '{}') || {};
  } catch (error) {
    saved = {};
  }

  backgroundImageUrl = saved.url || '';
  shouldUseWallpaper = saved.url ? saved.enabled !== false : true;
  backgroundUrlInput.value = saved.url && !saved.url.startsWith('data:') ? saved.url : '';
  backgroundWallpaperToggle.checked = shouldUseWallpaper;
  renderBackground();
}

// Positioning itself lives in styles.css (body[data-layout]); "smart" puts the
// panel on the left on wide screens so a wallpaper stays visible.
function applyPanelLayout(layout) {
  panelLayout = PANEL_LAYOUT_OPTIONS.includes(layout) ? layout : 'smart';
  panelLayoutSelect.value = panelLayout;
  document.body.dataset.layout = panelLayout === 'smart'
    ? (window.innerWidth >= 980 ? 'left' : 'center')
    : panelLayout;
  safeSetItem(PANEL_LAYOUT_KEY, panelLayout);
}

function restorePanelLayout() {
  applyPanelLayout(safeGetItem(PANEL_LAYOUT_KEY) || 'smart');
}

async function installPwa() {
  if (!deferredPrompt) {
    return;
  }

  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  if (choice.outcome === 'accepted') {
    installBtn.style.display = 'none';
  }
  deferredPrompt = null;
}

async function clearAppCacheAndRefresh() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (error) {
    // ignore cache cleanup failures silently
  }

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch (error) {
    // ignore service worker cleanup failures silently
  }

  window.location.reload();
}

function isTypingTarget(element) {
  return element && (element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA');
}

// --- Event wiring ---

startBtn.addEventListener('click', () => {
  ensureAudioContext();
  requestNotificationPermission();
  beginCountdown();
});
stopBtn.addEventListener('click', stopCountdown);
resetBtn.addEventListener('click', resetTimer);
muteBtn.addEventListener('click', toggleMute);
modeToggle.addEventListener('click', toggle24HourMode);
stopwatchToggle.addEventListener('click', () => setStopwatchMode(!isStopwatchMode));
phaseToggle.addEventListener('click', togglePhase);
themeToggle.addEventListener('click', () => setTheme(!darkMode));
focusToggle.addEventListener('click', () => setFocusMode(!focusMode));
breakMinutesInput.addEventListener('change', updateBreakDuration);

[hoursInput, minutesInput, secondsInput].forEach((input) => {
  input.addEventListener('change', () => {
    if (is24HourMode) {
      setDurationFromInputs();
    }
  });
});

document.querySelectorAll('.preset-button').forEach((button) => {
  button.addEventListener('click', () => selectPreset(Number(button.dataset.minutes)));
});

savePresetBtn.addEventListener('click', saveCustomPreset);

soundPicker.addEventListener('change', (event) => {
  soundMode = event.target.value;
  persistState();
  ensureAudioContext();
  playAlertSound();
});

timeDisplay.addEventListener('click', openTimeEditor);
applyTimerBtn.addEventListener('click', applyCustomTime);
cancelTimerBtn.addEventListener('click', closeEditor);
closeTimeEditor.addEventListener('click', closeEditor);
customTimeEditor.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') applyCustomTime();
});

applyBackgroundBtn.addEventListener('click', applyBackgroundFromUrl);
backgroundUrlInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    applyBackgroundFromUrl();
  }
});
backgroundUploadInput.addEventListener('change', (event) => {
  applyBackgroundFile(event.target.files?.[0]);
});
resetBackgroundBtn.addEventListener('click', resetBackgroundImage);
backgroundWallpaperToggle.addEventListener('change', applyBackgroundPreference);
backgroundPickerBtn.addEventListener('click', () => backgroundUploadInput.click());
panelLayoutSelect.addEventListener('change', (event) => applyPanelLayout(event.target.value));
refreshAppBtn.addEventListener('click', clearAppCacheAndRefresh);
installBtn.addEventListener('click', installPwa);

// Keyboard shortcuts: Space = start/stop, R = reset, Esc = close editor.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeEditor();
    return;
  }

  if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  if (event.code === 'Space') {
    event.preventDefault();
    if (isRunning) {
      stopCountdown();
    } else {
      ensureAudioContext();
      beginCountdown();
    }
  } else if (event.key === 'r' || event.key === 'R') {
    resetTimer();
  }
});

window.addEventListener('resize', () => {
  if (panelLayout === 'smart') {
    applyPanelLayout('smart');
  }
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  installBtn.style.display = 'inline-flex';
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  installBtn.style.display = 'none';
});

window.addEventListener('online', () => offlineBanner.classList.add('hidden'));
window.addEventListener('offline', () => offlineBanner.classList.remove('hidden'));
offlineBanner.classList.toggle('hidden', navigator.onLine);

// Offline support. sw.js is network-first, so local edits still show up on reload.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => undefined);
  });
}

// --- Startup ---

initializeCustomPreset();
restorePanelLayout();
restoreBackgroundState();
initializeFromStorage();
document.body.classList.add('timer-ready');
