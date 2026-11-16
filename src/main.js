import './styles.css';
import { createClient } from '@supabase/supabase-js';
import * as tus from 'tus-js-client';

const $ = (s, root = document) => root.querySelector(s);
const base = import.meta.env.BASE_URL || '/';
const url = import.meta.env.VITE_SUPABASE_URL || '';
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const db = url && anon ? createClient(url, anon, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } }) : null;
const KEY = 'history-for-grandma-progress-v1';
const VOLUME_KEY = 'history-for-grandma-volume-v1';
const FAVORITES_KEY = 'history-for-grandma-favorites-v1';
const readFavorites = () => { try { const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '{}'); return Array.isArray(value) ? Object.fromEntries(value.map(id => [String(id), { video_id: String(id) }])) : (value && typeof value === 'object' ? value : {}); } catch { return {}; } };
const persistFavorites = () => { try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites)); } catch { toast('Не получилось сохранить избранное на этом устройстве.'); } };
const isFavorite = id => Boolean(state.favorites[String(id)]);
const favoriteButton = (video, extraClass = '') => { const active = isFavorite(video.id); return '<button class="favorite-toggle ' + extraClass + (active ? ' is-favorite' : '') + '" type="button" data-favorite="' + esc(video.id) + '" aria-label="' + (active ? 'Убрать из избранного' : 'Добавить в избранное') + '" aria-pressed="' + active + '" title="' + (active ? 'Убрать из избранного' : 'Добавить в избранное') + '"><span aria-hidden="true">' + (active ? '♥' : '♡') + '</span></button>'; };
const readProgress = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const state = {
  videos: [], progress: readProgress(), favorites: readFavorites(), user: null, view: 'home', video: null,
  time: 0, duration: 0, volume: Number(localStorage.getItem(VOLUME_KEY) || .8),
  ready: false, playing: false, autoplay: false, resume: 0, nextPrompt: false,
  awaitingVideoInit: false, adVideoIds: new Set(), adWarningShown: false,
  playerSuspended: false, wasPlayingBeforeSuspend: false,
  authMode: 'signin', search: '', visible: 24, lastCloudSave: 0, cloudBusy: false
};
let toastTimer;
let audioContext = null, audioSource = null, gainNode = null, audioElement = null;

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
  return '<article class="video-card-wrap"><button class="video-card" type="button" data-open-video="' + esc(v.id) + '"><span class="video-cover">' + cover +
    (pct ? '<span class="cover-progress"><i style="width:' + pct + '%"></i></span>' : '') + '<span class="cover-play">▶</span></span>' +
    '<span class="video-card-copy"><strong>' + esc(v.title || 'История из жизни') + '</strong><span class="video-card-meta">' +
    (duration ? timeText(duration) : (v.storage_path ? 'Семейное видео' : 'Видео с RuTube')) + (v.created_at ? ' · ' + dateText(v.created_at) : '') + '</span>' +
    (watched ? '<span class="video-resume-label">Остановились на ' + timeText(watched) + '</span>' : '') + '</span></button>' +
    favoriteButton(v) + '</article>';
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
function favoritesMarkup() {
  const entries = Object.entries(state.favorites);
  const cards = entries.map(([id, saved]) => {
    const video = state.videos.find(v => String(v.id) === String(id)) || {
      id, title: saved.title || 'История из избранного',
      thumbnail: saved.thumbnail || '', duration: saved.duration || 0,
      created_at: saved.created_at || ''
    };
    return card(video);
  }).join('');
  return '<section class="page-intro"><span class="eyebrow">ТО, К ЧЕМУ ХОЧЕТСЯ ВЕРНУТЬСЯ</span><h1>Избранное</h1><p>Сохраняйте любимые истории сердечком. Они всегда будут под рукой.</p></section>' +
    (entries.length ? '<div class="history-summary"><span class="history-summary-icon">♥</span><div><strong>В избранном: ' + entries.length + '</strong><p>Любимые выпуски в одном месте.</p></div></div><div class="video-grid favorites-grid">' + cards + '</div>' :
      '<div class="empty-panel history-empty"><span class="empty-icon">♡</span><strong>Пока нет любимых историй</strong><p>Нажмите на сердечко на понравившейся истории — она появится здесь.</p><button class="primary-button" data-view="home">Выбрать историю <span>→</span></button></div>');
}
function updateFavoriteButtons(id) {
  const active = isFavorite(id);
  document.querySelectorAll('[data-favorite="' + CSS.escape(String(id)) + '"]').forEach(button => {
    button.classList.toggle('is-favorite', active);
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? 'Убрать из избранного' : 'Добавить в избранное');
    button.title = active ? 'Убрать из избранного' : 'Добавить в избранное';
    const icon = button.querySelector('span');
    if (icon) icon.textContent = active ? '♥' : '♡';
  });
}
async function toggleFavorite(id) {
  id = String(id);
  const video = state.videos.find(v => String(v.id) === id) || state.favorites[id] || (state.video && String(state.video.id) === id ? state.video : null);
  if (!video) return;
  const wasFavorite = isFavorite(id);
  const previous = state.favorites[id];
  if (wasFavorite) delete state.favorites[id];
  else state.favorites[id] = {
    video_id: id, title: video.title || 'История из жизни',
    thumbnail: video.thumbnail || '', duration: Number(video.duration || 0),
    created_at: video.created_at || '', favorited_at: new Date().toISOString()
  };
  persistFavorites();

  if (db && state.user) {
    const result = wasFavorite
      ? await db.from('favorite_videos').delete().eq('video_id', id)
      : await db.from('favorite_videos').upsert({
          user_id: state.user.id, video_id: id, title: video.title || 'История из жизни'
        }, { onConflict: 'user_id,video_id' });
    if (result.error) {
      if (wasFavorite) state.favorites[id] = previous;
      persistFavorites();
      updateFavoriteButtons(id);
      toast('Не удалось обновить облачное избранное. Проверьте таблицу favorite_videos.');
      console.error('Favorite sync error:', result.error);
      return;
    }
  }
  if (state.view === 'player') updateFavoriteButtons(id);
  else render();
  toast(wasFavorite ? 'История убрана из избранного' : 'История добавлена в избранное');
}
function adjacent(delta) {
  if (!state.video) return null;
  const i = state.videos.findIndex(v => String(v.id) === String(state.video.id));
  return i < 0 ? null : (state.videos[i + delta] || null);
}
function playerMarkup() {
  if (!state.video) return '<div class="empty-panel"><strong>Сначала выберите историю</strong><button class="primary-button" data-view="home">К историям</button></div>';
  const prev = adjacent(-1), next = adjacent(1), native = Boolean(state.video.storage_path);
  const media = native
    ? '<video id="native-player" playsinline webkit-playsinline preload="metadata"' + (state.video.thumbnail ? ' poster="' + esc(state.video.thumbnail) + '"' : '') + '></video>'
    : '<iframe id="rutube-player" title="' + esc(state.video.title) + '" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
  return '<section class="player-page"><button class="back-link" data-view="home"><span>←</span> Назад к историям</button>' +
    '<div class="player-heading"><div class="player-title-copy"><span class="eyebrow">СЕЙЧАС В ВАШЕЙ КОЛЛЕКЦИИ</span><h1>' + esc(state.video.title) + '</h1><p>Смотрите или слушайте в удобном темпе. Ваше место сохранится автоматически.</p></div>' + favoriteButton(state.video, 'player-favorite') + '</div>' +
    '<div class="player-card"><div class="video-stage ' + (native ? 'is-native-video' : 'is-rutube-video') + '">' + media + '</div>' +
    '<div class="player-controls"><div class="seek-row"><span id="current-time">0:00</span><input id="seek-slider" type="range" min="0" max="1000" value="0" aria-label="Позиция в видео"><span id="duration-time">0:00</span></div>' +
    '<div class="control-row"><button class="skip-control" data-player="rewind" type="button" aria-label="Назад на 15 секунд"><span>↶</span><small>15 сек.</small></button><button class="play-control" data-player="toggle" type="button" aria-label="Пауза или воспроизведение"><span id="play-symbol">▶</span></button><button class="skip-control" data-player="forward" type="button" aria-label="Вперёд на 30 секунд"><span>↷</span><small>30 сек.</small></button></div>' +
    '<div class="track-controls"><button class="track-button" data-player="previous" type="button" ' + (prev ? '' : 'disabled') + '><span>⏮</span><small>Предыдущая</small></button><button class="track-button stop-track-button" data-player="stop" type="button"><span>■</span><small>С начала</small></button><button class="track-button" data-player="next" type="button" ' + (next ? '' : 'disabled') + '><span>⏭</span><small>Следующая</small></button></div>' +
    '<div class="volume-row"><span>♪</span><label for="volume-slider">Громкость</label><input id="volume-slider" type="range" min="0" max="' + (native ? 200 : 100) + '" value="' + Math.round(Math.min(native ? 2 : 1, state.volume) * 100) + '" aria-label="Громкость"><span id="volume-value">' + Math.round(Math.min(native ? 2 : 1, state.volume) * 100) + '%</span><span class="save-note" id="save-note">Место сохраняется автоматически</span><small class="volume-hint" id="volume-hint">' + (native ? 'Усиление до 200%' : 'Усиление доступно для загруженных видео') + '</small></div></div></div>' +
    '<div class="next-suggestion" id="next-suggestion" ' + (state.nextPrompt && next ? '' : 'hidden') + '><div><span class="eyebrow">ИСТОРИЯ ЗАВЕРШЕНА</span><strong>Посмотрим ещё одну?</strong><p>' + (next ? esc(next.title) : '') + '</p></div>' + (next ? '<button class="primary-button" data-player="next">Следующая история <span>→</span></button>' : '') + '</div><p class="player-footnote">' + (native ? 'Это видео загружено в семейную библиотеку. Рекламных вставок в собственном плеере нет.' : 'Воспроизведение предоставляется встроенным плеером RuTube. Повторные рекламные паузы, если их назначает RuTube, нельзя отключить настройкой сайта.') + '</p></section>';
}
function uploadMarkup() {
  if (!db) return '';
  return '<section class="upload-section"><div class="upload-copy"><span class="eyebrow">СЕМЕЙНАЯ ВИДЕОТЕКА</span><h2>Добавить свои истории</h2><p>Загрузите исходные MP4, WebM или MOV-файлы. Для них работает отдельный плеер без рекламы RuTube.</p><p class="upload-status" id="upload-status" role="status" hidden></p></div><button class="secondary-button upload-button" type="button" data-upload-trigger>' + (state.user ? '＋ Загрузить видео' : 'Войти, чтобы загрузить') + '</button><input id="upload-files" type="file" accept="video/mp4,video/webm,video/quicktime" multiple hidden></section>';
}
function getRutubeFrame() {
  return $('#rutube-player') || $('#rutube-frame-retainer #rutube-player');
}
function parkRutubeFrame() {
  const frame = $('#rutube-player');
  if (!frame) return;
  let retainer = $('#rutube-frame-retainer');
  if (!retainer) {
    retainer = document.createElement('div');
    retainer.id = 'rutube-frame-retainer';
    retainer.className = 'player-frame-retainer';
    retainer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(retainer);
  }
  if (frame.parentElement !== retainer) retainer.appendChild(frame);
}
function render() {
  const main = $('#main-view');
  parkRutubeFrame();
  main.innerHTML = state.view === 'history' ? historyMarkup() : state.view === 'favorites' ? favoritesMarkup() : state.view === 'player' ? playerMarkup() : homeMarkup();
  if (state.view === 'player' && !state.video?.storage_path) {
    const placeholder = $('#rutube-player', main);
    const retained = $('#rutube-frame-retainer #rutube-player');
    if (placeholder && retained) placeholder.replaceWith(retained);
  }
  document.querySelectorAll('.nav-button').forEach(b => b.classList.toggle('is-active', b.dataset.view === state.view || (state.view === 'player' && b.dataset.view === 'home')));
  if (state.view === 'home') {
    const catalog = $('.catalog-section', main);
    if (catalog) {
      const section = document.createElement('div');
      section.innerHTML = uploadMarkup();
      if (section.firstElementChild) catalog.before(section.firstElementChild);
    }
    grid();
  }
  if (state.view === 'player') mountPlayer();
}
function setView(view) {
  if (state.view === 'player' && view !== 'player') {
    saveProgress(true);
    if (state.video?.storage_path) {
      $('#native-player')?.pause();
    } else if (getRutubeFrame()) {
      command('player:pause', {});
    }
    state.playing = false;
  }
  state.view = view; render(); window.scrollTo({top:0,behavior:'smooth'});
}
function updatePlayerHeader() {
  const title = $('.player-title-copy h1');
  if (title) title.textContent = state.video?.title || '';
  const favorite = $('.player-favorite');
  if (favorite && state.video) favorite.outerHTML = favoriteButton(state.video, 'player-favorite');
  const prev = adjacent(-1), next = adjacent(1);
  const previousButton = $('.track-button[data-player="previous"]');
  const nextButton = $('.track-button[data-player="next"]');
  if (previousButton) previousButton.disabled = !prev;
  if (nextButton) nextButton.disabled = !next;
  const prompt = $('#next-suggestion');
  if (prompt) {
    prompt.hidden = true;
    const name = $('p', prompt);
    if (name) name.textContent = next?.title || '';
  }
}
function openVideo(video, autoplay = true) {
  if (!video) return;
  const retainedFrame = !video.storage_path ? getRutubeFrame() : null;
  const reuseRutubeFrame = Boolean(retainedFrame);
  const sameVideoInFrame = reuseRutubeFrame && retainedFrame.dataset.videoId === String(video.id);
  // Mark the target before render(): mountRutubePlayer must not replace the iframe src
  // when we intend to issue player:changeVideo inside the existing player session.
  if (reuseRutubeFrame && !sameVideoInFrame) retainedFrame.dataset.videoId = String(video.id);
  if (state.video) saveProgress(true);
  const p = progressFor(video.id);
  state.video = video; state.resume = p ? Number(p.current_time || 0) : 0;
  state.time = state.resume; state.duration = Number(video.duration || p?.duration_seconds || 0);
  state.ready = Boolean(reuseRutubeFrame); state.playing = false; state.autoplay = autoplay; state.nextPrompt = false;
  state.awaitingVideoInit = Boolean(reuseRutubeFrame && !sameVideoInFrame);
  state.view = 'player';
  if (reuseRutubeFrame) {
    render();
    if (sameVideoInFrame) {
      state.awaitingVideoInit = false;
      if (autoplay) command('player:play', {});
      state.autoplay = false;
    } else {
      command('player:changeVideo', { id: String(video.id) });
      const expectedId = String(video.id);
      setTimeout(() => {
        if (state.awaitingVideoInit && state.video && String(state.video.id) === expectedId) {
          console.warn('RuTube player:init was not received after changeVideo; session retained without forced iframe reload.');
        }
      }, 6000);
    }
  } else {
    render();
  }
  window.scrollTo({top:0,behavior:'smooth'});
}
function mountPlayer() {
  if (!state.video) return;
  if (state.video.storage_path) mountNativePlayer();
  else mountRutubePlayer();
}
function mountRutubePlayer() {
  const frame = $('#rutube-player'); if (!frame || !state.video) return;
  const id = String(state.video.id);
  if (frame.dataset.videoId !== id) {
    frame.dataset.videoId = id;
    state.adVideoIds = new Set();
    state.adWarningShown = false;
    frame.src = 'https://rutube.ru/play/embed/' + encodeURIComponent(id) + '?skinColor=9b8065' + (state.resume > 0 ? '&t=' + Math.floor(state.resume) : '');
  }
  updatePlayer();
}
function clearNativeAudio() {
  if (audioContext) { try { audioContext.close(); } catch {} }
  audioContext = null; audioSource = null; gainNode = null; audioElement = null;
}
function connectNativeAudio(video) {
  if (audioElement === video) return;
  clearNativeAudio();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) { video.volume = Math.min(1, state.volume); return; }
  try {
    audioContext = new AudioCtx();
    audioSource = audioContext.createMediaElementSource(video);
    gainNode = audioContext.createGain();
    gainNode.gain.value = Math.max(0, Math.min(2, state.volume));
    audioSource.connect(gainNode);
    gainNode.connect(audioContext.destination);
    audioElement = video;
    video.volume = 1;
  } catch (error) {
    console.warn('Audio boost unavailable:', error);
    clearNativeAudio();
    video.volume = Math.min(1, state.volume);
  }
}
function attachNativePlayerEvents(video) {
  video.addEventListener('loadedmetadata', () => {
    if (video !== $('#native-player')) return;
    state.ready = true;
    state.duration = Number.isFinite(video.duration) ? video.duration : state.duration;
    if (state.resume > 0 && state.resume < video.duration) {
      try { video.currentTime = state.resume; } catch {}
    }
    updatePlayer();
    if (state.autoplay) {
      audioContext?.resume().catch(() => {});
      video.play().then(() => { state.autoplay = false; }).catch(() => {
        state.autoplay = false;
        toast('Нажмите ▶, чтобы начать просмотр.');
      });
    }
  }, { once: true });
  video.addEventListener('timeupdate', () => {
    if (video !== $('#native-player')) return;
    state.time = Number(video.currentTime || 0); updatePlayer();
  });
  video.addEventListener('durationchange', () => {
    if (video !== $('#native-player')) return;
    if (Number.isFinite(video.duration)) state.duration = video.duration;
    updatePlayer();
  });
  video.addEventListener('play', () => { state.playing = true; updatePlayer(); });
  video.addEventListener('pause', () => { state.playing = false; saveProgress(true); updatePlayer(); });
  video.addEventListener('ended', () => {
    state.playing = false; state.time = state.duration || state.time;
    saveProgress(true); state.nextPrompt = true;
    const prompt = $('#next-suggestion'); if (prompt) prompt.hidden = !adjacent(1);
    updatePlayer();
  });
  video.addEventListener('error', () => toast('Не удалось открыть видеофайл. Проверьте формат и доступ к хранилищу.'));
}
async function mountNativePlayer() {
  const video = $('#native-player'); if (!video || !state.video) return;
  if (video.dataset.storagePath === state.video.storage_path) return;
  video.dataset.storagePath = state.video.storage_path;
  video.crossOrigin = 'anonymous';
  attachNativePlayerEvents(video);
  connectNativeAudio(video);
  if (!db || !state.user) {
    toast('Для доступа к семейным видео войдите в аккаунт.');
    return;
  }
  const { data, error } = await db.storage.from('history-videos').createSignedUrl(state.video.storage_path, 14400);
  if (error || !data?.signedUrl) {
    console.error('Private video URL failed:', error);
    toast('Не удалось получить доступ к видео. Проверьте SQL-настройку хранилища.');
    return;
  }
  if (video !== $('#native-player') || String(state.video.storage_path) !== video.dataset.storagePath) return;
  video.src = data.signedUrl;
  video.load();
}
function command(type, data = {}) {
  const frame = $('#rutube-player');
  if (!frame?.contentWindow) return;
  try { frame.contentWindow.postMessage(JSON.stringify({type,data}), 'https://rutube.ru'); } catch (e) { console.warn('Player command failed',e); }
}
function updatePlayer() {
  const cur = $('#current-time'), dur = $('#duration-time'), seek = $('#seek-slider'), symbol = $('#play-symbol'), volume = $('#volume-value'), volumeSlider = $('#volume-slider');
  const native = Boolean(state.video?.storage_path), maxVolume = native ? 2 : 1;
  if (cur) cur.textContent = timeText(state.time);
  if (dur) dur.textContent = timeText(state.duration);
  if (seek && document.activeElement !== seek) seek.value = String(state.duration ? Math.min(1000,Math.round(state.time/state.duration*1000)) : 0);
  if (symbol) symbol.textContent = state.playing ? 'Ⅱ' : '▶';
  if (volume) volume.textContent = Math.round(Math.min(maxVolume,state.volume)*100) + '%';
  if (volumeSlider) {
    volumeSlider.max = String(native ? 200 : 100);
    if (document.activeElement !== volumeSlider) volumeSlider.value = String(Math.round(Math.min(maxVolume,state.volume)*100));
  }
  const hint = $('#volume-hint');
  if (hint) hint.textContent = native ? (state.volume > 1 ? 'Усиление активно · возможны искажения' : 'Усиление до 200%') : 'Усиление доступно для загруженных видео';
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
      state.ready = true; state.awaitingVideoInit = false; command('player:setVolume',{volume:Math.min(1,state.volume)});
      if (state.resume > 0) command('player:setCurrentTime',{time:state.resume});
      if (state.autoplay) setTimeout(() => command('player:play',{}), state.resume > 0 ? 650 : 250);
      toast('История готова к просмотру'); break;
    case 'player:init':
      if (state.awaitingVideoInit && (!d.videoId || String(d.videoId) === String(state.video?.id))) {
        state.awaitingVideoInit = false;
        if (state.resume > 0) command('player:setCurrentTime',{time:state.resume});
        if (state.autoplay) command('player:play',{});
        state.autoplay = false;
      }
      break;
    case 'player:adStart': {
      const adVideoId = String(d.videoId || state.video?.id || '');
      if (adVideoId && !state.adVideoIds.has(adVideoId)) {
        if (state.adVideoIds.size > 0 && !state.adWarningShown) {
          state.adWarningShown = true;
          toast('RuTube снова запросил рекламу при смене истории. Сайт не может отключить её внутри плеера.');
        }
        state.adVideoIds.add(adVideoId);
      }
      break;
    }
    case 'player:playStart': state.playing = true; state.autoplay = false; state.playerSuspended = false; updatePlayer(); break;
    case 'player:currentTime': if (Number.isFinite(Number(d.time))) { state.time = Number(d.time); updatePlayer(); } break;
    case 'player:durationChange':
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
    db.from('watch_progress').upsert({user_id:state.user.id,video_id:entry.video_id,title:entry.title,position_seconds:entry.current_time,duration_seconds:entry.duration_seconds,updated_at:entry.updated_at},{onConflict:'user_id,video_id'}).then(({error})=>{if(error)console.warn('Cloud save failed:',error.message);});
  }
}
function setVolume(value) {
  const native = Boolean(state.video?.storage_path);
  state.volume = Math.max(0, Math.min(native ? 2 : 1, Number(value)));
  localStorage.setItem(VOLUME_KEY, String(state.volume));
  if (native) {
    if (gainNode && audioElement === $('#native-player')) {
      gainNode.gain.setTargetAtTime(state.volume, audioContext.currentTime, 0.025);
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    } else {
      const video = $('#native-player');
      if (video) video.volume = Math.min(1, state.volume);
    }
  } else {
    command('player:setVolume', { volume: Math.min(1, state.volume) });
  }
  updatePlayer();
}
async function syncCloud() {
  if (!db || !state.user || state.cloudBusy) return;
  state.cloudBusy = true;
  try {
    const { data, error } = await db.from('watch_progress')
      .select('video_id,title,position_seconds,duration_seconds,updated_at');
    if (error) throw error;
    (data || []).forEach(item => {
      const id = String(item.video_id), local = state.progress[id];
      if (!local || new Date(item.updated_at || 0) >= new Date(local.updated_at || 0)) {
        state.progress[id] = {
          video_id: id, title: item.title || '',
          current_time: Number(item.position_seconds || 0),
          duration_seconds: Number(item.duration_seconds || 0),
          updated_at: item.updated_at || new Date().toISOString()
        };
      }
    });
    persist();

    const rows = Object.entries(state.progress).map(([id,p]) => ({
      user_id: state.user.id, video_id: id, title: p.title || '',
      position_seconds: Number(p.current_time || 0),
      duration_seconds: Number(p.duration_seconds || 0),
      updated_at: p.updated_at || new Date().toISOString()
    }));
    if (rows.length) {
      const uploaded = await db.from('watch_progress').upsert(rows, { onConflict: 'user_id,video_id' });
      if (uploaded.error) throw uploaded.error;
    }

    const remoteFavorites = await db.from('favorite_videos').select('video_id,title,created_at');
    if (!remoteFavorites.error) {
      (remoteFavorites.data || []).forEach(item => {
        const id = String(item.video_id), local = state.favorites[id];
        state.favorites[id] = {
          ...(local || {}), video_id: id,
          title: item.title || local?.title || 'История из жизни',
          created_at: item.created_at || local?.created_at || ''
        };
      });
      persistFavorites();
      const favoriteRows = Object.entries(state.favorites).map(([id,item]) => ({
        user_id: state.user.id, video_id: id, title: item.title || 'История из жизни'
      }));
      if (favoriteRows.length) {
        const uploaded = await db.from('favorite_videos').upsert(favoriteRows, { onConflict: 'user_id,video_id' });
        if (uploaded.error) throw uploaded.error;
      }
    } else if (!['42P01','PGRST205'].includes(remoteFavorites.error.code)) {
      throw remoteFavorites.error;
    } else {
      console.warn('favorite_videos table is not installed yet. Local favorites remain available.');
    }

    if (state.view !== 'player') render();
    toast('История и избранное синхронизированы');
  } catch (e) {
    console.error('Cloud sync failed:', e);
    toast('Не удалось синхронизировать. Локальные данные сохранены.');
  } finally {
    state.cloudBusy = false;
  }
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
  if(t.dataset.favorite){await toggleFavorite(t.dataset.favorite);return;}
  if(t.dataset.view){setView(t.dataset.view);return;}
  if(t.dataset.openVideo){const v=state.videos.find(x=>String(x.id)===String(t.dataset.openVideo));if(v)openVideo(v,true);return;}
  if(t.hasAttribute('data-scroll')){$('#catalog')?.scrollIntoView({behavior:'smooth'});return;}
  if(t.id==='show-more'){state.visible+=24;grid();return;}
  if (t.hasAttribute('data-upload-trigger')) { if (!state.user) { accountDialog(); return; } $('#upload-files')?.click(); return; }
  if(t.dataset.player){
    const a=t.dataset.player, native = $('#native-player');
    if (native) {
      if (a === 'toggle') {
        if (native.paused) { audioContext?.resume().catch(() => {}); native.play().catch(() => toast('Нажмите ▶ ещё раз, чтобы начать просмотр.')); }
        else native.pause();
      }
      if (a === 'stop') { native.pause(); native.currentTime = 0; state.time = 0; saveProgress(true); updatePlayer(); }
      if (a === 'rewind') native.currentTime = Math.max(0, native.currentTime - 15);
      if (a === 'forward') native.currentTime = Math.min(native.duration || Infinity, native.currentTime + 30);
    } else {
      if(a==='toggle'){command(state.playing?'player:pause':'player:play',{});state.playing=!state.playing;updatePlayer();if(!state.playing)saveProgress(true);}
      if(a==='stop'){command('player:pause',{});state.playing=false;state.time=0;command('player:setCurrentTime',{time:0});saveProgress(true);updatePlayer();}
      if(a==='rewind')command('player:relativelySeek',{time:-15});
      if(a==='forward')command('player:relativelySeek',{time:30});
    }
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
  if (e.target.id === 'upload-files') {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length) uploadSelectedFiles(files);
    return;
  }
  if(e.target.id==='seek-slider'&&state.duration>0){
    state.time=Math.round(Number(e.target.value)/1000*state.duration);
    const native=$('#native-player');
    if(native) native.currentTime=state.time;
    else command('player:setCurrentTime',{time:state.time});
    updatePlayer();saveProgress(true);
  }
});
document.addEventListener('submit',e=>{if(e.target.id==='auth-form'){e.preventDefault();authSubmit(e.target);}});
function suspendRutubeForBackground() {
  if (state.view !== 'player' || state.video?.storage_path || !getRutubeFrame() || !state.ready || state.playerSuspended) return;
  state.wasPlayingBeforeSuspend = state.playing;
  state.playerSuspended = true;
  command('player:suspend', {});
}
function wakeRutubeFromBackground() {
  if (!state.playerSuspended || !getRutubeFrame()) return;
  state.playerSuspended = false;
  command('player:wakeup', {});
  if (state.wasPlayingBeforeSuspend) {
    setTimeout(() => {
      if (state.view === 'player' && !state.video?.storage_path) command('player:play', {});
    }, 450);
  }
  state.wasPlayingBeforeSuspend = false;
}
window.addEventListener('message',playerMessage);
window.addEventListener('pagehide',()=>{saveProgress(true);suspendRutubeForBackground();});
window.addEventListener('pageshow',wakeRutubeFromBackground);
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'){saveProgress(true);suspendRutubeForBackground();}
  else wakeRutubeFromBackground();
});
setInterval(()=>{if(state.view==='player'&&state.playing)saveProgress(false);},10000);

