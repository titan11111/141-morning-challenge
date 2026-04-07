const DEF = {
  goalTime:'07:15', weekReq:2, rate:10, yen:500,
  apiBase:'https://141-morning-challenge.vercel.app',
  weekDisplayStart:'mon',
  taro:{
    pack:0,
    packLeft:0,
    totalOk:0,
    wStreak:0,
    total:0,
    history:[]
  },
  jiro:{ pt:0, card:0, streak:0, total:0, totalOk:0, history:[] }
};
function load(){
  try{ const s=localStorage.getItem('mc_v3'); return s?deepMerge({...DEF},JSON.parse(s)):{...DEF}; }
  catch{ return {...DEF}; }
}
function deepMerge(d,s){
  const r={...d};
  for(const k in s){ r[k]=(s[k]&&typeof s[k]==='object'&&!Array.isArray(s[k]))?deepMerge(d[k]||{},s[k]):s[k]; }
  return r;
}
function save(){ localStorage.setItem('mc_v3',JSON.stringify(st)); }

let st = load();
let exTarget = '';
let lastActionAt = 0;
let gTaroServer = null;
let gJiroServer = null;
const ACTION_MS = 420;
const DAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const DAYS_JP = ['日','月','火','水','木','金','土'];

function prefersReducedMotion(){
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function actionGuard(){
  const n = Date.now();
  if (n - lastActionAt < ACTION_MS) return false;
  lastActionAt = n;
  return true;
}

let audioCtx = null;
function getTapAudioContext(){
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
/** 物理ボタン風：バンドパスノイズ + 高域クリック + 低音の「カチッ」 */
function tapFeedback(kind){
  if (prefersReducedMotion()) return;
  const heavy = kind === 'heavy';
  try {
    if (navigator.vibrate) {
      navigator.vibrate(heavy ? [0, 10, 4, 12, 6] : [0, 8, 3, 8, 4]);
    }
  } catch(_) {}
  try {
    const ctx = getTapAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = heavy ? 0.72 : 0.62;
    master.connect(ctx.destination);

    const len = Math.floor(ctx.sampleRate * 0.042);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = heavy ? 1650 : 2350;
    bp.Q.value = 0.85;
    const gN = ctx.createGain();
    gN.gain.setValueAtTime(0.0001, t0);
    gN.gain.exponentialRampToValueAtTime(heavy ? 0.11 : 0.075, t0 + 0.0008);
    gN.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.02);
    noise.connect(bp); bp.connect(gN); gN.connect(master);

    const oSq = ctx.createOscillator();
    const gSq = ctx.createGain();
    oSq.type = 'square';
    oSq.frequency.setValueAtTime(heavy ? 3000 : 2550, t0);
    gSq.gain.setValueAtTime(0.0001, t0);
    gSq.gain.exponentialRampToValueAtTime(heavy ? 0.065 : 0.048, t0 + 0.0012);
    gSq.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.016);
    oSq.connect(gSq); gSq.connect(master);

    const oLo = ctx.createOscillator();
    const gLo = ctx.createGain();
    oLo.type = 'sine';
    oLo.frequency.setValueAtTime(heavy ? 125 : 95, t0);
    gLo.gain.setValueAtTime(0.0001, t0);
    gLo.gain.exponentialRampToValueAtTime(heavy ? 0.038 : 0.026, t0 + 0.001);
    gLo.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.038);
    oLo.connect(gLo); gLo.connect(master);

    noise.start(t0);
    noise.stop(t0 + 0.024);
    oSq.start(t0);
    oSq.stop(t0 + 0.02);
    oLo.start(t0);
    oLo.stop(t0 + 0.042);
  } catch(_) {}
}

function guarded(fn, opts){
  return async function(){
    if (opts && opts.skipGuard) return await fn.apply(this, arguments);
    if (!actionGuard()) return;
    const k = opts && opts.feedback;
    if (k !== 'none') tapFeedback(k === 'heavy' ? 'heavy' : 'default');
    return await fn.apply(this, arguments);
  };
}

function syncHistoryDetailsOpen(){
  const mq = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 520px)');
  const narrow = mq && mq.matches;
  ['hist-details-taro', 'hist-details-jiro'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.open = !narrow;
  });
}

