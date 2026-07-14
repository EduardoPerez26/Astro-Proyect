(() => {
    'use strict';

    const VERSION = '20260714-card-hover-v1';
    const ENABLED_MEDIA = '(hover: hover) and (pointer: fine)';

    const interactiveSelectors = [
        '[data-store-card]:not(.store-card-disabled)',
        'a.schedule-option',
        'a.admin-metric-card.admin-metric-link',
        'button.schedule-card',
        'a.module-card',
        'a.restaurant-card',
        '[data-card-interactive]',
        '.xbfs-hover-card'
    ];

    const metricSelectors = [
        '.admin-metric-card:not(.admin-metric-link)',
        '.stat-card',
        '.metric-card',
        '.summary-card',
        '.prepaid-kpi-card',
        '.pm-simple-stat-card',
        '.pm-month-total-card',
        '.pm-quarter-card',
        '.pm-qc-card',
        '.system-error-card',
        '.schedule-metrics > article',
        '.schedule-header-summary > div',
        '[data-card-metric]'
    ];

    const allSelectors = [...interactiveSelectors, ...metricSelectors].join(',');
    const disabledSelector = [
        '.store-card-disabled',
        '.xbfs-card-disabled',
        '.is-disabled',
        '[aria-disabled="true"]',
        '[disabled]'
    ].join(',');

    let hoverEnabled = window.matchMedia
        ? window.matchMedia(ENABLED_MEDIA).matches
        : true;

    function isInsideExcludedUi(card) {
        return Boolean(card.closest('.swal2-container, .xbfs-modal-overlay, dialog[open]'));
    }

    function getVariant(card) {
        if (interactiveSelectors.some(selector => card.matches(selector))) {
            return 'interactive';
        }
        return 'metric';
    }

    function enhanceCard(card) {
        if (!(card instanceof HTMLElement)) return;
        if (card.dataset.xbfsCardHover === VERSION) return;
        if (isInsideExcludedUi(card)) return;

        const variant = getVariant(card);
        card.dataset.xbfsCardHover = VERSION;
        card.classList.add('xbfs-dynamic-card', `xbfs-card-hover--${variant}`);

        if (!card.querySelector(':scope > .xbfs-card-hover-glow')) {
            const glow = document.createElement('span');
            glow.className = 'xbfs-card-hover-glow';
            glow.setAttribute('aria-hidden', 'true');
            card.prepend(glow);
        }
    }

    function enhanceCards(root = document) {
        if (!root || typeof root.querySelectorAll !== 'function') return;
        root.querySelectorAll(allSelectors).forEach(enhanceCard);

        if (root instanceof Element && root.matches(allSelectors)) {
            enhanceCard(root);
        }
    }

    function findCard(target) {
        if (!(target instanceof Element)) return null;
        const card = target.closest('.xbfs-dynamic-card');
        if (!card || card.matches(disabledSelector)) return null;
        return card;
    }

    function updatePointer(card, event) {
        const rect = card.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;

        card.style.setProperty('--xbfs-card-pointer-x', `${Math.max(0, Math.min(100, x)).toFixed(2)}%`);
        card.style.setProperty('--xbfs-card-pointer-y', `${Math.max(0, Math.min(100, y)).toFixed(2)}%`);
    }

    document.addEventListener('pointerover', event => {
        if (!hoverEnabled) return;
        const card = findCard(event.target);
        if (!card) return;
        if (event.relatedTarget instanceof Node && card.contains(event.relatedTarget)) return;

        card.classList.add('xbfs-card-hovered');
        updatePointer(card, event);
    }, { passive: true });

    document.addEventListener('pointermove', event => {
        if (!hoverEnabled) return;
        const card = findCard(event.target);
        if (!card) return;
        updatePointer(card, event);
    }, { passive: true });

    document.addEventListener('pointerout', event => {
        const card = findCard(event.target);
        if (!card) return;
        if (event.relatedTarget instanceof Node && card.contains(event.relatedTarget)) return;

        card.classList.remove('xbfs-card-hovered');
    }, { passive: true });

    const mediaQuery = window.matchMedia ? window.matchMedia(ENABLED_MEDIA) : null;
    mediaQuery?.addEventListener?.('change', event => {
        hoverEnabled = event.matches;
        if (!hoverEnabled) {
            document.querySelectorAll('.xbfs-card-hovered').forEach(card => {
                card.classList.remove('xbfs-card-hovered');
            });
        }
    });

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node instanceof Element) enhanceCards(node);
            });
        });
    });

    function start() {
        enhanceCards(document);
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
