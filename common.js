window.R=(()=>{
let data,opt={};
const $=id=>document.getElementById(id),days=['','Po','Út','St','Čt','Pá'];
const pad=n=>String(n).padStart(2,'0');
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const add=(d,n)=>{let x=new Date(d);x.setDate(x.getDate()+n);return x};
const monday=d=>{let x=new Date(d.getFullYear(),d.getMonth(),d.getDate()),n=x.getDay()||7;x.setDate(x.getDate()-n+1);return x};
const mins=t=>{let[a,b]=t.split(':').map(Number);return a*60+b};
const tm=m=>`${pad(Math.floor(m/60))}:${pad(m%60)}`;
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const narrow=()=>window.matchMedia('(max-width:700px)').matches;
let week=monday(new Date()),resizeBound=false,dataFingerprint='';
let audioCtx=null,flashUntil=0,flashPhase=false;
let soundEnabled=localStorage.getItem('bernard_alert_sound')==='1';

const DEFAULT_DUTIES=[
  {id:'du-mo-0750',day:1,start:'07:50',end:'08:00',subject:'DOHLED',class:'',room:'2ČŽ',kind:'duty'},
  {id:'du-mo-1140',day:1,start:'11:40',end:'11:50',subject:'DOHLED',class:'',room:'2ČŽ',kind:'duty'},
  {id:'du-tu-1305',day:2,start:'13:05',end:'13:15',subject:'DOHLED',class:'',room:'1ZŽ',kind:'duty'},
  {id:'du-th-0845',day:4,start:'08:45',end:'08:55',subject:'DOHLED',class:'',room:'1ZŽ',kind:'duty'}
];
const DEFAULT_FONT_SIZES={"subject":16,"class":9,"room":9,"note":9,"cycle":8,"test":8,"eventTime":8,"change":8,"period":16,"periodTime":9,"day":17,"date":12,"duty":11,"lunch":13,"absence":14};

function normalize(x){
  x??={};
  x.changes??={};
  if(!Array.isArray(x.duties)) x.duties=DEFAULT_DUTIES.map(v=>({...v}));
  x.fontSizes={...DEFAULT_FONT_SIZES,...(x.fontSizes||{})};
  return x;
}
function applyFontSizes(){
  if(!data)return;
  const f={...DEFAULT_FONT_SIZES,...(data.fontSizes||{})},r=document.documentElement;
  const set=(k,v)=>r.style.setProperty(k,Math.max(6,Math.min(40,Number(v)||10))+'px');
  set('--fs-subject',f.subject);set('--fs-class',f.class);set('--fs-room',f.room);set('--fs-note',f.note);
  set('--fs-cycle',f.cycle);set('--fs-test',f.test);set('--fs-etime',f.eventTime);set('--fs-change',f.change);
  set('--fs-period',f.period);set('--fs-period-time',f.periodTime);set('--fs-day',f.day);set('--fs-date',f.date);
  set('--fs-duty',f.duty);set('--fs-lunch',f.lunch);set('--fs-absence',f.absence);
}
function ch(k){return data.changes?.[k]||{}}
function fmt(d){return d.toLocaleDateString('cs-CZ',{day:'numeric',month:'numeric'})}
function isoWeekNum(d){
  const x=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  x.setUTCDate(x.getUTCDate()+4-(x.getUTCDay()||7));
  const y=new Date(Date.UTC(x.getUTCFullYear(),0,1));
  return Math.ceil((((x-y)/86400000)+1)/7);
}
function cycleLabel(e){
  return e.cycleTag ? e.cycleTag+(isoWeekNum(week)%2===1?'1':'2') : '';
}
function dayWidth(){
  const v=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--day-w'));
  return Number.isFinite(v)?v:(narrow()?72:95);
}
function fiveBStart(){
  return (data.periods||[]).find(p=>p.label==='5b')?.start||'12:20';
}
function clipAtFiveB(events){
  const cut=fiveBStart(),cm=mins(cut);
  const hasFiveB=events.some(e=>e.status!=='cancelled'&&e.kind!=='duty'&&e.start===cut);
  if(!hasFiveB)return events;
  return events.map(e=>{
    if(e.status!=='cancelled'&&e.kind!=='duty'&&mins(e.start)<cm&&mins(e.end)>cm)return{...e,end:cut,_clippedAtFiveB:true};
    return e;
  });
}
function eventForDisplay(e,dateKey){
  if(!e?.id)return e;
  const d=new Date(dateKey+'T12:00:00');
  return effectiveEventsForDate(d).find(x=>x.id===e.id)||e;
}

function effectiveEventsForDate(date){
  const d=date.getDay();
  if(d<1||d>5)return[];
  const k=iso(date),c=ch(k);
  if(c.absence)return[{subject:'NEPŘÍTOMEN',start:'00:00',end:'23:59',kind:'absence',note:c.absence.note||''}];

  const out=[];
  (data.schedule||[]).filter(e=>e.day===d).forEach(base=>{
    const over=c.events?.[base.id],e=over?{...base,...over}:base;
    if(e.status!=='cancelled')out.push(e);
  });
  (data.duties||[]).filter(e=>e.day===d).forEach(base=>{
    const over=c.events?.[base.id],e=over?{...base,...over,kind:'duty'}:base;
    if(e.status!=='cancelled')out.push(e);
  });
  (c.custom||[]).forEach(e=>{if(e.status!=='cancelled')out.push(e)});
  return clipAtFiveB(out).sort((a,b)=>mins(a.start)-mins(b.start)||mins(a.end)-mins(b.end));
}
function tabEventName(e){
  if(e.kind==='absence')return e.note?'NEPŘÍTOMEN • '+e.note:'NEPŘÍTOMEN';
  if(e.kind==='duty')return 'DOHLED'+(e.room?' • '+e.room:'');
  if(e.kind==='lunch')return 'OBĚD';
  let s=e.subject||'UDÁLOST';
  if(e.room)s+=' • '+e.room;
  if(e.class)s+=' • '+e.class;
  if(e.test)s+=' • TEST';
  return s;
}
function eventPriority(e){
  if(e.kind==='absence')return 100;
  if(e.kind==='lunch')return 10;
  if(e.kind==='duty')return 20;
  return 30;
}
function currentEventAt(date){
  const events=effectiveEventsForDate(date),m=date.getHours()*60+date.getMinutes();
  return events
    .filter(e=>m>=mins(e.start)&&m<mins(e.end))
    .sort((a,b)=>eventPriority(b)-eventPriority(a)||mins(b.start)-mins(a.start))[0]||null;
}
function nextEventAt(date){
  const events=effectiveEventsForDate(date),m=date.getHours()*60+date.getMinutes();
  const future=events.filter(e=>mins(e.start)>m);
  if(!future.length)return null;
  const firstStart=Math.min(...future.map(e=>mins(e.start)));
  return future
    .filter(e=>mins(e.start)===firstStart)
    .sort((a,b)=>eventPriority(b)-eventPriority(a)||mins(a.end)-mins(b.end))[0]||null;
}
function eventKey(e,date){
  return e?(iso(date)+'|'+(e.id||e.kind||e.subject||'event')+'|'+e.start+'|'+e.end):'';
}
function normalTabTitle(date=new Date()){
  if(!data)return'Rozvrh';
  const events=effectiveEventsForDate(date),m=date.getHours()*60+date.getMinutes();
  if(!events.length)return'Rozvrh – '+(data.teacher||'');
  const current=currentEventAt(date);
  if(current)return current.kind==='absence'?tabEventName(current):current.start+' '+tabEventName(current);
  const next=nextEventAt(date);
  return next?'→ '+next.start+' '+tabEventName(next):'Volno – '+(data.teacher||'Rozvrh');
}
function updateAlertButton(){
  const b=$('alertToggle');if(!b)return;
  const ready=soundEnabled&&audioCtx&&audioCtx.state==='running';
  b.textContent=!soundEnabled?'🔕 Zvuk vypnut':(ready?'🔔 Zvuk zapnut':'🔔 Zvuk – klikni');
  b.classList.toggle('on',soundEnabled);
  b.classList.toggle('waiting',soundEnabled&&!ready);
  b.title=!soundEnabled?'Kliknutím zapneš zvuk při začátku události':(ready?'Zvuk při začátku události je připravený':'Prohlížeč potřebuje jeden klik na stránku, aby povolil zvuk');
}
function unlockAudio(){
  if(!soundEnabled)return;
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    if(!audioCtx)audioCtx=new AC();
    if(audioCtx.state==='suspended')audioCtx.resume().then(updateAlertButton).catch(()=>{});
    else updateAlertButton();
  }catch(_){}
}
function beep(preview=false){
  if(!soundEnabled)return;
  unlockAudio();
  if(!audioCtx||audioCtx.state!=='running')return;
  const now=audioCtx.currentTime;
  const tones=preview?[[0,660,.09]]:[[0,660,.12],[.18,880,.14]];
  tones.forEach(([delay,freq,dur])=>{
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type='sine';o.frequency.setValueAtTime(freq,now+delay);
    g.gain.setValueAtTime(.0001,now+delay);
    g.gain.exponentialRampToValueAtTime(.13,now+delay+.015);
    g.gain.exponentialRampToValueAtTime(.0001,now+delay+dur);
    o.connect(g);g.connect(audioCtx.destination);
    o.start(now+delay);o.stop(now+delay+dur+.02);
  });
}
function flashEventStart(e){
  flashUntil=Date.now()+10000;flashPhase=true;
  document.body.classList.remove('event-start');
  void document.body.offsetWidth;
  document.body.classList.add('event-start');
  let t=document.querySelector('.eventToast');
  if(!t){t=document.createElement('div');t.className='eventToast';document.body.appendChild(t)}
  t.textContent='Začíná '+e.start+' • '+tabEventName(e);
  t.classList.add('show');
  clearTimeout(flashEventStart._timer);
  flashEventStart._timer=setTimeout(()=>{document.body.classList.remove('event-start');t.classList.remove('show')},10000);
}
function eventStartTime(e,date){
  const [h,m]=e.start.split(':').map(Number);
  return new Date(date.getFullYear(),date.getMonth(),date.getDate(),h,m,0,0).getTime();
}
function monitorEventStart(){
  if(!data)return;
  const n=new Date(),e=currentEventAt(n),key=eventKey(e,n);
  if(e&&e.kind!=='absence'){
    const age=Date.now()-eventStartTime(e,n);
    const last=sessionStorage.getItem('bernard_last_alert_key')||'';
    // Up to 5 minutes late on purpose: background/sleeping tabs may be throttled by the browser.
    if(age>=0&&age<=5*60*1000&&key!==last){
      sessionStorage.setItem('bernard_last_alert_key',key);
      flashEventStart(e);
      beep(false);
    }
  }
  if(Date.now()<flashUntil){
    flashPhase=!flashPhase;
    document.title=flashPhase&&e?'🔔 ZAČÍNÁ: '+tabEventName(e):normalTabTitle(n);
  }else if(flashUntil){
    flashUntil=0;document.title=normalTabTitle(n);
  }
}
function bindAlerts(){
  updateAlertButton();
  const b=$('alertToggle');
  if(b)b.onclick=()=>{
    soundEnabled=!soundEnabled;
    localStorage.setItem('bernard_alert_sound',soundEnabled?'1':'0');
    updateAlertButton();
    if(soundEnabled){unlockAudio();setTimeout(()=>beep(true),40)}
  };
  document.addEventListener('pointerdown',()=>{if(soundEnabled)unlockAudio()},{passive:true});
  document.addEventListener('keydown',()=>{if(soundEnabled)unlockAudio()},{passive:true});
  setInterval(monitorEventStart,1000);
}
function updateTabTitle(){
  if(!data||Date.now()<flashUntil)return;
  document.title=normalTabTitle(new Date());
}

function layout(){
  const p=data.periods||[],slots=[];
  const mobile=narrow(),pxPerMin=mobile?2.45:3.0;
  const timelineStart=mins(data.timeline?.start||p[0]?.start||'07:05');
  const timelineEnd=mins(data.timeline?.end||p[p.length-1]?.end||'15:05');

  p.forEach((x,i)=>{
    slots.push({
      type:'period',key:'p'+i,index:i,label:x.label,start:x.start,end:x.end,
      left:(mins(x.start)-timelineStart)*pxPerMin,
      width:(mins(x.end)-mins(x.start))*pxPerMin
    });
    const next=p[i+1];
    if(next&&mins(next.start)>mins(x.end)){
      slots.push({
        type:'break',key:'b'+i,index:i,start:x.end,end:next.start,
        left:(mins(x.end)-timelineStart)*pxPerMin,
        width:(mins(next.start)-mins(x.end))*pxPerMin
      });
    }else if(!next&&data.timeline?.end&&mins(data.timeline.end)>mins(x.end)){
      slots.push({
        type:'break',key:'bend',index:i,start:x.end,end:data.timeline.end,
        left:(mins(x.end)-timelineStart)*pxPerMin,
        width:(mins(data.timeline.end)-mins(x.end))*pxPerMin
      });
    }
  });

  slots.timelineStart=timelineStart;
  slots.timelineEnd=timelineEnd;
  slots.pxPerMin=pxPerMin;
  slots.totalWidth=(timelineEnd-timelineStart)*pxPerMin;
  return slots;
}
function template(slots){return slots.map(s=>s.width+'px').join(' ')}
function rectForTime(start,end,slots){
  const s=Math.max(slots.timelineStart,mins(start)),e=Math.min(slots.timelineEnd,mins(end));
  return{
    left:(s-slots.timelineStart)*slots.pxPerMin,
    width:Math.max(1,(e-s)*slots.pxPerMin)
  };
}
function periodSlotForEvent(e,slots){
  const periods=slots.filter(s=>s.type==='period');
  return periods
    .map(s=>({s,overlap:Math.max(0,Math.min(mins(e.end),mins(s.end))-Math.max(mins(e.start),mins(s.start))),sameStart:e.start===s.start?1:0}))
    .sort((a,b)=>b.sameStart-a.sameStart||b.overlap-a.overlap||mins(b.s.start)-mins(a.s.start))[0]?.s||null;
}
function breakSlotForEvent(e,slots){
  const mid=(mins(e.start)+mins(e.end))/2;
  return slots.find(s=>s.type==='break'&&mid>=mins(s.start)&&mid<=mins(s.end))||null;
}
function overlapRange(){
  const a=(data.periods||[]).find(p=>p.label==='5a'),b=(data.periods||[]).find(p=>p.label==='5b');
  if(!a||!b)return null;
  const start=Math.max(mins(a.start),mins(b.start)),end=Math.min(mins(a.end),mins(b.end));
  return end>start?{start:tm(start),end:tm(end)}:null;
}
function activeSlot(m,slots){
  const ps=slots.filter(s=>s.type==='period'&&m>=mins(s.start)&&m<=mins(s.end)).sort((a,b)=>mins(b.start)-mins(a.start));
  if(ps.length){const s=ps[0];return{slot:s,frac:Math.max(0,Math.min(1,(m-mins(s.start))/(mins(s.end)-mins(s.start))))}}
  const b=slots.find(s=>s.type==='break'&&m>=mins(s.start)&&m<=mins(s.end));
  if(b)return{slot:b,frac:Math.max(0,Math.min(1,(m-mins(b.start))/(mins(b.end)-mins(b.start))))};
  return null;
}

function header(){
  const h=$('timeHeader'),slots=layout();
  h.innerHTML='';
  h.style.width=slots.totalWidth+'px';

  slots.forEach(s=>{
    const x=document.createElement('div');
    x.style.left=s.left+'px';x.style.width=s.width+'px';
    if(s.type==='period'){
      x.className='periodCell';
      x.style.zIndex=s.label==='5b'?'3':'2';
      x.innerHTML=`<b>${esc(s.label)}</b><small>${s.start}–${s.end}</small>`;
    }else{
      x.className='breakCell';x.title=`Přestávka ${s.start}–${s.end}`;
    }
    h.appendChild(x);
  });

  const ov=overlapRange();
  if(ov){
    const r=rectForTime(ov.start,ov.end,slots),x=document.createElement('div');
    x.className='overlapBand overlapHeader';x.style.left=r.left+'px';x.style.width=r.width+'px';
    x.title=`Překryv 5a a 5b: ${ov.start}–${ov.end}`;
    h.appendChild(x);
  }
}

function lesson(track,e,meta,slots){
  const s=periodSlotForEvent(e,slots);if(!s)return;
  const x=document.createElement('div'),r=rectForTime(e.start,e.end,slots);
  x.className='lesson'+(e.kind==='lunch'?' lunch':'')+(meta.changed?' changed':'')+(e.status==='cancelled'?' cancelled':'');
  x.style.left=r.left+'px';x.style.width=r.width+'px';
  x.style.background=data.colors?.[e.class]||data.colors?.default||'#ddd';
  x.dataset.start=e.start;x.dataset.end=e.end;
  const showTime=(e.start!==s.start||e.end!==s.end)?`<span class="etime">${esc(e.start)}–${esc(e.end)}</span>`:'';
  const tag=cycleLabel(e);
  x.innerHTML=`${tag?`<span class="cycleTag">${esc(tag)}</span>`:''}<span class="room">${esc(e.room)}</span>${e.test?`<span class="testmark">TEST</span>`:''}${showTime}<span class="subj">${esc(e.subject)}</span>${e.note?`<span class="note">${esc(e.note)}</span>`:''}<span class="cls">${esc(e.class)}</span>`;
  x.onclick=ev=>{ev.stopPropagation();opt.edit?.(e,{...meta,kind:e.kind||'lesson'})};track.appendChild(x);
}

function duty(track,e,meta,slots){
  const r=rectForTime(e.start,e.end,slots);
  const x=document.createElement('div');
  x.className='duty'+(meta.changed?' changed':'')+(e.status==='cancelled'?' cancelled':'');
  x.style.left=r.left+'px';x.style.width=r.width+'px';x.dataset.start=e.start;x.dataset.end=e.end;
  x.title=`Dohled ${e.start}–${e.end}${e.room?' • '+e.room:''}${e.note?' • '+e.note:''}`;
  x.innerHTML=`<span>${esc(e.room||e.note||'DOHLED')}</span>`;
  x.onclick=ev=>{ev.stopPropagation();opt.edit?.(e,{...meta,kind:'duty'})};track.appendChild(x);
}

function render(){
  if(!data)return;
  const slots=layout(),today=iso(new Date());
  $('weekLabel').textContent=`${fmt(week)} – ${fmt(add(week,4))}`;
  const sched=document.querySelector('.sched');
  if(sched)sched.style.minWidth=(dayWidth()+slots.totalWidth)+'px';
  const box=$('days');box.innerHTML='';

  for(let d=1;d<=5;d++){
    const date=add(week,d-1),k=iso(date),c=opt.baseOnly?{}:ch(k),row=document.createElement('div');
    row.className='row'+(c.absence?' absent':'')+(k===today?' today':'');
    const dl=document.createElement('div');dl.className='day';dl.innerHTML=`<b>${days[d]}</b><small>${fmt(date)}</small>`;
    if(opt.absence)dl.onclick=()=>opt.absence(k);row.appendChild(dl);

    const tr=document.createElement('div');tr.className='track';tr.style.width=slots.totalWidth+'px';

    // Skutečné přestávky v časové ose.
    slots.filter(s=>s.type==='break').forEach(s=>{
      const bg=document.createElement('div');bg.className='breakBand';
      bg.style.left=s.left+'px';bg.style.width=s.width+'px';tr.appendChild(bg);
    });

    // Svislé začátky hodin.
    slots.filter(s=>s.type==='period').forEach(s=>{
      const g=document.createElement('div');g.className='timeGuide';g.style.left=s.left+'px';tr.appendChild(g);
    });

    // Překryv 5a/5b (12:20–12:35) je vyšrafovaný.
    const ov=overlapRange();
    if(ov){
      const r=rectForTime(ov.start,ov.end,slots),band=document.createElement('div');
      band.className='overlapBand';band.style.left=r.left+'px';band.style.width=r.width+'px';tr.appendChild(band);
    }

    if(opt.add){
      slots.forEach(s=>{
        const z=document.createElement('button');z.type='button';
        z.className='slotHit '+(s.type==='break'?'breakHit':'periodHit');
        z.style.left=s.left+'px';z.style.width=s.width+'px';
        z.style.zIndex=s.type==='period'&&s.label==='5b'?'2':'1';
        z.title=s.type==='period'?`${s.label}. hodina ${s.start}–${s.end}`:`Přestávka ${s.start}–${s.end} – přidat dohled`;
        z.setAttribute('aria-label',z.title);
        z.onclick=ev=>{ev.stopPropagation();opt.add(k,s.start,s.end,{kind:s.type==='break'?'duty':'lesson',period:s.type==='period'?s.label:null})};
        tr.appendChild(z);
      });
    }

    data.schedule.filter(e=>e.day===d).forEach(base=>{
      const over=c.events?.[base.id],raw=over?{...base,...over}:base,e=opt.baseOnly?raw:eventForDisplay(raw,k);
      if((e.kind||'lesson')==='duty')duty(tr,e,{date:k,id:base.id,type:'base',changed:!!over},slots);else lesson(tr,e,{date:k,id:base.id,type:'base',changed:!!over},slots);
    });
    (data.duties||[]).filter(e=>e.day===d).forEach(base=>{
      const over=c.events?.[base.id],raw=over?{...base,...over,kind:'duty'}:base,e=opt.baseOnly?raw:eventForDisplay(raw,k);
      duty(tr,e,{date:k,id:base.id,type:'base',changed:!!over},slots);
    });
    (c.custom||[]).forEach(raw=>{
      const e=eventForDisplay(raw,k);
      if(e.kind==='duty')duty(tr,e,{date:k,id:e.id,type:'custom',changed:true},slots);else lesson(tr,e,{date:k,id:e.id,type:'custom',changed:true},slots);
    });

    if(c.absence){
      const ab=document.createElement('div');ab.className='absence';
      ab.textContent='NEPŘÍTOMEN'+(c.absence.note?' – '+c.absence.note:'');
      ab.onclick=()=>opt.absence?.(k);tr.appendChild(ab);
    }

    const ln=document.createElement('div');ln.className='line';ln.id='n-'+k;tr.appendChild(ln);
    row.appendChild(tr);box.appendChild(row);
  }
  nowline();
}

function nowline(){
  document.querySelectorAll('.line').forEach(x=>x.style.display='none');
  document.querySelectorAll('.lesson.now,.duty.now').forEach(x=>x.classList.remove('now'));
  if(!data)return;
  updateTabTitle();
  const n=new Date(),k=iso(n),ln=$('n-'+k);if(!ln)return;
  const m=n.getHours()*60+n.getMinutes(),slots=layout();
  if(m<slots.timelineStart||m>slots.timelineEnd)return;
  ln.style.display='block';
  ln.style.left=((m-slots.timelineStart)*slots.pxPerMin)+'px';
  ln.dataset.time=tm(m);
  const row=ln.closest('.row');
  if(row&&!row.classList.contains('absent'))row.querySelectorAll('.lesson,.duty').forEach(x=>{if(m>=mins(x.dataset.start)&&m<mins(x.dataset.end))x.classList.add('now')});
}

function scrollToNow(smooth=false){
  const n=new Date();
  if(monday(n).getTime()!==week.getTime())return;
  const m=n.getHours()*60+n.getMinutes(),slots=layout(),shell=document.querySelector('.shell');
  if(!shell||m<slots.timelineStart||m>slots.timelineEnd)return;
  const x=dayWidth()+(m-slots.timelineStart)*slots.pxPerMin;
  shell.scrollTo({left:Math.max(0,x-shell.clientWidth*.45),behavior:smooth?'smooth':'auto'});
}

function canvasRoundRect(ctx,x,y,w,h,r,fill,stroke){
  if(w<=0||h<=0)return;
  const rr=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath();
  if(fill){ctx.fillStyle=fill;ctx.fill()}
  if(stroke){ctx.strokeStyle=stroke;ctx.stroke()}
}
function canvasTextFit(ctx,text,x,y,maxW,size,weight='600',align='center',color='#18202a'){
  text=String(text??'');
  let s=size;
  ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;
  while(s>12){
    ctx.font=`${weight} ${s}px system-ui,-apple-system,Segoe UI,Arial`;
    if(ctx.measureText(text).width<=maxW)break;
    s-=1;
  }
  ctx.fillText(text,x,y,maxW);
}
function canvasHatch(ctx,x,y,w,h,color='rgba(160,75,75,.28)',gap=18,line=7){
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
  ctx.strokeStyle=color;ctx.lineWidth=line;
  for(let p=x-h;p<x+w+h;p+=gap){
    ctx.beginPath();ctx.moveTo(p,y+h);ctx.lineTo(p+h,y);ctx.stroke();
  }
  ctx.restore();
}
function exportA5Jpg(){
  if(!data)return;
  const W=2480,H=1748,canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d'),margin=70,titleH=105,dayW=130,headH=105,rowH=270;
  const fs={...DEFAULT_FONT_SIZES,...(data.fontSizes||{})},cfs=(k,m=2)=>Math.round((Number(fs[k])||DEFAULT_FONT_SIZES[k])*m);
  const trackX=margin+dayW,trackW=W-margin-trackX,t0=mins(data.timeline?.start||'07:05'),t1=mins(data.timeline?.end||'15:05'),ppm=trackW/(t1-t0);
  const y0=margin+titleH,daysCs=['','Po','Út','St','Čt','Pá'];
  const tx=t=>trackX+(mins(t)-t0)*ppm;
  const tw=(a,b)=>(mins(b)-mins(a))*ppm;

  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#18202a';ctx.textAlign='left';ctx.textBaseline='middle';ctx.font='700 46px system-ui,-apple-system,Segoe UI,Arial';
  ctx.fillText((data.teacher||'Jan Bernard')+' – rozvrh',margin,margin+30);
  ctx.textAlign='right';ctx.font='650 34px system-ui,-apple-system,Segoe UI,Arial';
  ctx.fillText(`${fmt(week)} – ${fmt(add(week,4))}`,W-margin,margin+30);

  // Header background and day corner.
  ctx.fillStyle='#fff';ctx.fillRect(margin,y0,dayW,headH);
  ctx.strokeStyle='#cfd5dc';ctx.lineWidth=2;ctx.strokeRect(margin,y0,dayW,headH);
  ctx.fillStyle='#6b7280';ctx.textAlign='left';ctx.textBaseline='bottom';ctx.font='500 24px system-ui,-apple-system,Segoe UI,Arial';
  ctx.fillText('čas',margin+18,y0+headH-16);

  const periods=data.periods||[];
  periods.forEach((p,i)=>{
    const x=tx(p.start),w=tw(p.start,p.end);
    ctx.fillStyle='rgba(255,255,255,.96)';ctx.fillRect(x,y0,w,headH);
    ctx.strokeStyle='#dfe3e8';ctx.lineWidth=2;ctx.strokeRect(x,y0,w,headH);
    canvasTextFit(ctx,p.label,x+w/2,y0+35,w-12,cfs('period',1.95),'700');
    canvasTextFit(ctx,p.start+'–'+p.end,x+w/2,y0+72,w-10,cfs('periodTime',2),'500','#4b5563');
    const n=periods[i+1];
    if(n&&mins(n.start)>mins(p.end)){
      const bx=tx(p.end),bw=tw(p.end,n.start);
      ctx.fillStyle='#f1f3f6';ctx.fillRect(bx,y0,bw,headH);
      ctx.strokeStyle='#e0e4e9';ctx.strokeRect(bx,y0,bw,headH);
    }
  });
  const ov=overlapRange();
  if(ov){
    const ox=tx(ov.start),ow=tw(ov.start,ov.end);
    canvasHatch(ctx,ox,y0,ow,headH,'rgba(90,100,115,.20)',16,5);
    ctx.strokeStyle='rgba(90,100,115,.35)';ctx.strokeRect(ox,y0,ow,headH);
  }

  for(let d=1;d<=5;d++){
    const date=add(week,d-1),k=iso(date),c=ch(k),y=y0+headH+(d-1)*rowH;
    ctx.fillStyle='#fff';ctx.fillRect(margin,y,dayW,rowH);
    ctx.strokeStyle='#dfe3e8';ctx.lineWidth=2;ctx.strokeRect(margin,y,dayW,rowH);
    ctx.fillStyle='#18202a';ctx.textAlign='left';ctx.textBaseline='middle';ctx.font=`700 ${cfs('day',2)}px system-ui,-apple-system,Segoe UI,Arial`;ctx.fillText(daysCs[d],margin+20,y+82);
    ctx.fillStyle='#6b7280';ctx.font=`500 ${cfs('date',1.9)}px system-ui,-apple-system,Segoe UI,Arial`;ctx.fillText(fmt(date),margin+20,y+122);

    ctx.fillStyle='#fff';ctx.fillRect(trackX,y,trackW,rowH);
    ctx.strokeStyle='#e3e6ea';ctx.strokeRect(trackX,y,trackW,rowH);

    periods.forEach((p,i)=>{
      const gx=tx(p.start);
      ctx.strokeStyle='#edf0f3';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(gx,y);ctx.lineTo(gx,y+rowH);ctx.stroke();
      const n=periods[i+1];
      if(n&&mins(n.start)>mins(p.end)){
        const bx=tx(p.end),bw=tw(p.end,n.start);
        ctx.fillStyle='#f1f3f6';ctx.fillRect(bx,y,bw,rowH);
      }
    });
    if(ov)canvasHatch(ctx,tx(ov.start),y,tw(ov.start,ov.end),rowH,'rgba(90,100,115,.13)',16,4);

    const drawLesson=(e,changed)=>{
      const x=tx(e.start),w=Math.max(4,tw(e.start,e.end));
      if(e.kind==='lunch'){
        const yy=y+12,h=rowH-24;
        canvasRoundRect(ctx,x+3,yy,Math.max(2,w-6),h,8,'#eaf6df','#9fc680');
        canvasTextFit(ctx,e.subject||'OBĚD',x+w/2,yy+h/2-10,w-16,cfs('lunch',1.95),'700','center','#355b27');
        canvasTextFit(ctx,e.start+'–'+e.end,x+10,yy+28,w-20,cfs('eventTime',1.9),'500','left','#55704b');
        return;
      }
      const yy=y+12,h=rowH-24;
      const bg=e.status==='cancelled'?'#fff0f0':(data.colors?.[e.class]||data.colors?.default||'#ddd');
      canvasRoundRect(ctx,x+3,yy,Math.max(2,w-6),h,8,bg,'#aeb4bc');
      if(e.status==='cancelled')canvasHatch(ctx,x+3,yy,Math.max(2,w-6),h,'rgba(190,90,90,.30)',22,8);

      let left=x+10;
      if(changed){
        canvasRoundRect(ctx,left,yy+8,92,30,5,'#ffefad','#e4c965');
        canvasTextFit(ctx,'ZMĚNA',left+46,yy+23,84,cfs('change',1.9),'800');left+=100;
      }
      const tag=cycleLabel(e);
      if(tag){
        canvasTextFit(ctx,tag,left,yy+22,70,cfs('cycle',2),'700','left','#364152');
      }
      if(e.test){
        canvasRoundRect(ctx,x+w/2-43,yy+7,86,31,6,'#fff0f0','#e2a0a0');
        canvasTextFit(ctx,'TEST',x+w/2,yy+23,76,cfs('test',2),'800','center','#a61c1c');
      }
      if(e.room)canvasTextFit(ctx,e.room,x+w-10,yy+22,80,cfs('room',1.9),'600','right','#18202a');
      canvasTextFit(ctx,e.subject||'',x+w/2,yy+h/2-10,w-22,cfs('subject',1.95),'650');
      if(e.note)canvasTextFit(ctx,e.note,x+w/2,yy+h/2+34,w-24,cfs('note',2),'500','center','#555');
      if(e.class)canvasTextFit(ctx,e.class,x+10,yy+h-18,w-20,cfs('class',1.9),'500','left','#18202a');
      if(e.start!==(periodSlotForEvent(e,layout())?.start||e.start)||e.end!==(periodSlotForEvent(e,layout())?.end||e.end)){
        canvasTextFit(ctx,e.start+'–'+e.end,x+10,yy+52,w-20,cfs('eventTime',1.9),'500','left','#5f6873');
      }
    };
    const drawDuty=(e,changed)=>{
      const x=tx(e.start),w=Math.max(10,tw(e.start,e.end)),yy=y+54,h=rowH-108;
      canvasRoundRect(ctx,x+2,yy,Math.max(8,w-4),h,5,'#bfc2c6','#9299a2');
      ctx.save();ctx.translate(x+w/2,yy+h/2);ctx.rotate(-Math.PI/2);
      canvasTextFit(ctx,e.room||e.note||'DOHLED',0,0,h-12,cfs('duty',1.8),'700');
      ctx.restore();
    };

    data.schedule.filter(e=>e.day===d).forEach(base=>{
      const over=c.events?.[base.id],raw=over?{...base,...over}:base,e=eventForDisplay(raw,k);
      if((e.kind||'lesson')==='duty')drawDuty(e,!!over);else drawLesson(e,!!over);
    });
    (data.duties||[]).filter(e=>e.day===d).forEach(base=>{
      const over=c.events?.[base.id],raw=over?{...base,...over,kind:'duty'}:base,e=eventForDisplay(raw,k);
      drawDuty(e,!!over);
    });
    (c.custom||[]).forEach(raw=>{
      const e=eventForDisplay(raw,k);
      if(e.kind==='duty')drawDuty(e,true);else drawLesson(e,true);
    });

    if(c.absence){
      ctx.fillStyle='rgba(255,237,237,.94)';ctx.fillRect(trackX+4,y+rowH/2-36,trackW-8,72);
      ctx.strokeStyle='#c62828';ctx.lineWidth=4;ctx.strokeRect(trackX+4,y+rowH/2-36,trackW-8,72);
      canvasTextFit(ctx,'NEPŘÍTOMEN'+(c.absence.note?' – '+c.absence.note:''),trackX+trackW/2,y+rowH/2,trackW-30,cfs('absence',1.9),'800','center','#a61c1c');
    }
  }

  // Jemný rámeček celé A5 a poznámka k formátu.
  ctx.strokeStyle='#cfd5dc';ctx.lineWidth=2;ctx.strokeRect(margin,y0,W-2*margin,headH+5*rowH);
  ctx.fillStyle='#7b8490';ctx.textAlign='right';ctx.textBaseline='middle';ctx.font='500 18px system-ui,-apple-system,Segoe UI,Arial';
  ctx.fillText('A5 na šířku • 2480 × 1748 px',W-margin,H-34);

  const filename=`rozvrh_${iso(week)}_${iso(add(week,4))}_A5.jpg`;
  const saveBlob=blob=>{
    if(!blob)return;
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  };
  if(canvas.toBlob)canvas.toBlob(saveBlob,'image/jpeg',.95);
  else{
    const a=document.createElement('a');a.href=canvas.toDataURL('image/jpeg',.95);a.download=filename;a.click();
  }
}

function nav(){
  $('prevWeek').onclick=()=>{week=add(week,-7);render()};
  $('nextWeek').onclick=()=>{week=add(week,7);render()};
  $('todayBtn').onclick=()=>{week=monday(new Date());render();requestAnimationFrame(()=>scrollToNow(true))};
  const ex=$('exportJpg');if(ex)ex.onclick=exportA5Jpg;
}
function bindResize(){
  if(resizeBound)return;resizeBound=true;let last=narrow(),timer;
  window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(()=>{const cur=narrow();if(cur!==last){last=cur;header();render();requestAnimationFrame(()=>scrollToNow(false))}},120)},{passive:true});
}

