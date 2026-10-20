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

            const checklist = [
                { label: 'Crear al menos un programa académico', done: summary.programsCount > 0, view: 'programas' },
                { label: 'Asignar un director a cada programa', done: summary.programsCount > 0 && summary.programsWithDirector >= summary.programsCount, view: 'programas' },
                { label: 'Registrar asignaturas activas', done: summary.activeSubjects > 0, view: 'asignaturas' },
                { label: 'Registrar instituciones activas', done: summary.activeInstitutions > 0, view: 'instituciones' },
                { label: 'Crear usuarios académicos', done: summary.academicUsersCount > 0, view: 'usuarios' },
                { label: 'Configurar tipos de práctica', done: summary.typesCount > 0, view: 'practicas' }
            ];
            const checklistContainer = document.getElementById('lista-configuracion-admin');
            const completed = checklist.filter(item => item.done).length;
            number('progreso-configuracion', `${completed} de ${checklist.length} completados`);
            if (checklistContainer) {
                checklistContainer.replaceChildren(...checklist.map(item => {
                    const row = document.createElement('div');
                    row.className = `elemento-configuracion${item.done ? ' completado' : ''}`;
                    const status = document.createElement('i');
                    status.className = `fa-solid ${item.done ? 'fa-circle-check' : 'fa-circle-exclamation'}`;
                    status.setAttribute('aria-hidden', 'true');
                    const label = document.createElement('span');
                    label.textContent = item.label;
                    const link = document.createElement('button');
                    link.type = 'button';
                    link.dataset.vista = item.view;
                    link.className = 'enlace-accion';
                    link.textContent = item.done ? 'Revisar' : 'Configurar';
                    link.addEventListener('click', () => {
                        const option = [...document.querySelectorAll('.opcion-menu[data-vista]')]
                            .find(element => element.dataset.vista === item.view);
                        option?.click();
                    });
                    row.append(status, label, link);
                    return row;
                }));
            }

            const activityList = document.getElementById('lista-actividad-admin');
            if (!activityList) return;
            if (!summary.recentActivity.length) {
                activityList.innerHTML = '<div><span class="icono-lista"><i class="fa-solid fa-info-circle"></i></span><p><strong>Aún no hay movimientos administrativos</strong><small>Los cambios quedarán registrados aquí.</small></p><time>—</time></div>';
                return;
            }
            activityList.replaceChildren(...summary.recentActivity.map(item => {
                const row = document.createElement('div');
                const icon = document.createElement('span');
                icon.className = 'icono-lista';
                icon.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i>';
                const detail = document.createElement('p');
                const title = document.createElement('strong');
                title.textContent = item.summary;
                const date = document.createElement('small');
                date.textContent = `${item.actorName} · ${new Date(item.createdAt).toLocaleString('es-CO')}`;
                detail.append(title, date);
                row.append(icon, detail);
                const time = document.createElement('time');
                time.dateTime = item.createdAt;
                time.textContent = new Date(item.createdAt).toLocaleDateString('es-CO');
                row.append(time);
                return row;
            }));
        })
        .catch(error => {
            console.error('No fue posible cargar el resumen del administrador:', error);
            const activityList = document.getElementById('lista-actividad-admin');
            if (activityList) activityList.textContent = `No se pudieron cargar los indicadores: ${error.message}`;
            const checklist = document.getElementById('lista-configuracion-admin');
            if (checklist) checklist.textContent = `No se pudo cargar la configuración: ${error.message}`;
            number('progreso-configuracion', 'No disponible');
        });
};

window.addEventListener('admin-data-change', actualizarResumenAdministradorApi);
actualizarResumenAdministradorApi();
