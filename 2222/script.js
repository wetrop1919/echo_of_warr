// script.js — патч: явное управление показом модалки и дополнительные логи/fallback
// Замените текущий script.js этим файлом.

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
let gameIndexes = [];
let gameTotal = 0;

function showErrorInUI(title, details) {
  if (stepTitle) stepTitle.textContent = title;
  if (stepText) stepText.innerHTML = `<strong style="color:#b33">${escapeHtml(title)}</strong><div style="color:#666;margin-top:6px;">${escapeHtml(details)}</div>`;
}

async function loadClues() {
  try {
    stepTitle && (stepTitle.textContent = 'Загрузка...');
    stepText && (stepText.textContent = 'Загружаю подсказки...');
    const res = await fetch('data/clues.json', { cache: 'no-store' });
    if (!res.ok) {
      const msg = `HTTP ${res.status} ${res.statusText} при запросе data/clues.json`;
      console.error(msg);
      showErrorInUI('Ошибка загрузки', msg);
      return;
    }
    const text = await res.text();
    try {
      clues = JSON.parse(text);
    } catch (parseErr) {
      console.error('Ошибка парсинга data/clues.json:', parseErr);
      showErrorInUI('Ошибка парсинга JSON', parseErr.message);
      return;
    }
    if (!Array.isArray(clues) || clues.length === 0) {
      showErrorInUI('Неверный формат подсказок', 'data/clues.json пуст или не массив');
      return;
    }
    console.info('clues загружены, элементов:', clues.length);

    // load saved state
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.completed)) savedState = parsed;
      } catch (e) { console.warn('bad savedState', e); }
    }
    if (typeof savedState.currentIndex !== 'number') savedState.currentIndex = 0;

    // build gameIndexes
    gameIndexes = clues.map((c, idx) => ({ c, idx }))
      .filter(x => !x.c.isExtra && !x.c.noHotspot)
      .map(x => x.idx);
    gameTotal = gameIndexes.length;
    console.info('Игровых шагов (gameTotal):', gameTotal);

    // choose start index
    let startIdx = savedState.currentIndex || 0;
    if (!clues[startIdx] || clues[startIdx].isExtra || clues[startIdx].noHotspot) {
      startIdx = gameIndexes.find(idx => idx >= (savedState.currentIndex || 0)) ?? gameIndexes[0] ?? 0;
    }
    if (savedState.completed && savedState.completed.includes(startIdx)) {
      const nextGame = gameIndexes.find(idx => !savedState.completed.includes(idx));
      if (typeof nextGame !== 'undefined') startIdx = nextGame;
    }
    currentIndex = startIdx;

    generateHotspotsRandomized();

    totalCounter && (totalCounter.textContent = gameTotal);
    const doneGames = savedState.completed.filter(idx => gameIndexes.includes(idx)).length;
    completedCounter && (completedCounter.textContent = doneGames);

    renderStep();
    attachUIHandlers();

    // delegate clicks as robust fallback
    if (mapImage) {
      mapImage.removeEventListener('click', mapClickHandler);
      mapImage.addEventListener('click', mapClickHandler);
    }

  } catch (err) {
    console.error('Ошибка в loadClues', err);
    showErrorInUI('Ошибка инициализации', err && err.message ? err.message : String(err));
  }
}

function mapClickHandler(e) {
  try {
    const btn = e.target.closest && e.target.closest('.hotspot');
    if (!btn) return;
    const idx = Number(btn.getAttribute('data-index'));
    console.log('mapImage click -> hotspot index', idx);
    handleClick(idx, btn);
  } catch (err) {
    console.error('mapClickHandler error', err);
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
          alert('Не удалось воспроизвести аудио. Откройте консоль для деталей.');
        }
      };
    }
    if (resetBtn) resetBtn.onclick = () => { if (confirm('Сбросить прогресс?')) resetProgress(); };
    if (cardNext) cardNext.onclick = () => advanceStep();
    if (viewerClose) viewerClose.onclick = closeViewer;
    if (viewerClose2) viewerClose2.onclick = closeViewer;
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeViewer(); });
  } catch (e) { console.warn('attachUIHandlers failed', e); }
}

