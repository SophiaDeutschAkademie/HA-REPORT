/* HA-REPORT 관리자 화면. 로그인 화면에서 관리자 아이디로 로그인하면 index.html이 이 파일의 HAAdmin.open()을 부릅니다.
   관리자 파일(암호화)에 학생 명단과 학생 비밀번호가 들어 있어, 브라우저 안에서 학생 파일을 열어 현황을 계산합니다.
   학생 추가·삭제는 GitHub API(Git Data API)로 저장소에 커밋 한 번으로 올립니다. 토큰이 필요합니다. */
(function(){
'use strict';
var GH={owner:'SophiaDeutschAkademie',repo:'HA-REPORT',branch:'main'};
var UP='ABCDEFGHJKLMNPQRSTUVWXYZ', LO='abcdefghijkmnopqrstuvwxyz', DG='23456789', TKEY='ha-admin-token';
var LEVELS=['A2','B1','B2','GRAMMATIK','ZERTIFIKAT A2','ZERTIFIKAT B1','ZERTIFIKAT B2'], EXAMS=['telc','GZ'];
function isZ(l){return /^ZERTIFIKAT/.test(l||'');}
var A=null, S=null, st={}, token='', thr=7, flt='all', working=false, loadedAt=null, shown={}, styled=false, lastErr='', gen=0, pending={};

function H(){return window.HA;}
function $(s,r){return (r||document).querySelector(s);}
function esc(s){return H().esc(s);}

/* 난수와 인코딩 */
function randInt(n){
 var a=new Uint32Array(1), lim=Math.floor(4294967296/n)*n;
 do{crypto.getRandomValues(a);}while(a[0]>=lim);
 return a[0]%n;
}
function pickc(s){return s.charAt(randInt(s.length));}
function genPw(){
 var c=[],i,pool=UP+LO+DG;
 for(i=0;i<5;i++)c.push(pickc(UP));
 for(i=0;i<5;i++)c.push(pickc(LO));
 for(i=0;i<5;i++)c.push(pickc(DG));
 for(i=0;i<5;i++)c.push(pickc(pool));
 for(i=c.length-1;i>0;i--){var j=randInt(i+1),t=c[i];c[i]=c[j];c[j]=t;}
 return c.join('');
}
function randBytes(n){
 var out=new Uint8Array(n),o=0,l;
 while(o<n){l=Math.min(65536,n-o);crypto.getRandomValues(out.subarray(o,o+l));o+=l;}
 return out;
}
function hex10(){return Array.prototype.map.call(randBytes(10),function(x){return ('0'+x.toString(16)).slice(-2);}).join('');}
function decoySize(){return 30000+randInt(870000);}
function b64(u8){
 var s='',i,ch=0x8000;
 for(i=0;i<u8.length;i+=ch) s+=String.fromCharCode.apply(null,u8.subarray(i,i+ch));
 return btoa(s);
}
function randText(n){return b64(randBytes(Math.ceil(n*3/4)+4)).replace(/[+\/=]/g,'x').slice(0,n);}
function withPad(b){ /* 내용이 적은 학생 파일은 무작위 채움(pad)으로 가짜 파일과 비슷한 크기로 만듭니다 */
 var real={},k; for(k in b) if(k!=='pad') real[k]=b[k];
 if(JSON.stringify(real).length>=30000) return real;
 if(typeof b.pad==='string') return b;
 real.pad=randText(Math.max(0,decoySize()-JSON.stringify(real).length));
 return real;
}
async function encryptBundle(obj,pw,sid){
 var salt=randBytes(16), iv=randBytes(12), enc=new TextEncoder();
 var km=await crypto.subtle.importKey('raw',enc.encode(pw.trim().normalize('NFKC')),'PBKDF2',false,['deriveKey']);
 var key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:salt,iterations:600000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt']);
 var ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:iv,additionalData:enc.encode(sid)},key,enc.encode(JSON.stringify(obj))));
 var out=new Uint8Array(28+ct.length); out.set(salt,0); out.set(iv,16); out.set(ct,28);
 return out;
}

/* 날짜 */
function pad2(n){return (n<10?'0':'')+n;}
function ymd(d){return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());}
function parseD(s){var m=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s||'').trim());return m?new Date(+m[1],+m[2]-1,+m[3]):null;}
function today0(){var t=new Date();return new Date(t.getFullYear(),t.getMonth(),t.getDate());}
function daysAgo(d){return Math.max(0,Math.round((today0()-d)/86400000));}
function fmtD(d){return (d.getFullYear()===today0().getFullYear()?'':d.getFullYear()+'.')+(d.getMonth()+1)+'.'+d.getDate();}
function agoText(n){return n===0?'오늘':n+'일 전';}

