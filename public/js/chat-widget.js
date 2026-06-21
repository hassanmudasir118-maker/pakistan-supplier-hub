(function () {
  const STORAGE_KEY = 'psh_chat_history';

  function getHistory() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveHistory(h) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(h.slice(-20))); } catch (e) {}
  }

  function injectWidget() {
    const wrap = document.createElement('div');
    wrap.id = 'psh-chat-widget';
    wrap.innerHTML = `
      <button id="psh-chat-toggle" aria-label="Open chat assistant">
        <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
      </button>
      <div id="psh-chat-panel">
        <div id="psh-chat-header">
          <span>🛍️ Shopping Assistant</span>
          <button id="psh-chat-close" aria-label="Close chat">×</button>
        </div>
        <div id="psh-chat-messages"></div>
        <div id="psh-chat-input-row">
          <input type="text" id="psh-chat-input" placeholder="Ask about products, orders, shipping..." maxlength="500">
          <button id="psh-chat-send" aria-label="Send">➤</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const style = document.createElement('style');
    style.textContent = `
      #psh-chat-widget{position:fixed;bottom:20px;right:20px;z-index:500;font-family:var(--font,sans-serif)}
      #psh-chat-toggle{width:56px;height:56px;border-radius:50%;background:var(--navy-700,#1F3A5F);color:#fff;border:0;box-shadow:0 6px 20px rgba(16,24,38,.25);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.15s}
      #psh-chat-toggle:hover{transform:scale(1.06)}
      #psh-chat-panel{position:absolute;bottom:68px;right:0;width:340px;max-width:88vw;height:460px;background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(16,24,38,.22);display:none;flex-direction:column;overflow:hidden;border:1px solid #E3E8F0}
      #psh-chat-panel.open{display:flex}
      #psh-chat-header{background:var(--navy-700,#1F3A5F);color:#fff;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;font-size:13.5px;font-weight:700}
      #psh-chat-close{background:transparent;border:0;color:#fff;font-size:20px;cursor:pointer;line-height:1}
      #psh-chat-messages{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#F6F8FB}
      .psh-msg{max-width:82%;padding:9px 13px;border-radius:13px;font-size:13px;line-height:1.45;white-space:pre-wrap}
      .psh-msg.user{align-self:flex-end;background:var(--navy-700,#1F3A5F);color:#fff;border-bottom-right-radius:3px}
      .psh-msg.bot{align-self:flex-start;background:#fff;border:1px solid #E3E8F0;color:#101826;border-bottom-left-radius:3px}
      .psh-msg.typing{align-self:flex-start;background:#fff;border:1px solid #E3E8F0;padding:11px 16px}
      .psh-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#9AA4B2;margin:0 1px;animation:psh-bounce 1.2s infinite}
      .psh-dot:nth-child(2){animation-delay:.2s} .psh-dot:nth-child(3){animation-delay:.4s}
      @keyframes psh-bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}}
      #psh-chat-input-row{display:flex;gap:8px;padding:12px;border-top:1px solid #E3E8F0;background:#fff}
      #psh-chat-input{flex:1;border:1px solid #E3E8F0;border-radius:20px;padding:9px 14px;font-size:13px;outline:none}
      #psh-chat-send{width:36px;height:36px;border-radius:50%;background:var(--teal-500,#1C8C7A);color:#fff;border:0;cursor:pointer;flex-shrink:0}
      @media (max-width:480px){#psh-chat-panel{width:92vw;height:70vh;bottom:64px}}
    `;
    document.head.appendChild(style);

    const panel = document.getElementById('psh-chat-panel');
    const toggle = document.getElementById('psh-chat-toggle');
    const closeBtn = document.getElementById('psh-chat-close');
    const messagesEl = document.getElementById('psh-chat-messages');
    const input = document.getElementById('psh-chat-input');
    const sendBtn = document.getElementById('psh-chat-send');

    let history = getHistory();
    renderHistory();

    toggle.addEventListener('click', () => {
      panel.classList.toggle('open');
      if (panel.classList.contains('open') && !history.length) {
        addMessage('bot', "Hi! 👋 I'm your shopping assistant. Ask me about products, prices, suppliers, shipping, or payment options.");
      }
      if (panel.classList.contains('open')) input.focus();
    });
    closeBtn.addEventListener('click', () => panel.classList.remove('open'));

    function renderHistory() {
      messagesEl.innerHTML = '';
      history.forEach((m) => appendBubble(m.role === 'user' ? 'user' : 'bot', m.content));
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function appendBubble(role, text) {
      const div = document.createElement('div');
      div.className = 'psh-msg ' + role;
      div.textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }

    function addMessage(role, text) {
      history.push({ role: role === 'user' ? 'user' : 'assistant', content: text });
      saveHistory(history);
      appendBubble(role, text);
    }

    async function send() {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      addMessage('user', text);

      const typingEl = document.createElement('div');
      typingEl.className = 'psh-msg typing';
      typingEl.innerHTML = '<span class="psh-dot"></span><span class="psh-dot"></span><span class="psh-dot"></span>';
      messagesEl.appendChild(typingEl);
      messagesEl.scrollTop = messagesEl.scrollHeight;

      try {
        const data = await PSH.api('/chat', { method: 'POST', body: { message: text, history: history.slice(-8) } });
        typingEl.remove();
        addMessage('bot', data.reply);
      } catch (e) {
        typingEl.remove();
        addMessage('bot', e.message || "Sorry, something went wrong. Please try again.");
      }
    }

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectWidget);
  else injectWidget();
})();
