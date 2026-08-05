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

  /* Na ficha do cliente, o botão de editar layout mora numa caixinha de
     38x38 fixos. Ao entrar/sair do modo de edição o próprio sistema
     reescreve esse botão com ícone + texto ("Salvar layout"), e o texto
     não cabe — foi o que espremia tudo ali em cima. Aqui o texto some de
     novo, sobra só o ícone; a explicação completa continua no title. */
  function normalizeFloatingLayoutButton(root) {
    qa('.modal-floating-controls-v281 [data-action="toggle-layout-v256"]', root).forEach(button => {
      const hasText = [...button.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '');
      if (!hasText) return;
      const modal = button.closest('.modal');
      const editing = Boolean(modal?.classList.contains('layout-editing-v256'));
      [...button.childNodes].forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) node.remove();
      });
      const label = editing ? 'Salvar layout' : 'Editar layout';
      button.title = label;
      button.setAttribute('aria-label', label);
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
        normalizeFloatingLayoutButton(root);
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
    watchFloatingControls();
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

  /* Ficha do cliente: mede a altura real da barra flutuante (editar/fechar,
     e a barra de salvar/cancelar quando em edição de layout) e informa ao
     CSS via variável, para o espaço reservado acima do conteúdo nunca ficar
     nem curto (sobrepõe) nem exagerado (buraco vazio). */
  function watchFloatingControls() {
    if (typeof ResizeObserver === 'undefined') return;
    const seen = new WeakSet();
    const observer = new ResizeObserver(entries => {
      entries.forEach(entry => {
        const box = entry.target;
        const modal = box.closest('.modal');
        if (!modal) return;
        const height = Math.ceil(box.getBoundingClientRect().height);
        modal.style.setProperty('--floating-controls-h-v288', `${Math.max(58, height)}px`);
      });
    });
    const attach = () => {
      qa('.modal-floating-controls-v281').forEach(box => {
        if (seen.has(box)) return;
        seen.add(box);
        observer.observe(box);
      });
    };
    attach();
    new MutationObserver(schedule2 => attach())
      .observe(document.body, { childList: true, subtree: true });
  }

  window.MarcoSeparadorV288 = { apply };
})();
