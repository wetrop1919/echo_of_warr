// Динамическая генерация hotspot'ов, сохранение прогресса и аудио для первого шага
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
    const res = await fetch('data/clues.json');
    clues = await res.json();
  } catch(e){
    console.error('Не удалось загрузить data/clues.json', e);
    stepTitle.textContent = 'Ошибка загрузки';
    stepText.textContent = 'Невозможно загрузить подсказки.';
    return;
  }

  if(!Array.isArray(clues) || clues.length === 0){
    stepTitle.textContent = 'Нет подсказок';
    stepText.textContent = 'Файл data/clues.json пуст или не загружен.';
    return;
  }

  // загрузить состояние из localStorage (если есть)
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw){
    try {
      const parsed = JSON.parse(raw);
      if(parsed && Array.isArray(parsed.completed)){
        savedState = parsed;
      }
    } catch(e){ console.warn('Неверный формат сохранённого прогресса', e); }
  }

  // если savedState.currentIndex указывает на пройденный шаг, найдём следующий непройденный
  if(savedState.currentIndex >= clues.length) savedState.currentIndex = 0;
  let startIdx = savedState.currentIndex;
  if(savedState.completed.includes(startIdx)){
    const next = clues.findIndex((c, idx) => !savedState.completed.includes(idx));
    if(next !== -1) startIdx = next;
    else startIdx = clues.length - 1; // все пройдены
  }
  currentIndex = startIdx;

  // отображаем количество и количество пройденных
  totalCounter.textContent = clues.length;
  completedCounter.textContent = savedState.completed.length;

  // сгенерируем hotspot'ы
  generateHotspots();

  // отобразим текущий шаг
  renderStep();

  // показать/скрыть кнопку прослушивания объявления
  updatePlayButtonVisibility();

  // обработчик кнопок
  playBtn.addEventListener('click', () => {
    // воспроизвести аудио (пользовательский клик разрешает воспроизведение)
    levitanAudio.currentTime = 0;
    levitanAudio.play().catch(()=> {
      // браузер мог запретить автоматическое воспроизведение; просто проигнорируем
    });
  });

  resetBtn.addEventListener('click', () => {
    if(!confirm('Сбросить прогресс? Это удалит все отмеченные шаги и начнёт квест заново.')) return;
    resetProgress();
  });
}

function generateHotspots(){
  // очистим старые hotspot'ы, если есть
  Array.from(mapImage.querySelectorAll('.hotspot')).forEach(n => n.remove());

  const frag = document.createDocumentFragment();
  clues.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.className = 'hotspot';
    btn.setAttribute('data-index', i);
    btn.setAttribute('aria-label', c.objectName || `Объект ${i+1}`);
    // позиционирование (left/top приходят как проценты)
    if (c.left) btn.style.left = c.left;
    if (c.top) btn.style.top = c.top;

    const img = document.createElement('img');
    img.src = c.thumb || c.media || c.photo || 'assets/placeholder.jpg';
    img.alt = c.objectName || c.title || `миниатюра ${i+1}`;

    // бейдж с номером шага (чтобы удобно ориентироваться)
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = (i + 1);

    btn.appendChild(img);
    btn.appendChild(badge);

    // если уже пройдено — отметить
    if(savedState.completed.includes(i)){
      btn.classList.add('completed');
    }

    // обработчик клика
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      const clickedIndex = Number(btn.dataset.index);
      handleClick(clickedIndex, btn);
    });

    frag.appendChild(btn);
  });

  mapImage.appendChild(frag);
}

function renderStep(){
  const c = clues[currentIndex];
  stepTitle.textContent = c.title || `Шаг ${currentIndex+1}`;
  // показать подсказку (clue)
  const clueText = c.clue || c.text || '';
  const descrText = c.descr || c.objectDesc || '';
  stepText.innerHTML = `<strong>Подсказка:</strong> ${escapeHtml(clueText)}<br><em style="color:#666">${escapeHtml(descrText)}</em>`;

  updatePlayButtonVisibility();
}

// Показывать кнопку прослушивания объявления только на первом шаге (index 0)
function updatePlayButtonVisibility(){
  if(currentIndex === 0){
    playBtn.style.display = '';
  } else {
    playBtn.style.display = 'none';
  }
}

// Обработка клика по миниатюре
function handleClick(clickedIndex, btnElement){
  const current = clues[currentIndex];
  const clicked = clues[clickedIndex];

  // Показать большое изображение и описание в модальном окне
  viewerImg.src = clicked.media || clicked.photo || clicked.thumb || 'assets/placeholder-large.jpg';
  viewerImg.alt = clicked.objectName || clicked.title || '';
  viewerTitle.textContent = clicked.objectName || clicked.title || `Объект ${clickedIndex+1}`;
  viewerDesc.textContent = clicked.descr || clicked.objectDesc || clicked.clue || '';

  // Проверка на правильность: правильным считается нажатие по объекту, соответствующему текущей подсказке
  if (clickedIndex === currentIndex) {
    viewerResult.textContent = 'Правильно';
    viewerResult.className = 'viewer-result ok';
    // покажем кнопку "Далее"
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

// Отметить объект как пройденный (визуально) и сохранить прогресс
function markCompleted(index, btnElement){
  const btn = btnElement || document.querySelector(`.hotspot[data-index="${index}"]`);
  if(btn) btn.classList.add('completed');

  if(!savedState.completed.includes(index)){
    savedState.completed.push(index);
  }

  // обновить счётчик
  completedCounter.textContent = savedState.completed.length;

  // сохранить
  saveState();
}

function advanceStep(){
  // Найти следующий непройденный шаг
  const nextIndex = clues.findIndex((c, idx) => !savedState.completed.includes(idx) && idx > currentIndex);
  if(nextIndex !== -1){
    currentIndex = nextIndex;
  } else {
    // если нет после текущего, найти любой непройденный
    const any = clues.findIndex((c, idx) => !savedState.completed.includes(idx));
    if(any !== -1) currentIndex = any;
    else {
      // все пройдены — финал
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

// Сохранение состояния в localStorage
function saveState(){
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
  } catch(e){
    console.warn('Не удалось сохранить прогресс', e);
  }
}

// Сброс прогресса
function resetProgress(){
  savedState = { currentIndex: 0, completed: [] };
  saveState();
  // убрать классы completed визуально
  document.querySelectorAll('.hotspot.completed').forEach(n => n.classList.remove('completed'));
  completedCounter.textContent = 0;
  currentIndex = 0;
  renderStep();
}

// Закрытие модалки кнопками
viewerClose.addEventListener('click', closeViewer);
viewerClose2.addEventListener('click', closeViewer);
window.addEventListener('keydown', (e) => {
  if(e.key === 'Escape') closeViewer();
});

// Простая защита от XSS в выводе подсказки/описания
function escapeHtml(str){
  if(!str) return '';
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

// Загрузка данных
loadClues();