// 把下面換成你的 Apps Script Web App /exec URL
const API_BASE = 'AKfycbyh7XZ1UJebZZaJG9AWne_CstpzyxQJ7JMA6EyrKeKkZ_k2DrZW3GcPztz-ZwW_fxSKOw/exec';

const state = { events: [], mySignups: loadLocalSignups() };

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('reloadBtn').onclick = loadEvents;
  document.getElementById('q').addEventListener('input', render);
  document.getElementById('openAdmin').onclick = () => document.getElementById('adminDlg').showModal();

  document.getElementById('signupForm').addEventListener('submit', onSignupSubmit);
  document.getElementById('cancelForm').addEventListener('submit', onCancelSubmit);
  document.getElementById('adminForm').addEventListener('submit', onAdminSubmit);

  loadEvents();
});

async function loadEvents(){
  try{
    const res = await fetch(`${API_BASE}?action=events`);
    const js = await res.json();
    if (!js.ok) throw js.error||'load error';
    state.events = js.data.sort((a,b)=> (a.date||'').localeCompare(b.date||'')); // 依日期排序
    render();
  }catch(e){
    alert('載入活動失敗：'+e);
  }
}

function render(){
  const q = (document.getElementById('q').value||'').trim();
  const el = document.getElementById('eventsList');
  el.innerHTML = '';
  const filtered = state.events.filter(ev => {
    if (!q) return true;
    const hay = `${ev.title} ${ev.location} ${ev.description}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  if (!filtered.length){
    el.innerHTML = '<p class="muted">目前沒有符合的活動。</p>';
    return;
  }

  for (const ev of filtered){
    const card = document.createElement('div'); card.className='event';
    const timeStr = [formatDate(ev.date), timeRange(ev)].filter(Boolean).join(' ');
    const signed = ev.signed_count||0;
    const mine = state.mySignups[ev.id];

    card.innerHTML = `
      <h3>${escapeHTML(ev.title)}</h3>
      <div class="meta">
        <span class="chip">🗓️ ${timeStr}</span>
        ${ev.location? `<span class="chip">📍 ${escapeHTML(ev.location)}</span>`:''}
        <span class="chip">👥 已報 ${signed} 人</span>
      </div>
      ${ev.description? `<p>${escapeHTML(ev.description)}</p>`:''}
      <div class="actions">
        ${mine
          ? <button class="ghost" data-act="open-cancel" data-id="${ev.id}">取消報名（已報 ${mine.count} 人）</button>
          : <button class="primary" data-act="open-signup" data-id="${ev.id}">我要參加</button>
        }
        ${ev.album_url ? `<button class="secondary" data-act="toggle-album" data-id="${ev.id}">相簿/現場</button>`:''}
      </div>
      ${ev.album_url ? `<div class="album" id="album-${ev.id}" style="display:none"><iframe src="${ev.album_url}"></iframe></div>`:''}
      <p class="muted">活動ID：${ev.id}${mine?`｜已保存取消碼`:''}</p>
    `;

    card.addEventListener('click', (evt)=>{
      const act = evt.target.dataset.act;
      const id = evt.target.dataset.id;
      if (!act || !id) return;
      const targetEv = state.events.find(x=>x.id===id);
      if (!targetEv) return;
      if (act==='open-signup') openSignup(targetEv);
      if (act==='toggle-album') {
        const box = document.getElementById(`album-${id}`);
        if (box) box.style.display = (box.style.display==='none')?'block':'none';
      }
      if (act==='open-cancel') openCancel(targetEv);
    });

    el.appendChild(card);
  }
}

function timeRange(ev){
  if (ev.start_time && ev.end_time) return `${ev.start_time}–${ev.end_time}`;
  if (ev.start_time) return `${ev.start_time}`;
  return '';
}
function formatDate(s){
  // 'yyyy-MM-dd' -> 'yyyy/MM/dd'
  if (!s) return '';
  const [y,m,d] = s.split('-');
  return `${y}/${m}/${d}`;
}
function escapeHTML(s){ return (s||'').replace(/[&<>\"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m])); }

/* ====== 報名流程 ====== */
let currentEvent = null;

function openSignup(ev){
  currentEvent = ev;
  document.getElementById('signupEventTitle').textContent = `${ev.title}（${formatDate(ev.date)}）`;
  document.getElementById('signupResult').textContent = '';
  document.getElementById('signupForm').reset();
  document.getElementById('signupDlg').showModal();
}

async function onSignupSubmit(e){
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.currentTarget));
  try {
    const payload = {
      action:'signup',
      event_id: currentEvent.id,
      division: data.division,
      name: data.name,
      count: Number(data.count||1),
      ua: navigator.userAgent
    };
    const res = await fetch(API_BASE, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const js = await res.json();
    if (!js.ok) throw js.error || '報名失敗';
    state.mySignups[currentEvent.id] = { signup_id: js.data.signup_id, token: js.data.token, count: payload.count };
    saveLocalSignups(state.mySignups);
    document.getElementById('signupResult').textContent = `報名成功！如需取消，系統已為你保存取消碼。`;
    await loadEvents();
  } catch(err){
    alert('報名失敗：'+ err);
  }
}

function openCancel(ev){
  currentEvent = ev;
  document.getElementById('cancelEventTitle').textContent = `${ev.title}（${formatDate(ev.date)}）`;
  document.getElementById('cancelResult').textContent = '';
  document.getElementById('cancelForm').reset();
  document.getElementById('cancelDlg').showModal();
}

async function onCancelSubmit(e){
  e.preventDefault();
  const mine = state.mySignups[currentEvent.id];
  if (!mine) { alert('找不到你的報名紀錄（可能換裝置/清空瀏覽器）。'); return; }
  const reason = new FormData(e.currentTarget).get('reason') || '';
  try {
    const payload = { action:'cancel', signup_id: mine.signup_id, token: mine.token, reason };
    const res = await fetch(API_BASE, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const js = await res.json();
    if (!js.ok) throw js.error || '取消失敗';
    delete state.mySignups[currentEvent.id];
    saveLocalSignups(state.mySignups);
    document.getElementById('cancelResult').textContent = `已取消報名。`;
    await loadEvents();
  } catch(err){
    alert('取消失敗：'+ err);
  }
}

/* ====== 幹部管理 ====== */
async function onAdminSubmit(e){
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.currentTarget));
  const payload = {
    action: data.action,
    admin_key: data.admin_key,
    id: data.id || undefined,
    title: valOrUndef(data.title),
    date: valOrUndef(data.date),
    start_time: valOrUndef(data.start_time),
    end_time: valOrUndef(data.end_time),
    location: valOrUndef(data.location),
    description: valOrUndef(data.description),
    album_url: valOrUndef(data.album_url),
    is_active: data.is_active ? (data.is_active.toLowerCase()==='true') : undefined,
    created_by: 'admin'
  };
  try {
    const res = await fetch(API_BASE, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const js = await res.json();
    const msgEl = document.getElementById('adminResult');
    if (!js.ok) { msgEl.textContent = '操作失敗：'+ (js.error||''); return; }
    msgEl.textContent = '成功！返回資料：' + JSON.stringify(js.data);
    await loadEvents();
  } catch(err){
    alert('管理操作失敗：'+ err);
  }
}

function valOrUndef(v){ return (v===undefined || v===null || String(v).trim()==='') ? undefined : v; }

/* ====== LocalStorage：存我的報名 ====== */
function loadLocalSignups(){
  try { return JSON.parse(localStorage.getItem('mySignups')||'{}'); } catch { return {}; }
}
function saveLocalSignups(obj){
  localStorage.setItem('mySignups', JSON.stringify(obj||{}));
}
