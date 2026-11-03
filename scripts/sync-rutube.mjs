import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
const CHANNEL = '60691916';
const OUTPUT = new URL('../public/data/videos.json', import.meta.url);
const MAX_PAGES = 200;
const TYPES = 'rtb,rst,ifrm,rspa';

function normalize(item) {
  const id = item.id || item.video_id || item.uuid;
  if (!id) return null;
  const thumb = item.thumbnail_url || item.thumbnail || item.picture || item.image || '';
  return {
    id: String(id),
    title: String(item.title || item.name || 'История из жизни'),
    thumbnail: typeof thumb === 'string' ? thumb : '',
    duration: Number(item.duration || item.video_duration || 0) || 0,
    created_at: item.created_ts || item.created || item.published_at || item.created_at || '',
    views: Number(item.hits || item.views || 0) || 0,
    url: item.video_url || item.url || ('https://rutube.ru/video/' + id + '/')
  };
}

async function getPage(page) {
  const params = new URLSearchParams({page:String(page),format:'json',origin__type:TYPES});
  const response = await fetch('https://rutube.ru/api/video/person/' + CHANNEL + '/?' + params, {
    headers: {'Accept':'application/json','Accept-Language':'ru-RU,ru;q=0.9','User-Agent':'Mozilla/5.0 (compatible; HistoryLibrary/1.0)','Referer':'https://rutube.ru/channel/' + CHANNEL + '/videos/'},
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' on page ' + page);
  return response.json();
}

async function main() {
  const all = [];
  let partial = false;
  try {
    for (let page=1; page<=MAX_PAGES; page+=1) {
      const payload = await getPage(page);
      const rows = Array.isArray(payload.results) ? payload.results : (Array.isArray(payload.data?.results) ? payload.data.results : []);
      if (!rows.length) break;
      all.push(...rows.map(normalize).filter(Boolean));
      console.log('RuTube page ' + page + ': ' + rows.length + ' items, total ' + all.length);
      if (payload.has_next === false || payload.next === null) break;
      if (payload.has_next === undefined && !payload.next && rows.length < 20) break;
    }
  } catch (error) {
    partial = true;
    console.warn('RuTube catalog refresh stopped:', error.message);
  }
  const unique = new Map();
  all.forEach(v => unique.set(v.id,v));
  const videos = Array.from(unique.values());
  if (!videos.length) {
    console.warn('No new catalog received; keep previous public/data/videos.json.');
    return;
  }
  await mkdir(dirname(new URL(OUTPUT).pathname), {recursive:true});
  await writeFile(OUTPUT, JSON.stringify({channel_id:CHANNEL,channel_url:'https://rutube.ru/channel/'+CHANNEL+'/',synced_at:new Date().toISOString(),partial_update:partial,videos},null,2)+'\n','utf8');
  console.log('Saved ' + videos.length + ' videos.');
}
main().catch(error => { console.error(error); process.exitCode = 0; });