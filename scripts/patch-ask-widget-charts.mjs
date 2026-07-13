import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const p = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'public', 'legacy', 'ga_vault_ask_ai.js');
let s = fs.readFileSync(p, 'utf8');

if (!s.includes('.gai-chart{')) {
  s = s.replace(
    '.gai-meta{font-size:10px',
    '.gai-chart{margin:8px 0;padding:8px;border:1px solid #E2DDD4;border-radius:10px;background:#fff}.gai-chart-t{font-size:12px;font-weight:700;color:#1A304A}.gai-chart-n{font-size:11px;color:#55504A;margin:4px 0 8px;line-height:1.4}.gai-bar-row{display:flex;align-items:center;gap:6px;margin:3px 0;font-size:11px}.gai-bar-lab{width:88px;text-align:right;color:#55504A;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gai-bar-track{flex:1;height:12px;background:#EAE6DC;border-radius:4px;overflow:hidden}.gai-bar-fill{height:100%;background:#1A304A;border-radius:4px}.gai-bar-val{width:36px;font-weight:700;color:#1A304A}.gai-sec{margin:8px 0;padding:8px 10px;border-radius:10px;border:1px solid #E2DDD4;background:#FAFAF8}.gai-sec-k{font-size:10px;font-weight:700;text-transform:uppercase;color:#9A6E20}.gai-headline{font-size:15px;font-weight:700;color:#1A304A;margin:0 0 8px}.gai-meta{font-size:10px',
  );
}

if (!s.includes('function renderRich')) {
  const helper = `function renderRich(ans, ansEl){
    var html='';
    if(ans.headline) html+='<div class="gai-headline">'+esc(ans.headline)+'</div>';
    (ans.charts||[]).slice(0,3).forEach(function(c){
      html+='<div class="gai-chart"><div class="gai-chart-t">'+esc(c.title||'Chart')+'</div>';
      if(c.narrative) html+='<div class="gai-chart-n">'+esc(c.narrative)+'</div>';
      var data=c.data||[]; var max=1; data.forEach(function(d){ if((+d.value||0)>max) max=+d.value; });
      data.slice(0,8).forEach(function(d){
        var pct=Math.max(4, Math.round(((+d.value||0)/max)*100));
        html+='<div class="gai-bar-row"><div class="gai-bar-lab">'+esc(d.label||'')+'</div><div class="gai-bar-track"><div class="gai-bar-fill" style="width:'+pct+'%"></div></div><div class="gai-bar-val">'+esc(d.value)+'</div></div>';
      });
      html+='</div>';
    });
    (ans.sections||[]).forEach(function(sec){
      html+='<div class="gai-sec"><div class="gai-sec-k">'+esc(sec.kind||'insight')+'</div><strong>'+esc(sec.title||'')+'</strong><div class="gai-chart-n">'+esc(sec.narrative||sec.body||'')+'</div></div>';
    });
    if(ans.markdown) html+='<pre style="white-space:pre-wrap;font:12px/1.45 inherit;margin:8px 0 0">'+esc(ans.markdown)+'</pre>';
    ansEl.innerHTML=html;
  }
  function esc(t){ return String(t||'').replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];}); }
  function askApi`;
  s = s.replace('function askApi', helper);
  s = s.replace(/ans\.textContent = local\.markdown;/g, 'renderRich(local, ans);');
  s = s.replace(/ans\.textContent = res\.data\.markdown \|\| local\.markdown;/g, 'renderRich(Object.assign({}, local, res.data), ans);');
}

// Enrich localAnswer with charts/sections for HTML path
if (!s.includes('charts: [')) {
  s = s.replace(
    'return { source: \'local\', markdown: md };',
    `var charts=[];
    var keys=Object.keys(totals).filter(function(k){return typeof totals[k]==='number';}).slice(0,6);
    if(keys.length>=2){ charts.push({ title:'Key metrics', narrative:'Numeric totals in the current app snapshot.', data: keys.map(function(k){return {label:k,value:totals[k]};}) }); }
    if(items.length){ charts.push({ title:'Hotspots', narrative:'Relative pressure of flagged items.', data: items.slice(0,6).map(function(it,i){return {label:String(it.title||it.name||('Item '+(i+1))).slice(0,14), value: it.risk||it.count||1};}) }); }
    var sections=[
      {kind:'informative', title:'What the data shows', narrative: keys.length ? ('Snapshot has '+keys.length+' numeric metrics and '+items.length+' hotspot(s).') : 'Limited structured totals available.'},
      {kind:'prescriptive', title:'What to do next', narrative:'Clear top hotspots, confirm owners/dates, then re-ask with a narrower scope.'}
    ];
    return { source: 'local', markdown: md, headline: items.length ? (items.length+' hotspot(s) need attention') : ('Health check · '+(appId||'app')), charts: charts, sections: sections };`,
  );
}

fs.writeFileSync(p, s);
console.log('patched', p);
