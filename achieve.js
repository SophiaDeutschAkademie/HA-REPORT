/* HA-REPORT 성취 평가
   - 학생 화면 위쪽의 "레벨 도달 예상": 등록된 과제 기록과 최근 흐름으로 각 레벨에 도달하는 때를 계산합니다.
   - "성취 평가" 탭: 학생이 과제 이행률, 정답률, 추가 자습, 단어 암기를 바꿔 가며 직접 계산합니다.
   계산은 모두 이 브라우저 안에서 하고, 어떤 값도 밖으로 보내지 않습니다.

   한 레벨에 도달했다고 보는 기준(수료 기준)은 세 가지를 모두 채운 때입니다.
   1) 과제: 그 과정에서 얻은 과제 점수(이행률 × 정답률)의 합이 과정 과제 전체의 64% 이상
   2) 필수 단어: 외운 단어와 수업·과제에서 익힌 단어의 합이 시험용 단어 누계(A2 1,571 · B1 3,132 · B2 4,146) 이상
   3) 학습 시간: 레벨마다 정한 최소 학습 시간 이상
   추가 자습은 과제 점수가 쌓이는 빠르기에 곱합니다(1 + 추가 자습 ÷ 과제의 80%를 내는 학생의 한 주 수업·과제 시간).
   한 주에 쌓이는 점수는 한 챕터 분량까지입니다. */
