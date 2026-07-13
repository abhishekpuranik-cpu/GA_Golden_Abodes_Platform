import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { askVaultAi, VAULT_ASK_EXAMPLES } from '../../lib/vaultAskAi.js';
import { AskAnswerVisuals } from './AskAnswerVisuals.jsx';
import './vaultAskAi.css';

function getSpeechCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function joinTranscript(base, chunk) {
  const a = String(base || '').replace(/\s+$/, '');
  const b = String(chunk || '').trim();
  if (!b) return a;
  if (!a) return b;
  const needsSpace = !/[\s([{/]$/.test(a) && !/^[.,!?;:)\]}]/.test(b);
  return needsSpace ? `${a} ${b}` : `${a}${b}`;
}

/**
 * Shared Ask AI panel for Vault React apps.
 * @param {object} props
 * @param {string} props.appId
 * @param {string} [props.appLabel]
 * @param {() => object|Promise<object>} props.buildContext — live data snapshot
 * @param {string} [props.exampleKey]
 * @param {'inline'|'fab'} [props.variant]
 */
export function VaultAskAi({
  appId,
  appLabel,
  buildContext,
  exampleKey,
  variant = 'fab',
  title = 'Ask AI',
}) {
  const [open, setOpen] = useState(variant === 'inline');
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [speechSupported] = useState(() => !!getSpeechCtor());
  const recogRef = useRef(null);
  const wantRef = useRef(false);
  const abortRef = useRef(null);

  const examples = useMemo(
    () => VAULT_ASK_EXAMPLES[exampleKey || appId] || VAULT_ASK_EXAMPLES.default,
    [exampleKey, appId],
  );

  const stopSpeech = useCallback(() => {
    wantRef.current = false;
    setListening(false);
    setInterim('');
    const r = recogRef.current;
    recogRef.current = null;
    if (r) {
      try {
        r.onend = null;
        r.onerror = null;
        r.onresult = null;
        r.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => () => stopSpeech(), [stopSpeech]);

  const startSpeech = useCallback(() => {
    const Ctor = getSpeechCtor();
    if (!Ctor) return;
    stopSpeech();
    wantRef.current = true;
    const startOnce = () => {
      if (!wantRef.current) return;
      const recog = new Ctor();
      recogRef.current = recog;
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = 'en-IN';
      recog.onstart = () => setListening(true);
      recog.onresult = (event) => {
        let finals = '';
        let inter = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const res = event.results[i];
          const piece = res?.[0]?.transcript || '';
          if (res.isFinal) finals += piece;
          else inter += piece;
        }
        if (finals.trim()) {
          setQuestion((prev) => joinTranscript(prev, finals));
          setInterim('');
        } else setInterim(inter);
      };
      recog.onerror = (e) => {
        if (e?.error === 'not-allowed') wantRef.current = false;
      };
      recog.onend = () => {
        recogRef.current = null;
        if (wantRef.current) setTimeout(() => wantRef.current && startOnce(), 180);
        else {
          setListening(false);
          setInterim('');
        }
      };
      try {
        recog.start();
      } catch {
        wantRef.current = false;
        setListening(false);
      }
    };
    startOnce();
  }, [stopSpeech]);

  const displayQ = listening && interim ? joinTranscript(question, interim) : question;

  const runAsk = async (qOverride) => {
    let q = String(qOverride != null ? qOverride : question).trim();
    if (listening && interim) q = joinTranscript(qOverride != null ? qOverride : question, interim).trim();
    stopSpeech();
    if (!q) return;
    setQuestion(q);
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setAnswer(null);
    try {
      const context = typeof buildContext === 'function' ? await buildContext() : {};
      const result = await askVaultAi({
        appId,
        appLabel,
        question: q,
        context: context || {},
        signal: ac.signal,
      });
      setAnswer(result);
    } catch (e) {
      if (e?.name !== 'AbortError') {
        setAnswer({ ok: false, error: e?.message || 'Ask failed', markdown: '' });
      }
    } finally {
      setBusy(false);
    }
  };

  const panel = (
    <div className={`vai-panel${variant === 'inline' ? ' vai-inline' : ''}`}>
      <div className="vai-head">
        <div>
          <div className="vai-eyebrow">Vault Ask AI</div>
          <div className="vai-title">{title}</div>
          <div className="vai-sub">{appLabel || appId} · grounded in live app data</div>
        </div>
        {variant === 'fab' ? (
          <button type="button" className="vai-close" onClick={() => setOpen(false)} aria-label="Close">
            ✕
          </button>
        ) : null}
      </div>

      <div className="vai-panel-scroll">
        <div className="vai-row">
          <button
            type="button"
            className={`vai-mic${listening ? ' on' : ''}`}
            disabled={busy || !speechSupported}
            title={speechSupported ? (listening ? 'Stop' : 'Dictate') : 'Voice needs Chrome/Edge'}
            onClick={() => (listening ? stopSpeech() : startSpeech())}
          >
            {listening ? '⏹' : '🎤'} Voice
          </button>
        </div>

        <textarea
          className="vai-input"
          rows={3}
          value={displayQ}
          disabled={busy}
          placeholder="Ask a specific question — name a project, person, status, or metric…"
          onChange={(e) => {
            if (listening) stopSpeech();
            setQuestion(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              runAsk();
            }
          }}
        />
        {listening ? <p className="vai-hint">Listening… tap ⏹ then Ask</p> : null}

        <div className="vai-actions">
          <button type="button" className="vai-ask" disabled={busy || !String(displayQ).trim()} onClick={() => runAsk()}>
            {busy ? 'Analyzing…' : 'Ask'}
          </button>
          <button
            type="button"
            className="vai-ghost"
            disabled={busy}
            onClick={() => {
              stopSpeech();
              setQuestion('');
              setAnswer(null);
            }}
          >
            Clear
          </button>
        </div>

        <div className="vai-chips">
          {examples.map((ex) => (
            <button key={ex} type="button" className="vai-chip" disabled={busy} onClick={() => runAsk(ex)}>
              {ex}
            </button>
          ))}
        </div>

        {answer ? (
          <div className="vai-answer">
            <div className="vai-meta">
              <span className={`vai-src vai-src-${answer.source || 'local'}`}>
                {answer.source === 'llm' ? `AI · ${answer.model || 'model'}` : 'Local engine'}
              </span>
              {answer.intent ? <span className="vai-intent">{answer.intent}</span> : null}
              {answer.contextHotCount != null ? (
                <span className="vai-ctx">
                  Evidence: {answer.contextHotCount} item(s)
                  {answer.contextHydrated ? ' · Mongo hydrated' : ''}
                </span>
              ) : null}
            </div>
            {answer.warning ? <p className="vai-warn">{answer.warning}</p> : null}
            {answer.error && !answer.markdown && !answer.sections?.length ? (
              <p className="vai-warn">{answer.error}</p>
            ) : null}
            <AskAnswerVisuals answer={answer} />
            {answer.proposedActions?.length ? (
              <div className="vai-proposals">
                <h4>Suggested next steps</h4>
                <ul>
                  {answer.proposedActions.map((a, idx) => (
                    <li key={idx}>
                      <div>
                        <strong>{a.label || a.type}</strong>
                        {a.rationale ? <div className="vai-why">{a.rationale}</div> : null}
                      </div>
                      {a.href ? (
                        <a className="vai-link" href={a.href}>
                          Open
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (variant === 'inline') return <div className="vai-root">{panel}</div>;

  return (
    <div className="vai-root">
      {!open ? (
        <button type="button" className="vai-fab" onClick={() => setOpen(true)}>
          ✦ Ask AI
        </button>
      ) : (
        <div className="vai-overlay">
          <button type="button" className="vai-backdrop" aria-label="Close" onClick={() => setOpen(false)} />
          {panel}
        </div>
      )}
    </div>
  );
}
