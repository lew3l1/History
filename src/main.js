import './styles.css';
import { createClient } from '@supabase/supabase-js';

const $ = (s, root = document) => root.querySelector(s);
const base = import.meta.env.BASE_URL || '/';
const url = import.meta.env.VITE_SUPABASE_URL || '';
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const db = url && anon ? createClient(url, anon) : null;
const KEY = 'history-for-grandma-progress-v1';
const VOLUME_KEY = 'history-for-grandma-volume-v1';
const readProgress = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const state = {
  videos: [], progress: readProgress(), user: null, view: 'home', video: null,
  time: 0, duration: 0, volume: Number(localStorage.getItem(VOLUME_KEY) || .8),
  ready: false, playing: false, autoplay: false, resume: 0, nextPrompt: false,
  authMode: 'signin', search: '', visible: 24, lastCloudSave: 0, cloudBusy: false
};
let toastTimer;

function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function timeText(n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  const h = Math.floor(n / 3600), m = Math.floor(n % 3600 / 60), s = n % 60;
  const pad = x => String(x).padStart(2, '0');
  return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
}
function dateText(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ru-RU', {day:'numeric',month:'long'}).format(d);
}
function toast(message) {
  const el = $('#toast'); if (!el) return;
  el.textContent = message; el.classList.add('is-visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3200);
}
function progressFor(id) { return state.progress[String(id)] || null; }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state.progress)); } catch { toast('Не получилось сохранить историю на устройстве.'); } }
function card(v) {
  const p = progressFor(v.id), duration = Number(v.duration || 0), watched = p ? Number(p.current_time || 0) : 0;
  const pct = duration ? Math.min(100, Math.round(watched / duration * 100)) : 0;
  const cover = v.thumbnail ? '<img src="' + esc(v.thumbnail) + '" alt="" loading="lazy" onerror="this.hidden=true">' : '<span class="cover-placeholder">✿</span>';
  return '<button class="video-card" type="button" data-open-video="' + esc(v.id) + '"><span class="video-cover">' + cover +
    (pct ? '<span class="cover-progress"><i style="width:' + pct + '%"></i></span>' : '') + '<span class="cover-play">▶</span></span>' +
    '<span class="video-card-copy"><strong>' + esc(v.title || 'История из жизни') + '</strong><span class="video-card-meta">' +
    (duration ? timeText(duration) : 'Видео с RuTube') + (v.created_at ? ' · ' + dateText(v.created_at) : '') + '</span>' +
    (watched ? '<span class="video-resume-label">Остановились на ' + timeText(watched) + '</span>' : '') + '</span></button>';
}
function lastWatched() {
  const items = Object.values(state.progress).filter(x => x && Number(x.current_time) > 0).sort((a,b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
  if (!items.length) return null;
  const p = items[0], video = state.videos.find(v => String(v.id) === String(p.video_id));
  return video ? {video, progress:p} : null;
}
function grid() {
  const el = $('#video-grid'); if (!el) return;
  const query = state.search.trim().toLocaleLowerCase('ru');
  const found = state.videos.filter(v => !query || String(v.title || '').toLocaleLowerCase('ru').includes(query));
  const counter = $('#catalog-counter'); if (counter) counter.textContent = 'Найдено историй: ' + found.length;
  const more = $('#show-more'); if (more) more.hidden = found.length <= state.visible;
  if (!found.length) {
    el.innerHTML = state.videos.length
      ? '<div class="empty-panel"><span class="empty-icon">⌕</span><strong>Таких историй пока не нашли</strong><p>Попробуйте другое слово для поиска.</p></div>'
      : '<div class="empty-panel"><span class="empty-icon">✿</span><strong>Подготавливаем библиотеку историй</strong><p>Каталог загружается с канала автора. Пока можно открыть все выпуски непосредственно на RuTube.</p><a class="text-link" href="https://rutube.ru/channel/60691916/videos/" target="_blank" rel="noopener noreferrer">Открыть все истории ↗</a></div>';
    return;
  }
  el.innerHTML = found.slice(0, state.visible).map(card).join('');
}
function homeMarkup() {
  const last = lastWatched();
  return '<section class="welcome-panel"><div class="welcome-copy"><span class="eyebrow">ВАША КОЛЛЕКЦИЯ ИСТОРИЙ</span><h1>Устройтесь поудобнее.<br><em>История уже ждёт.</em></h1><p>Любимые жизненные истории — в одном месте. Смотрите, слушайте и возвращайтесь к ним тогда, когда удобно.</p><button class="primary-button" type="button" data-scroll>Выбрать историю <span>→</span></button></div><div class="welcome-illustration" aria-hidden="true"><span class="sun-shape"></span><span class="book-shape">❧</span><span class="flower-shape">✿</span></div></section>' +
    (last ? '<section class="continue-section"><div class="section-heading"><div><span class="eyebrow">С ВАШЕГО ПОСЛЕДНЕГО МЕСТА</span><h2>Продолжить просмотр</h2></div><span class="soft-tag">Мы всё сохранили</span></div><div class="continue-card">' +
      (last.video.thumbnail ? '<img src="' + esc(last.video.thumbnail) + '" alt="" loading="lazy">' : '<div class="continue-cover">✿</div>') +
      '<div class="continue-copy"><span class="eyebrow">ВЫ ОСТАНОВИЛИСЬ НА ' + timeText(last.progress.current_time) + '</span><h3>' + esc(last.video.title) + '</h3><p>Можно продолжить ровно с того места, где вы закончили.</p><button class="primary-button" data-open-video="' + esc(last.video.id) + '">Продолжить <span>▶</span></button></div></div></section>' : '') +
    '<section class="catalog-section" id="catalog"><div class="section-heading"><div><span class="eyebrow">НОВЫЕ И ЗНАКОМЫЕ ВЫПУСКИ</span><h2>Все истории</h2><p class="section-description">Выберите то, что хочется посмотреть сегодня.</p></div><span class="catalog-counter" id="catalog-counter"></span></div>' +
    '<label class="search-box"><span>⌕</span><input id="video-search" type="search" placeholder="Найти историю по названию…" autocomplete="off"><kbd>Поиск</kbd></label><div class="video-grid" id="video-grid"></div><button class="secondary-button show-more" id="show-more" type="button">Показать ещё истории</button></section>';
}
function historyMarkup() {
  const entries = Object.entries(state.progress).filter(([,p]) => p && Number(p.current_time) > 0).sort((a,b) => new Date(b[1].updated_at || 0) - new Date(a[1].updated_at || 0));
  const cards = entries.map(([id,p]) => card(state.videos.find(v => String(v.id) === id) || {id,title:p.title || 'История из вашей библиотеки',duration:p.duration_seconds || 0})).join('');
  return '<section class="page-intro"><span class="eyebrow">ВАШИ ВПЕЧАТЛЕНИЯ</span><h1>Моя история</h1><p>Здесь остаются выпуски, которые вы уже начали смотреть. Ничего не потеряется.</p></section>' +
    (entries.length ? '<div class="history-summary"><span class="history-summary-icon">♡</span><div><strong>Сохранено историй: ' + entries.length + '</strong><p>Нажмите на обложку, чтобы продолжить.</p></div></div><div class="video-grid history-grid">' + cards + '</div>' :
      '<div class="empty-panel history-empty"><span class="empty-icon">♡</span><strong>Здесь пока тихо</strong><p>Начните смотреть любую историю, и мы сохраним место, на котором вы остановились.</p><button class="primary-button" data-view="home">Найти первую историю <span>→</span></button></div>');
}
function adjacent(delta) {
  if (!state.video) return null;
  const i = state.videos.findIndex(v => String(v.id) === String(state.video.id));
  return i < 0 ? null : (state.videos[i + delta] || null);
}
function playerMarkup() {
  if (!state.video) return '<div class="empty-panel"><strong>Сначала выберите историю</strong><button class="primary-button" data-view="home">К историям</button></div>';
  const prev = adjacent(-1), next = adjacent(1);
  return '<section class="player-page"><button class="back-link" data-view="home"><span>←</span> Назад к историям</button><div class="player-heading"><span class="eyebrow">СЕЙЧАС В ВАШЕЙ КОЛЛЕКЦИИ</span><h1>' + esc(state.video.title) + '</h1><p>Смотрите или слушайте в удобном темпе. Ваше место сохранится автоматически.</p></div>' +
    '<div class="player-card"><div class="video-stage"><iframe id="rutube-player" title="' + esc(state.video.title) + '" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>' +
    '<div class="player-controls"><div class="seek-row"><span id="current-time">0:00</span><input id="seek-slider" type="range" min="0" max="1000" value="0" aria-label="Позиция в видео"><span id="duration-time">0:00</span></div>' +
    '<div class="control-row"><button class="round-control" data-player="previous" aria-label="Предыдущая история" ' + (prev ? '' : 'disabled') + '>◀</button><button class="round-control" data-player="rewind" aria-label="Назад на 15 секунд">↶<small>15</small></button><button class="play-control" data-player="toggle" aria-label="Пауза или воспроизведение"><span id="play-symbol">▶</span></button><button class="round-control" data-player="forward" aria-label="Вперёд на 30 секунд">↷<small>30</small></button><button class="round-control" data-player="next" aria-label="Следующая история" ' + (next ? '' : 'disabled') + '>▶</button><button class="round-control stop-control" data-player="stop" aria-label="Остановить">■</button></div>' +
    '<div class="volume-row"><span>♪</span><label for="volume-slider">Громкость</label><input id="volume-slider" type="range" min="0" max="100" value="' + Math.round(state.volume * 100) + '" aria-label="Громкость"><span id="volume-value">' + Math.round(state.volume * 100) + '%</span><span class="save-note" id="save-note">Место сохраняется автоматически</span></div></div></div>' +
    '<div class="next-suggestion" id="next-suggestion" ' + (state.nextPrompt && next ? '' : 'hidden') + '><div><span class="eyebrow">ИСТОРИЯ ЗАВЕРШЕНА</span><strong>Посмотрим ещё одну?</strong><p>' + (next ? esc(next.title) : '') + '</p></div>' + (next ? '<button class="primary-button" data-player="next">Следующая история <span>→</span></button>' : '') + '</div><p class="player-footnote">Видео воспроизводится на RuTube. Если плеер не загрузился, проверьте подключение к интернету.</p></section>';
}
function render() {
  const main = $('#main-view');
  main.innerHTML = state.view === 'history' ? historyMarkup() : state.view === 'player' ? playerMarkup() : homeMarkup();
  document.querySelectorAll('.nav-button').forEach(b => b.classList.toggle('is-active', b.dataset.view === state.view || (state.view === 'player' && b.dataset.view === 'home')));
  if (state.view === 'home') grid();
  if (state.view === 'player') mountPlayer();
}
function setView(view) {
  if (state.view === 'player' && view !== 'player') saveProgress(true);
  state.view = view; render(); window.scrollTo({top:0,behavior:'smooth'});
}
function openVideo(video, autoplay = true) {
  if (!video) return;
  if (state.video && String(state.video.id) !== String(video.id)) saveProgress(true);
  const p = progressFor(video.id);
  state.video = video; state.resume = p ? Number(p.current_time || 0) : 0;
  state.time = state.resume; state.duration = Number(video.duration || p?.duration_seconds || 0);
  state.ready = false; state.playing = false; state.autoplay = autoplay; state.nextPrompt = false; state.view = 'player';
  render(); window.scrollTo({top:0,behavior:'smooth'});
}
function mountPlayer() {
  const frame = $('#rutube-player'); if (!frame || !state.video) return;
  frame.src = 'https://rutube.ru/play/embed/' + encodeURIComponent(String(state.video.id)) + '?skinColor=9b8065' + (state.resume > 0 ? '&t=' + Math.floor(state.resume) : '');
  updatePlayer();
}
function command(type, data = {}) {
  const frame = $('#rutube-player');
  if (!frame?.contentWindow) return;
  try { frame.contentWindow.postMessage(JSON.stringify({type,data}), 'https://rutube.ru'); } catch (e) { console.warn('Player command failed',e); }
}
function updatePlayer() {
  const cur = $('#current-time'), dur = $('#duration-time'), seek = $('#seek-slider'), symbol = $('#play-symbol'), volume = $('#volume-value'), volumeSlider = $('#volume-slider');
  if (cur) cur.textContent = timeText(state.time);
  if (dur) dur.textContent = timeText(state.duration);
  if (seek && document.activeElement !== seek) seek.value = String(state.duration ? Math.min(1000,Math.round(state.time/state.duration*1000)) : 0);
  if (symbol) symbol.textContent = state.playing ? 'Ⅱ' : '▶';
  if (volume) volume.textContent = Math.round(state.volume*100) + '%';
  if (volumeSlider && document.activeElement !== volumeSlider) volumeSlider.value = String(Math.round(state.volume*100));
}
function playerMessage(event) {
  const frame = $('#rutube-player'); if (!frame || event.source !== frame.contentWindow) return;
  let host; try { host = new URL(event.origin).hostname; } catch { return; }
  if (host !== 'rutube.ru' && !host.endsWith('.rutube.ru')) return;
  let msg = event.data; if (typeof msg === 'string') { try { msg = JSON.parse(msg); } catch { return; } }
  if (!msg || typeof msg !== 'object') return;
  const d = msg.data || {};
  switch (msg.type) {
    case 'player:ready':
      state.ready = true; command('player:setVolume',{volume:state.volume});
      if (state.resume > 0) command('player:setCurrentTime',{time:state.resume});
      if (state.autoplay) setTimeout(() => command('player:play',{}), state.resume > 0 ? 650 : 250);
      toast('История готова к просмотру'); break;
    case 'player:playStart': state.playing = true; state.autoplay = false; updatePlayer(); break;
    case 'player:currentTime': if (Number.isFinite(Number(d.time))) { state.time = Number(d.time); updatePlayer(); } break;
    case 'player:duration':
    case 'player:videoDuration': if (Number.isFinite(Number(d.duration))) { state.duration = Number(d.duration); updatePlayer(); } break;
    case 'player:changeState': if (typeof d.state === 'string') { const s=d.state.toLowerCase(); state.playing=s.includes('play')&&!s.includes('pause'); updatePlayer(); } break;
    case 'player:volumeChange': if (Number.isFinite(Number(d.volume))) { state.volume=Math.max(0,Math.min(1,Number(d.volume))); localStorage.setItem(VOLUME_KEY,String(state.volume)); updatePlayer(); } break;
    case 'player:playComplete':
      state.playing=false; state.time=state.duration||state.time; saveProgress(true); state.nextPrompt=true;
      const prompt=$('#next-suggestion'); if(prompt) prompt.hidden=!adjacent(1); updatePlayer(); break;
    case 'player:error': toast('RuTube сообщил об ошибке. Попробуйте открыть видео ещё раз.'); break;
  }
}
function saveProgress(force = false) {
  if (!state.video) return;
  const id=String(state.video.id), now=new Date().toISOString();
  const entry={video_id:id,title:state.video.title||'',current_time:Math.max(0,Math.floor(state.time||0)),duration_seconds:Math.max(0,Math.floor(state.duration||0)),updated_at:now};
  state.progress[id]=entry; persist();
  const note=$('#save-note'); if(note) note.textContent='Место сохранено · '+timeText(entry.current_time);
  if(db&&state.user&&(force||Date.now()-state.lastCloudSave>12000)) {
    state.lastCloudSave=Date.now();
    db.from('watch_progress').upsert({user_id:state.user.id,...entry},{onConflict:'user_id,video_id'}).then(({error})=>{if(error)console.warn('Cloud save failed:',error.message);});
  }
}
function setVolume(value) {
  state.volume=Math.max(0,Math.min(1,Number(value))); localStorage.setItem(VOLUME_KEY,String(state.volume));
  command('player:setVolume',{volume:state.volume}); updatePlayer();
}
async function syncCloud() {
  if(!db||!state.user||state.cloudBusy) return;
  state.cloudBusy=true;
  try {
    const {data,error}=await db.from('watch_progress').select('video_id,title,current_time,duration_seconds,updated_at');
    if(error) throw error;
    (data||[]).forEach(item=>{
      const id=String(item.video_id), local=state.progress[id];
      if(!local||new Date(item.updated_at||0)>=new Date(local.updated_at||0))
        state.progress[id]={video_id:id,title:item.title||'',current_time:Number(item.current_time||0),duration_seconds:Number(item.duration_seconds||0),updated_at:item.updated_at||new Date().toISOString()};
    });
    persist();
    const rows=Object.entries(state.progress).map(([id,p])=>({user_id:state.user.id,video_id:id,title:p.title||'',current_time:Number(p.current_time||0),duration_seconds:Number(p.duration_seconds||0),updated_at:p.updated_at||new Date().toISOString()}));
    if(rows.length){const result=await db.from('watch_progress').upsert(rows,{onConflict:'user_id,video_id'});if(result.error)throw result.error;}
    if(state.view!=='player') render();
    toast('История синхронизирована');
  } catch(e) { console.error('Cloud sync failed:',e); toast('Не удалось синхронизировать. Локальная копия сохранена.'); }
  finally { state.cloudBusy=false; }
}
function accountButton() {
  $('#account-label').textContent=state.user?(state.user.email||'Мой аккаунт'):'Войти';
  $('.account-avatar').textContent=state.user?'✓':'♡';
}
function accountDialog() {
  const layer=$('#dialog-layer'); let body='';
  if(!db) {
    body='<div class="modal-heading"><span class="modal-flower">✿</span><span class="eyebrow">ЛИЧНОЕ ПРОСТРАНСТВО</span><h2>Ваша история всегда рядом</h2><p>Сейчас просмотр сохраняется на этом устройстве. Чтобы он автоматически появлялся на телефоне и компьютере, нужно подключить облачную базу.</p></div><div class="setup-notice"><strong>Облачный вход ещё не настроен</strong><p>В репозитории подготовлены настройки Supabase и SQL для хранения истории. После подключения появится вход по почте и Google.</p></div><button class="primary-button full-button" data-close>Понятно</button>';
  } else if(state.user) {
    const count=Object.values(state.progress).filter(x=>Number(x.current_time)>0).length;
    body='<div class="modal-heading"><span class="modal-flower">♡</span><span class="eyebrow">ЛИЧНОЕ ПРОСТРАНСТВО</span><h2>Рады вас видеть!</h2><p>Ваши истории синхронизируются и доступны на других устройствах.</p></div><div class="profile-panel"><span class="profile-check">✓</span><div><strong>'+esc(state.user.email||'Ваш аккаунт')+'</strong><p>'+count+' сохранённых историй</p></div></div><button class="secondary-button full-button" data-signout>Выйти из аккаунта</button><button class="text-button full-button" data-close>Закрыть</button>';
  } else {
    const up=state.authMode==='signup';
    body='<div class="modal-heading"><span class="modal-flower">✿</span><span class="eyebrow">ЛИЧНОЕ ПРОСТРАНСТВО</span><h2>'+(up?'Создайте свой аккаунт':'С возвращением!')+'</h2><p>'+(up?'После регистрации подтвердите адрес электронной почты. Тогда история будет доступна на всех устройствах.':'Войдите, чтобы продолжить просмотр с того же места на телефоне или компьютере.')+'</p></div><button class="google-button" data-google><span class="google-g">G</span> Продолжить с Google</button><div class="form-divider"><span>или с помощью почты</span></div><form id="auth-form" class="auth-form"><label>Электронная почта<input name="email" type="email" autocomplete="email" placeholder="name@example.com" required></label><label>Пароль<input name="password" type="password" minlength="6" autocomplete="'+(up?'new-password':'current-password')+'" placeholder="Не менее 6 символов" required></label><button class="primary-button full-button" type="submit">'+(up?'Создать аккаунт':'Войти')+'</button></form><p class="auth-switch">'+(up?'Уже есть аккаунт?':'Впервые здесь?')+' <button class="text-button" data-mode="'+(up?'signin':'signup')+'">'+(up?'Войти':'Зарегистрироваться')+'</button></p><p class="auth-status" id="auth-status" role="status"></p>';
  }
  layer.innerHTML='<div class="modal-backdrop" data-close><section class="account-modal" role="dialog" aria-modal="true" aria-label="Аккаунт"><button class="modal-close" data-close aria-label="Закрыть">×</button>'+body+'</section></div>';
  layer.hidden=false; document.body.classList.add('modal-open');
}
function closeDialog(){const layer=$('#dialog-layer');layer.hidden=true;layer.innerHTML='';document.body.classList.remove('modal-open');}
function authStatus(text,isError=false){const el=$('#auth-status');if(el){el.textContent=text;el.classList.toggle('is-error',isError);}}
async function authSubmit(form) {
  const email=form.elements.email.value.trim(),password=form.elements.password.value;
  if(password.length<6){authStatus('Пароль должен содержать не менее 6 символов.',true);return;}
  const btn=$('button[type="submit"]',form);btn.disabled=true;btn.textContent='Проверяем данные…';
  try {
    if(state.authMode==='signup'){
      const {data,error}=await db.auth.signUp({email,password,options:{emailRedirectTo:window.location.href}});
      if(error)throw error;
      if(data.session){closeDialog();toast('Аккаунт создан. Добро пожаловать!');}
      else authStatus('Письмо для подтверждения отправлено на '+email+'. Откройте его и нажмите ссылку, затем войдите.');
    } else {
      const {error}=await db.auth.signInWithPassword({email,password});if(error)throw error;
      closeDialog();toast('Вы вошли. Загружаем вашу историю…');
    }
  } catch(e){authStatus(e.message||'Не удалось выполнить вход. Проверьте данные.',true);}
  finally{if(btn){btn.disabled=false;btn.textContent=state.authMode==='signup'?'Создать аккаунт':'Войти';}}
}
async function googleLogin(){try{const {error}=await db.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin+window.location.pathname}});if(error)throw error;}catch(e){authStatus(e.message||'Не удалось начать вход через Google.',true);}}

