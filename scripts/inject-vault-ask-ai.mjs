import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'public', 'legacy');

const mounts = [
  {
    file: 'GA_Cashflow_V1.html',
    bumpCf: true,
    snippet: `
<script src="/legacy/ga_vault_ask_ai.js"></script>
<script>
(function(){
  function buildContext(){
    try{
      var d = (typeof _cfData!=='undefined' && _cfData) ? _cfData : null;
      var raw = null;
      try{ raw = localStorage.getItem('ga_cf_v1'); }catch(e){}
      var parsed = null;
      try{ parsed = raw ? JSON.parse(raw) : null; }catch(e){}
      var src = d || (parsed && parsed.data) || parsed || {};
      var projs = src.projects || src.projs || [];
      var totals = { projects: Array.isArray(projs)?projs.length:0, version: (typeof CF_VERSION!=='undefined'?CF_VERSION:null) };
      var hotItems = [];
      if(Array.isArray(projs)){
        projs.slice(0,20).forEach(function(p){
          hotItems.push({ title: p.name||p.id||'Project', detail: (p.loc||'')+' '+(p.status||''), status: p.status||'' });
        });
      }
      return { generatedAt:new Date().toISOString(), app:'v1_cashflow', totals:totals, hotItems:hotItems, summary: GAVaultAskAI.contextFromLocalStorage(['ga_cf_v1','ga_cf_tally_settings']).storage };
    }catch(e){
      return { totals:{ error:String(e&&e.message||e) }, hotItems:[] };
    }
  }
  GAVaultAskAI.mount({ appId:'v1_cashflow', appLabel:'Cashflow V1', title:'Ask Cashflow', buildContext:buildContext,
    examples:['What is cash pressure across projects?','Which projects need collection focus?','Prescribe actions for payables this week.'] });
})();
</script>
`,
  },
  {
    file: 'GA_Finance_KPI.html',
    snippet: `
<script src="/legacy/ga_vault_ask_ai.js"></script>
<script>
GAVaultAskAI.mount({
  appId:'finance_kpi', appLabel:'Finance KPI', title:'Ask Finance KPI',
  buildContext:function(){ return Object.assign({app:'finance_kpi'}, GAVaultAskAI.contextFromLocalStorage(['ga_finkpi_state_v2'])); },
  examples:['What compliance items are overdue?','Where are finance KPIs weak?','What should F&A prioritize this month?']
});
</script>
`,
  },
  {
    file: 'GA_MarketingSales_KPI_Dashboard.html',
    snippet: `
<script src="/legacy/ga_vault_ask_ai.js"></script>
<script>
GAVaultAskAI.mount({
  appId:'marketing_kpi', appLabel:'Marketing KPIs', title:'Ask Marketing KPIs',
  buildContext:function(){ return Object.assign({app:'marketing_kpi'}, GAVaultAskAI.contextFromLocalStorage(['ga_mkt_kpi_state_v1'])); },
  examples:['Which KPIs are off track?','Predict channel underperformance.','Prescribe marketing focus for this week.']
});
</script>
`,
  },
  {
    file: 'ga_sales_dashboard.html',
    snippet: `
<script src="/legacy/ga_vault_ask_ai.js"></script>
<script>
GAVaultAskAI.mount({
  appId:'sales_dashboard', appLabel:'Sales Dashboard', title:'Ask Sales',
  buildContext:function(){
    var keys=[];
    try{ for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(k&&(/sales|crm|booking|inventory/i.test(k)||k.indexOf('ga_')===0)) keys.push(k); } }catch(e){}
    return Object.assign({app:'sales_dashboard'}, GAVaultAskAI.contextFromLocalStorage(keys.slice(0,12)));
  },
  examples:['What is inventory and booking risk?','Where are sales bottlenecks?','What should sales leadership do this week?']
});
</script>
`,
  },
];

for (const m of mounts) {
  const p = path.join(dir, m.file);
  if (!fs.existsSync(p)) {
    console.log('skip missing', m.file);
    continue;
  }
  let html = fs.readFileSync(p, 'utf8');
  if (html.includes('ga_vault_ask_ai.js')) {
    console.log('already', m.file);
    continue;
  }
  if (!/<\/body>/i.test(html)) {
    console.log('no body', m.file);
    continue;
  }
  html = html.replace(/<\/body>/i, `${m.snippet}\n</body>`);
  if (m.bumpCf) {
    html = html.replace(/var CF_VERSION = 55;/, 'var CF_VERSION = 56;');
    html = html.replace(/var CF_VERSION = 56;/, 'var CF_VERSION = 56;'); // idempotent
    if (!/var CF_VERSION = 56;/.test(html) && /var CF_VERSION = \d+;/.test(html)) {
      html = html.replace(/var CF_VERSION = \d+;/, 'var CF_VERSION = 56;');
    }
  }
  fs.writeFileSync(p, html);
  console.log('patched', m.file);
}
