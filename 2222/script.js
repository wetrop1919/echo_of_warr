// Обновлённый script.js
//  - в карточке показываем только подсказку (clue), подробный ответ только в модальном окне
//  - номера на миниатюрах убраны
//  - миниатюры размещаются хаотично при загрузке (случайные координаты, попытка уменьшить перекрытие)
// Сохранение прогресса и аудио для первого шага остаются.

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

async function loadClues(){
  try {
    const res = await fetch('data/clues.json', { cache: 'no-store' });
    if(!res.ok){
      stepTitle.textContent = 'Ошибка загрузки';
      stepText.textContent = `HTTP ${res.status} ${res.statusText} при запросе data/clues.json`;
      return;
    }
    clues = await res.json();
  } catch(e){
    console.error('Ошибка при загрузке подсказок', e);
    stepTitle.textContent = 'Ошибка загрузки';
    stepText.textContent = 'Невозможно загрузить подсказки. Убедитесь, что site запущен через http(s) и файл data/clues.json доступен.';
    return;
  }

  if(!Array.isArray(clues) || clues.length === 0){
    stepTitle.textContent = 'Нет подсказок';
    stepText.textContent = 'Файл data/clues.json пуст или содержит неверную структуру.';
    return;
  }

  // восстановление прогресса
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw){
    try {
      const parsed = JSON.parse(raw);
      if(parsed && Array.isArray(parsed.completed)) savedState = parsed;
    } catch(e){ console.warn('Неверный формат savedState', e); }
  }

  if(savedState.currentIndex >= clues.length) savedState.currentIndex = 0;

  // найти стартовый индекс (первый непройденный, если сохранённый пройден)
  let startIdx = savedState.currentIndex || 0;
  if(savedState.completed && savedState.completed.includes(startIdx)){
    const next = clues.findIndex((c, idx) => !savedState.completed.includes(idx));
    if(next !== -1) startIdx = next;
    else startIdx = clues.length - 1;
  }
  currentIndex = startIdx;

  totalCounter.textContent = clues.length;
  completedCounter.textContent = savedState.completed ? savedState.completed.length : 0;

  generateHotspotsRandomized();

  renderStep();
  updatePlayButtonVisibility();

  // обработчики кнопок
  playBtn.addEventListener('click', () => {
    levitanAudio.currentTime = 0;
    levitanAudio.play().catch(()=>{/* ignore */});
  });
  resetBtn.addEventListener('click', () => {
    if(!confirm('Сбросить прогресс?')) return;
    resetProgress();
  });
}

// Генерация hotspot'ов в случайных позициях (попытка избежать сильных перекрытий)
function generateHotspotsRandomized(){
  // удалить старые
  Array.from(mapImage.querySelectorAll('.hotspot')).forEach(n => n.remove());

  const placed = [];
  const frag = document.createDocumentFragment();
  const tryLimit = 40;
  const minGap = 8; // минимальное расстояние в % между центрами (приблизительно)

  for(let i=0;i<clues.length;i++){
    const c = clues[i];
    // попытаться найти позицию, не слишком близко к другим
    let leftPct, topPct, attempts = 0, ok=false;
    while(attempts < tryLimit && !ok){
      leftPct = 6 + Math.random() * 88; // 6%..94% - отступы от краёв
      topPct = 8 + Math.random() * 78;  // 8%..86%
      ok = true;
      for(const p of placed){
        const dx = Math.abs(p.left - leftPct);
        const dy = Math.abs(p.top - topPct);
        // простая эвристика расстояния
        if(Math.hypot(dx, dy) < minGap) { ok = false; break; }
      }
      attempts++;
    }
    // если не получилось найти непересекаемую позицию — оставляем последнюю
    placed.push({ left: leftPct, top: topPct });

    const btn = document.createElement('button');
    btn.className = 'hotspot';
    btn.setAttribute('data-index', i);
    btn.setAttribute('aria-label', c.objectName || `Объект ${i+1}`);
    btn.style.left = `${leftPct.toFixed(2)}%`;
    btn.style.top = `${topPct.toFixed(2)}%`;

    const img = document.createElement('img');
    img.src = c.thumb || c.media || c.photo || 'assets/placeholder.jpg';
    img.alt = c.objectName || c.title || `миниатюра ${i+1}`;

    btn.appendChild(img);

    if(savedState.completed && savedState.completed.includes(i)) btn.classList.add('completed');

    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      const clickedIndex = Number(btn.dataset.index);
      handleClick(clickedIndex, btn);
    });

    frag.appendChild(btn);
  }

  mapImage.appendChild(frag);
}

