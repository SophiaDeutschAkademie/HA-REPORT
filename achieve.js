/* HA-REPORT 성취 평가
   - 학생 화면 위쪽의 "레벨 도달 예상": 등록된 과제 기록과 VOKA 리포트(단어 암기 기록), 최근 흐름으로 각 레벨에 도달하는 때를 계산합니다.
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
var INC=[LV[0].vt,LV[1].vt-LV[0].vt,LV[2].vt-LV[1].vt];   /* 레벨별 필수 단어 수: A2 1,571 · B1 1,561 · B2 1,014 */
var WIN=8;            /* 최근 흐름을 보는 기간(주) */
var W_DEF=70;         /* VOKA 기록이 없을 때의 단어 암기 값(주) */
var W_MAX=490;        /* 단어 암기 값의 위쪽 끝(하루 70개) */
var W_TOP=700;        /* Vokalab에서 정할 수 있는 주간 목표의 위쪽 끝(하루 100개). 기록에서 구한 값은 여기까지 씁니다 */
var CUM_Y=700;        /* 리포트의 "x / y"에서 y가 이보다 크면 주차 단어 수가 아니라 누계로 봅니다 */
var DAY=86400000, CAPY=10;
var NOW=null;         /* 시험용: 오늘 날짜를 고정할 때만 씁니다 */
var VC=(typeof WeakMap!=='undefined')?new WeakMap():null;   /* 읽은 VOKA 리포트의 단어 수 */

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
/* 지금까지 외운 단어(레벨마다 그 레벨의 필수 단어 수까지 인정)와 그 암기에 쓴 시간 */
function knownWords(Vk,from){var t=0,j;for(j=from;j<3;j++)t+=Math.min(INC[j],Math.max(0,+Vk[j]||0));return t;}
function knownHours(Vk,from){return knownWords(Vk,from)*C.tau/60;}
/* 지금 위치에서 B2까지.
   pos = {start:'G'|0|1|2, g0:문법 과정에서 지난 주 수, W:지금 과정에서 지난 주 수, P0:지금 과정에서 얻은 과제 점수,
          Vk:[A1-A2, B1, B2 단어장에서 지금까지 외운 단어 수] 또는 없음}
   'G'와 0(A2)은 문법 과정을 지금 값대로 마친 상태에서 시작합니다. 1(B1)과 2(B2)는 그 과정에 들어올 때
   이전 레벨의 최소 학습 시간을 채운 상태에서 시작합니다(값을 바꿔도 지난 과정은 달라지지 않습니다).
   지금 과정의 과제 기준은 등록된 과제 점수(P0)에서 이어서 셉니다.
   외운 단어는 Vk가 있으면 세 단어장에서 외운 수를 그대로 셉니다. 지금 과정보다 낮은 단어장을 끝내지 않았으면
   남은 단어도 외워야 합니다(아래 단어장을 끝낸 학생의 Vk는 analyze가 그 단어장의 필수 단어 수로 채워서 줍니다).
   Vk가 없으면 B1·B2는 이전 레벨의 필수 단어를 채운 상태에서 시작하고, 지난 주에도 같은 속도(w)로 외운 것으로 봅니다.
   w는 앞으로 한 주에 외우는 단어 수, t는 지금부터 센 주 수입니다. */
