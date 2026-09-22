/* ==========================================================================
   ui.js
   Presentation-only helpers: navigation, tab switching, accordions, toasts.
   Holds no image-processing logic.
   ========================================================================== */

const UI = (() => {

  function initNavToggle() {
    const toggle = document.getElementById('navToggle');
    const links = document.getElementById('navLinks');
    if (!toggle || !links) return;
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }));
  }

  function initFaq() {
    document.querySelectorAll('.faq-q').forEach(btn => {
      const answer = btn.nextElementSibling;
      btn.addEventListener('click', () => {
        const isOpen = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!isOpen));
        answer.style.maxHeight = isOpen ? '0px' : `${answer.scrollHeight}px`;
      });
    });
  }

  /** mode: 'convert' | 'compress' | 'resize'. onChange(mode) fires after switch. */
  function initModeTabs(onChange) {
    const tabs = document.querySelectorAll('.mode-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.setAttribute('aria-selected', 'false'));
        tab.setAttribute('aria-selected', 'true');
        onChange(tab.dataset.mode);
      });
    });
    document.querySelectorAll('[data-mode-link]').forEach(link => {
      link.addEventListener('click', (e) => {
        const mode = link.dataset.modeLink;
        const target = document.querySelector(`.mode-tab[data-mode="${mode}"]`);
        if (target) target.click();
      });
    });
  }

  function showToast(message, type = 'info') {
    const region = document.getElementById('toastRegion');
    if (!region) return;
    const toast = document.createElement('div');
    toast.className = `toast${type === 'error' ? ' toast-error' : ''}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.textContent = message;
    region.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4200);
  }

  return { initNavToggle, initFaq, initModeTabs, showToast };
})();
