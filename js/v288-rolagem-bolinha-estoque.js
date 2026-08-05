/* Marco Iris Tecnologia v2.8.12
   Normalização leve de separadores, botões de layout e rodapé da OSV.
   Processa somente os nós alterados, sem varrer o aplicativo inteiro a cada mutação. */
(() => {
  'use strict';

  const ROOT_SELECTOR = '#root, #modal-root, #confirm-root';
  const DOT = '•';
  const MICRO_DOT = /[·‧∙・]/;
  const pendingRoots = new Set();
  const observedFloating = new WeakSet();
  let applying = false;
  let scheduled = 0;

  const qa = (selector, root = document) => Array.from(root?.querySelectorAll?.(selector) || []);
  const isElement = node => node?.nodeType === Node.ELEMENT_NODE;
  const nearestAppRoot = node => (isElement(node) ? node : node?.parentElement)?.closest?.(ROOT_SELECTOR) || null;

  function isDot(node) {
    return isElement(node) && (node.classList.contains('inline-dot-v280') || node.classList.contains('inline-dot-v288'));
  }

  function makeDot() {
    const dot = document.createElement('span');
    dot.className = 'inline-dot-v280 inline-dot-v288';
    dot.setAttribute('aria-hidden', 'true');
    dot.textContent = DOT;
    return dot;
  }

  function normalizeText(root) {
    if (!root) return;
    const normalizeNode = node => {
      const parent = node?.parentElement;
      if (!parent || /^(SCRIPT|STYLE|TEXTAREA|OPTION)$/.test(parent.tagName) || !MICRO_DOT.test(node.nodeValue || '')) return;
      node.nodeValue = node.nodeValue.replace(/\s*[·‧∙・]\s*/g, ` ${DOT} `);
    };
    if (root.nodeType === Node.TEXT_NODE) return normalizeNode(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || /^(SCRIPT|STYLE|TEXTAREA|OPTION)$/.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return MICRO_DOT.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(normalizeNode);
  }

  function candidateCells(root) {
    if (!root) return [];
    const cells = [];
    if (isElement(root) && root.matches('td,td.inline-information-v280')) cells.push(root);
    qa('td,td.inline-information-v280', root).forEach(cell => cells.push(cell));
    const parentCell = (isElement(root) ? root : root.parentElement)?.closest?.('td,td.inline-information-v280');
    if (parentCell) cells.push(parentCell);
    return [...new Set(cells)];
  }

  function ensureDots(root) {
    candidateCells(root).forEach(cell => {
      if (!cell.querySelector(':scope > strong, :scope > button.text-link, :scope > button.code-link, :scope > a')) return;
      const smalls = qa(':scope > small', cell);
      let inserted = false;
      smalls.forEach(small => {
        const cleaned = small.textContent.replace(/^\s*[•●·‧∙・]\s*/, '');
        if (cleaned !== small.textContent) small.textContent = cleaned;
        if (!small.textContent.trim()) return;
        let previous = small.previousSibling;
        while (previous?.nodeType === Node.TEXT_NODE && !previous.nodeValue.trim()) previous = previous.previousSibling;
        if (!previous || isDot(previous)) return;
        if (previous.nodeType === Node.ELEMENT_NODE && !previous.textContent.trim()) return;
        small.insertAdjacentElement('beforebegin', makeDot());
        small.dataset.dotV288 = 'span';
        inserted = true;
      });
      if (inserted || cell.querySelector(':scope > .inline-dot-v280')) cell.classList.add('inline-information-v280');
    });
    const dots = [];
    if (isElement(root) && root.matches('.inline-dot-v280,.inline-dot-v288')) dots.push(root);
    qa('.inline-dot-v280,.inline-dot-v288', root).forEach(dot => dots.push(dot));
    dots.forEach(dot => { dot.textContent = DOT; dot.classList.add('inline-dot-v288'); });
  }

  function stripVisibleLabel(button, label) {
    if (!button) return;
    [...button.childNodes].forEach(node => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) node.remove();
      else if (isElement(node) && node.tagName === 'SPAN' && !node.classList.contains('pdf-button-spinner')) node.remove();
    });
    button.title = label;
    button.setAttribute('aria-label', label);
  }

  function normalizeIconButtons(root) {
    const scope = isElement(root) ? root : root?.parentElement || document;
    const layoutButtons = [];
    if (scope.matches?.('[data-action="toggle-layout-v256"]')) layoutButtons.push(scope);
    qa('[data-action="toggle-layout-v256"]', scope).forEach(button => layoutButtons.push(button));
    layoutButtons.forEach(button => {
      const editing = Boolean(button.closest('.modal')?.classList.contains('layout-editing-v256'));
      stripVisibleLabel(button, editing ? 'Salvar layout' : 'Editar layout');
    });

    const pdfButtons = [];
    if (scope.matches?.('.osv-form-actions-v280 [data-action="generate-pdf"], .osv-form-actions-v280 [data-pdf-generate]')) pdfButtons.push(scope);
    qa('.osv-form-actions-v280 [data-action="generate-pdf"], .osv-form-actions-v280 [data-pdf-generate]', scope).forEach(button => pdfButtons.push(button));
    pdfButtons.forEach(button => {
      const generating = button.getAttribute('aria-busy') === 'true';
      stripVisibleLabel(button, generating ? 'Gerando PDF…' : 'Gerar PDF');
      button.classList.add('icon-only-v280');
    });
  }

  const floatingResizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
    entries.forEach(entry => {
      const modal = entry.target.closest('.modal');
      if (!modal) return;
      const height = Math.ceil(entry.target.getBoundingClientRect().height);
      modal.style.setProperty('--floating-controls-h-v288', `${Math.max(58, height)}px`);
    });
  });

  function observeFloatingControls(root) {
    if (!floatingResizeObserver || !root) return;
    const boxes = [];
    if (isElement(root) && root.matches('.modal-floating-controls-v281')) boxes.push(root);
    qa('.modal-floating-controls-v281', root).forEach(box => boxes.push(box));
    boxes.forEach(box => {
      if (observedFloating.has(box)) return;
      observedFloating.add(box);
      floatingResizeObserver.observe(box);
    });
  }

  function apply(root) {
    if (!root || applying) return;
    applying = true;
    try {
      normalizeText(root);
      ensureDots(root);
      normalizeIconButtons(root);
      observeFloatingControls(root);
    } catch (error) {
      console.warn('[v2.8.12] normalização visual:', error);
    } finally {
      applying = false;
    }
  }

  function schedule(root) {
    const target = root?.nodeType === Node.TEXT_NODE ? root.parentElement : root;
    if (target) pendingRoots.add(target);
    if (scheduled) return;
    scheduled = requestAnimationFrame(() => {
      scheduled = 0;
      const roots = [...pendingRoots];
      pendingRoots.clear();
      roots.forEach(apply);
    });
  }

  function start() {
    qa(ROOT_SELECTOR).forEach(apply);
    const observer = new MutationObserver(records => {
      if (applying) return;
      records.forEach(record => {
        if (record.type === 'characterData') schedule(record.target);
        record.addedNodes?.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE || isElement(node)) schedule(node);
        });
      });
    });
    qa(ROOT_SELECTOR).forEach(root => observer.observe(root, { childList: true, subtree: true, characterData: true }));
    document.addEventListener('marco:rendered', event => schedule(event.target || document));
    window.addEventListener('hashchange', () => qa(ROOT_SELECTOR).forEach(schedule));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.MarcoSeparadorV288 = { apply, schedule };
})();