function renderStep(){
  const c = clues[currentIndex];
  stepTitle.textContent = c.title || `Шаг ${currentIndex+1}`;
  const clueText = c.clue || c.text || '';
  // Показываем только подсказку: подробный ответ (descr) убран из карточки
  stepText.innerHTML = `<strong>Подсказка:</strong> ${escapeHtml(clueText)}`;
  updatePlayButtonVisibility();
}

function updatePlayButtonVisibility(){
  playBtn.style.display = (currentIndex === 0) ? '' : 'none';
}

function handleClick(clickedIndex, btnElement){
  const current = clues[currentIndex];
  const clicked = clues[clickedIndex];

  viewerImg.src = clicked.media || clicked.photo || clicked.thumb || 'assets/placeholder-large.jpg';
  viewerImg.alt = clicked.objectName || clicked.title || '';
  viewerTitle.textContent = clicked.objectName || clicked.title || `Объект ${clickedIndex+1}`;
  // подробный ответ показывается только в модальном окне (viewerDesc)
  viewerDesc.textContent = clicked.descr || clicked.objectDesc || clicked.clue || '';

  if(clickedIndex === currentIndex){
    viewerResult.textContent = 'Правильно';
    viewerResult.className = 'viewer-result ok';
    viewerNext.classList.remove('hidden');
    viewerNext.onclick = () => {
      markCompleted(clickedIndex, btnElement);
      closeViewer();
      advanceStep();
    };
  } else {
    viewerResult.textContent = 'Неверно';
    viewerResult.className = 'viewer-result bad';
    viewerNext.classList.add('hidden');
    viewerNext.onclick = null;
  }

  openViewer();
}

function openViewer(){
  viewer.classList.remove('hidden');
  viewerClose.focus();
}

function closeViewer(){
  viewer.classList.add('hidden');
}

function markCompleted(index, btnElement){
  const btn = btnElement || document.querySelector(`.hotspot[data-index="${index}"]`);
  if(btn) btn.classList.add('completed');
  if(!savedState.completed.includes(index)) savedState.completed.push(index);
  completedCounter.textContent = savedState.completed.length;
  saveState();
}

function advanceStep(){
  const nextIndex = clues.findIndex((c, idx) => !savedState.completed.includes(idx) && idx > currentIndex);
  if(nextIndex !== -1) currentIndex = nextIndex;
  else {
    const any = clues.findIndex((c, idx) => !savedState.completed.includes(idx));
    if(any !== -1) currentIndex = any;
    else {
      stepTitle.textContent = 'Победа!';
      stepText.innerHTML = 'Вы успешно прошли квест. Поздравляем!';
      savedState.currentIndex = clues.length - 1;
      saveState();
      updatePlayButtonVisibility();
      return;
    }
  }
  savedState.currentIndex = currentIndex;
  saveState();
  renderStep();
}

function saveState(){
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
  } catch(e){ console.warn('Не удалось сохранить прогресс', e); }
}

function resetProgress(){
  savedState = { currentIndex: 0, completed: [] };
  saveState();
  document.querySelectorAll('.hotspot.completed').forEach(n => n.classList.remove('completed'));
  completedCounter.textContent = 0;
  currentIndex = 0;
  renderStep();
}

viewerClose.addEventListener('click', closeViewer);
viewerClose2.addEventListener('click', closeViewer);
window.addEventListener('keydown', (e) => { if(e.key === 'Escape') closeViewer(); });

function escapeHtml(str){
  if(!str) return '';
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

// Запуск
loadClues();