function generateHotspotsRandomized() {
  try { if (mapImage) Array.from(mapImage.querySelectorAll('.hotspot')).forEach(n => n.remove()); } catch(e){console.warn(e);}
  const placed = [];
  const frag = document.createDocumentFragment();
  const tryLimit = 50;
  const minGap = 8;
  hotspotCount = 0;
  for (let i = 0; i < clues.length; i++) {
    const c = clues[i];
    if (c.noHotspot) continue;
    hotspotCount++;
    let leftPct, topPct;
    if (c.left && c.top) {
      leftPct = parseFloat(String(c.left).replace('%','')) || (6 + Math.random()*88);
      topPct = parseFloat(String(c.top).replace('%','')) || (8 + Math.random()*78);
    } else {
      let attempts = 0, ok=false;
      while(attempts < tryLimit && !ok){
        leftPct = 6 + Math.random()*88;
        topPct = 8 + Math.random()*78;
        ok = true;
        for(const p of placed){ if(Math.hypot(Math.abs(p.left-leftPct), Math.abs(p.top-topPct)) < minGap){ ok=false; break; } }
        attempts++;
      }
      if(!ok){ leftPct = 10 + Math.random()*80; topPct = 10 + Math.random()*70; }
    }
    placed.push({ left:leftPct, top: topPct });
    const btn = document.createElement('button');
    btn.className = 'hotspot';
    btn.setAttribute('data-index', i);
    btn.setAttribute('aria-label', c.objectName || c.title || `Объект ${i+1}`);
    btn.style.left = `${leftPct.toFixed(2)}%`;
    btn.style.top = `${topPct.toFixed(2)}%`;
    btn.style.zIndex = 5;
    const img = document.createElement('img');
    img.src = c.thumb || c.media || c.photo || 'assets/placeholder.jpg';
    img.alt = c.objectName || c.title || `миниатюра ${i+1}`;
    btn.appendChild(img);
    if (savedState.completed && savedState.completed.includes(i)) btn.classList.add('completed');
    // direct handler (backup)
    btn.addEventListener('click', (ev)=>{
      ev.preventDefault();
      const idx = Number(btn.getAttribute('data-index'));
      console.log('hotspot direct click ->', idx);
      handleClick(idx, btn);
    });
    frag.appendChild(btn);
  }
  try { mapImage && mapImage.appendChild(frag); } catch(e){ console.error('append hotspots failed', e); showErrorInUI('Ошибка отображения карты','Проверьте map-image'); }
}