window.onload = async () => {
  setDate();
  wireUi();
  syncHistoryDetailsOpen();
  if (typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(max-width: 520px)');
    if (mq.addEventListener) mq.addEventListener('change', syncHistoryDetailsOpen);
    else if (mq.addListener) mq.addListener(syncHistoryDetailsOpen);
  }
  await fetchServerTotals();
  renderAll();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
};

function setDate(){
  const d=new Date();
  document.getElementById('dateDisplay').textContent=
    `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${DAYS[d.getDay()]}`;
}

function wireUi(){
  document.getElementById('tab-taro').addEventListener('click', guarded(() => switchTab('taro')));
  document.getElementById('tab-jiro').addEventListener('click', guarded(() => switchTab('jiro')));
  document.getElementById('btn-cfg').addEventListener('click', guarded(openCfg));

  document.getElementById('taro-ok-btn').addEventListener('click', guarded(() => rec('taro','ok')));
  document.getElementById('taro-ab-btn').addEventListener('click', guarded(() => rec('taro','ab')));
  document.getElementById('jiro-ok-btn').addEventListener('click', guarded(() => rec('jiro','ok')));
  document.getElementById('jiro-ab-btn').addEventListener('click', guarded(() => rec('jiro','ab')));

  document.getElementById('t-ex').addEventListener('click', guarded(() => openEx('taro')));
  document.getElementById('t-undo').addEventListener('click', guarded(openUndo));
  document.getElementById('j-ex').addEventListener('click', guarded(() => openEx('jiro')));

  document.getElementById('btn-do-ex').addEventListener('click', guarded(doEx, { feedback: 'heavy' }));
  document.getElementById('btn-do-undo').addEventListener('click', guarded(doUndo, { feedback: 'heavy' }));

  document.getElementById('btn-save-cfg').addEventListener('click', guarded(saveCfg));
  document.getElementById('btn-export').addEventListener('click', guarded(exportBackup));
  document.getElementById('btn-import').addEventListener('click', guarded(importBackup, { feedback: 'heavy' }));
  document.getElementById('btn-open-reset').addEventListener('click', guarded(openResetModal));
  document.getElementById('btn-execute-reset').addEventListener('click', guarded(executeReset, { feedback: 'heavy' }));

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeOv(btn.getAttribute('data-close')));
  });
  document.getElementById('btn-reset-cancel').addEventListener('click', () => {
    closeOv('resetModal');
    openCfg();
  });

  const rc = document.getElementById('reset-confirm');
  const rb = document.getElementById('btn-execute-reset');
  rc.addEventListener('change', () => { rb.disabled = !rc.checked; });

  document.querySelectorAll('.ov').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target !== el) return;
      el.classList.remove('show');
      if (el.id === 'resetModal') openCfg();
    });
  });
}

function switchTab(w){
  const taroOn=w==='taro';
  document.getElementById('tab-taro').className='tab tap'+(taroOn?' tc':'');
  document.getElementById('tab-jiro').className='tab tap'+(w==='jiro'?' tg':'');
  const pT=document.getElementById('panel-taro');
  const pJ=document.getElementById('panel-jiro');
  pT.classList.toggle('active',taroOn);
  pJ.classList.toggle('active',w==='jiro');
  document.getElementById('tab-taro').setAttribute('aria-selected',taroOn?'true':'false');
  document.getElementById('tab-jiro').setAttribute('aria-selected',taroOn?'false':'true');
  pT.setAttribute('aria-hidden',taroOn?'false':'true');
  pJ.setAttribute('aria-hidden',w==='jiro'?'false':'true');
}

