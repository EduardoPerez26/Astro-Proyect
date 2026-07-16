
(function () {
    'use strict';

    const FAVORITES_KEY = 'xbfsSidebarFavorites';
    const COLLAPSED_SECTIONS_KEY = 'xbfsSidebarCollapsedSections';

    function cleanPath(pathname) {
        return String(pathname || '/').replace(/\/+$/, '') || '/';
    }

    function readJsonSet(key) {
        try {
            return new Set(JSON.parse(localStorage.getItem(key) || '[]'));
        } catch {
            return new Set();
        }
    }

    function writeJsonSet(key, values) {
        localStorage.setItem(key, JSON.stringify(Array.from(values)));
    }

    function getLinkLabel(link) {
        return String(
            link.dataset.sidebarLabel ||
            link.querySelector('span:not(.sidebar-chat-badge)')?.textContent ||
            link.textContent ||
            ''
        ).replace(/\s+/g, ' ').trim();
    }

    function getNavigationItems() {
        return Array.from(document.querySelectorAll('.sidebar-menu-link'))
            .filter(link => !link.closest('#sidebarFavoritesMenu'))
            .map(link => {
                const item = link.closest('.sidebar-menu-item');
                const section = link.closest('.sidebar-section');
                const sectionTitle = section
                    ?.querySelector('.sidebar-section-title span, .sidebar-section-title')
                    ?.textContent
                    ?.trim() || '';

                return {
                    link,
                    item,
                    label: getLinkLabel(link),
                    href: link.getAttribute('href') || '#',
                    icon: link.querySelector('i')?.className || 'fa-solid fa-circle',
                    section: sectionTitle,
                    hidden: item?.classList.contains('hidden') ||
                        section?.hasAttribute('hidden') ||
                        section?.style.display === 'none'
                };
            })
            .filter(entry => entry.label && entry.href && entry.href !== '#');
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

        initSectionToggles(sidebar);
        initFavorites(sidebar);
        initGlobalSearch();
        initBreadcrumbs();
        initOperationalBadges();

        window.XBFSNavigation = {
            refreshFavorites: () => renderFavorites(sidebar),
            refreshBadges: initOperationalBadges,
            getItems: getNavigationItems
        };
    }

    function initBreadcrumbs() {
        const container = document.getElementById('topbarBreadcrumbs');
        if (!container) return;

        const path = cleanPath(window.location.pathname);
        const map = {
            '/views/dashboard-admin': ['Operations', 'Information Technology', 'Admin dashboard'],
            '/views/system-center': ['Operations', 'Information Technology', 'System center'],
            '/views/approval-center': ['Operations', 'Information Technology', 'Approval center'],
            '/views/system-errors': ['Operations', 'Information Technology', 'System errors'],
            '/views/usuarios': ['Operations', 'Information Technology', 'Users'],
            '/views/restaurantes': ['Operations', 'Information Technology', 'Restaurant control'],
            '/views/tiendas': ['Operations', 'Accounts Receivable', 'Stores'],
            '/views/documentos': ['Operations', 'Accounts Receivable', 'Documents'],
            '/views/historial': ['Operations', 'Accounts Receivable', 'History'],
            '/views/conciliacion': ['Operations', 'Accounts Receivable', 'Reconciliation'],
            '/views/departments/dashboard-property': ['Operations', 'Property Management', 'Schedules'],
            '/views/departments/property-management': ['Operations', 'Property Management', 'Workspace'],
            '/views/departments/property-management-documents': ['Operations', 'Property Management', 'Documents'],
            '/views/departments/prepaid-amortization': ['Operations', 'Property Management', 'Prepaid Bills'],
            '/views/perfil': ['Operations', 'Account', 'Profile and security'],
            '/views/chat': ['Operations', 'Account', 'Chat']
        };

        const parts = map[path] || ['Operations'];

        container.innerHTML = parts.map((part, index) => `
            <span ${index === parts.length - 1 ? 'aria-current="page"' : ''}>
                ${escapeHtml(part)}
            </span>
        `).join('');
    }

    function initSectionToggles(sidebar) {
        const collapsed = readJsonSet(COLLAPSED_SECTIONS_KEY);

        sidebar.querySelectorAll('[data-sidebar-section-toggle]').forEach((button, index) => {
            const section = button.closest('.sidebar-section');
            const key = section?.id || button.textContent.trim() || `section-${index}`;

            if (collapsed.has(key)) {
                section?.classList.add('is-collapsed');
                button.setAttribute('aria-expanded', 'false');
            }

            button.addEventListener('click', () => {
                const isCollapsed = section.classList.toggle('is-collapsed');
                button.setAttribute('aria-expanded', String(!isCollapsed));

                if (isCollapsed) collapsed.add(key);
                else collapsed.delete(key);

                writeJsonSet(COLLAPSED_SECTIONS_KEY, collapsed);
            });
        });
    }

    function initFavorites(sidebar) {
        sidebar.querySelectorAll('.sidebar-menu-link').forEach(link => {
            const item = link.closest('.sidebar-menu-item');
            if (!item || item.querySelector('.sidebar-favorite-toggle')) return;

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'sidebar-favorite-toggle';
            button.setAttribute('aria-label', `Toggle favorite for ${getLinkLabel(link)}`);
            button.innerHTML = '<i class="fa-regular fa-star" aria-hidden="true"></i>';
            item.appendChild(button);

            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();

                const favorites = readJsonSet(FAVORITES_KEY);
                const href = link.getAttribute('href') || '';

                if (favorites.has(href)) favorites.delete(href);
                else favorites.add(href);

                writeJsonSet(FAVORITES_KEY, favorites);
                syncFavoriteButtons(sidebar);
                renderFavorites(sidebar);
            });
        });

        syncFavoriteButtons(sidebar);
        renderFavorites(sidebar);
    }

    function syncFavoriteButtons(sidebar) {
        const favorites = readJsonSet(FAVORITES_KEY);

        sidebar.querySelectorAll('.sidebar-menu-item').forEach(item => {
            const link = item.querySelector('.sidebar-menu-link');
            const button = item.querySelector('.sidebar-favorite-toggle');
            const href = link?.getAttribute('href') || '';
            const active = favorites.has(href);

            item.classList.toggle('is-favorite', active);
            button?.classList.toggle('is-active', active);
            button?.setAttribute('aria-pressed', String(active));

            const icon = button?.querySelector('i');
            if (icon) {
                icon.className = active
                    ? 'fa-solid fa-star'
                    : 'fa-regular fa-star';
            }
        });
    }

    function renderFavorites(sidebar) {
        const section = document.getElementById('sidebarFavoritesSection');
        const menu = document.getElementById('sidebarFavoritesMenu');
        if (!section || !menu) return;

        const favorites = readJsonSet(FAVORITES_KEY);
        const items = getNavigationItems()
            .filter(item => favorites.has(item.href) && !item.hidden);

        section.hidden = items.length === 0;

        if (!items.length) {
            menu.innerHTML = '';
            return;
        }

        menu.innerHTML = items.map(item => `
            <li class="sidebar-menu-item sidebar-favorite-item">
                <a class="sidebar-menu-link" href="${escapeHtml(item.href)}">
                    <i class="${escapeHtml(item.icon)}"></i>
                    <span>${escapeHtml(item.label)}</span>
                </a>
            </li>
        `).join('');

        syncActiveFavoriteLinks(sidebar);
    }

    function syncActiveFavoriteLinks(sidebar) {
        const currentPath = cleanPath(window.location.pathname);

        sidebar.querySelectorAll('#sidebarFavoritesMenu a.sidebar-menu-link').forEach(link => {
            const linkPath = cleanPath(new URL(link.href, window.location.origin).pathname);
            const active = currentPath === linkPath || (
                linkPath !== '/' &&
                currentPath.startsWith(`${linkPath}/`)
            );

            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
    }

    function initGlobalSearch() {
        const input = document.getElementById('globalNavSearch');
        const results = document.getElementById('globalSearchResults');
        if (!input || !results) return;

        const openResults = () => {
            renderGlobalSearch(input, results);
            input.setAttribute('aria-expanded', 'true');
            results.hidden = false;
        };

        input.addEventListener('focus', openResults);
        input.addEventListener('input', () => renderGlobalSearch(input, results));

        input.addEventListener('keydown', event => {
            const links = Array.from(results.querySelectorAll('a'));
            const currentIndex = links.indexOf(document.activeElement);

            if (event.key === 'Escape') {
                closeGlobalSearch(input, results);
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                (links[currentIndex + 1] || links[0])?.focus();
            } else if (event.key === 'Enter' && links.length) {
                links[0].click();
            }
        });

        results.addEventListener('keydown', event => {
            const links = Array.from(results.querySelectorAll('a'));
            const currentIndex = links.indexOf(document.activeElement);

            if (event.key === 'Escape') {
                closeGlobalSearch(input, results);
                input.focus();
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                (links[currentIndex + 1] || links[0])?.focus();
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                (links[currentIndex - 1] || links[links.length - 1])?.focus();
            }
        });

        document.addEventListener('keydown', event => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                input.focus();
                input.select();
                openResults();
            }
        });

        document.addEventListener('click', event => {
            if (!input.closest('.topbar-global-search')?.contains(event.target)) {
                closeGlobalSearch(input, results);
            }
        });
    }

    function renderGlobalSearch(input, results) {
        const term = input.value.trim().toLowerCase();
        const favorites = readJsonSet(FAVORITES_KEY);
        const items = getNavigationItems()
            .filter(item => !item.hidden)
            .filter(item => {
                if (!term) return favorites.has(item.href) || item.link.classList.contains('active');
                return `${item.label} ${item.section} ${item.href}`.toLowerCase().includes(term);
            })
            .slice(0, 8);

        if (!items.length) {
            results.innerHTML = `
                <div class="global-search-empty">
                    <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                    <span>No matching modules</span>
                </div>
            `;
            results.hidden = false;
            return;
        }

        results.innerHTML = items.map(item => `
            <a href="${escapeHtml(item.href)}" role="option">
                <span class="global-search-icon"><i class="${escapeHtml(item.icon)}"></i></span>
                <span class="global-search-copy">
                    <strong>${escapeHtml(item.label)}</strong>
                    <small>${escapeHtml(item.section || 'Navigation')}</small>
                </span>
                ${favorites.has(item.href) ? '<i class="fa-solid fa-star global-search-favorite" aria-hidden="true"></i>' : ''}
            </a>
        `).join('');

        results.hidden = false;
    }

    function closeGlobalSearch(input, results) {
        input.setAttribute('aria-expanded', 'false');
        results.hidden = true;
    }

    async function initOperationalBadges() {
        const token = localStorage.getItem('token');
        if (!token || !window.API_URL) return;

        const canViewSystemErrors = window.AppPermissions
            ? window.AppPermissions.can('systemErrors', 'ver')
            : false;

        if (!canViewSystemErrors) {
            setSidebarBadge('/views/system-errors', 0, 'Open system errors');
            return;
        }

        try {
            const response = await fetch(`${window.API_URL}/notificaciones/system-errors?status=open&limit=1`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok && data.success) {
                setSidebarBadge(
                    '/views/system-errors',
                    Number(data.summary?.abiertos || 0),
                    'Open system errors'
                );
            }
        } catch {
            // Non-admin users may not have access.
        }
    }

    function setSidebarBadge(href, count, label) {
        document.querySelectorAll(`.sidebar-menu-link[href="${href}"]`).forEach(link => {
            let badge = link.querySelector('.sidebar-attention-badge');

            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'sidebar-attention-badge';
                link.appendChild(badge);
            }

            badge.hidden = count <= 0;
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.title = count > 0 ? `${count} ${label}` : label;
        });
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
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
