// script.js — отказоустойчивая версия с диагностикой и исправленной логикой подсчёта игровых шагов
// Замените полностью текущий script.js на этот файл.

const STORAGE_KEY = 'warquest_progress_v1';

let clues = [];
let currentIndex = 0; // индекс в массиве clues (0..n-1)
let savedState = { currentIndex: 0, completed: [] };

const mapImage = document.getElementById('map-image');
const stepTitle = document.getElementById('step-title');
const stepText = document.getElementById('step-text');
const completedCounter = document.getElementById('completed');
const totalCounter = document.getElementById('total');
const viewer = document.getElementById('viewer');
const viewerImg = document.getElementById('viewer-img');
const viewerDesc = document.getElementById('viewer-desc');
const viewerTitle = document.getElementById('viewer-title');
const viewerResult = document.getElementById('viewer-result');
const viewerNext = document.getElementById('viewer-next');
const viewerClose = document.getElementById('viewer-close');
const viewerClose2 = document.getElementById('viewer-close-2');

const playBtn = document.getElementById('play-announcement');
const levitanAudio = document.getElementById('levitan-audio');
const resetBtn = document.getElementById('reset-progress');
const cardNext = document.getElementById('card-next');

let hotspotCount = 0;
let gameIndexes = []; // индексы игровых шагов (без isExtra и без noHotspot)
let gameTotal = 0;

function showErrorInUI(title, details) {
  try {
    if (stepTitle) stepTitle.textContent = title;
    if (stepText) stepText.innerHTML = `<strong style="color:#b33">${escapeHtml(title)}</strong><div style="color:#666;margin-top:6px;">${escapeHtml(details)}</div>`;
  } catch (e) {
    console.error('Не удалось вывести ошибку в UI', e);
  }
}

// Основная функция загрузки подсказок
async function loadClues() {
  try {
    if (!stepTitle || !stepText || !mapImage || !completedCounter || !totalCounter) {
      console.warn('Некоторые элементы DOM не найдены, отладочные данные в консоли.');
    }

    stepTitle && (stepTitle.textContent = 'Загрузка...');
    stepText && (stepText.textContent = 'Загружаю подсказки...');

    const res = await fetch('data/clues.json', { cache: 'no-store' });
    if (!res.ok) {
      const msg = `HTTP ${res.status} ${res.statusText} при запросе data/clues.json`;
      console.error(msg);
      showErrorInUI('Ошибка загрузки', msg + '. Проверьте, доступен ли файл data/clues.json.');
      return;
    }

    const text = await res.text();
    try {
      clues = JSON.parse(text);
    } catch (parseErr) {
      console.error('Ошибка парсинга data/clues.json:', parseErr);
      showErrorInUI('Ошибка парсинга JSON', parseErr.message + '. Проверьте валидность data/clues.json (нет комментариев/лишних запятых).');
      return;
    }

    if (!Array.isArray(clues) || clues.length === 0) {
      showErrorInUI('Неверный формат подсказок', 'data/clues.json пуст или не является массивом.');
      return;
    }

    console.info('clues загружены, элементов:', clues.length);
    console.log('Первые элементы:', clues.slice(0,3));

    // Восстановление прогресса из localStorage
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.completed)) savedState = parsed;
      } catch (e) {
        console.warn('Неверный формат savedState в localStorage, сбрасываем', e);
      }
    }

    if (typeof savedState.currentIndex !== 'number') savedState.currentIndex = 0;

    // Формируем список игровых индексов: исключаем isExtra и полностью скрытые noHotspot
    gameIndexes = clues.map((c, idx) => ({ c, idx }))
      .filter(x => !x.c.isExtra && !x.c.noHotspot)
      .map(x => x.idx);

    gameTotal = gameIndexes.length;
    console.info('Игровых шагов (gameTotal):', gameTotal);

    // Вычисляем стартовый текущий индекс
    let startIdx = savedState.currentIndex || 0;
    if (!clues[startIdx] || clues[startIdx].isExtra || clues[startIdx].noHotspot) {
      // если savedState указывает на неигровой индекс — найдём ближайший игровой
      startIdx = gameIndexes.find(idx => idx >= (savedState.currentIndex || 0)) ?? gameIndexes[0] ?? 0;
    }
    // если уже пройден — найдём первый непройденный игровой
    if (savedState.completed && savedState.completed.includes(startIdx)) {
      const nextGame = gameIndexes.find(idx => !savedState.completed.includes(idx));
      if (typeof nextGame !== 'undefined') startIdx = nextGame;
    }
    currentIndex = startIdx;

    generateHotspotsRandomized();

    // Отобразим счётчики игровых шагов
    totalCounter && (totalCounter.textContent = gameTotal);
    const doneGames = savedState.completed.filter(idx => gameIndexes.includes(idx)).length;
    completedCounter && (completedCounter.textContent = doneGames);

    renderStep();
    attachUIHandlers();

  } catch (err) {
    console.error('Ошибка в loadClues:', err);
    showErrorInUI('Ошибка при инициализации', err && err.message ? err.message : String(err));
  }
}

