(function () {
    'use strict';

    var STYLE_ID = 'xbfs-corporate-direct-runtime-v2';
    var CSS_URL =
        '/styles/components/corporate-direct-rework.css'
        + '?v=20260716-corporate-direct-v2';

    function removeOldRuntimeStyle() {
        document.getElementById(STYLE_ID)?.remove();
    }

    async function injectFinalCorporateStyle() {
        removeOldRuntimeStyle();

        try {
            var response = await fetch(CSS_URL, {
                cache: 'no-store'
            });

            if (!response.ok) {
                throw new Error(
                    'Corporate stylesheet request failed.'
                );
            }

            var css = await response.text();
            var style = document.createElement('style');

            style.id = STYLE_ID;
            style.setAttribute(
                'data-xbfs-corporate-runtime',
                'v2'
            );
            style.textContent = css;

            document.head.appendChild(style);
        } catch (error) {
            /*
             * The normal stylesheet link remains active even when
             * runtime injection is unavailable.
             */
            console.warn(
                'Corporate runtime style could not be injected:',
                error
            );
        }
    }

    function initialize() {
        /*
         * Run after the page and Astro styles have been mounted,
         * then repeat once to remain the final cascade layer.
         */
        window.requestAnimationFrame(function () {
            injectFinalCorporateStyle();

            window.setTimeout(
                injectFinalCorporateStyle,
                450
            );
        });
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
