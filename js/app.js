(function(){
'use strict';

/* ---------- configuração ---------- */
var CLIENTES=[   // para incluir outro cliente: acrescente uma linha aqui e coloque a planilha na pasta dados/
  {id:'ambev-revenda',nome:'AMBEV REVENDA',arquivo:'dados/ambev-revenda.xlsx'},
  {id:'ambev-spot-t1',nome:'AMBEV SPOT T1',arquivo:'dados/ambev-spot-t1.xlsx'}
];
var cache={};
var ERROS=['Traseira','Lateral','Frente','Ambos'];
var ERRCOR={Traseira:'var(--s1)',Lateral:'var(--s2)',Frente:'var(--s3)',Ambos:'var(--s4)'};
var MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
var PAGE=50;
var $=function(id){return document.getElementById(id)};

var state={rows:[],all:[],cur:CLIENTES[0].id,f:{ano:'',mes:'',dia:'',placa:'',erro:'',res:'',motivo:''},show:PAGE,loaded:false,origem:'repo',erroCarga:''};
var lastRows=[];


/* ---------- regras ---------- */
function norm(s){return String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()}
function normPlaca(s){return String(s==null?'':s).toUpperCase().replace(/[^A-Z0-9]/g,'')}
function classify(obs){
  var n=norm(obs).trim();
  if(!n) return {ok:true,erros:[]};
  var erros=ERROS.filter(function(e){return n.indexOf(norm(e))>=0});
  return {ok:erros.length===0,erros:erros};
}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function p2(n){return (n<10?'0':'')+n}
function fmtData(iso){return iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4)+' '+iso.slice(11,16)}
function pct(a,b){return b?Math.round(a*1000/b)/10:0}
function fmtPct(v){return String(v).replace('.',',')+'%'}

/* ---------- dados ---------- */
function enrich(r){
  var c=classify(r.obs);
  return {placa:r.placa,data:r.data,obs:r.obs||'',motivo:r.motivo||'',ok:c.ok,erros:c.erros,
    y:+r.data.slice(0,4),m:+r.data.slice(5,7),d:+r.data.slice(8,10)};
}
function filtered(){
  var f=state.f,pl=normPlaca(f.placa);
  return state.all.filter(function(r){
    if(f.ano && r.y!==+f.ano) return false;
    if(f.mes && r.m!==+f.mes) return false;
    if(f.dia && r.d!==+f.dia) return false;
    if(pl && normPlaca(r.placa).indexOf(pl)<0) return false;
    if(f.res==='ok' && !r.ok) return false;
    if(f.res==='nok' && r.ok) return false;
    if(f.erro && r.erros.indexOf(f.erro)<0) return false;
    if(f.motivo==='__none' && r.motivo) return false;
    if(f.motivo && f.motivo!=='__none' && r.motivo!==f.motivo) return false;
    return true;
  });
}

/* ---------- filtros ---------- */
function fillSel(sel,opts,cur){
  sel.innerHTML='<option value="">Todos</option>'+opts.map(function(o){return '<option value="'+esc(o[0])+'">'+esc(o[1])+'</option>'}).join('');
  sel.value=cur;
  if(sel.value!==cur){sel.value='';}
}
function renderFiltros(){
  var anos=Array.from(new Set(state.all.map(function(r){return r.y}))).sort(function(a,b){return b-a});
  fillSel($('fAno'),anos.map(function(a){return [a,String(a)]}),state.f.ano);
  fillSel($('fMes'),MESES.map(function(n,i){return [i+1,n]}),state.f.mes);
  var dias=[];for(var i=1;i<=31;i++)dias.push([i,p2(i)]);
  fillSel($('fDia'),dias,state.f.dia);
  var mots=Array.from(new Set(state.all.map(function(r){return r.motivo}).filter(Boolean))).sort(function(x,y){return x.localeCompare(y,'pt-BR')});
  var opts=mots.map(function(x){return [x,x]});
  if(mots.length&&state.all.some(function(r){return !r.motivo}))opts.push(['__none','(sem motivo)']);
  fillSel($('fMotivo'),opts,state.f.motivo);
  state.f.motivo=$('fMotivo').value;
  state.f.ano=$('fAno').value;state.f.mes=$('fMes').value;state.f.dia=$('fDia').value;
}

/* ---------- indicadores ---------- */
function renderKpis(rows){
  var ok=rows.filter(function(r){return r.ok}).length,nok=rows.length-ok,t=rows.length;
  var taxa=t?fmtPct(pct(ok,t)):'—';
  $('kpis').innerHTML=
   '<div class="card kpi"><span class="lbl">Taxa de acerto da IA</span><span class="val">'+taxa+'</span>'+
     '<span class="meter" aria-hidden="true"><i style="width:'+(t?ok*100/t:0)+'%;background:var(--good)"></i><i style="width:'+(t?nok*100/t:0)+'%;background:var(--crit)"></i></span></div>'+
   '<div class="card kpi"><span class="lbl">Validações no filtro</span><span class="val">'+t+'</span></div>'+
   '<div class="card kpi"><span class="lbl"><i class="ico ok">✓</i>OK</span><span class="val">'+ok+'</span></div>'+
   '<div class="card kpi"><span class="lbl"><i class="ico nok">✕</i>NOK</span><span class="val">'+nok+'</span></div>';
}

/* ---------- gráfico por dia ---------- */
function niceStep(max){
  var raw=Math.max(1,Math.ceil(max/4)),pow=Math.pow(10,Math.floor(Math.log10(raw)));
  var cand=[1,2,5,10];for(var i=0;i<cand.length;i++){if(cand[i]*pow>=raw)return cand[i]*pow}
  return 10*pow;
}
function drawDias(rows){
  var el=$('chartDias');
  if(!rows.length){el.innerHTML='<div class="empty">Sem dados para o filtro atual.</div>';return}
  var by=new Map();
  rows.forEach(function(r){var k=r.data.slice(0,10);var g=by.get(k)||{k:k,ok:0,nok:0};r.ok?g.ok++:g.nok++;by.set(k,g)});
  var groups=Array.from(by.values()).sort(function(a,b){return a.k<b.k?-1:1});
  var porMes=groups.length>45;
  if(porMes){
    var bm=new Map();
    groups.forEach(function(g){var k=g.k.slice(0,7);var x=bm.get(k)||{k:k,ok:0,nok:0};x.ok+=g.ok;x.nok+=g.nok;bm.set(k,x)});
    groups=Array.from(bm.values()).sort(function(a,b){return a.k<b.k?-1:1});
  }
  $('tituloDias').textContent=porMes?'Validações por mês':'Validações por dia';
  var n=groups.length,W=Math.max(280,el.clientWidth||600),H=240,m={l:34,r:8,t:18,b:28};
  var max=Math.max.apply(null,groups.map(function(g){return g.ok+g.nok}));
  var step=niceStep(max),yMax=step*4,ih=H-m.t-m.b,iw=W-m.l-m.r;
  var y=function(v){return m.t+ih-ih*v/yMax};
  var bw=iw/n,barW=Math.min(52,bw*0.7);
  var s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Validações OK e NOK por período">';
  for(var i=0;i<=4;i++){
    var v=step*i,yy=y(v);
    s+='<line x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+yy+'" y2="'+yy+'" stroke="'+(i===0?'var(--axis)':'var(--grid)')+'" stroke-width="1"/>';
    s+='<text x="'+(m.l-6)+'" y="'+(yy+4)+'" text-anchor="end">'+v+'</text>';
  }
  var every=n<=16?1:Math.ceil(n/12);
  groups.forEach(function(g,i){
    var cx=m.l+bw*i+bw/2,x=cx-barW/2,t=g.ok+g.nok;
    var lab=porMes?g.k.slice(5,7)+'/'+g.k.slice(0,4):g.k.slice(8,10)+'/'+g.k.slice(5,7);
    if(g.ok>0)s+='<rect x="'+x+'" y="'+y(g.ok)+'" width="'+barW+'" height="'+(y(0)-y(g.ok))+'" fill="var(--good)" stroke="var(--surface)" stroke-width="1.5"/>';
    if(g.nok>0)s+='<rect x="'+x+'" y="'+y(t)+'" width="'+barW+'" height="'+(y(g.ok)-y(t))+'" fill="var(--crit)" stroke="var(--surface)" stroke-width="1.5"/>';
    if(n<=14)s+='<text class="pct" x="'+cx+'" y="'+(y(t)-5)+'" text-anchor="middle">'+fmtPct(pct(g.ok,t))+'</text>';
    if(i%every===0)s+='<text x="'+cx+'" y="'+(H-9)+'" text-anchor="middle">'+lab+'</text>';
    var tip=(porMes?'Mês ':'')+lab+(porMes?'':'/'+g.k.slice(0,4))+' · OK '+g.ok+' · NOK '+g.nok+' · acerto '+fmtPct(pct(g.ok,t));
    s+='<rect class="hit" x="'+(cx-bw/2)+'" y="'+m.t+'" width="'+bw+'" height="'+ih+'" data-tip="'+esc(tip)+'"/>';
  });
  s+='</svg>';
  el.innerHTML=s;
}

/* ---------- gráfico de erros ---------- */
function drawErros(rows){
  var nok=rows.filter(function(r){return !r.ok});
  var cnt={};ERROS.forEach(function(e){cnt[e]=0});
  nok.forEach(function(r){r.erros.forEach(function(e){cnt[e]++})});
  var max=Math.max.apply(null,ERROS.map(function(e){return cnt[e]}));
  $('errosTotal').textContent=nok.length+' NOK';
  if(!nok.length){$('chartErros').innerHTML='<div class="empty">Nenhum erro no filtro atual.</div>';return}
  $('chartErros').innerHTML=ERROS.map(function(e){
    var c=cnt[e],w=max?c*100/max:0,p=fmtPct(pct(c,nok.length));
    return '<div class="erow" data-tip="'+esc(e+': '+c+' erro(s), '+p+' dos NOK')+'"><span>'+e+'</span>'+
      '<span class="track"><span class="bar" style="display:block;width:'+w+'%;background:'+ERRCOR[e]+'"></span></span>'+
      '<span class="num">'+c+' · '+p+'</span></div>';
  }).join('');
}

/* ---------- tabela ---------- */
function renderTabela(rows){
  var sorted=rows.slice().sort(function(a,b){return a.data<b.data?1:a.data>b.data?-1:0});
  var vis=sorted.slice(0,state.show);
  $('tabInfo').textContent=rows.length?('Mostrando '+vis.length+' de '+rows.length):'';
  var tb=$('tbody');
  if(!state.loaded){tb.innerHTML='<tr><td colspan="5" class="empty">Carregando registros…</td></tr>'}
  else if(!state.all.length){tb.innerHTML='<tr><td colspan="5" class="empty">'+(state.erroCarga?esc(state.erroCarga):'Nenhum registro na base.')+'</td></tr>'}
  else if(!vis.length){tb.innerHTML='<tr><td colspan="5" class="empty">Nenhum registro com esses filtros.</td></tr>'}
  else tb.innerHTML=vis.map(function(r){
    var res=r.ok?'<span class="pill ok"><i class="ico ok">✓</i>OK</span>':'<span class="pill nok"><i class="ico nok">✕</i>NOK</span>';
    var er=r.erros.map(function(e){return '<span class="chip"><i class="sw" style="background:'+ERRCOR[e]+'"></i>'+e+'</span>'}).join('')||'<span class="count">—</span>';
    return '<tr><td class="placa">'+esc(r.placa)+'</td><td class="mono">'+fmtData(r.data)+'</td><td class="obs">'+(esc(r.motivo)||'<span class="count">—</span>')+'</td><td>'+res+'</td><td>'+er+'</td></tr>';
  }).join('');
  $('btnMais').hidden=vis.length>=rows.length;
}

function renderRegra(){
  $('rule').textContent='É considerado NOK quando a observação cita '+ERROS.join(', ')+'. Observação em branco conta como OK.';
}

function renderAll(){
  state.all=state.rows.map(enrich);
  renderFiltros();
  var rows=filtered();lastRows=rows;
  $('contagem').textContent=state.loaded?(rows.length+' de '+state.all.length+' registros no filtro'):'';
  renderKpis(rows);drawDias(rows);drawErros(rows);renderTabela(rows);
  $('btnExportar').disabled=!rows.length;
}

/* ---------- dica e aviso ---------- */
var toastT;
function toast(msg,err){var t=$('toast');t.textContent=msg;t.className='toast'+(err?' err':'');t.hidden=false;clearTimeout(toastT);toastT=setTimeout(function(){t.hidden=true},err?6000:3200)}
document.addEventListener('mousemove',function(e){
  var t=e.target.closest&&e.target.closest('[data-tip]'),tip=$('tip');
  if(!t){tip.hidden=true;return}
  tip.textContent=t.getAttribute('data-tip');tip.hidden=false;
  var x=e.clientX+14,y=e.clientY+14;
  if(x+tip.offsetWidth>window.innerWidth-8)x=e.clientX-tip.offsetWidth-14;
  tip.style.left=Math.max(8,x)+'px';tip.style.top=y+'px';
});
document.addEventListener('mouseleave',function(){$('tip').hidden=true});

/* ---------- leitura da planilha ---------- */
function serialToIso(n){
  var ms=Math.floor(Math.round((n-25569)*86400000)/1000)*1000,d=new Date(ms);
  return d.getUTCFullYear()+'-'+p2(d.getUTCMonth()+1)+'-'+p2(d.getUTCDate())+'T'+p2(d.getUTCHours())+':'+p2(d.getUTCMinutes())+':'+p2(d.getUTCSeconds());
}
function toIso(v){
  if(v==null||v==='')return null;
  if(v instanceof Date&&!isNaN(v))return v.getFullYear()+'-'+p2(v.getMonth()+1)+'-'+p2(v.getDate())+'T'+p2(v.getHours())+':'+p2(v.getMinutes())+':'+p2(v.getSeconds());
  if(typeof v==='number')return v>20000?serialToIso(v):null;
  var s=String(v).trim(),m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if(m)return m[3]+'-'+p2(+m[2])+'-'+p2(+m[1])+'T'+p2(+(m[4]||0))+':'+(m[5]||'00')+':'+p2(+(m[6]||0));
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if(m)return m[1]+'-'+m[2]+'-'+m[3]+'T'+(m[4]||'00')+':'+(m[5]||'00')+':'+(m[6]||'00');
  return null;
}
function parseSheet(buf){
  var wb=XLSX.read(buf,{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]];
  var aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
  if(!aoa.length)return {erro:'A planilha está vazia.'};
  var head=aoa[0].map(function(h){return norm(h).trim()});
  var ci=head.findIndex(function(h){return h==='identificador'||h==='placa'});
  var cd=head.findIndex(function(h){return h.indexOf('data valid')===0||h==='data validacao'});
  var co=head.findIndex(function(h){return h.indexOf('observ')===0});
  var cm=head.findIndex(function(h){return h==='motivo'});
  if(ci<0||cd<0)return {erro:'Não encontrei as colunas "Identificador" e "Data Validação" na primeira linha.'};
  var out=[],ign=0,seen=new Set(),dup=0;
  aoa.slice(1).forEach(function(r){
    var placa=normPlaca(r[ci]),data=toIso(r[cd]);
    if(!placa||!data){if(r.some(function(c){return c!==''}))ign++;return}
    var k=placa+'|'+data;if(seen.has(k)){dup++;return}seen.add(k);
    out.push({placa:placa,data:data,obs:co>=0?String(r[co]==null?'':r[co]).trim():'',motivo:cm>=0?String(r[cm]==null?'':r[cm]).trim():''});
  });
  return {rows:out,ign:ign,dup:dup};
}

/* ---------- carga da base ---------- */
function cliente(id){return CLIENTES.filter(function(c){return c.id===(id||state.cur)})[0]}
function exibir(){
  var o=cache[state.cur]||{loaded:false,rows:[],fonte:'Carregando a base…'};
  state.rows=o.rows;state.loaded=o.loaded;state.erroCarga=o.erroCarga||'';state.origem=o.origem||'repo';state.show=PAGE;
  $('fonte').textContent=o.fonte;
  renderAll();
}
function dataBr(d){return p2(d.getDate())+'/'+p2(d.getMonth()+1)+'/'+d.getFullYear()+' '+p2(d.getHours())+':'+p2(d.getMinutes())}
function aplicar(id,res,origem,nome,quando){
  var extra=(res.ign?' · '+res.ign+' linhas ignoradas (sem placa ou data)':'')+(res.dup?' · '+res.dup+' repetidas':'');
  cache[id]={rows:res.rows,loaded:true,origem:origem,
    fonte:(origem==='repo'?'Base do repositório (':'Planilha aberta neste navegador (')+nome+'): '+res.rows.length+' registros'+(quando?' · atualizada em '+quando:'')+extra};
  if(id===state.cur)exibir();
}
function falhar(id,msg){
  cache[id]={rows:[],loaded:true,erroCarga:msg,fonte:msg};
  if(id===state.cur)exibir();
}
async function carregarRepo(id){
  id=id||state.cur;var c=cliente(id);
  cache[id]={rows:[],loaded:false,fonte:'Carregando a base…'};
  if(id===state.cur)exibir();
  try{
    var resp=await fetch(c.arquivo+'?v='+Date.now(),{cache:'no-store'});
    if(!resp.ok)throw new Error('http '+resp.status);
    var buf=await resp.arrayBuffer();
    var res=parseSheet(buf);
    if(res.erro){falhar(id,res.erro);return}
    var lm=resp.headers.get('last-modified'),quando='';
    if(lm){var d=new Date(lm);if(!isNaN(d))quando=dataBr(d)}
    aplicar(id,res,'repo',c.arquivo,quando);
  }catch(e){
    falhar(id,'Não consegui ler '+c.arquivo+'. Se você abriu o index.html direto do computador, o navegador bloqueia a leitura: publique no GitHub Pages ou rode um servidor local (python3 -m http.server).');
  }
}

/* ---------- clientes (abas) ---------- */
function renderAbas(){
  $('tabs').innerHTML=CLIENTES.map(function(c){
    return '<button type="button" class="tab" role="tab" data-id="'+c.id+'" aria-selected="'+(c.id===state.cur)+'">'+esc(c.nome)+'</button>';
  }).join('');
  $('clienteTag').textContent=cliente().nome;
  $('arqNome').textContent=cliente().arquivo;
  document.title='Validação IA · '+cliente().nome;
}
function limparFiltros(){
  $('fPlaca').value='';$('fErro').value='';$('fRes').value='';
  state.f={ano:'',mes:'',dia:'',placa:'',erro:'',res:'',motivo:''};state.show=PAGE;
}
function trocarCliente(id,semHash){
  if(!cliente(id)||id===state.cur&&cache[id])return;
  state.cur=id;limparFiltros();
  try{localStorage.setItem('cliente',id)}catch(e){}
  if(!semHash)try{history.replaceState(null,'','#'+id)}catch(e){}
  renderAbas();
  if(cache[id])exibir();else carregarRepo(id);
}

/* ---------- PDF ---------- */
function cssVar(doc,n){return doc.defaultView.getComputedStyle(doc.documentElement).getPropertyValue(n).trim()}
function prepararClone(doc){
  doc.documentElement.classList.add('pdf-light');
  var rv=function(v){return v.replace(/var\((--[\w-]+)\)/g,function(_,n){return cssVar(doc,n)})};
  doc.querySelectorAll('svg *').forEach(function(el){
    ['fill','stroke'].forEach(function(at){var v=el.getAttribute(at);if(v&&v.indexOf('var(')>=0)el.setAttribute(at,rv(v))});
    if(el.tagName==='text'){
      el.setAttribute('fill',cssVar(doc,el.getAttribute('class')==='pct'?'--ink2':'--muted'));
      el.setAttribute('font-size','11');el.setAttribute('font-family','Arial, Helvetica, sans-serif');
    }
  });
  doc.querySelectorAll('[style*="var("]').forEach(function(el){el.setAttribute('style',rv(el.getAttribute('style')))});
}
function filtroTexto(){
  var f=state.f,p=[];
  if(f.ano)p.push('Ano '+f.ano);
  if(f.mes)p.push('Mês '+MESES[f.mes-1]);
  if(f.dia)p.push('Dia '+f.dia);
  if(f.placa)p.push('Placa contém '+f.placa.toUpperCase());
  if(f.erro)p.push('Erro '+f.erro);
  if(f.motivo)p.push('Motivo '+(f.motivo==='__none'?'(sem motivo)':f.motivo));
  if(f.res)p.push('Resultado '+f.res.toUpperCase());
  return p.length?p.join(' · '):'Sem filtros (todos os registros)';
}
async function baixarPdf(){
  var btn=$('btnPdf');
  if(!window.jspdf||!window.html2canvas){toast('Bibliotecas de PDF não carregadas. Confira a pasta vendor.',true);return}
  if(!state.loaded){toast('Aguarde a base carregar.',true);return}
  btn.disabled=true;var txt=btn.textContent;btn.textContent='Gerando PDF…';
  try{
    var canvas=await html2canvas($('resumo'),{scale:2,backgroundColor:'#f9f9f7',logging:false,onclone:function(d){prepararClone(d)}});
    var jsPDF=window.jspdf.jsPDF,doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    var PW=297,PH=210,M=10,c=cliente(),agora=new Date();
    doc.setFont('helvetica','bold');doc.setFontSize(16);doc.setTextColor(11,11,11);
    doc.text('Validação da IA nas inspeções · '+c.nome,M,M+6);
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(82,81,78);
    doc.text('Gerado em '+dataBr(agora)+' · '+lastRows.length+' de '+state.all.length+' registros no filtro',M,M+12);
    var rule=doc.splitTextToSize($('rule').textContent,PW-2*M);
    doc.text(rule,M,M+17);
    var y=M+17+rule.length*4;
    doc.setTextColor(11,11,11);doc.text('Filtros: '+filtroTexto(),M,y);
    y+=4;
    var w=PW-2*M,h=w*canvas.height/canvas.width,maxH=PH-y-M;
    if(h>maxH){h=maxH;w=h*canvas.width/canvas.height}
    doc.addImage(canvas.toDataURL('image/png'),'PNG',M+(PW-2*M-w)/2,y,w,h);
    var rows=lastRows.slice().sort(function(a,b){return a.data<b.data?1:a.data>b.data?-1:0});
    if(rows.length){
      doc.addPage();
      doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(11,11,11);
      doc.text('Registros · '+c.nome+' ('+rows.length+')',M,M+4);
      doc.autoTable({
        startY:M+8,margin:{left:M,right:M,bottom:12},
        head:[['Placa','Data da validação','Motivo','Resultado','Erro']],
        body:rows.map(function(r){return [r.placa,fmtData(r.data),r.motivo,r.ok?'OK':'NOK',r.erros.join(' + ')]}),
        styles:{font:'helvetica',fontSize:8,cellPadding:1.6,textColor:[11,11,11],lineColor:[225,224,217],lineWidth:.1},
        headStyles:{fillColor:[240,239,236],textColor:[82,81,78],fontStyle:'bold'},
        columnStyles:{0:{fontStyle:'bold',cellWidth:28},1:{cellWidth:36},3:{cellWidth:22},4:{cellWidth:32}},
        didParseCell:function(d){
          if(d.section==='body'&&d.column.index===3){d.cell.styles.fontStyle='bold';d.cell.styles.textColor=d.cell.raw==='OK'?[0,99,0]:[168,41,41]}
        }
      });
    }
    var n=doc.internal.getNumberOfPages();
    for(var i=1;i<=n;i++){doc.setPage(i);doc.setFontSize(8);doc.setTextColor(137,135,129);doc.setFont('helvetica','normal');doc.text(c.nome+' · página '+i+' de '+n,PW-M,PH-5,{align:'right'})}
    doc.save('validacao-ia-'+c.id+'-'+agora.getFullYear()+'-'+p2(agora.getMonth()+1)+'-'+p2(agora.getDate())+'.pdf');
    toast('PDF gerado.');
  }catch(e){console.error(e);toast('Não consegui gerar o PDF.',true)}
  btn.disabled=false;btn.textContent=txt;
}

/* ---------- eventos ---------- */
$('btnMais').addEventListener('click',function(){state.show+=PAGE;renderTabela(lastRows)});
function onFilter(){
  state.f={ano:$('fAno').value,mes:$('fMes').value,dia:$('fDia').value,placa:$('fPlaca').value,erro:$('fErro').value,res:$('fRes').value,motivo:$('fMotivo').value};
  state.show=PAGE;renderAll();
}
['fAno','fMes','fDia','fErro','fRes','fMotivo'].forEach(function(i){$(i).addEventListener('change',onFilter)});
$('fPlaca').addEventListener('input',onFilter);
$('btnLimpar').addEventListener('click',function(){
  limparFiltros();renderAll();
});
$('btnRecarregar').addEventListener('click',function(){carregarRepo()});
$('btnPdf').addEventListener('click',baixarPdf);
$('tabs').addEventListener('click',function(e){var b=e.target.closest('.tab');if(b)trocarCliente(b.getAttribute('data-id'))});
window.addEventListener('hashchange',function(){trocarCliente(location.hash.slice(1),true)});
$('btnExportar').addEventListener('click',function(){
  var q=function(s){s=String(s==null?'':s);return /[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
  var linhas=['Identificador;Data Validação;Motivo;Resultado;Erro'].concat(lastRows.slice().sort(function(a,b){return a.data<b.data?1:-1}).map(function(r){
    return [r.placa,fmtData(r.data),r.motivo,r.ok?'OK':'NOK',r.erros.join(' + ')].map(q).join(';')}));
  var blob=new Blob(['﻿'+linhas.join('\r\n')],{type:'text/csv;charset=utf-8'});
  var url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='validacao-ia-'+state.cur+'-filtro.csv';document.body.appendChild(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(url)},1000);
  toast('Arquivo gerado.');
});
if(window.ResizeObserver){var rt;new ResizeObserver(function(){clearTimeout(rt);rt=setTimeout(function(){drawDias(lastRows)},80)}).observe($('chartDias'))}

/* ---------- início ---------- */
renderRegra();
(function(){
  var id=location.hash.slice(1);
  if(!cliente(id)){try{id=localStorage.getItem('cliente')}catch(e){}}
  if(cliente(id))state.cur=id;
  renderAbas();
  if(typeof XLSX==='undefined'){falhar(state.cur,'Não consegui carregar vendor/xlsx.full.min.js. Confira se a pasta vendor foi enviada para o repositório.')}
  else carregarRepo();
})();
})();