function attachUIHandlers() {
  try {
    if (playBtn) {
      playBtn.onclick = async () => {
        const c = clues[currentIndex];
        if (!c || !c.audio) return;
        try {
          levitanAudio.src = c.audio;
          levitanAudio.load();
          await levitanAudio.play();
        } catch (e) {
          console.error('Ошибка воспроизведения аудио', e);
          alert('Не удалось воспроизвести аудио. Откройте консоль (F12) для подробностей.');
        }
      };
    }
    if (resetBtn) {
      resetBtn.onclick = () => {
        if (!confirm('Сбросить прогресс?')) return;
        resetProgress();
      };
    }
    if (cardNext) {
      cardNext.onclick = () => advanceStep();
    }
    if (viewerClose) viewerClose.onclick = closeViewer;
    if (viewerClose2) viewerClose2.onclick = closeViewer;
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeViewer(); });
  } catch (e) {
    console.warn('Не удалось навесить некоторые UI обработчики', e);
  }
}

// Генерация hotspot'ов
function generateHotspotsRandomized() {
  try {
    Array.from(mapImage.querySelectorAll('.hotspot')).forEach(n => n.remove());
  } catch (e) {
    console.warn('mapImage возможно отсутствует в DOM', e);
  }

  const placed = [];
  const frag = document.createDocumentFragment();
  const tryLimit = 50;
  const minGap = 8;

  hotspotCount = 0;

  for (let i = 0; i < clues.length; i++) {
    const c = clues[i];
    if (c.noHotspot) continue; // невидимые

    hotspotCount++;

    let leftPct, topPct;
    if (c.left && c.top) {
      leftPct = parseFloat(String(c.left).replace('%', '')) || (6 + Math.random() * 88);
      topPct = parseFloat(String(c.top).replace('%', '')) || (8 + Math.random() * 78);
    } else {
      let attempts = 0, ok = false;
      while (attempts < tryLimit && !ok) {
        leftPct = 6 + Math.random() * 88;
        topPct = 8 + Math.random() * 78;
        ok = true;
        for (const p of placed) {
          const dx = Math.abs(p.left - leftPct);
          const dy = Math.abs(p.top - topPct);
          if (Math.hypot(dx, dy) < minGap) { ok = false; break; }
        }
        attempts++;
      }
      if (!ok) { leftPct = 10 + Math.random() * 80; topPct = 10 + Math.random() * 70; }
    }
    placed.push({ left: leftPct, top: topPct });

    const btn = document.createElement('button');
    btn.className = 'hotspot';
    btn.setAttribute('data-index', i);
    btn.setAttribute('aria-label', c.objectName || c.title || `Объект ${i+1}`);
    btn.style.left = `${leftPct.toFixed(2)}%`;
    btn.style.top = `${topPct.toFixed(2)}%`;

    const img = document.createElement('img');
    img.src = c.thumb || c.media || c.photo || 'assets/placeholder.jpg';
    img.alt = c.objectName || c.title || `миниатюра ${i+1}`;

    btn.appendChild(img);

    if (savedState.completed && savedState.completed.includes(i)) btn.classList.add('completed');

    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      const clickedIndex = Number(btn.dataset.index);
      handleClick(clickedIndex, btn);
    });

    frag.appendChild(btn);
  }

  try {
    mapImage.appendChild(frag);
  } catch (e) {
    console.error('Не удалось добавить hotspots на карту', e);
    showErrorInUI('Ошибка отображения карты', 'Проверьте, что элемент с id="map-image" присутствует в разметке.');
  }
}

function renderStep() {
  try {
    const c = clues[currentIndex];
    stepTitle && (stepTitle.textContent = c ? (c.title || `Шаг ${currentIndex + 1}`) : '—');
    const clueText = c ? (c.clue || c.text || '') : '';
    stepText && (stepText.innerHTML = `<strong>Подсказка:</strong> ${escapeHtml(clueText)}`);

    updatePlayButtonVisibility();
    updateCardNextVisibility(c);
  } catch (e) {
    console.error('Ошибка renderStep', e);
  }
}

function updatePlayButtonVisibility() {
  const c = clues[currentIndex];
  if (c && c.audio) playBtn && (playBtn.style.display = '');
  else playBtn && (playBtn.style.display = 'none');
}

