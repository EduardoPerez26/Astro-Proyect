(function (){
    function currentTheme(){
        return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' :'light';
    }
    function applyTheme (theme){
        document.documentElement.setAttribute('data-theme', theme);
        try{
            localStorage.setItem('xbfsTheme', theme);
        }catch (error){

        }

        var toggle = document.getElementById('themeToggle');
        if (!toggle) return;

        var isDark = theme === 'dark';
        var icon = toggle.querySelector('i');
        toggle.setAttribute('aria-pressed', String(isDark));
        toggle.setAttribute('aria-label',isDark ? 'Switch to light mode' : 'Switch to dark mode');
        if (icon) icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }

    document.addEventListener('DOMContentLoaded', function(){
        applyTheme(currentTheme());

        var toggle = document.getElementById('themeToggle');
        if (!toggle) return;

        toggle.addEventListener('click', function(){
            applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
        });
    });
})();