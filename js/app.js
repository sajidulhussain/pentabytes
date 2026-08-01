// ====================== Pentabytes Core ======================

const state = {
  currentMode: 'code',
  chats: {},
  activeChatId: null,
  apiKey: localStorage.getItem('pentabytes_api_key') || '',
  provider: localStorage.getItem('pentabytes_provider') || 'openai',
  model: localStorage.getItem('pentabytes_model') || '',
  isGenerating: false
};

const modePrompts = {
  code: 'You are an expert programming assistant. Help the user write, explain, debug, and improve code. Be precise and provide clean examples.',
  study: 'You are a helpful study tutor. Explain concepts clearly, create summaries, notes, and quizzes when asked. Use simple language and examples.',
  content: 'You are a skilled content writer. Help create blogs, social media posts, scripts, emails, captions, and marketing copy. Match the requested tone.',
  research: 'You are a research assistant. Provide structured, well-organized information, summaries, key points, and insights on any topic.',
  productivity: 'You are a productivity coach. Help break down goals, create plans, prioritize tasks, and give smart actionable suggestions.'
};

const modeLabels = {
  code: 'Code Mode',
  study: 'Study Mode',
  content: 'Content Mode',
  research: 'Research Mode',
  productivity: 'Productivity Mode'
};

// ====================== Initialization ======================

document.addEventListener('DOMContentLoaded', () => {
  loadChats();
  updateApiStatus();
  setupEventListeners();
  if (!state.activeChatId) createNewChat();
  renderChatHistory();
});

function setupEventListeners() {
  // Mode buttons
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
  });

  // New chat
  document.getElementById('new-chat-btn').addEventListener('click', createNewChat);

  // Settings
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('close-settings').addEventListener('click', closeSettings);
  document.getElementById('save-settings').addEventListener('click', saveSettings);

  // Export
  document.getElementById('export-btn').addEventListener('click', exportChat);

  // Input
  const input = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');

  input.addEventListener('input', () => {
    sendBtn.disabled = !input.value.trim() || state.isGenerating;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);

  // Suggestion buttons
  document.querySelectorAll('.suggestion-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.textContent;
      input.dispatchEvent(new Event('input'));
      input.focus();
    });
  });

  // Voice (Web Speech API)
  document.getElementById('voice-btn').addEventListener('click', startVoiceInput);

  // Image (placeholder)
  document.getElementById('image-btn').addEventListener('click', () => {
    alert('Image upload coming soon! For now, describe the image in text.');
  });

  // Mobile sidebar toggle
  document.getElementById('toggle-sidebar')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('-translate-x-full');
  });
}

// ====================== Chat Management ======================

function createNewChat() {
  const id = 'chat_' + Date.now();
  state.chats[id] = {
    id,
    title: 'New Chat',
    mode: state.currentMode,
    messages: [],
    createdAt: new Date().toISOString()
  };
  state.activeChatId = id;
  saveChats();
  renderChatHistory();
  renderMessages();
  document.getElementById('user-input').focus();
}

function switchChat(id) {
  state.activeChatId = id;
  state.currentMode = state.chats[id].mode;
  updateModeUI();
  renderChatHistory();
  renderMessages();
}

function deleteChat(id, e) {
  e.stopPropagation();
  if (!confirm('Delete this chat?')) return;
  delete state.chats[id];
  if (state.activeChatId === id) {
    const remaining = Object.keys(state.chats);
    state.activeChatId = remaining.length ? remaining[0] : null;
    if (!state.activeChatId) createNewChat();
  }
  saveChats();
  renderChatHistory();
  renderMessages();
}

function loadChats() {
  const saved = localStorage.getItem('pentabytes_chats');
  if (saved) {
    state.chats = JSON.parse(saved);
    const ids = Object.keys(state.chats);
    if (ids.length) state.activeChatId = ids[ids.length - 1];
  }
}

function saveChats() {
  localStorage.setItem('pentabytes_chats', JSON.stringify(state.chats));
}

