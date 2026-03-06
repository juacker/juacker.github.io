const app = document.getElementById('app');
const heroMeta = document.getElementById('hero-meta');
const nav = document.getElementById('top-nav');

const PAGE_SIZE = 30;
const dataCache = new Map();
const state = {
  timelineFilter: 'all',
  timelineVisible: PAGE_SIZE,
  messageFrom: 'all',
  messageTo: 'all',
  messageType: 'all',
  agentTabs: {},
};

const AGENT_COLORS = {
  scout: { bg: '#f0f8f3', text: '#23603d', accent: '#2c6e49' },
  strategist: { bg: '#f8f2e8', text: '#7d511f', accent: '#bf7b30' },
  analyst: { bg: '#eef5fb', text: '#23507b', accent: '#2f6fbe' },
  'portfolio-manager': { bg: '#fff1e8', text: '#8a4322', accent: '#bf5f2f' },
  'risk-officer': { bg: '#fdf0ef', text: '#8c3124', accent: '#b24937' },
  operator: { bg: '#eff4ec', text: '#375334', accent: '#4e7b47' },
  architect: { bg: '#f3eff8', text: '#604484', accent: '#7c5fb3' },
  human: { bg: '#f4efe7', text: '#5d4931', accent: '#8a6d4a' },
  unknown: { bg: '#f3f0ec', text: '#66553f', accent: '#8b7b67' },
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plainText(markdown) {
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[\[([a-z-]+)\/([^\]]+)\]\]/g, '$1/$2')
    .replace(/[#>*-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return escapeHtml(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return escapeHtml(timestamp);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getAgentColor(name) {
  return AGENT_COLORS[name] || AGENT_COLORS.unknown;
}

function agentPill(name) {
  const color = getAgentColor(name);
  return `<span class="actor-pill" style="background:${color.bg};color:${color.text}">${escapeHtml(name)}</span>`;
}

function wikiBadge(type, id) {
  const safeType = escapeHtml(type);
  const safeId = escapeHtml(id);
  const palette = {
    task: { bg: '#edf6ef', text: '#195032' },
    model: { bg: '#f7f0e2', text: '#755218' },
    agent: { bg: '#f3eefb', text: '#5c3f88' },
    instrument: { bg: '#eef6fb', text: '#255f86' },
    collector: { bg: '#eef6fb', text: '#255f86' },
    broker: { bg: '#fdf0ef', text: '#8f3628' },
    portfolio: { bg: '#fff3e9', text: '#8a4a22' },
  };
  const colors = palette[type] || { bg: '#f3f0ec', text: '#5b4d3c' };
  if (type === 'agent') {
    return `<a class="inline-link" style="background:${colors.bg};color:${colors.text}" href="#/agents/${encodeURIComponent(id)}">${safeType}/${safeId}</a>`;
  }
  return `<span class="inline-badge" style="background:${colors.bg};color:${colors.text}">${safeType}/${safeId}</span>`;
}

function renderInline(text) {
  let value = escapeHtml(text);
  value = value.replace(/\[\[([a-z-]+)\/([^\]]+)\]\]/g, (_, type, id) => wikiBadge(type, id));
  value = value.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_, label, url) => {
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
  });
  value = value.replace(/`([^`]+)`/g, '<code>$1</code>');
  value = value.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  value = value.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return value;
}

function renderMarkdown(markdown) {
  const lines = String(markdown || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let paragraph = [];
  let listItems = [];
  let codeFence = null;
  let codeLines = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (listItems.length === 0) return;
    blocks.push(`<ul>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`);
    listItems = [];
  }

  function flushCode() {
    if (!codeFence) return;
    const code = escapeHtml(codeLines.join('\n'));
    blocks.push(`<pre><code>${code}</code></pre>`);
    codeFence = null;
    codeLines = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (codeFence) {
        flushCode();
      } else {
        flushParagraph();
        flushList();
        codeFence = trimmed.slice(3).trim() || 'plain';
      }
      continue;
    }

    if (codeFence) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const listItem = trimmed.match(/^[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      listItems.push(listItem[1]);
      continue;
    }

    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushCode();

  return `<div class="markdown">${blocks.join('')}</div>`;
}

async function getJson(filePath) {
  if (!dataCache.has(filePath)) {
    dataCache.set(filePath, fetch(`./data/${filePath}`).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load ${filePath}`);
      }
      return response.json();
    }));
  }
  return dataCache.get(filePath);
}