function renderStep() {
  try {
    const c = clues[currentIndex];
    stepTitle && (stepTitle.textContent = c ? (c.title || `Шаг ${currentIndex+1}`) : '—');
    const clueText = c ? (c.clue || c.text || '') : '';
    stepText && (stepText.innerHTML = `<strong>Подсказка:</strong> ${escapeHtml(clueText)}`);
    updatePlayButtonVisibility();
    updateCardNextVisibility(c);
  } catch (e) { console.error('renderStep error', e); }
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
    console.log('handleClick index=', clickedIndex, 'currentIndex=', currentIndex);
    const current = clues[currentIndex];
    const clicked = clues[clickedIndex];
    if (!clicked) {
      console.warn('clicked undefined for index', clickedIndex);
      alert('Этот экспонат временно недоступен.');
      return;
    }
    // fill viewer content
    if (viewerImg) viewerImg.src = clicked.media || clicked.photo || clicked.thumb || 'assets/placeholder-large.jpg';
    if (viewerImg) viewerImg.alt = clicked.objectName || clicked.title || '';
    if (viewerTitle) viewerTitle.textContent = clicked.objectName || clicked.title || `Объект ${clickedIndex+1}`;
    if (viewerDesc) viewerDesc.textContent = clicked.descr || clicked.objectDesc || clicked.clue || '';
    // if informational
    if (clicked.isExtra) {
      if (viewerResult) { viewerResult.textContent = ''; viewerResult.className = 'viewer-result'; }
      if (viewerNext) { viewerNext.classList.add('hidden'); viewerNext.onclick = null; }
      // open viewer; if not possible, fallback to alert
      if (!openViewer()) {
        alert(`${clicked.objectName || clicked.title}\n\n${clicked.descr || clicked.clue || ''}`);
      }
      return;
    }
    // normal game item
    if (clickedIndex === currentIndex) {
      if (viewerResult) { viewerResult.textContent = 'Правильно'; viewerResult.className = 'viewer-result ok'; }
      if (viewerNext) {
        viewerNext.classList.remove('hidden');
        viewerNext.onclick = () => { markCompleted(clickedIndex, btnElement); closeViewer(); advanceStep(); };
      }
      if (!openViewer()) {
        // fallback
        alert(`Правильно!\n\n${clicked.objectName || clicked.title}\n\n${clicked.descr || clicked.clue || ''}`);
      }
    } else {
      if (viewerResult) { viewerResult.textContent = 'Неверно'; viewerResult.className = 'viewer-result bad'; }
      if (viewerNext) { viewerNext.classList.add('hidden'); viewerNext.onclick = null; }
      if (!openViewer()) {
        // fallback
        alert(`Неверно.\n\n${clicked.objectName || clicked.title}\n\n${clicked.descr || clicked.clue || ''}`);
      }
    }
  } catch (e) {
    console.error('Ошибка в handleClick', e);
  }
}

// openViewer now returns true if it displayed modal, false if not (so caller can fallback)
function openViewer() {
  try {
    if (!viewer) {
      console.warn('viewer element not found');
      return false;
    }
    // explicitly set display and remove hidden class to be robust against CSS overrides
    try {
      viewer.style.display = 'flex';
    } catch (e) { /* ignore */ }
    viewer.classList.remove('hidden');
    // ensure viewer is on top
    try { viewer.style.zIndex = 99999; } catch(e){}
    setTimeout(()=> {
      if (!viewer || viewer.classList.contains('hidden')) return;
      try {
        if (viewerNext && !viewerNext.classList.contains('hidden')) viewerNext.focus();
        else if (viewerClose) viewerClose.focus();
      } catch (e) { /* ignore */ }
    }, 60);
    return true;
  } catch (err) {
    console.error('openViewer failed', err);
    return false;
  }
}

function closeViewer() {
  try {
    if (!viewer) return;
    viewer.classList.add('hidden');
    try { viewer.style.display = 'none'; } catch(e){}
  } catch (e) { console.error('closeViewer failed', e); }
}

function markCompleted(index, btnElement) {
  try {
    const btn = btnElement || document.querySelector(`.hotspot[data-index="${index}"]`);
    if (btn) btn.classList.add('completed');
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
      window.location.href = 'victory.html';
    }
  } catch (e) { console.error('markCompleted failed', e); }
}

function advanceStep() {
  const nextAfter = gameIndexes.find(idx => idx > currentIndex && !savedState.completed.includes(idx));
  if (typeof nextAfter !== 'undefined') {
    currentIndex = nextAfter;
    savedState.currentIndex = currentIndex;
    saveState();
    renderStep();
    return;
  }
  const any = gameIndexes.find(idx => !savedState.completed.includes(idx));
  if (typeof any !== 'undefined') {
    currentIndex = any;
    savedState.currentIndex = currentIndex;
    saveState();
    renderStep();
    return;
  }
  savedState.currentIndex = clues.length - 1;
  saveState();
  window.location.href = 'victory.html';
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState)); } catch(e){ console.warn('saveState failed', e); }
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
  return String(str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

document.addEventListener('DOMContentLoaded', () => {
  loadClues().catch(err => { console.error('Unhandled loadClues error', err); showErrorInUI('Ошибка инициализации', err && err.message ? err.message : String(err)); });
});