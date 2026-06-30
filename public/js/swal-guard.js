(function () {
    function cleanupSweetAlertState() {
        window.setTimeout(function () {
            var activePopup = document.querySelector(
                '.swal2-container .swal2-popup:not(.swal2-hide)'
            );

            if (activePopup) return;

            document.body.classList.remove(
                'swal2-shown',
                'swal2-height-auto',
                'swal2-no-backdrop',
                'swal2-toast-shown'
            );
            document.documentElement.classList.remove(
                'swal2-shown',
                'swal2-height-auto',
                'swal2-no-backdrop',
                'swal2-toast-shown'
            );

            document.querySelectorAll('.swal2-container').forEach(function (container) {
                if (!container.querySelector('.swal2-popup:not(.swal2-hide)')) {
                    container.remove();
                }
            });
        }, 120);
    }

    function isLoadingDialog(options) {
        if (!options || options.toast) return false;
        if (typeof options.didOpen === 'function' && options.allowOutsideClick === false) return true;

        var title = String(options.title || options.titleText || '').toLowerCase();
        return (
            title.indexOf('procesando') !== -1 ||
            title.indexOf('guardando') !== -1 ||
            title.indexOf('cargando') !== -1 ||
            title.indexOf('abriendo') !== -1 ||
            title.indexOf('loading') !== -1 ||
            title.indexOf('saving') !== -1
        );
    }

    function releaseDialogButtons() {
        var popup = window.Swal && typeof window.Swal.getPopup === 'function'
            ? window.Swal.getPopup()
            : null;

        if (!popup || popup.classList.contains('swal2-loading')) return;

        ['getConfirmButton', 'getDenyButton', 'getCancelButton'].forEach(function (methodName) {
            if (typeof window.Swal[methodName] !== 'function') return;

            var button = window.Swal[methodName]();
            if (!button) return;

            button.disabled = false;
            button.removeAttribute('disabled');
            button.removeAttribute('aria-disabled');
        });
    }

    function hideActionsForPassiveAlert() {
        var popup = window.Swal && typeof window.Swal.getPopup === 'function'
            ? window.Swal.getPopup()
            : null;

        if (!popup) return;

        var actions = popup.querySelector('.swal2-actions');
        if (actions) actions.style.setProperty('display', 'none', 'important');

        ['getConfirmButton', 'getDenyButton', 'getCancelButton'].forEach(function (methodName) {
            if (typeof window.Swal[methodName] !== 'function') return;

            var button = window.Swal[methodName]();
            if (button) button.style.setProperty('display', 'none', 'important');
        });
    }

    function normalizeOptions(args) {
        if (!args.length || typeof args[0] !== 'object' || args[0] === null || args[0].nodeType) {
            return args;
        }

        var options = Object.assign({}, args[0]);

        if (options.toast) {
            options.backdrop = false;
            options.heightAuto = false;
            options.position = options.position || 'top-end';
            options.customClass = Object.assign({}, options.customClass || {}, {
                container: [
                    options.customClass && options.customClass.container,
                    'xbfs-toast-container'
                ].filter(Boolean).join(' '),
                popup: [
                    options.customClass && options.customClass.popup,
                    'xbfs-toast-popup'
                ].filter(Boolean).join(' ')
            });
            if (options.allowOutsideClick === undefined) {
                options.allowOutsideClick = true;
            }
        }

        var loading = isLoadingDialog(options);
        var passiveAlert =
            !options.toast &&
            !loading &&
            options.showConfirmButton === false;

        if (passiveAlert) {
            options.showConfirmButton = false;
            options.showDenyButton = false;
            options.showCancelButton = false;
            options.showCloseButton = false;
            options.timer = options.timer || 1800;
        }

        var userDidOpen = options.didOpen;
        options.didOpen = function () {
            if (typeof userDidOpen === 'function') {
                userDidOpen.apply(this, arguments);
            }

            if (passiveAlert) {
                window.setTimeout(hideActionsForPassiveAlert, 0);
            } else if (!loading) {
                window.setTimeout(releaseDialogButtons, 0);
            }
        };

        var userDidClose = options.didClose;
        options.didClose = function () {
            if (typeof userDidClose === 'function') {
                userDidClose.apply(this, arguments);
            }
            cleanupSweetAlertState();
        };

        var userWillClose = options.willClose;
        options.willClose = function () {
            if (typeof userWillClose === 'function') {
                userWillClose.apply(this, arguments);
            }
            cleanupSweetAlertState();
        };

        return [options].concat(args.slice(1));
    }

    var installAttempts = 0;

    function scheduleInstallRetry() {
        if (installAttempts >= 60) return;
        installAttempts += 1;
        window.setTimeout(installGuard, 250);
    }

    function installGuard() {
        if (!window.Swal) {
            scheduleInstallRetry();
            return;
        }

        if (window.Swal.__xbfsGuardPatched) return;

        var originalFire = window.Swal.fire.bind(window.Swal);
        var originalClose =
            typeof window.Swal.close === 'function'
                ? window.Swal.close.bind(window.Swal)
                : null;

        window.Swal.fire = function guardedSweetAlert() {
            var args = normalizeOptions(Array.prototype.slice.call(arguments));
            var promise = originalFire.apply(window.Swal, args);

            if (promise && typeof promise.then === 'function') {
                return promise.then(function (result) {
                    cleanupSweetAlertState();
                    return result;
                });
            }

            return promise;
        };

        if (originalClose) {
            window.Swal.close = function guardedSweetAlertClose() {
                var result = originalClose.apply(window.Swal, arguments);
                cleanupSweetAlertState();
                return result;
            };
        }

        document.addEventListener(
            'click',
            function (event) {
                var target = event.target && event.target.closest
                    ? event.target.closest('.swal2-actions button, .swal2-close')
                    : null;

                if (!target || !target.closest('.swal2-popup')) return;

                target.disabled = false;
                target.removeAttribute('disabled');
                target.removeAttribute('aria-disabled');
            },
            true
        );

        window.Swal.__xbfsGuardPatched = true;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installGuard);
    } else {
        window.setTimeout(installGuard, 0);
    }
})();