function project(pos,h,s,e,w){
 var R=reqs(h,e), vt=w*C.tau/60, cwg=(C.gramClassH+h*C.gramHwH)/GW+e/60;
 var G=pos.start==='G', first=G?0:pos.start, out=[], i, st, Vk=pos.Vk||null;
 var W=G?0:(pos.W||0), rem=G?Math.max(0,GW-(pos.g0||0)):0, cw0=(C.classMin+h*LV[first].hw+e)/60;
 /* 지금(문법 과정 학생은 A2 과정을 시작하는 때)의 학습 시간 H, 외운 단어 V, 수업·과제에서 익힌 단어 U */
 if(first===0) st={H:R.surplus+cw0*W+(Vk?knownHours(Vk,0)+vt*rem:vt*(GW+W)),V:Vk?knownWords(Vk,0)+w*rem:w*(GW+W),U:C.rho*(cwg*GW+cw0*W)};
 else st={H:R.min[first-1]+cw0*W+(Vk?knownHours(Vk,first):vt*W),V:Vk?knownWords(Vk,0):LV[first-1].vt+w*W,U:C.rho*cw0*W};
 st.t=rem;
 for(i=first;i<3;i++){
  var L=LV[i], cw=(C.classMin+h*L.hw+e)/60, rH=cw+vt, rV=w+C.rho*cw, pc=pace(h,s,e,i), rP=pc.r;
  var cur=(i===first&&!G), P0=cur?(pos.P0||0):0, need=TH*L.ch-P0;
  var dP=need<=EPS?0:(rP>0?need/rP:Infinity);
  var nv=L.vt-st.V-st.U, dV=nv<=EPS?0:(rV>0?nv/rV:Infinity);
  var nh=R.min[i]-st.H, dH=nh<=EPS?0:nh/rH;
  var d=Math.max(dP,dV,dH);
  if(!isFinite(d)){out.push({i:i,ok:false,gate:dP===Infinity?'p':'v',rate:rP,k:pc.k,cap:pc.cap});break;}
  var t0=st.t; st.H+=rH*d; st.V+=w*d; st.U+=C.rho*cw*d; st.t+=d;
  out.push({i:i,ok:true,t:st.t,t0:t0,d:d+(cur?W:0),W:cur?W:0,P0:P0,target:TH*L.ch,rate:rP,k:pc.k,cap:pc.cap,
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
/* VOKA 주차 리포트 하나에서 학습 완료 단어 수를 읽습니다. VOKA 탭의 "학습 완료 단어" 그래프와 같은 자리를 같은 순서로 읽습니다:
   <details> 안의 <li>에서 <b>값</b>과 '학습됨 · 학습 완료 · 테스트를 통과한'으로 시작하는 이름.
   값은 "63 / 70"(그 주차 단어 가운데 학습을 끝낸 수) 또는 "90%"입니다. 거기서 단어 수가 나오지 않으면
   숫자 카드(.kpi)의 "74/74"와 본문의 "학습됨 : 63 / 70 단어" 꼴도 찾아봅니다 */
function vokaWords(r){
 /* 리포트 하나는 한 번만 읽습니다(로그인할 때와 "성취 평가"를 열 때 같은 기록을 다시 봅니다) */
 if(VC&&r&&typeof r==='object'&&VC.has(r)) return VC.get(r);
 var o=vokaParse(r); if(VC&&r&&typeof r==='object') VC.set(r,o); return o;
}
/* 리포트의 글자에서 주석, <style>, <title>을 뺀 것을 돌려줍니다. 글자 그대로 찾은 <details>가 브라우저가 읽은 <details>와
   같다고 볼 수 없는 리포트는 null을 돌려주고, 그런 리포트는 전체를 풀어서 읽습니다:
   - script · textarea처럼 안의 글자를 태그로 읽지 않는 요소, svg, 속성값 안의 "<", 끝나지 않은 주석
   - 표(<table>) 안에 놓인 <details> (브라우저가 자리를 옮겨서 읽을 수 있습니다)
   - 굵게(<b>) · 링크(<a>) 같은 글자 꾸밈이 닫히지 않은 채 다른 요소로 넘어가는 곳 (브라우저가 뒤쪽 내용에 그 꾸밈을 다시 씌웁니다) */
var RAWTAG=/^(script|textarea|template|xmp|plaintext|noscript|iframe|noembed|noframes|select|svg|math|frameset)$/;
var FMTTAG=/^(a|b|big|code|em|font|i|nobr|s|small|strike|strong|tt|u)$/;
var INLTAG=/^(span|br|img|wbr|sub|sup|mark|abbr|time|kbd|q|cite|var|samp|dfn|data|ruby|rt|rp|bdi|bdo|del|ins|label)$/;
/* 글자 꾸밈이 열려 있지 않을 때는 살펴볼 태그에서만 멈추고(KEYRE), 열려 있는 동안에는 모든 태그를 봅니다(ALLRE) */
var KEYRE=/<(!--|!|\?|\/(?![a-zA-Z])|\/?(?:style|title|script|textarea|template|xmp|plaintext|noscript|iframe|noembed|noframes|select|svg|math|frameset|a|b|big|code|em|font|i|nobr|s|small|strike|strong|tt|u|table|details)(?=[\s\/>]))/gi;
var ALLRE=/<(!--|!|\?|\/(?![a-zA-Z])|\/?[a-zA-Z][^\s\/>]*)/g;
function plainHtml(html){
 if(/=\s*"[^"]*</.test(html)||/=\s*'[^']*</.test(html)) return null;
 var out='', i=0, pos=0, m, j, k, end, depth=0, fm=[];      /* depth: 열려 있는 표의 수, fm: 열려 있는 글자 꾸밈 */
 for(;;){
  var re=fm.length?ALLRE:KEYRE; re.lastIndex=pos; m=re.exec(html); if(!m) break;
  var name=m[1].toLowerCase(), isEnd=name.charAt(0)==='/'&&name.length>1, nm=isEnd?name.slice(1):name; pos=m.index+m[0].length; end=-1;
  if(name==='!--'){                                          /* 주석: --> 또는 --!> 까지 */
   j=html.indexOf('-->',m.index+2); k=html.indexOf('--!>',m.index+4);
   if(j<0&&k<0) return null;
   end=(k>=0&&(j<0||k<j))?k+4:j+3;
  }else if(name==='!'||name==='?'||name==='/'){               /* <!DOCTYPE>, <![CDATA[ 같은 것: 다음 > 까지 */
   j=html.indexOf('>',m.index); if(j<0) return null; end=j+1;
  }else if(!isEnd&&(nm==='style'||nm==='title')){             /* 안의 글자를 태그로 읽지 않는 요소: 닫는 태그까지 */
   var close=new RegExp('</'+nm+'[\\s/>]','gi'); close.lastIndex=m.index; var c=close.exec(html);
   if(!c) return null;
   j=html.indexOf('>',c.index); if(j<0) return null; end=j+1;
  }else if(RAWTAG.test(nm)) return null;
  else if(FMTTAG.test(nm)){
   if(!isEnd){if((nm==='a'||nm==='nobr')&&fm.indexOf(nm)>=0) return null; fm.push(nm);}
   else{if(!fm.length||fm[fm.length-1]!==nm) return null; fm.pop();}
  }
  else if(fm.length&&!INLTAG.test(nm)) return null;
  else if(nm==='table'){if(!isEnd) depth++; else if(depth>0) depth--;}
  else if(nm==='details'&&!isEnd&&depth>0) return null;
  if(end>=0){out+=html.slice(i,m.index); i=end; pos=end;}
 }
 return out+html.slice(i);
}
function vokaParse(r){
 var o={x:null,y:null,pct:null};
 function nn(t){return +String(t).replace(/,/g,'');}
 /* <li> 목록에서 이름이 맞는 첫 줄의 값. 단어 수("63 / 70")를 찾으면 true, 비율("90%")만 찾으면 o.pct에 적고 false */
 function scan(lis){
  var j, q;
  for(j=0;j<lis.length;j++){
   var b=lis[j].querySelector('b'); if(!b) continue;
   var v=b.textContent.trim(), lab=lis[j].textContent.replace(b.textContent,'').trim();
   if(!/^(학습됨|학습 완료|테스트를 통과한)/.test(lab)) continue;
   if((q=v.match(/^([\d,]+)\s*\/\s*([\d,]+)$/))&&nn(q[2])>0){o.x=nn(q[1]);o.y=nn(q[2]);return true;}
   if((q=v.match(/^(\d+)%$/))){o.pct=+q[1];return false;}
  }
  return null;
 }
 try{
  if(typeof DOMParser==='undefined'||!r||!r.html) return o;
  var html=String(r.html), P=new DOMParser(), txt=plainHtml(html), fr=txt==null?[]:(txt.match(/<details[\s>\/][\s\S]*?<\/details\b[^>]*>/gi)||[]), i, q, hit=null;
  /* 먼저 <details> 조각만 읽습니다. 리포트 전체를 풀어 읽는 것보다 훨씬 가볍습니다.
     <details> 안에 <details>가 또 들어 있으면 조각이 중간에서 끊기므로 이 방법을 쓰지 않습니다 */
  var nested=fr.some(function(f){return /<details[\s>\/]/i.test(f.slice(1));});
  if(!nested) for(i=0;i<fr.length&&hit===null;i++) hit=scan(P.parseFromString(fr[i],'text/html').querySelectorAll('li'));
  if(hit===true) return o;
  /* 단어 수가 나오지 않은 리포트만 전체를 읽습니다: VOKA 탭과 같은 목록(details li), 숫자 카드, 본문 순서로 찾습니다 */
  var doc=P.parseFromString(html,'text/html'), ks=doc.querySelectorAll('.kpi');
  if(hit===null&&scan(doc.querySelectorAll('details li'))===true) return o;
  for(i=0;i<ks.length;i++){
   var n=ks[i].querySelector('.n'), l=ks[i].querySelector('.l');
   if(n&&l&&/단어/.test(l.textContent)&&(q=n.textContent.trim().match(/^([\d,]+)\s*\/\s*([\d,]+)$/))&&nn(q[2])>0){o.x=nn(q[1]);o.y=nn(q[2]);return o;}
  }
  q=(doc.body?doc.body.textContent:'').match(/(학습됨|학습 완료|테스트 통과)\s*[:：]?\s*([\d,]+)\s*\/\s*([\d,]+)\s*단어/);
  if(q&&nn(q[3])>0){o.x=nn(q[2]);o.y=nn(q[3]);}
 }catch(e){}
 return o;
}
/* VOKA 리포트의 레벨이 어느 단어장인지: A1 · A2 · A1-A2 → 0, B1 → 1, B2 → 2, C1 → 3. 그 밖(SNU 등)은 -1.
   필수 단어로 세는 것은 0~2이고, C1(3)은 "더 높은 단어장을 하고 있다"는 것을 아는 데만 씁니다 */
function vokaList(L){
 L=String(L||'');
 if(L==='A1'||L==='A2'||L==='A1-A2'||L==='GRAMMATIK'||L==='ZERTIFIKAT A2') return 0;
 if(L==='B1'||L==='ZERTIFIKAT B1') return 1;
 if(L==='B2'||L==='ZERTIFIKAT B2') return 2;
 if(L==='C1') return 3;
 return -1;
}
function median(a){var b=a.slice().sort(function(p,q){return p-q;}),m=b.length>>1;return b.length?(b.length%2?b[m]:(b[m-1]+b[m])/2):null;}
/* VOKA 리포트 전체에서: 단어장별로 지금까지 외운 단어 수(Vk)와 최근의 주간 암기 수(rate)
   지금까지 외운 단어
   - 리포트마다 그 주차의 학습 완료 단어 수를 읽어 단어장별로 더합니다. 같은 단어장의 같은 주차가 두 번 있으면 큰 쪽 하나만 셉니다.
   - 주차 번호로 보아 리포트가 없는 주차(가장 높은 주차 번호 아래)는 그 단어장에서 읽은 주차별 단어 수의 중앙값만큼 외운 것으로 봅니다.
     HA-REPORT에 올리기 전에 끝낸 앞 주차가 여기에 듭니다.
   - 더 높은 단어장의 리포트가 있으면 그 아래 단어장은 끝낸 것으로 봅니다(그 레벨의 필수 단어 수).
   - "90%"처럼 비율만 적힌 리포트는 같은 단어장(없으면 그 학생의 다른 단어장) 리포트에 적힌 주차 단어 수의 중앙값으로 환산합니다.
   주간 암기 수
   - 최근 8주(첫 리포트를 올린 지 8주가 안 되면 그 기간)에 등록된 리포트의 단어 수를 주 수로 나눈 값입니다.
     같은 날 여러 주차를 한꺼번에 올린 경우를 생각해, 리포트 수가 주 수보다 많으면 리포트 수로 나눕니다(리포트 하나를 한 주로 봄). */
function readVoka(d,now){
 var V=(Array.isArray(d.voka)?d.voka:[]).filter(function(r){return r&&typeof r==='object';});
 if(!V.length) return null;
 var rows=V.map(function(r){
  var w=vokaWords(r), t=parseD(r.date), n=num(r.n); if(t!=null&&t>now) t=now;
  return {k:vokaList(r.level||d.level),n:(n!=null&&n>=1&&n%1===0)?n:null,t:t,x:w.x,y:w.y,pct:w.pct,cum:(w.x!=null&&w.y>CUM_Y)};
 });
 function ys(k){return rows.filter(function(r){return r.x!=null&&!r.cum&&!r.est&&(k==null||r.k===k);}).map(function(r){return r.y;});}
 rows.forEach(function(r){
  if(r.x!=null||r.pct==null) return;
  var y=median(ys(r.k)); if(y==null) y=median(ys(null));
  if(y!=null){r.est=true;r.y=y;r.x=Math.round(r.pct/100*y);}
 });
 var read=rows.filter(function(r){return r.x!=null;}), top=-1;
 rows.forEach(function(r){if(r.k>top) top=r.k;});
 var o={n:read.length,total:rows.length,unread:rows.length-read.length,rate:null,win:null,Vk:null,lists:null,top:top};
 if(!read.length) return o;
 /* 지금까지 외운 단어: 단어장 0(A1-A2), 1(B1), 2(B2) */
 if(top>=0){
  o.Vk=[]; o.lists=[];
  [0,1,2].forEach(function(k){
   var byN={}, xs=[], sum=0, maxN=0, cm=0, n;
   rows.forEach(function(r){if(r.k===k&&r.n!=null&&r.n>maxN) maxN=r.n;});
   read.forEach(function(r){
    if(r.k!==k) return;
    if(r.cum){if(r.x>cm) cm=r.x;}
    else if(r.n==null) sum+=r.x;
    else if(!(r.n in byN)||r.x>byN[r.n]) byN[r.n]=r.x;
   });
   for(n in byN){sum+=byN[n];xs.push(byN[n]);}
   var gaps=xs.length?maxN-xs.length:0, v=sum+(gaps>0?gaps*median(xs):0), full=top>k;
   if(cm>v){v=cm;gaps=0;}                       /* 누계로 적힌 리포트가 더 크면 그 수 */
   o.Vk.push(full?Math.max(INC[k],v):v); o.lists.push({v:v,gaps:full?0:gaps,full:full});
  });
 }
 /* 주간 암기 수: 같은 단어장·같은 주차·같은 날짜로 두 번 올라온 리포트는 한 번만 셉니다 */
 var uniq={}, wk=[];
 read.forEach(function(r){
  if(r.cum||r.t==null) return;
  if(r.k<0||r.n==null){wk.push(r);return;}
  var key=r.k+'#'+r.n+'#'+r.t, old=uniq[key];
  if(!old){uniq[key]=r;wk.push(r);}
  else if(r.x>old.x){wk[wk.indexOf(old)]=r;uniq[key]=r;}
 });
 if(wk.length){
  var first=Math.min.apply(null,wk.map(function(r){return r.t;})), span=weeksSince(first,now), Wn=Math.min(WIN,span), from=now-(Wn*7-1)*DAY;
  var rc=wk.filter(function(r){return r.t>=from;}), tot=rc.reduce(function(p,r){return p+r.x;},0);
  o.rate=rc.length?tot/Math.max(Wn,rc.length):0; o.win={weeks:Wn,n:rc.length,full:span>=WIN};
 }else{
  /* 누계만 적힌 리포트: 날짜가 다른 두 리포트 사이에 늘어난 수로 봅니다 */
  var cu=read.filter(function(r){return r.cum&&r.t!=null;}).sort(function(p,q){return p.t-q.t;});
  if(cu.length>=2&&cu[cu.length-1].t>cu[0].t){
   var wks=(cu[cu.length-1].t-cu[0].t)/(7*DAY);
   o.rate=Math.max(0,(cu[cu.length-1].x-cu[0].x)/Math.max(1,wks)); o.win={weeks:Math.max(1,Math.round(wks)),n:cu.length,full:true};
  }
 }
 return o;
}
/* 학생 기록에서 지금 위치와 최근 흐름을 구합니다 */
function analyze(d){
 var now=today0(), o={kind:'none',cur:null,pos:null,h:null,s:null,subs:0,few:false,voka:null};
 if(!d||d.role==='admin') return o;
 var K=null; try{K=readVoka(d,now);}catch(e){K=null;}
 o.voka=K; var Vk=(K&&K.Vk)?K.Vk:null;
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
  o.kind='reg'; o.cur=cur; o.pos={start:cur,W:W,P0:P0,Vk:Vk}; o.subs=subs.length; o.inLevel=mine.length; o.prior=pn; o.target=TH*LV[cur].ch;
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
  o.kind='gram'; o.cur='G'; o.pos={start:'G',g0:GW*Math.min(1,due/N),Vk:Vk}; o.subs=G.length; o.gram={n:G.length,due:due,total:N};
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
+'.ach-t.cur{border-color:var(--acc);background:#f1f3f8}'
+'.ach-t .k{font-size:13px;font-weight:700;color:var(--mute);line-height:1.4}.ach-t.cur .k{color:#2E3A55}'
+'.ach-t .v{font-size:20px;font-weight:700;line-height:1.35;white-space:nowrap}'
+'.ach-t .s{font-size:12.5px;color:var(--mute);line-height:1.5}'
+'.ach-top{padding:16px}.ach-top .rhead{margin-bottom:10px}.ach-top h2{margin:0}.ach-top .note{margin-top:8px}'
+'.ach-pos{margin:0 0 14px;font-size:14.5px}.ach-pos b{color:#2E3A55}'
+'.ach-bar{height:6px;border-radius:3px;background:var(--line);overflow:hidden;margin:8px 0 0;max-width:320px}.ach-bar i{display:block;height:100%;background:var(--acc);border-radius:3px}'
+'.ach-voc{margin-top:10px}'
+'.ach-ctl{display:grid;grid-template-columns:1fr 1fr;gap:18px 28px;margin:20px 0 6px}'
+'.ach-ctl label{display:block;min-width:0}'
+'.ach-ctl .hd{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-weight:600;font-size:14.5px}'
+'.ach-ctl output{color:#2E3A55;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}'
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
/* 기록에서 가져온 값(슬라이더와 같은 단위). 단어 암기는 VOKA 리포트에서 구한 주간 암기 수를 하루 단위(7의 배수)로 맞춥니다.
   슬라이더의 위쪽 끝(주 490개)보다 많이 외우는 학생은 그 학생의 값까지 슬라이더를 넓힙니다 */
function wordsOf(A){
 var K=A.voka; if(!K||K.rate==null) return W_DEF;
 if(K.rate<=0) return 0;
 return Math.min(W_TOP,Math.max(7,7*Math.round(K.rate/7)));     /* 조금이라도 외웠으면 하루 1개부터 */
}
function mine(A){return {h:pct(A.h),s:pct(A.s),e:0,w:wordsOf(A)};}
function run(pos,v){return project(pos,v.h/100,v.s/100,v.e,v.w);}
/* 단어 암기 값을 어디에서 가져왔는지 한 문장으로 */
function vocText(A,w){
 var K=A.voka;
 if(!K) return '등록된 VOKA 리포트가 없어 단어 암기는 주 '+w+'개로 두었습니다.';
 if(!K.n) return 'VOKA 리포트에서 단어 수를 읽지 못해 단어 암기는 주 '+w+'개로 두었습니다.';
 if(K.rate==null) return 'VOKA 리포트의 날짜로는 주간 암기 수를 구할 수 없어 앞으로의 단어 암기는 주 '+w+'개로 두었습니다.';
 if(!K.win.n) return '최근 '+K.win.weeks+'주 동안 등록된 VOKA 리포트가 없어 단어 암기는 0개로 계산했습니다.';
 return '단어 암기는 최근 VOKA 리포트 '+K.win.n+'개에 적힌 대로 주 '+w+'개(하루 '+Math.round(w/7)+'개)로 계산했습니다.';
}
/* VOKA 리포트에서 주간 암기 수를 구한 경우 */
function vocMeasured(A){var K=A.voka;return !!(K&&K.n&&K.rate!=null&&K.win&&K.win.n);}

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
 var v=mine(A), P=run(A.pos,v), h=head, basis, alt=null, vw={h:100,s:v.s,e:0,w:v.w}, Pw=run(A.pos,vw), voc=vocText(A,v.w);
 /* 무엇으로 계산했는지: 과제 기록과 VOKA 리포트 */
 if(A.kind==='gram') basis='문법 과정 과제 '+A.gram.due+'회 가운데 '+A.gram.n+'회(이행률 '+v.h+'%, 평균 정답률 '+v.s+'%)';
 else basis=(A.win.full?'최근 '+A.win.weeks+'주 동안':'첫 과제를 낸 뒤 '+A.win.weeks+'주 동안')+' 낸 과제 '+A.win.n+'회(이행률 '+v.h+'%, 평균 '+v.s+'%)';
 basis+=vocMeasured(A)?'와 최근 VOKA 리포트 '+A.voka.win.n+'개(단어 주 '+v.w+'개, 하루 '+Math.round(v.w/7)+'개)로 계산했습니다.':'로 계산했습니다. '+voc;
 if(v.h<=0||v.s<=0||!P.lv.length||!P.lv[0].ok){
  var okw=v.s>0&&Pw.lv.length&&Pw.lv[0].ok;
  h+='<p class="note" style="margin:0 0 10px">'+((A.kind!=='gram'&&v.h<=0)?'최근 '+A.win.weeks+'주 동안 낸 과제가 없어 ':'')+'지금 흐름으로는 도달 시점이 나오지 않습니다.'
   +(okw?' 과제를 매주 내고 평균 점수 '+v.s+'%를 유지하면 아래와 같습니다. '+voc:'')+'</p>';
  if(okw) h+=tilesHtml(Pw,A.cur);
  return h+'</section>';
 }
 h+=tilesHtml(P,A.cur)+'<p class="note">'+basis+'</p>';
 /* 한 가지를 바꾸면 지금 과정이 얼마나 빨라지는지: 과제를 매주 내는 경우와 단어를 하루 10개 외우는 경우 가운데 더 큰 쪽 */
 if(P.lv[0].t*7/365.25<=CAPY){
  var best=0, gain;
  if(v.h<95&&Pw.lv.length&&Pw.lv[0].ok){gain=P.lv[0].t-Pw.lv[0].t; if(gain>=3){best=gain;alt='과제를 매주 내면 '+NAMES[P.first]+' 도달이 '+spanText(gain)+' 빨라집니다.';}}
  if(A.voka&&A.voka.rate!=null&&v.w<W_DEF){
   var Pv=run(A.pos,{h:v.h,s:v.s,e:0,w:W_DEF});
   if(Pv.lv.length&&Pv.lv[0].ok){gain=P.lv[0].t-Pv.lv[0].t; if(gain>=3&&gain>best){best=gain;alt='단어를 하루 '+(W_DEF/7)+'개 외우면 '+NAMES[P.first]+' 도달이 '+spanText(gain)+' 빨라집니다.';}}
  }
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
 var A=analyze(d), has=(A.h!=null&&A.s!=null), def=has?mine(A):{h:80,s:80,e:0,w:wordsOf(A)}, K=A.voka, Vk=(K&&K.Vk)||null;
 /* VOKA 리포트로 본 지금 과정(k)의 필수 단어. 지금 과정보다 낮은 단어장을 아직 하고 있으면 그 단어장을 보여 줍니다 */
 function vocPos(k){
  if(!Vk) return '';
  var j=(K.top<k)?K.top:k, L=K.lists[j], tot=INC[j].toLocaleString('ko-KR'), got=Math.min(INC[j],Math.round(Vk[j])), q=Math.round(got/INC[j]*100), t;
  if(L.full) t=NAMES[j]+'보다 높은 단어장을 하고 있어 '+NAMES[j]+' 필수 단어 '+tot+'개는 모두 외운 것으로 계산했습니다.';
  else{
   t='VOKA 리포트로 보면 '+NAMES[j]+' 필수 단어 '+tot+'개'+(got>=INC[j]?'를 모두 외웠습니다.':' 가운데 '+got.toLocaleString('ko-KR')+'개를 외웠습니다.');
   if(L.gaps>0) t+=' 리포트가 없는 '+L.gaps+'개 주차는 리포트가 있는 주차만큼 외운 것으로 계산했습니다.';
   if(j<k&&got<INC[j]) t+=' '+NAMES[k]+' 도달에는 남은 '+NAMES[j]+' 단어도 외워야 하는 것으로 계산했습니다.';
  }
  return '<div class="ach-voc">'+t+'<div class="ach-bar" role="img" aria-label="'+NAMES[j]+' 필수 단어 '+q+'%"><i style="width:'+q+'%"></i></div></div>';
 }
 if(!state) state={v:{h:def.h,s:def.s,e:def.e,w:def.w},start:0};
 var v=state.v, h='<section class="card"><h2>성취 평가</h2><p class="sub">과제, 자습, 단어 암기를 바꾸면 각 레벨에 도달하는 때가 어떻게 달라지는지 계산합니다.</p>';
 if(A.kind==='reg'){
  var p=Math.min(1,A.pos.P0/A.target);
  var cnt=A.inLevel&&A.prior?'등록된 '+NAMES[A.cur]+' 과제 '+A.inLevel+'회와 그 전에 낸 '+A.prior+'회로':A.inLevel?'등록된 '+NAMES[A.cur]+' 과제 '+A.inLevel+'회로':A.prior?'그 전에 낸 '+NAMES[A.cur]+' 과제 '+A.prior+'회로':'';
  h+='<div class="ach-pos"><b>현재 '+levelName(A.cur)+'</b> · '+(cnt?cnt+' 과제 기준의 '+pct(p)+'%를 채웠습니다.':'등록된 '+NAMES[A.cur]+' 과제가 아직 없어 과정을 지금 시작하는 것으로 계산합니다.')
   +(cnt?'<div class="ach-bar" role="img" aria-label="과제 기준 '+pct(p)+'%"><i style="width:'+pct(p)+'%"></i></div>':'')+vocPos(A.cur)+'</div>';
 }else if(A.kind==='gram'){
  h+='<div class="ach-pos"><b>현재 문법 과정</b> · '+(A.gram.due?'16회 가운데 '+A.gram.due+'회까지 진행한 것으로 계산합니다.':'과정을 지금 시작하는 것으로 계산합니다.')+vocPos(0)+'</div>';
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
  +'<label for="ach-w"><span class="hd"><span>단어 암기 (주)</span><output id="ach-wo" for="ach-w"></output></span><input type="range" id="ach-w" min="0" max="'+Math.max(W_MAX,def.w)+'" step="7" value="'+v.w+'"><small>Vokalab에서 '+(Vk?'앞으로 ':'')+'한 주에 외우는 단어 수입니다.</small></label>'
  +'</div>';
 h+='<div class="ach-act"><button type="button" class="btn" id="ach-rs">'+(has?'내 기록 값으로':'처음 값으로')+'</button></div>';
 h+='<p class="note" style="margin-top:14px">'+(has?(A.kind==='gram'?'처음 값은 문법 과정 과제 기록(이행률 '+def.h+'%, 평균 정답률 '+def.s+'%)에서 가져왔습니다.':'처음 값은 '+(A.win.full?'최근 '+A.win.weeks+'주':'첫 과제를 낸 뒤 '+A.win.weeks+'주')+'의 과제 기록(과제 '+A.win.n+'회, 이행률 '+def.h+'%, 평균 점수 '+def.s+'%)에서 가져왔습니다.'):'처음 값은 과제의 80%를 내고 80%를 맞히는 경우입니다.')+' '+vocText(A,def.w)+' 추가 자습은 0분으로 두었습니다. 학습량으로 계산한 예상이고, 같은 학습량으로도 결과는 사람마다 다릅니다.</p>';
 h+='</section>';
 h+='<details class="card ach-d"><summary>계산 기준</summary><ul>'
  +'<li>한 레벨에 도달했다고 보는 때는 아래 세 가지를 모두 채운 때입니다.</li>'
  +'<li><b>과제.</b> 그 과정에서 얻은 과제 점수(이행률 × 정답률)의 합이 과정 과제 전체의 '+pct(TH)+'% 이상입니다. 과제의 80%를 내고 80%를 맞히면 과정을 한 번 들은 때 채웁니다(A2 '+LV[0].ch+'주, B1 '+LV[1].ch+'주, B2 '+LV[2].ch+'주). 점수가 더 높으면 과정 중간에 채우고, 낮으면 과정을 더 들어야 합니다. 영역을 빼고 낸 과제는 낸 영역만큼만 셉니다.</li>'
  +'<li><b>필수 단어.</b> 외운 단어와 수업·과제에서 익힌 단어를 더한 수가 시험용 단어 누계 이상입니다. A2 '+LV[0].vt.toLocaleString('ko-KR')+'개, B1 '+LV[1].vt.toLocaleString('ko-KR')+'개, B2 '+LV[2].vt.toLocaleString('ko-KR')+'개입니다. VOKA 리포트가 있으면 단어장별로 리포트에 적힌 학습 완료 단어 수를 더해 지금까지 외운 단어로 세고(레벨마다 그 레벨의 필수 단어 수까지), 단어 암기 값은 앞으로 외우는 속도로 씁니다. 주차 번호로 보아 리포트가 없는 주차는 리포트가 있는 주차만큼 외운 것으로 보고, 더 높은 단어장을 하고 있으면 그 아래 단어장은 끝낸 것으로 봅니다. VOKA 리포트가 없으면 지난 주에도 단어 암기 값만큼 외운 것으로 봅니다.</li>'
  +'<li><b>학습 시간.</b> 수업, 과제, 단어 암기, 자습 시간을 더한 값이 레벨마다 정한 최소 학습 시간 이상입니다.</li>'
  +'<li><b>추가 자습.</b> 자습을 하면 과제 점수가 그만큼 빨리 쌓이는 것으로 계산합니다. 한 주에 쌓이는 점수는 한 챕터 분량까지여서, 가장 빠른 도달은 과정의 '+pct(TH)+'% 지점입니다.</li>'
  +'<li><b>시작 위치.</b> B1, B2 과정은 그 과정에 들어올 때 이전 레벨의 필수 단어와 최소 학습 시간을 채운 것으로 봅니다. 다만 VOKA 리포트로 보아 이전 레벨의 단어장을 아직 하고 있으면 남은 단어도 외워야 하는 것으로 계산합니다. 지금 과정에서는 등록된 과제의 점수를 그대로 셉니다.</li>'
  +'<li>수업은 주 1회 80분과 독해 강의 주 1회 60분, 문법 과정은 2개월(주 2회)로 계산합니다. 쉬는 주는 넣지 않았습니다.</li>'
  +'</ul></details>';
 pane.innerHTML=h;
 function q(id){return pane.querySelector('#'+id);}
 function pos(){return A.pos||{start:START[state.start][0],g0:0,W:0,P0:0,Vk:Vk};}
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

window.HAAchieve={topHtml:topHtml,render:render,reset:reset,analyze:analyze,project:project,reqs:reqs,pace:pace,C:C,_setNow:function(t){NOW=t;},_wordsOf:wordsOf,_vokaWords:vokaParse,_plain:plainHtml};
})();
