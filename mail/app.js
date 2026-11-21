(() => {
  'use strict';

  const DEFAULT_API_BASE = 'https://api.mail.akaros.si';
  const KEY_STORAGE = 'akaros-mail-api-key';
  const BASE_STORAGE = 'akaros-mail-api-base';
  const THEME_STORAGE = 'akaros-mail-theme';
  const MAX_ATTACHMENTS_SIZE = 10 * 1024 * 1024;
  const FOLDER_LABELS = {
    inbox: '收件箱',
    sent: '已发送',
    failed: '发件失败',
    outbox: '发件箱',
    trash: '垃圾箱',
    all: '全部邮件'
  };

  const $ = (id) => document.getElementById(id);
  const dom = {
    loginView: $('login-view'),
    loginForm: $('login-form'),
    loginError: $('login-error'),
    apiKey: $('api-key'),
    apiBase: $('api-base'),
    app: $('app'),
    searchForm: $('search-form'),
    searchInput: $('search-input'),
    refreshButton: $('refresh-button'),
    themeButton: $('theme-button'),
    logoutButton: $('logout-button'),
    folderNav: $('folder-nav'),
    folderTitle: $('folder-title'),
    messageCount: $('message-count'),
    messageList: $('message-list'),
    messageDetail: $('message-detail'),
    listPanel: $('list-panel'),
    detailPanel: $('detail-panel'),
    routingPanel: $('routing-panel'),
    routingContent: $('routing-content'),
    composeModal: $('compose-modal'),
    composeTitle: $('compose-title'),
    composeForm: $('compose-form'),
    composeFrom: $('compose-from'),
    composeFromName: $('compose-from-name'),
    composeTo: $('compose-to'),
    composeCc: $('compose-cc'),
    composeBcc: $('compose-bcc'),
    composeSubject: $('compose-subject'),
    composeText: $('compose-text'),
    composeInReplyTo: $('compose-in-reply-to'),
    composeReferences: $('compose-references'),
    composeFiles: $('compose-files'),
    composeFileList: $('compose-file-list'),
    sendButton: $('send-button'),
    toast: $('toast')
  };

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* Storage can be unavailable. */ }
  }

  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch { /* Storage can be unavailable. */ }
  }

  function applyTheme(theme, persist = true) {
    const resolved = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = resolved;
    if (persist) storageSet(THEME_STORAGE, resolved);
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = resolved === 'dark' ? '#10161d' : '#f4f7fa';
    const use = dom.themeButton.querySelector('use');
    use.setAttribute('href', resolved === 'dark' ? '#i-sun' : '#i-moon');
    const label = resolved === 'dark' ? '浅色模式' : '暗色模式';
    dom.themeButton.title = label;
    dom.themeButton.setAttribute('aria-label', label);
  }

  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  systemTheme.addEventListener('change', (event) => {
    if (!storageGet(THEME_STORAGE)) applyTheme(event.matches ? 'dark' : 'light', false);
  });

  const entryUrl = new URL(window.location.href);
  if (entryUrl.searchParams.has('key')) {
    const keyFromUrl = (entryUrl.searchParams.get('key') || '').trim();
    if (keyFromUrl) storageSet(KEY_STORAGE, keyFromUrl);
    entryUrl.searchParams.delete('key');
    window.history.replaceState(null, '', `${entryUrl.pathname}${entryUrl.search}${entryUrl.hash}`);
  }

  function normalizeBase(value) {
    const raw = String(value || '').trim();
    const url = new URL(raw || DEFAULT_API_BASE);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('API 地址无效');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  }

  let savedBase = DEFAULT_API_BASE;
  try { savedBase = normalizeBase(storageGet(BASE_STORAGE) || DEFAULT_API_BASE); } catch { /* Use default. */ }

  const state = {
    key: storageGet(KEY_STORAGE) || '',
    apiBase: savedBase,
    view: 'mail',
    folder: 'inbox',
    query: '',
    messages: [],
    loadingList: false,
    listError: '',
    selectedId: null,
    message: null,
    attachments: [],
    loadingDetail: false,
    detailError: '',
    detailMode: 'html',
    routing: null,
    identity: null,
    loadingRouting: false,
    routingError: '',
    composeFiles: [],
    sending: false,
    listRequest: 0,
    detailRequest: 0,
    routingRequest: 0
  };

  let toastTimer = 0;
  let searchTimer = 0;
  let lastFocused = null;

  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function icon(name, className = '') {
    const allowed = new Set(['mail', 'compose', 'route', 'refresh', 'logout', 'search', 'inbox', 'send', 'alert', 'outbox', 'trash', 'all', 'back', 'reply', 'forward', 'paperclip', 'download', 'close']);
    const safeName = allowed.has(name) ? name : 'mail';
    return `<svg class="icon${className ? ` ${esc(className)}` : ''}" aria-hidden="true"><use href="#i-${safeName}"></use></svg>`;
  }

  function toast(message) {
    window.clearTimeout(toastTimer);
    const singleLine = String(message || '操作失败').replace(/\s+/g, ' ').trim();
    dom.toast.textContent = singleLine.length > 30 ? `${singleLine.slice(0, 29)}…` : singleLine;
    dom.toast.hidden = false;
    toastTimer = window.setTimeout(() => { dom.toast.hidden = true; }, 2400);
  }

  function showError(error, fallback = '操作失败') {
    if (error && error.status === 401) return;
    if (error instanceof TypeError) {
      toast('网络错误');
      return;
    }
    toast(error && error.message ? error.message : fallback);
  }

  async function request(path, options = {}) {
    if (!state.key) throw new ApiError('未授权', 401);
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${state.key}`);
    headers.set('Accept', options.responseType === 'blob' ? '*/*' : 'application/json');
    const init = { method: options.method || 'GET', headers, credentials: 'omit' };
    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
      init.body = JSON.stringify(options.body);
    }

    let response;
    try {
      response = await fetch(`${state.apiBase}${path}`, init);
    } catch (error) {
      throw error;
    }

    if (response.status === 401) {
      handleUnauthorized();
      throw new ApiError('未授权', 401);
    }

    if (!response.ok) {
      let message = `请求失败 (${response.status})`;
      try {
        const data = await response.json();
        if (data && typeof data.error === 'string' && data.error) message = data.error;
      } catch { /* Keep the short HTTP error. */ }
      throw new ApiError(message, response.status);
    }

    if (options.responseType === 'blob') return response.blob();
    if (response.status === 204) return null;
    const text = await response.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { throw new ApiError('响应无效', response.status); }
  }

  function handleUnauthorized() {
    storageRemove(KEY_STORAGE);
    state.key = '';
    resetSession();
    dom.app.hidden = true;
    dom.composeModal.hidden = true;
    dom.loginView.hidden = false;
    dom.loginError.textContent = '请重新登录';
    dom.loginError.hidden = false;
    dom.apiKey.value = '';
    window.setTimeout(() => dom.apiKey.focus(), 0);
  }

  function resetSession() {
    state.listRequest += 1;
    state.detailRequest += 1;
    state.routingRequest += 1;
    state.messages = [];
    state.selectedId = null;
    state.message = null;
    state.attachments = [];
    state.routing = null;
    state.identity = null;
    state.composeFiles = [];
    state.sending = false;
    state.view = 'mail';
    state.loadingList = false;
    state.loadingDetail = false;
    state.loadingRouting = false;
    dom.app.classList.remove('detail-open', 'route-open');
    dom.toast.hidden = true;
  }

  function formatDate(value, withTime = false) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const now = new Date();
    const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
    const options = withTime
      ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }
      : sameDay
        ? { hour: '2-digit', minute: '2-digit', hour12: false }
        : date.getFullYear() === now.getFullYear()
          ? { month: '2-digit', day: '2-digit' }
          : { year: 'numeric', month: '2-digit', day: '2-digit' };
    return new Intl.DateTimeFormat('zh-CN', options).format(date);
  }

  function formatSize(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  }

  function parseAddresses(value) {
    if (value === null || value === undefined || value === '') return [];
    let parsed = value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try { parsed = JSON.parse(trimmed); } catch { parsed = value; }
      }
    }
    if (Array.isArray(parsed)) return parsed.flatMap((entry) => parseAddresses(entry));
    if (typeof parsed === 'object') {
      const email = parsed.email || parsed.address || '';
      const name = parsed.name || parsed.display_name || '';
      if (email && name) return [`${name} <${email}>`];
      return email ? [String(email)] : [];
    }
    return String(parsed).split(/[,;\n]/).map((entry) => entry.trim()).filter(Boolean);
  }

  function messageAddresses(message, field) {
    const jsonValue = message[`${field}_json`];
    const values = parseAddresses(jsonValue !== undefined && jsonValue !== null && jsonValue !== '' ? jsonValue : message[field]);
    return values;
  }

  function senderLabel(message) {
    if (message.direction === 'out') {
      const recipients = messageAddresses(message, 'to');
      return recipients.length ? `至 ${recipients.join(', ')}` : '至';
    }
    return message.from_name || message.from_email || '';
  }

  function setView(view) {
    state.view = view;
    const routing = view === 'routing';
    dom.app.classList.toggle('route-open', routing);
    dom.routingPanel.hidden = !routing;
    dom.listPanel.hidden = routing;
    dom.detailPanel.hidden = routing;
    dom.searchForm.hidden = routing;
    document.querySelectorAll('.bottom-item').forEach((button) => {
      button.classList.toggle('active', button.dataset.action === (routing ? 'routing' : 'mail'));
    });
    document.querySelectorAll('.routing-nav').forEach((button) => button.classList.toggle('active', routing));
  }

  function updateFolderNav() {
    dom.folderTitle.textContent = FOLDER_LABELS[state.folder] || '邮件';
    document.querySelectorAll('[data-folder]').forEach((button) => {
      button.classList.toggle('active', button.dataset.folder === state.folder);
    });
  }

  function renderList() {
    dom.messageCount.textContent = state.messages.length ? String(state.messages.length) : '';
    if (state.loadingList && !state.messages.length) {
      dom.messageList.innerHTML = '<div class="loading-state">加载中…</div>';
      return;
    }
    if (state.listError && !state.messages.length) {
      dom.messageList.innerHTML = `<div class="error-state"><div>加载失败<br><button class="text-button" type="button" data-action="retry-list">重试</button></div></div>`;
      return;
    }
    if (!state.messages.length) {
      dom.messageList.innerHTML = '<div class="empty-state">无邮件</div>';
      return;
    }

    dom.messageList.innerHTML = state.messages.map((message) => {
      const id = String(message.id);
      const unread = message.direction !== 'out' && !message.is_read;
      const failed = message.folder === 'failed' || message.status === 'failed';
      const pending = !failed && (message.folder === 'outbox' || message.status === 'queued' || message.status === 'pending');
      const count = Number(message.attachment_count) || 0;
      return `<button type="button" class="message-item${unread ? ' unread' : ''}${state.selectedId === id ? ' selected' : ''}" data-message-id="${esc(id)}">
        <span class="sender">${esc(senderLabel(message))}</span>
        <time class="message-date">${esc(formatDate(message.created_at))}</time>
        <span class="subject">${esc(message.subject || '(无主题)')}</span>
        <span class="snippet">${esc(message.snippet || '')}</span>
        <span class="message-meta">
          ${failed ? '<span class="badge failed">失败</span>' : ''}
          ${pending ? '<span class="badge pending">待发</span>' : ''}
          ${count > 0 ? `${icon('paperclip')}<span>${esc(count)}</span>` : ''}
        </span>
      </button>`;
    }).join('');
  }

  async function loadIdentity() {
    const identity = await request('/api/me');
    state.identity = identity;
    dom.app.querySelector('.brand').title = identity.account || '管理员';
  }

  async function initializeMailbox() {
    // Authentication is part of the initial load, not a confirmed empty inbox.
    state.loadingList = true;
    state.listError = '';
    renderList();
    try {
      await loadIdentity();
    } catch (error) {
      state.loadingList = false;
      if (state.key) {
        state.listError = error.message || '登录失败';
        renderList();
        showError(error, '登录失败');
      }
      return;
    }
    await loadMessages();
  }

  async function loadMessages({ silent = false } = {}) {
    const ticket = ++state.listRequest;
    state.loadingList = true;
    state.listError = '';
    if (!silent || !state.messages.length) renderList();
    const params = new URLSearchParams({ folder: state.folder, limit: '100' });
    if (state.query) params.set('q', state.query);
    try {
      const data = await request(`/api/messages?${params.toString()}`);
      if (ticket !== state.listRequest) return;
      state.messages = data && Array.isArray(data.messages) ? data.messages : [];
    } catch (error) {
      if (ticket !== state.listRequest) return;
      state.listError = error.message || '加载失败';
      if (!silent) showError(error, '加载失败');
    } finally {
      if (ticket === state.listRequest) {
        state.loadingList = false;
        renderList();
      }
    }
  }

  function clearDetail() {
    state.detailRequest += 1;
    state.selectedId = null;
    state.message = null;
    state.attachments = [];
    state.loadingDetail = false;
    state.detailError = '';
    state.detailMode = 'html';
    dom.app.classList.remove('detail-open');
    dom.messageDetail.innerHTML = '<div class="empty-state">选择邮件</div>';
    renderList();
  }

  function metaRow(label, value) {
    if (!value || (Array.isArray(value) && !value.length)) return '';
    const display = Array.isArray(value) ? value.join(', ') : value;
    return `<div class="meta-row"><dt>${esc(label)}</dt><dd>${esc(display)}</dd></div>`;
  }

  function messageText(message) {
    if (message.text) return String(message.text);
    if (message.html) {
      const document = new DOMParser().parseFromString(String(message.html), 'text/html');
      const text = (document.body.textContent || '').replace(/\r/g, '').trim();
      return text || '无正文';
    }
    return '无正文';
  }

  function htmlDocument(content) {
    const safeContent = String(content || '')
      .replace(/(\b(?:src|poster|background)\s*=\s*["'])http:\/\//gi, '$1https://')
      .replace(/(\b(?:src|poster|background)\s*=\s*)http:\/\//gi, '$1https://')
      .replace(/(\bsrcset\s*=\s*["'])([^"']*)/gi, (_, prefix, value) => `${prefix}${value.replace(/http:\/\//gi, 'https://')}`)
      .replace(/(url\(\s*['"]?)http:\/\//gi, '$1https://');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; connect-src 'none'; img-src data: https:; media-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; font-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><style>html,body{margin:0;padding:0;background:#fff;color:#2c3e50;font:14px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;overflow-wrap:anywhere}body{padding:16px}img,svg,video{max-width:100%;height:auto}table{max-width:100%}a{color:#2586c5}</style></head><body>${safeContent}</body></html>`;
  }

  function renderDetail() {
    if (state.loadingDetail) {
      dom.messageDetail.innerHTML = '<div class="loading-state">加载中…</div>';
      return;
    }
    if (state.detailError) {
      dom.messageDetail.innerHTML = '<div class="error-state">加载失败</div>';
      return;
    }
    const message = state.message;
    if (!message) {
      dom.messageDetail.innerHTML = '<div class="empty-state">选择邮件</div>';
      return;
    }

    const inTrash = message.folder === 'trash';
    const read = Boolean(message.is_read);
    const attachments = Array.isArray(state.attachments) ? state.attachments : [];
    const showHtml = state.detailMode === 'html' && Boolean(message.html);
    const body = showHtml
      ? '<iframe id="html-preview" class="html-frame" title="HTML 邮件" sandbox="" referrerpolicy="no-referrer"></iframe>'
      : `<pre class="text-body">${esc(messageText(message))}</pre>`;

    dom.messageDetail.innerHTML = `<header class="detail-header">
      <div class="detail-title-row">
        <button class="icon-button mobile-back" type="button" data-action="back" title="返回" aria-label="返回">${icon('back')}</button>
        <h2>${esc(message.subject || '(无主题)')}</h2>
      </div>
      <div class="detail-actions">
        <button class="button subtle" type="button" data-action="reply">${icon('reply')}回复</button>
        <button class="button subtle" type="button" data-action="forward">${icon('forward')}转发</button>
        <button class="button subtle" type="button" data-action="toggle-read">${read ? '标为未读' : '标为已读'}</button>
        ${inTrash
          ? '<button class="button subtle" type="button" data-action="restore">恢复</button><button class="button danger" type="button" data-action="delete-permanent">彻底删除</button>'
          : `<button class="button danger" type="button" data-action="delete">${icon('trash')}删除</button>`}
      </div>
    </header>
    <dl class="detail-meta">
      ${metaRow('发件人', message.from_name ? `${message.from_name} <${message.from_email || ''}>` : message.from_email)}
      ${metaRow('收件人', messageAddresses(message, 'to'))}
      ${metaRow('抄送', messageAddresses(message, 'cc'))}
      ${metaRow('密送', messageAddresses(message, 'bcc'))}
      ${metaRow('日期', formatDate(message.created_at, true))}
    </dl>
    ${message.error ? `<div class="detail-error">${esc(message.error)}</div>` : ''}
    ${attachments.length ? `<div class="detail-attachments">${attachments.map((attachment) => `<button class="attachment" type="button" data-action="download" data-attachment-id="${esc(attachment.id)}">
      ${icon('download')}<span class="attachment-name">${esc(attachment.filename || '附件')}</span><span class="attachment-size">${esc(formatSize(attachment.size))}</span>
    </button>`).join('')}</div>` : ''}
    ${message.html ? `<div class="body-toolbar"><button class="text-button${showHtml ? '' : ' active'}" type="button" data-action="body-text">文本</button><button class="text-button${showHtml ? ' active' : ''}" type="button" data-action="body-html">HTML</button></div>` : ''}
    <div class="message-body">${body}</div>`;

    if (showHtml) {
      const frame = $('html-preview');
      frame.srcdoc = htmlDocument(message.html);
    }
  }

  async function openMessage(id) {
    const normalizedId = String(id);
    const ticket = ++state.detailRequest;
    state.selectedId = normalizedId;
    state.message = null;
    state.attachments = [];
    state.detailMode = 'html';
    state.detailError = '';
    state.loadingDetail = true;
    dom.app.classList.add('detail-open');
    renderList();
    renderDetail();
    try {
      const data = await request(`/api/messages/${encodeURIComponent(normalizedId)}`);
      if (ticket !== state.detailRequest) return;
      state.message = data && data.message ? data.message : null;
      state.attachments = data && Array.isArray(data.attachments) ? data.attachments : [];
      state.loadingDetail = false;
      renderDetail();

      if (state.message && (state.message.is_read === false || state.message.is_read === 0)) {
        try {
          await request(`/api/messages/${encodeURIComponent(normalizedId)}`, { method: 'PATCH', body: { is_read: true } });
          if (ticket !== state.detailRequest) return;
          state.message.is_read = true;
          renderDetail();
          loadMessages({ silent: true });
        } catch (error) {
          if (error.status !== 401 && ticket === state.detailRequest) loadMessages({ silent: true });
        }
      }
    } catch (error) {
      if (ticket !== state.detailRequest) return;
      state.loadingDetail = false;
      state.detailError = error.message || '加载失败';
      renderDetail();
      showError(error, '加载失败');
    }
  }

  async function toggleRead() {
    if (!state.message) return;
    const id = state.selectedId;
    const isRead = !Boolean(state.message.is_read);
    try {
      await request(`/api/messages/${encodeURIComponent(id)}`, { method: 'PATCH', body: { is_read: isRead } });
      state.message.is_read = isRead;
      renderDetail();
      toast(isRead ? '已标为已读' : '已标为未读');
      loadMessages({ silent: true });
    } catch (error) { showError(error); }
  }

  async function removeMessage(permanent = false) {
    if (!state.selectedId) return;
    if (permanent && !window.confirm('永久删除？')) return;
    const id = state.selectedId;
    try {
      await request(`/api/messages/${encodeURIComponent(id)}${permanent ? '?permanent=1' : ''}`, { method: 'DELETE' });
      clearDetail();
      toast('已删除');
      loadMessages();
    } catch (error) { showError(error, '删除失败'); }
  }

  async function restoreMessage() {
    if (!state.selectedId) return;
    const id = state.selectedId;
    try {
      await request(`/api/messages/${encodeURIComponent(id)}`, { method: 'PATCH', body: { folder: 'inbox' } });
      clearDetail();
      toast('已恢复');
      loadMessages();
    } catch (error) { showError(error, '恢复失败'); }
  }

  async function downloadAttachment(id, button) {
    const attachment = state.attachments.find((item) => String(item.id) === String(id));
    if (!attachment) return;
    button.disabled = true;
    try {
      const blob = await request(`/api/attachments/${encodeURIComponent(String(id))}`, { responseType: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename || 'attachment';
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (error) {
      showError(error, '下载失败');
    } finally {
      button.disabled = false;
    }
  }

  function addressListInput(value) {
    return String(value || '').split(/[,;\n]/).map((entry) => entry.trim()).filter(Boolean);
  }

  function validAddresses(values) {
    return values.every((value) => /^[^\s@]+@[^\s@]+$/.test(value));
  }

  function quotedText(message) {
    return messageText(message).split('\n').map((line) => `> ${line}`).join('\n');
  }

  function renderComposeFiles() {
    dom.composeFileList.innerHTML = state.composeFiles.map((file, index) => `<span class="file-chip"><span title="${esc(file.name)}">${esc(file.name)} · ${esc(formatSize(file.size))}</span><button class="icon-button" type="button" data-action="remove-file" data-file-index="${index}" title="移除" aria-label="移除">${icon('close')}</button></span>`).join('');
  }

  function openCompose(mode = 'new') {
    if (state.sending) return;
    lastFocused = document.activeElement;
    dom.composeForm.reset();
    const accountOnly = state.identity?.role === 'account';
    dom.composeFrom.value = accountOnly ? state.identity.account : 'no-reply@akaros.si';
    dom.composeFrom.readOnly = accountOnly;
    dom.composeInReplyTo.value = '';
    dom.composeReferences.value = '';
    state.composeFiles = [];
    dom.composeFiles.value = '';
    renderComposeFiles();
    dom.composeTitle.textContent = mode === 'reply' ? '回复' : mode === 'forward' ? '转发' : '写邮件';

    const message = state.message;
    if (message && (mode === 'reply' || mode === 'forward')) {
      const subject = String(message.subject || '');
      if (mode === 'reply') {
        const recipients = message.direction === 'out' ? messageAddresses(message, 'to') : [message.from_email].filter(Boolean);
        dom.composeTo.value = recipients.join(', ');
        dom.composeSubject.value = /^re\s*:/i.test(subject) ? subject : `Re: ${subject}`;
        dom.composeText.value = `\n\n${formatDate(message.created_at, true)} ${message.from_email || ''} 写道：\n${quotedText(message)}`;
        dom.composeInReplyTo.value = message.message_id || '';
        dom.composeReferences.value = `${message.references_header || ''} ${message.message_id || ''}`.trim();
      } else {
        dom.composeSubject.value = /^fwd\s*:/i.test(subject) ? subject : `Fwd: ${subject}`;
        dom.composeText.value = `\n\n---------- 转发邮件 ----------\n发件人：${message.from_email || ''}\n日期：${formatDate(message.created_at, true)}\n主题：${subject}\n收件人：${messageAddresses(message, 'to').join(', ')}\n\n${messageText(message)}`;
      }
    }

    dom.composeModal.hidden = false;
    window.setTimeout(() => {
      if (mode === 'reply') dom.composeText.focus();
      else dom.composeTo.focus();
    }, 0);
  }

  function closeCompose(force = false) {
    if (state.sending && !force) return;
    dom.composeModal.hidden = true;
    state.composeFiles = [];
    dom.composeFiles.value = '';
    renderComposeFiles();
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  function addFiles() {
    const files = Array.from(dom.composeFiles.files || []);
    const combined = state.composeFiles.concat(files);
    const total = combined.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_ATTACHMENTS_SIZE) {
      toast('附件超过 10 MiB');
      dom.composeFiles.value = '';
      return;
    }
    state.composeFiles = combined;
    dom.composeFiles.value = '';
    renderComposeFiles();
  }

  async function fileBase64(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const chunkSize = 0x8000;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
    }
    return btoa(binary);
  }

  async function sendMessage() {
    if (state.sending) return;
    const to = addressListInput(dom.composeTo.value);
    const cc = addressListInput(dom.composeCc.value);
    const bcc = addressListInput(dom.composeBcc.value);
    if (!to.length) { toast('请填写收件人'); return; }
    if (!validAddresses(to.concat(cc, bcc))) { toast('地址无效'); return; }
    const total = state.composeFiles.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_ATTACHMENTS_SIZE) { toast('附件超过 10 MiB'); return; }

    state.sending = true;
    dom.sendButton.disabled = true;
    dom.sendButton.textContent = '发送中…';
    try {
      const attachments = await Promise.all(state.composeFiles.map(async (file) => ({
        name: file.name,
        type: file.type || 'application/octet-stream',
        data: await fileBase64(file)
      })));
      const payload = {
        from: dom.composeFrom.value.trim(),
        from_name: dom.composeFromName.value.trim(),
        to,
        cc,
        bcc,
        subject: dom.composeSubject.value,
        text: dom.composeText.value,
        attachments
      };
      if (dom.composeInReplyTo.value) payload.in_reply_to = dom.composeInReplyTo.value;
      if (dom.composeReferences.value) payload.references = dom.composeReferences.value;
      await request('/api/send', { method: 'POST', body: payload });
      state.sending = false;
      closeCompose(true);
      toast('已发送');
      loadMessages({ silent: true });
    } catch (error) {
      showError(error, '发送失败');
    } finally {
      state.sending = false;
      dom.sendButton.disabled = false;
      dom.sendButton.innerHTML = `${icon('send')}发送`;
    }
  }

  function routingRuleAddress(rule) {
    const matchers = rule && Array.isArray(rule.matchers) ? rule.matchers : [];
    const literal = matchers.find((matcher) => matcher.type === 'literal' && matcher.field === 'to');
    if (literal) return literal.value || '';
    return matchers.some((matcher) => matcher.type === 'all') ? '全部' : '';
  }

  function routingAction(rule) {
    return rule && Array.isArray(rule.actions) && rule.actions[0] ? rule.actions[0] : {};
  }

  function actionDestination(action) {
    if (!action || !Array.isArray(action.value)) return '';
    return action.value[0] || '';
  }

  function renderRouting() {
    if (state.loadingRouting && !state.routing) {
      dom.routingContent.innerHTML = '<div class="loading-state">加载中…</div>';
      return;
    }
    if (state.routingError && !state.routing) {
      dom.routingContent.innerHTML = '<div class="error-state"><div>加载失败<br><button class="text-button" type="button" data-action="retry-routing">重试</button></div></div>';
      return;
    }
    if (!state.routing) {
      dom.routingContent.innerHTML = '<div class="loading-state">加载中…</div>';
      return;
    }

    const routing = state.routing;
    const settings = routing.settings || {};
    const rules = (Array.isArray(routing.rules) ? routing.rules : []).filter((rule) => {
      const matchers = Array.isArray(rule.matchers) ? rule.matchers : [];
      return matchers.some((matcher) => matcher.type === 'literal' && matcher.field === 'to');
    });
    const catchAll = Array.isArray(routing.catch_all) ? (routing.catch_all[0] || {}) : (routing.catch_all || {});
    const catchAction = routingAction(catchAll);
    const action = ['worker', 'drop', 'forward'].includes(catchAction.type) ? catchAction.type : 'drop';
    const catchDestination = actionDestination(catchAction);
    const canManageCatchAll = routing.access?.manage_catch_all !== false;
    const accountOnly = routing.access?.role === 'account' || state.identity?.role === 'account';
    const accountAddress = routing.access?.account || state.identity?.account || '';

    dom.routingContent.innerHTML = `<div class="routing-header"><h2>Email Routing</h2><span class="badge ${settings.enabled ? 'ok' : 'off'}">${settings.enabled ? '已启用' : '未启用'}</span></div>
      <div class="route-grid">
        ${canManageCatchAll ? `<section class="route-card wide">
          <h3>Catch-All</h3>
          <form class="route-form catch-all-form" data-form="catch-all">
            <label class="route-check"><input name="enabled" type="checkbox" ${catchAll.enabled ? 'checked' : ''}>启用</label>
            <label class="route-field">动作<select name="action" data-action-select>
              <option value="worker" ${action === 'worker' ? 'selected' : ''}>Worker</option>
              <option value="drop" ${action === 'drop' ? 'selected' : ''}>Drop</option>
              <option value="forward" ${action === 'forward' ? 'selected' : ''}>Forward</option>
            </select></label>
            <label class="route-field" data-destination-field ${action !== 'forward' ? 'hidden' : ''}>目标地址<input name="destination" type="email" value="${esc(catchDestination)}" ${action === 'forward' ? 'required' : ''}></label>
            <button class="button primary" type="submit">保存</button>
          </form>
        </section>` : ''}

        <section class="route-card wide">
          <div class="route-card-head"><h3>转发规则</h3><span class="count">${rules.length}</span></div>
          <div class="rule-list">${rules.length ? rules.map((rule) => {
            const ruleAction = routingAction(rule);
            const type = ruleAction.type || '';
            const target = type === 'forward' ? actionDestination(ruleAction) : type === 'worker' ? 'Worker' : type === 'drop' ? '丢弃' : type;
            const address = routingRuleAddress(rule);
            return `<div class="rule-item">
              <div class="rule-address" title="${esc(address)}">${esc(address || '(无地址)')}${rule.name ? `<span class="rule-name">${esc(rule.name)}</span>` : ''}</div>
              <div class="rule-target" title="${esc(target)}">${esc(target)}</div>
              <button class="button subtle rule-toggle" type="button" data-action="rule-toggle" data-rule-id="${esc(rule.id)}" data-enabled="${rule.enabled ? '1' : '0'}">${rule.enabled ? '停用' : '启用'}</button>
              <button class="icon-button rule-delete" type="button" data-action="rule-delete" data-rule-id="${esc(rule.id)}" title="删除" aria-label="删除">${icon('trash')}</button>
            </div>`;
          }).join('') : '<div class="empty-state">无规则</div>'}</div>
          <form class="route-form rule-form" data-form="add-rule">
            <label class="route-field">地址<input name="address" type="email" placeholder="x@akaros.si" value="${esc(accountAddress)}" ${accountOnly ? 'readonly' : ''} required></label>
            <label class="route-field">目标地址<input name="destination" type="email" required></label>
            <label class="route-field">名称<input name="name" type="text"></label>
            <label class="route-check"><input name="enabled" type="checkbox" checked>启用</label>
            <button class="button primary" type="submit">添加</button>
          </form>
        </section>

        <section class="route-card wide">
          <h3>添加目标地址</h3>
          <form class="route-form inline route-destination-form" data-form="add-destination">
            <label class="route-field">邮箱<input name="email" type="email" required></label>
            <button class="button primary" type="submit">添加</button>
          </form>
        </section>
      </div>`;
  }

  async function loadRouting() {
    const ticket = ++state.routingRequest;
    state.loadingRouting = true;
    state.routingError = '';
    renderRouting();
    try {
      const data = await request('/api/routing');
      if (ticket !== state.routingRequest) return;
      state.routing = data || {};
    } catch (error) {
      if (ticket !== state.routingRequest) return;
      state.routingError = error.message || '加载失败';
      showError(error, '加载失败');
    } finally {
      if (ticket === state.routingRequest) {
        state.loadingRouting = false;
        renderRouting();
      }
    }
  }

  function setFormBusy(form, busy) {
    form.querySelectorAll('button, input, select, textarea').forEach((control) => { control.disabled = busy; });
  }

  async function submitRoutingForm(form) {
    const kind = form.dataset.form;
    const values = new FormData(form);
    setFormBusy(form, true);
    try {
      if (kind === 'add-rule') {
        await request('/api/routing/rules', {
          method: 'POST',
          body: {
            address: String(values.get('address') || '').trim(),
            destination: String(values.get('destination') || '').trim(),
            name: String(values.get('name') || '').trim(),
            enabled: values.get('enabled') === 'on'
          }
        });
        toast('已添加');
      } else if (kind === 'catch-all') {
        const action = String(values.get('action') || 'drop');
        const body = { enabled: values.get('enabled') === 'on', action };
        if (action === 'forward') body.destination = String(values.get('destination') || '').trim();
        await request('/api/routing/catch-all', { method: 'PUT', body });
        toast('已保存');
      } else if (kind === 'add-destination') {
        await request('/api/routing/destinations', {
          method: 'POST',
          body: { email: String(values.get('email') || '').trim() }
        });
        toast('验证邮件已发送');
      }
      await loadRouting();
    } catch (error) {
      showError(error);
      setFormBusy(form, false);
    }
  }

  async function toggleRule(button) {
    const id = button.dataset.ruleId;
    const enabled = button.dataset.enabled !== '1';
    button.disabled = true;
    try {
      await request(`/api/routing/rules/${encodeURIComponent(id)}`, { method: 'PUT', body: { enabled } });
      toast(enabled ? '已启用' : '已停用');
      await loadRouting();
    } catch (error) {
      showError(error);
      button.disabled = false;
    }
  }

  async function deleteRule(button) {
    if (!window.confirm('删除规则？')) return;
    const id = button.dataset.ruleId;
    button.disabled = true;
    try {
      await request(`/api/routing/rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast('已删除');
      await loadRouting();
    } catch (error) {
      showError(error, '删除失败');
      button.disabled = false;
    }
  }

  async function refreshCurrent() {
    dom.refreshButton.disabled = true;
    try {
      if (state.view === 'routing') {
        await loadRouting();
      } else {
        const tasks = [loadMessages({ silent: true })];
        if (state.selectedId) tasks.push(openMessage(state.selectedId));
        await Promise.all(tasks);
      }
    } finally {
      dom.refreshButton.disabled = false;
    }
  }

  function changeFolder(folder) {
    if (!FOLDER_LABELS[folder]) return;
    state.folder = folder;
    state.messages = [];
    clearDetail();
    setView('mail');
    updateFolderNav();
    loadMessages();
  }

  dom.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const key = dom.apiKey.value.trim();
    if (!key) { toast('请输入 API Key'); return; }
    try {
      state.apiBase = normalizeBase(dom.apiBase.value);
    } catch {
      dom.loginError.textContent = 'API 地址无效';
      dom.loginError.hidden = false;
      return;
    }
    storageSet(BASE_STORAGE, state.apiBase);
    storageSet(KEY_STORAGE, key);
    state.key = key;
    dom.loginError.hidden = true;
    dom.loginView.hidden = true;
    dom.app.hidden = false;
    setView('mail');
    updateFolderNav();
    clearDetail();
    await initializeMailbox();
  });

  dom.apiBase.addEventListener('change', () => {
    try {
      const base = normalizeBase(dom.apiBase.value);
      dom.apiBase.value = base;
      storageSet(BASE_STORAGE, base);
    } catch {
      dom.loginError.textContent = 'API 地址无效';
      dom.loginError.hidden = false;
    }
  });

  dom.logoutButton.addEventListener('click', () => {
    storageRemove(KEY_STORAGE);
    state.key = '';
    resetSession();
    closeCompose(true);
    dom.app.hidden = true;
    dom.loginView.hidden = false;
    dom.loginError.hidden = true;
    dom.apiKey.value = '';
    dom.apiKey.focus();
  });

  dom.searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    window.clearTimeout(searchTimer);
    state.query = dom.searchInput.value.trim();
    loadMessages();
  });

  dom.searchInput.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.query = dom.searchInput.value.trim();
      loadMessages();
    }, 350);
  });

  dom.refreshButton.addEventListener('click', refreshCurrent);
  dom.themeButton.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  dom.composeFiles.addEventListener('change', addFiles);
  dom.composeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!dom.composeForm.reportValidity()) return;
    sendMessage();
  });

  dom.composeModal.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'close-compose') closeCompose();
    if (button.dataset.action === 'remove-file') {
      state.composeFiles.splice(Number(button.dataset.fileIndex), 1);
      renderComposeFiles();
    }
  });

  dom.app.addEventListener('submit', (event) => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    submitRoutingForm(form);
  });

  dom.app.addEventListener('change', (event) => {
    const select = event.target.closest('[data-action-select]');
    if (!select) return;
    const form = select.closest('form');
    const field = form.querySelector('[data-destination-field]');
    const input = field.querySelector('input');
    const forward = select.value === 'forward';
    field.hidden = !forward;
    input.required = forward;
  });

  dom.app.addEventListener('click', (event) => {
    const messageButton = event.target.closest('[data-message-id]');
    if (messageButton) {
      openMessage(messageButton.dataset.messageId);
      return;
    }
    const folderButton = event.target.closest('[data-folder]');
    if (folderButton) {
      changeFolder(folderButton.dataset.folder);
      return;
    }
    const button = event.target.closest('[data-action]');
    if (!button) return;
    switch (button.dataset.action) {
      case 'mail':
        setView('mail');
        dom.app.classList.remove('detail-open');
        break;
      case 'routing':
        clearDetail();
        setView('routing');
        loadRouting();
        break;
      case 'compose': openCompose(); break;
      case 'back': dom.app.classList.remove('detail-open'); break;
      case 'reply': openCompose('reply'); break;
      case 'forward': openCompose('forward'); break;
      case 'toggle-read': toggleRead(); break;
      case 'delete': removeMessage(false); break;
      case 'delete-permanent': removeMessage(true); break;
      case 'restore': restoreMessage(); break;
      case 'body-text': state.detailMode = 'text'; renderDetail(); break;
      case 'body-html': state.detailMode = 'html'; renderDetail(); break;
      case 'download': downloadAttachment(button.dataset.attachmentId, button); break;
      case 'retry-list': loadMessages(); break;
      case 'retry-routing': loadRouting(); break;
      case 'rule-toggle': toggleRule(button); break;
      case 'rule-delete': deleteRule(button); break;
      default: break;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !dom.composeModal.hidden) {
      closeCompose();
      return;
    }
    if (event.key === 'Tab' && !dom.composeModal.hidden) {
      const focusable = Array.from(dom.composeModal.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')).filter((element) => !element.hidden && element.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  applyTheme(document.documentElement.dataset.theme, false);
  dom.apiBase.value = state.apiBase;
  updateFolderNav();
  state.loadingList = Boolean(state.key);
  renderList();
  renderDetail();
  if (state.key) {
    dom.loginView.hidden = true;
    dom.app.hidden = false;
    setView('mail');
    initializeMailbox();
  } else {
    dom.loginView.hidden = false;
    dom.app.hidden = true;
  }
})();
