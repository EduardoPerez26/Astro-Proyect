(function () {
    'use strict';

    const TABLE_SELECTOR = [
        '.prepaid-page .prepaid-table',
        '.property-documents-page #pmDocumentsTable',
        '.property-management-page .pm-schedule-table',
        '.property-management-page .pm-documents-table',
        '.property-management-page .preview-table',
        '.property-management-page .preview-excel-table'
    ].join(',');

    const WRAP_SELECTOR = [
        '.prepaid-table-wrap',
        '.table-container',
        '.pm-schedule-table-wrap',
        '.pm-documents-table-wrap',
        '.preview-table-wrapper'
    ].join(',');

    const clones = new WeakMap();
    let ticking = false;

    function getWrap(table) {
        return table.closest(WRAP_SELECTOR) || table.parentElement;
    }

    function isVisible(element) {
        return !!(element && element.offsetParent !== null && element.getClientRects().length);
    }

    function ensureClone(table) {
        let item = clones.get(table);
        if (item) return item;

        const wrap = document.createElement('div');
        wrap.className = 'floating-table-header';
        if (table.closest('.prepaid-page')) {
            wrap.classList.add('is-prepaid-header');
        } else if (table.closest('.property-documents-page')) {
            wrap.classList.add('is-documents-header');
        } else if (table.closest('.property-management-page')) {
            wrap.classList.add('is-property-management-header');
        }
        wrap.setAttribute('aria-hidden', 'true');

        const cloneTable = document.createElement('table');
        cloneTable.className = `${table.className || ''} floating-table-header-table`;
        wrap.appendChild(cloneTable);
        document.body.appendChild(wrap);

        item = { wrap, table: cloneTable, signature: '' };
        clones.set(table, item);
        return item;
    }

    function hideClone(item) {
        if (item) item.wrap.classList.remove('is-visible');
    }

    function syncHeader(table, item) {
        const head = table.tHead;
        if (!head) return false;

        const signature = Array.from(head.rows)
            .map(row => `${row.cells.length}:${row.textContent.trim()}`)
            .join('|');

        if (item.signature !== signature) {
            item.table.innerHTML = '';
            item.table.appendChild(head.cloneNode(true));
            item.signature = signature;
        }

        const sourceCells = Array.from(head.rows[0]?.cells || []);
        const cloneCells = Array.from(item.table.tHead?.rows[0]?.cells || []);
        sourceCells.forEach((cell, index) => {
            const computed = window.getComputedStyle(cell);
            const width = `${cell.getBoundingClientRect().width}px`;
            if (cloneCells[index]) {
                cloneCells[index].style.width = width;
                cloneCells[index].style.minWidth = width;
                cloneCells[index].style.maxWidth = width;
                cloneCells[index].style.padding = computed.padding;
                cloneCells[index].style.borderTop = computed.borderTop;
                cloneCells[index].style.borderRight = computed.borderRight;
                cloneCells[index].style.borderBottom = computed.borderBottom;
                cloneCells[index].style.borderLeft = computed.borderLeft;
                cloneCells[index].style.background = computed.backgroundImage !== 'none'
                    ? computed.background
                    : computed.backgroundColor;
                cloneCells[index].style.color = computed.color;
                cloneCells[index].style.font = computed.font;
                cloneCells[index].style.fontWeight = computed.fontWeight;
                cloneCells[index].style.letterSpacing = computed.letterSpacing;
                cloneCells[index].style.lineHeight = computed.lineHeight;
                cloneCells[index].style.textAlign = computed.textAlign;
                cloneCells[index].style.textTransform = computed.textTransform;
                cloneCells[index].style.whiteSpace = computed.whiteSpace;
                cloneCells[index].style.verticalAlign = computed.verticalAlign;
                cloneCells[index].style.boxShadow = computed.boxShadow;
            }
        });

        return true;
    }

    function updateTable(table) {
        const item = ensureClone(table);
        const wrap = getWrap(table);

        if (!isVisible(table) || !wrap || !table.tHead) {
            hideClone(item);
            return;
        }

        const tableRect = table.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        const headerHeight = table.tHead.getBoundingClientRect().height || 38;
        const viewportTop = 0;
        const hasInternalVerticalScroll = wrap.scrollHeight > wrap.clientHeight + 2;
        const scrolledInsideWrap = hasInternalVerticalScroll && wrap.scrollTop > 0;
        const pageHasPassedHeader = tableRect.top < viewportTop && tableRect.bottom > viewportTop + headerHeight;
        const wrapVisible = wrapRect.bottom > viewportTop + headerHeight && wrapRect.top < window.innerHeight - headerHeight;

        if ((!pageHasPassedHeader && !scrolledInsideWrap) || !wrapVisible) {
            hideClone(item);
            return;
        }

        if (!syncHeader(table, item)) {
            hideClone(item);
            return;
        }

        const top = scrolledInsideWrap && wrapRect.top > viewportTop ? wrapRect.top : Math.max(viewportTop, wrapRect.top);
        const left = Math.max(0, wrapRect.left);
        const right = Math.min(window.innerWidth, wrapRect.right);
        const width = Math.max(0, right - left);

        item.wrap.style.top = `${top}px`;
        item.wrap.style.left = `${left}px`;
        item.wrap.style.width = `${width}px`;
        item.wrap.style.height = `${headerHeight}px`;
        item.table.style.width = `${tableRect.width}px`;
        item.table.style.transform = `translateX(${tableRect.left - left}px)`;
        item.wrap.classList.add('is-visible');
    }

    function updateAll() {
        ticking = false;
        document.querySelectorAll(TABLE_SELECTOR).forEach(updateTable);
    }

    function requestUpdate() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(updateAll);
    }

    function bindScrollContainers() {
        document.querySelectorAll(WRAP_SELECTOR).forEach(wrap => {
            if (wrap.dataset.floatingHeaderBound === 'true') return;
            wrap.dataset.floatingHeaderBound = 'true';
            wrap.addEventListener('scroll', requestUpdate, { passive: true });
        });
    }

    function init() {
        bindScrollContainers();
        updateAll();

        window.addEventListener('scroll', requestUpdate, { passive: true });
        window.addEventListener('resize', requestUpdate);

        const observer = new MutationObserver(() => {
            bindScrollContainers();
            requestUpdate();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
