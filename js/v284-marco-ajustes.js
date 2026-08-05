/*
 * Marco Iris Tecnologia v2.8.4
 * Ajustes finais de OSV, pagamentos, catálogo, estoque, PDF e responsividade.
 */
(() => {
  'use strict';

  const q = (selector, root = document) => root?.querySelector?.(selector) || null;
  const qa = (selector, root = document) => [...(root?.querySelectorAll?.(selector) || [])];
  const numberValue = value => typeof num === 'function' ? num(value) : Number(String(value || '').replace(/[^\d,.-]/g, '').replace('.', '').replace(',', '.')) || 0;
  const isoNow = () => typeof nowIso === 'function' ? nowIso() : new Date().toISOString();
  const currentDate = () => typeof today === 'function' ? today() : new Date().toISOString().slice(0, 10);
  const moneyText = value => typeof currency === 'function' ? currency(value) : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  const hasMachineFee = method => /d[eé]bito|cr[eé]dito|outro/i.test(String(method || '')) && !/pix|dinheiro|boleto|transfer[eê]ncia/i.test(String(method || ''));
  const dispatch = (control, type = 'change') => control?.dispatchEvent(new Event(type, { bubbles: true }));
  const waitFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const deepClone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));

  let pendingCatalog = null;
  let pendingStockExpense = null;
  let patchScheduled = false;

  function schedulePatch() {
    if (patchScheduled) return;
    patchScheduled = true;
    requestAnimationFrame(() => {
      patchScheduled = false;
      patchAll();
    });
  }

  function patchModalHeader(modal) {
    const header = q(':scope > .modal-header', modal);
    if (!header) return;
    header.classList.add('modal-header-v284');
    const title = q(':scope > h2', header);
    if (title) title.classList.add('modal-title-v284');
    qa('[data-action="toggle-layout-v256"], [data-action="toggle-form-layout"], [data-action="open-osv-layout-editor"]', header)
      .forEach(button => button.classList.add('modal-layout-v284'));
    const close = q('[data-action="close-modal"]', header);
    if (close) close.classList.add('modal-close-v284');
  }

  function patchOrderDetail(modal) {
    if (!modal?.classList.contains('order-detail-v280')) return;
    const heroToolbar = q('.detail-hero > .toolbar', modal);
    const statusHost = heroToolbar?.lastElementChild;
    if (statusHost && statusHost !== heroToolbar?.firstElementChild) statusHost.classList.add('order-hero-status-v284');

    const paymentButton = q('[data-action="new-payment"]', modal);
    if (paymentButton) {
      paymentButton.innerHTML = `${typeof icon === 'function' ? icon('plus', 18) : '+'} <span>Pagamento</span>`;
      paymentButton.title = 'Pagamento';
      paymentButton.setAttribute('aria-label', 'Pagamento');
    }
    refreshPdfButtons(modal);
  }

  function refreshPdfButtons(root = document) {
    qa('[data-action="view-current-pdf"]', root).forEach(button => {
      const orderId = button.dataset.id;
      if (!orderId || typeof findOrder !== 'function') return;
      const order = findOrder(orderId);
      const hasPdf = Array.isArray(order?.pdfs) && order.pdfs.some(pdf => pdf && pdf.official !== false);
      button.disabled = !hasPdf;
      button.classList.toggle('is-disabled', !hasPdf);
      button.title = hasPdf ? 'Visualizar PDF' : 'Gere o PDF para visualizar';
      button.setAttribute('aria-label', button.title);
    });
  }

  function patchOrderTable(root = document) {
    qa('.osv-table tbody td:nth-child(4)', root).forEach(cell => {
      qa(':scope > .inline-dot-v280', cell).forEach(dot => dot.remove());
      const small = q(':scope > small.muted', cell);
      if (small) small.textContent = small.textContent.replace(/^\s*[•●·]\s*/, ' • ');
      cell.dataset.v280Separator = '1';
    });
  }

  function patchStockCheck(row) {
    const label = q('.stock-check', row);
    const input = q('[data-item-field="stock"]', label);
    if (!label || !input) return;
    label.title = 'Baixar estoque';
    label.setAttribute('aria-label', 'Baixar estoque');
    label.classList.add('stock-check-v284');
    if (q('.stock-check-content-v284', label)) return;
    const content = document.createElement('span');
    content.className = 'stock-check-content-v284';
    content.innerHTML = `<span class="stock-check-title-v284">Baixar estoque</span>`;
    label.replaceChildren(input, content);
  }

  function patchOrderItem(row) {
    if (!row) return;
    patchStockCheck(row);
    const field = q('.item-name', row);
    const select = q('[data-item-field="ref"]', field);
    if (!field || !select || q('[data-action="open-full-catalog-v284"]', field)) return;
    field.classList.add('item-name-v284');
    const control = document.createElement('div');
    control.className = 'item-select-control-v284';
    select.before(control);
    control.appendChild(select);
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn secondary compact item-catalog-add-v284';
    add.dataset.action = 'open-full-catalog-v284';
    add.title = 'Cadastrar e selecionar no catálogo';
    add.setAttribute('aria-label', add.title);
    add.innerHTML = typeof icon === 'function' ? icon('plus', 17) : '+';
    control.appendChild(add);
  }

  function addCalculatedFeeLine(row) {
    const summary = q('.payment-summary-box-v280', row);
    if (!summary || q('[data-payment-calculated-fee]', summary)) return;
    const line = document.createElement('div');
    line.className = 'payment-summary-line-v280 payment-fee-line-v284';
    line.innerHTML = `<small>Taxa calculada</small><strong data-payment-calculated-fee>${moneyText(0)}</strong>`;
    const gross = q('.payment-gross-line-v280', summary);
    summary.insertBefore(line, gross || summary.lastElementChild);
  }

  function updatePaymentRow(row) {
    const method = q('[data-payment-field="method"]', row)?.value || '';
    const value = numberValue(q('[data-payment-field="value"]', row)?.value);
    const grossInput = q('[data-payment-field="fee"]', row);
    const machine = hasMachineFee(method);
    let enteredGross = machine ? numberValue(grossInput?.value) : value;
    if (machine && grossInput && enteredGross < value) {
      if (window.MarcoMoney?.setValue) window.MarcoMoney.setValue(grossInput, value);
      else grossInput.value = String(value.toFixed(2)).replace('.', ',');
      enteredGross = value;
    }
    const gross = machine ? Math.max(value, enteredGross || value) : value;
    const fee = Math.max(0, gross - value);
    const grossOutput = q('[data-payment-gross]', row);
    const feeOutput = q('[data-payment-calculated-fee]', row);
    if (grossOutput) grossOutput.textContent = moneyText(gross);
    if (feeOutput) feeOutput.textContent = moneyText(fee);
    const feeLine = q('.payment-fee-line-v284', row);
    if (feeLine) feeLine.hidden = !machine;
    const label = grossInput?.closest('.fee-field')?.querySelector('label');
    if (label) label.textContent = 'Valor com taxa';
  }

  function patchOrderForm(form) {
    if (!form) return;
    q('[data-action="toggle-quick-catalog-create"]', form)?.remove();
    q('[data-quick-catalog-panel]', form)?.remove();
    qa('.item-editor-row', form).forEach(patchOrderItem);
    qa('.payment-editor-row', form).forEach(row => {
      const input = q('[data-payment-field="fee"]', row);
      const label = input?.closest('.fee-field')?.querySelector('label');
      if (label) label.textContent = 'Valor com taxa';
      addCalculatedFeeLine(row);
      updatePaymentRow(row);
    });
  }

  function patchProductForm(form) {
    if (!form || form.dataset.id || q('[name="generateInitialStockExpense"]', form)) return;
    const grid = q('.product-form-grid', form) || q('.form-grid', form);
    if (!grid) return;
    const option = document.createElement('label');
    option.className = 'field full linked-expense-option-v284';
    option.innerHTML = `<span class="linked-expense-control-v284"><input type="checkbox" name="generateInitialStockExpense"><span><strong>Gerar despesa da compra do estoque inicial</strong><small>Ao salvar, o lançamento completo de despesa será aberto e ficará vinculado ao produto e à movimentação.</small></span></span>`;
    grid.appendChild(option);
  }

  function patchStockMovementForm(form) {
    if (!form || form.dataset.id || q('[name="generateStockExpense"]', form)) return;
    const grid = q('.movement-grid', form) || q('.form-grid', form);
    if (!grid) return;
    const option = document.createElement('label');
    option.className = 'field full linked-expense-option-v284';
    option.innerHTML = `<span class="linked-expense-control-v284"><input type="checkbox" name="generateStockExpense"><span><strong>Gerar despesa desta compra de estoque</strong><small>Disponível para entradas. A despesa será criada e vinculada a esta movimentação.</small></span></span>`;
    grid.appendChild(option);
    const movementType = form.elements.movementType;
    const sync = () => {
      const isEntry = movementType?.value !== 'Saída';
      option.hidden = !isEntry;
      option.classList.toggle('is-hidden', !isEntry);
      option.querySelector('input').disabled = !isEntry;
      if (!isEntry) option.querySelector('input').checked = false;
    };
    movementType?.addEventListener('change', sync);
    sync();
  }

  function patchStandalonePayment(form) {
    if (!form) return;
    const field = q('.payment-fee', form);
    const label = q('label', field);
    if (label) label.textContent = 'Valor com taxa';
    const input = form.elements?.fee;
    if (input) input.dataset.grossValueInput = 'true';
  }

  function patchAll() {
    const modal = q('#modal-root .modal');
    if (modal) {
      patchModalHeader(modal);
      patchOrderDetail(modal);
      qa('form[data-form="order"]', modal).forEach(patchOrderForm);
      qa('form[data-form="product"]', modal).forEach(patchProductForm);
      qa('form[data-form="stock-movement"]', modal).forEach(patchStockMovementForm);
      qa('form[data-form="payment"]', modal).forEach(patchStandalonePayment);
      refreshPdfButtons(modal);
    }
    const view = q('#view-root');
    if (view) {
      patchOrderTable(view);
      refreshPdfButtons(view);
    }
  }

  async function findOrderForm(attempts = 80) {
    for (let index = 0; index < attempts; index += 1) {
      const form = q('#modal-root form[data-form="order"]');
      if (form) return form;
      await waitFrame();
    }
    return null;
  }

  async function resumeCatalogSelection(context, newId) {
    if (!context || !newId || !window.MarcoOrderFormBridge?.resume) return;
    window.MarcoOrderFormBridge.resume(context.ticket);
    const form = await findOrderForm();
    if (!form) {
      typeof toast === 'function' && toast('O item foi salvo, mas não foi possível reabrir a OSV automaticamente.', 'warn');
      return;
    }
    let rows = qa('.item-editor-row', form);
    while (rows.length <= context.rowIndex) {
      q('[data-action="add-item-row"]', form)?.click();
      await waitFrame();
      rows = qa('.item-editor-row', form);
    }
    const row = rows[context.rowIndex] || rows.at(-1);
    const type = q('[data-item-field="type"]', row);
    if (type) {
      type.value = context.type;
      dispatch(type);
    }
    await waitFrame();
    const ref = q('[data-item-field="ref"]', row);
    if (ref) {
      ref.value = newId;
      dispatch(ref);
    }
    patchOrderItem(row);
    if (typeof updateOrderFormTotal === 'function') updateOrderFormTotal();
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    typeof toast === 'function' && toast(`${context.type} cadastrado e selecionado na OSV.`, 'ok');
  }

  async function openCatalogForRow(button) {
    const row = button.closest('.item-editor-row');
    const form = button.closest('form[data-form="order"]');
    if (!row || !form || !window.MarcoOrderFormBridge?.suspend) return;
    const type = q('[data-item-field="type"]', row)?.value === 'Produto' ? 'Produto' : 'Serviço';
    const rowIndex = qa('.item-editor-row', form).indexOf(row);
    const ticket = await window.MarcoOrderFormBridge.suspend();
    if (!ticket) return;
    pendingCatalog = { type, rowIndex, ticket };
    if (type === 'Produto') openProductForm('');
    else openServiceForm('');
    schedulePatch();
  }

  function setMoney(input, value) {
    if (!input) return;
    if (window.MarcoMoney?.setValue) window.MarcoMoney.setValue(input, value, { touch: true });
    else input.value = String(value.toFixed(2)).replace('.', ',');
    dispatch(input, 'input');
  }

  function catalogRecord(type, itemId) {
    const store = typeof data === 'function' ? data() : null;
    return type === 'Insumo'
      ? store?.supplies?.find(item => item.id === itemId)
      : store?.products?.find(item => item.id === itemId);
  }

  function stockBalance(type, itemId) {
    const store = typeof data === 'function' ? data() : null;
    return (store?.stockMovements || [])
      .filter(movement => movement.itemType === type && (type === 'Produto' ? movement.productId === itemId : movement.supplyId === itemId))
      .reduce((balance, movement) => balance + (/entrada/i.test(movement.movementType || '') ? 1 : -1) * numberValue(movement.quantity), 0);
  }

  function recalculateStock(type, itemId) {
    const store = typeof data === 'function' ? data() : null;
    const rows = (store?.stockMovements || [])
      .filter(movement => movement.itemType === type && (type === 'Produto' ? movement.productId === itemId : movement.supplyId === itemId))
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true }));
    let balance = 0;
    rows.forEach(movement => {
      movement.stockBefore = balance;
      balance += (/entrada/i.test(movement.movementType || '') ? 1 : -1) * numberValue(movement.quantity);
      movement.stockAfter = balance;
    });
  }

  function productPayloadFromForm(form) {
    const values = Object.fromEntries(new FormData(form));
    const description = String(values.description || '').trim();
    const cost = Math.max(0, numberValue(values.cost));
    const initialStock = Math.max(0, numberValue(values.initialStock));
    if (!description) throw new Error('Informe a descrição do produto.');
    if (initialStock <= 0) throw new Error('Informe um estoque inicial maior que zero para gerar a despesa.');
    if (cost <= 0) throw new Error('Informe o custo do produto para calcular a despesa do estoque inicial.');
    return { values, description, cost, initialStock };
  }

  function movementPayloadFromForm(form) {
    const values = Object.fromEntries(new FormData(form));
    const type = values.itemType === 'Insumo' ? 'Insumo' : 'Produto';
    const item = catalogRecord(type, values.itemId);
    const quantity = Math.max(0, numberValue(values.quantity));
    if (values.movementType === 'Saída') throw new Error('A geração de despesa está disponível apenas para entradas de estoque.');
    if (!item) throw new Error('Selecione um item válido.');
    if (quantity <= 0) throw new Error('Informe uma quantidade maior que zero.');
    const cost = Math.max(0, numberValue(item.cost));
    if (cost <= 0) throw new Error('O item precisa ter custo cadastrado para gerar a despesa.');
    return { values, type, item, quantity, cost };
  }

  function openStockExpense(flow) {
    pendingStockExpense = flow;
    openPaymentForm('', flow.orderId || '');
    requestAnimationFrame(() => {
      const form = q('#modal-root form[data-form="payment"]');
      if (!form || pendingStockExpense !== flow) return;
      form.dataset.stockExpenseFlowV284 = 'true';
      const modalTitle = q('#modal-root .modal-header h2');
      if (modalTitle) modalTitle.textContent = 'Despesa da compra de estoque';
      const type = form.elements.type;
      if (type) { type.value = 'Despesa'; dispatch(type); }
      const method = form.elements.paymentMethod;
      if (method) { method.value = 'Pix'; dispatch(method); }
      const paymentDate = form.elements.paymentDate;
      if (paymentDate) paymentDate.value = currentDate();
      const settlement = form.elements.settlementState;
      if (settlement) { settlement.value = 'paid'; dispatch(settlement); }
      if (form.elements.planned) form.elements.planned.checked = false;
      setMoney(form.elements.value, flow.totalCost);
      setMoney(form.elements.fee, flow.totalCost);
      if (form.elements.expenseName) form.elements.expenseName.value = `Compra de estoque — ${flow.description}`;
      if (form.elements.localPurchase) form.elements.localPurchase.value = flow.supplier || '';
      if (form.elements.expenseCategory) form.elements.expenseCategory.value = 'Estoque';
      if (form.elements.notes) form.elements.notes.value = flow.notes || '';
      const grid = q('.payment-form-grid', form) || q('.form-grid', form);
      if (grid && !q('.stock-expense-callout-v284', form)) {
        const callout = document.createElement('div');
        callout.className = 'field full stock-expense-callout-v284';
        callout.innerHTML = `<strong>Compra vinculada ao estoque</strong><span>${flow.quantity} unidade(s) • custo total ${moneyText(flow.totalCost)}. Ao salvar, produto/movimentação/despesa serão gravados e vinculados.</span>`;
        grid.prepend(callout);
      }
      dispatch(form.elements.value, 'input');
      schedulePatch();
    });
  }

  function createPendingStockRecords(flow, paymentId) {
    const store = data();
    if (flow.kind === 'new-product') {
      const values = flow.payload.values;
      const margin = Math.min(0.99, Math.max(0, numberValue(values.margin) / 100));
      const productId = flow.productId;
      if (store.products.some(product => product.id === productId)) throw new Error('O código do produto já foi utilizado. Reabra o cadastro e tente novamente.');
      const product = {
        id: productId,
        description: flow.payload.description,
        brand: values.brand || '',
        supplier: values.supplier || '',
        cost: flow.payload.cost,
        margin,
        suggestedPrice: margin >= 0.99 ? flow.payload.cost / 0.01 : flow.payload.cost / (1 - margin),
        salePrice: numberValue(values.salePrice),
        initialStock: 0,
        minimumStock: values.minimumStock === '' ? '' : numberValue(values.minimumStock),
        costUpdatedAt: currentDate(),
        priceUpdatedAt: currentDate(),
        status: values.status || 'Ativo',
        createdAt: isoNow(),
        updatedAt: isoNow(),
        initialStockExpenseId: paymentId
      };
      const movement = {
        id: flow.movementId,
        itemType: 'Produto',
        productId,
        supplyId: '',
        movementType: 'Entrada',
        quantity: flow.quantity,
        date: currentDate(),
        orderId: '',
        notes: 'Estoque inicial do cadastro com despesa vinculada',
        stockBefore: 0,
        stockAfter: flow.quantity,
        sourceItemId: '',
        origin: 'initial-stock-purchase',
        expenseId: paymentId,
        createdAt: isoNow(),
        updatedAt: isoNow()
      };
      store.products.push(product);
      store.stockMovements.push(movement);
      return { product, movement, itemType: 'Produto', itemId: productId };
    }

    const type = flow.payload.type;
    const itemId = flow.payload.values.itemId;
    const before = stockBalance(type, itemId);
    const movement = {
      id: flow.movementId,
      itemType: type,
      productId: type === 'Produto' ? itemId : '',
      supplyId: type === 'Insumo' ? itemId : '',
      movementType: 'Entrada',
      quantity: flow.quantity,
      date: flow.payload.values.date || currentDate(),
      orderId: flow.payload.values.orderId || '',
      notes: flow.payload.values.notes || 'Compra de estoque com despesa vinculada',
      stockBefore: before,
      stockAfter: before + flow.quantity,
      sourceItemId: '',
      origin: 'stock-purchase',
      expenseId: paymentId,
      createdAt: isoNow(),
      updatedAt: isoNow()
    };
    store.stockMovements.push(movement);
    recalculateStock(type, itemId);
    return { movement, itemType: type, itemId };
  }

  function patchPaymentLink(payment, records, flow) {
    if (!payment) return;
    payment.stockPurchase = true;
    payment.origin = 'stock-purchase';
    payment.stockMovementId = records.movement.id;
    payment.stockProductId = records.itemType === 'Produto' ? records.itemId : '';
    payment.stockSupplyId = records.itemType === 'Insumo' ? records.itemId : '';
    payment.updatedAt = isoNow();
    records.movement.expenseId = payment.id;
    if (records.product) records.product.initialStockExpenseId = payment.id;
    payment.notes = String(payment.notes || flow.notes || '').trim();
  }

  const baseSaveServiceForm = window.saveServiceForm;
  if (typeof baseSaveServiceForm === 'function') {
    window.saveServiceForm = async function saveServiceFormV284(form) {
      const isNew = !form.dataset.id;
      const expectedId = isNew ? (q('.osv-code-preview strong', form)?.textContent.trim() || nextCode('SRV', data().services)) : form.dataset.id;
      const context = isNew && pendingCatalog?.type === 'Serviço' ? pendingCatalog : null;
      const result = await baseSaveServiceForm(form);
      if (context) {
        pendingCatalog = null;
        await resumeCatalogSelection(context, expectedId);
      }
      return result;
    };
  }

  const baseSaveProductForm = window.saveProductForm;
  if (typeof baseSaveProductForm === 'function') {
    window.saveProductForm = async function saveProductFormV284(form) {
      const isNew = !form.dataset.id;
      const generateExpense = isNew && !!form.elements.generateInitialStockExpense?.checked;
      if (generateExpense) {
        const payload = productPayloadFromForm(form);
        const productId = q('.osv-code-preview strong', form)?.textContent.trim() || nextCode('PRD', data().products);
        const movementId = nextCode('MOV', data().stockMovements);
        const catalogContext = pendingCatalog?.type === 'Produto' ? pendingCatalog : null;
        pendingCatalog = null;
        openStockExpense({
          kind: 'new-product',
          payload,
          productId,
          movementId,
          quantity: payload.initialStock,
          totalCost: payload.cost * payload.initialStock,
          description: payload.description,
          supplier: payload.values.supplier || '',
          orderId: '',
          notes: `Compra do estoque inicial de ${payload.description} (${payload.initialStock} unidade(s)).`,
          catalogContext
        });
        return;
      }
      const expectedId = isNew ? (q('.osv-code-preview strong', form)?.textContent.trim() || nextCode('PRD', data().products)) : form.dataset.id;
      const context = isNew && pendingCatalog?.type === 'Produto' ? pendingCatalog : null;
      const result = await baseSaveProductForm(form);
      if (context) {
        pendingCatalog = null;
        await resumeCatalogSelection(context, expectedId);
      }
      return result;
    };
  }

  const baseSaveStockMovement = window.saveStockMovement;
  if (typeof baseSaveStockMovement === 'function') {
    window.saveStockMovement = async function saveStockMovementV284(form) {
      const generateExpense = !form.dataset.id && !!form.elements.generateStockExpense?.checked;
      if (!generateExpense) return baseSaveStockMovement(form);
      const payload = movementPayloadFromForm(form);
      const movementId = q('.osv-code-preview strong', form)?.textContent.trim() || nextCode('MOV', data().stockMovements);
      openStockExpense({
        kind: 'stock-entry',
        payload,
        movementId,
        quantity: payload.quantity,
        totalCost: payload.cost * payload.quantity,
        description: payload.item.description || payload.item.name || payload.item.id,
        supplier: payload.item.supplier || '',
        orderId: payload.values.orderId || '',
        notes: payload.values.notes || `Compra de estoque de ${payload.item.description || payload.item.id}.`,
        catalogContext: null
      });
    };
  }

  const baseSavePaymentForm = window.savePaymentForm;
  if (typeof baseSavePaymentForm === 'function') {
    window.savePaymentForm = async function savePaymentFormV284(form) {
      const flow = pendingStockExpense;
      if (!flow || form.dataset.stockExpenseFlowV284 !== 'true') return baseSavePaymentForm(form);
      const profileId = typeof activeProfile === 'function' ? activeProfile().id : null;
      const snapshot = deepClone(data());
      const paymentId = q('[data-payment-id-preview]', form)?.value || nextCode('DES', data().payments);
      let records = null;
      let baseCompleted = false;
      try {
        records = createPendingStockRecords(flow, paymentId);
        const result = await baseSavePaymentForm(form);
        baseCompleted = true;
        const payment = data().payments.find(item => item.id === paymentId);
        if (!payment) throw new Error('A despesa foi salva, mas o vínculo com o estoque não foi encontrado.');
        patchPaymentLink(payment, records, flow);
        await persist('Compra de estoque vinculada', `${payment.id} • ${records.movement.id} • ${flow.description}`);
        pendingStockExpense = null;
        if (typeof renderView === 'function') renderView();
        typeof toast === 'function' && toast('Produto, estoque e despesa salvos e vinculados.', 'ok');
        if (flow.catalogContext) await resumeCatalogSelection(flow.catalogContext, flow.productId);
        return result;
      } catch (error) {
        if (!baseCompleted && profileId && typeof STATE === 'object' && STATE?.dataByProfile) {
          STATE.dataByProfile[profileId] = snapshot;
        }
        throw error;
      }
    };
  }

  const baseGeneratePdf = window.generatePdfForOrder;
  if (typeof baseGeneratePdf === 'function') {
    window.generatePdfForOrder = async function generatePdfForOrderV284(...args) {
      const result = await baseGeneratePdf(...args);
      refreshPdfButtons(document);
      schedulePatch();
      return result;
    };
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest('button,[data-action]');
    if (!button) return;
    if (button.dataset.action === 'open-full-catalog-v284') {
      event.preventDefault();
      event.stopImmediatePropagation();
      try { await openCatalogForRow(button); }
      catch (error) { typeof toast === 'function' && toast(error.message || 'Não foi possível abrir o cadastro.', 'error'); }
      return;
    }

    if (button.dataset.action === 'close-modal') {
      const paymentForm = button.closest('form[data-form="payment"][data-stock-expense-flow-v284="true"]');
      const catalogForm = button.closest('form[data-form="service"], form[data-form="product"]');
      if (paymentForm && pendingStockExpense) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const context = pendingStockExpense.catalogContext;
        pendingStockExpense = null;
        await Promise.resolve(closeModal({ reason: 'replace-modal', immediate: true }));
        if (context) window.MarcoOrderFormBridge?.resume?.(context.ticket);
        return;
      }
      if (catalogForm && pendingCatalog) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const context = pendingCatalog;
        pendingCatalog = null;
        await Promise.resolve(closeModal({ reason: 'replace-modal', immediate: true }));
        window.MarcoOrderFormBridge?.resume?.(context.ticket);
      }
    }
  }, true);

  document.addEventListener('input', event => {
    if (!event.target.matches?.('[data-payment-field="value"], [data-payment-field="fee"]')) return;
    const row = event.target.closest?.('.payment-editor-row');
    if (row) updatePaymentRow(row);
  }, true);
  document.addEventListener('change', event => {
    const row = event.target.closest?.('.payment-editor-row');
    if (row) updatePaymentRow(row);
    if (event.target.matches?.('[data-item-field="type"], [data-payment-field="method"], [name="paymentMethod"]')) schedulePatch();
  }, true);

  const shouldPatchStructure = records => records.some(record => [...record.addedNodes].some(node =>
    node.nodeType === 1 && (node.matches?.('.modal-backdrop,.modal,form,.item-editor-row,.payment-editor-row,.osv-table') ||
      node.querySelector?.('.modal,form,.item-editor-row,.payment-editor-row,.osv-table'))
  ));
  const observer = new MutationObserver(records => { if (shouldPatchStructure(records)) schedulePatch(); });
  const modalRoot = document.getElementById('modal-root');
  const appRoot = document.getElementById('root');
  if (modalRoot) observer.observe(modalRoot, { subtree: true, childList: true });
  if (appRoot) observer.observe(appRoot, { subtree: true, childList: true });
  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(schedulePatch, 120); }, { passive: true });
  window.addEventListener('load', schedulePatch, { once: true });
  schedulePatch();

  window.MarcoV284 = { version: '2.8.4', patchAll, refreshPdfButtons };
})();
