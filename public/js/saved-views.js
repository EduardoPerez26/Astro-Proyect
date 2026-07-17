(function () {
    function token() {
        return localStorage.getItem('token') || '';
    }

    function collect(container) {
        const configuration = {};
        container.querySelectorAll('input[id], select[id], textarea[id]').forEach(field => {
            if (field.type === 'button' || field.type === 'submit') return;
            configuration[field.id] = field.type === 'checkbox' ? field.checked : field.value;
        });
        return configuration;
    }

    function apply(container, configuration = {}) {
        Object.entries(configuration).forEach(([id, value]) => {
            const field = container.querySelector(`#${CSS.escape(id)}`);
            if (!field) return;
            if (field.type === 'checkbox') field.checked = Boolean(value);
            else field.value = value ?? '';
            field.dispatchEvent(new Event('change', { bubbles: true }));
            field.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    async function request(moduleName, options = {}) {
        const response = await fetch(`${window.API_URL}/corporate/saved-views/${encodeURIComponent(moduleName)}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${token()}`,
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) throw new Error(data.message || 'Saved view operation failed.');
        return data;
    }

    async function initialize(container) {
        const moduleName = container.dataset.savedViewModule;
        if (!moduleName || !window.API_URL || !token()) return;

        const controls = document.createElement('div');
        controls.className = 'xb-saved-view-controls';
        controls.innerHTML = `
            <label class="xb-field"><span>Saved view</span><select data-saved-view-select><option value="">Current filters</option></select></label>
            <button type="button" class="xb-button" data-saved-view-save><i class="fa-solid fa-bookmark"></i> Save view</button>
        `;
        container.appendChild(controls);

        const select = controls.querySelector('[data-saved-view-select]');
        const save = controls.querySelector('[data-saved-view-save]');
        let views = [];

        async function load() {
            try {
                const data = await request(moduleName);
                views = Array.isArray(data.views) ? data.views : [];
                select.innerHTML = '<option value="">Current filters</option>' + views.map(view =>
                    `<option value="${Number(view.id)}">${String(view.view_name || '').replace(/</g, '&lt;')}${view.is_default ? ' · Default' : ''}</option>`
                ).join('');
                const defaultView = views.find(view => Boolean(view.is_default));
                if (defaultView && !container.dataset.defaultViewApplied) {
                    container.dataset.defaultViewApplied = 'true';
                    select.value = String(defaultView.id);
                    apply(container, defaultView.configuration || {});
                }
            } catch (error) {
                console.warn('Saved views:', error);
            }
        }

        select.addEventListener('change', () => {
            const view = views.find(item => Number(item.id) === Number(select.value));
            if (view) apply(container, view.configuration || {});
        });

        save.addEventListener('click', async () => {
            const prompt = await Swal.fire({
                title: 'Save current view',
                input: 'text',
                inputLabel: 'View name',
                inputPlaceholder: 'Example: Critical open items',
                showCancelButton: true,
                confirmButtonText: 'Save',
                confirmButtonColor: '#17191c',
                inputValidator: value => String(value || '').trim() ? undefined : 'Enter a view name.'
            });
            if (!prompt.isConfirmed) return;

            const defaultPrompt = await Swal.fire({
                title: 'Use as default?',
                text: 'The filters will load automatically when you open this page.',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Save as default',
                cancelButtonText: 'Save only',
                confirmButtonColor: '#17191c'
            });

            try {
                await request(moduleName, {
                    method: 'POST',
                    body: JSON.stringify({
                        view_name: String(prompt.value).trim(),
                        configuration: collect(container),
                        is_default: defaultPrompt.isConfirmed
                    })
                });
                await load();
                window.XBFSCorporateUX?.notify('Saved view created.', 'success');
            } catch (error) {
                Swal.fire('View not saved', error.message, 'error');
            }
        });

        await load();
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-saved-view-module]').forEach(initialize);
    });
})();
