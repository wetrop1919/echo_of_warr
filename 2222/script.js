// script.js — стабильная версия (восстановление рабочей логики "версия 7")
// Простая, надёжная реализация: загрузка data/clues.json, генерация hotspot'ов,
// модал просмотра, проверка правильности, сохранение прогресса в localStorage.

const STORAGE_KEY = 'warquest_progress_v1';

let clues = [];
let currentIndex = 0;
let savedState = { currentIndex: 0, completed: [] };

const mapImage = document.getElementById('map-image');
const stepTitle = document.getElementById('step-title');
const stepText = document.getElementById('step-text');
const completedCounter = document.getElementById('completed');
const totalCounter = document.getElementById('total');

const viewer = document.getElementById('viewer');
const viewerImg = document.getElementById('viewer-img');
const viewerTitle = document.getElementById('viewer-title');
const viewerDesc = document.getElementById('viewer-desc');
const viewerResult = document.getElementById('viewer-result');
const viewerNext = document.getElementById('viewer-next');
const viewerClose = document.getElementById('viewer-close');
const viewerClose2 = document.getElementById('viewer-close-2');

const playBtn = document.getElementById('play-announcement');
const levitanAudio = document.getElementById('levitan-audio');
const resetBtn = document.getElementById('reset-progress');
const cardNext = document.getElementById('card-next');

let gameIndexes = []; // игровые индексы (без isExtra и без noHotspot)
let gameTotal = 0;

// --- Утилиты ---
function escapeHtml(str){ if(!str) return ''; return String(str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function log(...args){ console.log('[quest]', ...args); }

// --- UI ошибки ---
function showError(msg){
  if(stepTitle) stepTitle.textContent = 'Ошибка';
  if(stepText) stepText.textContent = msg;
  console.error(msg);
}

// --- Загрузка подсказок ---
async function loadClues(){
  try {
    if(stepTitle) stepTitle.textContent = 'Загрузка...';
    if(stepText) stepText.textContent = 'Загружаю подсказки...';

    const res = await fetch('data/clues.json', { cache: 'no-store' });
    if(!res.ok){
      showError(`HTTP ${res.status} ${res.statusText} при запросе data/clues.json`);
      return;
    }
    clues = await res.json();
    if(!Array.isArray(clues) || clues.length === 0){
      showError('data/clues.json пуст или не массив');
      return;
    }

    // восстановление состояния
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      try { const p = JSON.parse(raw); if(p && Array.isArray(p.completed)) savedState = p; } catch(e){ console.warn('savedState parse failed', e); }
    }
    if(typeof savedState.currentIndex !== 'number') savedState.currentIndex = 0;

    // построим список игровых индексов
    gameIndexes = [];
    clues.forEach((c, idx) => {
      if(!c.isExtra && !c.noHotspot) gameIndexes.push(idx);
    });
    gameTotal = gameIndexes.length;

    // установим currentIndex: если сохраненный указывает не на игровой — найдем первый игровой
    let start = savedState.currentIndex || 0;
    if(!clues[start] || clues[start].isExtra || clues[start].noHotspot){
      start = gameIndexes.find(i => !savedState.completed.includes(i)) ?? (gameIndexes[0] ?? 0);
    } else if(savedState.completed && savedState.completed.includes(start)){
      start = gameIndexes.find(i => !savedState.completed.includes(i)) ?? (gameIndexes[0] ?? 0);
    }
    currentIndex = start;

    // отрисуем все
    generateHotspots();
    updateCounters();
    renderStep();
    attachHandlers();

  } catch(err){
    showError('Ошибка при загрузке подсказок: ' + (err && err.message ? err.message : String(err)));
  }
}

// --- Генерация hotspot'ов ---
function generateHotspots(){
  if(!mapImage) { showError('Элемент карты не найден (id="map-image")'); return; }
  // очистим
  Array.from(mapImage.querySelectorAll('.hotspot')).forEach(n => n.remove());

  const placed = [];
  const frag = document.createDocumentFragment();
  const tryLimit = 40;
  const minGap = 7;

  for(let i=0;i<clues.length;i++){
    const c = clues[i];
    if(c.noHotspot) continue;

    // позиция: если left/top заданы — используем, иначе случайно
    let left = 6 + Math.random()*88;
    let top = 8 + Math.random()*78;
    if(c.left && c.top){
      const parsedL = parseFloat(String(c.left).replace('%',''));
      const parsedT = parseFloat(String(c.top).replace('%',''));
      if(!isNaN(parsedL) && !isNaN(parsedT)){ left = parsedL; top = parsedT; }
    } else {
      let attempts = 0, ok = false;
      while(attempts < tryLimit && !ok){
        left = 6 + Math.random()*88;
        top = 8 + Math.random()*78;
        ok = true;
        for(const p of placed){ if(Math.hypot(p.left-left, p.top-top) < minGap) { ok = false; break; } }
        attempts++;
      }
    }
    placed.push({ left, top });

    const btn = document.createElement('button');
    btn.className = 'hotspot';
    btn.type = 'button';
    btn.setAttribute('data-index', i);
    btn.style.left = `${left}%`;
    btn.style.top = `${top}%`;
    btn.setAttribute('aria-label', c.objectName || c.title || `Объект ${i+1}`);

    const img = document.createElement('img');
    img.src = c.thumb || c.media || c.photo || 'assets/placeholder.jpg';
    img.alt = c.objectName || c.title || `миниатюра ${i+1}`;
    img.draggable = false;

    btn.appendChild(img);

    // основной обработчик
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      const idx = Number(btn.getAttribute('data-index'));
      log('hotspot click', idx);
      handleClick(idx, btn);
    });

    frag.appendChild(btn);
  }

  mapImage.appendChild(frag);
}

