let dashboardPeriodo = '12m';
let dashboardCharts = {};

const DASHBOARD_STATUS = {
    validado: 'Validado',
    con_errores: 'Con errores',
    pendiente: 'Pendiente',
    procesado: 'Procesado'
};

const DASHBOARD_COLORS = {
    validado: '#15803D',
    con_errores: '#B91C1C',
    pendiente: '#B45309',
    procesado: '#2563EB'
};

const DASHBOARD_PERIOD_LABELS = {
    '30d': 'Actividad de los ultimos 30 dias',
    '12m': 'Actividad de los ultimos 12 meses',
    all: 'Actividad historica completa'
};

const DASHBOARD_RESTAURANT_ICONS = {
    'taco-bell': 'fa-bell-concierge',
    'burger-king': 'fa-burger',
    popeyes: 'fa-drumstick-bite',
    kfc: 'fa-bowl-food'
};

function dashboardEscapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
}

function dashboardFormatNumber(value) {
    return new Intl.NumberFormat('es-MX').format(Number(value || 0));
}

function dashboardFormatBytes(bytes) {
    const value = Number(bytes || 0);

    if (!value) return '0 KB';

    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(
        Math.floor(Math.log(value) / Math.log(1024)),
        units.length - 1
    );
    const result = value / Math.pow(1024, index);

    return `${result.toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function dashboardFormatDate(value) {
    if (!value) return 'Sin actividad';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return 'Fecha no disponible';

    return new Intl.DateTimeFormat('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function dashboardMonthKey(date) {
    return `${date.getFullYear()}-${String(
        date.getMonth() + 1
    ).padStart(2, '0')}`;
}

function dashboardDayKey(date) {
    return `${dashboardMonthKey(date)}-${String(
        date.getDate()
    ).padStart(2, '0')}`;
}

function dashboardFormatPeriodLabel(key, period) {
    const parts = key.split('-').map(Number);
    const date = period === '30d'
        ? new Date(parts[0], parts[1] - 1, parts[2])
        : new Date(parts[0], parts[1] - 1, 1);

    return new Intl.DateTimeFormat('es-MX', period === '30d'
        ? { day: 'numeric', month: 'short' }
        : { month: 'short', year: '2-digit' }
    ).format(date);
}

function dashboardBuildTrend(rows, period) {
    const byPeriod = new Map(
        rows.map(row => [row.periodo, row])
    );
    let keys = [];

    if (period === '30d') {
        const today = new Date();

        for (let offset = 29; offset >= 0; offset -= 1) {
            const date = new Date(today);
            date.setDate(today.getDate() - offset);
            keys.push(dashboardDayKey(date));
        }
    } else if (period === '12m') {
        const today = new Date();

        for (let offset = 11; offset >= 0; offset -= 1) {
            const date = new Date(
                today.getFullYear(),
                today.getMonth() - offset,
                1
            );
            keys.push(dashboardMonthKey(date));
        }
    } else {
        keys = rows.map(row => row.periodo);
    }

    return {
        labels: keys.map(key =>
            dashboardFormatPeriodLabel(key, period)
        ),
        total: keys.map(key => Number(byPeriod.get(key)?.total || 0)),
        validados: keys.map(key =>
            Number(byPeriod.get(key)?.validados || 0)
        ),
        errores: keys.map(key =>
            Number(byPeriod.get(key)?.con_errores || 0)
        )
    };
}

function dashboardDestroyChart(name) {
    if (dashboardCharts[name]) {
        dashboardCharts[name].destroy();
        dashboardCharts[name] = null;
    }
}

function dashboardRenderKpis(data) {
    const summary = data.resumen;
    const attention = summary.con_errores;

    document.getElementById('kpiArchivos').textContent =
        dashboardFormatNumber(summary.total_archivos);
    document.getElementById('kpiArchivosMeta').textContent =
        `${summary.restaurantes_con_actividad} de ${summary.restaurantes_activos} restaurantes con actividad`;
    document.getElementById('kpiTasa').textContent =
        `${Number(summary.tasa_validacion || 0).toFixed(1)}%`;
    document.getElementById('kpiTasaMeta').textContent =
        `${dashboardFormatNumber(summary.validados)} archivos validados`;
    document.getElementById('kpiPendientes').textContent =
        dashboardFormatNumber(summary.pendientes);
    document.getElementById('kpiIncidencias').textContent =
        dashboardFormatNumber(attention);
    document.getElementById('kpiIncidenciasMeta').textContent =
        `${dashboardFormatNumber(summary.errores_detectados)} errores en validaciones`;
    document.getElementById('restaurantCoverage').textContent =
        `${summary.restaurantes_con_actividad} de ${summary.restaurantes_activos} con archivos en el periodo`;

    const validationMeta = [];

    if (summary.total_validaciones) {
        validationMeta.push(
            `${dashboardFormatNumber(summary.total_validaciones)} validaciones ejecutadas`
        );
    }

    if (summary.tiempo_promedio_validacion !== null) {
        validationMeta.push(
            `${Number(summary.tiempo_promedio_validacion).toFixed(2)} s en promedio`
        );
    }

    document.getElementById('dashboardValidationMeta').textContent =
        validationMeta.join(' | ');
}

function dashboardRenderTrend(data) {
    const canvas = document.getElementById('inventoryChart');
    const empty = document.getElementById('trendEmpty');
    const hasData = data.tendencia.some(row => Number(row.total) > 0);

    dashboardDestroyChart('trend');
    canvas.hidden = !hasData;
    empty.hidden = hasData;

    if (!hasData) return;

    if (typeof Chart === 'undefined') {
        canvas.hidden = true;
        empty.hidden = false;
        empty.textContent = 'No se pudo cargar el grafico.';
        return;
    }

    const trend = dashboardBuildTrend(
        data.tendencia,
        data.periodo
    );
    const other = trend.total.map((total, index) =>
        Math.max(
            0,
            total - trend.validados[index] - trend.errores[index]
        )
    );

    dashboardCharts.trend = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: trend.labels,
            datasets: [
                {
                    label: 'Validados',
                    data: trend.validados,
                    backgroundColor: DASHBOARD_COLORS.validado,
                    borderRadius: 3,
                    borderSkipped: false
                },
                {
                    label: 'Con errores',
                    data: trend.errores,
                    backgroundColor: DASHBOARD_COLORS.con_errores,
                    borderRadius: 3,
                    borderSkipped: false
                },
                {
                    label: 'Otros estados',
                    data: other,
                    backgroundColor: '#CBD5E1',
                    borderRadius: 3,
                    borderSkipped: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        boxWidth: 7,
                        boxHeight: 7,
                        padding: 18,
                        color: '#475569',
                        font: { size: 11, weight: '600' }
                    }
                },
                tooltip: {
                    displayColors: true
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: {
                        color: '#64748B',
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: data.periodo === '30d' ? 10 : 12
                    }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    grid: { color: '#E2E8F0' },
                    ticks: {
                        color: '#64748B',
                        precision: 0
                    }
                }
            }
        }
    });
}

function dashboardRenderStatus(data) {
    const canvas = document.getElementById('statusChart');
    const empty = document.getElementById('statusEmpty');
    const legend = document.getElementById('statusLegend');
    const values = {
        validado: data.resumen.validados,
        con_errores: data.resumen.con_errores,
        pendiente: data.resumen.pendientes,
        procesado: data.resumen.procesados
    };
    const statuses = Object.keys(values);
    const hasData = statuses.some(status => Number(values[status]) > 0);

    dashboardDestroyChart('status');
    canvas.hidden = !hasData;
    empty.hidden = hasData;
    legend.hidden = !hasData;
    legend.innerHTML = statuses.map(status => `
        <div class="dashboard-legend-item">
            <span
                class="dashboard-legend-dot"
                style="background:${DASHBOARD_COLORS[status]}"
            ></span>
            <span>${DASHBOARD_STATUS[status]}</span>
            <strong>${dashboardFormatNumber(values[status])}</strong>
        </div>
    `).join('');

    if (!hasData) return;

    if (typeof Chart === 'undefined') {
        canvas.hidden = true;
        return;
    }

    dashboardCharts.status = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: statuses.map(status => DASHBOARD_STATUS[status]),
            datasets: [{
                data: statuses.map(status => values[status]),
                backgroundColor: statuses.map(
                    status => DASHBOARD_COLORS[status]
                ),
                borderColor: '#FFFFFF',
                borderWidth: 3,
                hoverOffset: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label(context) {
                            return ` ${context.label}: ${context.raw}`;
                        }
                    }
                }
            }
        }
    });
}

function dashboardRenderRestaurants(restaurants) {
    const container = document.getElementById('restaurantList');

    if (!restaurants.length) {
        container.innerHTML = `
            <div class="dashboard-empty">No hay restaurantes activos.</div>
        `;
        return;
    }

    container.innerHTML = restaurants.map(restaurant => {
        const total = Number(restaurant.total_archivos || 0);
        const validated = Number(restaurant.validados || 0);
        const errors = Number(restaurant.con_errores || 0);
        const rate = total
            ? Math.round((validated / total) * 100)
            : 0;
        const state = total
            ? errors
                ? `${errors} con errores`
                : `${validated}/${total} validados`
            : 'Sin actividad';
        const icon = DASHBOARD_RESTAURANT_ICONS[restaurant.codigo] ||
            'fa-store';

        return `
            <div class="dashboard-restaurant-row">
                <span class="dashboard-brand-icon">
                    <i class="fa-solid ${icon}"></i>
                </span>
                <div>
                    <div class="dashboard-restaurant-name">
                        <span>${dashboardEscapeHtml(restaurant.nombre)}</span>
                        <span>${dashboardFormatNumber(total)} archivos</span>
                    </div>
                    <div class="dashboard-progress" title="${rate}% validado">
                        <span style="width:${rate}%"></span>
                    </div>
                </div>
                <span class="dashboard-restaurant-state">
                    ${dashboardEscapeHtml(state)}
                </span>
            </div>
        `;
    }).join('');
}

function dashboardRenderActivity(activity) {
    const body = document.getElementById('recentActivityBody');

    if (!activity.length) {
        body.innerHTML = `
            <tr>
                <td colspan="4">
                    <div class="dashboard-empty">
                        No hay archivos en este periodo.
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    body.innerHTML = activity.map(file => {
        const status = Object.hasOwn(DASHBOARD_STATUS, file.estado)
            ? file.estado
            : 'pendiente';

        return `
            <tr>
                <td class="dashboard-file-cell">
                    <span class="dashboard-file-name" title="${dashboardEscapeHtml(file.nombre_original)}">
                        ${dashboardEscapeHtml(file.nombre_original)}
                    </span>
                    <span class="dashboard-file-meta">
                        ${dashboardFormatBytes(file.tamano_bytes)}
                    </span>
                </td>
                <td>${dashboardEscapeHtml(file.restaurante_nombre || 'Sin restaurante')}</td>
                <td>
                    <span class="dashboard-status ${status}">
                        ${DASHBOARD_STATUS[status]}
                    </span>
                </td>
                <td>${dashboardEscapeHtml(dashboardFormatDate(file.fecha_subida))}</td>
            </tr>
        `;
    }).join('');
}

