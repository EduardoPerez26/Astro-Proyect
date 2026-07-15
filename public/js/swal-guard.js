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

    function hasOwn(object, key) {
        return Object.prototype.hasOwnProperty.call(object, key);
    }

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

            document
                .querySelectorAll('.swal2-container')
                .forEach(function (container) {
                    if (
                        !container.querySelector(
                            '.swal2-popup:not(.swal2-hide)'
                        )
                    ) {
                        container.remove();
                    }
                });
        }, 90);
    }

    function normalizeShorthandArgs(args) {
        if (!args.length || typeof args[0] !== 'string') {
            return args;
        }

        return [{
            title: args[0],
            text:
                typeof args[1] === 'string'
                    ? args[1]
                    : undefined,
            icon:
                typeof args[2] === 'string'
                    ? args[2]
                    : undefined
        }];
    }

    function classTokens(value) {
        if (!value) return [];

        if (Array.isArray(value)) {
            return value.reduce(function (tokens, item) {
                return tokens.concat(classTokens(item));
            }, []);
        }

        return String(value)
            .split(/\s+/)
            .filter(Boolean);
    }

    function mergeClassNames() {
        var values =
            Array.prototype.slice.call(arguments);

        var seen = Object.create(null);
        var output = [];

        values.forEach(function (value) {
            classTokens(value).forEach(function (token) {
                if (seen[token]) return;
                seen[token] = true;
                output.push(token);
            });
        });

        return output.join(' ');
    }

    function normalizeCustomClass(customClass) {
        if (!customClass) return {};

        if (typeof customClass === 'string') {
            return { popup: customClass };
        }

        var normalized = {};

        ALERT_CLASS_KEYS.forEach(function (key) {
            if (customClass[key]) {
                normalized[key] = customClass[key];
            }
        });

        Object.keys(customClass).forEach(function (key) {
            if (!hasOwn(normalized, key)) {
                normalized[key] = customClass[key];
            }
        });

        return normalized;
    }

    function addClass(customClass, key, value) {
        customClass[key] =
            mergeClassNames(customClass[key], value);
    }

    function getPopupClass(options) {
        var customClass =
            normalizeCustomClass(options.customClass);

        return String(customClass.popup || '');
    }

    function hasSpecialLayout(options) {
        return /(?:mfa-swal|replacement-file-dialog|tax-swal-popup|pm-reclass-popup|source-amortization-swal|source-concept-swal|new-chat-swal)/.test(
            getPopupClass(options)
        );
    }

    function hasComplexContent(options) {
        if (!options || options.toast) return false;

        var markup =
            String(options.html || '').toLowerCase();

        var structured =
            /<(?:table|thead|tbody|tr|td|th|form|input|select|textarea|button|section|article|img|canvas|video|iframe|fieldset|details|ul|ol)\b/.test(
                markup
            );

        var applicationMarkup =
            /\bdata-[a-z0-9_-]+=/.test(markup);

        return Boolean(
            options.input ||
            options.inputOptions ||
            options.preConfirm ||
            options.preDeny ||
            options.footer ||
            hasSpecialLayout(options) ||
            structured ||
            applicationMarkup
        );
    }

    function isLoading(options) {
        if (!options || options.toast) return false;

        var title = String(
            options.title || options.titleText || ''
        ).toLowerCase();

        var didOpenSource =
            typeof options.didOpen === 'function'
                ? String(options.didOpen)
                : '';

        return Boolean(
            didOpenSource.indexOf('showLoading') !== -1 ||
            /(?:procesando|guardando|cargando|abriendo|generando|validando|loading|saving|processing|generating|validating)/.test(
                title
            )
        );
    }

    function getVariant(options) {
        var icon =
            String(options.icon || '').toLowerCase();

        if (icon === 'success') return 'success';
        if (icon === 'error') return 'error';
        if (icon === 'warning') return 'warning';
        if (icon === 'question') return 'question';
        if (icon === 'info') return 'info';

        return 'neutral';
    }

    function isDangerous(options) {
        if (!options || options.toast) return false;

        var text = [
            options.title,
            options.titleText,
            options.text,
            options.confirmButtonText
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        var popupClass =
            getPopupClass(options).toLowerCase();

        var color =
            String(options.confirmButtonColor || '')
                .toLowerCase();

        return Boolean(
            /(?:delete|remove|erase|trash|replace|disable|revoke|permanent|eliminar|borrar|quitar|reemplazar|desactivar|revocar)/.test(
                text
            ) ||
            /(?:danger|destructive)/.test(popupClass) ||
            /(?:red|crimson|#c0|#b9|#dc|#e1|#ef)/.test(
                color
            )
        );
    }

    function applyMotion(options) {
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

            return;
        }

        options.showClass = Object.assign(
            {
                backdrop: 'swal2-backdrop-show',
                popup: 'xbfs-alert-enter',
                icon: ''
            },
            options.showClass || {}
        );

        options.hideClass = Object.assign(
            {
                backdrop: 'swal2-backdrop-hide',
                popup: 'xbfs-alert-exit',
                icon: ''
            },
            options.hideClass || {}
        );
    }

    function applyTiming(options, loading) {
        if (loading) return;

        if (options.toast) {
            if (!options.timer) options.timer = 3600;
            if (Number(options.timer) > 6000) {
                options.timer = 6000;
            }

            options.timerProgressBar =
                options.timerProgressBar !== false;

            options.showConfirmButton = false;
            return;
        }

        var icon =
            String(options.icon || '').toLowerCase();

        var interactive = Boolean(
            hasComplexContent(options) ||
            options.showCancelButton ||
            options.showDenyButton
        );

        var passive =
            options.showConfirmButton === false;

        var automatic =
            !interactive &&
            !hasOwn(options, 'showConfirmButton') &&
            (icon === 'success' || icon === 'info');

        if (automatic) {
            options.showConfirmButton = false;
            options.showCancelButton = false;
            options.showDenyButton = false;
            options.showCloseButton = false;
            options.timer =
                icon === 'success' ? 2100 : 2600;
            options.timerProgressBar = true;
            return;
        }

        if (passive) {
            options.showConfirmButton = false;
            options.showCancelButton = false;
            options.showDenyButton = false;
            options.showCloseButton = false;

            if (!options.timer) {
                options.timer =
                    icon === 'success' ? 2100 : 2600;
            }

            options.timerProgressBar =
                options.timerProgressBar !== false;
        }
    }

    function applyDesign(options, loading) {
        var customClass =
            normalizeCustomClass(options.customClass);

        var variant = getVariant(options);
        var complex = hasComplexContent(options);

        var confirmation =
            !complex &&
            Boolean(
                options.showCancelButton ||
                options.showDenyButton
            );

        var mode = loading
            ? 'loading'
            : complex
                ? 'complex'
                : confirmation
                    ? 'confirm'
                    : 'simple';

        addClass(
            customClass,
            'container',
            options.toast
                ? 'xbfs-toast-container'
                : 'xbfs-swal-container'
        );

        addClass(
            customClass,
            'popup',
            options.toast
                ? 'xbfs-toast-popup'
                : 'xbfs-swal-popup'
        );

        addClass(
            customClass,
            'popup',
            'xbfs-alert-' + variant
        );

        addClass(
            customClass,
            'popup',
            'xbfs-alert-' + mode
        );

        addClass(
            customClass,
            'popup',
            options.icon
                ? 'xbfs-alert-has-icon'
                : 'xbfs-alert-no-icon'
        );

        if (options.input) {
            addClass(
                customClass,
                'popup',
                'xbfs-alert-form'
            );

            addClass(
                customClass,
                'popup',
                'xbfs-alert-form-' +
                    String(options.input).toLowerCase()
            );
        }

        if (isDangerous(options)) {
            addClass(
                customClass,
                'popup',
                'xbfs-alert-danger-action'
            );
        }

        if (hasSpecialLayout(options)) {
            addClass(
                customClass,
                'popup',
                'xbfs-alert-preserve-layout'
            );
        }

        addClass(
            customClass,
            'title',
            'xbfs-swal-title'
        );

        addClass(
            customClass,
            'htmlContainer',
            'xbfs-swal-html'
        );

        addClass(
            customClass,
            'actions',
            'xbfs-swal-actions'
        );

        addClass(
            customClass,
            'confirmButton',
            'xbfs-swal-confirm'
        );

        addClass(
            customClass,
            'denyButton',
            'xbfs-swal-deny'
        );

        addClass(
            customClass,
            'cancelButton',
            'xbfs-swal-cancel'
        );

        addClass(
            customClass,
            'closeButton',
            'xbfs-swal-close'
        );

        addClass(
            customClass,
            'icon',
            'xbfs-swal-icon'
        );

        addClass(
            customClass,
            'input',
            'xbfs-swal-input'
        );

        addClass(
            customClass,
            'validationMessage',
            'xbfs-swal-validation'
        );

        addClass(
            customClass,
            'loader',
            'xbfs-swal-loader'
        );

        addClass(
            customClass,
            'timerProgressBar',
            'xbfs-swal-progress'
        );

        options.customClass = customClass;

        if (!options.toast && !options.width) {
            if (mode === 'simple') {
                options.width =
                    'min(470px, calc(100vw - 28px))';
            } else if (mode === 'confirm') {
                options.width =
                    'min(500px, calc(100vw - 28px))';
            } else if (
                options.input &&
                !hasSpecialLayout(options)
            ) {
                options.width =
                    'min(530px, calc(100vw - 28px))';
            }
        }
    }

    function releaseButtons() {
        if (!window.Swal) return;

        var popup =
            typeof window.Swal.getPopup === 'function'
                ? window.Swal.getPopup()
                : null;

        if (!popup || popup.classList.contains('swal2-loading')) {
            return;
        }

        [
            'getConfirmButton',
            'getDenyButton',
            'getCancelButton'
        ].forEach(function (method) {
            if (typeof window.Swal[method] !== 'function') {
                return;
            }

            var button = window.Swal[method]();

            if (!button) return;

            button.disabled = false;
            button.removeAttribute('disabled');
            button.removeAttribute('aria-disabled');
        });
    }

    function normalizeOptions(args) {
        args = normalizeShorthandArgs(args);

        if (
            !args.length ||
            typeof args[0] !== 'object' ||
            args[0] === null ||
            args[0].nodeType
        ) {
            return args;
        }

        var options = Object.assign({}, args[0]);

        if (options.toast) {
            options.backdrop = false;
            options.position =
                options.position || 'top-end';

            if (options.allowOutsideClick === undefined) {
                options.allowOutsideClick = true;
            }
        }

        var loading = isLoading(options);

        applyDesign(options, loading);
        applyMotion(options);
        applyTiming(options, loading);

        var userDidOpen = options.didOpen;

        options.didOpen = function () {
            if (typeof userDidOpen === 'function') {
                userDidOpen.apply(this, arguments);
            }

            if (!loading) {
                window.setTimeout(releaseButtons, 0);
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
                return window.Swal.fire(
                    Object.assign({
                        toast: true,
                        icon: icon || 'info',
                        title: message,
                        position: 'top-end',
                        showConfirmButton: false,
                        timer: 3600,
                        timerProgressBar: true
                    }, options || {})
                );
            },

            success: function (title, text, options) {
                return window.Swal.fire(
                    Object.assign({
                        icon: 'success',
                        title: title,
                        text: text
                    }, options || {})
                );
            },

            error: function (title, text, options) {
                return window.Swal.fire(
                    Object.assign({
                        icon: 'error',
                        title: title,
                        text: text
                    }, options || {})
                );
            },

            warning: function (title, text, options) {
                return window.Swal.fire(
                    Object.assign({
                        icon: 'warning',
                        title: title,
                        text: text
                    }, options || {})
                );
            },

            info: function (title, text, options) {
                return window.Swal.fire(
                    Object.assign({
                        icon: 'info',
                        title: title,
                        text: text
                    }, options || {})
                );
            },

            confirm: async function (options) {
                var config =
                    typeof options === 'string'
                        ? { title: options }
                        : Object.assign({}, options || {});

                var result = await window.Swal.fire(
                    Object.assign({
                        icon: 'question',
                        showCancelButton: true,
                        confirmButtonText: 'Continue',
                        cancelButtonText: 'Cancel',
                        reverseButtons: true,
                        focusCancel: true
                    }, config)
                );

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

        var originalFire =
            window.Swal.fire.bind(window.Swal);

        var originalClose =
            typeof window.Swal.close === 'function'
                ? window.Swal.close.bind(window.Swal)
                : null;

        window.Swal.fire = function guardedSweetAlert() {
            var args = normalizeOptions(
                Array.prototype.slice.call(arguments)
            );

            var promise =
                originalFire.apply(window.Swal, args);

            if (
                promise &&
                typeof promise.then === 'function'
            ) {
                return promise.then(function (result) {
                    cleanupSweetAlertState();
                    return result;
                });
            }

            return promise;
        };

        if (originalClose) {
            window.Swal.close =
                function guardedSweetAlertClose() {
                    var result =
                        originalClose.apply(
                            window.Swal,
                            arguments
                        );

                    cleanupSweetAlertState();
                    return result;
                };
        }

        window.Swal.__xbfsGuardPatched = true;
        installHelperApi();
    }

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            installGuard
        );
    } else {
        window.setTimeout(installGuard, 0);
    }
})();
