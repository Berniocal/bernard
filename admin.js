(()=>{const O='Berniocal',P='bernard',F='data/rozvrh.json',API=`https://api.github.com/repos/${O}/${P}/contents/${F}`,$=id=>document.getElementById(id);let sha=null,edit=null,dirty=false,permanentMode=false;
const FONT_FIELDS={fsSubject:'subject',fsClass:'class',fsRoom:'room',fsNote:'note',fsCycle:'cycle',fsTest:'test',fsEventTime:'eventTime',fsChange:'change',fsPeriod:'period',fsPeriodTime:'periodTime',fsDay:'day',fsDate:'date',fsDuty:'duty',fsLunch:'lunch',fsAbsence:'absence'};
let fontBound=false;
function syncFonts(){const f=R.get()?.fontSizes||R.fontDefaults();for(const [id,key] of Object.entries(FONT_FIELDS)){const el=$(id);if(el)el.value=f[key]??R.fontDefaults()[key]}}
function bindFonts(){if(fontBound)return;fontBound=true;for(const [id,key] of Object.entries(FONT_FIELDS)){const el=$(id);if(!el)continue;el.addEventListener('input',()=>{const v=Math.max(6,Math.min(40,Number(el.value)||R.fontDefaults()[key]));R.get().fontSizes??={};R.get().fontSizes[key]=v;R.applyFontSizes();mark(true)})}const reset=$('fontReset');if(reset)reset.onclick=()=>{R.get().fontSizes=R.fontDefaults();R.applyFontSizes();syncFonts();mark(true)};syncFonts()}
const tok=()=>localStorage.getItem('bernard_token')||'',heads=()=>({'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(tok()?{Authorization:'Bearer '+tok()}:{})}),b64d=s=>new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g,'')),c=>c.charCodeAt(0))),b64e=s=>{let a=new TextEncoder().encode(s),z='';for(let i=0;i<a.length;i+=8192)z+=String.fromCharCode(...a.subarray(i,i+8192));return btoa(z)},note=(t,c='')=>{let n=$('notice');n.textContent=t;n.className='notice show '+c},mark=v=>{dirty=v;$('saveGitHub').disabled=!v;$('dirty').textContent=v?'Neuložené změny':'Uloženo'};
const dayFromDate=date=>new Date(date+'T12:00:00').getDay();
const baseArray=kind=>(kind==='duty'?R.get().duties:R.get().schedule);
function baseEvent(id,kind){return (baseArray(kind)||[]).find(x=>x.id===id)||null}
function setMode(permanent){
  permanentMode=!!permanent;
  $('weeklyMode').classList.toggle('primary',!permanentMode);
  $('baseMode').classList.toggle('primary',permanentMode);
  $('baseMode').classList.toggle('permanentActive',permanentMode);
  $('modeHelp').innerHTML=permanentMode
    ?'<b>Stálý rozvrh:</b> každá změna se propíše do všech týdnů. Kliknutím na hodinu ji upravíš nebo odstraníš; kliknutím do prázdného místa přidáš novou stálou hodinu či dohled.'
    :'<b>Týdenní změny:</b> úpravy platí jen pro konkrétní datum – suplování, odpadlá hodina, test nebo nepřítomnost.';
  $('addSub').textContent=permanentMode?'+ Stálá hodina':'+ Suplování';
  $('addAbs').disabled=permanentMode;
  $('addAbs').title=permanentMode?'Nepřítomnost je pouze týdenní změna':'';
  document.body.classList.toggle('permanent-mode',permanentMode);
  R.setBaseOnly(permanentMode);
}
async function connect(){let v=$('tokenInput').value.trim();if(v)localStorage.setItem('bernard_token',v);if(!tok()){note('Vlož GitHub token.','err');return}try{let r=await fetch(API,{headers:heads(),cache:'no-store'});if(!r.ok)throw Error((await r.json()).message||r.status);let j=await r.json();sha=j.sha;R.set(JSON.parse(b64d(j.content)));R.render();syncFonts();mark(false);$('tokenInput').value=tok();$('tokenState').textContent='GitHub připojen – token je uložen v tomto prohlížeči.';note('Data načtena přímo z GitHubu.','ok');R.setBaseOnly(permanentMode)}catch(e){note('GitHub: '+e.message,'err')}}
async function save(){if(!tok()){note('Nejdřív připoj token.','err');return}try{note('Ukládám…');if(!sha){let r=await fetch(API,{headers:heads()});let j=await r.json();sha=j.sha}let text=JSON.stringify(R.get(),null,2)+'\n',body={message:(permanentMode?'Rozvrh: změna stálého rozvrhu ':'Rozvrh: změny ')+new Date().toLocaleDateString('cs-CZ'),content:b64e(text),sha,branch:'main'},r=await fetch(API,{method:'PUT',headers:{...heads(),'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error((await r.json()).message||r.status);sha=(await r.json()).content.sha;mark(false);note(permanentMode?'Stálý rozvrh uložen na GitHub.':'Uloženo na GitHub.','ok')}catch(e){note('Uložení selhalo: '+e.message,'err');$('saveGitHub').disabled=false}}
function fill(e,m){
  let source=e;
  if(permanentMode){
    if(m.type==='custom'&&m.id){note('Tohle je jednorázová změna. Pro její úpravu přepni na „Týdenní změny“.','err');return}
    if(m.type==='base'){const b=baseEvent(m.id,m.kind||e.kind||'lesson');if(b)source=b}
  }
  edit={...m,kind:m.kind||source.kind||'lesson',scope:permanentMode?'permanent':'weekly'};
  const duty=edit.kind==='duty',lunch=edit.kind==='lunch';
  $('dlgTitle').textContent=permanentMode
    ?(m.id?(duty?'Upravit stálý dohled':lunch?'Upravit stálý oběd':'Upravit stálou hodinu'):(duty?'Přidat stálý dohled':'Přidat stálou hodinu'))
    :(duty?(m.id?'Upravit dohled':'Přidat dohled'):(m.type==='custom'?(m.id?'Upravit suplování':'Přidat hodinu'):'Upravit hodinu'));
  $('fDate').value=m.date;
  $('dateField').classList.toggle('hidden',permanentMode);
  $('dayField').classList.toggle('hidden',!permanentMode);
  $('fDay').value=String(source.day||m.day||dayFromDate(m.date));
  $('fSubject').value=source.subject||(duty?'DOHLED':'');
  $('fClass').value=source.class||'';$('fRoom').value=source.room||'';$('fStart').value=source.start;$('fEnd').value=source.end;$('fNote').value=source.note||'';
  $('fStatus').value=source.status||'normal';$('fStatus').disabled=permanentMode;
  $('fTest').checked=!!source.test;$('fTest').disabled=duty||lunch;
  $('cycleField').classList.toggle('hidden',!permanentMode||duty||lunch);
  $('fCycle').value=source.cycleTag||'';
  const hideDelete=permanentMode?!m.id:(m.type==='base'&&!m.changed||m.type==='custom'&&!m.id);
  $('del').classList.toggle('hidden',hideDelete);
  $('del').textContent=permanentMode?'Odstranit ze stálého rozvrhu':(m.type==='base'?'Vrátit původní':'Smazat');
  $('dlg').showModal()
}
function add(date,start,end,meta={}){
  const duty=meta.kind==='duty';
  fill({subject:duty?'DOHLED':'FYZ',class:'',room:'',start,end,note:permanentMode?'':(duty?'':'Suplování'),status:'normal',kind:duty?'duty':'lesson',day:dayFromDate(date)},{type:permanentMode?'permanent-new':'custom',date,id:null,changed:true,kind:duty?'duty':'lesson',period:meta.period||null,day:dayFromDate(date)})
}
function absence(date){if(permanentMode){note('Nepřítomnost patří mezi týdenní změny. Přepni na „Týdenní změny“.','err');return}let c=R.change(date);$('aDate').value=date;$('aNote').value=c.absence?.note||'';$('adel').classList.toggle('hidden',!c.absence);$('adlg').showModal()}
$('saveLesson').onclick=()=>{
  let date=$('fDate').value,start=$('fStart').value,end=$('fEnd').value;
  if(!start||!end||R.mins(end)<=R.mins(start)||(!permanentMode&&!date)){alert('Zkontroluj datum a čas.');return}
  let e={subject:$('fSubject').value.trim(),class:$('fClass').value.trim(),room:$('fRoom').value.trim(),start,end,note:$('fNote').value.trim(),status:permanentMode?'normal':$('fStatus').value,kind:edit.kind||'lesson',test:(edit.kind||'lesson')!=='duty'&&(edit.kind||'lesson')!=='lunch'&&$('fTest').checked};
  if(permanentMode){
    e.day=Number($('fDay').value);
    if((edit.kind||'lesson')!=='duty'&&(edit.kind||'lesson')!=='lunch'&&$('fCycle').value)e.cycleTag=$('fCycle').value;
    const arr=baseArray(edit.kind||'lesson');if(!arr)return;
    if(edit.id){const i=arr.findIndex(x=>x.id===edit.id);if(i>=0)e.id=edit.id,arr[i]=e}
    else{e.id='p'+Date.now();arr.push(e)}
  }else if(edit.type==='base'){
    let c=R.change(edit.date);c.events??={};c.events[edit.id]=e
  }else{
    let old=R.change(edit.date);old.custom??=[];
    if(edit.id){let i=old.custom.findIndex(x=>x.id===edit.id);if(edit.date===date&&i>=0)old.custom[i]={...e,id:edit.id};else{if(i>=0)old.custom.splice(i,1);R.cleanup(edit.date);let c=R.change(date);c.custom??=[];c.custom.push({...e,id:edit.id})}}
    else{let c=R.change(date);c.custom??=[];c.custom.push({...e,id:'c'+Date.now()})}
  }
  mark(true);$('dlg').close();R.render()
};
$('del').onclick=()=>{
  if(permanentMode){
    const arr=baseArray(edit.kind||'lesson'),i=(arr||[]).findIndex(x=>x.id===edit.id);
    if(i>=0)arr.splice(i,1);
    for(const c of Object.values(R.get().changes||{})){if(c.events)delete c.events[edit.id]}
  }else{
    let c=R.change(edit.date);if(edit.type==='base'){if(c.events)delete c.events[edit.id]}else c.custom=(c.custom||[]).filter(x=>x.id!==edit.id);R.cleanup(edit.date)
  }
  mark(true);$('dlg').close();R.render()
};
$('asave').onclick=()=>{R.change($('aDate').value).absence={note:$('aNote').value.trim()};mark(true);$('adlg').close();R.render()};
$('adel').onclick=()=>{let k=$('aDate').value,c=R.change(k);delete c.absence;R.cleanup(k);mark(true);$('adlg').close();R.render()};
$('connect').onclick=connect;
$('disconnect').onclick=()=>{localStorage.removeItem('bernard_token');$('tokenInput').value='';sha=null;$('tokenState').textContent='Token odpojen a zapomenut.';note('Token byl odstraněn z tohoto prohlížeče.','ok')};
$('saveGitHub').onclick=save;
$('addSub').onclick=()=>add(R.iso(R.week()),'08:00','08:45',{kind:'lesson',period:'1'});
$('addAbs').onclick=()=>absence(R.iso(R.week()));
$('weeklyMode').onclick=()=>setMode(false);$('baseMode').onclick=()=>setMode(true);
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
const saved=tok();if(saved)$('tokenInput').value=saved;
R.load({admin:true,edit:fill,add,absence}).then(()=>{bindFonts();setMode(false);if(tok()){$('tokenState').textContent='Uložený token nalezen – připojuji…';connect()}else $('tokenState').textContent='Bez tokenu můžeš připravit změny, ale neuložíš je na GitHub.'}).catch(e=>note('Načtení selhalo: '+e.message,'err'))})();