function renderChatHistory() {
  const container = document.getElementById('chat-history');
  container.innerHTML = '';

  const sorted = Object.values(state.chats).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  sorted.forEach(chat => {
    const div = document.createElement('div');
    div.className = `group flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-dark-700 transition ${
      chat.id === state.activeChatId ? 'bg-dark-700' : ''
    }`;
    div.innerHTML = `
      <i class="fa-regular fa-message text-gray-500"></i>
      <span class="flex-1 truncate">${chat.title}</span>
      <button class="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition" onclick="deleteChat('${chat.id}', event)">
        <i class="fa-solid fa-trash text-xs"></i>
      </button>
    `;
    div.onclick = () => switchChat(chat.id);
    container.appendChild(div);
  });
}

// ====================== Mode Switching ======================

function switchMode(mode) {
  state.currentMode = mode;
  if (state.activeChatId && state.chats[state.activeChatId]) {
    state.chats[state.activeChatId].mode = mode;
    saveChats();
  }
  updateModeUI();
}

function updateModeUI() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('bg-dark-700', btn.dataset.mode === state.currentMode);
    btn.classList.toggle('text-accent', btn.dataset.mode === state.currentMode);
  });
  document.getElementById('current-mode-label').textContent = modeLabels[state.currentMode];
}

// ====================== Messaging ======================

function renderMessages() {
  const container = document.getElementById('chat-container');
  const chat = state.chats[state.activeChatId];

  if (!chat || chat.messages.length === 0) {
    container.innerHTML = `
      <div id="welcome" class="flex flex-col items-center justify-center h-full text-center max-w-lg mx-auto">
        <div class="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center mb-5">
          <i class="fa-solid fa-brain text-3xl text-accent"></i>
        </div>
        <h2 class="text-2xl font-semibold mb-2">Welcome to Pentabytes</h2>
        <p class="text-gray-400 mb-6">Your all-in-one AI assistant for Code, Study, Content, Research & Productivity.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-sm">
          <button class="suggestion-btn px-4 py-3 rounded-xl bg-dark-700 hover:bg-dark-600 transition text-left">Explain this code snippet...</button>
          <button class="suggestion-btn px-4 py-3 rounded-xl bg-dark-700 hover:bg-dark-600 transition text-left">Summarize this topic for study</button>
          <button class="suggestion-btn px-4 py-3 rounded-xl bg-dark-700 hover:bg-dark-600 transition text-left">Write a LinkedIn post about...</button>
          <button class="suggestion-btn px-4 py-3 rounded-xl bg-dark-700 hover:bg-dark-600 transition text-left">Break down my goals for today</button>
        </div>
      </div>`;
    // Re-bind suggestion buttons
    document.querySelectorAll('.suggestion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('user-input');
        input.value = btn.textContent;
        input.dispatchEvent(new Event('input'));
        input.focus();
      });
    });
    return;
  }

  container.innerHTML = '';
  chat.messages.forEach(msg => {
    const div = document.createElement('div');
    div.className = `flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`;
    div.innerHTML = `
      <div class="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        msg.role === 'user' ? 'message-user text-white' : 'message-ai'
      }">
        ${formatMessage(msg.content)}
      </div>
    `;
    container.appendChild(div);
  });

  container.scrollTop = container.scrollHeight;
}

