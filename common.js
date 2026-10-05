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
let week=monday(new Date());

function q(){let s=mins(data.timeline.start),e=mins(data.timeline.end);return{s,e,n:e-s}}
function pos(t){let a=q();return(mins(t)-a.s)/a.n*100}
function wid(s,e){let a=q();return(mins(e)-mins(s))/a.n*100}
function ch(k){return data.changes?.[k]||{}}
function fmt(d){return d.toLocaleDateString('cs-CZ',{day:'numeric',month:'numeric'})}

function header(){
  let h=$('timeHeader'),a=q();h.innerHTML='';
  for(let m=a.s;m<=a.e;m+=30){let x=document.createElement('i');x.className='grid';x.style.left=(m-a.s)/a.n*100+'%';h.appendChild(x)}
  data.periods.forEach(p=>{let m=(mins(p.start)+mins(p.end))/2,x=document.createElement('div');x.className='period';x.style.left=(m-a.s)/a.n*100+'%';x.innerHTML=`<b>${esc(p.label)}</b>${p.start}–${p.end}`;h.appendChild(x)})
}

function lesson(track,e,meta){
  let x=document.createElement('div');
  x.className='lesson'+(meta.changed?' changed':'')+(e.status==='cancelled'?' cancelled':'');
  x.style.left=pos(e.start)+'%';x.style.width=Math.max(wid(e.start,e.end),1.2)+'%';
  x.style.background=data.colors?.[e.class]||data.colors?.default||'#ddd';
  x.dataset.start=e.start;x.dataset.end=e.end;
  x.innerHTML=`<span class="room">${esc(e.room)}</span><span class="subj">${esc(e.subject)}</span>${e.note?`<span class="note">${esc(e.note)}</span>`:''}<span class="cls">${esc(e.class)}</span>`;
  x.onclick=ev=>{ev.stopPropagation();opt.edit?.(e,meta)};
  track.appendChild(x)
}

function render(){
  if(!data)return;
  $('weekLabel').textContent=`${fmt(week)} – ${fmt(add(week,4))}`;
  let box=$('days');box.innerHTML='';
  for(let d=1;d<=5;d++){
    let date=add(week,d-1),k=iso(date),c=ch(k),row=document.createElement('div');
    row.className='row'+(c.absence?' absent':'');
    let dl=document.createElement('div');dl.className='day';dl.innerHTML=`<b>${days[d]}</b><small>${fmt(date)}</small>`;
    if(opt.absence)dl.onclick=()=>opt.absence(k);row.appendChild(dl);
    let tr=document.createElement('div');tr.className='track';let a=q();
    for(let m=a.s;m<=a.e;m+=30){let g=document.createElement('i');g.className='grid';g.style.left=(m-a.s)/a.n*100+'%';tr.appendChild(g)}
    if(opt.add){let z=document.createElement('div');z.className='clicker';z.onclick=e=>{let r=tr.getBoundingClientRect(),m=Math.round((a.s+(e.clientX-r.left)/r.width*a.n)/5)*5;m=Math.max(a.s,Math.min(a.e-20,m));opt.add(k,tm(m),tm(Math.min(m+45,a.e)))};tr.appendChild(z)}
    data.schedule.filter(e=>e.day===d).forEach(base=>{let over=c.events?.[base.id],e=over?{...base,...over}:base;lesson(tr,e,{date:k,id:base.id,type:'base',changed:!!over})});
    (c.custom||[]).forEach(e=>lesson(tr,e,{date:k,id:e.id,type:'custom',changed:true}));
    if(c.absence){let ab=document.createElement('div');ab.className='absence';ab.textContent='NEPŘÍTOMEN'+(c.absence.note?' – '+c.absence.note:'');ab.onclick=()=>opt.absence?.(k);tr.appendChild(ab)}
    let ln=document.createElement('div');ln.className='line';ln.id='n-'+k;tr.appendChild(ln);row.appendChild(tr);box.appendChild(row)
  }
  nowline()
}

function nowline(){
  document.querySelectorAll('.line').forEach(x=>x.style.display='none');
  document.querySelectorAll('.lesson.now').forEach(x=>x.classList.remove('now'));
  if(!data)return;
  let n=new Date(),k=iso(n),ln=$('n-'+k);if(!ln)return;
  let a=q(),m=n.getHours()*60+n.getMinutes();if(m<a.s||m>a.e)return;
  ln.style.display='block';ln.style.left=(m-a.s)/a.n*100+'%';ln.dataset.time=tm(m);
  let row=ln.closest('.row');if(!row.classList.contains('absent'))row.querySelectorAll('.lesson').forEach(x=>{if(m>=mins(x.dataset.start)&&m<mins(x.dataset.end))x.classList.add('now')})
}

function nav(){
  $('prevWeek').onclick=()=>{week=add(week,-7);render()};
  $('nextWeek').onclick=()=>{week=add(week,7);render()};
  $('todayBtn').onclick=()=>{week=monday(new Date());render()}
}

async function load(options={}){
  opt=options;
  let r=await fetch('data/rozvrh.json?v='+Date.now(),{cache:'no-store'});
  if(!r.ok)throw Error('HTTP '+r.status);
  data=await r.json();
  $('pageTitle').textContent=data.teacher+' – '+(options.admin?'admin rozvrhu':'rozvrh');
  header();nav();render();setInterval(nowline,15000);return data
}

return{load,render,get:()=>data,set:x=>data=x,change:k=>{data.changes??={};return data.changes[k]??={}},cleanup:k=>{let c=data.changes?.[k];if(c&&!c.absence&&!Object.keys(c.events||{}).length&&!(c.custom||[]).length)delete data.changes[k]},week:()=>week,setWeek:x=>{week=x;render()},iso,add,monday,mins,tm};
})();
