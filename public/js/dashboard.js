// dashboard.js
window.API_URL

async function cargarDashboard() {
    const token = localStorage.getItem('token');

    try {
        // 1. KPIs
        const resArchivos = await fetch(`${window.API_URL}/archivos`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const archivosData = await resArchivos.json();
        const archivos = archivosData.archivos || [];

        const totalArchivos = archivos.length;
        const totalRestaurantes = [...new Set(archivos.map(a => a.restaurante_id))].length;
        const validacionesExitosas = archivos.filter(a => a.estado === 'validado').length;
        const tasaValidacion = totalArchivos ? Math.round((validacionesExitosas / totalArchivos) * 100) : 0;

        document.getElementById('kpiRestaurantes').textContent = totalRestaurantes;
        document.getElementById('kpiArchivos').textContent = totalArchivos;
        document.getElementById('kpiTasa').textContent = `${tasaValidacion}%`;

        // 2. Gráfico de Archivos por Mes
        const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        const archivosPorMes = Array(12).fill(0);

        archivos.forEach(a => {
            const fecha = new Date(a.fecha_subida);
            archivosPorMes[fecha.getMonth()] += 1;
        });

        const ctxArchivos = document.getElementById('inventoryChart');
        new Chart(ctxArchivos, {
            type: 'bar',
            data: {
                labels: meses,
                datasets: [{
                    label: 'Archivos',
                    data: archivosPorMes,
                    backgroundColor: '#4f46e5',
                    borderRadius: 8
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } } }
        });

        // 3. Gráfico de Restaurantes
        const restaurantesMap = {};
        archivos.forEach(a => {
            const nombre = a.restaurante_nombre || a.restaurante || 'Desconocido';
            restaurantesMap[nombre] = (restaurantesMap[nombre] || 0) + 1;
        });

        const ctxRest = document.getElementById('restaurantChart');
        new Chart(ctxRest, {
            type: 'doughnut',
            data: {
                labels: Object.keys(restaurantesMap),
                datasets: [{ data: Object.values(restaurantesMap) }]
            },
            options: { responsive: true }
        });

    } catch (err) {
        console.error('Error cargando dashboard:', err);
    }
}

// Ejecutar al cargar
document.addEventListener('DOMContentLoaded', cargarDashboard);