'use strict';

/* Marco Iris Tecnologia v2.8.16
 * Otimização isolada da listagem de OSVs.
 * Mantém a página única e a aparência atual, mas evita cálculos quadráticos,
 * cria as ações sob demanda e adiciona as linhas em blocos para não travar a tela.
 */
(() => {
  const ORDER_STATUSES = ['Orçamento', 'Em andamento', 'Aguardando peça', 'Concluída', 'Cancelada'];
  const FIRST_BATCH_DESKTOP = 72;
  const NEXT_BATCH_DESKTOP = 96;
  const FIRST_BATCH_MOBILE = 36;
  const NEXT_BATCH_MOBILE = 48;
  let generation = 0;
  let pending = null;
  let scheduledHandle = 0;
  let scheduledKind = '';

  const settings = () => {
    const d = data();
    d.settings = d.settings || {};
    return d.settings;
  };

  const canonicalId = (value, prefix) =>
    window.MarcoIdentifiers?.normalizeEntityCode?.(value, prefix) || String(value || '');

  function cancelScheduledAppend() {
    if (!scheduledHandle) return;
    if (scheduledKind === 'idle' && typeof cancelIdleCallback === 'function') cancelIdleCallback(scheduledHandle);
    else cancelAnimationFrame(scheduledHandle);
    scheduledHandle = 0;
    scheduledKind = '';
  }

  function cancelProgressiveRender() {
    generation += 1;
    pending = null;
    cancelScheduledAppend();
  }

  function periodState() {
    const s = settings();
    s.periodFilters = s.periodFilters || {};
    const state = s.periodFilters.orders || (s.periodFilters.orders = { month: '', fromDay: '', toDay: '' });
    state.month = String(state.month || '');
    state.fromDay = String(state.fromDay || '');
    state.toDay = String(state.toDay || '');
    return state;
  }

  function clampDay(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.min(31, Math.trunc(parsed))) : 0;
  }

  function matchesPeriod(value) {
    const state = periodState();
    const date = String(value || '').slice(0, 10);
    if (state.month && date.slice(0, 7) !== state.month) return false;
    const from = clampDay(state.fromDay);
    const to = clampDay(state.toDay);
    const day = clampDay(date.slice(8, 10));
    if (!from && !to) return true;
    if (from && !to) return day === from;
    if (!from && to) return day === to;
    return day >= Math.min(from, to) && day <= Math.max(from, to);
  }

  function periodControls() {
    const state = periodState();
    return `<div class="period-filter-v256" data-period-section="orders"><input class="filter-control period-month-v256" type="month" data-period-month-v256="orders" value="${attr(state.month)}" aria-label="Selecionar mês e ano"><label class="period-day-v256"><span>De</span><input class="filter-control" type="number" min="1" max="31" inputmode="numeric" data-period-from-v256="orders" value="${attr(state.fromDay)}" placeholder="Dia" aria-label="Dia inicial"></label><label class="period-day-v256"><span>Até</span><input class="filter-control" type="number" min="1" max="31" inputmode="numeric" data-period-to-v256="orders" value="${attr(state.toDay)}" placeholder="Dia" aria-label="Dia final"></label><button type="button" class="icon-btn control-square-v256" data-action="clear-period-v256" data-section="orders" title="Limpar período" aria-label="Limpar período">🧹</button></div>`;
  }

  function archivedButton(count) {
    const showing = SHOW_ARCHIVED.orders;
    const title = showing ? 'Ver ativos' : `Arquivadas (${count})`;
    return `<button type="button" class="icon-btn control-square-v256" data-action="toggle-archived-orders" title="${attr(title)}" aria-label="${attr(title)}" data-count="${attr(count)}">${icon(showing ? 'check' : 'archive')}</button>`;
  }

  function buildClientMap(d) {
    const map = new Map();
    for (const client of d.clients || []) {
      map.set(String(client.id || ''), client);
      map.set(canonicalId(client.id, 'CLI'), client);
    }
    return map;
  }

  function clientFor(map, id) {
    return map.get(String(id || '')) || map.get(canonicalId(id, 'CLI')) || null;
  }

  function paymentCancelled(payment) {
    return norm(payment?.status).includes('cancel') || !!payment?.cancelledAt || payment?.active === false;
  }

  function buildFinanceMap(d) {
    const map = new Map();
    const todayKey = today();
    for (const payment of d.payments || []) {
      if (norm(payment?.type) !== 'receita' || paymentCancelled(payment) || !payment?.orderId) continue;
      const id = canonicalId(payment.orderId, 'OSV');
      let info = map.get(id);
      if (!info) {
        info = { paid: 0, dueDate: '', overdue: false };
        map.set(id, info);
      }
      if (payment.paymentDate) info.paid += num(payment.value);
      else if (payment.dueDate) {
        const due = String(payment.dueDate).slice(0, 10);
        if (!info.dueDate || due < info.dueDate) info.dueDate = due;
        if (due < todayKey) info.overdue = true;
      }
    }
    return map;
  }

  function financeFor(order, financeMap) {
    if (norm(order?.status).includes('cancel')) return { status: 'Cancelado', paid: 0, balance: 0, overdue: false, dueDate: '' };
    const summary = financeMap.get(canonicalId(order.id, 'OSV')) || { paid: 0, dueDate: '', overdue: false };
    const paid = summary.paid;
    const total = num(order.total);
    const balance = Math.max(0, total - paid);
    const status = balance <= 0.005 && total > 0 ? 'Pago' : paid > 0 ? 'Parcial' : summary.overdue ? 'Vencido' : 'Em aberto';
    return { status, paid, balance, overdue: summary.overdue, dueDate: summary.dueDate };
  }

  function sequence(value) {
    return Number(String(value || '').match(/(\d+)(?!.*\d)/)?.[1] || 0);
  }

  function sortOrders(list, context) {
    const state = settings().tableSorts?.orders;
    if (!state || state.direction === 'default' || Number(state.column) < 0) {
      return list.sort((a, b) => String(b.openedAt || '').localeCompare(String(a.openedAt || '')));
    }
    const column = Number(state.column);
    const direction = state.direction === 'desc' ? -1 : 1;
    const text = value => String(value || '').toLocaleLowerCase('pt-BR');
    const valueFor = order => {
      if (column === 0) return sequence(order.id);
      if (column === 1) return String(order.openedAt || '');
      if (column === 2) return text(order.clientName || clientFor(context.clientMap, order.clientId)?.name);
      if (column === 3) return text(`${order.equipmentType || ''} ${order.brandModel || ''}`);
      if (column === 4) return text(financeFor(order, context.financeMap).status);
      if (column === 5) return text(order.status);
      if (column === 6) return num(order.total);
      return 0;
    };
    return list.sort((a, b) => {
      const av = valueFor(a), bv = valueFor(b);
      const comparison = typeof av === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'pt-BR', { sensitivity: 'base', numeric: true });
      return direction * comparison || String(b.openedAt || '').localeCompare(String(a.openedAt || ''));
    });
  }

  function selectedStatusOptions(selected) {
    return ORDER_STATUSES.map(value => `<option value="${attr(value)}" ${value === selected ? 'selected' : ''}>${esc(value)}</option>`).join('');
  }

  function rowHtml(order, context) {
    const client = clientFor(context.clientMap, order.clientId);
    const finance = financeFor(order, context.financeMap);
    const financeLabel = finance.status === 'Parcial' && finance.overdue ? 'Parcial - vencido' : finance.status;
    const pendingValue = finance.balance > 0 ? `${privacy(currency(finance.balance))} pendente` : '';
    return `<tr class="clickable-row-v256" data-row-action="view-order" data-id="${attr(order.id)}" tabindex="0" role="button"><td data-label="OSV"><strong>${esc(order.id)}</strong>${order.registrationStatus === 'Inativo' ? '<small class="muted">Arquivada</small>' : ''}</td><td data-label="Abertura">${formatDate(order.openedAt)}</td><td data-label="Cliente"><button class="text-link" data-action="view-client" data-id="${attr(order.clientId)}">${esc(order.clientName || client?.name || '—')}</button></td><td data-label="Equipamento"><strong>${esc(order.equipmentType || '—')}</strong>${order.brandModel ? `<small class="muted"> · ${esc(order.brandModel)}</small>` : ''}</td><td data-label="Financeiro">${statusBadge(financeLabel)}<small class="muted">${pendingValue}</small></td><td data-label="Status"><div class="inline-status-shell" data-status-tone="${attr(norm(order.status))}"><select class="inline-status" data-quick-order-status="${attr(order.id)}" aria-label="Status operacional da OSV ${attr(order.id)}">${selectedStatusOptions(order.status)}</select><span class="inline-status-chevron" aria-hidden="true">${icon('arrow', 14)}</span><span class="inline-status-saving" aria-hidden="true"></span></div></td><td data-label="Valor" class="text-right"><strong>${privacy(currency(order.total))}</strong></td><td data-label="Ações"><details class="quick-actions" data-osv-actions="${attr(order.id)}" data-client-id="${attr(order.clientId)}"><summary aria-label="Ações rápidas">${icon('menu', 18)}</summary><div class="quick-actions-menu" data-osv-actions-menu></div></details></td></tr>`;
  }

  function hydrateActions(details) {
    const menu = details?.querySelector?.('[data-osv-actions-menu]');
    if (!menu || menu.dataset.ready === '1') return;
    const orderId = details.dataset.osvActions || '';
    const clientId = details.dataset.clientId || '';
    menu.innerHTML = `<button data-action="new-payment" data-order="${attr(orderId)}">${icon('finance', 16)} Adicionar pagamento</button><button data-action="generate-pdf-background" data-id="${attr(orderId)}">${icon('pdf', 16)} Gerar PDF</button><button data-action="view-current-pdf" data-id="${attr(orderId)}">${icon('eye', 16)} Visualizar PDF</button><button data-action="share-order" data-id="${attr(orderId)}">${icon('phone', 16)} Enviar PDF</button><button data-action="view-client" data-id="${attr(clientId)}">${icon('clients', 16)} Abrir cliente</button><button data-action="edit-order" data-id="${attr(orderId)}">${icon('edit', 16)} Editar OSV</button>`;
    menu.dataset.ready = '1';
  }

  function batchSizes() {
    const mobile = window.innerWidth <= 720;
    return {
      first: mobile ? FIRST_BATCH_MOBILE : FIRST_BATCH_DESKTOP,
      next: mobile ? NEXT_BATCH_MOBILE : NEXT_BATCH_DESKTOP
    };
  }

  function appendBatch() {
    scheduledHandle = 0;
    scheduledKind = '';
    const job = pending;
    if (!job || job.token !== generation || CURRENT_VIEW !== 'orders') return;
    const tbody = document.querySelector(`tbody[data-osv-progressive="${CSS.escape(String(job.token))}"]`);
    if (!tbody) return;
    const end = Math.min(job.orders.length, job.index + job.batchSize);
    let html = '';
    for (let index = job.index; index < end; index += 1) html += rowHtml(job.orders[index], job.context);
    if (html) tbody.insertAdjacentHTML('beforeend', html);
    job.index = end;
    if (job.index >= job.orders.length) {
      tbody.removeAttribute('data-osv-progressive');
      pending = null;
      return;
    }
    scheduleNextBatch();
  }

  function scheduleNextBatch() {
    if (!pending || scheduledHandle) return;
    if (typeof requestIdleCallback === 'function') {
      scheduledKind = 'idle';
      scheduledHandle = requestIdleCallback(appendBatch, { timeout: 120 });
    } else {
      scheduledKind = 'raf';
      scheduledHandle = requestAnimationFrame(appendBatch);
    }
  }

  renderOrders = function renderOrdersOptimizedV290() {
    cancelProgressiveRender();
    const d = data();
    const clientMap = buildClientMap(d);
    const financeMap = buildFinanceMap(d);
    const context = { clientMap, financeMap };
    const status = settings().orderStatusFilterV256 || 'Todos';
    const all = [];

    for (const order of d.serviceOrders || []) {
      const clientName = clientFor(clientMap, order.clientId)?.name || '';
      if (matches(order.id, order.clientName, clientName, order.equipmentType, order.brandModel, order.status, order.reportedIssue)) all.push(order);
    }

    const archived = all.reduce((count, order) => count + (order.registrationStatus === 'Inativo' ? 1 : 0), 0);
    const rows = all.filter(order =>
      (SHOW_ARCHIVED.orders ? order.registrationStatus === 'Inativo' : order.registrationStatus !== 'Inativo') &&
      matchesPeriod(order.openedAt || order.createdAt)
    );
    const filtered = status === 'Todos' ? rows : rows.filter(order => norm(order.status) === norm(status));
    sortOrders(filtered, context);

    const mode = getViewMode('orders');
    const sizes = batchSizes();
    const firstCount = Math.min(filtered.length, sizes.first);
    const token = generation;
    let firstRows = '';
    for (let index = 0; index < firstCount; index += 1) firstRows += rowHtml(filtered[index], context);

    if (firstCount < filtered.length) {
      pending = { token, orders: filtered, context, index: firstCount, batchSize: sizes.next };
    }

    const statusOptions = `<option>Todos</option>${ORDER_STATUSES.map(value => `<option ${value === status ? 'selected' : ''}>${esc(value)}</option>`).join('')}`;
    return `<div class="toolbar unified-toolbar-v256 orders-toolbar"><div class="toolbar-left"><button class="btn primary control-main-v256" data-action="new-order">${icon('plus')} Nova OSV</button>${periodControls()}<select class="filter-control control-status-v256" data-order-status-v256 aria-label="Filtrar por status">${statusOptions}</select>${archivedButton(archived)}</div><div class="toolbar-right">${viewModeSwitcher('orders', mode)}<span class="badge blue">${filtered.length} OSVs</span></div></div><section class="card view-mode-content mode-${mode}" data-view-content="orders"><div class="table-wrap"><table class="table osv-table"><thead><tr><th>OSV</th><th>Abertura</th><th>Cliente</th><th>Equipamento</th><th>Financeiro</th><th>Status</th><th class="text-right">Valor</th><th>Ações</th></tr></thead><tbody ${pending ? `data-osv-progressive="${token}"` : ''}>${firstRows || '<tr><td colspan="8"><div class="empty">Nenhuma OSV encontrada.</div></td></tr>'}</tbody></table></div></section>`;
  };

  const renderViewBaseV290 = renderView;
  renderView = function renderViewWithOSVPerformanceV290(...args) {
    if (CURRENT_VIEW !== 'orders') cancelProgressiveRender();
    const result = renderViewBaseV290.apply(this, args);
    if (CURRENT_VIEW === 'orders' && pending) scheduleNextBatch();
    return result;
  };

  document.addEventListener('click', event => {
    const summary = event.target.closest?.('details[data-osv-actions] > summary');
    if (summary) hydrateActions(summary.parentElement);
  }, true);

  document.addEventListener('toggle', event => {
    const details = event.target;
    if (details?.matches?.('details[data-osv-actions]') && details.open) hydrateActions(details);
  }, true);

  window.MarcoOSVPerformance = {
    version: '2.8.16',
    cancel: cancelProgressiveRender,
    pendingCount: () => pending ? Math.max(0, pending.orders.length - pending.index) : 0
  };
})();
