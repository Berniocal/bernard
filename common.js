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
let week=monday(new Date()),resizeBound=false;

const DEFAULT_DUTIES=[
  {id:'du-mo-0750',day:1,start:'07:50',end:'08:00',subject:'DOHLED',class:'',room:'2ČŽ',kind:'duty'},
  {id:'du-mo-1140',day:1,start:'11:40',end:'11:50',subject:'DOHLED',class:'',room:'2ČŽ',kind:'duty'},
  {id:'du-tu-1305',day:2,start:'13:05',end:'13:15',subject:'DOHLED',class:'',room:'1ZŽ',kind:'duty'},
  {id:'du-th-0845',day:4,start:'08:45',end:'08:55',subject:'DOHLED',class:'',room:'1ZŽ',kind:'duty'}
];

function normalize(x){
  x??={};
  x.changes??={};
  if(!Array.isArray(x.duties)) x.duties=DEFAULT_DUTIES.map(v=>({...v}));
  return x;
}
function ch(k){return data.changes?.[k]||{}}
function fmt(d){return d.toLocaleDateString('cs-CZ',{day:'numeric',month:'numeric'})}
function dayWidth(){
  const v=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--day-w'));
  return Number.isFinite(v)?v:(narrow()?72:95);
}

function layout(){
  const p=data.periods||[],slots=[];
  const mobile=narrow(),periodWidth=mobile?112:150,breakMin=mobile?36:22,breakFactor=mobile?3.4:2.5;
  p.forEach((x,i)=>{
    slots.push({type:'period',key:'p'+i,index:i,label:x.label,start:x.start,end:x.end,width:periodWidth});
    const next=p[i+1];
    if(next){
      const gap=mins(next.start)-mins(x.end);
      if(gap>0) slots.push({type:'break',key:'b'+i,index:i,start:x.end,end:next.start,width:Math.max(breakMin,gap*breakFactor)});
    }else if(data.timeline?.end && mins(data.timeline.end)>mins(x.end)){
      const gap=mins(data.timeline.end)-mins(x.end);
      slots.push({type:'break',key:'bend',index:i,start:x.end,end:data.timeline.end,width:Math.max(breakMin,gap*breakFactor)});
    }
  });
  let col=1;slots.forEach(s=>s.col=col++);return slots;
}
function template(slots){return slots.map(s=>s.width+'px').join(' ')}
function periodSlotForEvent(e,slots){
  const mid=(mins(e.start)+mins(e.end))/2;
  const candidates=slots.filter(s=>s.type==='period'&&mid>=mins(s.start)&&mid<=mins(s.end));
  if(candidates.length)return candidates.sort((a,b)=>mins(b.start)-mins(a.start))[0];
  return slots.filter(s=>s.type==='period').sort((a,b)=>Math.abs(mid-(mins(a.start)+mins(a.end))/2)-Math.abs(mid-(mins(b.start)+mins(b.end))/2))[0];
}
function breakSlotForEvent(e,slots){
  const mid=(mins(e.start)+mins(e.end))/2;
  return slots.find(s=>s.type==='break'&&mid>=mins(s.start)&&mid<=mins(s.end))||null;
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
  h.innerHTML='';h.style.gridTemplateColumns=template(slots);
  slots.forEach(s=>{
    const x=document.createElement('div');x.style.gridColumn=s.col;
    if(s.type==='period'){
      x.className='periodCell';x.innerHTML=`<b>${esc(s.label)}</b><small>${s.start}–${s.end}</small>`;
    }else{
      x.className='breakCell';x.title=`Přestávka ${s.start}–${s.end}`;
    }
    h.appendChild(x);
  });
}

function lesson(track,e,meta,slots){
  const s=periodSlotForEvent(e,slots);if(!s)return;
  const x=document.createElement('div');
  x.className='lesson'+(meta.changed?' changed':'')+(e.status==='cancelled'?' cancelled':'');
  x.style.gridColumn=s.col;x.style.background=data.colors?.[e.class]||data.colors?.default||'#ddd';
  x.dataset.start=e.start;x.dataset.end=e.end;
  const showTime=(e.start!==s.start||e.end!==s.end)?`<span class="etime">${esc(e.start)}–${esc(e.end)}</span>`:'';
  x.innerHTML=`<span class="room">${esc(e.room)}</span>${showTime}<span class="subj">${esc(e.subject)}</span>${e.note?`<span class="note">${esc(e.note)}</span>`:''}<span class="cls">${esc(e.class)}</span>`;
  x.onclick=ev=>{ev.stopPropagation();opt.edit?.(e,{...meta,kind:e.kind||'lesson'})};track.appendChild(x);
}

function duty(track,e,meta,slots){
  const s=breakSlotForEvent(e,slots);if(!s)return;
  const x=document.createElement('div');
  x.className='duty'+(meta.changed?' changed':'')+(e.status==='cancelled'?' cancelled':'');
  x.style.gridColumn=s.col;x.dataset.start=e.start;x.dataset.end=e.end;
  x.title=`Dohled ${e.start}–${e.end}${e.room?' • '+e.room:''}${e.note?' • '+e.note:''}`;
  x.innerHTML=`<span>${esc(e.room||e.note||'DOHLED')}</span>`;
  x.onclick=ev=>{ev.stopPropagation();opt.edit?.(e,{...meta,kind:'duty'})};track.appendChild(x);
}

