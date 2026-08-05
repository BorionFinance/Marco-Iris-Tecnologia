/* Marco Iris Tecnologia v2.8.8
   Separador único do sistema: a bolinha "•" com espaço dos dois lados.
   Este arquivo roda por último e é idempotente: passar duas vezes no mesmo
   elemento não duplica nada. */
(() => {
  'use strict';

  const ROOTS = ['#root', '#modal-root', '#confirm-root'];
  const DOT = '•';
  const MICRO_DOT = /[·‧∙・]/;

  let applying = false;
  let scheduled = 0;

  const qa = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  function isDot(node) {
    return node && node.nodeType === Node.ELEMENT_NODE &&
      (node.classList.contains('inline-dot-v280') || node.classList.contains('inline-dot-v288'));
  }

  function makeDot() {
    const dot = document.createElement('span');
    dot.className = 'inline-dot-v280 inline-dot-v288';
    dot.setAttribute('aria-hidden', 'true');
    dot.textContent = DOT;
    return dot;
  }

  /* Troca o ponto miúdo "·" pela bolinha "•", já com respiro, em qualquer texto visível. */
  function normalizeText(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'OPTION') return NodeFilter.FILTER_REJECT;
        return MICRO_DOT.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const pending = [];
    while (walker.nextNode()) pending.push(walker.currentNode);
    pending.forEach(node => {
      node.nodeValue = node.nodeValue.replace(/\s*[·‧∙・]\s*/g, ` ${DOT} `);
    });
  }

  /* Nome e documento (ou equipamento e modelo) nunca colados: sempre com a bolinha no meio. */
  function ensureDots(root) {
    const cells = qa('td, td.inline-information-v280', root);
    cells.forEach(cell => {
      if (!cell.querySelector(':scope > strong, :scope > button.text-link, :scope > button.code-link, :scope > a')) return;

      const smalls = qa(':scope > small', cell);
      if (!smalls.length) return;
      let inserted = false;

      smalls.forEach(small => {
        /* Sobra de versões anteriores: bolinha grudada no começo do próprio texto. */
        const cleaned = small.textContent.replace(/^\s*[•●·‧∙・]\s*/, '');
        if (cleaned !== small.textContent) small.textContent = cleaned;
        if (small.textContent.trim() === '') return;

        /* Procura, para trás, o conteúdo anterior visível dentro da mesma célula. */
        let previous = small.previousSibling;
        while (previous) {
          if (isDot(previous)) return;
          if (previous.nodeType === Node.TEXT_NODE) {
            if (previous.nodeValue.trim() === '') { previous = previous.previousSibling; continue; }
            break;
          }
          if (previous.nodeType === Node.ELEMENT_NODE) break;
          previous = previous.previousSibling;
        }
        if (!previous) return;
        if (previous.nodeType === Node.ELEMENT_NODE && previous.textContent.trim() === '') return;

        small.insertAdjacentElement('beforebegin', makeDot());
        small.dataset.dotV288 = 'span';
        inserted = true;
      });

      if (inserted || cell.querySelector(':scope > .inline-dot-v280')) cell.classList.add('inline-information-v280');
    });

    /* Uniformiza qualquer bolinha antiga que tenha ficado com outro caractere. */
    qa('.inline-dot-v280, .inline-dot-v288', root).forEach(dot => {
      if (dot.textContent !== DOT) dot.textContent = DOT;
      dot.classList.add('inline-dot-v288');
    });
  }

  function apply() {
    if (applying) return;
    applying = true;
    try {
      ROOTS.forEach(selector => {
        const root = document.querySelector(selector);
        if (!root) return;
        normalizeText(root);
        ensureDots(root);
      });
    } catch (error) {
      console.warn('[v288] separador:', error);
    } finally {
      applying = false;
    }
  }

  function schedule() {
    if (applying || scheduled) return;
    scheduled = requestAnimationFrame(() => {
      scheduled = 0;
      apply();
    });
  }

  function start() {
    apply();
    const observer = new MutationObserver(() => schedule());
    ROOTS.forEach(selector => {
      const root = document.querySelector(selector);
      if (root) observer.observe(root, { childList: true, subtree: true, characterData: true });
    });
    document.addEventListener('marco:rendered', schedule);
    window.addEventListener('hashchange', schedule);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.MarcoSeparadorV288 = { apply };
})();