function dashboardSetLoading(loading) {
    const button = document.getElementById('refreshDashboard');
    button.disabled = loading;
    button.classList.toggle('is-loading', loading);
    button.setAttribute('aria-busy', String(loading));
}

function dashboardShowError(message = '') {
    const alert = document.getElementById('dashboardAlert');
    alert.hidden = !message;
    alert.textContent = message;
}

async function cargarDashboard() {
    const token = localStorage.getItem('token');

    if (!token) {
        window.location.href = '/';
        return;
    }

    dashboardSetLoading(true);
    dashboardShowError();

    try {
        const response = await fetch(
            `${window.API_URL}/dashboard/resumen?periodo=${dashboardPeriodo}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('token');
            window.location.href = '/';
            return;
        }

        const data = await response.json();

        if (!response.ok || data.success === false) {
            throw new Error(
                data.message || 'No se pudo cargar el dashboard'
            );
        }

        dashboardRenderKpis(data);
        dashboardRenderTrend(data);
        dashboardRenderStatus(data);
        dashboardRenderRestaurants(data.restaurantes || []);
        dashboardRenderActivity(data.actividad_reciente || []);

        document.getElementById('dashboardUpdated').textContent =
            `Actualizado ${dashboardFormatDate(data.generado_en)}`;
    } catch (error) {
        console.error('Error cargando dashboard:', error);
        dashboardShowError(
            'No fue posible cargar los datos. Revisa la conexion con el servidor y vuelve a intentar.'
        );
    } finally {
        dashboardSetLoading(false);
    }
}

function dashboardInit() {
    document.querySelectorAll('[data-period]').forEach(button => {
        button.addEventListener('click', () => {
            const period = button.dataset.period;

            if (!period || period === dashboardPeriodo) return;

            dashboardPeriodo = period;
            document.querySelectorAll('[data-period]').forEach(item => {
                item.classList.toggle(
                    'active',
                    item.dataset.period === dashboardPeriodo
                );
            });
            document.getElementById('dashboardPeriodLabel').textContent =
                DASHBOARD_PERIOD_LABELS[dashboardPeriodo];
            cargarDashboard();
        });
    });

    document
        .getElementById('refreshDashboard')
        .addEventListener('click', cargarDashboard);

    cargarDashboard();
}

document.addEventListener('DOMContentLoaded', dashboardInit);