/* GitHub API */
async function gh(path,opt){
 opt=opt||{};
 var h={'Authorization':'Bearer '+token,'Accept':opt.raw?'application/vnd.github.raw+json':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 var init={method:opt.method||'GET',headers:h,cache:'no-store'};
 if(opt.body){init.body=JSON.stringify(opt.body);h['Content-Type']='application/json';}
 var r=await fetch('https://api.github.com/repos/'+GH.owner+'/'+GH.repo+'/'+path,init);
 if(!r.ok){var e=new Error('gh'+r.status);e.status=r.status;e.remain=r.headers.get('x-ratelimit-remaining');try{e.gh=(await r.json()).message;}catch(x){} throw e;}
 return opt.raw?await r.arrayBuffer():await r.json();
}
async function listData(){
 var l=await gh('contents/data?ref='+GH.branch);
 return l.filter(function(f){return f.type==='file'&&/\.bin$/.test(f.name)&&f.name!=='admin.bin';});
}
async function ghCommit(changes,msg,onStep){
 var ref=await gh('git/ref/heads/'+GH.branch), head=ref.object.sha;
 var cm=await gh('git/commits/'+head), tree=[], i, bl;
 for(i=0;i<changes.length;i++){
  if(onStep) onStep(i+1,changes.length);
  if(changes[i].del){tree.push({path:changes[i].path,mode:'100644',type:'blob',sha:null});continue;}
  bl=await gh('git/blobs',{method:'POST',body:{content:b64(changes[i].bytes),encoding:'base64'}});
  tree.push({path:changes[i].path,mode:'100644',type:'blob',sha:bl.sha});
 }
 var nt=await gh('git/trees',{method:'POST',body:{base_tree:cm.tree.sha,tree:tree}});
 var nc=await gh('git/commits',{method:'POST',body:{message:msg,tree:nt.sha,parents:[head]}});
 await gh('git/refs/heads/'+GH.branch,{method:'PATCH',body:{sha:nc.sha,force:false}});
 dirCache={t:0,l:null};
}
/* GitHub의 contents raw 응답은 작은 파일을 글자 코드로 바꿔 내용을 깨뜨릴 수 있습니다. 그래서 파일 목록에서 sha를 얻고 Git blob(base64)으로 읽습니다. */
var dirCache={t:0,l:null};
async function dirList(force){
 if(!force&&dirCache.l&&Date.now()-dirCache.t<15000) return dirCache.l;
 var l=await gh('contents/data?ref='+GH.branch); dirCache={t:Date.now(),l:l}; return l;
}
function b64dec(s){var bin=atob(String(s).replace(/\s/g,'')),u=new Uint8Array(bin.length),i;for(i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u.buffer;}
async function readData(name,force){
 var f=(await dirList(force)).filter(function(x){return x.name===name;})[0];
 if(!f){var e=new Error('nf');e.status=404;throw e;}
 var bl=await gh('git/blobs/'+f.sha);
 return b64dec(bl.content);
}
async function adminFresh(){
 var buf=await readData(S.sid+'.bin',true);
 var b=await H().decryptBundle(buf,S.pw,S.sid);
 b.students=b.students||[]; b.decoys=b.decoys||[];
 return b;
}
async function fetchFile(fid){
 if(token){ /* 토큰이 읽기에서도 거부되면 공개 사본(GitHub Pages)으로 읽습니다 */
  try{return await readData(fid+'.bin');}
  catch(e){if(!(e&&(e.status===401||e.status===403))) throw e;}
 }
 var r=await fetch('data/'+fid+'.bin',{cache:'no-store'});
 if(!r.ok){var e=new Error('http'+r.status);e.status=r.status;throw e;}
 return await r.arrayBuffer();
}
function msgOf(e){
 if(e&&e.status===401) return '토큰이 올바르지 않거나 만료되었습니다.';
 if(e&&e.status===403){
  if(e.remain==='0') return 'GitHub 요청 한도를 넘었습니다. 잠시 뒤 다시 시도하십시오.';
  return '토큰에 이 저장소의 쓰기 권한이 없습니다. 토큰을 만들 때 Resource owner를 SophiaDeutschAkademie(조직)로 고르고 Contents를 Read and write로 설정해야 합니다. 조직이 토큰 승인을 요구하면 조직 관리자 승인도 필요합니다.'+(e.gh?' (GitHub 응답: '+e.gh+')':'');
 }
 if(e&&e.status===404) return '저장소나 파일을 찾을 수 없습니다. 토큰이 HA-REPORT 저장소에 접근할 수 있는지 확인하십시오.';
 if(e&&(e.status===409||e.status===422)) return '다른 곳에서 저장소가 먼저 바뀌었습니다. 새로 불러오기를 누른 뒤 다시 시도하십시오.';
 if(e&&e.name==='OperationError') return '비밀번호가 맞지 않습니다.';
 if(e&&e.name==='TypeError') return '네트워크에 연결하지 못했습니다. 잠시 뒤 다시 시도하십시오.';
 return (e&&e.message)||'알 수 없는 오류가 났습니다.';
}

/* 현황 계산 */
function lastOf(list){
 var best=null;
 (list||[]).forEach(function(x){var d=parseD(x&&x.date);if(d&&(!best||d>best))best=d;});
 return best;
}
function summarize(b){
 var o={name:b.name,level:b.level,exam:b.exam||'',gr:Array.isArray(b.grammatik),
  ha:{last:lastOf((b.exams||[]).concat(b.reports||[])),n:Math.max((b.reports||[]).length,(b.exams||[]).length)},
  vk:{last:lastOf(b.voka),n:(b.voka||[]).length},
  gm:{last:lastOf(b.grammatik),n:(b.grammatik||[]).length},
  rs:{last:lastOf(b.results),n:(b.results||[]).length}};
 o.last=[o.ha.last,o.vk.last,o.gm.last].reduce(function(m,d){return d&&(!m||d>m)?d:m;},null);
 return o;
}
function cls(s){
 var x=st[s.fid]||{state:'load'};
 if(x.state==='load') return {k:'load',label:'불러오는 중',rank:5,n:0};
 if(x.state==='nopw') return {k:'warn',label:'비밀번호 필요',rank:1,n:0};
 if(x.state==='missing') return {k:'warn',label:'파일 없음',rank:1,n:0};
 if(x.state==='badpw') return {k:'warn',label:'비밀번호 불일치',rank:1,n:0};
 if(x.state!=='ok') return {k:'warn',label:'불러오기 실패',rank:1,n:0};
 var m=x.sum, n=m.last?daysAgo(m.last):0; /* 제출일이 없으면 날짜를 셀 수 없으므로 빨간색으로 표시하지 않습니다 */
 if(m.last) return n>=thr?{k:'late',label:n+'일 경과',rank:0,n:n}:{k:'ok',label:'정상',rank:3,n:n};
 return {k:'norec',label:'제출 없음',rank:2,n:0};
}
function inFilter(c,f){
 if(f==='all') return true;
 if(f==='late') return c.k==='late';
 if(f==='norec') return c.k==='norec'||c.norec===true;
 return c.k===f;
}

/* 화면 */
var CSS='.wrap.wide{max-width:1040px}.at a.nm{font-weight:700;color:var(--acc);text-decoration:underline;text-underline-offset:3px;cursor:pointer}.lvs{font:inherit;font-size:13.5px;padding:3px 4px;max-width:150px;border:1.5px solid var(--line);border-radius:8px;background:#fff;color:var(--ink)}'
+'.asum{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:0 0 4px}'
+'.acell{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 16px}'
+'.acell b{display:block;font-size:26px;line-height:1.3}.acell span{color:var(--mute);font-size:13px}'
+'.acell.late b{color:var(--bad)}.acell.warn b{color:var(--warn)}'
+'table.at{width:100%;border-collapse:collapse;font-size:14px;min-width:860px}'
+'.at th,.at td{padding:9px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}'
+'.at th{font-size:12.5px;color:var(--mute);font-weight:600;white-space:nowrap}'
+'.at th small{display:block;font-weight:400;font-size:11.5px}'
+'.at td small{display:block;color:var(--mute);font-size:12px;line-height:1.45}'
+'.at tr.late td{background:#fdeceb}.at tr.late a.nm,.at tr.late b{color:var(--bad)}.at tr.late small.ago{color:var(--bad);font-weight:700}'
+'.badge{display:inline-block;border-radius:999px;padding:2px 10px;font-size:12.5px;font-weight:700;white-space:nowrap}'
+'.badge.ok{background:#e4f0e8;color:#2f6a4c}.badge.late{background:var(--bad);color:#fff}'
+'.badge.norec,.badge.load{background:#efece4;color:#6b665f}.badge.warn{background:#f4ead2;color:#7d5f1b}'
+'.badge.gr{background:#e3ecf5;color:#2e5f8a;font-weight:600}'
+'.mgb{display:flex;flex-wrap:wrap;gap:8px 20px}.lvs.exs{display:block;margin-top:5px}'
+'.btn.sm{padding:4px 10px;font-size:13px}.btn.dng{border-color:#c9a09b;color:var(--bad)}.btn.dng:hover{background:#f6e6e3}'
+'.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.03em;overflow-wrap:anywhere}'
+'.lnk{display:flex;gap:6px;margin-top:6px}.lnk input{width:150px;min-width:0;border:1.5px solid var(--line);border-radius:8px;padding:4px 8px;font:inherit;font-size:13px}'
+'.aform{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end;margin:8px 0}'
+'.aform label{display:block;font-weight:600;font-size:13px;margin-bottom:4px}'
+'.aform input[type=text],.aform input[type=password],.aform input[type=number],.aform select{width:100%;border:1.5px solid var(--line);border-radius:10px;padding:9px 10px;font:inherit;font-size:15px;background:#fff;color:var(--ink)}'
+'.aform .chk{display:flex;align-items:center;gap:6px;font-weight:600;font-size:14px;padding-bottom:9px}'
+'.asec h2{margin-bottom:2px}.asec h3{margin:18px 0 2px}'
+'.cred{border:1.5px solid var(--acc);background:#f1f6f3;border-radius:12px;padding:12px 14px;margin-top:10px}'
+'.cred div{margin:2px 0}'
+'.thr{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;color:var(--mute)}.thr input{width:60px;border:1.5px solid var(--line);border-radius:8px;padding:4px 6px;font:inherit;font-size:14px}';
function injectStyle(){
 if(styled) return;
 var s=document.createElement('style'); s.textContent=CSS; document.head.appendChild(s); styled=true;
}
function say(msg,err){
 ['#alog','#atmsg'].forEach(function(q){var m=$(q); if(!m) return; m.className='msg'+(err?' err':''); m.textContent=msg||'';});
}
function mergePending(obj){
 Object.keys(pending).forEach(function(f){
  var p=pending[f], cur=obj.students.filter(function(s){return s.fid===f;})[0];
  if(cur){cur.password=p.pw;if(p.name)cur.name=p.name;if(p.level)cur.level=p.level;if(!cur.id)cur.id=p.id;}
  else obj.students.push({id:p.id,fid:f,name:p.name,level:p.level,password:p.pw,added:ymd(new Date())});
 });
}
async function flushPending(){
 if(working||!Object.keys(pending).length) return;
 busy(true);
 try{
  say('연결한 비밀번호를 저장하고 있습니다.');
  var fresh=await adminFresh(); mergePending(fresh);
  await commitChanges([{path:'data/'+S.sid+'.bin',bytes:await encryptBundle(withPad(fresh),S.pw,S.sid)}],'데이터 갱신');
  A=fresh; pending={};
  say('연결한 비밀번호를 저장했습니다.');
 }catch(e){say(msgOf(e),true);}
 finally{busy(false);renderTable();}
}
function busy(b){
 working=b;
 document.querySelectorAll('#aman .btn,#atb .btn,#atb select,#arf').forEach(function(x){x.disabled=b;});
}
function needToken(){
 if(token) return true;
 say('GitHub 토큰을 먼저 입력하십시오. 아래 "GitHub 토큰"에서 입력합니다.',true);
 return false;
}

function open(o){
 var keep=!!(o&&o.keep&&A&&S); /* 학생 화면에서 돌아올 때는 불러온 현황을 그대로 씁니다 */
 if(!keep){
  var sess=H().session(); if(!sess||!sess.data) return;
  S={sid:sess.sid,pw:sess.pw}; A=sess.data; A.students=A.students||[]; A.decoys=A.decoys||[];
  st={}; shown={}; pending={}; flt='all'; thr=7; lastErr=''; loadedAt=null; tokenChecked=false;
  try{token=localStorage.getItem(TKEY)||'';}catch(e){token='';}
  if(A.token) token=A.token; /* 관리자 파일에 암호화되어 들어 있는 토큰 */
 }
 injectStyle();
 var app=H().app; app.className='wrap wide'; $('#top').hidden=false;
 var h='<div class="vhead"><div class="row"><div><div class="who">관리자</div><div class="lv">'+esc(A.name||'')+'</div></div><button class="btn" id="out">로그아웃</button></div></div>';
 h+='<div class="asum" id="asum"></div>';
 h+='<section class="card asec"><div class="rhead"><h2 style="margin:0">학생 현황</h2><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
  +'<label class="thr">기준 <input id="athr" type="number" min="1" max="90" value="'+thr+'"> 일 이상 지남</label><button type="button" class="btn" id="arf">새로 불러오기</button></div></div>'
  +'<div class="tabs" id="aflt" role="tablist" aria-label="보기"></div><div class="msg" id="atmsg" role="status"></div><div class="tbscroll" id="atb"></div><p class="note" id="anote"></p></section>';
 h+='<section class="card asec" id="aman"><h2>학생 관리</h2>'
  +'<h3>GitHub 토큰</h3><p class="note">학생 추가·삭제와 비밀번호 저장에 필요합니다. GitHub의 Settings → Developer settings → Fine-grained tokens에서 HA-REPORT 저장소 하나만 고르고 Contents 권한을 Read and write로 만든 토큰을 붙여 넣으십시오. 토큰은 저장소에 올라가지 않습니다.</p>'
  +'<div class="aform" style="grid-template-columns:1fr auto"><div><label for="atk">토큰</label><input id="atk" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_..."></div><div style="display:flex;gap:6px;padding-bottom:0"><button type="button" class="btn main" id="atks">사용</button><button type="button" class="btn" id="atkc">지우기</button></div></div>'
  +'<label class="chk" style="display:flex;align-items:center;gap:6px;font-size:13.5px;color:var(--mute)"><input type="checkbox" id="atkr"> 이 브라우저에 기억합니다 (다음 로그인부터 다시 입력하지 않습니다. 여러 사람이 쓰는 컴퓨터에서는 끄십시오)</label><p class="note" id="atkn"></p>'
  +'<h3>학생 추가</h3><p class="note">새 학생 파일을 만들고 명단에 넣습니다. 비밀번호는 비워 두면 20자리로 자동 생성합니다.</p>'
  +'<div class="aform"><div><label for="an">이름</label><input id="an" type="text" autocomplete="off"></div><div><label for="ai">아이디</label><input id="ai" type="text" autocomplete="off" placeholder="비우면 이름"></div>'
  +'<div><label for="al">레벨·반</label><select id="al">'+LEVELS.map(function(l){return '<option>'+l+'</option>';}).join('')+'</select></div>'
  +'<div id="aew" hidden><label for="ae">시험 종류</label><select id="ae"><option value="">선택 안 함</option>'+EXAMS.map(function(x){return '<option>'+x+'</option>';}).join('')+'</select></div>'
  +'<div><label for="ap">비밀번호</label><input id="ap" type="text" autocomplete="off" placeholder="비우면 자동 생성"></div>'
  +'<div><button type="button" class="btn main" id="aadd">추가</button></div></div>'
  +'<h3>기존 학생 연결</h3><p class="note">이미 저장소에 있는 학생을 명단에 넣습니다. 아이디와 비밀번호가 맞아야 합니다.</p>'
  +'<div class="aform"><div><label for="li">아이디</label><input id="li" type="text" autocomplete="off"></div><div><label for="lp">비밀번호</label><input id="lp" type="password" autocomplete="off"></div><div><button type="button" class="btn main" id="alk">연결</button></div></div>'
  +'<h3>비밀번호 분실 시 새로 만들기</h3><p class="note">저장소에 파일은 있는데 비밀번호를 모르는 학생의 파일을 새 비밀번호로 다시 만듭니다. <b>그 학생의 기존 기록(시험 기록, 리포트, VOKA, GRAMMATIK)은 모두 사라지고 빈 파일이 됩니다.</b> 이전 파일은 비밀번호 없이는 열 수 없기 때문입니다. 아이디는 학생이 로그인할 때 쓰던 것과 같아야 합니다. 비밀번호는 비워 두면 20자리로 자동 생성합니다.</p>'
  +'<div class="aform"><div><label for="rn">이름</label><input id="rn" type="text" autocomplete="off"></div><div><label for="ri">아이디</label><input id="ri" type="text" autocomplete="off" placeholder="비우면 이름"></div>'
  +'<div><label for="rl">레벨·반</label><select id="rl">'+LEVELS.map(function(l){return '<option>'+l+'</option>';}).join('')+'</select></div>'
  +'<div><label for="rp">새 비밀번호</label><input id="rp" type="text" autocomplete="off" placeholder="비우면 자동 생성"></div>'
  +'<div><button type="button" class="btn dng" id="arst">새로 만들기</button></div></div>'
  +'<div class="msg" id="alog" role="status"></div><div id="aout"></div></section>';
 h+='<p class="foot">관리자 화면입니다. 다 본 뒤에는 로그아웃을 누르십시오.</p>';
 app.innerHTML=h;
 $('#out').addEventListener('click',H().leave);
 $('#arf').addEventListener('click',function(){if(!working)loadAll();});
 $('#athr').addEventListener('input',function(){var v=parseInt(this.value,10);if(v>=1&&v<=90){thr=v;renderTable();}});
 $('#aflt').addEventListener('click',function(e){var t=e.target.closest('.tab');if(!t)return;flt=t.dataset.k;renderTable();});
 $('#atb').addEventListener('click',onTable);
 $('#atb').addEventListener('change',function(e){
  var sel=e.target.closest('select.lvs'); if(!sel) return;
  var tr=sel.closest('tr'), fid=tr&&tr.dataset.f, s=A.students.filter(function(x){return x.fid===fid;})[0];
  if(/\bexs\b/.test(sel.className)){
   if(!s||working||(sel.value&&EXAMS.indexOf(sel.value)<0)){renderTable();return;}
   changeExam(s,sel.value); return;
  }
  if(!s||working||LEVELS.indexOf(sel.value)<0){renderTable();return;}
  changeLevel(s,sel.value);
 });
 $('#atks').addEventListener('click',useToken);
 $('#atkc').addEventListener('click',clearToken);
 $('#aadd').addEventListener('click',addStudent);
 $('#al').addEventListener('change',function(){$('#aew').hidden=!isZ(this.value);if(!isZ(this.value))$('#ae').value='';});
 $('#alk').addEventListener('click',function(){linkStudent($('#li').value.trim(),$('#lp').value);});
 $('#arst').addEventListener('click',resetStudent);
 $('#aout').addEventListener('click',function(e){
  var b=e.target.closest('[data-a="copy"]'); if(!b) return;
  try{navigator.clipboard.writeText(b.dataset.t);b.textContent='복사했습니다';}catch(x){b.textContent='복사하지 못했습니다';}
 });
 tokenNote();
 window.scrollTo(0,0);
 if(keep) renderTable(); else loadAll();
}
function close(){
 gen++; A=null; S=null; st={}; shown={}; pending={}; token=''; working=false;
 var a=H()&&H().app; if(a) a.className='wrap';
}

function tokenNote(){
 var n=$('#atkn'); if(!n) return;
 n.textContent=(A&&A.token&&token===A.token)?'관리자 파일에 저장된 토큰을 쓰고 있습니다. 따로 입력하지 않아도 학생 추가·삭제·레벨 변경을 쓸 수 있습니다.':token?'토큰이 설정되어 있습니다. 학생 추가·삭제를 쓸 수 있고, 현황은 저장소에서 바로 읽습니다.':'토큰이 없습니다. 현황은 보이지만 학생 추가·삭제는 쓸 수 없습니다.';
 var k=$('#atk'); if(k&&token) k.placeholder='설정됨';
 var r=$('#atkr'); if(r){var sv=false;try{sv=!!localStorage.getItem(TKEY);}catch(e){} r.checked=token?sv:true;}
}
function useToken(){
 var v=$('#atk').value.trim();
 if(!v){say('토큰을 입력하십시오.',true);return;}
 token=v; tokenChecked=false; $('#atk').value='';
 try{if($('#atkr').checked)localStorage.setItem(TKEY,token);else localStorage.removeItem(TKEY);}catch(e){}
 tokenNote();
 if(Object.keys(pending).length){flushPending().then(function(){if(A)loadAll();});}
 else{say('토큰을 설정했습니다. 현황을 다시 불러옵니다.'); loadAll();}
}
function clearToken(){
 if(A&&A.token){say('이 토큰은 관리자 파일에 저장되어 있어 여기서 지울 수 없습니다.',true);return;}
 token=''; try{localStorage.removeItem(TKEY);}catch(e){}
 var k=$('#atk'); if(k){k.value='';k.placeholder='github_pat_...';}
 tokenNote(); say('토큰을 지웠습니다.');
}

function summaryHtml(){
 var c={all:A.students.length,late:0,norec:0,warn:0,ok:0};
 A.students.forEach(function(s){var q=cls(s);if(q.k==='late')c.late++;if(q.k==='norec'||q.norec)c.norec++;if(q.k==='warn')c.warn++;if(q.k==='ok')c.ok++;});
 return {c:c,html:'<div class="acell"><b>'+c.all+'</b><span>전체 학생</span></div>'
  +'<div class="acell late"><b>'+c.late+'</b><span>'+thr+'일 이상 지남</span></div>'
  +'<div class="acell"><b>'+c.norec+'</b><span>제출 없음</span></div>'
  +'<div class="acell warn"><b>'+c.warn+'</b><span>확인 필요</span></div>'};
}
function rowHtml(s){
 var x=st[s.fid]||{state:'load'}, c=cls(s), m=x.state==='ok'?x.sum:null;
 var name=m?m.name:s.name, lvl=m?m.level:s.level;
 var h='<tr class="'+(c.k==='late'?'late':'')+'" data-f="'+esc(s.fid)+'">';
 h+='<td>'+(x.state==='ok'?'<a href="#" class="nm" data-a="view">'+esc(name)+'</a>':'<b>'+esc(name)+'</b>')+(s.id&&s.id!==name?'<small>아이디 '+esc(s.id)+'</small>':'')+'</td>';
 var lopts=LEVELS.slice(); if(lvl&&lopts.indexOf(lvl)<0) lopts.unshift(lvl); if(!lvl) lopts.unshift('-');
 h+='<td><select class="lvs" aria-label="'+esc(name)+' 레벨">'+lopts.map(function(l){return '<option'+(l===(lvl||'-')?' selected':'')+'>'+esc(l)+'</option>';}).join('')+'</select>'+(isZ(lvl)?'<select class="lvs exs" aria-label="'+esc(name)+' 시험 종류"><option value="">시험 종류 -</option>'+EXAMS.map(function(x){return '<option'+(x===((m&&m.exam)||s.exam||'')?' selected':'')+'>'+x+'</option>';}).join('')+'</select>':'')+(m&&m.gr&&lvl!=='GRAMMATIK'?'<small>GRAMMATIK 탭 있음</small>':'')+'</td>';
 ['ha','vk','gm','rs'].forEach(function(k){
  var q=m&&m[k];
  h+='<td>'+(q&&q.last?fmtD(q.last)+'<small>'+q.n+'개</small>':'-')+'</td>';
 });
 var sub2='';
 if(m&&m.last) sub2='<small class="ago">마지막 제출 '+fmtD(m.last)+' · '+agoText(daysAgo(m.last))+'</small>';
 h+='<td><span class="badge '+c.k+'">'+esc(c.label)+'</span>'+sub2+'</td>';
 var mg='<div class="mgb">';
 if(s.password) mg+='<button type="button" class="btn sm" data-a="pw">'+(shown[s.fid]?'숨기기':'비밀번호')+'</button>';
 mg+='<button type="button" class="btn sm dng" data-a="del">삭제</button></div>';
 if(shown[s.fid]&&s.password) mg+='<small class="mono">'+esc(s.password)+'</small>';
 if(x.state==='nopw'||x.state==='badpw') mg+='<div class="lnk"><input type="password" class="rp" placeholder="비밀번호" autocomplete="off"><button type="button" class="btn sm" data-a="link">연결</button></div>';
 return h+'<td>'+mg+'</td></tr>';
}
function renderTable(){
 if(!A||!$('#atb')) return;
 var keep={}; document.querySelectorAll('#atb tr[data-f] .rp').forEach(function(i){if(i.value)keep[i.closest('tr').dataset.f]=i.value;});
 var sm=summaryHtml(); $('#asum').innerHTML=sm.html;
 var F=[['all','전체',sm.c.all],['late',thr+'일 이상 지남',sm.c.late],['norec','제출 없음',sm.c.norec],['ok','정상',sm.c.ok],['warn','확인 필요',sm.c.warn]];
 $('#aflt').innerHTML=F.map(function(f){return '<button type="button" class="tab" role="tab" data-k="'+f[0]+'" aria-selected="'+(flt===f[0])+'">'+f[1]+' '+f[2]+'</button>';}).join('');
 var rows=A.students.map(function(s){return {s:s,c:cls(s)};}).filter(function(r){return inFilter(r.c,flt);});
 var KO=new Intl.Collator('ko');
 var LORD=['A1'].concat(LEVELS);
 function lvOf(r){var x=st[r.s.fid]; return (x&&x.state==='ok'&&x.sum&&x.sum.level)?x.sum.level:r.s.level;}
 function lvRank(r){var i=LORD.indexOf(lvOf(r)); return i<0?LORD.length:i;}
 function nmOf(r){var x=st[r.s.fid]; return String((x&&x.state==='ok'&&x.sum&&x.sum.name)?x.sum.name:(r.s.name||''));}
 rows.sort(function(p,q){return (lvRank(p)-lvRank(q))||KO.compare(nmOf(p),nmOf(q));});
 if(!A.students.length) $('#atb').innerHTML='<div class="empty">명단에 학생이 없습니다. 아래에서 학생을 추가하거나 기존 학생을 연결하십시오.</div>';
 else if(!rows.length) $('#atb').innerHTML='<div class="empty">이 보기에 해당하는 학생이 없습니다.</div>';
 else $('#atb').innerHTML='<table class="at"><thead><tr><th>이름</th><th>레벨·반</th><th>과제 첨삭<small>제출일</small></th><th>VOKA<small>제출일</small></th><th>GRAMMATIK<small>제출일</small></th><th>시험 결과<small>등록일</small></th><th>상태</th><th>관리</th></tr></thead><tbody>'+rows.map(function(r){return rowHtml(r.s);}).join('')+'</tbody></table>';
 Object.keys(keep).forEach(function(f){var i=document.querySelector('#atb tr[data-f="'+f+'"] .rp');if(i)i.value=keep[f];});
 var n=[];
 n.push('제출일은 과제 첨삭(시험 기록·리포트), VOKA, GRAMMATIK 기록에 적힌 날짜입니다. 이 가운데 가장 늦은 제출일로부터 기준 일수 이상 지나면 빨간색으로 표시합니다. 시험 결과는 과제 첨삭과 따로 분류한 기록이라 등록일과 개수만 보여 주고, 일수 경과 판단에는 넣지 않습니다. 표는 레벨(A2, B1, B2, GRAMMATIK, ZERTIFIKAT A2, ZERTIFIKAT B1, ZERTIFIKAT B2 순) 안에서 이름순으로 정렬합니다. 제출 기록이 아직 없는 학생은 제출일이 없어 "제출 없음"으로만 표시하고 빨간색으로 표시하지 않습니다.');
 if(loadedAt) n.push(pad2(loadedAt.getHours())+':'+pad2(loadedAt.getMinutes())+'에 불러왔습니다.'+(token?'':' 토큰이 없으면 GitHub Pages의 복사본을 읽기 때문에 최대 10분쯤 늦을 수 있습니다.'));
 if(lastErr) n.push('불러오기 오류: '+lastErr);
 $('#anote').textContent=n.join(' ');
 if(working) busy(true);
}
function onTable(e){
 var b=e.target.closest('[data-a]'); if(!b||working) return;
 var tr=b.closest('tr'), fid=tr&&tr.dataset.f, s=A.students.filter(function(x){return x.fid===fid;})[0]; if(!s) return;
 var a=b.dataset.a;
 if(a==='pw'){shown[fid]=!shown[fid];renderTable();}
 else if(a==='del') removeStudent(s);
 else if(a==='link') linkStudent(s.id,tr.querySelector('.rp').value);
 else if(a==='view'){e.preventDefault();viewStudent(s);}
}

/* 현황 불러오기 */
async function loadOne(s,g){
 var r;
 try{
  var buf=await fetchFile(s.fid), b=await H().decryptBundle(buf,s.password,s.fid);
  r={state:'ok',sum:summarize(b)};
 }catch(e){
  if(e&&e.status===404) r={state:'missing'};
  else if(e&&e.name==='OperationError') r={state:'badpw'};
  else{r={state:'err'};lastErr=msgOf(e);}
 }
 if(g!==gen) return;
 st[s.fid]=r; renderTable();
}
var tokenChecked=false;
async function checkToken(){ /* 토큰으로 쓰기가 되는지 빈 데이터 하나를 올려 미리 확인합니다(저장소에는 보이지 않습니다) */
 if(!token||tokenChecked||!A) return; tokenChecked=true;
 try{await gh('git/blobs',{method:'POST',body:{content:'',encoding:'utf-8'}});}
 catch(e){tokenChecked=false;say(msgOf(e),true);}
}
async function loadAll(){
 var g=++gen; lastErr=''; loadedAt=null; st={};
 if(token){ /* 토큰이 있으면 명단도 저장소에서 다시 읽습니다. 로그인 때 읽는 GitHub Pages 사본은 몇 분 늦을 수 있습니다 */
  try{var fr=await adminFresh(); mergePending(fr); A=fr;}catch(e){lastErr=msgOf(e);}
  if(g!==gen) return;
 }
 A.students.forEach(function(s){st[s.fid]={state:s.password?'load':'nopw'};});
 renderTable();
 var jobs=A.students.filter(function(s){return s.password;}), i=0;
 async function worker(){while(i<jobs.length&&g===gen){await loadOne(jobs[i++],g);}}
 await Promise.all([worker(),worker(),worker()]);
 if(g!==gen) return;
 loadedAt=new Date(); renderTable();
 checkToken();
}

/* 학생 추가·연결·삭제 */
async function addStudent(){
 if(working||!needToken()) return;
 var name=$('#an').value.trim(), idv=$('#ai').value.trim()||name, lv=$('#al').value, gr=(lv==='GRAMMATIK'), pw=$('#ap').value.trim(), ex=isZ(lv)?$('#ae').value:'';
 if(!name){say('이름을 입력하십시오.',true);return;}
 if(pw&&pw.length!==20){say('비밀번호는 20자리여야 합니다. 비워 두면 자동으로 만듭니다.',true);return;}
 pw=pw||genPw();
 busy(true); $('#aout').innerHTML='';
 try{
  var fid=await H().deriveId(idv);
  if(A.students.some(function(s){return s.fid===fid;})) throw new Error('이미 명단에 있는 아이디입니다. 같은 이름이 두 명이면 아이디를 다르게 입력하십시오(예: '+idv+'2).');
  say('저장소 상태를 확인하고 있습니다.');
  var files=await listData(), names={};
  files.forEach(function(f){names[f.name]=1;});
  var fresh=await adminFresh();
  var reuse=!!names[fid+'.bin']&&fresh.decoys.indexOf(fid)>=0; /* 삭제한 학생의 파일 자리는 가짜 파일로 남아 있어 다시 쓸 수 있습니다 */
  if(names[fid+'.bin']&&!reuse) throw new Error('같은 아이디의 파일이 저장소에 이미 있습니다. 아래 "기존 학생 연결"을 쓰십시오.');
  var b={name:name,level:lv,exams:[],reports:[],voka:[]}; if(gr) b.grammatik=[]; if(ex) b.exam=ex;
  say('학생 파일을 암호화하고 있습니다.');
  var sbytes=await encryptBundle(withPad(b),pw,fid);
  fresh=await adminFresh();
  if(fresh.students.some(function(s){return s.fid===fid;})) throw new Error('이미 명단에 있는 아이디입니다.');
  var ns={id:idv,fid:fid,name:name,level:lv,password:pw,added:ymd(new Date())}; if(ex) ns.exam=ex;
  fresh.students.push(ns);
  var changes=[{path:'data/'+fid+'.bin',bytes:sbytes}], count=files.length+(reuse?0:1), k, d;
  if(reuse) fresh.decoys=fresh.decoys.filter(function(x){return x!==fid;});
  else for(k=0;k<fresh.decoys.length;k++){ /* 기록된 가짜 파일이 있으면 하나를 지워 파일 수를 유지합니다 */
   if(names[fresh.decoys[k]+'.bin']){changes.push({path:'data/'+fresh.decoys[k]+'.bin',bytes:null,del:true});fresh.decoys.splice(k,1);count--;break;}
  }
  while(count%20!==0){d=hex10();changes.push({path:'data/'+d+'.bin',bytes:randBytes(decoySize())});fresh.decoys.push(d);count++;}
  changes.push({path:'data/'+S.sid+'.bin',bytes:await encryptBundle(withPad(fresh),S.pw,S.sid)});
  await commitChanges(changes,'데이터 갱신');
  A=fresh; st[fid]={state:'ok',sum:summarize(b)};
  $('#an').value='';$('#ai').value='';$('#ap').value='';$('#ae').value='';
  var cp='아이디: '+idv+'\n비밀번호: '+pw;
  $('#aout').innerHTML='<div class="cred"><b>'+esc(name)+' 학생을 추가했습니다.</b><div>아이디 <span class="mono">'+esc(idv)+'</span></div><div>비밀번호 <span class="mono">'+esc(pw)+'</span> <button type="button" class="btn sm" data-a="copy" data-t="'+esc(cp)+'">복사</button></div><p class="note">GitHub Pages에 반영되기까지 1~2분 걸립니다. 반영된 뒤에 학생이 로그인할 수 있습니다. 비밀번호는 위 학생 현황의 "비밀번호" 버튼으로 다시 볼 수 있습니다.</p></div>';
  say('');
 }catch(e){say(msgOf(e),true);}
 finally{busy(false);renderTable();}
}
/* 비밀번호를 잃어버린 학생의 파일을 새 비밀번호로 다시 만듭니다. 기존 기록은 열 수 없으므로 빈 파일로 바뀝니다 */
async function resetStudent(){
 if(working||!needToken()) return;
 var name=$('#rn').value.trim(), idv=$('#ri').value.trim()||name, lv=$('#rl').value, pw=$('#rp').value.trim();
 if(!name){say('이름을 입력하십시오.',true);return;}
 if(pw&&pw.length!==20){say('비밀번호는 20자리여야 합니다. 비워 두면 자동으로 만듭니다.',true);return;}
 if(!window.confirm(name+' 학생(아이디 '+idv+')의 파일을 새로 만듭니다.\n기존 기록(시험 기록, 리포트, VOKA, GRAMMATIK)은 모두 사라지고 빈 파일이 됩니다. 되돌릴 수 없습니다.\n계속하시겠습니까?')) return;
 pw=pw||genPw();
 busy(true); $('#aout').innerHTML='';
 try{
  var fid=await H().deriveId(idv);
  say('저장소 상태를 확인하고 있습니다.');
  var files=await listData();
  if(!files.some(function(f){return f.name===fid+'.bin';})) throw new Error('이 아이디의 파일이 저장소에 없습니다. 아이디를 확인하거나 위 "학생 추가"를 쓰십시오.');
  var fresh=await adminFresh(); mergePending(fresh);
  if(fresh.decoys.indexOf(fid)>=0) throw new Error('이 아이디의 파일은 삭제한 학생의 빈 자리입니다. 위 "학생 추가"를 쓰십시오.');
  var b={name:name,level:lv,exams:[],reports:[],voka:[]}; if(lv==='GRAMMATIK') b.grammatik=[];
  var pv=A.students.filter(function(s){return s.fid===fid;})[0]; if(pv&&pv.exam&&isZ(lv)) b.exam=pv.exam;
  say('학생 파일을 암호화하고 있습니다.');
  var sbytes=await encryptBundle(withPad(b),pw,fid);
  fresh=await adminFresh(); mergePending(fresh);
  var cur=fresh.students.filter(function(s){return s.fid===fid;})[0];
  if(cur){cur.id=idv;cur.name=name;cur.level=lv;cur.password=pw;if(b.exam)cur.exam=b.exam;else delete cur.exam;}
  else fresh.students.push({id:idv,fid:fid,name:name,level:lv,password:pw,added:ymd(new Date())});
  await commitChanges([{path:'data/'+fid+'.bin',bytes:sbytes},{path:'data/'+S.sid+'.bin',bytes:await encryptBundle(withPad(fresh),S.pw,S.sid)}],'데이터 갱신');
  A=fresh; pending={}; st[fid]={state:'ok',sum:summarize(b)}; delete shown[fid];
  $('#rn').value='';$('#ri').value='';$('#rp').value='';
  var cp='아이디: '+idv+'\n비밀번호: '+pw;
  $('#aout').innerHTML='<div class="cred"><b>'+esc(name)+' 학생의 파일을 새로 만들었습니다.</b><div>아이디 <span class="mono">'+esc(idv)+'</span></div><div>비밀번호 <span class="mono">'+esc(pw)+'</span> <button type="button" class="btn sm" data-a="copy" data-t="'+esc(cp)+'">복사</button></div><p class="note">GitHub Pages에 반영되기까지 1~2분 걸립니다. 반영된 뒤에 학생이 새 비밀번호로 로그인할 수 있습니다. 비밀번호는 위 학생 현황의 "비밀번호" 버튼으로 다시 볼 수 있습니다.</p></div>';
  say('');
 }catch(e){say(msgOf(e),true);}
 finally{busy(false);renderTable();}
}
async function commitChanges(changes,msg){
 await ghCommit(changes,msg,function(i,n){say('저장소에 올리고 있습니다. ('+i+'/'+n+')');});
}
async function linkStudent(idv,pw){
 if(working) return;
 if(!idv||!pw){say('아이디와 비밀번호를 입력하십시오.',true);return;}
 busy(true);
 try{
  var fid=await H().deriveId(idv), buf;
  say('학생 파일을 확인하고 있습니다.');
  try{buf=await fetchFile(fid);}catch(e){if(e&&e.status===404) throw new Error('이 아이디의 파일이 저장소에 없습니다.');throw e;}
  var b;
  try{b=await H().decryptBundle(buf,pw,fid);}catch(e){throw new Error('비밀번호가 맞지 않습니다.');}
  if(!token){ /* 토큰이 없으면 이 화면에만 반영하고, 토큰을 입력할 때 저장합니다 */
   var c0=A.students.filter(function(s){return s.fid===fid;})[0];
   if(c0){c0.password=pw;c0.name=b.name;c0.level=b.level;if(b.exam)c0.exam=b.exam;else delete c0.exam;if(!c0.id)c0.id=idv;}
   else A.students.push({id:idv,fid:fid,name:b.name,level:b.level,exam:b.exam||undefined,password:pw,added:ymd(new Date())});
   pending[fid]={id:idv,pw:pw,name:b.name,level:b.level};
   st[fid]={state:'ok',sum:summarize(b)};
   $('#li').value='';$('#lp').value='';
   say(b.name+' 학생의 비밀번호가 맞습니다. 현황에는 반영했지만 아직 저장하지는 않았습니다. 아래 "GitHub 토큰"을 입력하면 저장합니다. 저장하지 않고 로그아웃하면 사라집니다.');
   return;
  }
  var fresh=await adminFresh(); mergePending(fresh);
  var cur=fresh.students.filter(function(s){return s.fid===fid;})[0];
  if(cur){cur.password=pw;cur.name=b.name;cur.level=b.level;if(b.exam)cur.exam=b.exam;else delete cur.exam;if(!cur.id)cur.id=idv;}
  else fresh.students.push({id:idv,fid:fid,name:b.name,level:b.level,exam:b.exam||undefined,password:pw,added:ymd(new Date())});
  await commitChanges([{path:'data/'+S.sid+'.bin',bytes:await encryptBundle(withPad(fresh),S.pw,S.sid)}],'데이터 갱신');
  A=fresh; pending={}; st[fid]={state:'ok',sum:summarize(b)};
  $('#li').value='';$('#lp').value='';
  say(b.name+' 학생을 명단에 반영했습니다.');
 }catch(e){say(msgOf(e),true);}
 finally{busy(false);renderTable();}
}
async function viewStudent(s){
 if(working||!s.password) return;
 busy(true); say('학생 화면을 불러오고 있습니다.');
 try{
  var buf=await fetchFile(s.fid), b=await H().decryptBundle(buf,s.password,s.fid);
  say(''); busy(false); H().preview(b); return;
 }catch(e){say(msgOf(e),true);}
 busy(false);
}
async function changeLevel(s,lv){
 if(working) return;
 if(!needToken()){renderTable();return;}
 busy(true);
 try{
  say('저장소 상태를 확인하고 있습니다.');
  var fresh=await adminFresh(), cur=fresh.students.filter(function(x){return x.fid===s.fid;})[0];
  if(!cur) throw new Error('명단에서 이미 빠져 있습니다. 새로 불러오기를 눌러 확인하십시오.');
  var changes=[], nm=cur.name, b=null, msg;
  if(lv==='GRAMMATIK'&&!cur.password) throw new Error('GRAMMATIK 탭은 학생 파일 안에 있어 비밀번호가 필요합니다. 먼저 이 줄에서 비밀번호를 연결하십시오.');
  if(cur.password){ /* 학생 파일 안의 기본 레벨과 GRAMMATIK 탭도 함께 바꿉니다 */
   var buf=await fetchFile(s.fid);
   try{b=await H().decryptBundle(buf,cur.password,s.fid);}catch(e){throw new Error('저장된 비밀번호로 학생 파일을 열지 못했습니다. 비밀번호를 다시 연결하십시오.');}
   nm=b.name;
   if(lv==='GRAMMATIK'){ /* 다른 레벨만 있어도 GRAMMATIK 탭을 만듭니다. 기존 레벨은 그대로 둡니다 */
    if(Array.isArray(b.grammatik)){say(nm+' 학생에게는 이미 GRAMMATIK 탭이 있습니다.');return;}
    b.grammatik=[];
    if(!b.level||b.level==='-') b.level='GRAMMATIK';
    msg=nm+' 학생에게 GRAMMATIK 탭을 만들었습니다. 레벨은 '+b.level+' 그대로입니다. 반영까지 1~2분 걸립니다.';
   }else{ /* 레벨만 바꾸고 GRAMMATIK 탭과 리포트는 그대로 둡니다 */
    b.level=lv;
    msg=nm+' 학생의 레벨을 '+lv+'(으)로 바꿨습니다.'+(Array.isArray(b.grammatik)?' GRAMMATIK 탭은 그대로 있습니다.':'')+' 반영까지 1~2분 걸립니다.';
   }
   cur.level=b.level; if(!isZ(b.level)){delete cur.exam;delete b.exam;}
   changes.push({path:'data/'+s.fid+'.bin',bytes:await encryptBundle(withPad(b),cur.password,s.fid)});
  }else{
   cur.level=lv; if(!isZ(lv)) delete cur.exam; msg=nm+' 학생의 레벨을 '+lv+'(으)로 바꿨습니다. 반영까지 1~2분 걸립니다.';
  }
  changes.push({path:'data/'+S.sid+'.bin',bytes:await encryptBundle(withPad(fresh),S.pw,S.sid)});
  await commitChanges(changes,'데이터 갱신');
  A=fresh; if(b) st[s.fid]={state:'ok',sum:summarize(b)};
  say(msg);
 }catch(e){say(msgOf(e),true);}
 finally{busy(false);renderTable();}
}
async function changeExam(s,ex){
 if(working) return;
 if(!needToken()){renderTable();return;}
 busy(true);
 try{
  say('저장소 상태를 확인하고 있습니다.');
  var fresh=await adminFresh(), cur=fresh.students.filter(function(x){return x.fid===s.fid;})[0];
  if(!cur) throw new Error('명단에서 이미 빠져 있습니다. 새로 불러오기를 눌러 확인하십시오.');
  var changes=[], nm=cur.name, b=null;
  if(ex) cur.exam=ex; else delete cur.exam;
  if(cur.password){ /* 학생 파일에도 시험 종류를 기록합니다 */
   var buf=await fetchFile(s.fid);
   try{b=await H().decryptBundle(buf,cur.password,s.fid);}catch(e){throw new Error('저장된 비밀번호로 학생 파일을 열지 못했습니다. 비밀번호를 다시 연결하십시오.');}
   nm=b.name; if(ex) b.exam=ex; else delete b.exam;
   changes.push({path:'data/'+s.fid+'.bin',bytes:await encryptBundle(withPad(b),cur.password,s.fid)});
  }
  changes.push({path:'data/'+S.sid+'.bin',bytes:await encryptBundle(withPad(fresh),S.pw,S.sid)});
  await commitChanges(changes,'데이터 갱신');
  A=fresh; if(b) st[s.fid]={state:'ok',sum:summarize(b)};
  say(nm+' 학생의 시험 종류를 '+(ex||'미정')+'(으)로 바꿨습니다. 반영까지 1~2분 걸립니다.');
 }catch(e){say(msgOf(e),true);}
 finally{busy(false);renderTable();}
}
async function removeStudent(s){
 if(working||!needToken()) return;
 var nm=(st[s.fid]&&st[s.fid].sum&&st[s.fid].sum.name)||s.name;
 if(!window.confirm(nm+' 학생을 뺍니다.\n학생 파일이 지워져 이 학생은 더 이상 로그인할 수 없고, 리포트는 이 화면에서 볼 수 없게 됩니다(GitHub 이력에는 암호화된 채로 남습니다).\n계속하시겠습니까?')) return;
 busy(true); $('#aout').innerHTML='';
 try{
  say('저장소 상태를 확인하고 있습니다.');
  var files=await listData(), has=files.some(function(f){return f.name===s.fid+'.bin';});
  var fresh=await adminFresh(), pos=-1, i;
  for(i=0;i<fresh.students.length;i++) if(fresh.students[i].fid===s.fid) pos=i;
  if(pos<0) throw new Error('명단에서 이미 빠져 있습니다. 새로 불러오기를 눌러 확인하십시오.');
  fresh.students.splice(pos,1);
  var changes=[];
  if(has){changes.push({path:'data/'+s.fid+'.bin',bytes:randBytes(decoySize())});fresh.decoys.push(s.fid);}
  changes.push({path:'data/'+S.sid+'.bin',bytes:await encryptBundle(withPad(fresh),S.pw,S.sid)});
  await commitChanges(changes,'데이터 갱신');
  A=fresh; delete st[s.fid]; delete shown[s.fid];
  say(nm+' 학생을 뺐습니다. 반영까지 1~2분 걸립니다.');
 }catch(e){say(msgOf(e),true);}
 finally{busy(false);renderTable();}
}

window.HAAdmin={open:open,close:close};
})();
