(function () {
    'use strict';

    var ALERT_CLASS_KEYS = [
        'container',
        'popup',
        'title',
        'htmlContainer',
        'actions',
        'confirmButton',
        'denyButton',
        'cancelButton',
        'closeButton',
        'icon',
        'input',
        'validationMessage',
        'loader',
        'timerProgressBar'
    ];

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

        var title = String(options.title || options.titleText || '').toLowerCase();
        var didOpenSource = typeof options.didOpen === 'function'
            ? String(options.didOpen)
            : '';

        return (
            didOpenSource.indexOf('showLoading') !== -1 ||
            title.indexOf('procesando') !== -1 ||
            title.indexOf('guardando') !== -1 ||
            title.indexOf('cargando') !== -1 ||
            title.indexOf('abriendo') !== -1 ||
            title.indexOf('generando') !== -1 ||
            title.indexOf('validando') !== -1 ||
            title.indexOf('loading') !== -1 ||
            title.indexOf('saving') !== -1 ||
            title.indexOf('processing') !== -1 ||
            title.indexOf('generating') !== -1 ||
            title.indexOf('validating') !== -1
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

    function classTokens(value) {
        if (!value) return [];
        if (Array.isArray(value)) {
            return value.reduce(function (tokens, item) {
                return tokens.concat(classTokens(item));
            }, []);
        }
        return String(value).split(/\s+/).filter(Boolean);
    }

    function mergeClassNames() {
        var values = Array.prototype.slice.call(arguments);
        var seen = Object.create(null);
        var merged = [];

        values.forEach(function (value) {
            classTokens(value).forEach(function (token) {
                if (seen[token]) return;
                seen[token] = true;
                merged.push(token);
            });
        });

        return merged.join(' ');
    }

    function normalizeCustomClass(customClass) {
        if (!customClass) return {};
        if (typeof customClass === 'string') return { popup: customClass };

        var normalized = {};
        ALERT_CLASS_KEYS.forEach(function (key) {
            if (customClass[key]) normalized[key] = customClass[key];
        });

        Object.keys(customClass).forEach(function (key) {
            if (!hasOwnOption(normalized, key)) normalized[key] = customClass[key];
        });

        return normalized;
    }

    function addCustomClass(customClass, key, value) {
        customClass[key] = mergeClassNames(customClass[key], value);
    }

    function popupClassText(options) {
        var customClass = normalizeCustomClass(options && options.customClass);
        return String(customClass.popup || '');
    }

    function hasSpecialPopupLayout(options) {
        return /(?:mfa-swal|replacement-file-dialog|tax-swal-popup|pm-reclass-popup|source-amortization-swal|source-concept-swal|new-chat-swal)/.test(
            popupClassText(options)
        );
    }

    function hasComplexContent(options) {
        if (!options || options.toast) return false;

        var html = String(options.html || '').toLowerCase();
        var structuredHtml = /<(?:table|thead|tbody|tr|td|th|form|input|select|textarea|button|section|article|img|canvas|video|iframe|fieldset|details|ul|ol)\b/.test(html);
        var applicationMarkup = /\bdata-[a-z0-9_-]+=/.test(html);

        return Boolean(
            options.input ||
            options.inputOptions ||
            options.preConfirm ||
            options.preDeny ||
            options.footer ||
            hasSpecialPopupLayout(options) ||
            structuredHtml ||
            applicationMarkup
        );
    }

    function isInteractiveDialog(options) {
        if (!options || options.toast) return false;

        return Boolean(
            hasComplexContent(options) ||
            options.showCancelButton ||
            options.showDenyButton
        );
    }

    function getAlertVariant(options) {
        var icon = String(options.icon || '').toLowerCase();
        if (icon === 'success') return 'success';
        if (icon === 'error') return 'error';
        if (icon === 'warning') return 'warning';
        if (icon === 'question') return 'question';
        if (icon === 'info') return 'info';
        return 'neutral';
    }


    function renderStableAlertIcon(options) {
        if (!window.Swal || !options || options.iconHtml) return;

        var popup = typeof window.Swal.getPopup === 'function'
            ? window.Swal.getPopup()
            : null;

        if (!popup || popup.classList.contains('xbfs-alert-preserve-layout')) return;

        var icon = popup.querySelector('.swal2-icon.xbfs-swal-icon');
        if (!icon) return;

        var variant = getAlertVariant(options);
        var glyphs = {
            success: '\u2713',
            error: '\u00d7',
            warning: '!',
            info: 'i',
            question: '?'
        };

        if (!glyphs[variant]) return;

        while (icon.firstChild) {
            icon.removeChild(icon.firstChild);
        }

        var glyph = document.createElement('span');
        glyph.className = 'xbfs-alert-glyph xbfs-alert-glyph-' + variant;
        glyph.textContent = glyphs[variant];
        glyph.setAttribute('aria-hidden', 'true');

        icon.appendChild(glyph);
        icon.classList.add('xbfs-icon-rendered');
    }

    function isDangerousDialog(options) {
        if (!options || options.toast) return false;

        var text = [
            options.title,
            options.titleText,
            options.text,
            options.confirmButtonText
        ].filter(Boolean).join(' ').toLowerCase();
        var color = String(options.confirmButtonColor || '').toLowerCase();
        var popupClass = popupClassText(options).toLowerCase();

        return Boolean(
            /(?:delete|remove|erase|trash|replace|disable|revoke|permanent|eliminar|borrar|quitar|reemplazar|desactivar|revocar)/.test(text) ||
            /(?:danger|destructive)/.test(popupClass) ||
            /(?:#c0|#b9|#dc|#e1|#ef|red|crimson)/.test(color)
        );
    }

    function applyMotionDefaults(options) {
        if (!options) return options;

        options.heightAuto = false;
        options.scrollbarPadding = false;

        if (options.returnFocus === undefined) {
            options.returnFocus = false;
        }

        if (options.toast) {
            options.showClass = Object.assign(
                { popup: 'xbfs-toast-enter' },
                options.showClass || {}
            );
            options.hideClass = Object.assign(
                { popup: 'xbfs-toast-exit' },
                options.hideClass || {}
            );
            return options;
        }

        options.showClass = Object.assign(
            {
                backdrop: 'swal2-backdrop-show',
                popup: 'xbfs-swal-enter',
                icon: ''
            },
            options.showClass || {}
        );

        options.hideClass = Object.assign(
            {
                backdrop: 'swal2-backdrop-hide',
                popup: 'xbfs-swal-exit',
                icon: ''
            },
            options.hideClass || {}
        );

        return options;
    }

    function applyAlertTimingDefaults(options, loading) {
        if (!options || loading) return;

        if (options.toast) {
            clampTimer(options, 3400, 5200);
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
            options.timer = icon === 'success' ? 1900 : 2400;
            options.timerProgressBar = true;
            return;
        }

        if (passiveAlert) {
            options.showConfirmButton = false;
            options.showDenyButton = false;
            options.showCancelButton = false;
            options.showCloseButton = false;
            clampTimer(options, icon === 'success' ? 1900 : 2400, 3200);
            options.timerProgressBar = options.timerProgressBar !== false;
        }
    }

    function applyGlobalDesign(options, loading) {
        var customClass = normalizeCustomClass(options.customClass);
        var variant = getAlertVariant(options);
        var complex = hasComplexContent(options);
        var confirmation = !complex && Boolean(options.showCancelButton || options.showDenyButton);
        var mode = loading
            ? 'loading'
            : complex
                ? 'complex'
                : confirmation
                    ? 'confirm'
                    : 'simple';

        addCustomClass(customClass, 'container', options.toast ? 'xbfs-toast-container' : 'xbfs-swal-container');
        addCustomClass(customClass, 'popup', options.toast ? 'xbfs-toast-popup' : 'xbfs-swal-popup');
        addCustomClass(customClass, 'popup', 'xbfs-alert-' + variant);
        addCustomClass(customClass, 'popup', 'xbfs-alert-' + mode);
        addCustomClass(customClass, 'popup', options.icon ? 'xbfs-alert-has-icon' : 'xbfs-alert-no-icon');

        if (isInteractiveDialog(options)) {
            addCustomClass(customClass, 'popup', 'xbfs-alert-interactive');
        }

        if (options.input) {
            addCustomClass(customClass, 'popup', 'xbfs-alert-form');
            addCustomClass(customClass, 'popup', 'xbfs-alert-form-' + String(options.input).toLowerCase());
        }

        if (isDangerousDialog(options)) {
            addCustomClass(customClass, 'popup', 'xbfs-alert-danger-action');
        }

        if (hasSpecialPopupLayout(options)) {
            addCustomClass(customClass, 'popup', 'xbfs-alert-preserve-layout');
        }

        addCustomClass(customClass, 'title', 'xbfs-swal-title');
        addCustomClass(customClass, 'htmlContainer', 'xbfs-swal-html');
        addCustomClass(customClass, 'actions', 'xbfs-swal-actions');
        addCustomClass(customClass, 'confirmButton', 'xbfs-swal-confirm');
        addCustomClass(customClass, 'denyButton', 'xbfs-swal-deny');
        addCustomClass(customClass, 'cancelButton', 'xbfs-swal-cancel');
        addCustomClass(customClass, 'closeButton', 'xbfs-swal-close');
        addCustomClass(customClass, 'icon', 'xbfs-swal-icon');
        addCustomClass(customClass, 'input', 'xbfs-swal-input');
        addCustomClass(customClass, 'validationMessage', 'xbfs-swal-validation');
        addCustomClass(customClass, 'loader', 'xbfs-swal-loader');
        addCustomClass(customClass, 'timerProgressBar', 'xbfs-swal-progress');

        options.customClass = customClass;

        if (!options.toast && !options.width && mode === 'simple') {
            options.width = 'min(440px, calc(100vw - 28px))';
        }

        if (!options.toast && !options.width && mode === 'confirm') {
            options.width = 'min(480px, calc(100vw - 28px))';
        }


        if (!options.toast && !options.width && options.input && !hasSpecialPopupLayout(options)) {
            options.width = 'min(520px, calc(100vw - 28px))';
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
            if (options.allowOutsideClick === undefined) {
                options.allowOutsideClick = true;
            }
        }

        var loading = isLoadingDialog(options);
        applyGlobalDesign(options, loading);
        applyMotionDefaults(options);
        applyAlertTimingDefaults(options, loading);

        var passiveAlert = !options.toast && !loading && options.showConfirmButton === false;
        var userDidOpen = options.didOpen;
        options.didOpen = function () {
            if (!loading) {
                renderStableAlertIcon(options);
            }

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

    function installHelperApi() {
        if (!window.Swal || window.XBFSAlert) return;

        window.XBFSAlert = {
            fire: function (options) {
                return window.Swal.fire(options || {});
            },
            toast: function (message, icon, options) {
                return window.Swal.fire(Object.assign({
                    toast: true,
                    icon: icon || 'info',
                    title: message,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 3400,
                    timerProgressBar: true
                }, options || {}));
            },
            success: function (title, text, options) {
                return window.Swal.fire(Object.assign({
                    icon: 'success',
                    title: title,
                    text: text
                }, options || {}));
            },
            error: function (title, text, options) {
                return window.Swal.fire(Object.assign({
                    icon: 'error',
                    title: title,
                    text: text
                }, options || {}));
            },
            warning: function (title, text, options) {
                return window.Swal.fire(Object.assign({
                    icon: 'warning',
                    title: title,
                    text: text
                }, options || {}));
            },
            info: function (title, text, options) {
                return window.Swal.fire(Object.assign({
                    icon: 'info',
                    title: title,
                    text: text
                }, options || {}));
            },
            confirm: async function (options) {
                var config = typeof options === 'string'
                    ? { title: options }
                    : Object.assign({}, options || {});

                var result = await window.Swal.fire(Object.assign({
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Continue',
                    cancelButtonText: 'Cancel',
                    reverseButtons: true,
                    focusCancel: true
                }, config));

                return Boolean(result && result.isConfirmed);
            },
            loading: function (title, text) {
                return window.Swal.fire({
                    title: title || 'Loading',
                    text: text || '',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    showConfirmButton: false,
                    didOpen: function () {
                        window.Swal.showLoading();
                    }
                });
            },
            close: function () {
                window.Swal.close();
            }
        };
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

        if (window.Swal.__xbfsGuardPatched) {
            installHelperApi();
            return;
        }

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
        installHelperApi();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installGuard);
    } else {
        window.setTimeout(installGuard, 0);
    }
})();
