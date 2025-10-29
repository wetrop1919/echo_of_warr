// Обновлённый script.js
// - победа наступает, когда пройдены все игровые шаги (isExtra НЕ считается)
// - total показывает количество игровых шагов, completed — количество пройденных игровых шагов
// - информационные миниатюры (isExtra=true) не обязательны для победы

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

let hotspotCount = 0; // количество всех видимых миниатюр (не используется для победы)
let gameIndexes = []; // индексы игровых шагов (без isExtra и без noHotspot)
let gameTotal = 0;

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
    stepText.textContent = 'Невозможно загрузить подсказки. Убедитесь, что сайт запущен через http(s) и файл data/clues.json доступен.';
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

  // подготовим список игровых индексов (исключаем информационные isExtra и полностью скрытые noHotspot)
  gameIndexes = [];
  for(let i=0;i<clues.length;i++){
    const c = clues[i];
    if(!c.isExtra && !c.noHotspot){
      gameIndexes.push(i);
    }
  }
  gameTotal = gameIndexes.length;

  // найти стартовый индекс (первый непройденный игровой шаг или сохранённый)
  let startIdx = savedState.currentIndex || 0;
  if(savedState.completed && savedState.completed.includes(startIdx)){
    // найдём первый игровой индекс, который ещё не пройден
    const nextGame = gameIndexes.find(idx => !savedState.completed.includes(idx));
    if(typeof nextGame !== 'undefined') startIdx = nextGame;
    else startIdx = gameIndexes.length ? gameIndexes[gameIndexes.length - 1] : 0;
  }
  // если сохранённый индекс указывает на isExtra или т.п., постараемся перейти на ближайший игровой
  if(!gameIndexes.includes(startIdx)){
    const nearest = gameIndexes.find(idx => idx >= startIdx) ?? gameIndexes[0] ?? 0;
    startIdx = nearest;
  }
  currentIndex = startIdx;

  // сгенерируем миниатюры (включая информационные isExtra) и посчитаем их количество
  generateHotspotsRandomized();

  // отображаем счётчики игровых шагов
  totalCounter.textContent = gameTotal;
  // подсчитываем сколько из игровых индексов уже в savedState.completed
  const doneGames = savedState.completed.filter(idx => gameIndexes.includes(idx)).length;
  completedCounter.textContent = doneGames;

  renderStep();
  updatePlayButtonVisibility();

  // обработчики кнопок
  playBtn.addEventListener('click', async () => {
    const c = clues[currentIndex];
    if(!c || !c.audio) return;
    try {
      levitanAudio.src = c.audio;
      levitanAudio.load();
      await levitanAudio.play();
    } catch(err){
      console.error('Ошибка воспроизведения аудио:', err);
      alert('Не удалось воспроизвести аудио. Откройте консоль для деталей.');
    }
  });

  levitanAudio.addEventListener('ended', () => {
    if(clues[currentIndex] && clues[currentIndex].noHotspot){
      advanceStep();
    }
  });

  resetBtn.addEventListener('click', () => {
    if(!confirm('Сбросить прогресс?')) return;
    resetProgress();
  });

  cardNext.addEventListener('click', () => {
    advanceStep();
  });
}