async function refreshFromServer(){
  if(opt.admin)return;
  try{
    const r=await fetch('data/rozvrh.json?v='+Date.now(),{cache:'no-store'});
    if(!r.ok)return;
    const fresh=normalize(await r.json()),fp=JSON.stringify(fresh);
    if(fp===dataFingerprint)return;
    data=fresh;dataFingerprint=fp;applyFontSizes();
    header();render();monitorEventStart();
  }catch(_){}
}
function bindAutoRefresh(){
  if(opt.admin)return;
  setInterval(refreshFromServer,30000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshFromServer()});
  window.addEventListener('focus',refreshFromServer);
}

async function load(options={}){
  opt=options;
  const r=await fetch('data/rozvrh.json?v='+Date.now(),{cache:'no-store'});
  if(!r.ok)throw Error('HTTP '+r.status);
  data=normalize(await r.json());dataFingerprint=JSON.stringify(data);applyFontSizes();
  $('pageTitle').textContent=data.teacher+' – '+(options.admin?'admin rozvrhu':'rozvrh');
  header();nav();bindResize();bindAlerts();bindAutoRefresh();render();monitorEventStart();setInterval(nowline,15000);requestAnimationFrame(()=>scrollToNow(false));return data;
}

return{
  load,render,get:()=>data,set:x=>{data=normalize(x);applyFontSizes();header()},
  change:k=>{data.changes??={};return data.changes[k]??={}},
  cleanup:k=>{let c=data.changes?.[k];if(c&&!c.absence&&!Object.keys(c.events||{}).length&&!(c.custom||[]).length)delete data.changes[k]},
  week:()=>week,setWeek:x=>{week=x;render()},iso,add,monday,mins,tm,
  periods:()=>data?.periods||[],layout,scrollToNow,updateTabTitle,monitorEventStart,refreshFromServer,exportA5Jpg,applyFontSizes,fontDefaults:()=>({...DEFAULT_FONT_SIZES}),setBaseOnly:v=>{opt.baseOnly=!!v;render()}
};
})();
