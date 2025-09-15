// ✅ 你的 Apps Script Web App /exec URL（已填好）
const API_BASE = 'https://script.google.com/macros/s/AKfycbyh7XZ1UJebZZaJG9AWne_CstpzyxQJ7JMA6EyrKeKkZ_k2DrZW3GcPztz-ZwW_fxSKOw/exec';

const state = { events: [], mySignups: loadLocalSignups() };

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('reloadBtn')?.addEventListener('click', loadEvents);
  document.getElementById('q')?.addEventListener('input', render);
  document.getElementById('openAdmin')?.addEventListener('click', () => document.getElementById('adminDlg')?.showModal());

  document.getElementById('signupForm')?.addEventListener('submit', onSignupSubmit);
  document.getElementById('cancelForm')?.addEventListener('submit', onCancelSubmit);
  document.getElementById('adminForm')?.addEventListener('submit', onAdminSubmit);

  loadEvents();
});

/* ====== 載入活動（連接後端） ====== */
async function loadEvents(){
  try{
    const url = `${API_BASE}?action=events&v=${Date.now()}`; // 也加上一點防快取
    const res = await fetch(url);
    const js = await res.json();
    if (!js.ok) throw js.error || 'load error';
    state.events = (js.data||[]).sort((a,b)=> (a.date||'').localeCompare(b.date||''));
    render();
  }catch(err){
    console.error('[載入活動失敗]', err);
    alert('載入活動失敗：' + err + '\n請先確認：\n1) Apps Script 權限為「任何人」\n2) 試算表有 Events/Signups 分頁與標題列\n3) 打開 /exec?action=events 能回傳 ok:true');
    // 若你想讓畫面至少有東西可看，可開下面的「本地示範資料」：
    // state.events = [{ id:'E_demo', title:'（示範）救護義消活動', date:'2025-09-19', start_time:'18:00', end_time:'21:00', location:'後龍分隊', description:'這是示範資料。', album_url:'https://drive.google.com/embeddedfolderview?id=1kiTnPZNlvPM_L9H6KlDd_UDEz6miryg3#grid', signed_count:0 }];
    // render();
  }
}

/* ====== 介面渲染 ====== */
function render(){
  const list = document.getElementById('eventsList');
  const q = (document.getElementById('q')?.value || '').trim().toLowerCase();
  if (!list) return;

  list.innerHTML = '';
  const filtered = (state.events||[])
    .filter(ev => ev && String(ev.is_active||'').toUpperCase() !== 'FALSE')
    .filter(ev => !q || (`${ev.title||''} ${ev.location||''} ${ev.description||''}`.toLowerCase().includes(q)));

  if (!filtered.length){
    list.innerHTML = '<p class="muted">目前沒有活動（或條件不符）。</p>';
    return;
  }

  for (const ev of filtered){
    const mine = state.mySignups[ev.id];
    const card = document.createElement('div'); card.className = 'event';
    card.innerHTML = `
      <h3>${escapeHTML(ev.title||'未命名活動')}</h3>
      <div class="meta">
        <span class="chip">🗓️ ${formatDate(ev.date)} ${timeRange(ev)}</span>
        ${ev.location ? <span class="chip">📍 ${escapeHTML(ev.location)}</span> : ''}
        <span class="chip">👥 已報 ${Number(ev.signed_count||0)} 人</span>
      </div>
      ${ev.description ? <p style="white-space:pre-line">${escapeHTML(ev.description)}</p> : ''}
      <div class="actions">
        ${mine
          ? <button class="ghost" data-act="open-cancel" data-id="${ev.id}">取消報名（已報 ${mine.count} 人）</button>
          : <button class="primary" data-act="open-signup" data-id="${ev.id}">我要參加</button>
        }
        ${ev.album_url ? <button class="secondary" data-act="toggle-album" data-id="${ev.id}">相簿/現場</button> : ''}
      </div>
      ${ev.album_url ? <div class="album" id="album-${ev.id}" style="display:none"><iframe src="${ev.album_url}"></iframe></div> : ''}
      <p class="muted">活動ID：${ev.id}</p>
    `;
    card.addEventListener('click', onCardAction);
    list.appendChild(card);
  }
}

function timeRange(ev){
  const s = ev.start_time||'', e = ev.end_time||'';
  if (s && e) return `${s}–${e}`;
  if (s) return s;
  return '';
}
function formatDate(s){
  if (!s) return '';
  const [y,m,d] = String(s).split('-');
  if (y && m && d) return `${y}/${m}/${d}`;
  return s; // 後端若回的是 Date 文字，原樣顯示
}
function escapeHTML(s){ return (s||'').replace(/[&<>\"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

/* ====== 卡片按鈕事件 ====== */
function onCardAction(evt){
  const btn = evt.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act, id = btn.dataset.id;
  const ev = state.events.find(x=>x.id===id);
  if (!ev) return;

  if (act==='toggle-album'){
    const box = document.getElementById(`album-${id}`);
    if (box) box.style.display = (box.style.display==='none'||!box.style.display)?'block':'none';
  }
  if (act==='open-signup') openSignup(ev);
  if (act==='open-cancel') openCancel(ev);
}

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
  try{
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
    document.getElementById('signupResult').textContent = `報名成功！已存取消碼於本機。`;
    await loadEvents();
  }catch(err){
    console.error('[報名失敗]', err);
    alert('報名失敗：' + err);
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
  if (!mine){ document.getElementById('cancelResult').textContent = '找不到你的報名紀錄（可能換裝置/清了瀏覽資料）。'; return; }
  const reason = new FormData(e.currentTarget).get('reason') || '';
  try{
    const payload = { action:'cancel', signup_id: mine.signup_id, token: mine.token, reason };
    const res = await fetch(API_BASE, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const js = await res.json();
    if (!js.ok) throw js.error || '取消失敗';
    delete state.mySignups[currentEvent.id];
    saveLocalSignups(state.mySignups);
    document.getElementById('cancelResult').textContent = `已取消報名。`;
    await loadEvents();
  }catch(err){
    console.error('[取消失敗]', err);
    alert('取消失敗：' + err);
  }
}

/* ====== 幹部管理（連後端版） ====== */
async function onAdminSubmit(e){
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.currentTarget));
  const payload = {
    action: data.action,
    admin_key: data.admin_key,     // 後端 Code.gs 的 ADMIN_KEY
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
  try{
    const res = await fetch(API_BASE, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const js = await res.json();
    const msgEl = document.getElementById('adminResult');
    if (!js.ok) { msgEl.textContent = '操作失敗：'+ (js.error||''); return; }
    msgEl.textContent = '成功！返回：' + JSON.stringify(js.data);
    await loadEvents();
  }catch(err){
    console.error('[幹部管理失敗]', err);
    alert('幹部管理失敗：' + err);
  }
}

function valOrUndef(v){ return (v===undefined || v===null || String(v).trim()==='') ? undefined : v; }

/* ====== 本機儲存我的取消碼 ====== */
function loadLocalSignups(){
  try { return JSON.parse(localStorage.getItem('mySignups')||'{}'); } catch { return {}; }
}
function saveLocalSignups(obj){
  localStorage.setItem('mySignups', JSON.stringify(obj||{}));
}
