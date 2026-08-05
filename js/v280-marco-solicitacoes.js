/*
 * Marco Iris Tecnologia v2.8.4
 * Revisao solicitada pelo Marco: pagamentos, itens, rodape de OSV,
 * separadores, modais, scroll, exclusao definitiva e seguranca do cofre.
 */
(() => {
  'use strict';

  const VERSION = '2.8.4';
  const PAYMENT_WITH_FEE = /d[eé]bito|cr[eé]dito|outro/i;
  const PAYMENT_WITHOUT_FEE = /pix|dinheiro|boleto|transfer[eê]ncia/i;
  const parseSequenceV280 = value => Number(String(value || '').match(/(\d+)(?!.*\d)/)?.[1] || 0);
  const observedScrollable = new WeakSet();
  const scrollResizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
    for (const entry of entries) evaluateScrollable(entry.target);
  }) : null;
  let patchQueued = false;

  const q = (selector, root = document) => root?.querySelector?.(selector) || null;
  const qa = (selector, root = document) => [...(root?.querySelectorAll?.(selector) || [])];
  const schedulePatch = () => {
    if (patchQueued) return;
    patchQueued = true;
    requestAnimationFrame(() => {
      patchQueued = false;
      patchAll();
    });
  };
  const setIconOnly = (button, iconName, title) => {
    if (!button) return;
    const isAlreadyIconOnly = button.dataset.v280Icon === iconName && button.textContent.trim() === '';
    if (!isAlreadyIconOnly) button.innerHTML = icon(iconName, 19);
    button.dataset.v280Icon = iconName;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.classList.add('icon-only-v280');
  };
  const paymentHasFee = method => PAYMENT_WITH_FEE.test(String(method || '')) && !PAYMENT_WITHOUT_FEE.test(String(method || ''));

  function paymentLiquidText(row) {
    const input = q('[data-payment-field="value"]', row);
    const value = typeof num === 'function' ? num(input?.value) : Number(input?.value || 0);
    return typeof currency === 'function' ? currency(value) : String(value);
  }

  function patchPaymentRow(row) {
    if (!row || row.dataset.v280Payment === '1') {
      updatePaymentRow(row);
      return;
    }
    const main = q('.payment-row-main', row);
    const secondary = q('.payment-row-secondary', row);
    if (!main || !secondary) return;

    const plannedLabel = q('[data-payment-field="planned"]', row)?.closest('label');
    const planned = q('[data-payment-field="planned"]', row);
    const paymentDateField = q('[data-payment-field="paymentDate"]', row)?.closest('.field');
    const dueField = q('.due-field', row);
    const feeField = q('.fee-field', row);
    const noteField = q('.payment-note', row);
    const statusBox = q('.payment-status-box', row);
    const grossBox = q('.payment-gross-box', row);
    const removeButton = q('.payment-delete', row);

    if (plannedLabel && planned) {
      plannedLabel.classList.add('planned-source-v280');
      plannedLabel.hidden = true;
      const scheduleButton = document.createElement('button');
      scheduleButton.type = 'button';
      scheduleButton.className = 'icon-btn schedule-payment-v280';
      scheduleButton.dataset.action = 'toggle-payment-schedule-v280';
      scheduleButton.title = 'Agendar data de vencimento';
      scheduleButton.setAttribute('aria-label', 'Agendar data de vencimento');
      scheduleButton.setAttribute('aria-pressed', String(planned.checked));
      scheduleButton.innerHTML = icon('agenda', 18);
      (paymentDateField || plannedLabel).insertAdjacentElement('afterend', scheduleButton);
    }
    if (dueField) main.appendChild(dueField);

    if (noteField) {
      const input = q('[data-payment-field="notes"]', noteField);
      if (input && input.tagName !== 'TEXTAREA') {
        const textarea = document.createElement('textarea');
        [...input.attributes].forEach(attribute => textarea.setAttribute(attribute.name, attribute.value));
        textarea.value = input.value;
        textarea.rows = 2;
        textarea.className = `${input.className || ''} payment-notes-textarea-v280`.trim();
        input.replaceWith(textarea);
      }
    }

    const left = document.createElement('div');
    left.className = 'payment-secondary-left-v280';
    if (feeField) left.appendChild(feeField);
    if (noteField) left.appendChild(noteField);

    const summary = document.createElement('div');
    summary.className = 'payment-summary-box-v280';
    const liquid = document.createElement('div');
    liquid.className = 'payment-summary-line-v280';
    liquid.innerHTML = '<small>Valor líquido</small><strong data-payment-liquid-summary></strong>';
    summary.appendChild(liquid);
    if (grossBox) {
      const label = q('small', grossBox);
      if (label) label.textContent = 'Valor com taxa';
      grossBox.classList.add('payment-summary-line-v280', 'payment-gross-line-v280');
      summary.appendChild(grossBox);
    }
    if (statusBox) {
      statusBox.classList.add('payment-summary-line-v280');
      summary.appendChild(statusBox);
    }

    secondary.replaceChildren(left, summary);
    secondary.classList.add('payment-row-secondary-v280');
    if (removeButton) {
      row.appendChild(removeButton);
      removeButton.title = 'Excluir pagamento';
      removeButton.setAttribute('aria-label', 'Excluir pagamento');
    }
    row.dataset.v280Payment = '1';
    updatePaymentRow(row);
  }

  function updatePaymentRow(row) {
    if (!row) return;
    const method = q('[data-payment-field="method"]', row)?.value || 'Pix';
    const hasFee = paymentHasFee(method);
    const feeField = q('.fee-field', row);
    const grossLine = q('.payment-gross-line-v280', row);
    if (feeField) {
      feeField.hidden = !hasFee;
      feeField.classList.toggle('is-hidden', !hasFee);
      qa('input,select,textarea', feeField).forEach(control => { control.disabled = !hasFee; });
    }
    if (grossLine) {
      grossLine.hidden = !hasFee;
      grossLine.classList.toggle('is-hidden', !hasFee);
    }
    const liquid = q('[data-payment-liquid-summary]', row);
    if (liquid) { const text = paymentLiquidText(row); if (liquid.textContent !== text) liquid.textContent = text; }
    const schedule = q('[data-action="toggle-payment-schedule-v280"]', row);
    const planned = q('[data-payment-field="planned"]', row);
    const dueField = q('.due-field', row);
    if (dueField) dueField.classList.toggle('is-hidden', !planned?.checked);
    if (schedule && planned) {
      schedule.classList.toggle('is-active', planned.checked);
      schedule.setAttribute('aria-pressed', String(planned.checked));
      schedule.title = planned.checked ? 'Remover agendamento de vencimento' : 'Agendar data de vencimento';
      schedule.setAttribute('aria-label', schedule.title);
    }
  }

  function patchStandalonePayment(form) {
    if (!form) return;
    const band = window.innerWidth <= 720 ? 'mobile' : window.innerWidth <= 1100 ? 'tablet' : 'desktop';
    const savedPaymentLayout = typeof data === 'function' ? data()?.settings?.unifiedLayoutsV256?.[band]?.['form:payment'] : null;
    const hasSavedPaymentLayout = !!savedPaymentLayout && Object.values(savedPaymentLayout).some(grid => grid && Object.keys(grid).length);
    form.classList.toggle('payment-default-compact-v281', !hasSavedPaymentLayout);
    const planned = form.elements?.planned;
    const paymentDate = form.elements?.paymentDate;
    const due = form.elements?.dueDate?.closest('.field');
    const plannedLabel = planned?.closest('label');
    if (planned && plannedLabel && !q('[data-action="toggle-standalone-schedule-v280"]', form)) {
      plannedLabel.hidden = true;
      plannedLabel.classList.add('planned-source-v280');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'icon-btn schedule-payment-v280 standalone-schedule-v280';
      button.dataset.action = 'toggle-standalone-schedule-v280';
      button.innerHTML = icon('agenda', 18);
      const dateField = paymentDate?.closest('.field');
      if (dateField && paymentDate) {
        let control = q('.payment-date-control-v281', dateField);
        if (!control) {
          control = document.createElement('div');
          control.className = 'payment-date-control-v281';
          paymentDate.before(control);
          control.appendChild(paymentDate);
        }
        control.appendChild(button);
      }
    }
    const method = form.elements?.paymentMethod?.value || 'Pix';
    const hasFee = paymentHasFee(method);
    const fee = q('.payment-fee', form);
    if (fee) {
      fee.hidden = !hasFee;
      fee.classList.toggle('is-hidden', !hasFee);
      qa('input,select,textarea', fee).forEach(control => { control.disabled = !hasFee; });
    }
    const summary = q('.payment-summary', form);
    if (summary) {
      const spans = qa(':scope > span', summary);
      const feeLine = spans.find(span => /^Taxa:/i.test(span.textContent.trim()));
      const grossLine = spans.find(span => /Valor (total cobrado na maquininha|com taxa)/i.test(span.textContent));
      if (grossLine) {
        if (grossLine.childNodes[0]?.textContent !== 'Valor com taxa: ') grossLine.childNodes[0].textContent = 'Valor com taxa: ';
        grossLine.hidden = !hasFee;
      }
      if (feeLine) feeLine.hidden = !hasFee;
      let statusLine = q('[data-payment-summary-status-v280]', summary);
      if (!statusLine) {
        statusLine = document.createElement('span');
        statusLine.dataset.paymentSummaryStatusV280 = '1';
        statusLine.innerHTML = 'Status: <strong></strong>';
        summary.appendChild(statusLine);
      }
      const statusPreview = q('[data-payment-status-preview]', form)?.textContent?.trim() || 'Em aberto';
      const statusValue = q('strong', statusLine);
      if (statusValue && statusValue.textContent !== statusPreview) statusValue.textContent = statusPreview;
      summary.classList.add('payment-summary-v280');
    }
    const notes = form.elements?.notes;
    if (notes) notes.classList.add('payment-notes-standalone-v280');
    const schedule = q('[data-action="toggle-standalone-schedule-v280"]', form);
    if (schedule && planned) {
      schedule.classList.toggle('is-active', planned.checked);
      schedule.setAttribute('aria-pressed', String(planned.checked));
      schedule.title = planned.checked ? 'Remover agendamento de vencimento' : 'Agendar data de vencimento';
      schedule.setAttribute('aria-label', schedule.title);
    }
    if (due) due.classList.toggle('is-hidden', !planned?.checked);

    if (form.dataset.id && !q('[data-action="delete-payment"]', form.closest('.modal') || form)) {
      const header = q(':scope > .modal-header', form.closest('.modal'));
      const actions = q(':scope > .form-actions', form);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-btn danger permanent-delete-v280';
      remove.dataset.action = 'delete-payment';
      remove.dataset.id = form.dataset.id;
      remove.title = 'Excluir definitivamente';
      remove.setAttribute('aria-label', 'Excluir definitivamente');
      remove.innerHTML = icon('trash', 19);
      if (header) {
        /* v2.8.10 — a lixeira mora ao lado do editar/fechar, no cabeçalho da janela. */
        remove.classList.add('modal-header-delete-v288');
        const close = q('[data-action="close-modal"]', header);
        if (close) close.insertAdjacentElement('beforebegin', remove);
        else header.appendChild(remove);
      } else if (actions) {
        actions.prepend(remove);
      }
    }
  }

  function patchFinancialSummary(form) {
    const summary = q('.order-financial-breakdown', form);
    if (!summary) return;
    summary.classList.add('order-financial-breakdown-v280');
    const rows = {
      services: q('#order-form-services', summary)?.parentElement,
      products: q('#order-form-products', summary)?.parentElement,
      productCost: q('#order-form-product-cost', summary)?.parentElement,
      productProfit: q('#order-form-product-profit', summary)?.parentElement,
      itemDiscount: q('#order-form-item-discount', summary)?.parentElement,
      gross: q('#order-form-gross', summary)?.parentElement,
      generalDiscount: q('[data-field="general-discount"]', summary)?.closest('label'),
      final: q('#order-form-total', summary)?.parentElement
    };
    const hasProducts = qa('.item-editor-row', form).some(row => q('[data-item-field="type"]', row)?.value === 'Produto');
    [rows.productCost, rows.productProfit].forEach(row => {
      if (!row) return;
      row.hidden = !hasProducts;
      row.classList.toggle('is-hidden', !hasProducts);
    });
    if (summary.dataset.v280Summary === '1') return;
    Object.entries(rows).forEach(([name, row]) => {
      if (!row) return;
      row.classList.add('financial-summary-row-v280', `financial-${name}-v280`);
    });
    [rows.services, rows.products, rows.productCost, rows.productProfit, rows.itemDiscount, rows.gross, rows.generalDiscount, rows.final]
      .filter(Boolean).forEach(row => summary.appendChild(row));
    summary.dataset.v280Summary = '1';
  }

  function patchOrderItems(form) {
    qa('.item-editor-row', form).forEach(row => row.classList.add('item-editor-row-v280'));
    patchFinancialSummary(form);
  }

  function orderForForm(form) {
    const id = form?.dataset?.id || form?.dataset?.reservedCode || '';
    return id && typeof findOrder === 'function' ? findOrder(id) : null;
  }

  function patchOrderFooter(form) {
    const footer = q('.osv-form-actions', form);
    if (!footer) return;
    const order = orderForForm(form);
    const pdfs = Array.isArray(order?.pdfs) ? order.pdfs : [];
    const isHistoricalPdf = meta => !!(meta?.legacy || meta?.legacyImported || meta?.importedLegacy || meta?.historicalImported || meta?.generatedByCurrentApp === false);
    const officialPdfs = pdfs.filter(meta => meta?.official !== false);
    const hasCurrentPdf = officialPdfs.some(meta => !isHistoricalPdf(meta));
    const historyOnly = officialPdfs.length > 0 && !hasCurrentPdf;
    const status = q('[data-pdf-status]', footer);
    const state = status?.dataset?.pdfState || 'idle';
    if (status) {
      let label = 'Nenhum PDF';
      let tone = 'none';
      if (historyOnly) { label = 'PDF Histórico'; tone = 'history'; }
      else if (state === 'ready' && hasCurrentPdf) { label = 'PDF Atualizado'; tone = 'ready'; }
      else if (state === 'dirty' && officialPdfs.length) { label = 'PDF Desatualizado'; tone = 'dirty'; }
      else if (officialPdfs.length) { label = hasCurrentPdf ? 'PDF Atualizado' : 'PDF Histórico'; tone = hasCurrentPdf ? 'ready' : 'history'; }
      const text = q('[data-pdf-status-text]', status);
      if (text && text.textContent !== label) text.textContent = label;
      status.dataset.pdfToneV280 = tone;
      status.classList.add('pdf-status-v280');
    }

    const generate = q('[data-pdf-generate]', footer) || q('[data-followup="pdf"]', footer);
    const view = q('[data-action="view-current-pdf"], [data-followup="view-pdf"]', footer);
    const whatsapp = q('[data-followup="share"]', footer);
    setIconOnly(generate, 'pdf', 'Gerar PDF');
    setIconOnly(view, 'eye', 'Visualizar PDF');
    setIconOnly(whatsapp, 'whatsapp', 'Enviar pelo WhatsApp');
    if (view) {
      view.disabled = officialPdfs.length === 0;
      view.classList.toggle('is-disabled-v280', view.disabled);
    }

    const count = (order?.attachments || []).length;
    const nativeAttach = q('[data-action="open-attachments-manager"]', footer);
    let customAttach = q('[data-action="focus-technical-attachments-v280"]', footer);
    if (nativeAttach) {
      if (customAttach && customAttach !== nativeAttach) {
        customAttach.remove();
        customAttach = null;
      }
      setIconOnly(nativeAttach, 'paperclip', `Anexos Técnicos (${count})`);
    } else if (!customAttach) {
      const attach = document.createElement('button');
      attach.type = 'button';
      attach.className = 'btn secondary icon-only-v280';
      attach.dataset.action = 'focus-technical-attachments-v280';
      setIconOnly(attach, 'paperclip', `Anexos Técnicos (${count})`);
      const cancel = q('.action-cancel', footer);
      footer.insertBefore(attach, cancel || null);
    } else {
      setIconOnly(customAttach, 'paperclip', `Anexos Técnicos (${count})`);
    }
    if (order && !q('[data-action="delete-order"]', footer)) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-btn danger permanent-delete-v280';
      remove.dataset.action = 'delete-order';
      remove.dataset.id = order.id;
      remove.title = 'Excluir definitivamente';
      remove.setAttribute('aria-label', 'Excluir definitivamente');
      remove.innerHTML = icon('trash', 19);
      footer.insertBefore(remove, q('.action-cancel', footer) || null);
    }
    footer.classList.add('osv-form-actions-v280');
  }

  function patchOrderForm(form) {
    if (!form) return;
    qa('.payment-editor-row', form).forEach(patchPaymentRow);
    patchOrderItems(form);
    patchOrderFooter(form);
  }

  function patchOrderDetail(modal) {
    if (!modal || q('form[data-form="order"]', modal)) return;
    const title = q('.modal-header h2', modal)?.textContent || '';
    if (!/^OSV\b/i.test(title)) return;
    modal.classList.add('order-detail-v280');
    const orderId = title.replace(/^OSV\s*/i, '').trim();
    const order = typeof findOrder === 'function' ? findOrder(orderId) : null;
    const actionToolbar = qa('.modal-body > .toolbar', modal)[0];
    const actionHost = q('.toolbar-left', actionToolbar);
    if (!actionHost) return;
    const morePayment = q('[data-action="new-payment"]', actionHost);
    if (morePayment) {
      morePayment.innerHTML = `${icon('plus', 18)} <span>Pagamento</span>`;
      morePayment.title = 'Pagamento';
      morePayment.setAttribute('aria-label', 'Pagamento');
    }
    setIconOnly(q('[data-action="generate-pdf"]', actionHost), 'pdf', 'Gerar PDF');
    setIconOnly(q('[data-action="share-order"]', actionHost), 'whatsapp', 'Enviar pelo WhatsApp');
    setIconOnly(q('[data-action="add-order-photos"][data-mode="camera"]', actionHost), 'camera', 'Tirar Foto');
    const gallery = q('[data-action="add-order-photos"][data-mode="gallery"]', actionHost);
    setIconOnly(gallery, 'image', 'Anexar Foto');
    gallery?.classList.remove('ghost');
    gallery?.classList.add('secondary');
    setIconOnly(q('[data-action="add-order-files"]', actionHost), 'upload', 'Anexar Laudo');
    if (order && !q('[data-action="view-current-pdf"]', actionHost)) {
      const view = document.createElement('button');
      view.type = 'button';
      view.className = 'btn secondary';
      view.dataset.action = 'view-current-pdf';
      view.dataset.id = order.id;
      setIconOnly(view, 'eye', 'Visualizar PDF');
      view.disabled = !(order.pdfs || []).length;
      const generate = q('[data-action="generate-pdf"]', actionHost);
      generate?.insertAdjacentElement('afterend', view);
    }
    if (order && !q('[data-action="delete-order"]', actionHost)) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-btn danger permanent-delete-v280';
      remove.dataset.action = 'delete-order';
      remove.dataset.id = order.id;
      remove.title = 'Excluir definitivamente';
      remove.setAttribute('aria-label', remove.title);
      remove.innerHTML = icon('trash', 19);
      actionHost.appendChild(remove);
    }

    const totalBox = q('.order-detail-totals.detailed', modal);
    if (totalBox) {
      totalBox.classList.add('order-detail-totals-v280');
      qa(':scope > span', totalBox).forEach(span => span.classList.add('financial-summary-row-v280'));
      const productRows = qa(':scope > span', totalBox).filter(span => /Custo dos produtos|Lucro bruto dos produtos/i.test(span.textContent));
      const hasProducts = order && typeof orderItems === 'function' && orderItems(order.id).some(item => item.type === 'Produto');
      productRows.forEach(row => { row.hidden = !hasProducts; });
      const total = q(':scope > strong', totalBox);
      total?.classList.add('financial-final-v280');
    }
  }

  function patchModalHeader(modal) {
    const header = q('.modal-header', modal);
    if (!header) return;
    header.classList.add('modal-header-v280');
    qa('[data-action="toggle-layout-v256"], [data-action="toggle-form-layout"], [data-action="open-osv-layout-editor"]', header).forEach(button => {
      const saving = /salvar/i.test(button.textContent);
      setIconOnly(button, saving ? 'save' : 'edit', saving ? 'Salvar layout' : 'Editar Layout');
      button.classList.add('modal-layout-icon-v280');
    });
    const close = q('[data-action="close-modal"]', header);
    if (close) {
      close.title = 'Fechar';
      close.setAttribute('aria-label', 'Fechar');
      close.classList.add('modal-close-v280');
    }
  }


  function patchClientDetailHeader(modal) {
    if (!modal?.classList.contains('client-detail-modal-v256')) return;
    const header = q(':scope > .modal-header', modal);
    const body = q(':scope > .modal-body', modal);
    if (!body) return;
    let controls = q(':scope > .modal-floating-controls-v281', body);
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'modal-floating-controls-v281';
      body.prepend(controls);
    }
    const layout = q('[data-action="toggle-layout-v256"]', header || modal) || q('[data-action="toggle-layout-v256"]', modal);
    const close = q('[data-action="close-modal"]', header || modal) || q('[data-action="close-modal"]', modal);
    if (layout) {
      setIconOnly(layout, /salvar/i.test(layout.title || '') ? 'save' : 'edit', /salvar/i.test(layout.title || '') ? 'Salvar layout' : 'Editar Layout');
      layout.classList.remove('modal-layout-icon-v280');
      layout.classList.add('modal-floating-layout-v281');
      controls.appendChild(layout);
    }
    if (close) {
      close.title = 'Fechar';
      close.setAttribute('aria-label', 'Fechar');
      close.classList.remove('modal-close-v280');
      close.classList.add('modal-floating-close-v281');
      controls.appendChild(close);
    }
    const heroTitle = q('.detail-hero h2', body);
    if (heroTitle) {
      if (!heroTitle.id) heroTitle.id = 'client-detail-title-v281';
      modal.setAttribute('aria-labelledby', heroTitle.id);
    }
    header?.remove();
    modal.classList.add('client-detail-header-removed-v281');
  }

  function patchSeparators(root = document) {
    /* v2.8.10 — a bolinha "•" agora é responsabilidade única do js/v288-...js.
       Esta função só troca o texto do cabeçalho "Ordens" por "OSVs";
       inserir o separador aqui também causava bolinha duplicada. */
    qa('.clients-table-v256 thead th', root).forEach(th => {
      const label = qa('span', th).find(span => span.textContent.trim() === 'Ordens');
      if (label) label.textContent = 'OSVs';
      else if (/^Ordens(?:\s|⇅|↑|↓)*$/.test(th.textContent.trim())) {
        const textNode = [...th.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.includes('Ordens'));
        if (textNode) textNode.textContent = textNode.textContent.replace('Ordens', 'OSVs');
        else th.textContent = th.textContent.replace('Ordens', 'OSVs');
      }
    });
  }

  function patchPermanentDeleteButtons(root = document) {
    qa('[data-action="delete-payment"]', root).forEach(button => {
      button.title = 'Excluir definitivamente';
      button.setAttribute('aria-label', 'Excluir definitivamente');
      button.classList.add('permanent-delete-v280', 'danger');
    });
    qa('[data-action="delete-order"]', root).forEach(button => {
      button.title = 'Excluir definitivamente';
      button.setAttribute('aria-label', 'Excluir definitivamente');
      button.classList.add('permanent-delete-v280', 'danger');
    });
  }

  function patchSettingsSecurity(root = document) {
    if (typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW !== 'settings') return;
    const host = q('#view-root .settings-category-content', root) || q('#view-root .settings-grid', root) || q('#view-root', root);
    if (!host || q('[data-vault-security-card-v280]', host)) return;
    const card = document.createElement('section');
    card.className = 'card full-settings-card vault-security-card-v280';
    card.dataset.vaultSecurityCardV280 = '1';
    card.innerHTML = `<div class="card-header"><div><h2>Criptografia vinculada ao Google</h2><p>Os dados continuam criptografados antes de serem enviados ao Drive, mas o desbloqueio agora acontece automaticamente após a confirmação da conta autorizada.</p></div>${typeof statusBadge === 'function' ? statusBadge('Google protegido') : ''}</div><div class="list-row"><div class="list-row-main"><strong>Entrada sem senha adicional</strong><small>O login Google é a única etapa de acesso ao Marco Iris.</small></div>${icon('cloud')}</div>`;
    host.appendChild(card);
  }

  function evaluateScrollable(element) {
    if (!element?.isConnected) return;
    const overflow = element.scrollHeight > element.clientHeight + 2;
    if (element.dataset.v287Overflow === String(overflow)) return;
    element.dataset.v287Overflow = String(overflow);
    element.classList.toggle('has-inner-scroll-v280', overflow);
    element.classList.toggle('no-inner-scroll-v280', !overflow);
  }

  function markScrollable(element) {
    if (!element || observedScrollable.has(element)) return;
    observedScrollable.add(element);
    scrollResizeObserver?.observe(element);
    evaluateScrollable(element);
  }

  function patchScroll(root = document) {
    // Cards, seções e campos da OSV não devem virar dezenas de áreas de rolagem.
    // A rolagem principal fica nativa na modal; apenas listas suspensas mantêm scroll próprio.
    qa('#modal-root [data-layout-item-v256].has-inner-scroll-v280, #modal-root section.card.has-inner-scroll-v280, #modal-root .form-section.has-inner-scroll-v280', root).forEach(element => {
      element.classList.remove('has-inner-scroll-v280', 'no-inner-scroll-v280');
      delete element.dataset.v287Overflow;
    });
    qa('#modal-root .modal-body, #modal-root .client-suggestions, #modal-root [role="listbox"], #modal-root .select-options, .quick-actions-menu', root).forEach(markScrollable);
  }

  function patchAll() {
    const modal = q('#modal-root .modal');
    if (modal) {
      patchModalHeader(modal);
      patchOrderForm(q('form[data-form="order"]', modal));
      patchStandalonePayment(q('form[data-form="payment"]', modal));
      patchOrderDetail(modal);
      patchClientDetailHeader(modal);
    }
    patchSeparators(document);
    patchPermanentDeleteButtons(document);
    patchSettingsSecurity(document);
    patchScroll(document);
  }

  async function permanentlyDeletePaymentV280(id) {
    const payment = data().payments.find(item => String(item.id) === String(id) || String(item.code) === String(id));
    if (!payment) return;
    const label = payment.code || payment.id;
    const confirmed = await confirmAction(
      `Deseja excluir definitivamente este lançamento financeiro?

Esta ação não poderá ser desfeita.`,
      { confirmLabel: 'Excluir definitivamente', tone: 'danger' }
    );
    if (!confirmed) return;
    await MarcoStorage.createBackup(STATE, 'antes-de-excluir-lancamento-definitivamente');
    const profileId = activeProfile().id;
    if (typeof markPendingPaymentDeletion === 'function') markPendingPaymentDeletion(profileId, String(payment.id));
    data().payments = data().payments.filter(item => item !== payment);
    data().settings.nextIds = data().settings.nextIds || {};
    const prefix = /despesa/i.test(String(payment.type || '')) ? 'DES' : 'REC';
    const maxExisting = data().payments.reduce((max, item) => {
      const itemPrefix = /despesa/i.test(String(item.type || '')) ? 'DES' : 'REC';
      return itemPrefix === prefix ? Math.max(max, parseSequenceV280(item.code || item.id)) : max;
    }, 0);
    data().settings.nextIds[prefix] = maxExisting + 1;
    STATE.updatedAt = typeof nowIso === 'function' ? nowIso() : new Date().toISOString();
    try { window.MarcoBorionInterop?.prepareState?.(STATE); } catch (error) { console.warn('[V280_DELETE_PAYMENT_TOMBSTONE]', error); }
    await persist('Lançamento financeiro excluído definitivamente', label, { immediate: true, backup: true, media: false });
    closeModal();
    renderView();
    toast(`${label} excluído definitivamente. A numeração final foi liberada para reutilização.`);
  }

  async function permanentlyDeleteOrderV280(id) {
    const order = typeof findOrder === 'function' ? findOrder(id) : null;
    if (!order) return;
    const items = orderItems(id);
    const payments = orderPayments(id);
    const terms = orderConsentItems(id);
    const media = [...(order.photos || []), ...(order.pdfs || []), ...(order.attachments || [])];
    const confirmed = await confirmAction(
      `Deseja excluir definitivamente esta Ordem de Serviço?\n\nEsta ação não poderá ser desfeita.\n\nTambém serão removidos:\n• todos os pagamentos vinculados;\n• todos os PDFs e anexos vinculados;\n• todos os registros relacionados exclusivamente à ${id}.`,
      { confirmLabel: 'Excluir definitivamente', tone: 'danger' }
    );
    if (!confirmed) return;
    await MarcoStorage.createBackup(STATE, 'antes-de-excluir-os-definitivamente');
    let pendingDriveCleanup = 0;
    data().settings.pendingDriveCleanup = Array.isArray(data().settings.pendingDriveCleanup) ? data().settings.pendingDriveCleanup : [];
    for (const file of media) {
      if (file.localKey) {
        try { await MarcoStorage.deleteMedia(file.localKey); }
        catch (error) { console.warn('[V282_DELETE_ORDER_LOCAL_MEDIA]', error); }
      }
      if (file.driveFileId) {
        let driveError = '';
        if (GoogleDriveMarco.isConfigured()) {
          try { await GoogleDriveMarco.trash(file.driveFileId); }
          catch (error) { driveError = String(error?.message || error); }
        } else {
          driveError = 'Google Drive não configurado no momento da exclusão.';
        }
        if (driveError) {
          pendingDriveCleanup += 1;
          data().settings.pendingDriveCleanup.push({
            id: `cleanup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            orderId: id,
            mediaId: file.id || '',
            driveFileId: file.driveFileId,
            fileName: file.fileName || '',
            createdAt: typeof nowIso === 'function' ? nowIso() : new Date().toISOString(),
            error: driveError,
            reason: 'Exclusão definitiva de OSV'
          });
          console.warn('[V282_DELETE_ORDER_DRIVE_PENDING]', driveError);
        }
      }
    }
    const itemIds = new Set(items.map(item => item.id));
    data().stockMovements = data().stockMovements.filter(movement => {
      if (itemIds.has(movement.sourceItemId) || (movement.orderId === id && movement.sourceItemId)) return false;
      if (movement.orderId === id) {
        movement.orderId = '';
        movement.notes = [movement.notes, `Vínculo removido após exclusão da ${id}`].filter(Boolean).join(' · ');
      }
      return true;
    });
    const profileId = activeProfile().id;
    for (const payment of payments) {
      if (typeof markPendingPaymentDeletion === 'function') {
        markPendingPaymentDeletion(profileId, String(payment.id || payment.code || ''));
      }
    }
    data().orderItems = data().orderItems.filter(item => item.orderId !== id);
    data().payments = data().payments.filter(payment => payment.orderId !== id);
    data().consents = data().consents.filter(term => term.orderId !== id);
    data().appointments.forEach(appointment => { if (appointment.orderId === id) appointment.orderId = ''; });
    data().serviceOrders = data().serviceOrders.filter(item => item.id !== id);
    const maxExisting = data().serviceOrders.reduce((max, item) => Math.max(max, parseSequenceV280(item.id)), 0);
    data().settings.nextIds = data().settings.nextIds || {};
    data().settings.nextIds.OSV = maxExisting + 1;
    STATE.updatedAt = typeof nowIso === 'function' ? nowIso() : new Date().toISOString();
    try { window.MarcoBorionInterop?.prepareState?.(STATE); } catch (error) { console.warn('[V281_DELETE_ORDER_TOMBSTONES]', error); }
    await persist('OSV excluída definitivamente', `${id} · ${items.length} item(ns) · ${payments.length} pagamento(s) · ${terms.length} termo(s)${pendingDriveCleanup ? ` · ${pendingDriveCleanup} limpeza(s) do Drive pendente(s)` : ''}`, { immediate: true, backup: true, media: false });
    closeModal();
    renderView();
    toast(`${id} excluída definitivamente. A numeração final foi liberada para reutilização.${pendingDriveCleanup ? ` ${pendingDriveCleanup} arquivo(s) ficaram na fila segura de limpeza do Drive.` : ''}`, pendingDriveCleanup ? 'warn' : 'success');
  }

  async function handleVaultAction() {
    return false;
  }

  // A exclusao financeira definitiva deve ficar disponivel em qualquer idade.
  if (typeof canPermanentlyDeletePayment === 'function') {
    canPermanentlyDeletePayment = () => true;
  }
  if (typeof deleteOrder === 'function') {
    deleteOrder = permanentlyDeleteOrderV280;
  }
  if (typeof handleAction === 'function') {
    const handleActionBeforeV280 = handleAction;
    handleAction = async button => {
      if (button?.dataset?.action === 'delete-payment') return await permanentlyDeletePaymentV280(button.dataset.id);
      return await handleActionBeforeV280(button);
    };
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest?.('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'toggle-payment-schedule-v280') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const row = button.closest('.payment-editor-row');
      const planned = q('[data-payment-field="planned"]', row);
      if (planned) {
        planned.checked = !planned.checked;
        planned.dispatchEvent(new Event('change', { bubbles: true }));
        if (planned.checked) q('[data-payment-field="dueDate"]', row)?.focus();
      }
      updatePaymentRow(row);
      return;
    }
    if (action === 'toggle-standalone-schedule-v280') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const form = button.closest('form[data-form="payment"]');
      const planned = form?.elements?.planned;
      if (planned) {
        planned.checked = !planned.checked;
        planned.dispatchEvent(new Event('change', { bubbles: true }));
        if (planned.checked) form.elements.dueDate?.focus();
      }
      patchStandalonePayment(form);
      return;
    }
    if (action === 'focus-technical-attachments-v280') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const section = button.closest('form')?.querySelector('.osv-technical-attachments');
      section?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      section?.querySelector('input[type="file"]')?.click();
      return;
    }
    if (action === 'vault-save-recovery-v280' || action === 'vault-change-password-v280') {
      event.preventDefault();
      event.stopImmediatePropagation();
      button.disabled = true;
      try { await handleVaultAction(action.includes('password') ? 'password' : 'recovery'); }
      catch (error) { toast(error.message || 'A proteção é gerenciada automaticamente pela conta Google.', 'error'); }
      finally { button.disabled = false; }
      return;
    }
  }, true);

  document.addEventListener('input', event => {
    const row = event.target.closest?.('.payment-editor-row');
    if (row) queueMicrotask(() => updatePaymentRow(row));
  }, true);
  document.addEventListener('change', event => {
    const row = event.target.closest?.('.payment-editor-row');
    if (row) queueMicrotask(() => updatePaymentRow(row));
    if (event.target.matches?.('[data-item-field="type"], [data-payment-field="method"], [name="paymentMethod"]')) schedulePatch();
  }, true);

  const structuralPatchNeeded = records => records.some(record => [...record.addedNodes].some(node =>
    node.nodeType === 1 && (node.matches?.('.modal-backdrop,.modal,form,.item-editor-row,.payment-editor-row,.osv-table,.settings-category-content') ||
      node.querySelector?.('.modal,form,.item-editor-row,.payment-editor-row,.osv-table,.settings-category-content'))
  ));
  const patchObserver = new MutationObserver(records => { if (structuralPatchNeeded(records)) schedulePatch(); });
  const modalRoot = document.getElementById('modal-root');
  const appRoot = document.getElementById('root');
  if (modalRoot) patchObserver.observe(modalRoot, { childList: true, subtree: true });
  if (appRoot) patchObserver.observe(appRoot, { childList: true, subtree: true });
  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(schedulePatch, 120); }, { passive: true });
  window.MarcoV280 = Object.freeze({ version: VERSION, patchAll, paymentHasFee });
  schedulePatch();
})();
