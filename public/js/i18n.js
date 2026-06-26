// English-only language guard.
(function () {
    'use strict';

    var STORAGE_KEY = 'appLang';
    var FORCED_LANG = 'en';
    var observer = null;

    function forceEnglish() {
        try {
            localStorage.setItem(STORAGE_KEY, FORCED_LANG);
        } catch (error) {
            // Storage can be unavailable in private contexts.
        }

        if (document.documentElement) {
            document.documentElement.lang = FORCED_LANG;
        }
    }

    function hideLanguageControls(root) {
        var scope = root && root.querySelectorAll ? root : document;
        var selectors = [
            '#languageToggle',
            '#langToggle',
            '#language-switcher',
            '.language-toggle',
            '.lang-toggle',
            '[data-language-toggle]',
            '[data-i18n-toggle]'
        ];

        selectors.forEach(function (selector) {
            scope.querySelectorAll(selector).forEach(function (element) {
                element.hidden = true;
                element.style.display = 'none';
                if ('value' in element) element.value = FORCED_LANG;
            });
        });
    }

    function init() {
        forceEnglish();
        hideLanguageControls(document);

        if (observer) observer.disconnect();
        observer = new MutationObserver(function (mutations) {
            forceEnglish();
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (node.nodeType === 1) hideLanguageControls(node);
                });
            });
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['lang']
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    window.i18n = {
        lang: FORCED_LANG,
        setLang: forceEnglish,
        translatePage: forceEnglish,
        translateText: function (text) { return text; }
    };
})();
