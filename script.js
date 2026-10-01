const timeDisplay = document.getElementById('timeDisplay');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');
const muteBtn = document.getElementById('muteBtn');
const modeToggle = document.getElementById('modeToggle');
const phaseToggle = document.getElementById('phaseToggle');
const themeToggle = document.getElementById('themeToggle');
const presetButtons = document.querySelectorAll('.preset-button');
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
const splashScreen = document.getElementById('splashScreen');
const offlineBanner = document.getElementById('offlineBanner');
const customTimeEditor = document.getElementById('customTimeEditor');
const editorHours = document.getElementById('editorHours');
const editorMinutes = document.getElementById('editorMinutes');
const editorSeconds = document.getElementById('editorSeconds');
const applyTimerBtn = document.getElementById('applyTimerBtn');
const cancelTimerBtn = document.getElementById('cancelTimerBtn');
const closeTimeEditor = document.getElementById('closeTimeEditor');
const updateBanner = document.getElementById('updateBanner');

const DEFAULT_WORK_MINUTES = 20;
const DEFAULT_BREAK_MINUTES = 5;
const DEFAULT_WORK_SECONDS = DEFAULT_WORK_MINUTES * 60;
const STORAGE_KEY = 'flow-timer-state';
const CUSTOM_PRESET_KEY = 'flow-timer-custom-preset';
const CIRCLE_LENGTH = 2 * Math.PI * 100;

let totalSeconds = DEFAULT_WORK_SECONDS;
let remainingSeconds = DEFAULT_WORK_SECONDS;
let isRunning = false;
let timerId = null;
let isMuted = false;
let is24HourMode = false;
let phase = 'work';
let darkMode = true;
let audioContext = null;
let sessionCount = 0;
let breakMinutes = DEFAULT_BREAK_MINUTES;
let customPresetMinutes = null;
let focusMode = false;
let soundMode = 'classic';
let deferredPrompt = null;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
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
    currentPresetMinutes: Number(document.querySelector('.preset-button.is-active')?.dataset.minutes ?? DEFAULT_WORK_MINUTES),
    focusMode,
    soundMode
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    // ignore storage errors silently
  }
}

function formatTime(total) {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (is24HourMode) {
    return [hours, minutes, seconds]
      .map((unit) => String(unit).padStart(2, '0'))
      .join(':');
  }

  return [minutes, seconds]
    .map((unit) => String(unit).padStart(2, '0'))
    .join(':');
}

function updateProgressRing() {
  const ratio = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;
  const dashOffset = CIRCLE_LENGTH * (1 - ratio);

  progressCircle.style.strokeDasharray = String(CIRCLE_LENGTH);
  progressCircle.style.strokeDashoffset = String(dashOffset);
}

function updatePresetButtons(selectedMinutes) {
  presetButtons.forEach((button) => {
    const active = Number(button.dataset.minutes) === selectedMinutes;
    button.classList.toggle('is-active', active);
  });

  const customButton = document.querySelector('.preset-button[data-custom="true"][data-minutes="' + selectedMinutes + '"]');
  if (customButton) {
    customButton.classList.add('is-active');
  }
}

function notifyUser(message) {
  if (!('Notification' in window)) {
    return;
  }

  if (Notification.permission === 'granted') {
    new Notification(message);
    return;
  }

  if (Notification.permission === 'default') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        new Notification(message);
      }
    });
  }
}

