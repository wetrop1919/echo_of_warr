// Диагностический скрипт — вставьте в Console или замените временно script.js этим файлом.
// Он покажет причину ошибки загрузки data/clues.json и распечатает содержимое / ошибки.

(function(){
  // элементы UI (если их нет — создадим простые)
  function el(id){ return document.getElementById(id); }
  const titleEl = el('step-title');
  const textEl = el('step-text');
  if(!titleEl || !textEl){
    // создадим простую диагностическую панель вверху страницы
    const panel = document.createElement('div');
    panel.style.background = '#fff7e6';
    panel.style.border = '2px solid #f0c36d';
    panel.style.padding = '12px';
    panel.style.margin = '8px';
    panel.style.borderRadius = '8px';
    panel.style.zIndex = 9999;
    panel.id = 'diag-panel';
    panel.innerHTML = '<strong>Диагностика загрузки подсказок...</strong><div id="diag-status"></div><pre id="diag-output" style="max-height:300px;overflow:auto;"></pre>';
    document.body.prepend(panel);
  }
  const statusEl = document.getElementById('diag-status') || document.getElementById('step-title');
  const outEl = document.getElementById('diag-output') || document.getElementById('step-text');

  function logStatus(msg){ if(statusEl) statusEl.textContent = msg; console.log(msg); }
  function logOut(msg){ if(outEl) outEl.textContent = (outEl.textContent? outEl.textContent + '\n' : '') + msg; console.log(msg); }

  logStatus('Попытка загрузить data/clues.json ...');

  fetch('data/clues.json', {cache:'no-store'}).then(async res => {
    logStatus(`HTTP ${res.status} ${res.statusText}`);
    logOut(`Content-Type: ${res.headers.get('content-type')}`);
    const text = await res.text();
    if(!res.ok){
      logOut('Ответ сервера не OK. Текст ответа (первые 2000 символов):\n' + (text ? text.slice(0,2000) : '<пустой ответ>'));
      return;
    }
    try {
      const parsed = JSON.parse(text);
      logOut('JSON успешно распарсен.');
      if(Array.isArray(parsed)){
        logOut('Массив подсказок, длина = ' + parsed.length);
        logOut('Показываю первые 3 элемента (pretty):\n' + JSON.stringify(parsed.slice(0,3), null, 2));
      } else {
        logOut('JSON не массив. Содержимое:\n' + JSON.stringify(parsed, null, 2));
      }
      // Дополнительно: покажем сколько игровых шагов (isExtra/noHotspot)
      const game = (Array.isArray(parsed) ? parsed.filter((c)=>!c.isExtra && !c.noHotspot) : []);
      logOut('Игровых шагов (isExtra и noHotspot исключены): ' + game.length);
      // Поместим parsed в глобальную переменную для отладки
      window.__DIAG_CLUES = parsed;
      logOut('Доступно в window.__DIAG_CLUES');
      // Добавим кнопку "Использовать этот JSON как временный" чтобы визуально увидеть шаг 0:
      if(!document.getElementById('diag-use-btn')){
        const btn = document.createElement('button');
        btn.id = 'diag-use-btn';
        btn.textContent = 'Показать первую подсказку из загруженного JSON';
        btn.style.margin = '8px';
        btn.onclick = ()=>{
          const first = (Array.isArray(parsed) && parsed.length>0) ? parsed[0] : null;
          if(first){
            alert('Шаг 0:\nTitle: ' + (first.title||'') + '\nClue: ' + (first.clue||first.text||'') );
          } else {
            alert('JSON пуст или не массив');
          }
        };
        const panel = document.getElementById('diag-panel') || document.body;
        panel.appendChild(btn);
      }
    } catch(e){
      logOut('Ошибка парсинга JSON: ' + e.message);
      logOut('Текст ответа (первые 5000 символов):\n' + text.slice(0,5000));
      console.error(e);
    }
  }).catch(err=>{
    logStatus('fetch бросил ошибку: ' + err);
    logOut('Если вы открываете страницу по file:// — fetch локальных файлов блокируется. Запустите локальный http сервер (python -m http.server) или разместите на GitHub Pages.');
    console.error(err);
  });
})();