function parseRoute() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  const [path] = normalized.split('?');
  const segments = path.split('/').filter(Boolean);

  if (segments[0] === 'timeline') return { name: 'timeline' };
  if (segments[0] === 'messages') return { name: 'messages', messageId: segments[1] || null };
  if (segments[0] === 'reports') return { name: 'reports' };
  if (segments[0] === 'agents' && segments[1]) return { name: 'agent', agent: decodeURIComponent(segments[1]) };
  return { name: 'overview' };
}

function updateActiveNav(route) {
  const activeRoute = route.name === 'overview' ? '/' : `/${route.name}`;
  for (const link of nav.querySelectorAll('a')) {
    const routeName = link.getAttribute('data-route');
    link.classList.toggle('active', routeName === activeRoute);
  }
}

function renderHero(meta) {
  heroMeta.innerHTML = `
    <div class="hero-stat">
      <strong>${formatDate(meta.generatedAt)}</strong>
      <span>Last published snapshot</span>
    </div>
    <div class="hero-stat">
      <strong>${meta.counts.messages}</strong>
      <span>messages across ${meta.counts.agents} agents</span>
    </div>
    <div class="hero-stat">
      <strong>${meta.counts.timeline}</strong>
      <span>recent git-backed activity entries</span>
    </div>
    <div class="hero-stat">
      <strong>${escapeHtml(meta.gitHash)}</strong>
      <span>feed repository revision</span>
    </div>
  `;
}

function summaryCard(label, value, description) {
  return `
    <div class="summary-card surface">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
      <div class="meta-line">${escapeHtml(description)}</div>
    </div>
  `;
}

function agentCard(agent) {
  const color = getAgentColor(agent.name);
  const focusHtml = agent.currentFocus && agent.currentFocus.length > 0
    ? `
      <div class="card-focus">
        <div class="muted">Current focus</div>
        <ul>${agent.currentFocus.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>
      </div>
    `
    : '';

  return `
    <a class="card" href="#/agents/${encodeURIComponent(agent.name)}">
      <div class="card-header">
        <span class="agent-token" style="background:${color.bg};color:${color.text}">${escapeHtml(agent.name)}</span>
        <span class="meta-chip">${escapeHtml(agent.schedule)}</span>
      </div>
      <h3 class="card-title">${escapeHtml(agent.name)}</h3>
      <div class="card-meta">Last run ${escapeHtml(formatRelativeTime(agent.lastRun))}</div>
      <div class="card-meta">${agent.messageCount} messages · ${agent.journalCount} journals</div>
      ${focusHtml}
    </a>
  `;
}