function updateCardNextVisibility(c) {
  if (c && c.noHotspot) cardNext && cardNext.classList.remove('hidden');
  else cardNext && cardNext.classList.add('hidden');
}

function handleClick(clickedIndex, btnElement) {
  try {
    const current = clues[currentIndex];
    const clicked = clues[clickedIndex];

    viewerImg && (viewerImg.src = clicked.media || clicked.photo || clicked.thumb || 'assets/placeholder-large.jpg');
    viewerImg && (viewerImg.alt = clicked.objectName || clicked.title || '');
    viewerTitle && (viewerTitle.textContent = clicked.objectName || clicked.title || `Объект ${clickedIndex + 1}`);
    viewerDesc && (viewerDesc.textContent = clicked.descr || clicked.objectDesc || clicked.clue || '');

    if (clicked.isExtra) {
      viewerResult && (viewerResult.textContent = '');
      viewerResult && (viewerResult.className = 'viewer-result');
      viewerNext && viewerNext.classList.add('hidden');
      viewerNext && (viewerNext.onclick = null);
      openViewer();
      return;
    }

    if (clickedIndex === currentIndex) {
      viewerResult && (viewerResult.textContent = 'Правильно', viewerResult.className = 'viewer-result ok');
      viewerNext && viewerNext.classList.remove('hidden');
      viewerNext && (viewerNext.onclick = () => {
        markCompleted(clickedIndex, btnElement);
        closeViewer();
        advanceStep();
      });
    } else {
      viewerResult && (viewerResult.textContent = 'Неверно', viewerResult.className = 'viewer-result bad');
      viewerNext && viewerNext.classList.add('hidden');
      viewerNext && (viewerNext.onclick = null);
    }

    openViewer();
  } catch (e) {
    console.error('Ошибка handleClick', e);
  }
}

function openViewer() {
  viewer && viewer.classList.remove('hidden');
  setTimeout(() => {
    if (!viewer || viewer.classList.contains('hidden')) return;
    try {
      if (viewerNext && !viewerNext.classList.contains('hidden')) viewerNext.focus();
      else viewerClose && viewerClose.focus();
    } catch (e) { /* ignore */ }
  }, 60);
}

function closeViewer() {
  viewer && viewer.classList.add('hidden');
}

function markCompleted(index, btnElement) {
  try {
    const btn = btnElement || document.querySelector(`.hotspot[data-index="${index}"]`);
    if (btn) btn.classList.add('completed');

    // добавляем в savedState только если это игровой индекс
    if (gameIndexes.includes(index) && !savedState.completed.includes(index)) {
      savedState.completed.push(index);
    }

    const doneGames = savedState.completed.filter(idx => gameIndexes.includes(idx)).length;
    completedCounter && (completedCounter.textContent = doneGames);

    saveState();

    const allDone = gameIndexes.every(idx => savedState.completed.includes(idx));
    if (allDone) {
      savedState.currentIndex = clues.length - 1;
      saveState();
      // перенаправляем на страницу победы
      window.location.href = 'victory.html';
    }
  } catch (e) {
    console.error('Ошибка markCompleted', e);
  }
}

function advanceStep() {
  // следующий непройденный игровой шаг после currentIndex
  const nextAfter = gameIndexes.find(idx => idx > currentIndex && !savedState.completed.includes(idx));
  if (typeof nextAfter !== 'undefined') {
    currentIndex = nextAfter;
    savedState.currentIndex = currentIndex;
    saveState();
    renderStep();
    return;
  }

  // любой непройденный игровой шаг
  const any = gameIndexes.find(idx => !savedState.completed.includes(idx));
  if (typeof any !== 'undefined') {
    currentIndex = any;
    savedState.currentIndex = currentIndex;
    saveState();
    renderStep();
    return;
  }

  // все пройдены
  savedState.currentIndex = clues.length - 1;
  saveState();
  window.location.href = 'victory.html';
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
  } catch (e) {
    console.warn('Не удалось сохранить прогресс', e);
  }
}

function resetProgress() {
  savedState = { currentIndex: 0, completed: [] };
  saveState();
  document.querySelectorAll('.hotspot.completed').forEach(n => n.classList.remove('completed'));
  completedCounter && (completedCounter.textContent = 0);
  currentIndex = gameIndexes.length ? gameIndexes[0] : 0;
  renderStep();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  // Будем пытаться загрузить JSON и инициализировать интерфейс
  loadClues().catch(err => {
    console.error('Unhandled error in loadClues:', err);
    showErrorInUI('Ошибка инициализации', err && err.message ? err.message : String(err));
  });
});