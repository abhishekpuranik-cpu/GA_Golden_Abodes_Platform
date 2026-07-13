/**
 * Shared Ask AI widget for Vault legacy HTML apps.
 * Usage:
 *   <script src="/legacy/ga_vault_ask_ai.js"></script>
 *   <script>
 *     GAVaultAskAI.mount({ appId: 'v1_cashflow', appLabel: 'Cashflow V1', buildContext: function(){ return {...}; } });
 *   </script>
 */
(function (global) {
  'use strict';

  function joinTranscript(base, chunk) {
    var a = String(base || '').replace(/\s+$/, '');
    var b = String(chunk || '').trim();
    if (!b) return a;
    if (!a) return b;
    var needsSpace = !/[\s([{/]$/.test(a) && !/^[.,!?;:)\]}]/.test(b);
    return needsSpace ? a + ' ' + b : a + b;
  }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'style' && typeof attrs[k] === 'object') {
          Object.assign(n.style, attrs[k]);
        } else if (k === 'text') n.textContent = attrs[k];
        else if (k === 'html') n.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else n.setAttribute(k, attrs[k]);
      });
    }
    (kids || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function ensureCss() {
    if (document.getElementById('ga-vault-ask-css')) return;
    var css = document.createElement('style');
    css.id = 'ga-vault-ask-css';
    css.textContent =
      '.gai-fab{position:fixed;right:16px;bottom:16px;z-index:99999;padding:12px 16px;border-radius:999px;border:none;background:linear-gradient(135deg,#1A304A,#253E60);color:#fff;font:700 13px DM Sans,system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(26,48,74,.28)}' +
      '.gai-panel{position:fixed;right:16px;bottom:70px;z-index:99999;width:min(420px,calc(100vw - 24px));max-height:min(80vh,680px);overflow:auto;background:#FBF9F5;border:1px solid #E2DDD4;border-radius:14px;box-shadow:0 16px 48px rgba(0,0,0,.22);padding:14px;font:14px DM Sans,system-ui,sans-serif;color:#1A1815}' +
      '.gai-title{font-weight:700;color:#1A304A;font-size:16px;margin:0 0 4px}' +
      '.gai-sub{font-size:11px;color:#55504A;margin:0 0 8px}' +
      '.gai-input{width:100%;box-sizing:border-box;min-height:72px;border:1.5px solid #E2DDD4;border-radius:8px;padding:10px;font:14px inherit;resize:vertical}' +
      '.gai-row{display:flex;gap:8px;margin:8px 0;flex-wrap:wrap;align-items:center}' +
      '.gai-btn{padding:8px 12px;border-radius:8px;border:none;background:#1A304A;color:#fff;font-weight:700;cursor:pointer;font-size:12px}' +
      '.gai-btn:disabled{opacity:.5;cursor:not-allowed}' +
      '.gai-ghost{padding:8px 12px;border-radius:8px;border:1px solid #E2DDD4;background:#fff;cursor:pointer;font-size:12px}' +
      '.gai-mic.on{border-color:#B32E1E;background:#FCECEA;color:#B32E1E}' +
      '.gai-chip{border:1px solid #E2DDD4;background:#fff;border-radius:999px;padding:4px 8px;font-size:11px;cursor:pointer;margin:2px}' +
      '.gai-ans{margin-top:10px;padding-top:10px;border-top:1px solid #E2DDD4;font-size:13px;line-height:1.5;white-space:pre-wrap}' +
      '.gai-warn{background:#FDF3E8;border:1px solid #E8C490;color:#AE6418;padding:8px;border-radius:6px;font-size:12px;margin:8px 0}' +
      '.gai-chart{margin:8px 0;padding:8px;border:1px solid #E2DDD4;border-radius:10px;background:#fff}.gai-chart-t{font-size:12px;font-weight:700;color:#1A304A}.gai-chart-n{font-size:11px;color:#55504A;margin:4px 0 8px;line-height:1.4}.gai-bar-row{display:flex;align-items:center;gap:6px;margin:3px 0;font-size:11px}.gai-bar-lab{width:88px;text-align:right;color:#55504A;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gai-bar-track{flex:1;height:12px;background:#EAE6DC;border-radius:4px;overflow:hidden}.gai-bar-fill{height:100%;background:#1A304A;border-radius:4px}.gai-bar-val{width:36px;font-weight:700;color:#1A304A}.gai-sec{margin:8px 0;padding:8px 10px;border-radius:10px;border:1px solid #E2DDD4;background:#FAFAF8}.gai-sec-k{font-size:10px;font-weight:700;text-transform:uppercase;color:#9A6E20}.gai-headline{font-size:15px;font-weight:700;color:#1A304A;margin:0 0 8px}.gai-meta{font-size:10px;font-weight:700;text-transform:uppercase;color:#9A6E20;margin-bottom:6px}';
    document.head.appendChild(css);
  }

  function localAnswer(question, context, appId) {
    var totals = (context && (context.totals || context.summary)) || {};
    var items = (context && (context.hotItems || context.items)) || [];
    var md = '### Answer (local · ' + (appId || 'app') + ')\n\n#### Snapshot\n';
    var keys = Object.keys(totals);
    if (keys.length) {
      keys.slice(0, 12).forEach(function (k) {
        md += '- **' + k + '**: ' + totals[k] + '\n';
      });
    } else md += '_No structured totals — data may still be loading._\n';
    if (items.length) {
      md += '\n#### Hotspots\n';
      items.slice(0, 8).forEach(function (it) {
        md += '- **' + (it.title || it.name || 'Item') + '**' + (it.detail ? ' — ' + it.detail : '') + '\n';
      });
    }
    md += '\n#### Focus\n1. Clear top hotspots.\n2. Confirm owners and dates.\n3. Re-ask with a narrower scope.\n';
    md += '\n_Question: “' + String(question || '').slice(0, 180) + '”_\n';
    md += '\n_Local engine — set ANTHROPIC_API_KEY on Render for full LLM answers._';
    var charts=[];
    var keys=Object.keys(totals).filter(function(k){return typeof totals[k]==='number';}).slice(0,6);
    if(keys.length>=2){ charts.push({ title:'Key metrics', narrative:'Numeric totals in the current app snapshot.', data: keys.map(function(k){return {label:k,value:totals[k]};}) }); }
    if(items.length){ charts.push({ title:'Hotspots', narrative:'Relative pressure of flagged items.', data: items.slice(0,6).map(function(it,i){return {label:String(it.title||it.name||('Item '+(i+1))).slice(0,14), value: it.risk||it.count||1};}) }); }
    var sections=[
      {kind:'informative', title:'What the data shows', narrative: keys.length ? ('Snapshot has '+keys.length+' numeric metrics and '+items.length+' hotspot(s).') : 'Limited structured totals available.'},
      {kind:'prescriptive', title:'What to do next', narrative:'Clear top hotspots, confirm owners/dates, then re-ask with a narrower scope.'}
    ];
    return { source: 'local', markdown: md, headline: items.length ? (items.length+' hotspot(s) need attention') : ('Health check · '+(appId||'app')), charts: charts, sections: sections };
  }

  function renderRich(ans, ansEl){
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
  function askApi(opts, question, context) {
    return fetch('/api/vault/analytics-ask', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: opts.appId,
        appLabel: opts.appLabel,
        question: question,
        context: context || {},
      }),
    }).then(function (r) {
      return r.json().then(function (data) {
        return { ok: r.ok, status: r.status, data: data };
      });
    });
  }

  function mount(opts) {
    opts = opts || {};
    if (!opts.appId) throw new Error('GAVaultAskAI.mount requires appId');
    ensureCss();
    if (document.getElementById('gai-root')) return;

    var root = el('div', { id: 'gai-root' });
    var panelOpen = false;
    var listening = false;
    var interim = '';
    var question = '';
    var recog = null;
    var want = false;

    var fab = el('button', {
      class: 'gai-fab',
      type: 'button',
      text: '✦ Ask AI',
      onclick: function () {
        panelOpen = !panelOpen;
        panel.style.display = panelOpen ? 'block' : 'none';
      },
    });

    var title = el('div', { class: 'gai-title', text: opts.title || 'Ask AI' });
    var sub = el('div', { class: 'gai-sub', text: (opts.appLabel || opts.appId) + ' · live data · voice supported' });
    var input = el('textarea', { class: 'gai-input', rows: '3', placeholder: 'Ask anything — risks, forecasts, what to do next…' });
    var micBtn = el('button', { class: 'gai-ghost', type: 'button', text: '🎤 Voice' });
    var askBtn = el('button', { class: 'gai-btn', type: 'button', text: 'Ask' });
    var clearBtn = el('button', { class: 'gai-ghost', type: 'button', text: 'Clear' });
    var chips = el('div');
    var ans = el('div', { class: 'gai-ans' });
    var warn = el('div', { class: 'gai-warn', style: { display: 'none' } });
    var meta = el('div', { class: 'gai-meta' });

    (opts.examples || [
      'What are the biggest risks right now?',
      'What should we prioritize this week?',
      'Predict what will slip next.',
    ]).forEach(function (ex) {
      chips.appendChild(
        el('button', {
          class: 'gai-chip',
          type: 'button',
          text: ex,
          onclick: function () {
            input.value = ex;
            runAsk(ex);
          },
        }),
      );
    });

    function stopSpeech() {
      want = false;
      listening = false;
      interim = '';
      micBtn.classList.remove('on');
      micBtn.textContent = '🎤 Voice';
      if (recog) {
        try {
          recog.onend = null;
          recog.stop();
        } catch (e) {}
        recog = null;
      }
    }

    function startSpeech() {
      var Ctor = global.SpeechRecognition || global.webkitSpeechRecognition;
      if (!Ctor) {
        warn.style.display = 'block';
        warn.textContent = 'Voice needs Chrome or Edge.';
        return;
      }
      stopSpeech();
      want = true;
      function once() {
        if (!want) return;
        recog = new Ctor();
        recog.continuous = true;
        recog.interimResults = true;
        recog.lang = 'en-IN';
        recog.onstart = function () {
          listening = true;
          micBtn.classList.add('on');
          micBtn.textContent = '⏹ Stop';
        };
        recog.onresult = function (event) {
          var finals = '';
          var inter = '';
          for (var i = event.resultIndex; i < event.results.length; i++) {
            var piece = (event.results[i][0] && event.results[i][0].transcript) || '';
            if (event.results[i].isFinal) finals += piece;
            else inter += piece;
          }
          if (finals.trim()) {
            input.value = joinTranscript(input.value, finals);
            interim = '';
          } else {
            interim = inter;
            input.value = joinTranscript(question || input.value.replace(/\s+$/, ''), inter);
          }
        };
        recog.onend = function () {
          recog = null;
          if (want) setTimeout(function () {
            if (want) once();
          }, 180);
          else {
            listening = false;
            micBtn.classList.remove('on');
            micBtn.textContent = '🎤 Voice';
          }
        };
        try {
          recog.start();
        } catch (e) {
          want = false;
        }
      }
      question = input.value;
      once();
    }

    micBtn.addEventListener('click', function () {
      if (listening) stopSpeech();
      else startSpeech();
    });

    function runAsk(qOverride) {
      var q = String(qOverride != null ? qOverride : input.value).trim();
      if (listening && interim) q = joinTranscript(q, interim).trim();
      stopSpeech();
      if (!q) return;
      input.value = q;
      askBtn.disabled = true;
      askBtn.textContent = 'Analyzing…';
      warn.style.display = 'none';
      ans.textContent = '';
      meta.textContent = '';

      var ctxPromise = Promise.resolve(
        typeof opts.buildContext === 'function' ? opts.buildContext() : opts.context || {},
      );

      ctxPromise
        .then(function (context) {
          var local = localAnswer(q, context, opts.appId);
          return askApi(opts, q, context)
            .then(function (res) {
              if (!res.ok || res.data.skippedLlm || res.data.source === 'local') {
                meta.textContent = 'Local engine';
                if (res.data && res.data.reason) {
                  warn.style.display = 'block';
                  warn.textContent = res.data.reason || res.data.error || 'AI unavailable — local answer';
                }
                renderRich(local, ans);
                return;
              }
              meta.textContent = 'AI · ' + (res.data.model || 'model');
              renderRich(Object.assign({}, local, res.data), ans);
              if (res.data.warning) {
                warn.style.display = 'block';
                warn.textContent = res.data.warning;
              }
            })
            .catch(function (e) {
              meta.textContent = 'Local engine';
              warn.style.display = 'block';
              warn.textContent = (e && e.message) || 'Network error — local answer';
              renderRich(local, ans);
            });
        })
        .finally(function () {
          askBtn.disabled = false;
          askBtn.textContent = 'Ask';
        });
    }

    askBtn.addEventListener('click', function () {
      runAsk();
    });
    clearBtn.addEventListener('click', function () {
      stopSpeech();
      input.value = '';
      ans.textContent = '';
      warn.style.display = 'none';
      meta.textContent = '';
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        runAsk();
      }
    });

    var panel = el('div', { class: 'gai-panel', style: { display: 'none' } }, [
      title,
      sub,
      input,
      el('div', { class: 'gai-row' }, [micBtn, askBtn, clearBtn]),
      chips,
      meta,
      warn,
      ans,
    ]);

    root.appendChild(fab);
    root.appendChild(panel);
    document.body.appendChild(root);
  }

  function contextFromLocalStorage(keys) {
    var bag = {};
    (keys || []).forEach(function (k) {
      try {
        var raw = localStorage.getItem(k);
        if (!raw) return;
        var parsed = JSON.parse(raw);
        bag[k] = summarize(parsed);
      } catch (e) {
        bag[k] = { present: true };
      }
    });
    return {
      generatedAt: new Date().toISOString(),
      totals: { keysLoaded: Object.keys(bag).length },
      storage: bag,
      hotItems: Object.keys(bag).map(function (k) {
        return { title: k, detail: 'localStorage snapshot' };
      }),
    };
  }

  function summarize(v, depth) {
    depth = depth || 0;
    if (v == null || typeof v !== 'object') return v;
    if (depth > 2) return Array.isArray(v) ? '[' + v.length + ']' : '{…}';
    if (Array.isArray(v)) return { count: v.length, sample: v.slice(0, 3).map(function (x) { return summarize(x, depth + 1); }) };
    var out = {};
    Object.keys(v).slice(0, 30).forEach(function (k) {
      var val = v[k];
      if (Array.isArray(val)) out[k] = { count: val.length };
      else if (val && typeof val === 'object') out[k] = summarize(val, depth + 1);
      else out[k] = val;
    });
    return out;
  }

  global.GAVaultAskAI = {
    mount: mount,
    contextFromLocalStorage: contextFromLocalStorage,
  };
})(typeof window !== 'undefined' ? window : this);
