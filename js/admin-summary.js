const actualizarResumenAdministradorApi = () => {
    const number = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };

    fetch('/api/admin/summary', { credentials: 'same-origin' })
        .then(async response => {
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'No se pudieron cargar los indicadores.');
            return result.data;
        })
        .then(summary => {
            number('dato-usuarios', summary.activeUsers);
            number('texto-usuarios', `${summary.activeUsers} de ${summary.totalUsers} cuentas activas`);
            number('dato-asignaturas', summary.activeSubjects);
            number('texto-asignaturas', summary.activeSubjects ? 'Asignaturas activas' : 'Sin asignaturas activas');
            number('dato-instituciones', summary.activeInstitutions);
            number('texto-instituciones', summary.activeInstitutions ? 'Instituciones activas' : 'Sin instituciones activas');
            number('dato-practicas', summary.activeAssignments);
            number('texto-practicas', `${summary.pendingApprovals} pendientes de aprobación`);
            number('porcentaje-usuarios', summary.totalUsers
                ? `${Math.round(summary.activeUsers / summary.totalUsers * 100)}%`
                : '0%');
            number('admin-resumen-horas', `${summary.hoursPercent}%`);
            number('admin-resumen-evaluaciones', `${summary.evaluationCoverage}%`);
        })
        .catch(error => {
            console.error('No fue posible cargar el resumen del administrador:', error);
        });
};

window.addEventListener('admin-data-change', actualizarResumenAdministradorApi);
actualizarResumenAdministradorApi();