function weekKey(d){
  const t=new Date(d.valueOf());
  t.setHours(0,0,0,0);
  t.setDate(t.getDate()+4-(t.getDay()||7));
  const y=t.getFullYear();
  const wn=Math.ceil(((t-new Date(y,0,1))/864e5+1)/7);
  return `${y}-W${String(wn).padStart(2,'0')}`;
}
function todayKey(){ return weekKey(new Date()); }
function todayStr(){
  const d=new Date(); return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())}`;
}

function getThisWeekDays(){
  const today=new Date(); today.setHours(0,0,0,0);
  const dow=today.getDay();
  const sunStart = st.weekDisplayStart === 'sun';
  let start0=new Date(today);
  if(sunStart){
    start0.setDate(today.getDate()-dow);
  } else {
    start0.setDate(today.getDate()-(dow===0?6:dow-1));
  }
  const days=[];
  for(let i=0;i<7;i++){
    const d=new Date(start0); d.setDate(start0.getDate()+i);
    const key=`${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())}`;
    days.push({ d, key, dow:d.getDay(), isToday:d.toDateString()===today.toDateString() });
  }
  return days;
}

function thisWeekCount(){
  const wk=todayKey();
  return st.taro.history.filter(h=>h.type==='ok'&&weekKey(parseDate(h.date))===wk).length;
}
function parseDate(str){ const[y,m,d]=str.split('.'); return new Date(+y,+m-1,+d); }

function getApiBase(){
  const t = (st && st.apiBase) || (typeof window !== 'undefined' && window.MORNING_API_BASE) || '';
  return String(t || '').trim().replace(/\/$/, '');
}
function apiUrl(path){
  const b = getApiBase();
  if (b) return b + path;
  if (typeof location !== 'undefined') return location.origin + path;
  return path;
}
function isBeforeOrAtGoalTime(goalHHMM){
  if (!goalHHMM) return true;
  const parts = String(goalHHMM).split(':');
  const gh = parseInt(parts[0], 10) || 0;
  const gm = parseInt(parts[1] || '0', 10) || 0;
  const goalM = gh * 60 + gm;
  const n = new Date();
  const nowM = n.getHours() * 60 + n.getMinutes();
  return nowM <= goalM;
}
async function syncWakeServer(who, date){
  const url = apiUrl('/api/morning-challenge');
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ who, date }),
      cache: 'no-store'
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: true, status: r.status, ...j };
    return j;
  } catch (e) {
    return { error: true, message: String(e) };
  }
}
async function fetchServerTotals(){
  const url = apiUrl('/api/morning-challenge');
  const note = document.getElementById('g-note');
  try {
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json();
    if (j.disabled) {
      gTaroServer = null;
      gJiroServer = null;
      if (note) note.textContent = '（KV未接続・共有はローカルのみ）';
      return;
    }
    if (typeof j.taroTotalOk === 'number') gTaroServer = j.taroTotalOk;
    if (typeof j.jiroTotalOk === 'number') gJiroServer = j.jiroTotalOk;
    if (note) note.textContent = '';
  } catch (e) {
    gTaroServer = null;
    gJiroServer = null;
    if (note) note.textContent = '（共有APIに接続できません）';
  }
}

function applyServerTotals(srv){
  if (srv && typeof srv.taroTotalOk === 'number') gTaroServer = srv.taroTotalOk;
  if (srv && typeof srv.jiroTotalOk === 'number') gJiroServer = srv.jiroTotalOk;
}

function taroWeekdayOkInsert(today, todayDow){
  st.taro.totalOk++;
  const wkBefore=thisWeekCount();
  st.taro.history.unshift({date:today,dow:todayDow,type:'ok',note:'週カウント+1'});
  const wkAfter=thisWeekCount();
  if(wkAfter>=st.weekReq && wkBefore<st.weekReq){
    st.taro.pack++;
    st.taro.packLeft++;
    st.taro.history[0].note=`週${st.weekReq}回達成！開封権GET🎴`;
    burst('gold');
    setTimeout(()=>toast(`🎴 週${st.weekReq}回達成！オリパ開封権 GET!!`),200);
  } else {
    burst('cyan');
    toast(`⚡ 起床記録！今週 ${wkAfter}/${st.weekReq} 回`);
  }
}

async function rec(who, type){
  const today=todayStr();
  const todayDow=new Date().getDay();

  if(!st[who].history.find(h=>h.date===today) && !isBeforeOrAtGoalTime(st.goalTime)){
    toast('⚠ 本日のチェックイン期限を過ぎました（目標時刻までに押してください）');
    return;
  }

  if(who==='taro'&&type==='ok'&&(todayDow===0||todayDow===6)){
    toast('⚠ 平日のみ週カウント対象です（週末は共有スコアのみ反映）');
    if(st.taro.history.find(h=>h.date===today)){ toast('⚠ 今日は記録済みです'); return; }
    const srv = await syncWakeServer('taro', today);
    if (srv.error) toast('⚠ 共有に接続できませんでした。ローカルのみ記録します。');
    else if (!srv.disabled){
      applyServerTotals(srv);
      if (srv.accepted === false && srv.reason === 'already_recorded'){
        toast('⚠ 今日は共有済み（他端末）です');
        if (!st.taro.history.find(h=>h.date===today)){
          st.taro.total++;
          st.taro.history.unshift({date:today,dow:todayDow,type:'weekend',note:'週末（カウント外）・同期'});
        }
        save(); renderAll(); return;
      }
    }
    st.taro.total++;
    st.taro.history.unshift({date:today,dow:todayDow,type:'weekend',note:'週末（カウント外）'});
    save(); renderAll(); return;
  }

  if(st[who].history.find(h=>h.date===today)){ toast('⚠ 今日は記録済みです'); return; }

  if(type==='ok'){
    const srv = await syncWakeServer(who, today);
    if (srv.error) toast('⚠ 共有に接続できませんでした。ローカルのみ記録します。');
    else if (!srv.disabled){
      applyServerTotals(srv);
      if (srv.accepted === false && srv.reason === 'already_recorded'){
        toast('⚠ 今日は共有済み（他端末）です');
        if (who === 'taro' && !st.taro.history.find(h=>h.date===today)){
          st.taro.total++;
          taroWeekdayOkInsert(today, todayDow);
        } else if (who === 'jiro' && !st.jiro.history.find(h=>h.date===today)){
          st.jiro.total++;
          st.jiro.totalOk = (st.jiro.totalOk || 0) + 1;
          st.jiro.pt++; st.jiro.streak++;
          st.jiro.history.unshift({date:today,dow:todayDow,type:'ok',note:'同期（共有）'});
          burst('lime');
          toast(`📚 ポイント +1！（合計 ${st.jiro.pt}pt）`);
        }
        save(); renderAll(); return;
      }
    }
  }

  st[who].total++;

  if(type==='ok'){
    if(who==='taro'){
      taroWeekdayOkInsert(today, todayDow);
    } else {
      st.jiro.totalOk = (st.jiro.totalOk || 0) + 1;
      st.jiro.pt++; st.jiro.streak++;
      st.jiro.history.unshift({date:today,dow:todayDow,type:'ok',note:'pt +1'});
      burst('lime');
      toast(`📚 ポイント +1！（合計 ${st.jiro.pt}pt）`);
    }
  } else {
    if(who==='taro') st.taro.history.unshift({date:today,dow:todayDow,type:'ab',note:'---'});
    else { st.jiro.streak=0; st.jiro.history.unshift({date:today,dow:todayDow,type:'ab',note:'---'}); }
    toast('💤 記録しました');
  }
  save(); renderAll();
}

function openEx(who){
  exTarget=who;
  if(who==='taro'){
    document.getElementById('ex-title').textContent='GIVE PACK 🎴';
    document.getElementById('ex-title').style.color='var(--c5)';
    document.getElementById('ex-body').textContent=
      `未渡しパック: ${st.taro.packLeft} 枚\n子供に渡す枚数を入力してください。\n（累計獲得 ${st.taro.pack} ／渡し済み ${st.taro.given||0}）`;
    document.getElementById('ex-cnt').max=st.taro.packLeft;
    document.getElementById('ex-cnt').value=1;
  } else {
    const r=st.rate,y=st.yen,max=Math.floor(st.jiro.pt/r);
    document.getElementById('ex-title').textContent='PT → TOSHO CARD';
    document.getElementById('ex-title').style.color='var(--c3)';
    document.getElementById('ex-body').textContent=
      `現在 ${st.jiro.pt}pt\n${r}pt = 図書カード ${y}円分\n交換枚数（最大 ${max}枚）:`;
    document.getElementById('ex-cnt').max=max;
    document.getElementById('ex-cnt').value=max>0?1:0;
  }
  document.getElementById('exModal').classList.add('show');
}
function doEx(){
  const n=parseInt(document.getElementById('ex-cnt').value,10)||0;
  const today=todayStr();
  if(exTarget==='taro'){
    if(n<=0||n>st.taro.packLeft){ toast('⚠ 枚数エラー'); return; }
    st.taro.packLeft-=n;
    st.taro.given=(st.taro.given||0)+n;
    st.taro.history.unshift({
      date:today, dow:new Date().getDay(),
      type:'give', note:`パック ${n}枚 渡した`, giveN:n
    });
    burst('gold'); toast(`🎴 パック ${n}枚 渡した！（残り ${st.taro.packLeft}枚）`);
  } else {
    const needed=n*st.rate;
    if(n<=0||needed>st.jiro.pt){ toast('⚠ ポイント不足'); return; }
    st.jiro.pt-=needed; st.jiro.card+=n;
    st.jiro.history.unshift({date:today,dow:new Date().getDay(),type:'ex',note:`${needed}pt→図書カード${n}枚`});
    burst('lime'); toast(`🎁 図書カード ${n}枚 GET!`);
  }
  save(); renderAll(); closeOv('exModal');
}

function openUndo(){
  const last=st.taro.history.find(h=>h.type==='give');
  if(!last){ toast('⚠ 取消できる記録がありません'); return; }
  document.getElementById('undo-body').textContent=
    `直近の「渡した」記録:\n${last.date}  パック ${last.giveN} 枚\n\nこの記録を取り消しますか？\n（未渡しが ${last.giveN} 枚に戻ります）`;
  document.getElementById('undoModal').classList.add('show');
}
function doUndo(){
  const idx=st.taro.history.findIndex(h=>h.type==='give');
  if(idx===-1){ toast('⚠ 取消できる記録がありません'); closeOv('undoModal'); return; }
  const rrec=st.taro.history[idx];
  st.taro.packLeft+=rrec.giveN;
  st.taro.given=Math.max(0,(st.taro.given||0)-rrec.giveN);
  st.taro.history.splice(idx,1);
  save(); renderAll(); closeOv('undoModal');
  toast(`↩ 取消しました（未渡し ${st.taro.packLeft}枚に戻しました）`);
}

function renderAll(){
  const wReq=st.weekReq;
  const goalFmt=fmtTime(st.goalTime);
  document.getElementById('goalDisplay').textContent=goalFmt;
  const gSub=document.getElementById('goal-sub-text');
  if(gSub){
    gSub.innerHTML=`平日この時刻までに起きると +1<br>週${wReq}回達成 → オリパ1パック開封🎴`;
  }
  const okT=document.getElementById('chk-ok-label-taro');
  const okJ=document.getElementById('chk-ok-label-jiro');
  if(okT) okT.textContent=`${goalFmt}までに起きた！`;
  if(okJ) okJ.textContent=`${goalFmt}までに起きた！`;
  const subT=document.getElementById('chk-ok-sub-taro');
  if(subT) subT.textContent=`週カウント +1（週${wReq}回達成でオリパ開封権）`;
  const gh=document.getElementById('taro-gauge-hint');
  if(gh) gh.textContent=`週${wReq}回達成でオリパ1パック`;
  const ach=document.getElementById('achieve-sub-text');
  if(ach) ach.textContent=`週${wReq}回達成！オリパ1パック開封権GET🎉`;

  const gt = document.getElementById('g-taro');
  const gj = document.getElementById('g-jiro');
  if (gt) gt.textContent = gTaroServer !== null && gTaroServer !== undefined ? String(gTaroServer) : '—';
  if (gj) gj.textContent = gJiroServer !== null && gJiroServer !== undefined ? String(gJiroServer) : '—';

  const wDays=getThisWeekDays();
  const wCnt=thisWeekCount();
  const done=wCnt>=wReq;

  const cntEl=document.getElementById('taro-week-cnt');
  cntEl.textContent=`${wCnt} / ${wReq}`;
  cntEl.className='week-count'+(done?' full':'');

  document.getElementById('taro-achieve').style.display=done?'block':'none';

  const daysEl=document.getElementById('taro-week-days');
  daysEl.innerHTML='';
  wDays.forEach(({key,dow,isToday})=>{
    const chip=document.createElement('div');
    chip.className='day-chip';
    const weekend=dow===0||dow===6;
    if(weekend) chip.classList.add('weekend');
    if(isToday) chip.classList.add('today-mark');

    const rrec=st.taro.history.find(h=>h.date===key);
    let icon='·';
    if(rrec){
      if(rrec.type==='ok'){ chip.classList.add('ok'); icon='✓'; }
      else if(rrec.type==='ab'||rrec.type==='miss'){ chip.classList.add('miss'); icon='✕'; }
      else { icon='·'; }
    }
    chip.innerHTML=`<span class="day-name">${DAYS_JP[dow]}</span><span class="day-icon">${icon}</span>`;
    daysEl.appendChild(chip);
  });

  const pct=Math.min(wCnt/wReq*100,100);
  const gEl=document.getElementById('taro-gauge');
  gEl.style.width=pct+'%';
  gEl.className='gauge-fill'+(done?' done':'');
  const glEl=document.getElementById('taro-gauge-lbl');
  glEl.className='gauge-lbl'+(done?' done':'');
  document.getElementById('taro-cnt-lbl').textContent=`${wCnt} / ${wReq} 回`;

  const given = st.taro.given||0;
  set('t-pack', st.taro.packLeft);
  set('t-total-ok', st.taro.totalOk);
  const tSl = document.getElementById('t-total-ok-sl');
  if (tSl) tSl.textContent = gTaroServer !== null ? '✅ 平日・起床成功（ローカル／共有は上段）' : '✅ 平日・起床成功（ローカル）';
  set('t-given', given);
  set('t-total', st.taro.total);
  set('t-pack-total', st.taro.pack);
  set('t-given2', given);
  document.getElementById('t-ex').disabled = st.taro.packLeft === 0;
  document.getElementById('t-undo').disabled = !st.taro.history.find(h=>h.type==='give');

  const today=todayStr();
  const todayRec=st.taro.history.find(h=>h.date===today);
  const jTodayRec=st.jiro.history.find(h=>h.date===today);
  const inWindow=isBeforeOrAtGoalTime(st.goalTime);
  const taroBtnsLocked=!!todayRec||!inWindow;
  const jiroBtnsLocked=!!jTodayRec||!inWindow;
  document.getElementById('taro-ok-btn').disabled=taroBtnsLocked;
  document.getElementById('taro-ab-btn').disabled=taroBtnsLocked;
  document.getElementById('jiro-ok-btn').disabled=jiroBtnsLocked;
  document.getElementById('jiro-ab-btn').disabled=jiroBtnsLocked;

  const msgT='⏰ 本日のチェックイン期限を過ぎました（目標時刻までに押してください）。明日はまた記録できます。';
  const dmT=document.getElementById('deadline-msg-taro');
  const dmJ=document.getElementById('deadline-msg-jiro');
  if(dmT){
    const show=!todayRec&&!inWindow;
    dmT.style.display=show?'block':'none';
    dmT.textContent=show?msgT:'';
  }
  if(dmJ){
    const show=!jTodayRec&&!inWindow;
    dmJ.style.display=show?'block':'none';
    dmJ.textContent=show?msgT:'';
  }

  const r=st.rate, y=st.yen, ptCycle=st.jiro.pt%r;
  set('j-pt',st.jiro.pt); set('j-card',st.jiro.card);
  set('j-streak',st.jiro.streak); set('j-total',st.jiro.total);
  set('j-total-ok', st.jiro.totalOk != null ? st.jiro.totalOk : st.jiro.history.filter(h=>h.type==='ok').length);
  const jSl = document.getElementById('j-total-ok-sl');
  if (jSl) jSl.textContent = gJiroServer !== null ? '✅ 起床OK回（ローカル／共有は上段）' : '✅ 起床OK回（ローカル）';
  document.getElementById('j-bar').style.width=(ptCycle/r*100)+'%';
  document.getElementById('j-pt-lbl').textContent=st.jiro.pt+' PT';
  document.getElementById('j-tgt-lbl').textContent=`${r}PT = ¥${y}`;
  document.getElementById('j-ex').disabled=st.jiro.pt<r;

  renderHist('taro');
  renderHist('jiro');
}

function renderHist(who){
  const list=who==='taro'?st.taro.history:st.jiro.history;
  const tb=document.getElementById(who==='taro'?'t-hist':'j-hist');
  const em=document.getElementById(who==='taro'?'t-emp':'j-emp');
  tb.innerHTML='';
  if(!list.length){ em.style.display=''; return; }
  em.style.display='none';
  const bm={
    ok:      '<span class="badge bok">OK</span>',
    ab:      '<span class="badge bab">REST</span>',
    give:    '<span class="badge bex">GIVEN</span>',
    use:     '<span class="badge bex">USED</span>',
    ex:      '<span class="badge bekg">EXCHANGE</span>',
    weekend: '<span class="badge bab">WEEKEND</span>',
  };
  list.slice(0,50).forEach(h=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td style="font-family:var(--font-mono);font-size:.72rem;color:#A0A0C8">${h.date}</td>
      <td style="font-family:var(--font-mono);font-size:.7rem;color:var(--c5)">${DAYS_JP[h.dow]||'?'}</td>
      <td>${bm[h.type]||h.type}</td>
      <td style="font-size:.78rem;color:#B0B0D0">${h.note}</td>`;
    tb.appendChild(tr);
  });
}

