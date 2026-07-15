
(function () {
    'use strict';

    function cleanPath(pathname) {
        return String(pathname || '/').replace(/\/+$/, '') || '/';
    }

    function initSidebarPremium() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        sidebar.querySelectorAll(
            '.sidebar-menu-link,.nav-btn,.sidebar-profile-link,.sidebar-action,.sidebar-logout'
        ).forEach(function (item) {
            const span = item.querySelector('span');
            const label = String(
                span ? span.textContent : item.textContent
            ).replace(/\s+/g, ' ').trim();

            if (label) {
                item.dataset.sidebarLabel = label;
                if (!item.getAttribute('aria-label')) {
                    item.setAttribute('aria-label', label);
                }
            }
        });

        const currentPath = cleanPath(window.location.pathname);

        sidebar.querySelectorAll(
            'a.sidebar-menu-link,a.sidebar-profile-link,a.nav-btn'
        ).forEach(function (link) {
            const linkPath = cleanPath(
                new URL(link.href, window.location.origin).pathname
            );

            const active =
                currentPath === linkPath ||
                (
                    linkPath !== '/' &&
                    currentPath.startsWith(`${linkPath}/`)
                );

            link.classList.toggle('active', active);

            if (active) {
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
        });

        let backdrop = document.querySelector('.xbfs-sidebar-backdrop');

        if (!backdrop) {
            backdrop = document.createElement('button');
            backdrop.type = 'button';
            backdrop.className = 'xbfs-sidebar-backdrop';
            backdrop.setAttribute('aria-label', 'Cerrar menú lateral');
            sidebar.insertAdjacentElement('afterend', backdrop);
        }

        const closeMobile = function () {
            sidebar.classList.remove('open');
            document.body.classList.remove('xbfs-sidebar-mobile-open');
        };

        backdrop.addEventListener('click', closeMobile);

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') closeMobile();
        });

        new MutationObserver(function () {
            document.body.classList.toggle(
                'xbfs-sidebar-mobile-open',
                sidebar.classList.contains('open')
            );
        }).observe(sidebar, {
            attributes: true,
            attributeFilter: ['class']
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            initSidebarPremium,
            { once: true }
        );
    } else {
        initSidebarPremium();
    }
})();
