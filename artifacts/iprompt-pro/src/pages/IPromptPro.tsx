import { useEffect, useRef, useState, useCallback } from 'react';
import '../iprompt.css';

// ── Storage helpers ────────────────────────────────────────────────────────────
const KEYS_STORE = 'ip_apikeys_v2';
const CHATS_STORE = 'ip_chats_v2';

function getKeys(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(KEYS_STORE) ?? '{}'); } catch { return {}; }
}
function getKey(e: string) { return getKeys()[e] ?? ''; }
function setKey(engine: string, val: string) {
  const k = getKeys(); k[engine] = val;
  localStorage.setItem(KEYS_STORE, JSON.stringify(k));
}

interface SavedChat { id: string; title: string; messages: Message[]; updatedAt: number; }

function loadChats(): SavedChat[] {
  try { return JSON.parse(localStorage.getItem(CHATS_STORE) ?? '[]'); } catch { return []; }
}
function saveChats(chats: SavedChat[]) {
  localStorage.setItem(CHATS_STORE, JSON.stringify(chats));
}
function upsertChat(chat: SavedChat) {
  const chats = loadChats();
  const idx = chats.findIndex(c => c.id === chat.id);
  if (idx >= 0) chats[idx] = chat; else chats.unshift(chat);
  saveChats(chats);
}
function deleteChat(id: string) {
  saveChats(loadChats().filter(c => c.id !== id));
}