// --- Отобразить шаг (карточка справа) ---
function renderStep(){
  const c = clues[currentIndex];
  if(!c){ stepTitle && (stepTitle.textContent = '—'); stepText && (stepText.textContent = ''); return; }
  stepTitle && (stepTitle.textContent = c.title || `Шаг ${currentIndex+1}`);
  stepText && (stepText.innerHTML = `<strong>Подсказка:</strong> ${escapeHtml(c.clue || c.text || '')}`);
  updatePlayButtonVisibility();
  updateCardNextVisibility(c);
}

// --- Кнопки play и cardNext видимость ---
function updatePlayButtonVisibility(){
  const c = clues[currentIndex];
  if(playBtn) playBtn.style.display = (c && c.audio) ? '' : 'none';
}
function updateCardNextVisibility(c){
  if(cardNext) cardNext.classList.toggle('hidden', !(c && c.noHotspot));
}

// --- Обработка клика по миниатюре ---
function handleClick(clickedIndex, btnElement){
  const current = clues[currentIndex];
  const clicked = clues[clickedIndex];
  if(!clicked){
    log('clicked undefined', clickedIndex);
    return;
  }

  // заполним модал
  if(viewerImg) viewerImg.src = clicked.media || clicked.photo || clicked.thumb || 'assets/placeholder-large.jpg';
  if(viewerImg) viewerImg.alt = clicked.objectName || clicked.title || '';
  if(viewerTitle) viewerTitle.textContent = clicked.objectName || clicked.title || `Объект ${clickedIndex+1}`;
  if(viewerDesc) viewerDesc.textContent = clicked.descr || clicked.objectDesc || clicked.clue || '';

  // информационные экспонаты (isExtra) — просто показать информацию, не трогаем прогресс
  if(clicked.isExtra){
    if(viewerResult) { viewerResult.textContent = ''; viewerResult.className = 'viewer-result'; }
    if(viewerNext) { viewerNext.classList.add('hidden'); viewerNext.onclick = null; }
    openViewer();
    return;
  }

  // игровая логика
  if(clickedIndex === currentIndex){
    if(viewerResult) { viewerResult.textContent = 'Правильно'; viewerResult.className = 'viewer-result ok'; }
    if(viewerNext){
      viewerNext.classList.remove('hidden');
      viewerNext.onclick = () => {
        markCompleted(clickedIndex, btnElement);
        closeViewer();
        advanceStep();
      };
    }
  } else {
    if(viewerResult) { viewerResult.textContent = 'Неверно'; viewerResult.className = 'viewer-result bad'; }
    if(viewerNext){ viewerNext.classList.add('hidden'); viewerNext.onclick = null; }
  }

  openViewer();
}