function openCfg(){
  document.getElementById('s-time').value=st.goalTime;
  document.getElementById('s-req').value=st.weekReq;
  document.getElementById('s-rate').value=st.rate;
  document.getElementById('s-yen').value=st.yen;
  document.getElementById('s-week-start').value=st.weekDisplayStart === 'sun' ? 'sun' : 'mon';
  const ab = document.getElementById('s-api-base');
  if (ab) ab.value = st.apiBase || '';
  document.getElementById('cfgModal').classList.add('show');
}
async function saveCfg(){
  st.goalTime=document.getElementById('s-time').value;
  st.weekReq=parseInt(document.getElementById('s-req').value,10)||2;
  st.rate=parseInt(document.getElementById('s-rate').value,10)||10;
  st.yen=parseInt(document.getElementById('s-yen').value,10)||500;
  st.weekDisplayStart=document.getElementById('s-week-start').value === 'sun' ? 'sun' : 'mon';
  const ab = document.getElementById('s-api-base');
  if (ab) st.apiBase = String(ab.value || '').trim();
  save(); await fetchServerTotals(); renderAll(); closeOv('cfgModal'); toast('⚙ 設定を保存しました');
}

function exportBackup(){
  const json = JSON.stringify(st);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(json).then(() => toast('📋 クリップボードにコピーしました')).catch(fallbackCopy);
  } else fallbackCopy();

  function fallbackCopy(){
    const ta = document.createElement('textarea');
    ta.value = json;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('📋 コピーしました');
    } catch(_) {
      toast('コピーに失敗しました。手動で選択してください。');
    }
    document.body.removeChild(ta);
  }
}