async function initAuth(){
  if(!db){accountButton();return;}
  const {data}=await db.auth.getSession();state.user=data.session?.user||null;accountButton();
  db.auth.onAuthStateChange((event,session)=>{state.user=session?.user||null;accountButton();if(state.user&&(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'))setTimeout(async()=>{await syncCloud();await loadCustomVideos();},0);});
  if(state.user){await syncCloud();await loadCustomVideos();}
}
async function loadCustomVideos() {
  if (!db || !state.user) return;
  const { data, error } = await db.from('custom_videos')
    .select('id,title,storage_path,mime_type,size_bytes,duration_seconds,created_at')
    .order('created_at', { ascending: false });
  if (error) {
    if (!['42P01','PGRST205'].includes(error.code)) console.warn('Custom video library unavailable:', error);
    return;
  }
  const custom = (data || []).map(item => ({
    id: 'custom-' + item.id, title: item.title || 'Семейная история',
    thumbnail: '', duration: Number(item.duration_seconds || 0), created_at: item.created_at || '',
    storage_path: item.storage_path, mime_type: item.mime_type || 'video/mp4',
    size_bytes: Number(item.size_bytes || 0)
  }));
  state.videos = [...custom, ...state.videos.filter(video => !video.storage_path)];
  if (state.view !== 'player') render();
}
function uploadStatus(message, show = true) {
  const el = $('#upload-status');
  if (!el) return;
  el.textContent = message;
  el.hidden = !show;
}
function uploadTusFile(file, path, token, onProgress) {
  const projectId = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i)?.[1];
  const endpoint = projectId
    ? 'https://' + projectId + '.storage.supabase.co/storage/v1/upload/resumable'
    : url.replace(/\/$/, '') + '/storage/v1/upload/resumable';
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint, retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: 'Bearer ' + token, apikey: anon, 'x-upsert': 'false' },
      uploadDataDuringCreation: true, removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: { bucketName: 'history-videos', objectName: path, contentType: file.type || 'video/mp4', cacheControl: '3600' },
      onError: reject, onProgress, onSuccess: () => resolve()
    });
    upload.start();
  });
}
async function uploadSelectedFiles(files) {
  if (!db || !state.user) { toast('Сначала войдите в аккаунт.'); return; }
  const allowed = new Set(['video/mp4','video/webm','video/quicktime']);
  const invalid = files.find(file => !allowed.has(file.type));
  if (invalid) { toast('Поддерживаются MP4, WebM и MOV.'); return; }
  const { data: sessionData, error: sessionError } = await db.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (sessionError || !token) { toast('Сессия истекла. Войдите в аккаунт ещё раз.'); return; }
  if ($('#upload-status')) $('#upload-status').hidden = false;
  let completed = 0;
  for (const file of files) {
    const extension = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
    const path = state.user.id + '/' + crypto.randomUUID() + '.' + extension;
    try {
      uploadStatus('Загружаем ' + (completed + 1) + ' из ' + files.length + ': ' + file.name + ' · 0%');
      await uploadTusFile(file, path, token, (uploaded, total) => {
        uploadStatus('Загружаем ' + (completed + 1) + ' из ' + files.length + ': ' + file.name + ' · ' + Math.round(uploaded / total * 100) + '%');
      });
      const title = file.name.replace(/\.[^.]+$/, '').trim() || 'Семейная история';
      const { data, error } = await db.from('custom_videos').insert({
        user_id: state.user.id, title, storage_path: path, mime_type: file.type || 'video/mp4', size_bytes: file.size
      }).select('id,title,storage_path,mime_type,size_bytes,duration_seconds,created_at').single();
      if (error) {
        await db.storage.from('history-videos').remove([path]);
        throw error;
      }
      state.videos.unshift({
        id: 'custom-' + data.id, title: data.title, thumbnail: '', duration: Number(data.duration_seconds || 0),
        created_at: data.created_at || '', storage_path: data.storage_path, mime_type: data.mime_type,
        size_bytes: Number(data.size_bytes || 0)
      });
      completed++;
    } catch (error) {
      console.error('Video upload failed:', error);
      uploadStatus('Не удалось загрузить «' + file.name + '»: ' + (error.message || 'ошибка хранилища'));
      toast('Загрузка остановлена. Проверьте SQL-настройку и лимит хранилища.');
      return;
    }
  }
  uploadStatus('Готово: добавлено видео — ' + completed + '.');
  render();
  toast('Новые истории добавлены в семейную библиотеку.');
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