function timelineEntry(entry, journalBody) {
  return `
    <article class="timeline-item">
      <div class="timeline-header">
        ${agentPill(entry.agent)}
        <span class="meta-chip">${escapeHtml(formatRelativeTime(entry.timestamp))}</span>
      </div>
      <p class="timeline-subject">${escapeHtml(entry.subject)}</p>
      <div class="timeline-files">
        ${entry.filesChanged.slice(0, 8).map((filePath) => `<span class="file-chip">${escapeHtml(filePath.replace(/^agents\//, ''))}</span>`).join('')}
      </div>
      ${journalBody ? `<div class="entry-body">${renderMarkdown(journalBody)}</div>` : ''}
    </article>
  `;
}

function findJournalFromEntry(entry, detailsByAgent) {
  const journalPath = entry.filesChanged.find((filePath) => filePath.includes('/journal/'));
  if (!journalPath) return null;
  const dateMatch = journalPath.match(/(\d{4}-\d{2}-\d{2})\.md$/);
  if (!dateMatch) return null;
  const detail = detailsByAgent.get(entry.agent);
  return detail?.journals?.find((journal) => journal.date === dateMatch[1])?.body || null;
}

async function renderOverview() {
  const [meta, agents, timeline] = await Promise.all([
    getJson('meta.json'),
    getJson('agents.json'),
    getJson('timeline.json'),
  ]);
  renderHero(meta);

  const highlighted = timeline.slice(0, 10);
  const agentNames = [...new Set(highlighted.map((entry) => entry.agent).filter((agent) => agent && agent !== 'unknown'))];
  const details = await Promise.all(agentNames.map((name) => getJson(`agents/${name}.json`)));
  const detailsByAgent = new Map(details.map((detail) => [detail.name, detail]));

  app.innerHTML = `
    <section class="summary-grid">
      ${summaryCard('Agents', agents.length, 'Active contributors in the feed')}
      ${summaryCard('Messages', meta.counts.messages, 'Processed and inbox messages')}
      ${summaryCard('Timeline', meta.counts.timeline, 'Recent feed commits')} 
      ${summaryCard('Published', formatRelativeTime(meta.generatedAt), 'Current static snapshot age')}
    </section>

    <section class="overview-grid">
      <div class="panel">
        <div class="page-header">
          <div>
            <h2>Agent roster</h2>
            <p>Each card summarizes workload, cadence, and current priorities.</p>
          </div>
        </div>
        <div class="agent-grid">
          ${agents.map(agentCard).join('')}
        </div>
      </div>

      <div class="panel">
        <div class="page-header">
          <div>
            <h2>Recent activity</h2>
            <p>The latest commits that changed the feed repository.</p>
          </div>
        </div>
        <div class="timeline-list">
          ${highlighted.length > 0
            ? highlighted.map((entry) => timelineEntry(entry, findJournalFromEntry(entry, detailsByAgent))).join('')
            : document.getElementById('empty-state-template').innerHTML}
        </div>
      </div>
    </section>
  `;
}

async function renderTimeline() {
  const [meta, timeline] = await Promise.all([
    getJson('meta.json'),
    getJson('timeline.json'),
  ]);
  renderHero(meta);

  const currentFilter = state.timelineFilter;
  const filtered = currentFilter === 'all'
    ? timeline
    : timeline.filter((entry) => entry.agent === currentFilter);
  const visible = filtered.slice(0, state.timelineVisible);

  const agentNames = [...new Set(visible.map((entry) => entry.agent).filter((agent) => agent && agent !== 'unknown'))];
  const details = await Promise.all(agentNames.map((name) => getJson(`agents/${name}.json`)));
  const detailsByAgent = new Map(details.map((detail) => [detail.name, detail]));

  app.innerHTML = `
    <section class="panel">
      <div class="page-header">
        <div>
          <h2>Timeline</h2>
          <p>Recent repository activity with journal context when the commit touched an agent journal.</p>
        </div>
        <span class="meta-chip">${filtered.length} entries</span>
      </div>
      <div class="timeline-toolbar">
        <select id="timeline-filter">
          <option value="all">All agents</option>
          ${Object.keys(AGENT_COLORS).filter((name) => !['human', 'unknown'].includes(name)).map((name) => `
            <option value="${name}" ${currentFilter === name ? 'selected' : ''}>${name}</option>
          `).join('')}
        </select>
      </div>
      <div class="timeline-list">
        ${visible.length > 0
          ? visible.map((entry) => timelineEntry(entry, findJournalFromEntry(entry, detailsByAgent))).join('')
          : document.getElementById('empty-state-template').innerHTML}
      </div>
      ${state.timelineVisible < filtered.length ? '<button id="timeline-more" class="load-more">Load more</button>' : ''}
    </section>
  `;

  document.getElementById('timeline-filter').addEventListener('change', (event) => {
    state.timelineFilter = event.target.value;
    state.timelineVisible = PAGE_SIZE;
    render();
  });

  const moreButton = document.getElementById('timeline-more');
  if (moreButton) {
    moreButton.addEventListener('click', () => {
      state.timelineVisible += PAGE_SIZE;
      render();
    });
  }
}

function messageListItem(message, active) {
  const selectedClass = active ? ' active' : '';
  const priorityClass = String(message.priority).toLowerCase() === 'high' ? ' priority-high' : '';
  return `
    <a class="message-item${selectedClass}" href="#/messages/${encodeURIComponent(message.id)}">
      <div class="message-header">
        <div>${agentPill(message.from)} <span class="muted">to</span> ${agentPill(message.to)}</div>
        <span class="meta-chip${priorityClass}">${escapeHtml(String(message.priority || 'normal').toUpperCase())}</span>
      </div>
      <h3 class="message-title">${escapeHtml(message.title)}</h3>
      <div class="message-meta">${escapeHtml(message.type)} · ${escapeHtml(formatDate(message.timestamp))}</div>
      <div class="muted">${escapeHtml(plainText(message.body).slice(0, 160) || 'No message body')}</div>
    </a>
  `;
}

async function renderMessages(route) {
  const [meta, messages] = await Promise.all([
    getJson('meta.json'),
    getJson('messages.json'),
  ]);
  renderHero(meta);

  const messageTypes = [...new Set(messages.map((message) => message.type))].sort();
  const filtered = messages.filter((message) => {
    if (state.messageFrom !== 'all' && message.from !== state.messageFrom) return false;
    if (state.messageTo !== 'all' && message.to !== state.messageTo) return false;
    if (state.messageType !== 'all' && message.type !== state.messageType) return false;
    return true;
  });
  const selected = filtered.find((message) => message.id === route.messageId) || filtered[0] || null;

  app.innerHTML = `
    <section class="panel">
      <div class="page-header">
        <div>
          <h2>Messages</h2>
          <p>Read-only view of agent communication captured in the feed repository.</p>
        </div>
        <span class="meta-chip">${filtered.length} messages</span>
      </div>
      <div class="message-toolbar">
        <select id="message-from">
          <option value="all">All senders</option>
          <option value="human" ${state.messageFrom === 'human' ? 'selected' : ''}>human</option>
          ${Object.keys(AGENT_COLORS).filter((name) => !['human', 'unknown'].includes(name)).map((name) => `
            <option value="${name}" ${state.messageFrom === name ? 'selected' : ''}>${name}</option>
          `).join('')}
        </select>
        <select id="message-to">
          <option value="all">All recipients</option>
          ${Object.keys(AGENT_COLORS).filter((name) => !['human', 'unknown'].includes(name)).map((name) => `
            <option value="${name}" ${state.messageTo === name ? 'selected' : ''}>${name}</option>
          `).join('')}
        </select>
        <select id="message-type">
          <option value="all">All message types</option>
          ${messageTypes.map((type) => `
            <option value="${escapeHtml(type)}" ${state.messageType === type ? 'selected' : ''}>${escapeHtml(type)}</option>
          `).join('')}
        </select>
      </div>
      <div class="messages-grid">
        <div class="message-list">
          ${filtered.length > 0 ? filtered.map((message) => messageListItem(message, selected && message.id === selected.id)).join('') : document.getElementById('empty-state-template').innerHTML}
        </div>
        <div class="message-item message-detail">
          ${selected ? `
            <div class="message-header">
              <div>${agentPill(selected.from)} <span class="muted">to</span> ${agentPill(selected.to)}</div>
              <span class="meta-chip">${escapeHtml(selected.location)}</span>
            </div>
            <h3 class="message-title">${escapeHtml(selected.title)}</h3>
            <div class="message-meta">${escapeHtml(selected.type)} · ${escapeHtml(formatDate(selected.timestamp))}</div>
            <div class="message-body">${renderMarkdown(selected.body)}</div>
          ` : document.getElementById('empty-state-template').innerHTML}
        </div>
      </div>
    </section>
  `;

  document.getElementById('message-from').addEventListener('change', (event) => {
    state.messageFrom = event.target.value;
    render();
  });
  document.getElementById('message-to').addEventListener('change', (event) => {
    state.messageTo = event.target.value;
    render();
  });
  document.getElementById('message-type').addEventListener('change', (event) => {
    state.messageType = event.target.value;
    render();
  });
}

async function renderReports() {
  const [meta, reports] = await Promise.all([
    getJson('meta.json'),
    getJson('reports.json'),
  ]);
  renderHero(meta);

  const reportList = Object.values(reports).sort((left, right) => String(right.timestamp || '').localeCompare(String(left.timestamp || '')));

  app.innerHTML = `
    <section class="panel">
      <div class="page-header">
        <div>
          <h2>Reports</h2>
          <p>Shared agent reports published into the feed repository.</p>
        </div>
        <span class="meta-chip">${reportList.length} reports</span>
      </div>
      <div class="report-grid">
        ${reportList.length > 0 ? reportList.map((report) => `
          <article class="report-card">
            <div class="report-meta">${escapeHtml(report.category)} · ${escapeHtml(formatDate(report.timestamp))}</div>
            <h3>${escapeHtml(report.title)}</h3>
            <div class="report-meta">Produced by ${escapeHtml(report.producedBy)}</div>
            <div class="report-body">${renderMarkdown(report.body)}</div>
          </article>
        `).join('') : document.getElementById('empty-state-template').innerHTML}
      </div>
    </section>
  `;
}

async function renderAgent(route) {
  const [meta, detail] = await Promise.all([
    getJson('meta.json'),
    getJson(`agents/${route.agent}.json`),
  ]);
  renderHero(meta);

  const activeTab = state.agentTabs[route.agent] || 'state';
  const tabs = ['state', 'journal', 'knowledge', 'messages'];
  let body = '';

  if (activeTab === 'state') {
    body = detail.state ? renderMarkdown(detail.state) : document.getElementById('empty-state-template').innerHTML;
  } else if (activeTab === 'journal') {
    body = detail.journals && detail.journals.length > 0
      ? `<div class="journal-list">${detail.journals.map((journal) => `
          <article class="timeline-item">
            <div class="timeline-header">
              <strong>${escapeHtml(journal.date)}</strong>
            </div>
            <div class="entry-body">${renderMarkdown(journal.body)}</div>
          </article>
        `).join('')}</div>`
      : document.getElementById('empty-state-template').innerHTML;
  } else if (activeTab === 'knowledge') {
    body = detail.knowledge ? renderMarkdown(detail.knowledge) : document.getElementById('empty-state-template').innerHTML;
  } else {
    const combined = [...detail.messagesReceived, ...detail.messagesSent]
      .sort((left, right) => String(right.timestamp || '').localeCompare(String(left.timestamp || '')));
    body = combined.length > 0
      ? `<div class="message-list">${combined.map((message) => `
          <article class="message-item">
            <div class="message-header">
              <div>${agentPill(message.from)} <span class="muted">to</span> ${agentPill(message.to)}</div>
              <span class="meta-chip">${escapeHtml(formatDate(message.timestamp))}</span>
            </div>
            <h3 class="message-title">${escapeHtml(message.title)}</h3>
            <div class="message-meta">${escapeHtml(message.type)} · ${escapeHtml(message.location)}</div>
            <div class="message-body">${renderMarkdown(message.body)}</div>
          </article>
        `).join('')}</div>`
      : document.getElementById('empty-state-template').innerHTML;
  }

  app.innerHTML = `
    <section class="agent-layout">
      <a class="agent-back" href="#/">← Back to overview</a>
      <article class="agent-detail">
        <div class="agent-title-row">
          <div>
            <div class="agent-header">
              ${agentPill(detail.name)}
              <span class="meta-chip">${detail.journals.length} journals</span>
            </div>
            <h2>${escapeHtml(detail.name)}</h2>
          </div>
        </div>
        <div class="agent-tabs">
          ${tabs.map((tab) => `
            <button class="${activeTab === tab ? 'active' : ''}" data-tab="${tab}">${tab}</button>
          `).join('')}
        </div>
        <div class="agent-body">${body}</div>
      </article>
    </section>
  `;

  for (const button of app.querySelectorAll('[data-tab]')) {
    button.addEventListener('click', () => {
      state.agentTabs[route.agent] = button.getAttribute('data-tab');
      render();
    });
  }
}

async function render() {
  const route = parseRoute();
  updateActiveNav(route);
  app.innerHTML = '<div class="loading-state">Loading feed…</div>';

  try {
    if (route.name === 'timeline') {
      await renderTimeline();
      return;
    }
    if (route.name === 'messages') {
      await renderMessages(route);
      return;
    }
    if (route.name === 'reports') {
      await renderReports();
      return;
    }
    if (route.name === 'agent') {
      await renderAgent(route);
      return;
    }
    await renderOverview();
  } catch (error) {
    console.error(error);
    app.innerHTML = `
      <div class="error-state">
        <h2>Unable to load the feed</h2>
        <p>${escapeHtml(error.message || 'Unknown error')}</p>
      </div>
    `;
  }
}

window.addEventListener('hashchange', render);
render();
