(function () {
    'use strict';

    var swalAttempts = 0;
    var maxSwalAttempts = 80;

    function mergeClassValue(currentValue, requiredClass) {
        var classes = String(currentValue || '')
            .split(/\s+/)
            .filter(Boolean);

        if (!classes.includes(requiredClass)) {
            classes.push(requiredClass);
        }

        return classes.join(' ');
    }

    function configureToast(options) {
        if (!options || options.toast !== true) {
            return options;
        }

        var updated = Object.assign({}, options);
        var customClass = Object.assign(
            {},
            updated.customClass || {}
        );

        customClass.container = mergeClassValue(
            customClass.container,
            'xbfs-toast-final-container'
        );
        customClass.popup = mergeClassValue(
            customClass.popup,
            'xbfs-toast-final'
        );

        updated.customClass = customClass;
        updated.position = updated.position || 'top-end';
        updated.showConfirmButton = false;
        updated.showDenyButton = false;
        updated.showCancelButton = false;

        if (updated.showCloseButton === undefined) {
            updated.showCloseButton = true;
        }

        if (updated.timer === undefined) {
            updated.timer = 4400;
        }

        if (Number(updated.timer) < 2800) {
            updated.timer = 2800;
        }

        if (updated.timerProgressBar === undefined) {
            updated.timerProgressBar = true;
        }

        var userDidOpen = updated.didOpen;

        updated.didOpen = function (popup) {
            if (typeof userDidOpen === 'function') {
                userDidOpen.apply(this, arguments);
            }

            normalizeToastPopup(popup);

            if (
                popup
                && window.Swal
                && typeof window.Swal.stopTimer === 'function'
            ) {
                popup.addEventListener(
                    'mouseenter',
                    function () {
                        window.Swal.stopTimer();
                    }
                );

                popup.addEventListener(
                    'mouseleave',
                    function () {
                        window.Swal.resumeTimer();
                    }
                );
            }
        };

        return updated;
    }

    function patchSweetAlert() {
        if (
            !window.Swal
            || typeof window.Swal.fire !== 'function'
        ) {
            swalAttempts += 1;

            if (swalAttempts < maxSwalAttempts) {
                window.setTimeout(patchSweetAlert, 200);
            }

            return;
        }

        if (window.Swal.__xbfsUiFinalPolishV3) {
            return;
        }

        var originalFire =
            window.Swal.fire.bind(window.Swal);

        window.Swal.fire = function () {
            var args =
                Array.prototype.slice.call(arguments);

            if (
                args.length
                && args[0]
                && typeof args[0] === 'object'
                && !args[0].nodeType
            ) {
                args[0] = configureToast(args[0]);
            }

            return originalFire.apply(
                window.Swal,
                args
            );
        };

        window.Swal.__xbfsUiFinalPolishV3 = true;
    }

    function isToastPopup(popup) {
        if (!popup || !popup.classList) {
            return false;
        }

        if (
            popup.classList.contains('swal2-toast')
            || popup.classList.contains('xbfs-toast-popup')
            || popup.classList.contains('xbfs-toast-final')
        ) {
            return true;
        }

        var container = popup.closest('.swal2-container');

        return Boolean(
            container
            && (
                container.classList.contains('swal2-top-end')
                || container.classList.contains('swal2-top-right')
                || container.classList.contains('swal2-top')
                || container.classList.contains(
                    'xbfs-toast-container'
                )
            )
        );
    }

    function normalizeToastPopup(popup) {
        if (!isToastPopup(popup)) return;

        popup.classList.add('xbfs-toast-final');

        var container = popup.closest('.swal2-container');
        container?.classList.add(
            'xbfs-toast-final-container'
        );

        popup
            .querySelectorAll(
                '.swal2-actions, .swal2-footer, '
                + '.swal2-loader, .swal2-validation-message'
            )
            .forEach(function (element) {
                element.style.setProperty(
                    'display',
                    'none',
                    'important'
                );
            });

        popup.style.setProperty(
            'height',
            'auto',
            'important'
        );
        popup.style.setProperty(
            'min-height',
            '68px',
            'important'
        );
    }

    function ensureIncidentCloseButton(root) {
        var scope = root?.querySelectorAll
            ? root
            : document;

        scope
            .querySelectorAll('.system-error-detail-header')
            .forEach(function (header) {
                if (
                    header.querySelector(
                        '.system-error-detail-header-close'
                    )
                ) {
                    return;
                }

                var button =
                    document.createElement('button');

                button.type = 'button';
                button.className =
                    'system-error-detail-header-close';
                button.setAttribute(
                    'data-system-error-detail-close',
                    ''
                );
                button.setAttribute(
                    'aria-label',
                    'Close incident details'
                );
                button.innerHTML =
                    '<i class="fa-solid fa-xmark" '
                    + 'aria-hidden="true"></i>';

                header.appendChild(button);
            });
    }

    function normalizeExistingUi() {
        document
            .querySelectorAll('.swal2-popup')
            .forEach(normalizeToastPopup);

        ensureIncidentCloseButton(document);
    }

    function startObserver() {
        if (!document.body) return;

        var observer = new MutationObserver(
            function (mutations) {
                mutations.forEach(function (mutation) {
                    mutation.addedNodes.forEach(
                        function (node) {
                            if (
                                !(node instanceof Element)
                            ) {
                                return;
                            }

                            if (
                                node.matches('.swal2-popup')
                            ) {
                                normalizeToastPopup(node);
                            }

                            node
                                .querySelectorAll?.(
                                    '.swal2-popup'
                                )
                                .forEach(
                                    normalizeToastPopup
                                );

                            ensureIncidentCloseButton(node);
                        }
                    );
                });
            }
        );

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function initialize() {
        patchSweetAlert();
        normalizeExistingUi();
        startObserver();
    }

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            initialize,
            { once: true }
        );
    } else {
        initialize();
    }
})();