function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function relativeDate(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

// ── Markdown ──────────────────────────────────────────────────────────────────
function escHtml(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderMarkdown(text: string): string {
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const l = lang || 'code';
    const id = 'cb' + Math.random().toString(36).slice(2);
    return `<div class="ip-code-block"><div class="ip-code-header"><span>${l}</span><button class="ip-copy-code" data-target="${id}">Copy</button></div><pre id="${id}">${escHtml(code.trim())}</pre></div>`;
  });
  text = text.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/^---+$/gm, '<hr>');
  text = text.replace(/(^[*\-] .+\n?)+/gm, m => {
    const items = m.trim().split('\n').map(l => `<li>${l.replace(/^[*\-] /, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });
  text = text.replace(/(^\d+\. .+\n?)+/gm, m => {
    const items = m.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });
  text = text.split(/\n{2,}/).map(p => {
    p = p.trim(); if (!p) return '';
    if (/^<[huo]|<hr|<blockquote|<div/.test(p)) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');
  return text;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message { role: 'user' | 'assistant'; content: string; }

const CHIPS = [
  '✍️ Help me write a cover letter',
  '💻 Explain recursion with examples',
  '📖 Summarise this concept: blockchain',
  '🎨 Describe a fantasy scene in poetic style',
  '🚀 Give me 5 startup ideas for 2025',
  '📊 How do I analyse data with Python?',
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function IPromptPro() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>(() => newId());
  const [historyChats, setHistoryChats] = useState<SavedChat[]>(() => loadChats());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [engine, setEngine] = useState('groq');
  const [streaming, setStreaming] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyExpired, setKeyExpired] = useState(false);
  const [modalEngine, setModalEngine] = useState('groq');
  const [keyInput, setKeyInput] = useState('');
  const [noKey, setNoKey] = useState(false);

  const [ppOpen, setPpOpen] = useState(false);
  const [ppGoal, setPpGoal] = useState('chat');
  const [ppKeywords, setPpKeywords] = useState<string[]>([]);
  const [ppGenerating, setPpGenerating] = useState(false);

  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  const currentChatIdRef = useRef(currentChatId);
  currentChatIdRef.current = currentChatId;
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg); setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2400);
  }, []);

  useEffect(() => {
    const key = getKey('groq') || getKey('gemini');
    if (!key) { setShowKeyModal(true); setNoKey(true); }
    else { setEngine(getKey('groq') ? 'groq' : 'gemini'); }
    document.addEventListener('click', e => {
      const btn = (e.target as HTMLElement).closest('.ip-copy-code') as HTMLElement | null;
      if (!btn) return;
      const pre = document.getElementById(btn.dataset.target ?? '');
      if (pre) navigator.clipboard.writeText(pre.textContent ?? '').then(() => toast('Code copied!'));
    });
  }, [toast]);

  useEffect(() => { setNoKey(!getKey(engine)); }, [engine]);

  const scrollDown = () => { const a = chatAreaRef.current; if (a) a.scrollTop = a.scrollHeight; };

  // Render messages from state into DOM (used when loading a past chat)
  const renderMessagesIntoDom = useCallback((msgs: Message[]) => {
    const area = chatAreaRef.current;
    if (!area) return;
    area.innerHTML = '';
    for (const m of msgs) {
      const el = document.createElement('div');
      el.className = `ip-msg ${m.role === 'user' ? 'user' : 'ai'}`;
      if (m.role === 'user') {
        el.innerHTML = `<div class="ip-avatar user">🧑</div><div class="ip-bubble">${escHtml(m.content).replace(/\n/g, '<br>')}</div>`;
      } else {
        el.innerHTML = `<div class="ip-avatar ai">iP</div><div class="ip-bubble">${renderMarkdown(m.content)}</div>`;
      }
      area.appendChild(el);
    }
    setTimeout(scrollDown, 50);
  }, []);

  const sendMessage = useCallback(async (textOverride?: string) => {
    const input = inputRef.current;
    const text = (textOverride ?? input?.value ?? '').trim();
    if (!text || streaming) return;
    const apiKey = getKey(engine);
    if (!apiKey) { setModalEngine(engine); setKeyExpired(false); setShowKeyModal(true); return; }
    if (input) { input.value = ''; input.style.height = 'auto'; }

    // append user bubble to DOM
    const area = chatAreaRef.current;
    const userEl = document.createElement('div'); userEl.className = 'ip-msg user';
    userEl.innerHTML = `<div class="ip-avatar user">🧑</div><div class="ip-bubble">${escHtml(text).replace(/\n/g, '<br>')}</div>`;
    area?.appendChild(userEl);

    const newMessages: Message[] = [...messagesRef.current, { role: 'user', content: text }];
    setMessages(newMessages);
    setStreaming(true);
    setTimeout(scrollDown, 40);

    const SYSTEM = 'You are a helpful, knowledgeable AI assistant. Answer clearly and naturally. Use markdown formatting when it helps — headers, code blocks, bullet lists. Be concise unless depth is needed.';

    const typingEl = document.createElement('div');
    typingEl.className = 'ip-msg ai'; typingEl.id = 'ip-typing';
    typingEl.innerHTML = '<div class="ip-avatar ai">iP</div><div class="ip-bubble"><div class="ip-typing"><span></span><span></span><span></span></div></div>';
    area?.appendChild(typingEl); scrollDown();

    let fullText = '';
    try {
      let res: Response;
      if (engine === 'groq') {
        res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
          body: JSON.stringify({ model: 'llama-3.3-70b-versatile', stream: true, messages: [{ role: 'system', content: SYSTEM }, ...newMessages.map(m => ({ role: m.role, content: m.content }))] }),
        });
      } else {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${apiKey}`;
        const history = newMessages.slice(0, -1).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
        res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [...history, { role: 'user', parts: [{ text }] }], systemInstruction: { parts: [{ text: SYSTEM }] }, generationConfig: { maxOutputTokens: 2048 } }) });
      }

      if (res.status === 401 || res.status === 403) {
        document.getElementById('ip-typing')?.remove();
        setKeyExpired(true); setModalEngine(engine); setShowKeyModal(true);
        throw new Error('auth');
      }
      if (!res.ok) throw new Error(`${res.status}`);

      document.getElementById('ip-typing')?.remove();
      const msgEl = document.createElement('div'); msgEl.className = 'ip-msg ai';
      const av = document.createElement('div'); av.className = 'ip-avatar ai'; av.textContent = 'iP';
      const bub = document.createElement('div'); bub.className = 'ip-bubble';
      msgEl.appendChild(av); msgEl.appendChild(bub);
      area?.appendChild(msgEl);

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      if (engine === 'groq') {
        outer: while (true) {
          const { done, value } = await reader.read(); if (done) break;
          for (const line of dec.decode(value, { stream: true }).split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const d = line.slice(6).trim(); if (d === '[DONE]') break outer;
            try { const t = JSON.parse(d).choices?.[0]?.delta?.content; if (t) { fullText += t; bub.innerHTML = renderMarkdown(fullText); scrollDown(); } } catch { /**/ }
          }
        }
      } else {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          for (const line of dec.decode(value, { stream: true }).split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try { const t = JSON.parse(line.slice(6)).candidates?.[0]?.content?.parts?.[0]?.text; if (t) { fullText += t; bub.innerHTML = renderMarkdown(fullText); scrollDown(); } } catch { /**/ }
          }
        }
      }

      const finalMessages: Message[] = [...newMessages, { role: 'assistant', content: fullText }];
      setMessages(finalMessages);

      // Save to history
      const chatId = currentChatIdRef.current;
      const title = text.slice(0, 60) + (text.length > 60 ? '…' : '');
      const saved: SavedChat = { id: chatId, title, messages: finalMessages, updatedAt: Date.now() };
      upsertChat(saved);
      setHistoryChats(loadChats());

    } catch (err: unknown) {
      document.getElementById('ip-typing')?.remove();
      if ((err as Error).message !== 'auth') {
        const errEl = document.createElement('div'); errEl.className = 'ip-msg ai';
        errEl.innerHTML = `<div class="ip-avatar ai">iP</div><div class="ip-bubble">⚠ Something went wrong. Try again.</div>`;
        area?.appendChild(errEl);
      }
    } finally {
      setStreaming(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [engine, streaming]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  };

  const startNewChat = () => {
    setMessages([]);
    setCurrentChatId(newId());
    if (chatAreaRef.current) chatAreaRef.current.innerHTML = '';
    if (inputRef.current) { inputRef.current.value = ''; inputRef.current.style.height = 'auto'; }
    setSidebarOpen(false);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const loadChat = (chat: SavedChat) => {
    setMessages(chat.messages);
    setCurrentChatId(chat.id);
    renderMessagesIntoDom(chat.messages);
    setSidebarOpen(false);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const removeChatFromHistory = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteChat(id);
    const updated = loadChats();
    setHistoryChats(updated);
    if (id === currentChatId) startNewChat();
  };

  const saveKey = () => {
    if (!keyInput.trim()) { toast('⚠ Enter a key'); return; }
    setKey(modalEngine, keyInput.trim());
    setEngine(modalEngine); setKeyInput(''); setShowKeyModal(false); setNoKey(false);
    toast('✓ Key saved!');
  };

  // ── Prompt builder ────────────────────────────────────────────────────────
  const buildPpPrompt = (): string | null => {
    const idea = (document.getElementById('pp-idea') as HTMLTextAreaElement)?.value.trim();
    if (!idea) return null;
    let si = '';
    if (ppGoal === 'chat') {
      const aud = (document.getElementById('pp-chat-aud') as HTMLSelectElement)?.value;
      const exp = (document.getElementById('pp-chat-exp') as HTMLSelectElement)?.value;
      const tone = (document.getElementById('pp-chat-tone') as HTMLSelectElement)?.value;
      const ex = document.getElementById('pp-tog1')?.classList.contains('on');
      si = `Chat/assistant prompt for: "${idea}". Audience: ${aud}, expertise: ${exp}, tone: ${tone}. ${ex ? 'Include examples.' : ''}`;
    } else if (ppGoal === 'code') {
      const lang = (document.getElementById('pp-code-lang') as HTMLSelectElement)?.value;
      const scale = (document.getElementById('pp-code-scale') as HTMLSelectElement)?.value;
      const reqs = (document.getElementById('pp-code-reqs') as HTMLInputElement)?.value;
      const tests = document.getElementById('pp-tog2')?.classList.contains('on');
      si = `Code generation prompt for: "${idea}". Language: ${lang}, scale: ${scale}. ${reqs ? 'Requirements: ' + reqs : ''} ${tests ? 'Include tests.' : ''}`;
    } else if (ppGoal === 'image') {
      const styles = [...document.querySelectorAll('#pp-style-pills .ip-pill.on')].map(p => (p as HTMLElement).dataset.v).join(', ');
      const aspect = (document.getElementById('pp-aspect') as HTMLSelectElement)?.value;
      const seeds = (document.getElementById('pp-seeds') as HTMLInputElement)?.value;
      si = `Image generation prompt for: "${idea}". Styles: ${styles || 'cinematic'}, aspect: ${aspect}, variations: ${seeds}.`;
    } else if (ppGoal === 'blog') {
      const len = (document.getElementById('pp-blog-len') as HTMLSelectElement)?.value;
      const style = (document.getElementById('pp-blog-style') as HTMLSelectElement)?.value;
      si = `Blog post prompt for: "${idea}". Length: ${len}, style: ${style}. ${ppKeywords.length ? 'SEO keywords: ' + ppKeywords.join(', ') : ''}`;
    } else if (ppGoal === 'marketing') {
      const ch = (document.getElementById('pp-mkt-ch') as HTMLSelectElement)?.value;
      const tone = (document.getElementById('pp-mkt-tone') as HTMLSelectElement)?.value;
      const aud = (document.getElementById('pp-mkt-aud') as HTMLInputElement)?.value;
      si = `${ch} marketing copy prompt for: "${idea}". Tone: ${tone}. ${aud ? 'Audience: ' + aud : ''}`;
    } else if (ppGoal === 'agent') {
      const role = (document.getElementById('pp-agent-role') as HTMLSelectElement)?.value;
      const tools = (document.getElementById('pp-agent-tools') as HTMLInputElement)?.value;
      const guard = document.getElementById('pp-tog3')?.classList.contains('on');
      si = `AI agent system prompt for: "${idea}". Role: ${role}. ${tools ? 'Tools: ' + tools : ''} ${guard ? 'Include guardrails.' : ''}`;
    }
    return `You are an expert prompt engineer. Generate a precise, production-ready prompt based on:\n\n${si}\n\nOutput ONLY the final prompt text. No preamble, no code fences.`;
  };

  const generatePrompt = async () => {
    const apiKey = getKey(engine);
    if (!apiKey) { setModalEngine(engine); setShowKeyModal(true); return; }
    const meta = buildPpPrompt();
    if (!meta) { toast('⚠ Enter your idea first'); return; }
    setPpGenerating(true);
    let result = '';
    try {
      if (engine === 'groq') {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey }, body: JSON.stringify({ model: 'llama-3.3-70b-versatile', stream: true, messages: [{ role: 'user', content: meta }] }) });
        if (!res.ok) throw new Error('Groq ' + res.status);
        const reader = res.body!.getReader(); const dec = new TextDecoder();
        outer: while (true) {
          const { done, value } = await reader.read(); if (done) break;
          for (const line of dec.decode(value, { stream: true }).split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const d = line.slice(6).trim(); if (d === '[DONE]') break outer;
            try { const t = JSON.parse(d).choices?.[0]?.delta?.content; if (t) result += t; } catch { /**/ }
          }
        }
      } else {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${apiKey}`;
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: meta }] }], generationConfig: { maxOutputTokens: 1800 } }) });
        if (!res.ok) throw new Error('Gemini ' + res.status);
        const reader = res.body!.getReader(); const dec = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          for (const line of dec.decode(value, { stream: true }).split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try { const t = JSON.parse(line.slice(6)).candidates?.[0]?.content?.parts?.[0]?.text; if (t) result += t; } catch { /**/ }
          }
        }
      }
      if (result && inputRef.current) {
        inputRef.current.value = result.trim();
        autoResize(inputRef.current);
        setPpOpen(false);
        inputRef.current.focus();
        toast('✦ Prompt ready — press Enter to send!');
      }
    } catch { toast('⚠ Generation failed'); }
    finally { setPpGenerating(false); }
  };

  // ── Group chats by date ───────────────────────────────────────────────────
  const groupChats = () => {
    const today: SavedChat[] = [], week: SavedChat[] = [], older: SavedChat[] = [];
    const now = Date.now();
    for (const c of historyChats) {
      const diff = now - c.updatedAt;
      if (diff < 86_400_000) today.push(c);
      else if (diff < 7 * 86_400_000) week.push(c);
      else older.push(c);
    }
    return { today, week, older };
  };
  const { today, week, older } = groupChats();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* KEY MODAL */}
      <div className={`ip-modal-overlay${showKeyModal ? ' show' : ''}`}>
        <div className="ip-modal">
          <div className="ip-modal-title">🔑 {keyExpired ? 'Key Rejected' : 'API Key Required'}</div>
          <div className="ip-modal-sub">{keyExpired ? 'Your API key was rejected. Update it to continue.' : 'Enter your key — saved in your browser only, never shared.'}</div>
          <div className="ip-field">
            <label className="ip-fl">Engine</label>
            <select value={modalEngine} onChange={e => setModalEngine(e.target.value)} style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--rs)', color: 'var(--text)', fontFamily: 'DM Sans,sans-serif', fontSize: 13, padding: '9px 11px', outline: 'none', appearance: 'none' }}>
              <option value="groq">⚡ Groq — Llama 3.3 (free tier)</option>
              <option value="gemini">✦ Gemini 2.0 Flash (Google AI Studio)</option>
            </select>
          </div>
          <div className="ip-field">
            <label className="ip-fl">API Key</label>
            <input type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveKey()} placeholder="Paste your key here…" autoComplete="off" />
            <div className="ip-modal-hint">{modalEngine === 'groq' ? 'Free key at console.groq.com' : 'Free key at aistudio.google.com'}</div>
          </div>
          <div className="ip-modal-actions">
            <button className="ip-btn-primary" style={{ fontSize: 13 }} onClick={saveKey}>Save & Continue</button>
            <button className="ip-btn-ghost2" onClick={() => setShowKeyModal(false)}>Cancel</button>
          </div>
        </div>
      </div>

      {/* HISTORY SIDEBAR */}
      <div className={`ip-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />
      <div className={`ip-sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="ip-sidebar-header">
          <div className="ip-sidebar-title">💬 Chat History</div>
          <div className="ip-sidebar-close" onClick={() => setSidebarOpen(false)}>✕</div>
        </div>
        <button className="ip-sidebar-new" onClick={startNewChat}>＋ New Chat</button>
        <div className="ip-sidebar-list">
          {historyChats.length === 0 && (
            <div className="ip-sidebar-empty">No saved chats yet.<br />Start a conversation and it will appear here.</div>
          )}
          {today.length > 0 && <div className="ip-sidebar-group-label">Today</div>}
          {today.map(c => (
            <div key={c.id} className={`ip-sidebar-item${c.id === currentChatId ? ' active' : ''}`} onClick={() => loadChat(c)}>
              <div className="ip-sidebar-item-text">
                <div className="ip-sidebar-item-title">{c.title}</div>
                <div className="ip-sidebar-item-date">{relativeDate(c.updatedAt)}</div>
              </div>
              <div className="ip-sidebar-item-del" onClick={e => removeChatFromHistory(e, c.id)}>✕</div>
            </div>
          ))}
          {week.length > 0 && <div className="ip-sidebar-group-label">This week</div>}
          {week.map(c => (
            <div key={c.id} className={`ip-sidebar-item${c.id === currentChatId ? ' active' : ''}`} onClick={() => loadChat(c)}>
              <div className="ip-sidebar-item-text">
                <div className="ip-sidebar-item-title">{c.title}</div>
                <div className="ip-sidebar-item-date">{relativeDate(c.updatedAt)}</div>
              </div>
              <div className="ip-sidebar-item-del" onClick={e => removeChatFromHistory(e, c.id)}>✕</div>
            </div>
          ))}
          {older.length > 0 && <div className="ip-sidebar-group-label">Older</div>}
          {older.map(c => (
            <div key={c.id} className={`ip-sidebar-item${c.id === currentChatId ? ' active' : ''}`} onClick={() => loadChat(c)}>
              <div className="ip-sidebar-item-text">
                <div className="ip-sidebar-item-title">{c.title}</div>
                <div className="ip-sidebar-item-date">{relativeDate(c.updatedAt)}</div>
              </div>
              <div className="ip-sidebar-item-del" onClick={e => removeChatFromHistory(e, c.id)}>✕</div>
            </div>
          ))}
        </div>
      </div>

      {/* PROMPTS PANEL */}
      <div className={`ip-overlay${ppOpen ? ' open' : ''}`} onClick={() => setPpOpen(false)} />
      <div className={`ip-pp${ppOpen ? ' open' : ''}`}>
        <div className="ip-pp-header">
          <div className="ip-pp-title">✦ Prompt Builder</div>
          <div className="ip-pp-close" onClick={() => setPpOpen(false)}>✕</div>
        </div>
        <div className="ip-pp-body">
          <div className="ip-sl">Goal</div>
          <div className="ip-goal-grid">
            {([['chat','💬','Chat / QA'],['code','💻','Code'],['image','🎨','Image AI'],['blog','✍️','Blog'],['marketing','📣','Marketing'],['agent','🤖','Agent']] as [string,string,string][]).map(([g, icon, label]) => (
              <button key={g} className={`ip-goal-btn${ppGoal === g ? ' active' : ''}`} onClick={() => setPpGoal(g)}>
                <span className="ig">{icon}</span>{label}
              </button>
            ))}
          </div>
          <div className="ip-field">
            <label className="ip-fl">Your Idea</label>
            <textarea id="pp-idea" placeholder="Describe what you need…" style={{ minHeight: 70 }} />
          </div>
          {ppGoal === 'chat' && <>
            <div className="ip-row2">
              <div className="ip-field"><label className="ip-fl">Audience</label><select id="pp-chat-aud"><option>General public</option><option>Developers</option><option>Students</option><option>Executives</option></select></div>
              <div className="ip-field"><label className="ip-fl">Expertise</label><select id="pp-chat-exp"><option>Beginner</option><option>Intermediate</option><option>Expert</option></select></div>
            </div>
            <div className="ip-field"><label className="ip-fl">Tone</label><select id="pp-chat-tone"><option>Informative &amp; Neutral</option><option>Friendly &amp; Conversational</option><option>Direct &amp; Concise</option><option>Socratic</option></select></div>
            <div className="ip-tr"><span className="ip-tr-label">Include examples</span><div className="ip-tog on" id="pp-tog1" onClick={e => e.currentTarget.classList.toggle('on')} /></div>
          </>}
          {ppGoal === 'code' && <>
            <div className="ip-row2">
              <div className="ip-field"><label className="ip-fl">Language</label><select id="pp-code-lang"><option>Python</option><option>TypeScript</option><option>JavaScript</option><option>React</option><option>Go</option><option>Rust</option></select></div>
              <div className="ip-field"><label className="ip-fl">Scale</label><select id="pp-code-scale"><option>Snippet</option><option>Module</option><option>Full Service</option><option>Full Stack</option></select></div>
            </div>
            <div className="ip-field"><label className="ip-fl">Requirements</label><input type="text" id="pp-code-reqs" placeholder="e.g. no ORM, async/await…" /></div>
            <div className="ip-tr"><span className="ip-tr-label">Include tests</span><div className="ip-tog on" id="pp-tog2" onClick={e => e.currentTarget.classList.toggle('on')} /></div>
          </>}
          {ppGoal === 'image' && <>
            <div className="ip-field"><label className="ip-fl">Style Presets</label>
              <div className="ip-pills" id="pp-style-pills">
                {([['cinematic lighting','Cinematic'],['concept art','Concept Art'],['photorealistic, 8k','Photorealistic'],['anime style','Anime'],['watercolor','Watercolor'],['cyberpunk, neon','Cyberpunk']] as [string,string][]).map(([v, label]) => (
                  <span key={v} className="ip-pill on" data-v={v} onClick={e => e.currentTarget.classList.toggle('on')}>{label}</span>
                ))}
              </div>
            </div>
            <div className="ip-row2">
              <div className="ip-field"><label className="ip-fl">Aspect</label><select id="pp-aspect"><option>1:1</option><option>16:9</option><option>2:3</option><option>4:5</option></select></div>
              <div className="ip-field"><label className="ip-fl">Variations</label><input type="number" id="pp-seeds" defaultValue={3} min={1} max={5} /></div>
            </div>
          </>}
          {ppGoal === 'blog' && <>
            <div className="ip-row2">
              <div className="ip-field"><label className="ip-fl">Length</label><select id="pp-blog-len"><option>Short (~600w)</option><option>Medium (~1500w)</option><option>Long (~3000w)</option></select></div>
              <div className="ip-field"><label className="ip-fl">Style</label><select id="pp-blog-style"><option>How-To</option><option>Opinion</option><option>Listicle</option><option>Narrative</option></select></div>
            </div>
            <div className="ip-field"><label className="ip-fl">SEO Keywords</label>
              <div className="ip-tags-wrap" onClick={() => document.getElementById('pp-kw-input')?.focus()}>
                {ppKeywords.map(k => <span key={k} className="ip-tag">{k}<span className="ip-tag-x" onClick={() => setPpKeywords(p => p.filter(x => x !== k))}>×</span></span>)}
                <input id="pp-kw-input" placeholder="Type + Enter" onKeyDown={e => {
                  const t = e.target as HTMLInputElement;
                  if ((e.key === 'Enter' || e.key === ',') && t.value.trim()) { e.preventDefault(); setPpKeywords(p => p.includes(t.value.trim()) ? p : [...p, t.value.trim()]); t.value = ''; }
                }} />
              </div>
            </div>
          </>}
          {ppGoal === 'marketing' && <>
            <div className="ip-row2">
              <div className="ip-field"><label className="ip-fl">Channel</label><select id="pp-mkt-ch"><option>Social Media</option><option>Email</option><option>Paid Ads</option><option>Landing Page</option></select></div>
              <div className="ip-field"><label className="ip-fl">Tone</label><select id="pp-mkt-tone"><option>Friendly</option><option>Professional</option><option>Urgent &amp; Bold</option><option>Playful</option></select></div>
            </div>
            <div className="ip-field"><label className="ip-fl">Audience</label><input type="text" id="pp-mkt-aud" placeholder="e.g. indie devs" /></div>
          </>}
          {ppGoal === 'agent' && <>
            <div className="ip-row2">
              <div className="ip-field"><label className="ip-fl">Role</label><select id="pp-agent-role"><option>Research Assistant</option><option>Data Analyst</option><option>Customer Support</option><option>Code Reviewer</option></select></div>
              <div className="ip-field"><label className="ip-fl">Memory</label><select><option>None</option><option>Session</option><option>Persistent</option></select></div>
            </div>
            <div className="ip-field"><label className="ip-fl">Tools</label><input type="text" id="pp-agent-tools" placeholder="web_search, code_interpreter…" /></div>
            <div className="ip-tr"><span className="ip-tr-label">Include guardrails</span><div className="ip-tog on" id="pp-tog3" onClick={e => e.currentTarget.classList.toggle('on')} /></div>
          </>}
        </div>
        <div className="ip-pp-footer">
          <button className="ip-btn-primary" disabled={ppGenerating} onClick={generatePrompt}>
            {ppGenerating && <div className="ip-pp-spinner" />}
            <span>{ppGenerating ? 'Generating…' : '✦ Generate & Use Prompt'}</span>
          </button>
          <button className="ip-btn-ghost2" onClick={() => setPpOpen(false)}>Cancel</button>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div className="ip-chat-layout">
        <header className="ip-header">
          <div className="ip-brand">
            <div className="ip-logo">iP</div>
            <div className="ip-brand-name">iPrompt <span>AI</span></div>
          </div>
          <div className="ip-header-mid">
            <div className="ip-model-pill">
              <select value={engine} onChange={e => {
                const v = e.target.value; setEngine(v);
                if (!getKey(v)) { setModalEngine(v); setKeyExpired(false); setShowKeyModal(true); }
              }}>
                <option value="groq">⚡ Groq — Llama 3.3 70B</option>
                <option value="gemini">✦ Gemini 2.0 Flash</option>
              </select>
            </div>
          </div>
          <div className="ip-header-actions">
            <button className="ip-hbtn" onClick={() => setSidebarOpen(true)}>
              💬 History {historyChats.length > 0 && <span style={{ marginLeft: 4, background: 'rgba(99,179,237,0.2)', color: 'var(--accent)', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>{historyChats.length}</span>}
            </button>
            <button className="ip-hbtn accent" onClick={() => setPpOpen(true)}>✦ Prompts</button>
            <button className="ip-hbtn" onClick={startNewChat}>＋ New</button>
            <button className="ip-hbtn" onClick={() => { setModalEngine(engine); setKeyExpired(false); setShowKeyModal(true); }}>🔑</button>
          </div>
        </header>

        <div className={`ip-key-banner${noKey ? ' show' : ''}`}>
          <span>⚠ No API key — enter one to start chatting</span>
          <button onClick={() => { setModalEngine(engine); setKeyExpired(false); setShowKeyModal(true); }}>Set Key</button>
        </div>

        <div className="ip-chat-area" ref={chatAreaRef}>
          {messages.length === 0 && (
            <div className="ip-welcome">
              <div className="ip-welcome-icon">✦</div>
              <h2>What can I help you with?</h2>
              <p>Ask me anything — writing, coding, explaining, analysing, brainstorming, and more. Use <strong>✦ Prompts</strong> to build expert-level prompts.</p>
              <div className="ip-chips">
                {CHIPS.map(c => (
                  <div key={c} className="ip-chip" onClick={() => sendMessage(c.replace(/^[^\s]+\s/, ''))}>{c}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="ip-input-wrap">
          <div className="ip-input-row">
            <textarea ref={inputRef} id="ip-chatInput" placeholder="Ask anything…" rows={1} onKeyDown={handleKeyDown} onInput={e => autoResize(e.currentTarget)} />
            <button className="ip-send-btn" disabled={streaming} onClick={() => sendMessage()}>↑</button>
          </div>
          <div className="ip-input-hint">
            <span>Enter to send &nbsp;·&nbsp; Shift+Enter for newline</span>
            <button onClick={startNewChat}>Clear chat</button>
          </div>
        </div>
      </div>

      <div className={`ip-toast${toastVisible ? ' show' : ''}`}>{toastMsg}</div>
    </>
  );
}