function formatMessage(text) {
  // Basic markdown-like formatting
  return text
    .replace(/```([\s\S]*?)```/g, '<pre class="bg-dark-900 rounded-lg p-3 my-2 overflow-x-auto text-xs"><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-dark-900 px-1.5 py-0.5 rounded text-xs">$1</code>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

async function sendMessage() {
  const input = document.getElementById('user-input');
  const text = input.value.trim();
  if (!text || state.isGenerating) return;

  if (!state.apiKey) {
    openSettings();
    alert('Please add your API key in Settings first.');
    return;
  }

  const chat = state.chats[state.activeChatId];
  chat.messages.push({ role: 'user', content: text });

  // Update title if first message
  if (chat.messages.length === 1) {
    chat.title = text.slice(0, 40) + (text.length > 40 ? '...' : '');
  }

  input.value = '';
  input.style.height = 'auto';
  document.getElementById('send-btn').disabled = true;
  state.isGenerating = true;
  saveChats();
  renderChatHistory();
  renderMessages();

  // Add thinking indicator
  const container = document.getElementById('chat-container');
  const thinking = document.createElement('div');
  thinking.id = 'thinking';
  thinking.className = 'flex justify-start';
  thinking.innerHTML = `<div class="message-ai rounded-2xl px-4 py-3 text-sm text-gray-400"><i class="fa-solid fa-circle-notch fa-spin mr-2"></i>Thinking...</div>`;
  container.appendChild(thinking);
  container.scrollTop = container.scrollHeight;

  try {
    const reply = await callAI(chat.messages);
    chat.messages.push({ role: 'assistant', content: reply });
  } catch (err) {
    chat.messages.push({ role: 'assistant', content: `Error: ${err.message}` });
  }

  state.isGenerating = false;
  saveChats();
  renderMessages();
  document.getElementById('send-btn').disabled = false;
}

// ====================== AI API Calls ======================

async function callAI(messages) {
  const systemPrompt = modePrompts[state.currentMode];
  const provider = state.provider;

  if (provider === 'openai' || provider === 'groq') {
    return callOpenAICompatible(messages, systemPrompt, provider);
  } else if (provider === 'gemini') {
    return callGemini(messages, systemPrompt);
  }
  throw new Error('Unknown provider');
}

async function callOpenAICompatible(messages, systemPrompt, provider) {
  const baseUrl = provider === 'groq'
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';

  const model = state.model || (provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini');

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ],
      temperature: 0.7
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

async function callGemini(messages, systemPrompt) {
  const model = state.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${state.apiKey}`;

  // Convert messages to Gemini format
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.7 }
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API error ${res.status}`);
  }

  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

// ====================== Settings ======================

function openSettings() {
  document.getElementById('api-key-input').value = state.apiKey;
  document.getElementById('provider-select').value = state.provider;
  document.getElementById('model-input').value = state.model;
  document.getElementById('settings-modal').classList.remove('hidden');
  document.getElementById('settings-modal').classList.add('flex');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.add('hidden');
  document.getElementById('settings-modal').classList.remove('flex');
}

function saveSettings() {
  state.apiKey = document.getElementById('api-key-input').value.trim();
  state.provider = document.getElementById('provider-select').value;
  state.model = document.getElementById('model-input').value.trim();

  localStorage.setItem('pentabytes_api_key', state.apiKey);
  localStorage.setItem('pentabytes_provider', state.provider);
  localStorage.setItem('pentabytes_model', state.model);

  updateApiStatus();
  closeSettings();
}

function updateApiStatus() {
  const el = document.getElementById('api-status');
  if (state.apiKey) {
    el.innerHTML = `<span class="w-2 h-2 rounded-full bg-green-500"></span> API Connected`;
  } else {
    el.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-500"></span> API Key Missing`;
  }
}

// ====================== Export ======================

function exportChat() {
  const chat = state.chats[state.activeChatId];
  if (!chat || chat.messages.length === 0) {
    alert('No messages to export.');
    return;
  }

  let text = `Pentabytes Chat Export\nMode: ${modeLabels[chat.mode]}\nDate: ${new Date().toLocaleString()}\n\n`;
  chat.messages.forEach(m => {
    text += `${m.role === 'user' ? 'You' : 'Pentabytes'}:\n${m.content}\n\n---\n\n`;
  });

  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pentabytes-${chat.title.replace(/[^a-z0-9]/gi, '_').slice(0, 30)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ====================== Voice Input ======================

function startVoiceInput() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('Voice input is not supported in this browser.');
    return;
  }

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new Recognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;

  const btn = document.getElementById('voice-btn');
  btn.classList.add('text-red-400');

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const input = document.getElementById('user-input');
    input.value = (input.value + ' ' + transcript).trim();
    input.dispatchEvent(new Event('input'));
  };

  recognition.onerror = () => {
    btn.classList.remove('text-red-400');
  };

  recognition.onend = () => {
    btn.classList.remove('text-red-400');
  };

  recognition.start();
}
