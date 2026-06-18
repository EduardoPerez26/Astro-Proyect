const RESTAURANT_STATE_STORAGE_KEY = 'restaurantOperationalStates';

const DEFAULT_RESTAURANTS = [
    { id: 1, codigo: 'taco-bell', nombre: 'Taco Bell', activo: true },
    { id: 2, codigo: 'burger-king', nombre: 'Burger King', activo: true },
    { id: 3, codigo: 'popeyes', nombre: 'Popeyes', activo: true }
];

let operationalRestaurants = [];

document.addEventListener('DOMContentLoaded', () => {
    const usuario = parseJson(localStorage.getItem('usuario'), {});
    if (usuario.rol !== 'admin') {
        Swal.fire({
            icon: 'error',
            title: 'Acceso restringido',
            text: 'Solo un administrador puede habilitar o deshabilitar restaurantes.',
            confirmButtonColor: '#102A43'
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
        container.innerHTML = '<div class="operations-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Consultando restaurantes...</div>';
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
        console.error('Error al cargar restaurantes:', error);
        const storedStates = getStoredStates();
        if (storedStates.length) {
            operationalRestaurants = mergeStoredStates(DEFAULT_RESTAURANTS, storedStates);
            renderRestaurants();
            showToast('Se muestran los últimos estados guardados', 'warning');
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

    if (!operationalRestaurants.length) {
        container.innerHTML = '<div class="operations-error">No hay restaurantes configurados.</div>';
        updateSummary();
        return;
    }

    container.innerHTML = operationalRestaurants.map(restaurant => `
        <article class="restaurant-control-row" data-restaurant-id="${escapeHtml(restaurant.id)}">
            <div class="restaurant-identity">
                <span class="restaurant-mark"><i class="fa-solid ${getRestaurantIcon(restaurant.codigo)}"></i></span>
                <div>
                    <strong>${escapeHtml(restaurant.nombre)}</strong>
                    <small>${escapeHtml(restaurant.codigo || 'sin-codigo')}</small>
                </div>
            </div>
            <span class="restaurant-state-badge ${restaurant.activo ? 'is-available' : 'is-disabled'}">
                <i class="fa-solid ${restaurant.activo ? 'fa-circle-check' : 'fa-circle-pause'}"></i>
                ${restaurant.activo ? 'Disponible' : 'Deshabilitado'}
            </span>
            <p class="restaurant-state-copy">
                ${restaurant.activo
                    ? 'El equipo puede iniciar conciliaciones.'
                    : 'El botón de conciliación está bloqueado.'}
            </p>
            <button class="toggle-restaurant-state ${restaurant.activo ? 'is-disable' : 'is-enable'}" type="button">
                <i class="fa-solid ${restaurant.activo ? 'fa-ban' : 'fa-power-off'}"></i>
                ${restaurant.activo ? 'Deshabilitar' : 'Habilitar'}
            </button>
        </article>
    `).join('');

    updateSummary();
}

async function toggleRestaurant(row) {
    if (!row) return;
    const id = row.dataset.restaurantId;
    const restaurant = operationalRestaurants.find(item => String(item.id) === String(id));
    if (!restaurant) return;

    const nextActive = !restaurant.activo;
    const result = await Swal.fire({
        icon: nextActive ? 'question' : 'warning',
        title: nextActive ? 'Habilitar restaurante' : 'Deshabilitar restaurante',
        text: nextActive
            ? `Se habilitará el botón de conciliación de ${restaurant.nombre}.`
            : `Se bloqueará el botón de conciliación de ${restaurant.nombre}.`,
        showCancelButton: true,
        confirmButtonColor: nextActive ? '#18713B' : '#A83232',
        cancelButtonColor: '#718096',
        confirmButtonText: nextActive ? 'Sí, habilitar' : 'Sí, deshabilitar',
        cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;

    const button = row.querySelector('.toggle-restaurant-state');
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Guardando';
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
                throw new Error(error.mensaje || error.message || 'No se pudo actualizar el restaurante');
            }
        }

        restaurant.activo = nextActive;
        restaurant.estado = nextActive ? 'disponible' : 'deshabilitado';
        saveLocalStates();
        renderRestaurants();
        showToast(nextActive ? 'Restaurante habilitado' : 'Restaurante deshabilitado', 'success');
    } catch (error) {
        console.error('Error al actualizar restaurante:', error);
        Swal.fire({
            icon: 'error',
            title: 'No se pudo guardar',
            text: error.message,
            confirmButtonColor: '#102A43'
        });
        if (button) {
            button.disabled = false;
            button.innerHTML = `<i class="fa-solid ${restaurant.activo ? 'fa-ban' : 'fa-power-off'}"></i>${restaurant.activo ? 'Deshabilitar' : 'Habilitar'}`;
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
