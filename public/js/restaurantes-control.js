const RESTAURANT_STATE_STORAGE_KEY = 'restaurantOperationalStates';

const DEFAULT_RESTAURANTS = [
    { id: 1, codigo: 'taco-bell', nombre: 'Taco Bell', activo: true },
    { id: 2, codigo: 'burger-king', nombre: 'Burger King', activo: true },
    { id: 3, codigo: 'popeyes', nombre: 'Popeyes', activo: true }
];

let operationalRestaurants = [];

document.addEventListener('DOMContentLoaded', () => {
    const usuario = parseJson(localStorage.getItem('usuario'), {});
    if (
        !window.AppPermissions?.isAdmin(usuario) ||
        !window.AppPermissions?.can('controlRestaurants', 'ver', usuario)
    ) {
        Swal.fire({
            icon: 'error',
            title: 'Restricted access',
            text: 'Only an administrator can enable or disable restaurants.',
            confirmButtonColor: '#1F1F1F'
        }).then(() => {
            window.location.href = '/views/tiendas';
        });
        return;
    }

    document.getElementById('refreshRestaurants')?.addEventListener('click', loadRestaurants);
    document.getElementById('restaurantControlList')?.addEventListener('click', event => {
        const button = event.target.closest('.toggle-restaurant-state');
        if (button) toggleRestaurant(button.closest('[data-restaurant-id]'));
    });
    loadRestaurants();
});

function parseJson(value, fallback) {
    try {
        return JSON.parse(value) || fallback;
    } catch {
        return fallback;
    }
}

function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = String(value ?? '');
    return element.innerHTML;
}