async function importBackup(){
  const raw = document.getElementById('import-area').value.trim();
  if (!raw) { toast('⚠ JSONを貼り付けてください'); return; }
  let o;
  try { o = JSON.parse(raw); } catch(_) { toast('⚠ 形式が正しくありません'); return; }
  if (!o || typeof o !== 'object') { toast('⚠ データが不正です'); return; }
  st = deepMerge({...DEF}, o);
  save();
  await fetchServerTotals();
  renderAll();
  document.getElementById('import-area').value = '';
  closeOv('cfgModal');
  toast('✅ インポートしました');
}

function openResetModal(){
  closeOv('cfgModal');
  document.getElementById('reset-confirm').checked = false;
  document.getElementById('btn-execute-reset').disabled = true;
  document.getElementById('resetModal').classList.add('show');
}
async function executeReset(){
  if (!document.getElementById('reset-confirm').checked) return;
  localStorage.removeItem('mc_v3');
  st = load();
  save();
  await fetchServerTotals();
  renderAll();
  closeOv('resetModal');
  closeOv('cfgModal');
  toast('🗑 リセット完了');
}

function closeOv(id){
  document.getElementById(id).classList.remove('show');
}

function set(id,v){ const el=document.getElementById(id); if(el) el.textContent=v; }
function pad(n){ return String(n).padStart(2,'0'); }
function fmtTime(t){ if(!t) return '7:15'; const[h,m]=t.split(':'); return `${parseInt(h,10)}:${m}`; }
function toast(msg){
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),2800);
}
function burst(color){
  if (prefersReducedMotion()) return;
  const cols={
    cyan:['#00F5FF','#00B8CC','#FFFFFF'],
    gold:['#FFB800','#FF8C00','#FFE066','#FFFFFF'],
    lime:['#ADFF02','#7FBB00','#FFFFFF'],
  }[color]||['#FFFFFF'];
  const nPart = 12;
  for(let i=0;i<nPart;i++){
    const el=document.createElement('div');
    el.className='particle';
    const a=Math.random()*360, dist=50+Math.random()*100, rad=a*Math.PI/180;
    el.style.cssText=`width:${4+Math.random()*6}px;height:${4+Math.random()*6}px;
      background:${cols[Math.floor(Math.random()*cols.length)]};
      box-shadow:0 0 6px currentColor;
      left:50vw;top:42vh;
      --tx:${Math.cos(rad)*dist}px;--ty:${Math.sin(rad)*dist}px;
      animation-delay:${Math.random()*.12}s;animation-duration:${.75+Math.random()*.45}s;`;
    document.body.appendChild(el);
    setTimeout(()=>el.remove(),1500);
  }
}
