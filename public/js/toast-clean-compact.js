(function () {
    'use strict';

    var attempts = 0;
    var maximumAttempts = 80;

    function normalizeArguments(args) {
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

    function configureToast(options) {
        if (!options || options.toast !== true) {
            return options;
        }

        var updated = Object.assign({}, options);

        updated.position =
            updated.position || 'top-end';

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

        if (Number(updated.timer) > 8000) {
            updated.timer = 8000;
        }

        if (updated.timerProgressBar === undefined) {
            updated.timerProgressBar = true;
        }

        updated.showClass = Object.assign(
            {},
            updated.showClass || {},
            {
                popup: 'xbfs-toast-v10-enter'
            }
        );

        updated.hideClass = Object.assign(
            {},
            updated.hideClass || {},
            {
                popup: 'xbfs-toast-v10-exit'
            }
        );

        var userDidOpen = updated.didOpen;

        updated.didOpen = function (popup) {
            if (typeof userDidOpen === 'function') {
                userDidOpen.apply(this, arguments);
            }

            if (
                !popup
                || !window.Swal
                || typeof window.Swal.stopTimer
                    !== 'function'
            ) {
                return;
            }

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
        };

        return updated;
    }

    function install() {
        if (
            !window.Swal
            || typeof window.Swal.fire !== 'function'
        ) {
            attempts += 1;

            if (attempts < maximumAttempts) {
                window.setTimeout(install, 200);
            }

            return;
        }

        if (window.Swal.__xbfsCleanToastV10) {
            return;
        }

        var originalFire =
            window.Swal.fire.bind(window.Swal);

        window.Swal.fire = function () {
            var args = normalizeArguments(
                Array.prototype.slice.call(arguments)
            );

            if (
                args[0]
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

        window.Swal.__xbfsCleanToastV10 = true;
    }

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            install,
            { once: true }
        );
    } else {
        window.setTimeout(install, 0);
    }
})();