document.addEventListener('click',async e=>{
  const t=e.target.closest('button,a');if(!t)return;
  if(t.id==='account-button'){accountDialog();return;}
  if(t.hasAttribute('data-close')){closeDialog();return;}
  if(t.dataset.view){setView(t.dataset.view);return;}
  if(t.dataset.openVideo){const v=state.videos.find(x=>String(x.id)===String(t.dataset.openVideo));if(v)openVideo(v,true);return;}
  if(t.hasAttribute('data-scroll')){$('#catalog')?.scrollIntoView({behavior:'smooth'});return;}
  if(t.id==='show-more'){state.visible+=24;grid();return;}
  if(t.dataset.player){
    const a=t.dataset.player;
    if(a==='toggle'){command(state.playing?'player:pause':'player:play',{});state.playing=!state.playing;updatePlayer();if(!state.playing)saveProgress(true);}
    if(a==='stop'){command('player:stop',{});state.playing=false;state.time=0;command('player:setCurrentTime',{time:0});saveProgress(true);updatePlayer();}
    if(a==='rewind')command('player:relativelySeek',{time:-15});
    if(a==='forward')command('player:relativelySeek',{time:30});
    if(a==='next'){const v=adjacent(1);if(v)openVideo(v,true);}
    if(a==='previous'){const v=adjacent(-1);if(v)openVideo(v,true);}
    return;
  }
  if(t.dataset.mode){state.authMode=t.dataset.mode;accountDialog();return;}
  if(t.hasAttribute('data-google')){googleLogin();return;}
  if(t.hasAttribute('data-signout')){await db.auth.signOut();state.user=null;accountButton();closeDialog();toast('Вы вышли. Локальная история осталась на устройстве.');}
});
document.addEventListener('input',e=>{
  if(e.target.id==='video-search'){state.search=e.target.value;state.visible=24;grid();const input=$('#video-search');if(input){input.focus();input.setSelectionRange(state.search.length,state.search.length);}}
  if(e.target.id==='volume-slider')setVolume(Number(e.target.value)/100);
});
document.addEventListener('change',e=>{
  if(e.target.id==='seek-slider'&&state.duration>0){state.time=Math.round(Number(e.target.value)/1000*state.duration);command('player:setCurrentTime',{time:state.time});updatePlayer();saveProgress(true);}
});
document.addEventListener('submit',e=>{if(e.target.id==='auth-form'){e.preventDefault();authSubmit(e.target);}});
window.addEventListener('message',playerMessage);
window.addEventListener('pagehide',()=>saveProgress(true));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveProgress(true);});
setInterval(()=>{if(state.view==='player'&&state.playing)saveProgress(false);},10000);

async function initAuth(){
  if(!db){accountButton();return;}
  const {data}=await db.auth.getSession();state.user=data.session?.user||null;accountButton();
  db.auth.onAuthStateChange((event,session)=>{state.user=session?.user||null;accountButton();if(state.user&&(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'))setTimeout(syncCloud,0);});
  if(state.user)await syncCloud();
}
async function loadCatalog(){
  try{const r=await fetch(base+'data/videos.json',{cache:'no-cache'});if(!r.ok)throw new Error('catalog missing');const data=await r.json();state.videos=Array.isArray(data.videos)?data.videos:[];}
  catch(e){console.warn('Catalog load failed:',e);state.videos=[];}
}
async function boot(){
  await loadCatalog();await initAuth();render();
  const id=new URLSearchParams(location.search).get('video');
  if(id){const v=state.videos.find(x=>String(x.id)===id);if(v)openVideo(v,false);}
  if('serviceWorker'in navigator&&import.meta.env.PROD)navigator.serviceWorker.register(base+'sw.js').catch(console.warn);
}
boot();