function updatePageTitle() {
  const label = is24HourMode ? '24h' : phase === 'work' ? 'Work' : 'Break';
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  document.title = `${label} • ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateDisplay() {
  timeDisplay.textContent = formatTime(remainingSeconds);

  const displayLabel = is24HourMode
    ? '24h Countdown'
    : phase === 'work'
      ? 'Focus Session'
      : 'Break Mode';

  document.querySelector('.status-label').textContent = displayLabel;
  phaseToggle.textContent = phase === 'work' ? 'Work' : 'Break';
  phaseToggle.setAttribute('aria-pressed', String(phase === 'work'));
  sessionCountEl.textContent = String(sessionCount);

  updateProgressRing();
  updatePageTitle();
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

function setTimerByMinutes(minutes, shouldRepaint = true) {
  const safeMinutes = clamp(minutes, 0, 1439);
  totalSeconds = safeMinutes * 60;
  remainingSeconds = totalSeconds;

  if (shouldRepaint) {
    updateDisplay();
    updatePresetButtons(safeMinutes);
  }
}

function clearTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function beginCountdown() {
  if (remainingSeconds <= 0 || isRunning) return;

  isRunning = true;
  timerId = setInterval(() => {
    if (remainingSeconds > 0) {
      remainingSeconds -= 1;
      updateDisplay();
    }

    if (remainingSeconds <= 0) {
      clearTimer();
      isRunning = false;
      playCompletionTone();

      if (phase === 'work') {
        sessionCount += 1;
        phase = 'break';
        setTimerByMinutes(breakMinutes, true);
      } else {
        phase = 'work';
        setTimerByMinutes(DEFAULT_WORK_MINUTES, true);
      }

      startBtn.textContent = 'Start';
      updateDisplay();
    }
  }, 1000);
}

function stopCountdown() {
  isRunning = false;
  clearTimer();
}

function resetTimer() {
  stopCountdown();
  startBtn.textContent = 'Start';

  if (is24HourMode) {
    const customDuration = Number(hoursInput.value || 0) * 3600 + Number(minutesInput.value || 0) * 60 + Number(secondsInput.value || 0);
    totalSeconds = customDuration > 0 ? customDuration : 0;
    remainingSeconds = totalSeconds;
  } else {
    const resetMinutes = phase === 'work' ? DEFAULT_WORK_MINUTES : breakMinutes;
    totalSeconds = resetMinutes * 60;
    remainingSeconds = totalSeconds;
  }

  updateDisplay();
}

function ensureAudioContext() {
  if (!audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    audioContext = new AudioCtor();
  }
  return audioContext;
}

function playTone(frequency, startTime, duration, volume) {
  if (isMuted) return;

  const context = ensureAudioContext();
  if (!context) return;

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

function chooseTonePattern() {
  if (soundMode === 'chime') {
    return [
      { frequency: 523.25, offset: 0, duration: 0.16, volume: 0.08 },
      { frequency: 659.25, offset: 0.18, duration: 0.18, volume: 0.09 },
      { frequency: 783.99, offset: 0.36, duration: 0.22, volume: 0.1 }
    ];
  }

  if (soundMode === 'pulse') {
    return [
      { frequency: 330, offset: 0, duration: 0.1, volume: 0.06 },
      { frequency: 330, offset: 0.12, duration: 0.12, volume: 0.06 },
      { frequency: 392, offset: 0.24, duration: 0.18, volume: 0.08 },
      { frequency: 440, offset: 0.42, duration: 0.26, volume: 0.09 }
    ];
  }

  return [
    { frequency: 740, offset: 0, duration: 0.18, volume: 0.08 },
    { frequency: 880, offset: 0.2, duration: 0.18, volume: 0.09 },
    { frequency: 1040, offset: 0.4, duration: 0.28, volume: 0.1 }
  ];
}

function playCompletionTone() {
  if (isMuted) return;

  const context = ensureAudioContext();
  if (!context) return;

  const pattern = chooseTonePattern();
  const now = context.currentTime;

  pattern.forEach((tone) => {
    playTone(tone.frequency, now + tone.offset, tone.duration, tone.volume);
  });

  notifyUser(phase === 'work' ? 'Work session complete' : 'Break time is up');
}

function toggleMute() {
  isMuted = !isMuted;
  muteBtn.textContent = isMuted ? '🔇 Muted' : '🔊 Sound On';
  muteBtn.setAttribute('aria-pressed', String(isMuted));
  persistState();
}

function toggle24HourMode() {
  is24HourMode = !is24HourMode;
  modeToggle.textContent = is24HourMode ? 'Standard 20m' : '24h Mode';
  modeToggle.setAttribute('aria-pressed', String(is24HourMode));

  if (is24HourMode) {
    customPanel.classList.remove('hidden');
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;

    hoursInput.value = hours;
    minutesInput.value = minutes;
    secondsInput.value = seconds;
    totalSeconds = remainingSeconds;
  } else {
    customPanel.classList.add('hidden');
    const selectedMinutes = Math.max(1, Math.ceil(remainingSeconds / 60));
    setTimerByMinutes(selectedMinutes, true);
    updatePresetButtons(selectedMinutes);
  }

  updateDisplay();
}

function togglePhase() {
  phase = phase === 'work' ? 'break' : 'work';
  const nextMinutes = phase === 'work' ? DEFAULT_WORK_MINUTES : breakMinutes;

  stopCountdown();
  startBtn.textContent = 'Start';
  setTimerByMinutes(nextMinutes, true);
  updateDisplay();
}

function updateBreakDuration() {
  breakMinutes = clamp(Number(breakMinutesInput.value) || DEFAULT_BREAK_MINUTES, 1, 60);
  breakMinutesInput.value = String(breakMinutes);

  if (phase === 'break') {
    setTimerByMinutes(breakMinutes, true);
  }

  persistState();
  updateDisplay();
}

function setDurationFromInputs() {
  const hours = clamp(Number(hoursInput.value) || 0, 0, 23);
  const minutes = clamp(Number(minutesInput.value) || 0, 0, 59);
  const seconds = clamp(Number(secondsInput.value) || 0, 0, 59);

  hoursInput.value = hours;
  minutesInput.value = minutes;
  secondsInput.value = seconds;

  totalSeconds = hours * 3600 + minutes * 60 + seconds;
  remainingSeconds = totalSeconds;
  updateDisplay();
}

function createCustomPresetButton(minutes, label, isCustom = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'preset-button';
  button.dataset.minutes = String(minutes);
  button.dataset.custom = isCustom ? 'true' : 'false';
  button.textContent = label;

  button.addEventListener('click', () => {
    stopCountdown();
    startBtn.textContent = 'Start';
    is24HourMode = false;
    customPanel.classList.add('hidden');
    modeToggle.textContent = '24h Mode';
    modeToggle.setAttribute('aria-pressed', 'false');
    setTimerByMinutes(minutes, true);
    phase = 'work';
    updateDisplay();
  });

  return button;
}

function saveCustomPreset() {
  const total = Number(hoursInput.value || 0) * 3600 + Number(minutesInput.value || 0) * 60 + Number(secondsInput.value || 0);

  if (total <= 0) {
    return;
  }

  const minutes = Math.max(1, Math.ceil(total / 60));
  customPresetMinutes = minutes;

  const existing = document.querySelector('.preset-button[data-custom="true"][data-minutes="' + minutes + '"]');
  if (existing) {
    existing.classList.add('is-active');
    updatePresetButtons(minutes);
    persistState();
    return;
  }

  const presetRow = document.querySelector('.preset-row');
  const button = createCustomPresetButton(minutes, `${minutes} min`, true);
  presetRow.appendChild(button);

  const buttons = document.querySelectorAll('.preset-button');
  buttons.forEach((btn) => {
    btn.classList.remove('is-active');
  });
  button.classList.add('is-active');

  persistState();
}

function initializeCustomPreset() {
  const storedPreset = Number(localStorage.getItem(CUSTOM_PRESET_KEY) || '');
  if (!storedPreset || storedPreset <= 0) return;

  customPresetMinutes = storedPreset;
  const presetRow = document.querySelector('.preset-row');
  if (!document.querySelector('.preset-button[data-custom="true"]')) {
    const button = createCustomPresetButton(storedPreset, `${storedPreset} min`, true);
    presetRow.appendChild(button);
  }
}

function initializeFromStorage() {
  const saved = getSavedState();

  if (!saved) {
    setTheme(true);
    setFocusMode(false);
    setTimerByMinutes(DEFAULT_WORK_MINUTES, true);
    updateDisplay();
    return;
  }

  darkMode = !!saved.darkMode;
  isMuted = !!saved.isMuted;
  is24HourMode = !!saved.is24HourMode;
  phase = saved.phase || 'work';
  sessionCount = Number(saved.sessionCount) || 0;
  breakMinutes = Number(saved.breakMinutes) || DEFAULT_BREAK_MINUTES;
  customPresetMinutes = saved.customPresetMinutes || null;
  focusMode = !!saved.focusMode;
  soundMode = saved.soundMode || 'classic';

  setTheme(darkMode);
  setFocusMode(focusMode);
  muteBtn.textContent = isMuted ? '🔇 Muted' : '🔊 Sound On';
  muteBtn.setAttribute('aria-pressed', String(isMuted));

  modeToggle.textContent = is24HourMode ? 'Standard 20m' : '24h Mode';
  modeToggle.setAttribute('aria-pressed', String(is24HourMode));
  customPanel.classList.toggle('hidden', !is24HourMode);

  breakMinutesInput.value = String(breakMinutes);
  soundPicker.value = soundMode;
  totalSeconds = Number(saved.totalSeconds) || DEFAULT_WORK_SECONDS;
  remainingSeconds = Number(saved.remainingSeconds) || totalSeconds;

  const currentPreset = Number(saved.currentPresetMinutes) || DEFAULT_WORK_MINUTES;
  updatePresetButtons(currentPreset);

  if (customPresetMinutes) {
    const existingCustom = document.querySelector('.preset-button[data-custom="true"][data-minutes="' + customPresetMinutes + '"]');
    if (!existingCustom) {
      const button = createCustomPresetButton(customPresetMinutes, `${customPresetMinutes} min`, true);
      document.querySelector('.preset-row').appendChild(button);
    }
  }

  if (is24HourMode) {
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;
    hoursInput.value = hours;
    minutesInput.value = minutes;
    secondsInput.value = seconds;
  }

  updateDisplay();
}

function installPwa() {
  if (!deferredPrompt) {
    return;
  }

  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(() => {
    deferredPrompt = null;
  });
}

function openTimeEditor() {
  const total = remainingSeconds;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  editorHours.value = String(hours);
  editorMinutes.value = String(minutes);
  editorSeconds.value = String(seconds);
  customTimeEditor.classList.remove('hidden');
}

function closeEditor() {
  customTimeEditor.classList.add('hidden');
}

function applyCustomTime() {
  const hours = clamp(Number(editorHours.value) || 0, 0, 23);
  const minutes = clamp(Number(editorMinutes.value) || 0, 0, 59);
  const seconds = clamp(Number(editorSeconds.value) || 0, 0, 59);

  editorHours.value = String(hours);
  editorMinutes.value = String(minutes);
  editorSeconds.value = String(seconds);

  totalSeconds = hours * 3600 + minutes * 60 + seconds;
  if (totalSeconds <= 0) {
    totalSeconds = DEFAULT_WORK_SECONDS;
  }

  remainingSeconds = totalSeconds;
  is24HourMode = false;
  customPanel.classList.add('hidden');
  modeToggle.textContent = '24h Mode';
  modeToggle.setAttribute('aria-pressed', 'false');
  phase = 'work';
  stopCountdown();
  startBtn.textContent = 'Start';
  updateDisplay();
  closeEditor();
}

function refreshAppIfNeeded() {
  if (updateBanner) {
    updateBanner.classList.remove('hidden');
    setTimeout(() => {
      window.location.reload();
    }, 1200);
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((registration) => {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated') {
            refreshAppIfNeeded();
          }
        });
      });
    }).catch(() => undefined);
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'UPDATE_READY') {
      refreshAppIfNeeded();
    }
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  installBtn.style.display = 'inline-flex';
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  installBtn.style.display = 'none';
});

window.addEventListener('online', () => {
  offlineBanner.classList.add('hidden');
});

window.addEventListener('offline', () => {
  offlineBanner.classList.remove('hidden');
});

soundPicker.addEventListener('change', (event) => {
  soundMode = event.target.value;
  persistState();
});

focusToggle.addEventListener('click', () => setFocusMode(!focusMode));

if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission().catch(() => undefined);
}

if (!navigator.onLine) {
  offlineBanner.classList.remove('hidden');
}

startBtn.addEventListener('click', () => {
  if (!isRunning) {
    beginCountdown();
    startBtn.textContent = 'Running';
  }
});

stopBtn.addEventListener('click', () => {
  stopCountdown();
  startBtn.textContent = 'Start';
});

resetBtn.addEventListener('click', () => {
  resetTimer();
});

muteBtn.addEventListener('click', toggleMute);
modeToggle.addEventListener('click', toggle24HourMode);
phaseToggle.addEventListener('click', togglePhase);
themeToggle.addEventListener('click', () => setTheme(!darkMode));
breakMinutesInput.addEventListener('input', updateBreakDuration);

hoursInput.addEventListener('input', () => {
  if (is24HourMode) {
    setDurationFromInputs();
  }
});

minutesInput.addEventListener('input', () => {
  if (is24HourMode) {
    setDurationFromInputs();
  }
});

secondsInput.addEventListener('input', () => {
  if (is24HourMode) {
    setDurationFromInputs();
  }
});

presetButtons.forEach((button) => {
  button.addEventListener('click', () => {
    stopCountdown();
    startBtn.textContent = 'Start';
    const minutes = Number(button.dataset.minutes);
    phase = 'work';
    setTimerByMinutes(minutes, true);
    is24HourMode = false;
    customPanel.classList.add('hidden');
    modeToggle.textContent = '24h Mode';
    modeToggle.setAttribute('aria-pressed', 'false');
    updateDisplay();
  });
});

savePresetBtn.addEventListener('click', () => {
  saveCustomPreset();
  if (customPresetMinutes) {
    localStorage.setItem(CUSTOM_PRESET_KEY, String(customPresetMinutes));
  }
});

installBtn.addEventListener('click', installPwa);

if (deferredPrompt) {
  installBtn.style.display = 'inline-flex';
} else {
  installBtn.style.display = 'none';
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

setTimeout(() => {
  splashScreen.classList.add('hidden');
}, 1200);

timeDisplay.addEventListener('click', openTimeEditor);
applyTimerBtn.addEventListener('click', applyCustomTime);
cancelTimerBtn.addEventListener('click', closeEditor);
closeTimeEditor.addEventListener('click', closeEditor);

initializeCustomPreset();
initializeFromStorage();
