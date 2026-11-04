/* 词义网 helpers: antonym / category (上下位) / affix relations for A2–B1.
   Scaffolding only — never changes 打卡 rules or chunk SRS. */
(function(){
  "use strict";
  var WN = { ready:false, data:null, idx:{} };
  function add(w, rel){ w=String(w).toLowerCase(); (WN.idx[w]=WN.idx[w]||[]).push(rel); }
  WN.build = function(d){
    WN.data=d; WN.idx={};
    (d.antonyms||[]).forEach(function(p,i){
      add(p[0],{t:"ant",i:i,other:p[1],otherZh:p[3],zh:p[2]});
      add(p[1],{t:"ant",i:i,other:p[0],otherZh:p[2],zh:p[3]});
    });
    (d.groups||[]).forEach(function(g,i){
      add(g.hyper,{t:"hyper",i:i});
      g.items.forEach(function(it){ add(it[0],{t:"cat",i:i,zh:it[1]}); });
    });
    (d.affixes||[]).forEach(function(a,i){
      a.words.forEach(function(w,j){ add(w[2],{t:"aff",i:i,j:j}); });
    });
    WN.ready=true;
  };
  WN.load = function(cb){
    try{
      fetch("data/wordnet.json",{cache:"no-cache"}).then(function(r){ return r.ok?r.json():null; })
        .then(function(d){ if(d) WN.build(d); if(cb) cb(); })["catch"](function(){ if(cb) cb(); });
    }catch(e){ if(cb) cb(); }
  };
  WN.rels = function(words){
    var out=[], seen={};
    (words||[]).forEach(function(w){ (WN.idx[String(w).toLowerCase()]||[]).forEach(function(r){
      var k=r.t+r.i+(r.j||""); if(!seen[k]){ seen[k]=1; out.push(r); } }); });
    return out;
  };
  function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }
  /* hint lines shown on a revealed / learn card */
  WN.hintHTML = function(words){
    if(!WN.ready) return "";
    var d=WN.data, lines=[];
    WN.rels(words).slice(0,2).forEach(function(r){
      if(r.t==="ant") lines.push("↔ 反义："+esc(r.other)+"（"+esc(r.otherZh)+"）");
      else if(r.t==="cat"){ var g=d.groups[r.i]; lines.push("🗂 属于 "+esc(g.hyper)+"（"+esc(g.zh)+"）：同类 "+g.items.filter(function(x){return words.indexOf(x[0])<0;}).slice(0,3).map(function(x){return esc(x[0]);}).join(" / ")); }
      else if(r.t==="hyper"){ var g2=d.groups[r.i]; lines.push("🗂 "+esc(g2.hyper)+" 包括："+g2.items.slice(0,4).map(function(x){return esc(x[0]);}).join(" / ")); }
      else if(r.t==="aff"){ var a=d.affixes[r.i], w=a.words[r.j]; lines.push("🧩 "+esc(w[0])+" + "+esc(w[1])+"："+esc(a.affix)+" = "+esc(a.mean)); }
    });
    if(!lines.length) return "";
    return '<div class="wn-hint"><div class="wn-h">🕸️ 词义网</div>'+lines.map(function(l){return '<div>'+l+'</div>';}).join("")+'</div>';
  };
  function shuffle(a){ a=a.slice(); for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=a[i];a[i]=a[j];a[j]=t;} return a; }
  function pick(a,n,not){ return shuffle(a.filter(function(x){ return not.indexOf(x)<0; })).slice(0,n); }
  /* question keys: ant:i:side  cat:i:item  aff:i:j */
  WN.question = function(key){
    var d=WN.data, p=key.split(":"), t=p[0], i=+p[1], k=+p[2], q;
    if(t==="ant"){
      var pr=d.antonyms[i]; if(!pr) return null;
      var w=pr[k?1:0], ans=pr[k?0:1];
      var pool=d.antonyms.map(function(x){return x[1];}).concat(d.antonyms.map(function(x){return x[0];}));
      q={type:"反义词", prompt:"<b>"+esc(w)+"</b>（"+esc(pr[k?3:2])+"）的反义词是？", ans:ans, opts:shuffle([ans].concat(pick(pool,3,[ans,w]))), fam:"ant:"+i, explain:esc(w)+" ↔ "+esc(ans)+"（"+esc(pr[k?2:3])+"）"};
    } else if(t==="cat"){
      var g=d.groups[i]; if(!g||!g.items[k]) return null;
      var it=g.items[k], others=[];
      d.groups.forEach(function(x,gi){ if(gi!==i) x.items.forEach(function(y){ others.push(y[0]); }); });
      q={type:"找同类", prompt:"哪个属于 <b>"+esc(g.hyper)+"</b>（"+esc(g.zh)+"）？", ans:it[0], opts:shuffle([it[0]].concat(pick(others,3,[it[0]]))), fam:"cat:"+i, explain:esc(it[0])+"（"+esc(it[1])+"）是一种 "+esc(g.hyper)};
    } else if(t==="aff"){
      var a=d.affixes[i]; if(!a||!a.words[k]) return null;
      var w2=a.words[k], allZh=[];
      d.affixes.forEach(function(x){ x.words.forEach(function(y){ allZh.push(y[3]); }); });
      q={type:"拆词猜义", prompt:"<b>"+esc(w2[2])+"</b> = "+esc(w2[0])+" + "+esc(w2[1])+"<br><span style=\"font-size:12px;color:var(--muted)\">"+esc(a.affix)+" 表示「"+esc(a.mean)+"」</span><br>猜猜意思？", ans:w2[3], opts:shuffle([w2[3]].concat(pick(allZh,3,[w2[3]]))), fam:"aff:"+i, explain:esc(w2[2])+" = "+esc(w2[3])};
    }
    if(q) q.key=key;
    return q;
  };
  /* keys related to given lemmas, for "today's words first" ordering */
  WN.keysFor = function(words){
    return WN.rels(words).map(function(r){
      if(r.t==="ant"){ var pr=WN.data.antonyms[r.i]; return "ant:"+r.i+":"+(words.indexOf(pr[1])>=0?1:0); }
      if(r.t==="cat"){ var g=WN.data.groups[r.i]; var j=0; g.items.forEach(function(x,n){ if(words.indexOf(x[0])>=0) j=n; }); return "cat:"+r.i+":"+j; }
      if(r.t==="hyper") return "cat:"+r.i+":"+Math.floor(Math.random()*WN.data.groups[r.i].items.length);
      return "aff:"+r.i+":"+r.j;
    });
  };
  WN.randomKey = function(level){
    var d=WN.data, r=Math.random(), i;
    var tAff = level>=1 ? 0.34 : 0.2; /* 初一 mostly antonym + category; affix weight grows later */
    if(r<tAff){ i=Math.floor(Math.random()*d.affixes.length); return "aff:"+i+":"+Math.floor(Math.random()*d.affixes[i].words.length); }
    if(r<tAff+(1-tAff)/2){ i=Math.floor(Math.random()*d.antonyms.length); return "ant:"+i+":"+(Math.random()<.5?0:1); }
    i=Math.floor(Math.random()*d.groups.length); return "cat:"+i+":"+Math.floor(Math.random()*d.groups[i].items.length);
  };
  WN.famTotals = function(){ var d=WN.data; return {ant:d.antonyms.length, cat:d.groups.length, aff:d.affixes.length}; };
  WN.famNeed = function(fam){ return fam.indexOf("ant:")===0 ? 2 : 3; };
  window.WN = WN;
})();