function normalizeCode(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeRestaurant(restaurant) {
    const activo = restaurant.activo === true || restaurant.activo === 1 || restaurant.estado === 'disponible';
    return {
        ...restaurant,
        activo,
        estado: activo ? 'disponible' : 'deshabilitado'
    };
}

function mergeStoredStates(restaurants, storedStates) {
    return restaurants.map(restaurant => {
        const stored = storedStates.find(item =>
            String(item.id || item.restaurante_id) === String(restaurant.id) ||
            normalizeCode(item.codigo || item.nombre) === normalizeCode(restaurant.codigo || restaurant.nombre)
        );
        return normalizeRestaurant(stored ? { ...restaurant, ...stored, id: restaurant.id } : restaurant);
    });
}

async function loadRestaurants() {
    const container = document.getElementById('restaurantControlList');
    const refreshButton = document.getElementById('refreshRestaurants');
    if (container) {
        container.innerHTML = '<div class="operations-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Checking restaurants...</div>';
    }
    if (refreshButton) refreshButton.disabled = true;

    const token = localStorage.getItem('token');
    const offline = Boolean(localStorage.getItem('modoOffline'));

    try {
        if (!token || offline) {
            operationalRestaurants = mergeStoredStates(DEFAULT_RESTAURANTS, getStoredStates());
        } else {
            const responses = await Promise.all(DEFAULT_RESTAURANTS.map(async defaultRestaurant => {
                const response = await fetch(`${window.API_URL}/restaurantes/${defaultRestaurant.id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!response.ok) return defaultRestaurant;
                const data = await response.json();
                return data.restaurante || defaultRestaurant;
            }));
            operationalRestaurants = responses.map(normalizeRestaurant);
            saveLocalStates();
        }
        renderRestaurants();
    } catch (error) {
        console.error('Error loading restaurants:', error);
        const storedStates = getStoredStates();
        if (storedStates.length) {
            operationalRestaurants = mergeStoredStates(DEFAULT_RESTAURANTS, storedStates);
            renderRestaurants();
            showToast('Showing the latest saved statuses', 'warning');
        } else if (container) {
            container.innerHTML = `<div class="operations-error"><i class="fa-solid fa-triangle-exclamation"></i>${escapeHtml(error.message)}</div>`;
        }
    } finally {
        if (refreshButton) refreshButton.disabled = false;
    }
}

function getStoredStates() {
    return parseJson(localStorage.getItem(RESTAURANT_STATE_STORAGE_KEY), []);
}

function saveLocalStates() {
    localStorage.setItem(RESTAURANT_STATE_STORAGE_KEY, JSON.stringify(operationalRestaurants));
}

function getRestaurantIcon(code) {
    const normalized = normalizeCode(code);
    if (normalized.includes('tacobell')) return 'fa-utensils';
    if (normalized.includes('burgerking')) return 'fa-burger';
    if (normalized.includes('popeyes')) return 'fa-drumstick-bite';
    return 'fa-store';
}

function renderRestaurants() {
    const container = document.getElementById('restaurantControlList');
    if (!container) return;
    const canEdit =
        window.AppPermissions?.can('controlRestaurants', 'editar') === true;

    if (!operationalRestaurants.length) {
        container.innerHTML = '<div class="operations-error">No restaurants configured.</div>';
        updateSummary();
        return;
    }

    container.innerHTML = operationalRestaurants.map(restaurant => `
        <article class="restaurant-control-row" data-restaurant-id="${escapeHtml(restaurant.id)}">
            <div class="restaurant-identity">
                <span class="restaurant-mark"><i class="fa-solid ${getRestaurantIcon(restaurant.codigo)}"></i></span>
                <div>
                    <strong>${escapeHtml(restaurant.nombre)}</strong>
                    <small>${escapeHtml(restaurant.codigo || 'no-code')}</small>
                </div>
            </div>
            <span class="restaurant-state-badge ${restaurant.activo ? 'is-available' : 'is-disabled'}">
                <i class="fa-solid ${restaurant.activo ? 'fa-circle-check' : 'fa-circle-pause'}"></i>
                ${restaurant.activo ? 'Available' : 'Disabled'}
            </span>
            <p class="restaurant-state-copy">
                ${restaurant.activo
                    ? 'The team can start reconciliations.'
                    : 'The reconciliation button is locked.'}
            </p>
            <button class="toggle-restaurant-state ${restaurant.activo ? 'is-disable' : 'is-enable'}" type="button" ${canEdit ? '' : 'hidden'}>
                <i class="fa-solid ${restaurant.activo ? 'fa-ban' : 'fa-power-off'}"></i>
                ${restaurant.activo ? 'Disable' : 'Enable'}
            </button>
        </article>
    `).join('');

    updateSummary();
}

async function toggleRestaurant(row) {
    if (!window.AppPermissions?.can('controlRestaurants', 'editar')) return;
    if (!row) return;
    const id = row.dataset.restaurantId;
    const restaurant = operationalRestaurants.find(item => String(item.id) === String(id));
    if (!restaurant) return;

    const nextActive = !restaurant.activo;
    const result = await Swal.fire({
        icon: nextActive ? 'question' : 'warning',
        title: nextActive ? 'Enable restaurant' : 'Disable restaurant',
        text: nextActive
            ? `The reconciliation button for ${restaurant.nombre} will be enabled.`
            : `The reconciliation button for ${restaurant.nombre} will be locked.`,
        showCancelButton: true,
        confirmButtonColor: nextActive ? '#18713B' : '#A83232',
        cancelButtonColor: '#5C5C5C',
        confirmButtonText: nextActive ? 'Yes, enable' : 'Yes, disable',
        cancelButtonText: 'Cancel'
    });
    if (!result.isConfirmed) return;

    const button = row.querySelector('.toggle-restaurant-state');
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving';
    }

    try {
        const token = localStorage.getItem('token');
        const offline = Boolean(localStorage.getItem('modoOffline'));
        if (token && !offline) {
            const response = await fetch(`${window.API_URL}/restaurantes/${encodeURIComponent(id)}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    nombre: restaurant.nombre,
                    descripcion: restaurant.descripcion || null,
                    icono: restaurant.icono || null,
                    color_clase: restaurant.color_clase || null,
                    activo: nextActive
                })
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.message || error.mensaje || 'The restaurant could not be updated');
            }
        }

        restaurant.activo = nextActive;
        restaurant.estado = nextActive ? 'disponible' : 'deshabilitado';
        saveLocalStates();
        renderRestaurants();
        showToast(nextActive ? 'Restaurant enabled' : 'Restaurant disabled', 'success');
    } catch (error) {
        console.error('Error updating restaurant:', error);
        Swal.fire({
            icon: 'error',
            title: 'Could not save',
            text: error.message,
            confirmButtonColor: '#1F1F1F'
        });
        if (button) {
            button.disabled = false;
            button.innerHTML = `<i class="fa-solid ${restaurant.activo ? 'fa-ban' : 'fa-power-off'}"></i>${restaurant.activo ? 'Disable' : 'Enable'}`;
        }
    }
}

function updateSummary() {
    const total = operationalRestaurants.length;
    const available = operationalRestaurants.filter(item => item.activo).length;
    const totalElement = document.getElementById('restaurantsTotal');
    const availableElement = document.getElementById('restaurantsAvailable');
    const affectedElement = document.getElementById('restaurantsAffected');
    if (totalElement) totalElement.textContent = String(total);
    if (availableElement) availableElement.textContent = String(available);
    if (affectedElement) affectedElement.textContent = String(total - available);
}

function showToast(title, icon) {
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon,
        title,
        showConfirmButton: false,
        timer: 2200,
        timerProgressBar: true
    });
}
