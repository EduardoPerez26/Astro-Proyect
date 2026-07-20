(() => {
    const LOCAL_API_URL = 'http://localhost:3001/api';
    const PRODUCTION_API_URL = 'https://astro-proyect-production.up.railway.app/api';
    const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

    window.API_URL = localHosts.has(window.location.hostname)
        ? LOCAL_API_URL
        : PRODUCTION_API_URL;
})();