(function(){
'use strict';
var C={"wpm":4.333333333333333,"gramMonths":2.0,"gramClassH":21.3333,"gramHwH":41.3472,"gramSessions":16,"classMin":140,"a1":{"need":168.0,"g":0.3403,"c":1.0},"saving":0.5,"rho":2.5,"tau":2.0,"crit":{"theta":0.64,"hRef":0.8,"sRef":0.8,"mulRef":0.75},"levels":[{"name":"A2","hw":338.4,"ch":16,"need":168.0,"g":0.3403,"c":0.9242,"vt":1571,"minRatio":0.5952,"tRef":410.72},{"name":"B1","hw":355.4,"ch":20,"need":264.0,"g":0.3369,"c":0.692,"vt":3132,"minRatio":0.5778,"tRef":424.32},{"name":"B2","hw":359.2,"ch":20,"need":240.0,"g":0.3566,"c":0.375,"vt":4146,"minRatio":0.7143,"tRef":427.36}]};
var LV=C.levels, GW=C.gramMonths*C.wpm, DG=C.gramClassH+C.gramHwH, TH=C.crit.theta, EPS=1e-9;
var NAMES=['A2','B1','B2'], REG=['A2','B1','B2'], BASE=['grammar','vocab','reading','listening','satz','writing'];
var WIN=8;            /* 최근 흐름을 보는 기간(주) */
var W_DEF=70;         /* 단어 암기 기본값(주) */
var DAY=86400000, CAPY=10;
var NOW=null;         /* 시험용: 오늘 날짜를 고정할 때만 씁니다 */

/* ---------- 계산 ---------- */
/* 문법 과정의 부스터와 학습 시간의 범위(누계): 최소, 기준 */
function reqs(h,e){
 var done=C.gramClassH+h*C.gramHwH+e/60*GW, m=Math.min(1,done/DG), surplus=Math.max(0,done-DG);
 var k=C.saving*m, redA1=C.a1.need*C.a1.g*C.a1.c*k;
 var red=[redA1+LV[0].need*LV[0].g*LV[0].c*k, LV[1].need*LV[1].g*LV[1].c*k, LV[2].need*LV[2].g*LV[2].c*k];
 var base=[C.a1.need+LV[0].need, LV[1].need, LV[2].need], ref=[], mn=[], acc=0, i;
 for(i=0;i<3;i++){acc+=base[i]-red[i];ref.push(acc*C.crit.mulRef);mn.push(acc*C.crit.mulRef*LV[i].minRatio);}
 return {m:m,surplus:surplus,ref:ref,min:mn};
}
/* 과정 i에서 한 주에 쌓이는 과제 점수(챕터 단위): 과제 점수 × 자습을 반영한 빠르기, 한 주에 한 챕터까지 */
function pace(h,s,e,i){var k=1+e/LV[i].tRef, raw=h*s*k;return {k:k,r:Math.min(1,raw),cap:raw>=1-EPS};}
/* 지금 위치에서 B2까지. pos = {start:'G'|0|1|2, g0:문법 과정에서 지난 주 수, W:지금 과정에서 지난 주 수, P0:지금 과정에서 얻은 과제 점수}
   'G'와 0(A2)은 문법 과정을 지금 값대로 마친 상태에서 시작합니다. 1(B1)과 2(B2)는 그 과정에 들어올 때
   이전 레벨의 필수 단어와 최소 학습 시간을 채운 상태에서 시작합니다(값을 바꿔도 지난 과정은 달라지지 않습니다).
   지금 과정의 과제 기준은 등록된 과제 점수(P0)에서 이어서 세고, 그 뒤 과정은 처음부터 셉니다. t는 지금부터 센 주 수입니다. */
function project(pos,h,s,e,w){
 var R=reqs(h,e), vt=w*C.tau/60, cwg=(C.gramClassH+h*C.gramHwH)/GW+e/60;
 var st, out=[], first=pos.start==='G'?0:pos.start, i;
 if(first===0) st={H:vt*GW+R.surplus,V:w*GW,U:C.rho*cwg*GW};
 else st={H:R.min[first-1],V:LV[first-1].vt,U:0};
 st.t=pos.start==='G'?Math.max(0,GW-(pos.g0||0)):-(pos.W||0);
 for(i=first;i<3;i++){
  var L=LV[i], cw=(C.classMin+h*L.hw+e)/60, rH=cw+vt, rV=w+C.rho*cw, pc=pace(h,s,e,i), rP=pc.r;
  var cur=(i===first&&pos.start!=='G'), W=cur?(pos.W||0):0, P0=cur?(pos.P0||0):0, need=TH*L.ch-P0;
  var dP=need<=EPS?W:(rP>0?W+need/rP:Infinity);
  var nv=L.vt-st.V-st.U, dV=nv<=EPS?0:(rV>0?nv/rV:Infinity);
  var nh=R.min[i]-st.H, dH=nh<=EPS?0:nh/rH;
  var d=Math.max(dP,dV,dH);
  if(!isFinite(d)){out.push({i:i,ok:false,gate:dP===Infinity?'p':'v',rate:rP,k:pc.k,cap:pc.cap});break;}
  var t0=st.t; st.H+=rH*d; st.V+=w*d; st.U+=C.rho*cw*d; st.t+=d;
  out.push({i:i,ok:true,t:Math.max(0,st.t),t0:t0,d:d,W:W,P0:P0,target:TH*L.ch,rate:rP,k:pc.k,cap:pc.cap,
   gate:(dP>=dV&&dP>=dH)?'p':(dV>=dH?'v':'h'),H:st.H,V:st.V,U:st.U,min:R.min[i]});
 }
 return {R:R,first:first,lv:out};
}

/* ---------- 기록 읽기 ---------- */
function today0(){var t=NOW!=null?new Date(NOW):new Date();return Date.UTC(t.getFullYear(),t.getMonth(),t.getDate());}
function parseD(s){var m=/^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(s||'').trim());return m?Date.UTC(+m[1],+m[2]-1,+m[3]):null;}
function num(v){return (typeof v==='number'&&isFinite(v))?v:((typeof v==='string'&&v.trim()!==''&&isFinite(+v))?+v:null);}
/* 과제 하나: 낸 영역의 비율(done)과 낸 영역의 평균 점수(acc). 영역을 빼고 낸 과제는 낸 영역만큼만 셉니다 */
function hwScore(e){
 var sum=0, got=0;
 BASE.forEach(function(k){var v=num(e&&e.scores?e.scores[k]:null); if(v!=null){sum+=Math.max(0,Math.min(100,v));got++;}});
 return got?{done:got/BASE.length,acc:sum/(got*100)}:null;
}
function weeksSince(first,now){return Math.floor(Math.max(0,now-first)/(7*DAY))+1;}
/* 학생 기록에서 지금 위치와 최근 흐름을 구합니다 */
function analyze(d){
 var now=today0(), o={kind:'none',cur:null,pos:null,h:null,s:null,subs:0,few:false};
 if(!d||d.role==='admin') return o;
 function lvOf(x){return x.level||d.level;}
 var subs=[], seen={};
 (d.exams||[]).forEach(function(e){
  var L=lvOf(e); if(REG.indexOf(L)<0) return;
  var sc=hwScore(e), t=parseD(e.date); if(t!=null&&t>now) t=now;
  seen[L+'#'+e.n]=1; subs.push({L:REG.indexOf(L),t:t,done:sc?sc.done:1,acc:sc?sc.acc:null});
 });
 /* 점수 기록 없이 리포트만 있는 과제도 낸 과제로 셉니다 */
 (d.reports||[]).forEach(function(r){
  var L=lvOf(r); if(REG.indexOf(L)<0||seen[L+'#'+r.n]) return;
  var t=parseD(r.date); if(t!=null&&t>now) t=now;
  seen[L+'#'+r.n]=1; subs.push({L:REG.indexOf(L),t:t,done:1,acc:null});
 });
 var scored=subs.filter(function(x){return x.acc!=null;});
 var accAll=scored.length?scored.reduce(function(p,x){return p+x.done*x.acc;},0)/scored.reduce(function(p,x){return p+x.done;},0):null;
 var dated=subs.filter(function(x){return x.t!=null;});
 var first=dated.length?Math.min.apply(null,dated.map(function(x){return x.t;})):null;
 var span=first!=null?weeksSince(first,now):0, Wn=Math.min(WIN,span), from=now-(Wn*7-1)*DAY;
 var recent=dated.filter(function(x){return x.t>=from;});
 var base=REG.indexOf(d.level==='A1'?'A2':d.level), rmax=recent.length?Math.max.apply(null,recent.map(function(x){return x.L;})):-1;
 var gramRec=Array.isArray(d.grammatik)&&d.grammatik.length>0;
 /* 지금 듣는 과정: 기본 레벨이 A2·B1·B2이면 그 과정(최근 과제가 더 높은 레벨이면 그 레벨).
    기본 레벨이 그 밖(ZERTIFIKAT, SNU, GRAMMATIK)이면 최근에 낸 정규 과정 과제가 있을 때만 그 과정.
    정규 과정 과제가 하나도 없고 문법 과제만 있으면 문법 과정으로 봅니다 */
 var cur=base>=0?((!subs.length&&gramRec)?null:Math.max(base,rmax)):(rmax>=0?rmax:null);
 var asGram=cur==null&&(base>=0?(!subs.length&&gramRec):d.level==='GRAMMATIK');

 if(cur!=null){
  var mine=subs.filter(function(x){return x.L===cur;}), md=mine.filter(function(x){return x.t!=null;});
  var P0=mine.reduce(function(p,x){return p+x.done*(x.acc!=null?x.acc:(accAll!=null?accAll:0));},0);
  var W=md.length?weeksSince(Math.min.apply(null,md.map(function(x){return x.t;})),now):0;
  /* HA-REPORT에 올리기 전에 낸 과제(set-prior로 적어 둔 횟수)는 한 주에 하나씩 낸 것으로 보고 더합니다 */
  var pr=(d.prior&&typeof d.prior==='object')?d.prior[REG[cur]]:null, pn=pr?num(pr.n):null, ps=pr?num(pr.score):null;
  pn=(pn!=null&&pn>0)?Math.floor(pn):0;
  if(pn){P0+=pn*(ps!=null?Math.max(0,Math.min(100,ps))/100:(accAll!=null?accAll:C.crit.sRef)); W+=pn;}
  o.kind='reg'; o.cur=cur; o.pos={start:cur,W:W,P0:P0}; o.subs=subs.length; o.inLevel=mine.length; o.prior=pn; o.target=TH*LV[cur].ch;
  if(dated.length&&accAll!=null){
   var dn=recent.reduce(function(p,x){return p+x.done;},0), rs=recent.filter(function(x){return x.acc!=null;});
   var sRec=rs.length?rs.reduce(function(p,x){return p+x.done*x.acc;},0)/rs.reduce(function(p,x){return p+x.done;},0):accAll;
   o.h=Math.min(1,dn/Wn); o.s=sRec; o.win={weeks:Wn,n:recent.length,full:span>=WIN};
   o.few=subs.length<4;
  }
  return o;
 }
 /* 문법 과정 학생: 문법 과제 기록(회차, 정답률)으로 봅니다 */
 if(asGram){
  var G=(d.grammatik||[]).filter(function(x){return x&&num(x.n)!=null;}), N=C.gramSessions;
  var maxN=G.length?Math.min(N,Math.max.apply(null,G.map(function(x){return +x.n;}))):0;
  var gd=G.map(function(x){return parseD(x.date);}).filter(function(x){return x!=null;});
  var byDate=gd.length?Math.min(N,Math.floor(Math.max(0,now-Math.min.apply(null,gd))/(3.5*DAY))+1):0;
  var due=Math.max(maxN,byDate), rates=G.map(function(x){return num(x.rate);}).filter(function(x){return x!=null;});
  o.kind='gram'; o.cur='G'; o.pos={start:'G',g0:GW*Math.min(1,due/N)}; o.subs=G.length; o.gram={n:G.length,due:due,total:N};
  if(G.length&&due>0&&rates.length){
   o.h=Math.min(1,G.length/due);
   o.s=Math.max(0,Math.min(100,rates.reduce(function(p,c){return p+c;},0)/rates.length))/100;
   o.few=G.length<4;
  }
  return o;
 }
 return o;
}

/* ---------- 표시 ---------- */
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function pct(x){return Math.round(x*100);}
function ymText(weeks){
 if(weeks==null||!isFinite(weeks)) return '—';
 if(weeks*7/365.25>CAPY) return CAPY+'년 이상';
 var d=new Date(today0()+Math.round(weeks*7)*DAY);
 return d.getUTCFullYear()+'년 '+(d.getUTCMonth()+1)+'월';
}
function afterText(weeks){
 if(weeks==null||!isFinite(weeks)) return '';
 if(weeks*7/365.25>CAPY) return '';
 if(weeks<=1e-6) return '지금';
 if(weeks<1) return '1주 안';
 return spanText(weeks)+' 뒤';
}
/* 기간을 말로: 한 달이 안 되면 주, 두 해가 안 되면 개월, 그보다 길면 년과 개월 */
function spanText(weeks){
 var m=weeks*7/30.44, y, r;
 if(m<1) return '약 '+Math.max(1,Math.round(weeks))+'주';
 if(Math.round(m)<24) return '약 '+Math.round(m)+'개월';
 y=Math.floor(Math.round(m)/12); r=Math.round(m)-12*y;
 return '약 '+y+'년'+(r?' '+r+'개월':'');
}
function levelName(c){return c==='G'?'문법 과정':NAMES[c]+' 과정';}
var GATE={p:'과제 기준',v:'필수 단어',h:'최소 학습 시간'};

var CSS='.ach-lv{display:grid;gap:10px;grid-template-columns:repeat(3,1fr)}.ach-lv.n2{grid-template-columns:repeat(2,1fr)}.ach-lv.n1{grid-template-columns:1fr}'
+'.ach-t{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:#fff;min-width:0}'
+'.ach-t.cur{border-color:var(--acc);background:#f1f6f3}'
+'.ach-t .k{font-size:13px;font-weight:700;color:var(--mute);line-height:1.4}.ach-t.cur .k{color:#2f5a47}'
+'.ach-t .v{font-size:20px;font-weight:700;line-height:1.35;white-space:nowrap}'
+'.ach-t .s{font-size:12.5px;color:var(--mute);line-height:1.5}'
+'.ach-top{padding:16px}.ach-top .rhead{margin-bottom:10px}.ach-top h2{margin:0}.ach-top .note{margin-top:8px}'
+'.ach-pos{margin:0 0 14px;font-size:14.5px}.ach-pos b{color:#2f5a47}'
+'.ach-bar{height:6px;border-radius:3px;background:var(--line);overflow:hidden;margin:8px 0 0;max-width:320px}.ach-bar i{display:block;height:100%;background:var(--acc);border-radius:3px}'
+'.ach-ctl{display:grid;grid-template-columns:1fr 1fr;gap:18px 28px;margin:20px 0 6px}'
+'.ach-ctl label{display:block;min-width:0}'
+'.ach-ctl .hd{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-weight:600;font-size:14.5px}'
+'.ach-ctl output{color:#2f5a47;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}'
+'.ach-ctl input[type=range]{display:block;width:100%;height:30px;margin:2px 0 0;accent-color:var(--acc);cursor:pointer}'
+'.ach-ctl small{display:block;color:var(--mute);font-size:12.5px;line-height:1.5}'
+'#ach-res{position:sticky;top:0;z-index:2;background:var(--card);padding:8px 0 10px;margin:-8px 0 0;border-bottom:1px solid var(--line)}'
+'.ach-why{margin:10px 0 0;font-size:14px}'
+'.ach-act{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}'
+'.ach-st{margin:0 0 14px}.ach-st .tabs{margin:6px 0 0}'
+'details.ach-d{margin:14px 0}details.ach-d summary{cursor:pointer;font-weight:700;font-size:15px;list-style-position:inside}'
+'details.ach-d ul{margin:10px 0 0;padding-left:20px}details.ach-d li{margin:4px 0;font-size:14px}'
+'@media (max-width:560px){.ach-ctl{grid-template-columns:1fr;gap:14px}'
+'.ach-lv,.ach-lv.n2{grid-template-columns:1fr;gap:6px}'
+'.ach-t{display:grid;grid-template-columns:2.6em 1fr auto;align-items:baseline;column-gap:10px;padding:9px 12px}'
+'.ach-t .v{font-size:16px}.ach-t .s{text-align:right;font-size:12px}}';
function injectStyle(){
 if(document.getElementById('ach-css')) return;
 var s=document.createElement('style'); s.id='ach-css'; s.textContent=CSS; document.head.appendChild(s);
}
/* 레벨별 도달 시점 칸 */
function tilesHtml(P,cur){
 var lv=P.lv, n=3-P.first, h='<div class="ach-lv n'+n+'">', i;
 for(i=P.first;i<3;i++){
  var x=lv[i-P.first], here=(cur!=='G'&&i===cur), v, s;
  if(!x||!x.ok){v='—';s='';}
  else if(x.t<=1e-6){v='기준 충족';s='지금';}
  else{v=ymText(x.t);s=afterText(x.t);}
  h+='<div class="ach-t'+(here?' cur':'')+'"><div class="k">'+NAMES[i]+'</div><div class="v">'+esc(v)+'</div><div class="s">'+esc(s)+'</div></div>';
 }
 return h+'</div>';
}
/* 기록에서 가져온 값(슬라이더와 같은 단위) */
function mine(A){return {h:pct(A.h),s:pct(A.s),e:0,w:W_DEF};}
function run(pos,v){return project(pos,v.h/100,v.s/100,v.e,v.w);}

/* 학생 화면 위쪽: 레벨 도달 예상 */
function topHtml(d){
 var A=analyze(d);
 if(A.kind==='none') return '';
 /* 기본 레벨이 정규 과정이 아닌 학생(ZERTIFIKAT, SNU)은 최근에 낸 정규 과정 과제가 있을 때만 analyze가 위치를 줍니다 */
 injectStyle();
 var head='<section class="card ach-top" id="ach-top" aria-label="레벨 도달 예상"><div class="rhead"><h2>레벨 도달 예상</h2><button type="button" class="btn" id="ach-go">직접 계산해 보기</button></div>';
 if(A.h==null||A.s==null){
  return head+'<p class="note" style="margin-top:0">'+(A.kind==='gram'?'문법 과정 과제의 정답률이 등록되면':'과제 기록이 등록되면')+' 그 기록으로 각 레벨에 도달하는 때를 계산해 여기에 보여 드립니다. 지금은 "성취 평가"에서 값을 넣어 직접 계산해 볼 수 있습니다.</p></section>';
 }
 var v=mine(A), P=run(A.pos,v), h=head, basis, alt=null, vw={h:100,s:v.s,e:0,w:v.w}, Pw=run(A.pos,vw);
 if(A.kind==='gram') basis='문법 과정 과제를 '+A.gram.due+'회 가운데 '+A.gram.n+'회 냈고(이행률 '+v.h+'%) 평균 정답률은 '+v.s+'%입니다. 정규 과정에서도 이 흐름이 이어지고 단어를 주 '+v.w+'개 외울 때의 예상입니다.';
 else basis=(A.win.full?'최근 '+A.win.weeks+'주 동안':'첫 과제를 낸 뒤 '+A.win.weeks+'주 동안')+' 과제를 '+A.win.n+'회 냈고(이행률 '+v.h+'%) 평균 점수는 '+v.s+'%입니다. 이 흐름이 이어지고 단어를 주 '+v.w+'개 외울 때의 예상입니다.';
 if(v.h<=0||v.s<=0||!P.lv.length||!P.lv[0].ok){
  var okw=v.s>0&&Pw.lv.length&&Pw.lv[0].ok;
  h+='<p class="note" style="margin:0 0 10px">'+((A.kind!=='gram'&&v.h<=0)?'최근 '+A.win.weeks+'주 동안 낸 과제가 없어 ':'')+'지금 흐름으로는 도달 시점이 나오지 않습니다.'
   +(okw?' 과제를 매주 내고 평균 점수 '+v.s+'%를 유지하며 단어를 주 '+v.w+'개 외우면 아래와 같습니다.':'')+'</p>';
  if(okw) h+=tilesHtml(Pw,A.cur);
  return h+'</section>';
 }
 h+=tilesHtml(P,A.cur)+'<p class="note">'+basis+'</p>';
 /* 과제를 매주 내면 지금 과정이 얼마나 빨라지는지 */
 if(v.h<95&&Pw.lv.length&&Pw.lv[0].ok){
  var gain=P.lv[0].t-Pw.lv[0].t;
  if(gain>=3&&P.lv[0].t*7/365.25<=CAPY) alt='과제를 매주 내면 '+NAMES[P.first]+' 도달이 '+spanText(gain)+' 빨라집니다.';
 }
 if(P.lv[0].t<=1e-6&&A.kind==='reg') alt=NAMES[P.first]+' 과정은 계산 기준을 채웠습니다.'+(P.first<2?' 다음 과정으로 올라가는 때는 선생님이 정합니다.':'');
 if(A.few) alt=(alt?alt+' ':'')+'과제 기록이 '+A.subs+'회뿐이어서 기록이 쌓이면 예상이 달라질 수 있습니다.';
 if(alt) h+='<p class="note">'+alt+'</p>';
 return h+'</section>';
}

/* "성취 평가" 탭 */
var state=null;   /* {v:{h,s,e,w}, start:고른 시작 과정} */
var START=[['G','문법 과정'],[0,'A2 과정'],[1,'B1 과정'],[2,'B2 과정']];
function reset(){state=null;}
function render(pane,d){
 injectStyle();
 var A=analyze(d), has=(A.h!=null&&A.s!=null), def=has?mine(A):{h:80,s:80,e:0,w:W_DEF};
 if(!state) state={v:{h:def.h,s:def.s,e:def.e,w:def.w},start:0};
 var v=state.v, h='<section class="card"><h2>성취 평가</h2><p class="sub">과제, 자습, 단어 암기를 바꾸면 각 레벨에 도달하는 때가 어떻게 달라지는지 계산합니다.</p>';
 if(A.kind==='reg'){
  var p=Math.min(1,A.pos.P0/A.target);
  var cnt=A.inLevel&&A.prior?'등록된 '+NAMES[A.cur]+' 과제 '+A.inLevel+'회와 그 전에 낸 '+A.prior+'회로':A.inLevel?'등록된 '+NAMES[A.cur]+' 과제 '+A.inLevel+'회로':A.prior?'그 전에 낸 '+NAMES[A.cur]+' 과제 '+A.prior+'회로':'';
  h+='<div class="ach-pos"><b>현재 '+levelName(A.cur)+'</b> · '+(cnt?cnt+' 과제 기준의 '+pct(p)+'%를 채웠습니다.':'등록된 '+NAMES[A.cur]+' 과제가 아직 없어 과정을 지금 시작하는 것으로 계산합니다.')
   +(cnt?'<div class="ach-bar" role="img" aria-label="과제 기준 '+pct(p)+'%"><i style="width:'+pct(p)+'%"></i></div>':'')+'</div>';
 }else if(A.kind==='gram'){
  h+='<div class="ach-pos"><b>현재 문법 과정</b> · '+(A.gram.due?'16회 가운데 '+A.gram.due+'회까지 진행한 것으로 계산합니다.':'과정을 지금 시작하는 것으로 계산합니다.')+'</div>';
 }else{
  h+='<div class="ach-st"><b>어느 과정부터 계산할지 고르십시오.</b><div class="tabs" id="ach-st" role="group" aria-label="시작 과정">';
  START.forEach(function(s,i){h+='<button type="button" class="tab" data-i="'+i+'" aria-selected="'+(i===state.start)+'">'+s[1]+'</button>';});
  h+='</div></div>';
 }
 h+='<div id="ach-res" aria-live="polite"></div>';
 h+='<div class="ach-ctl">'
  +'<label for="ach-h"><span class="hd"><span>과제 이행률</span><output id="ach-ho" for="ach-h"></output></span><input type="range" id="ach-h" min="0" max="100" step="1" value="'+v.h+'"><small>매주 나오는 과제 가운데 내는 비율입니다.</small></label>'
  +'<label for="ach-s"><span class="hd"><span>과제 정답률</span><output id="ach-so" for="ach-s"></output></span><input type="range" id="ach-s" min="0" max="100" step="1" value="'+v.s+'"><small>낸 과제의 평균 점수입니다.</small></label>'
  +'<label for="ach-e"><span class="hd"><span>추가 자습 (주)</span><output id="ach-eo" for="ach-e"></output></span><input type="range" id="ach-e" min="0" max="600" step="15" value="'+v.e+'"><small>수업, 과제, 단어 암기 밖에서 하는 듣기, 읽기, 복습 시간입니다.</small></label>'
  +'<label for="ach-w"><span class="hd"><span>단어 암기 (주)</span><output id="ach-wo" for="ach-w"></output></span><input type="range" id="ach-w" min="0" max="490" step="7" value="'+v.w+'"><small>Vokalab에서 한 주에 외우는 단어 수입니다.</small></label>'
  +'</div>';
 h+='<div class="ach-act"><button type="button" class="btn" id="ach-rs">'+(has?'내 기록 값으로':'처음 값으로')+'</button></div>';
 h+='<p class="note" style="margin-top:14px">'+(has?(A.kind==='gram'?'처음 값은 문법 과정 과제 기록(이행률 '+def.h+'%, 평균 정답률 '+def.s+'%)에서 가져왔습니다.':'처음 값은 '+(A.win.full?'최근 '+A.win.weeks+'주':'첫 과제를 낸 뒤 '+A.win.weeks+'주')+'의 과제 기록(과제 '+A.win.n+'회, 이행률 '+def.h+'%, 평균 점수 '+def.s+'%)에서 가져왔습니다.')+' 단어 암기는 주 '+W_DEF+'개, 추가 자습은 0분으로 두었습니다.':'처음 값은 과제의 80%를 내고 80%를 맞히는 경우입니다.')+' 학습량으로 계산한 예상이고, 같은 학습량으로도 결과는 사람마다 다릅니다.</p>';
 h+='</section>';
 h+='<details class="card ach-d"><summary>계산 기준</summary><ul>'
  +'<li>한 레벨에 도달했다고 보는 때는 아래 세 가지를 모두 채운 때입니다.</li>'
  +'<li><b>과제.</b> 그 과정에서 얻은 과제 점수(이행률 × 정답률)의 합이 과정 과제 전체의 '+pct(TH)+'% 이상입니다. 과제의 80%를 내고 80%를 맞히면 과정을 한 번 들은 때 채웁니다(A2 '+LV[0].ch+'주, B1 '+LV[1].ch+'주, B2 '+LV[2].ch+'주). 점수가 더 높으면 과정 중간에 채우고, 낮으면 과정을 더 들어야 합니다. 영역을 빼고 낸 과제는 낸 영역만큼만 셉니다.</li>'
  +'<li><b>필수 단어.</b> 외운 단어와 수업·과제에서 익힌 단어를 더한 수가 시험용 단어 누계 이상입니다. A2 '+LV[0].vt.toLocaleString('ko-KR')+'개, B1 '+LV[1].vt.toLocaleString('ko-KR')+'개, B2 '+LV[2].vt.toLocaleString('ko-KR')+'개입니다.</li>'
  +'<li><b>학습 시간.</b> 수업, 과제, 단어 암기, 자습 시간을 더한 값이 레벨마다 정한 최소 학습 시간 이상입니다.</li>'
  +'<li><b>추가 자습.</b> 자습을 하면 과제 점수가 그만큼 빨리 쌓이는 것으로 계산합니다. 한 주에 쌓이는 점수는 한 챕터 분량까지여서, 가장 빠른 도달은 과정의 '+pct(TH)+'% 지점입니다.</li>'
  +'<li><b>시작 위치.</b> B1, B2 과정은 그 과정에 들어올 때 이전 레벨의 필수 단어와 최소 학습 시간을 채운 것으로 봅니다. 지금 과정에서는 등록된 과제의 점수를 그대로 셉니다.</li>'
  +'<li>수업은 주 1회 80분과 독해 강의 주 1회 60분, 문법 과정은 2개월(주 2회)로 계산합니다. 쉬는 주는 넣지 않았습니다.</li>'
  +'</ul></details>';
 pane.innerHTML=h;
 function q(id){return pane.querySelector('#'+id);}
 function pos(){return A.pos||{start:START[state.start][0],g0:0,W:0,P0:0};}
 function draw(){
  v.h=+q('ach-h').value; v.s=+q('ach-s').value; v.e=+q('ach-e').value; v.w=+q('ach-w').value;
  q('ach-ho').textContent=v.h+'%'; q('ach-so').textContent=v.s+'%'; q('ach-eo').textContent=v.e+'분';
  q('ach-wo').textContent=v.w+'개'+(v.w>0?' (하루 '+Math.round(v.w/7)+'개)':'');
  var ps=pos(), P=run(ps,v), cur=A.cur!=null?A.cur:ps.start, why='', g={p:[],v:[],h:[]}, bad=false, cap=false;
  P.lv.forEach(function(x){if(!x.ok){bad=true;return;} if(x.t>1e-6) g[x.gate].push(NAMES[x.i]); if(x.cap&&v.e>0&&x.gate==='p'&&x.t>1e-6) cap=true;});
  if(bad||!P.lv.length) why='과제 점수가 0이면 도달 시점이 나오지 않습니다. 과제 이행률과 정답률을 올려 보십시오.';
  else{
   var parts=[], lastK=null; ['p','v','h'].forEach(function(k){if(g[k].length){parts.push(g[k].join('·')+(g[k][g[k].length-1]==='B1'?'은 ':'는 ')+GATE[k]);lastK=k;}});
   if(parts.length) why=parts.join(', ')+(lastK==='v'?'가':'이')+' 가장 늦게 채워집니다.';
   if(g.v.length) why+=' 단어 암기를 늘리면 '+g.v.join('·')+' 도달이 빨라집니다.';
   if(g.h.length) why+=' 추가 자습이나 단어 암기를 늘리면 '+g.h.join('·')+' 도달이 빨라집니다.';
   if(cap) why+=' 한 주에 쌓이는 과제 점수가 한 챕터 분량에 닿은 과정은 자습을 더 늘려도 빨라지지 않습니다.';
  }
  q('ach-res').innerHTML=tilesHtml(P,cur)+(why?'<p class="ach-why">'+esc(why)+'</p>':'');
 }
 ['ach-h','ach-s','ach-e','ach-w'].forEach(function(id){q(id).addEventListener('input',draw);q(id).addEventListener('change',draw);});
 q('ach-rs').addEventListener('click',function(){q('ach-h').value=def.h;q('ach-s').value=def.s;q('ach-e').value=def.e;q('ach-w').value=def.w;draw();});
 var stb=q('ach-st');
 if(stb) stb.addEventListener('click',function(e){
  var b=e.target.closest('.tab'); if(!b) return;
  state.start=+b.dataset.i; stb.querySelectorAll('.tab').forEach(function(x){x.setAttribute('aria-selected',x===b?'true':'false');}); draw();
 });
 draw();
}

window.HAAchieve={topHtml:topHtml,render:render,reset:reset,analyze:analyze,project:project,reqs:reqs,pace:pace,C:C,_setNow:function(t){NOW=t;}};
})();
