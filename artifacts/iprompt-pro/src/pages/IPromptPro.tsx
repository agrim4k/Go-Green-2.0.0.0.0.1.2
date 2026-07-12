import { useEffect, useRef } from 'react';
import '../iprompt.css';

const STORAGE_KEY = 'iprompt_pro_v2';

export default function IPromptPro() {
  const initialized = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Simple toggle helper — accessible to JSX onClick
  const toggleEl = (el: HTMLElement) => el.classList.toggle('on');

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // ===== STATE =====
    let currentGoal = 'chat';
    let isGenerating = false;
    let lastResult = '';
    let keywords: string[] = [];

    // ===== HELPERS =====
    function escapeHtml(s: string) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function toast(msg: string, dur = 2200) {
      const el = document.getElementById('ip-toast');
      if (!el) return;
      el.textContent = msg;
      el.classList.add('show');
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => el.classList.remove('show'), dur);
    }

    // ===== GOAL SWITCHING =====
    const goalGrid = document.getElementById('ip-goalGrid');
    goalGrid?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.ip-goal-btn') as HTMLElement | null;
      if (!btn) return;
      document.querySelectorAll('.ip-goal-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentGoal = btn.dataset.goal ?? 'chat';
      document.querySelectorAll('.ip-gp').forEach((p) => p.classList.remove('visible'));
      document.getElementById('ip-gp-' + currentGoal)?.classList.add('visible');
      updateOutputBadge();
    });

    function updateOutputBadge() {
      const badge = document.getElementById('ip-outputBadge');
      if (!badge) return;
      const labels: Record<string, string> = { chat: 'Chat', code: 'Code', image: 'Image', blog: 'Blog', marketing: 'Marketing', agent: 'Agent' };
      const classes: Record<string, string> = { chat: 'badge-chat', code: 'badge-code', image: 'badge-image', blog: 'badge-blog', marketing: 'badge-marketing', agent: 'badge-agent' };
      badge.textContent = labels[currentGoal] ?? currentGoal;
      badge.className = 'ip-output-badge ' + (classes[currentGoal] ?? 'badge-chat');
    }

    // ===== CHAR COUNTER =====
    const ideaInput = document.getElementById('ip-ideaInput') as HTMLTextAreaElement | null;
    ideaInput?.addEventListener('input', function () {
      const counter = document.getElementById('ip-charCount');
      if (counter) counter.textContent = String((this as HTMLTextAreaElement).value.length);
    });

    // ===== KEYWORD TAGS =====
    const kwInput = document.getElementById('ip-kwInput') as HTMLInputElement | null;
    kwInput?.addEventListener('keydown', (e) => {
      const target = e.target as HTMLInputElement;
      if ((e.key === 'Enter' || e.key === ',') && target.value.trim()) {
        e.preventDefault();
        addKeyword(target.value.trim().replace(',', ''));
        target.value = '';
      }
    });

    function addKeyword(kw: string) {
      if (keywords.includes(kw)) return;
      keywords.push(kw);
      renderKeywords();
    }

    function removeKeyword(kw: string) {
      keywords = keywords.filter((k) => k !== kw);
      renderKeywords();
    }

    (window as unknown as Record<string, unknown>)['ip_removeKeyword'] = removeKeyword;

    function renderKeywords() {
      const wrap = document.getElementById('ip-kwTagsWrap');
      const inp = document.getElementById('ip-kwInput') as HTMLInputElement | null;
      if (!wrap || !inp) return;
      wrap.innerHTML = '';
      keywords.forEach((k) => {
        const span = document.createElement('span');
        span.className = 'ip-tag';
        span.innerHTML = `${escapeHtml(k)} <span class="ip-tag-x" onclick="window.ip_removeKeyword('${escapeHtml(k)}')">×</span>`;
        wrap.appendChild(span);
      });
      wrap.appendChild(inp);
    }

    // ===== PRESET PILLS =====
    document.getElementById('ip-stylePills')?.addEventListener('click', (e) => {
      const p = (e.target as HTMLElement).closest('.ip-preset-pill') as HTMLElement | null;
      if (p) p.classList.toggle('on');
    });

    // ===== HISTORY =====
    document.getElementById('ip-historyHeader')?.addEventListener('click', () => {
      document.getElementById('ip-historyPanel')?.classList.toggle('open');
    });

    function getHistory(): Array<{ t: number; goal: string; idea: string; result: string }> {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
    }

    function saveHistory(entry: { t: number; goal: string; idea: string; result: string }) {
      const arr = getHistory();
      arr.unshift(entry);
      if (arr.length > 100) arr.length = 100;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      renderHistory();
    }

    function renderHistory() {
      const arr = getHistory();
      const countEl = document.getElementById('ip-historyCount');
      if (countEl) countEl.textContent = String(arr.length);
      const list = document.getElementById('ip-historyList');
      if (!list) return;
      list.innerHTML = '';
      if (!arr.length) {
        list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:13px">No history yet</div>';
        return;
      }
      const colors: Record<string, string> = { chat: '#63b3ed', code: '#68d391', image: '#f6ad55', blog: '#9f7aea', marketing: '#fc8181', agent: '#68d391' };
      arr.slice(0, 20).forEach((entry) => {
        const div = document.createElement('div');
        div.className = 'ip-history-item';
        const t = new Date(entry.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        div.innerHTML = `
          <div class="ip-history-dot" style="background:${colors[entry.goal] ?? '#63b3ed'}"></div>
          <div class="ip-history-item-text">${escapeHtml(entry.idea?.slice(0, 60) ?? 'Prompt')}</div>
          <div class="ip-history-item-time">${t}</div>`;
        div.addEventListener('click', () => {
          showOutput(entry.result, entry.goal);
          toast('Loaded from history');
        });
        list.appendChild(div);
      });
    }

    // ===== OUTPUT DISPLAY =====
    function showOutput(text: string, goal: string) {
      lastResult = text;
      const emptyEl = document.getElementById('ip-outputEmpty');
      const pre = document.getElementById('ip-outputPre') as HTMLPreElement | null;
      if (emptyEl) emptyEl.style.display = 'none';
      if (pre) { pre.style.display = 'block'; pre.textContent = text; }
      const words = text.split(/\s+/).filter(Boolean).length;
      const metaBar = document.getElementById('ip-metaBar');
      if (metaBar) metaBar.style.display = 'flex';
      const metaGoal = document.getElementById('ip-metaGoal');
      const metaModel = document.getElementById('ip-metaModel');
      const metaWords = document.getElementById('ip-metaWords');
      const metaTime = document.getElementById('ip-metaTime');
      const modelSelect = document.getElementById('ip-modelSelect') as HTMLSelectElement | null;
      if (metaGoal) metaGoal.textContent = '🎯 ' + (goal || currentGoal);
      if (metaModel) metaModel.textContent = '🤖 ' + (modelSelect?.value ?? '');
      if (metaWords) metaWords.textContent = `📝 ${words} words`;
      if (metaTime) metaTime.textContent = '⏱ ' + new Date().toLocaleTimeString();
      updateOutputBadge();
    }

    // ===== COLLECT OPTIONS =====
    function collectOptions() {
      const goal = currentGoal;
      const modelSelect = document.getElementById('ip-modelSelect') as HTMLSelectElement;
      const verbosityEl = document.getElementById('ip-verbosity') as HTMLSelectElement;
      const model = modelSelect?.value ?? 'claude';
      const verbosity = verbosityEl?.value ?? 'detailed';
      const idea = (document.getElementById('ip-ideaInput') as HTMLTextAreaElement)?.value.trim() ?? '';
      const opts: Record<string, unknown> = { goal, model, verbosity, idea };

      if (goal === 'chat') {
        opts.audience = (document.getElementById('ip-chatAudience') as HTMLSelectElement)?.value;
        opts.expertise = (document.getElementById('ip-chatExpertise') as HTMLSelectElement)?.value;
        opts.tone = (document.getElementById('ip-chatTone') as HTMLSelectElement)?.value;
        opts.examples = document.getElementById('ip-tog-examples')?.classList.contains('on');
        opts.json = document.getElementById('ip-tog-json')?.classList.contains('on');
        opts.followup = document.getElementById('ip-tog-followup')?.classList.contains('on');
      } else if (goal === 'code') {
        opts.lang = (document.getElementById('ip-codeLang') as HTMLSelectElement)?.value;
        opts.scale = (document.getElementById('ip-codeScale') as HTMLSelectElement)?.value;
        opts.reqs = (document.getElementById('ip-codeReqs') as HTMLInputElement)?.value;
        opts.tests = document.getElementById('ip-tog-tests')?.classList.contains('on');
        opts.deploy = document.getElementById('ip-tog-deploy')?.classList.contains('on');
        opts.docker = document.getElementById('ip-tog-docker')?.classList.contains('on');
      } else if (goal === 'image') {
        const activePills = [...document.querySelectorAll('#ip-stylePills .ip-preset-pill.on')].map((p) => (p as HTMLElement).dataset.v ?? '');
        opts.styles = activePills;
        opts.aspect = (document.getElementById('ip-imgAspect') as HTMLSelectElement)?.value;
        opts.quality = (document.getElementById('ip-imgQuality') as HTMLSelectElement)?.value;
        opts.seeds = parseInt((document.getElementById('ip-imgSeeds') as HTMLInputElement)?.value ?? '3') || 3;
        opts.negative = (document.getElementById('ip-imgNeg') as HTMLInputElement)?.value;
      } else if (goal === 'blog') {
        opts.length = (document.getElementById('ip-blogLength') as HTMLSelectElement)?.value;
        opts.style = (document.getElementById('ip-blogStyle') as HTMLSelectElement)?.value;
        opts.keywords = keywords;
        opts.metaDesc = document.getElementById('ip-tog-meta')?.classList.contains('on');
        opts.intro = document.getElementById('ip-tog-intro')?.classList.contains('on');
        opts.internalLinks = document.getElementById('ip-tog-links')?.classList.contains('on');
      } else if (goal === 'marketing') {
        opts.channel = (document.getElementById('ip-mktChannel') as HTMLSelectElement)?.value;
        opts.tone = (document.getElementById('ip-mktTone') as HTMLSelectElement)?.value;
        opts.audience = (document.getElementById('ip-mktAudience') as HTMLInputElement)?.value;
        opts.cta = (document.getElementById('ip-mktCta') as HTMLInputElement)?.value;
      } else if (goal === 'agent') {
        opts.role = (document.getElementById('ip-agentRole') as HTMLSelectElement)?.value;
        opts.memory = (document.getElementById('ip-agentMemory') as HTMLSelectElement)?.value;
        opts.tools = (document.getElementById('ip-agentTools') as HTMLInputElement)?.value;
        opts.sysPrompt = document.getElementById('ip-tog-sysprompt')?.classList.contains('on');
        opts.guardrails = document.getElementById('ip-tog-guardrails')?.classList.contains('on');
        opts.examplesAgent = document.getElementById('ip-tog-examples-agent')?.classList.contains('on');
      }
      return opts;
    }

    // ===== BUILD META-PROMPT =====
    function buildMetaPrompt(opts: Record<string, unknown>, isRegen: boolean) {
      const regenNote = isRegen ? '\n\nIMPORTANT: This is a REGENERATION request. Produce a meaningfully different variation from the previous prompt — change the structure, angle, or emphasis.' : '';
      const verbMap: Record<string, string> = { concise: 'concise and focused', detailed: 'detailed and thorough', exhaustive: 'exhaustive and comprehensive' };
      const verbDesc = verbMap[opts.verbosity as string] ?? 'detailed';
      let specificInstructions = '';

      if (opts.goal === 'chat') {
        specificInstructions = `
GOAL: Generate a powerful CHAT / ASSISTANT prompt.
USER IDEA: "${opts.idea}"
TARGET MODEL: ${opts.model}
TARGET AUDIENCE: ${opts.audience}
EXPERTISE LEVEL: ${opts.expertise}
DESIRED TONE: ${opts.tone}
VERBOSITY: ${verbDesc}
INCLUDE EXAMPLES & ANALOGIES: ${opts.examples}
INCLUDE JSON METADATA: ${opts.json}
INCLUDE FOLLOW-UP QUESTIONS: ${opts.followup}

Generate a prompt that:
1. Sets up a clear, specific AI assistant persona tailored for ${opts.audience} at ${opts.expertise} level
2. Defines the task with clear success criteria
3. Specifies the expected output format and structure
4. Uses "${opts.tone}" tone throughout
5. ${opts.examples ? 'Includes a concrete example or worked analogy to illustrate the task' : 'Is direct without padding'}
6. ${opts.followup ? 'Ends with 3 follow-up question starters the AI should ask' : ''}
7. ${opts.json ? 'Appends a JSON-META block with: goal, audience, expertise, key_topics, constraints' : ''}

The prompt must be natural, specific to the idea "${opts.idea}", and NOT a generic template.`;
      } else if (opts.goal === 'code') {
        specificInstructions = `
GOAL: Generate a powerful CODE GENERATION prompt.
USER IDEA: "${opts.idea}"
TARGET MODEL: ${opts.model}
LANGUAGE / STACK: ${opts.lang}
PROJECT SCALE: ${opts.scale}
EXTRA REQUIREMENTS: ${opts.reqs || 'none'}
VERBOSITY: ${verbDesc}
INCLUDE TESTS: ${opts.tests}
INCLUDE DEPLOYMENT: ${opts.deploy}
INCLUDE DOCKER: ${opts.docker}

Generate a prompt that:
1. Frames the coding task precisely with technical context for "${opts.idea}"
2. Specifies ${opts.lang} with idiomatic patterns and best practices
3. Defines the scope (${opts.scale}) and deliverables clearly
4. ${opts.reqs ? `Enforces these constraints: ${opts.reqs}` : 'Uses sensible defaults'}
5. Requests: architecture overview, file tree, full working code for key files
6. ${opts.tests ? 'Requires unit tests with edge cases' : ''}
7. ${opts.deploy ? 'Requires deployment steps with exact commands' : ''}
8. ${opts.docker ? 'Requires a Dockerfile and docker-compose.yml' : ''}
9. Specifies error handling, logging, and security considerations`;
      } else if (opts.goal === 'image') {
        const styles = (opts.styles as string[])?.join(', ') || 'cinematic lighting';
        specificInstructions = `
GOAL: Generate ${opts.seeds} optimized IMAGE GENERATION prompts (variations/seeds).
USER IDEA: "${opts.idea}"
TARGET MODEL: ${opts.model}
ACTIVE STYLE PRESETS: ${styles}
ASPECT RATIO: ${opts.aspect}
QUALITY: ${opts.quality}
NEGATIVE PROMPTS: ${opts.negative || 'blur, watermark, text, deformed'}

For each of the ${opts.seeds} variations, generate:
1. A rich, evocative main prompt that expands "${opts.idea}" with subject description, environment/setting, lighting (${styles}), artistic medium, camera/composition notes, and quality modifiers
2. Model-specific syntax (e.g., --ar ${opts.aspect} for Midjourney)
3. A random seed value
4. Negative prompt block
5. A short JSON-META block per variation

Make each variation meaningfully DIFFERENT (different mood, angle, color palette, composition).`;
      } else if (opts.goal === 'blog') {
        const kwStr = (opts.keywords as string[])?.length ? (opts.keywords as string[]).join(', ') : 'none specified';
        specificInstructions = `
GOAL: Generate a comprehensive BLOG POST PROMPT / BRIEF.
USER IDEA: "${opts.idea}"
TARGET MODEL: ${opts.model}
POST LENGTH: ${opts.length}
WRITING STYLE: ${opts.style}
SEO KEYWORDS: ${kwStr}
VERBOSITY: ${verbDesc}
INCLUDE META DESCRIPTION: ${opts.metaDesc}
INCLUDE SAMPLE INTRO: ${opts.intro}
INCLUDE INTERNAL LINK SUGGESTIONS: ${opts.internalLinks}

Generate a prompt that instructs an AI to write a ${opts.style} blog post about "${opts.idea}" with title, structured sections, keyword integration, CTA, and consistent voice.`;
      } else if (opts.goal === 'marketing') {
        specificInstructions = `
GOAL: Generate a MARKETING COPY prompt.
USER IDEA: "${opts.idea}"
TARGET MODEL: ${opts.model}
CHANNEL: ${opts.channel}
TONE: ${opts.tone}
TARGET AUDIENCE: ${opts.audience || 'to be inferred'}
MAIN CTA: ${opts.cta || 'to be determined'}
VERBOSITY: ${verbDesc}

Generate a prompt for ${opts.channel} marketing copy for "${opts.idea}" with headline, copy variations, value propositions, CTAs, and tone guidelines.`;
      } else if (opts.goal === 'agent') {
        specificInstructions = `
GOAL: Generate a complete AI AGENT SYSTEM PROMPT.
USER IDEA: "${opts.idea}"
TARGET MODEL: ${opts.model}
AGENT ROLE: ${opts.role}
MEMORY TYPE: ${opts.memory}
AVAILABLE TOOLS: ${opts.tools || 'none'}
VERBOSITY: ${verbDesc}
INCLUDE SYSTEM PROMPT TEMPLATE: ${opts.sysPrompt}
INCLUDE GUARDRAILS: ${opts.guardrails}
INCLUDE EXAMPLE CONVERSATIONS: ${opts.examplesAgent}

Generate a complete agent configuration for "${opts.idea}" with role definition, behavioral guidelines, ${opts.tools ? `tool instructions for: ${opts.tools}` : ''}, ${opts.guardrails ? 'guardrails,' : ''} and ${opts.examplesAgent ? 'example conversation turns.' : 'response format preferences.'}`;
      }

      return `You are an expert prompt engineer with deep knowledge of ${opts.model} and AI systems.

Your task is to generate a ${verbDesc} prompt based on the user's idea. The prompt you generate will be USED DIRECTLY in ${opts.model} — so it must be precise, natural, and powerful.

${specificInstructions}

CRITICAL RULES:
- The output should be the ACTUAL PROMPT TEXT the user will paste into ${opts.model}
- Do NOT wrap in markdown code blocks
- Do NOT add meta-commentary like "Here is your prompt:" — just output the prompt
- Every element must be tailored to the specific idea: "${opts.idea}"
- Make it feel like it was written by a domain expert, not generated by a template
${regenNote}`;
    }

    // ===== GENERATE =====
    async function generate(isRegen = false) {
      const idea = (document.getElementById('ip-ideaInput') as HTMLTextAreaElement)?.value.trim() ?? '';
      if (!idea) { toast('⚠ Please enter an idea first'); return; }
      if (isGenerating) return;

      isGenerating = true;
      const generateBtn = document.getElementById('ip-generateBtn') as HTMLButtonElement;
      const spinner = document.getElementById('ip-spinner');
      const btnLabel = document.getElementById('ip-btnLabel');
      const outputBox = document.getElementById('ip-outputBox');
      const outputEmpty = document.getElementById('ip-outputEmpty');
      const pre = document.getElementById('ip-outputPre') as HTMLPreElement;

      if (generateBtn) generateBtn.disabled = true;
      if (spinner) spinner.style.display = 'flex';
      if (btnLabel) btnLabel.textContent = 'Generating…';
      if (outputBox) outputBox.classList.add('loading');
      if (outputEmpty) outputEmpty.style.display = 'none';
      if (pre) { pre.style.display = 'block'; pre.textContent = ''; }

      const opts = collectOptions();
      const metaPrompt = buildMetaPrompt(opts, isRegen);

      try {
        const engineEl = document.getElementById('ip-engineSelect') as HTMLSelectElement | null;
        const engine = engineEl?.value ?? 'groq';
        const genModel = engine === 'gemini' ? 'gemini-2.0-flash' : 'llama-3.3-70b-versatile';

        const response = await fetch('/api/claude/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: engine,
            model: genModel,
            max_tokens: 1800,
            messages: [{ role: 'user', content: metaPrompt }],
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`API error: ${response.status} — ${err}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const chunk =
                  parsed.text ??
                  (parsed.type === 'content_block_delta' ? parsed.delta?.text : undefined);
                if (chunk) {
                  fullText += chunk;
                  if (pre) { pre.textContent = fullText; pre.scrollTop = pre.scrollHeight; }
                }
              } catch { /* skip malformed */ }
            }
          }
        }

        lastResult = fullText;
        showOutput(fullText, opts.goal as string);
        saveHistory({ t: Date.now(), goal: opts.goal as string, idea: opts.idea as string, result: fullText });
        toast('✦ Prompt generated!');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (pre) pre.textContent = `Error: ${msg}\n\nCheck that your API key is valid and the server is running.`;
        toast('⚠ Generation failed');
      } finally {
        isGenerating = false;
        if (generateBtn) generateBtn.disabled = false;
        if (spinner) spinner.style.display = 'none';
        if (btnLabel) btnLabel.textContent = '✦ Generate Prompt';
        if (outputBox) outputBox.classList.remove('loading');
      }
    }

    // ===== BUTTONS =====
    document.getElementById('ip-generateBtn')?.addEventListener('click', () => generate(false));
    document.getElementById('ip-regenBtn')?.addEventListener('click', () => generate(true));
    document.getElementById('ip-ideaInput')?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') generate(false);
    });

    document.getElementById('ip-copyBtn')?.addEventListener('click', async () => {
      if (!lastResult) { toast('Nothing to copy'); return; }
      try {
        await navigator.clipboard.writeText(lastResult);
        const btn = document.getElementById('ip-copyBtn');
        if (btn) { btn.textContent = '✓ Copied!'; btn.classList.add('success'); }
        toast('Copied to clipboard!');
        setTimeout(() => {
          const b = document.getElementById('ip-copyBtn');
          if (b) { b.textContent = '⎘ Copy'; b.classList.remove('success'); }
        }, 2000);
      } catch { toast('Copy failed — try selecting manually'); }
    });

    document.getElementById('ip-downloadBtn')?.addEventListener('click', () => {
      if (!lastResult) { toast('Nothing to download'); return; }
      const blob = new Blob([lastResult], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `iprompt-${currentGoal}-${Date.now()}.txt`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 300);
      toast('Downloaded!');
    });

    document.getElementById('ip-exportBtn')?.addEventListener('click', () => {
      const arr = getHistory();
      if (!arr.length) { toast('No history to export'); return; }
      const blob = new Blob([JSON.stringify(arr, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `iprompt-history-${Date.now()}.json`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 300);
      toast('History exported!');
    });

    document.getElementById('ip-clearBtn')?.addEventListener('click', () => {
      lastResult = '';
      const pre = document.getElementById('ip-outputPre');
      const empty = document.getElementById('ip-outputEmpty');
      const meta = document.getElementById('ip-metaBar');
      if (pre) pre.style.display = 'none';
      if (empty) empty.style.display = 'flex';
      if (meta) meta.style.display = 'none';
    });

    // ===== INIT =====
    renderHistory();
    updateOutputBadge();
  }, []);

  return (
    <>
      <div className="ip-app">
        {/* HEADER */}
        <header className="ip-header">
          <div className="ip-header-left">
            <div className="ip-logo-mark">iP</div>
            <div>
              <div className="ip-header-title">iPrompt <span style={{ color: 'var(--accent)' }}>Pro</span></div>
              <div className="ip-header-sub">AI-powered prompt engineering for every use case</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <select id="ip-engineSelect" className="ip-btn-ghost" style={{ cursor: 'pointer', paddingRight: 28 }}>
              <option value="groq">⚡ Groq — Llama 3.3</option>
              <option value="gemini">✦ Gemini 2.0 Flash</option>
            </select>
            <button className="ip-btn-ghost" id="ip-exportBtn">↓ Export History</button>
          </div>
        </header>

        {/* MAIN LAYOUT */}
        <div className="ip-layout">

          {/* LEFT PANEL */}
          <div>
            <div className="ip-panel">
              <div className="ip-section-label">Prompt Goal</div>
              <div className="ip-goal-grid" id="ip-goalGrid">
                <button className="ip-goal-btn active" data-goal="chat"><span className="ip-icon">💬</span>Chat / QA</button>
                <button className="ip-goal-btn" data-goal="code"><span className="ip-icon">💻</span>Code</button>
                <button className="ip-goal-btn" data-goal="image"><span className="ip-icon">🎨</span>Image AI</button>
                <button className="ip-goal-btn" data-goal="blog"><span className="ip-icon">✍️</span>Blog / SEO</button>
                <button className="ip-goal-btn" data-goal="marketing"><span className="ip-icon">📣</span>Marketing</button>
                <button className="ip-goal-btn" data-goal="agent"><span className="ip-icon">🤖</span>AI Agent</button>
              </div>

              <div className="ip-field">
                <label className="ip-field-label">Your Idea</label>
                <textarea id="ip-ideaInput" placeholder="Describe what you need… e.g. 'A meditation app for busy professionals' or 'Generate a cyberpunk portrait'"></textarea>
                <div className="ip-char-counter"><span id="ip-charCount">0</span> / 100000</div>
              </div>

              <div className="ip-row2">
                <div className="ip-field">
                  <label className="ip-field-label">Model Target</label>
                  <select id="ip-modelSelect">
                    <option value="claude">Claude</option>
                    <option value="chatgpt">ChatGPT / GPT-4</option>
                    <option value="gemini">Gemini</option>
                    <option value="midjourney">Midjourney</option>
                    <option value="stable-diffusion">Stable Diffusion</option>
                    <option value="dall-e">DALL·E 3</option>
                    <option value="generic">Generic / Any</option>
                  </select>
                </div>
                <div className="ip-field">
                  <label className="ip-field-label">Output Detail</label>
                  <select id="ip-verbosity" defaultValue="detailed">
                    <option value="concise">Concise</option>
                    <option value="detailed">Detailed</option>
                    <option value="exhaustive">Exhaustive</option>
                  </select>
                </div>
              </div>

              {/* GOAL-SPECIFIC PANELS */}
              <div className="ip-goal-panels">

                {/* CHAT */}
                <div className="ip-gp visible" id="ip-gp-chat">
                  <div className="ip-section-label" style={{ marginTop: 8 }}>Chat Options</div>
                  <div className="ip-row2">
                    <div className="ip-field">
                      <label className="ip-field-label">Audience</label>
                      <select id="ip-chatAudience">
                        <option>General public</option>
                        <option>Developers</option>
                        <option>Product Managers</option>
                        <option>Students</option>
                        <option>Executives</option>
                        <option>Beginners</option>
                      </select>
                    </div>
                    <div className="ip-field">
                      <label className="ip-field-label">Expertise Level</label>
                      <select id="ip-chatExpertise" defaultValue="intermediate">
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="expert">Expert</option>
                      </select>
                    </div>
                  </div>
                  <div className="ip-field">
                    <label className="ip-field-label">Style / Tone</label>
                    <select id="ip-chatTone">
                      <option>Informative &amp; Neutral</option>
                      <option>Friendly &amp; Conversational</option>
                      <option>Socratic (asks questions)</option>
                      <option>Direct &amp; Concise</option>
                      <option>Structured &amp; Formal</option>
                    </select>
                  </div>
                  <div>
                    <div className="ip-toggle-row">
                      <span className="ip-toggle-label">Include examples &amp; analogies</span>
                      <div className="ip-toggle on" id="ip-tog-examples" onClick={(e) => toggleEl(e.currentTarget as HTMLElement)}></div>
                    </div>
                    <div className="ip-toggle-row">
                      <span className="ip-toggle-label">Add JSON metadata block</span>
                      <div className="ip-toggle on" id="ip-tog-json" onClick={(e) => toggleEl(e.currentTarget as HTMLElement)}></div>
                    </div>
                    <div className="ip-toggle-row">
                      <span className="ip-toggle-label">Include follow-up questions</span>
                      <div className="ip-toggle" id="ip-tog-followup" onClick={(e) => toggleEl(e.currentTarget as HTMLElement)}></div>
                    </div>
                  </div>
                </div>

                {/* CODE */}
                <div className="ip-gp" id="ip-gp-code">
                  <div className="ip-section-label" style={{ marginTop: 8 }}>Code Options</div>
                  <div className="ip-row2">
                    <div className="ip-field">
                      <label className="ip-field-label">Language / Stack</label>
                      <select id="ip-codeLang">
                        <option value="python">Python</option>
                        <option value="typescript">TypeScript</option>
                        <option value="javascript">JavaScript</option>
                        <option value="react">React</option>
                        <option value="node">Node.js</option>
                        <option value="go">Go</option>
                        <option value="rust">Rust</option>
                        <option value="swift">Swift</option>
                      </select>
                    </div>
                    <div className="ip-field">
                      <label className="ip-field-label">Project Scale</label>
                      <select id="ip-codeScale" defaultValue="service">
                        <option value="snippet">Snippet</option>
                        <option value="module">Module / Class</option>
                        <option value="service">Full Service</option>
                        <option value="fullstack">Full Stack App</option>
                      </select>
                    </div>
                  </div>
                  <div className="ip-field">
                    <label className="ip-field-label">Requirements / Constraints</label>
                    <input type="text" id="ip-codeReqs" placeholder="e.g. must use SQLite, no ORM, async/await..." />
                  </div>
                  <div>
                    <div className="ip-toggle-row">
                      <span className="ip-toggle-label">Include tests</span>
                      <div className="ip-toggle on" id="ip-tog-tests" onClick={(e) => toggleEl(e.currentTarget as HTMLElement)}></div>
                    </div>
                    <div className="ip-toggle-row">
                      <span className="ip-toggle-label">Include deployment steps</span>
                      <div className="ip-toggle" id="ip-tog-deploy" onClick={(e) => toggleEl(e.currentTarget as HTMLElement)}></div>
                    </div>
                    <div className="ip-toggle-row">
                      <span className="ip-toggle-label">Include Docker setup</span>
                      <div className="ip-toggle" id="ip-tog-docker" onClick={(e) => toggleEl(e.currentTarget as HTMLElement)}></div>
                    </div>
                  </div>
                </div>

                {/* IMAGE */}
                <div className="ip-gp" id="ip-gp-image">
                  <div className="ip-section-label" style={{ marginTop: 8 }}>Image Options</div>
                  <div className="ip-field">
                    <label className="ip-field-label">Style Presets (multi-select)</label>
                    <div className="ip-preset-pills" id="ip-stylePills">
                      <span className="ip-preset-pill on" data-v="cinematic lighting, dramatic atmosphere">Cinematic</span>
                      <span className="ip-preset-pill" data-v="concept art, digital painting, volumetric light">Concept Art</span>
                      <span className="ip-preset-pill" data-v="photorealistic, 8k, DSLR, bokeh">Photorealistic</span>
                      <span className="ip-preset-pill" data-v="anime style, cel shading, vibrant colors">Anime</span>
                      <span className="ip-preset-pill" data-v="watercolor, soft brush strokes, muted palette">Watercolor</span>
                      <span className="ip-preset-pill" data-v="fantasy art, epic, magical, ornate">Fantasy</span>
                      <span className="ip-preset-pill" data-v="minimalist, clean, geometric, flat design">Minimalist</span>
                      <span className="ip-preset-pill" data-v="cyberpunk, neon, futuristic, dark city">Cyberpunk</span>
                    </div>
                  </div>
                  <div className="ip-row3">
                    <div className="ip-field">
                      <label className="ip-field-label">Aspect Ratio</label>
                      <select id="ip-imgAspect" defaultValue="2:3">
                        <option value="1:1">1:1 Square</option>
                        <option value="16:9">16:9 Wide</option>
                        <option value="2:3">2:3 Portrait</option>
                        <option value="3:4">3:4 Portrait</option>
                        <option value="4:5">4:5 Social</option>
                      </select>
                    </div>
                    <div className="ip-field">
                      <label className="ip-field-label">Quality</label>
                      <select id="ip-imgQuality" defaultValue="high">
                        <option value="standard">Standard</option>
                        <option value="high">High</option>
                        <option value="ultra">Ultra</option>
                      </select>
                    </div>
                    <div className="ip-field">
                      <label className="ip-field-label">Variations</label>
                      <input type="number" id="ip-imgSeeds" min={1} max={5} defaultValue={3} />
                    </div>
                  </div>
                  <div className="ip-field">
                    <label className="ip-field-label">Negative Prompts</label>
                    <input type="text" id="ip-imgNeg" placeholder="blur, watermark, text, extra limbs, deformed" />
                  </div>
                </div>

                {/* BLOG */}
                <div className="ip-gp" id="ip-gp-blog">
                  <div className="ip-section-label" style={{ marginTop: 8 }}>Blog Options</div>
                  <div className="ip-row2">
                    <div className="ip-field">
                      <label className="ip-field-label">Post Length</label>
                      <select id="ip-blogLength" defaultValue="medium">
                        <option value="short">Short (~600w)</option>
                        <option value="medium">Medium (~1500w)</option>
                        <option value="long">Long (~3000w)</option>
                      </select>
                    </div>
                    <div className="ip-field">
                      <label className="ip-field-label">Writing Style</label>
                      <select id="ip-blogStyle">
                        <option>Educational / How-To</option>
                        <option>Opinion / Thought Leadership</option>
                        <option>Listicle</option>
                        <option>Narrative / Story</option>
                        <option>Interview / Q&amp;A</option>
                      </select>
                    </div>
                  </div>
                  <div className="ip-field">
                    <label className="ip-field-label">SEO Keywords</label>
                    <div className="ip-tags-wrap" id="ip-kwTagsWrap">
                      <input type="text" id="ip-kwInput" placeholder="Type keyword + Enter" />
                    </div>
                  </div>
                  <div>
                    <div className="ip-toggle-row">
                      <span className="ip-toggle-label">Include meta description</span>
                      <div className="ip-toggle on" id="ip-tog-meta" onClick={(e) => toggleEl(e.currentTarget as HTMLElement)}></div>
                    </div>
                    <div className="ip-toggle-row">
                      <span className="ip-toggle-label">Include sample intro paragraph</span>
                      <div className="ip-toggle on" id="ip-tog-intro" onClick={(e) => toggleEl(e.currentTarget as HTMLElement)}></div>
                    </div>
                    <div className="ip-toggle-row">
                      <span className="ip-toggle-label">Include internal link suggestions</span>
                      <div className="ip-toggle" id="ip-tog-links" onClick={(e) => toggleEl(e.currentTarget as HTMLElement)}></div>
                    </div>
                  </div>
                </div>

                {/* MARKETING */}
                <div className="ip-gp" id="ip-gp-marketing">
                  <div className="ip-section-label" style={{ marginTop: 8 }}>Marketing Options</div>
                  <div className="ip-row2">
                    <div className="ip-field">
                      <label className="ip-field-label">Channel</label>
                      <select id="ip-mktChannel">
                        <option value="social">Social Media</option>
                        <option value="email">Email Campaign</option>
                        <option value="paid-ad">Paid Ads</option>
                        <option value="landing-page">Landing Page</option>
                        <option value="product-launch">Product Launch</option>
                      </select>
                    </div>
                    <div className="ip-field">
                      <label className="ip-field-label">Tone</label>
                      <select id="ip-mktTone">
                        <option>Friendly &amp; Approachable</option>
                        <option>Professional &amp; Authoritative</option>
                        <option>Urgent &amp; Bold</option>
                        <option>Playful &amp; Witty</option>
                        <option>Empathetic &amp; Helpful</option>
                      </select>
                    </div>
                  </div>
                  <div className="ip-row2">
                    <div className="ip-field">
                      <label className="ip-field-label">Target Audience</label>
                      <input type="text" id="ip-mktAudience" placeholder="e.g. busy parents, indie devs" />
                    </div>
                    <div className="ip-field">
                      <label className="ip-field-label">Main CTA</label>
                      <input type="text" id="ip-mktCta" placeholder="e.g. Sign up free, Learn more" />
                    </div>
                  </div>
                </div>

                {/* AGENT */}
                <div className="ip-gp" id="ip-gp-agent">
                  <div className="ip-section-label" style={{ marginTop: 8 }}>AI Agent Options</div>
                  <div className="ip-row2">
                    <div className="ip-field">
                      <label className="ip-field-label">Agent Role</label>
                      <select id="ip-agentRole">
                        <option>Research Assistant</option>
                        <option>Data Analyst</option>
                        <option>Customer Support</option>
                        <option>Code Reviewer</option>
                        <option>Content Strategist</option>
                        <option>Sales Assistant</option>
                        <option>Custom Role</option>
                      </select>
                    </div>
                    <div className="ip-field">
                      <label className="ip-field-label">Memory / Context</label>
                      <select id="ip-agentMemory">
                        <option value="none">No memory</option>
                        <option value="session">Session-based</option>
                        <option value="persistent">Persistent</option>
                      </select>
                    </div>
                  </div>
                  <div className="ip-field">
                    <label className="ip-field-label">Available Tools (comma-separated)</label>
                    <input type="text" id="ip-agentTools" placeholder="web_search, code_interpreter, file_reader" />
                  </div>
                  <div>
                    <div className="ip-toggle-row">
                      <span className="ip-toggle-label">Include system prompt template</span>
                      <div className="ip-toggle on" id="ip-tog-sysprompt" onClick={(e) => toggleEl(e.currentTarget as HTMLElement)}></div>
                    </div>
                    <div className="ip-toggle-row">
                      <span className="ip-toggle-label">Include guardrails / safety rules</span>
                      <div className="ip-toggle on" id="ip-tog-guardrails" onClick={(e) => toggleEl(e.currentTarget as HTMLElement)}></div>
                    </div>
                    <div className="ip-toggle-row">
                      <span className="ip-toggle-label">Include example conversations</span>
                      <div className="ip-toggle" id="ip-tog-examples-agent" onClick={(e) => toggleEl(e.currentTarget as HTMLElement)}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ACTIONS */}
              <div className="ip-actions">
                <button className="ip-btn-primary" id="ip-generateBtn">
                  <div className="ip-spinner" id="ip-spinner" style={{ display: 'none' }}></div>
                  <span id="ip-btnLabel">✦ Generate Prompt</span>
                </button>
                <button className="ip-btn-ghost" id="ip-regenBtn" title="Regenerate with variation">↺</button>
                <button className="ip-btn-ghost" id="ip-clearBtn" title="Clear output">✕</button>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: OUTPUT */}
          <div className="ip-output-panel">
            <div>
              <div className="ip-output-header-row">
                <div className="ip-output-title">
                  Generated Prompt
                  <span className="ip-output-badge badge-chat" id="ip-outputBadge">Chat</span>
                </div>
                <div className="ip-output-actions-row">
                  <button className="ip-icon-btn" id="ip-copyBtn">⎘ Copy</button>
                  <button className="ip-icon-btn" id="ip-downloadBtn">↓ Download</button>
                </div>
              </div>
            </div>

            <div className="ip-output-box" id="ip-outputBox">
              <div className="ip-output-empty" id="ip-outputEmpty">
                <div className="ip-big-icon">✦</div>
                <p>Enter your idea on the left and click <strong>Generate Prompt</strong> to create a tailored, AI-powered prompt.</p>
              </div>
              <pre className="ip-output-pre" id="ip-outputPre" tabIndex={0} style={{ display: 'none' }}></pre>
            </div>

            <div className="ip-meta-bar" id="ip-metaBar" style={{ display: 'none' }}>
              <span id="ip-metaGoal"></span>
              <span style={{ color: 'var(--border)', margin: '0 2px' }}>·</span>
              <span id="ip-metaModel"></span>
              <span style={{ color: 'var(--border)', margin: '0 2px' }}>·</span>
              <span id="ip-metaWords"></span>
              <span style={{ color: 'var(--border)', margin: '0 2px' }}>·</span>
              <span id="ip-metaTime"></span>
            </div>

            {/* HISTORY */}
            <div className="ip-history-panel" id="ip-historyPanel">
              <div className="ip-history-header" id="ip-historyHeader">
                <div className="ip-history-header-title">
                  Prompt History
                  <span className="ip-history-count" id="ip-historyCount">0</span>
                </div>
                <span className="ip-history-chevron">▾</span>
              </div>
              <div className="ip-history-list" id="ip-historyList"></div>
            </div>
          </div>
        </div>
      </div>

      <div className="ip-dev-tag">⚠︎ <strong>K!MO</strong> ⚠︎ — Enhanced by Claude</div>
      <div className="ip-toast" id="ip-toast"></div>
    </>
  );
}
