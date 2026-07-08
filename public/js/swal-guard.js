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
        }, 90);
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

    function hasOwnOption(options, key) {
        return Object.prototype.hasOwnProperty.call(options, key);
    }

    function normalizeShorthandArgs(args) {
        if (!args.length || typeof args[0] !== 'string') return args;

        return [{
            title: args[0],
            text: typeof args[1] === 'string' ? args[1] : undefined,
            icon: typeof args[2] === 'string' ? args[2] : undefined
        }];
    }

    function clampTimer(options, fallback, maxTimer) {
        var currentTimer = Number(options.timer || 0);

        if (!currentTimer) {
            options.timer = fallback;
        } else if (currentTimer > maxTimer) {
            options.timer = maxTimer;
        }
    }

    function applyMotionDefaults(options) {
        if (!options) return options;

        options.heightAuto = false;
        if (options.returnFocus === undefined) {
            options.returnFocus = false;
        }

        if (options.toast) {
            options.showClass = Object.assign(
                {
                    popup: 'swal2-show'
                },
                options.showClass || {}
            );

            options.hideClass = Object.assign(
                {
                    popup: 'swal2-hide'
                },
                options.hideClass || {}
            );

            return options;
        }

        options.showClass = Object.assign(
            {
                backdrop: 'swal2-backdrop-show',
                popup: 'swal2-show',
                icon: ''
            },
            options.showClass || {}
        );

        options.hideClass = Object.assign(
            {
                backdrop: 'swal2-backdrop-hide',
                popup: 'swal2-hide',
                icon: ''
            },
            options.hideClass || {}
        );

        return options;
    }

    function isInteractiveDialog(options) {
        if (!options || options.toast) return false;

        var customClass = options.customClass || {};
        var popupClass = typeof customClass === 'string'
            ? customClass
            : String(customClass.popup || '');
        var html = String(options.html || '');

        return Boolean(
            options.input ||
            options.preConfirm ||
            options.preDeny ||
            options.showCancelButton ||
            options.showDenyButton ||
            options.footer ||
            popupClass.indexOf('mfa-swal') !== -1 ||
            popupClass.indexOf('replacement-file-dialog') !== -1 ||
            popupClass.indexOf('tb-tax-swal-popup') !== -1 ||
            popupClass.indexOf('py-tax-swal-popup') !== -1 ||
            popupClass.indexOf('bk-tax-swal-popup') !== -1 ||
            html.indexOf('<') !== -1 ||
            html.indexOf('<input') !== -1 ||
            html.indexOf('<select') !== -1 ||
            html.indexOf('<textarea') !== -1 ||
            html.indexOf('<button') !== -1 ||
            html.indexOf('data-') !== -1
        );
    }

    function applyAlertTimingDefaults(options, loading) {
        if (!options || loading) return;

        if (options.toast) {
            clampTimer(options, 3200, 3800);
            options.timerProgressBar = options.timerProgressBar !== false;
            options.showConfirmButton = false;
            return;
        }

        var icon = String(options.icon || '').toLowerCase();
        var interactive = isInteractiveDialog(options);
        var passiveAlert = options.showConfirmButton === false;
        var autoCloseSimpleAlert =
            !interactive &&
            (icon === 'success' || icon === 'info') &&
            !hasOwnOption(options, 'showConfirmButton');

        if (autoCloseSimpleAlert) {
            options.showConfirmButton = false;
            options.showDenyButton = false;
            options.showCancelButton = false;
            options.showCloseButton = false;
            options.timer = icon === 'success' ? 1700 : 2200;
            options.timerProgressBar = true;
            return;
        }

        if (passiveAlert) {
            options.showConfirmButton = false;
            options.showDenyButton = false;
            options.showCancelButton = false;
            options.showCloseButton = false;
            clampTimer(options, icon === 'success' ? 1700 : 2200, 2600);
            options.timerProgressBar = options.timerProgressBar !== false;
        }
    }

    function normalizeOptions(args) {
        args = normalizeShorthandArgs(args);

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

        applyMotionDefaults(options);

        var loading = isLoadingDialog(options);
        applyAlertTimingDefaults(options, loading);

        var passiveAlert = !options.toast && !loading && options.showConfirmButton === false;

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