function render(){
  if(!data)return;
  const slots=layout(),tpl=template(slots),today=iso(new Date());
  $('weekLabel').textContent=`${fmt(week)} – ${fmt(add(week,4))}`;
  const sched=document.querySelector('.sched');if(sched)sched.style.minWidth=(dayWidth()+slots.reduce((a,s)=>a+s.width,0))+'px';
  const box=$('days');box.innerHTML='';
  for(let d=1;d<=5;d++){
    const date=add(week,d-1),k=iso(date),c=ch(k),row=document.createElement('div');
    row.className='row'+(c.absence?' absent':'')+(k===today?' today':'');
    const dl=document.createElement('div');dl.className='day';dl.innerHTML=`<b>${days[d]}</b><small>${fmt(date)}</small>`;
    if(opt.absence)dl.onclick=()=>opt.absence(k);row.appendChild(dl);
    const tr=document.createElement('div');tr.className='track';tr.style.gridTemplateColumns=tpl;

    if(opt.add){
      slots.forEach(s=>{
        const z=document.createElement('button');z.type='button';z.className='slotHit '+(s.type==='break'?'breakHit':'periodHit');z.style.gridColumn=s.col;
        z.title=s.type==='period'?`${s.label}. hodina ${s.start}–${s.end}`:`Přestávka ${s.start}–${s.end} – přidat dohled`;
        z.setAttribute('aria-label',z.title);
        z.onclick=ev=>{ev.stopPropagation();opt.add(k,s.start,s.end,{kind:s.type==='break'?'duty':'lesson',period:s.type==='period'?s.label:null})};
        tr.appendChild(z);
      });
    }

    data.schedule.filter(e=>e.day===d).forEach(base=>{
      const over=c.events?.[base.id],e=over?{...base,...over}:base;
      if((e.kind||'lesson')==='duty')duty(tr,e,{date:k,id:base.id,type:'base',changed:!!over},slots);else lesson(tr,e,{date:k,id:base.id,type:'base',changed:!!over},slots)
    });
    (data.duties||[]).filter(e=>e.day===d).forEach(base=>{
      const over=c.events?.[base.id],e=over?{...base,...over,kind:'duty'}:base;
      duty(tr,e,{date:k,id:base.id,type:'base',changed:!!over},slots)
    });
    (c.custom||[]).forEach(e=>{
      if(e.kind==='duty')duty(tr,e,{date:k,id:e.id,type:'custom',changed:true},slots);else lesson(tr,e,{date:k,id:e.id,type:'custom',changed:true},slots)
    });
    if(c.absence){const ab=document.createElement('div');ab.className='absence';ab.textContent='NEPŘÍTOMEN'+(c.absence.note?' – '+c.absence.note:'');ab.onclick=()=>opt.absence?.(k);tr.appendChild(ab)}
    const ln=document.createElement('div');ln.className='line';ln.id='n-'+k;tr.appendChild(ln);
    row.appendChild(tr);box.appendChild(row)
  }
  nowline();
}

function nowline(){
  document.querySelectorAll('.line').forEach(x=>{x.style.display='none';x.style.removeProperty('grid-column')});
  document.querySelectorAll('.lesson.now,.duty.now').forEach(x=>x.classList.remove('now'));
  if(!data)return;
  const n=new Date(),k=iso(n),ln=$('n-'+k);if(!ln)return;
  const m=n.getHours()*60+n.getMinutes(),a=activeSlot(m,layout());if(!a)return;
  ln.style.display='block';ln.style.gridColumn=String(a.slot.col);ln.style.setProperty('--frac',String(a.frac));ln.dataset.time=tm(m);
  const row=ln.closest('.row');
  if(row&&!row.classList.contains('absent'))row.querySelectorAll('.lesson,.duty').forEach(x=>{if(m>=mins(x.dataset.start)&&m<mins(x.dataset.end))x.classList.add('now')})
}

function scrollToNow(smooth=false){
  const n=new Date();
  if(monday(n).getTime()!==week.getTime())return;
  const m=n.getHours()*60+n.getMinutes(),slots=layout(),a=activeSlot(m,slots),shell=document.querySelector('.shell');
  if(!a||!shell)return;
  const i=slots.indexOf(a.slot),before=slots.slice(0,i).reduce((sum,s)=>sum+s.width,0),x=dayWidth()+before+a.frac*a.slot.width;
  shell.scrollTo({left:Math.max(0,x-shell.clientWidth*.45),behavior:smooth?'smooth':'auto'});
}

function nav(){
  $('prevWeek').onclick=()=>{week=add(week,-7);render()};
  $('nextWeek').onclick=()=>{week=add(week,7);render()};
  $('todayBtn').onclick=()=>{week=monday(new Date());render();requestAnimationFrame(()=>scrollToNow(true))};
}
function bindResize(){
  if(resizeBound)return;resizeBound=true;let last=narrow(),timer;
  window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(()=>{const cur=narrow();if(cur!==last){last=cur;header();render();requestAnimationFrame(()=>scrollToNow(false))}},120)},{passive:true});
}

async function load(options={}){
  opt=options;
  const r=await fetch('data/rozvrh.json?v='+Date.now(),{cache:'no-store'});
  if(!r.ok)throw Error('HTTP '+r.status);
  data=normalize(await r.json());
  $('pageTitle').textContent=data.teacher+' – '+(options.admin?'admin rozvrhu':'rozvrh');
  header();nav();bindResize();render();setInterval(nowline,15000);requestAnimationFrame(()=>scrollToNow(false));return data;
}

return{
  load,render,get:()=>data,set:x=>{data=normalize(x);header()},
  change:k=>{data.changes??={};return data.changes[k]??={}},
  cleanup:k=>{let c=data.changes?.[k];if(c&&!c.absence&&!Object.keys(c.events||{}).length&&!(c.custom||[]).length)delete data.changes[k]},
  week:()=>week,setWeek:x=>{week=x;render()},iso,add,monday,mins,tm,
  periods:()=>data?.periods||[],layout,scrollToNow
};
})();