// --- Открыть / закрыть модал (явно выставляем display) ---
function openViewer(){
  if(!viewer){
    alert('Описание: ' + (viewerTitle ? viewerTitle.textContent : '') + '\n\n' + (viewerDesc ? viewerDesc.textContent : ''));
    return;
  }
  viewer.classList.remove('hidden');
  try { viewer.style.display = 'flex'; viewer.style.zIndex = 9999; } catch(e){ /* ignore */ }
  setTimeout(()=> {
    if(viewerNext && !viewerNext.classList.contains('hidden')) viewerNext.focus();
    else if(viewerClose) viewerClose.focus();
  }, 60);
}
function closeViewer(){
  if(!viewer) return;
  viewer.classList.add('hidden');
  try { viewer.style.display = 'none'; } catch(e){ /* ignore */ }
}

// --- Отметить как пройденный и сохранить ---
function markCompleted(index, btnElement){
  const btn = btnElement || document.querySelector(`.hotspot[data-index="${index}"]`);
  if(btn) btn.classList.add('completed');

  if(!savedState.completed.includes(index) && gameIndexes.includes(index)){
    savedState.completed.push(index);
  }
  updateCounters();
  saveState();

  // проверяем победу по игровым индексам
  const allDone = gameIndexes.every(i => savedState.completed.includes(i));
  if(allDone){
    savedState.currentIndex = clues.length - 1;
    saveState();
    window.location.href = 'victory.html';
  }
}

// --- Перейти к следующему шагу (игровому) ---
function advanceStep(){
  // следующий непройденный игровой индекс > currentIndex
  let next = gameIndexes.find(i => i > currentIndex && !savedState.completed.includes(i));
  if(typeof next === 'undefined'){
    next = gameIndexes.find(i => !savedState.completed.includes(i));
  }
  if(typeof next !== 'undefined'){
    currentIndex = next;
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

// --- Счётчики и сохранение ---
function updateCounters(){
  const done = savedState.completed.filter(i => gameIndexes.includes(i)).length;
  completedCounter && (completedCounter.textContent = done);
  totalCounter && (totalCounter.textContent = gameTotal);
}
function saveState(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState)); } catch(e){ console.warn('saveState failed', e); }
}
function resetProgress(){
  savedState = { currentIndex: 0, completed: [] };
  saveState();
  document.querySelectorAll('.hotspot.completed').forEach(el => el.classList.remove('completed'));
  currentIndex = gameIndexes[0] || 0;
  updateCounters();
  renderStep();
}

// --- UI обработчики ---
function attachHandlers(){
  if(playBtn){
    playBtn.onclick = async () => {
      const c = clues[currentIndex];
      if(!c || !c.audio) return;
      try { levitanAudio.src = c.audio; levitanAudio.load(); await levitanAudio.play(); } catch(e){ console.warn('audio play failed', e); }
    };
  }
  if(resetBtn) resetBtn.onclick = () => { if(confirm('Сбросить прогресс?')) resetProgress(); };
  if(cardNext) cardNext.onclick = () => advanceStep();
  if(viewerClose) viewerClose.onclick = closeViewer;
  if(viewerClose2) viewerClose2.onclick = closeViewer;
  window.addEventListener('keydown', e => { if(e.key === 'Escape') closeViewer(); });
}

// --- Запуск ---
document.addEventListener('DOMContentLoaded', () => {
  loadClues();
});