// Генерация hotspot'ов в случайных позициях (попытка избежать сильных перекрытий)
// Включает обычные шаги и информационные (isExtra). Пропускает только noHotspot (если указан).
function generateHotspotsRandomized(){
  // удалить старые
  Array.from(mapImage.querySelectorAll('.hotspot')).forEach(n => n.remove());

  const placed = [];
  const frag = document.createDocumentFragment();
  const tryLimit = 40;
  const minGap = 8; // минимальное расстояние в % между центрами (приблизительно)

  hotspotCount = 0;

  for(let i=0;i<clues.length;i++){
    const c = clues[i];
    if(c.noHotspot) continue; // полностью невидимые; пропускаем

    hotspotCount++;

    // Если у записи есть поля left/top — используем их (фиксированная позиция), иначе рандомим
    let leftPct, topPct;
    if (c.left && c.top) {
      leftPct = parseFloat(String(c.left).replace('%',''));
      topPct = parseFloat(String(c.top).replace('%',''));
    } else {
      let attempts = 0, ok=false;
      while(attempts < tryLimit && !ok){
        leftPct = 6 + Math.random() * 88; // 6%..94% - отступы от краёв
        topPct = 8 + Math.random() * 78;  // 8%..86%
        ok = true;
        for(const p of placed){
          const dx = Math.abs(p.left - leftPct);
          const dy = Math.abs(p.top - topPct);
          if(Math.hypot(dx, dy) < minGap) { ok = false; break; }
        }
        attempts++;
      }
      // если не нашли хорошее место — допускаем последнюю позицию
      if(!ok){
        leftPct = 10 + Math.random() * 80;
        topPct = 10 + Math.random() * 70;
      }
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
  stepTitle.textContent = c ? (c.title || `Шаг ${currentIndex+1}`) : '—';
  const clueText = c ? (c.clue || c.text || '') : '';
  // Показываем только подсказку: подробный ответ (descr) убран из карточки
  stepText.innerHTML = `<strong>Подсказка:</strong> ${escapeHtml(clueText)}`;

  // показать/скрыть playBtn и cardNext в зависимости от полей у текущей подсказки
  updatePlayButtonVisibility();
  updateCardNextVisibility(c);
}

function updatePlayButtonVisibility(){
  const c = clues[currentIndex];
  if(c && c.audio) {
    playBtn.style.display = '';
  } else {
    playBtn.style.display = 'none';
  }
}

function updateCardNextVisibility(c){
  if(c && c.noHotspot){
    cardNext.classList.remove('hidden');
  } else {
    cardNext.classList.add('hidden');
  }
}

function handleClick(clickedIndex, btnElement){
  const current = clues[currentIndex];
  const clicked = clues[clickedIndex];

  // общая информация в модальном окне
  viewerImg.src = clicked.media || clicked.photo || clicked.thumb || 'assets/placeholder-large.jpg';
  viewerImg.alt = clicked.objectName || clicked.title || '';
  viewerTitle.textContent = clicked.objectName || clicked.title || `Объект ${clickedIndex+1}`;
  viewerDesc.textContent = clicked.descr || clicked.objectDesc || clicked.clue || '';

  // Если это информационный экспонат — просто показать информацию, не менять прогресс
  if(clicked.isExtra){
    viewerResult.textContent = ''; // нейтрально
    viewerResult.className = 'viewer-result';
    viewerNext.classList.add('hidden');
    viewerNext.onclick = null;
    openViewer();
    return;
  }

  // обычная логика проверки для игровых шагов
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

  // Фокус: если есть кнопка "Далее" — фокусируем её, иначе крестик
  setTimeout(()=> {
    if (!viewer.classList.contains('hidden')) {
      if (viewerNext && !viewerNext.classList.contains('hidden')) {
        try { viewerNext.focus(); } catch(e){ viewerClose.focus(); }
      } else {
        try { viewerClose.focus(); } catch(e){ /* ignore */ }
      }
    }
  }, 60);
}

function closeViewer(){
  viewer.classList.add('hidden');
}

function markCompleted(index, btnElement){
  const btn = btnElement || document.querySelector(`.hotspot[data-index="${index}"]`);
  if(btn) btn.classList.add('completed');

  // добавляем в savedState только если это игровой индекс (из gameIndexes)
  if(gameIndexes.includes(index) && !savedState.completed.includes(index)){
    savedState.completed.push(index);
  }

  // обновляем видимый счётчик только по игровым шагам
  const doneGames = savedState.completed.filter(idx => gameIndexes.includes(idx)).length;
  completedCounter.textContent = doneGames;

  saveState();

  // проверяем победу (все игровые индексы пройдены)
  const allDone = gameIndexes.every(idx => savedState.completed.includes(idx));
  if(allDone){
    // сохраняем состояние и переходим на страницу победы
    savedState.currentIndex = clues.length - 1;
    saveState();
    window.location.href = 'victory.html';
  }
}

function advanceStep(){
  // Найти следующий непройденный игровой шаг (только среди gameIndexes), после текущего
  const nextAfter = gameIndexes.find(idx => idx > currentIndex && !savedState.completed.includes(idx));
  if(typeof nextAfter !== 'undefined'){
    currentIndex = nextAfter;
    savedState.currentIndex = currentIndex;
    saveState();
    renderStep();
    return;
  }

  // если нет после текущего, найти любой непройденный игровой шаг
  const any = gameIndexes.find(idx => !savedState.completed.includes(idx));
  if(typeof any !== 'undefined'){
    currentIndex = any;
    savedState.currentIndex = currentIndex;
    saveState();
    renderStep();
    return;
  }

  // Если все игровые шаги пройдены — победа
  savedState.currentIndex = clues.length - 1;
  saveState();
  window.location.href = 'victory.html';
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
  currentIndex = gameIndexes.length ? gameIndexes[0] : 0;
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