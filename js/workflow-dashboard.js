(() => {
    const role = location.pathname.split('/').pop().replace('.html', '');
    const supportedRoles = ['estudiante', 'docente', 'asesor', 'director'];
    if (!supportedRoles.includes(role)) return;

    const titles = {
        inicio: ['Inicio', 'Resumen de tu proceso con información guardada en MongoDB.'],
        'mi-practica': ['Mis prácticas', 'Consulta tus asignaciones y su estado de aprobación.'],
        'mis-actividades': ['Mis actividades', 'Actividades asignadas por tus docentes.'],
        evidencias: ['Evidencias y entregas', 'Entrega respuestas y consulta el estado de revisión.'],
        retroalimentaciones: ['Retroalimentaciones', 'Observaciones y comentarios de tus responsables.'],
        'informacion-proceso': ['Bitácora y horas', 'Registra las horas realizadas y consulta su validación.'],
        evaluaciones: ['Evaluaciones', 'Calificaciones y retroalimentación registradas.'],
        estudiantes: ['Estudiantes', 'Estudiantes y prácticas relacionadas con tu cuenta.'],
        actividades: ['Actividades', 'Publica instrucciones para los estudiantes asignados.'],
        entregas: ['Entregas', 'Revisa las entregas recibidas.'],
        proceso: ['Proceso de estudiantes', 'Consulta horas y seguimientos registrados.'],
        retroalimentacion: ['Retroalimentación', 'Registra observaciones visibles para el estudiante.'],
        seguimiento: ['Seguimiento', 'Revisa y valida las horas de práctica.'],
        practicas: ['Supervisar prácticas', 'Aprueba o rechaza las prácticas de tu programa.'],
        horas: ['Supervisar horas', 'Revisa las horas aprobadas y pendientes.'],
        informes: ['Informes', 'Indicadores calculados con los registros de tu programa.'],
        comparar: ['Comparar resultados', 'Resumen consolidado de prácticas y horas.']
    };
    const endpoints = {
        activity: '/api/workflow/activities',
        submission: '/api/workflow/submissions',
        log: '/api/workflow/logs',
        observation: '/api/workflow/observations',
        evaluation: '/api/workflow/evaluations'
    };
    let dashboard;

    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
    const personName = person => person && typeof person === 'object'
        ? [person.firstName, person.middleName, person.lastName, person.secondLastName].filter(Boolean).join(' ')
        : 'Sin asignar';
    const assignmentName = item => item?.practiceType?.name || 'Práctica';
    const assignmentStudent = item => personName(item?.student);
    const dateText = value => value ? new Date(value).toLocaleDateString('es-CO') : 'Sin fecha';
    const value = (label, text) => `<div class="rp-dato"><span>${escapeHtml(label)}</span><strong>${escapeHtml(text)}</strong></div>`;
    const table = (headers, rows, empty) => `<div class="rp-table-wrap"><table class="rp-table"><thead><tr>${headers.map(item => `<th>${escapeHtml(item)}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}" class="rp-empty">${escapeHtml(empty)}</td></tr>`}</tbody></table></div>`;
    const selectAssignments = (field = 'assignment', options = dashboard.assignments) => `<label>Práctica<select name="${field}" required><option value="">Selecciona una práctica</option>${options.map(item => `<option value="${item._id}">${escapeHtml(`${assignmentName(item)} · ${assignmentStudent(item)} · ${item.institution?.name || ''}`)}</option>`).join('')}</select></label>`;
    const notify = text => {
        let node = document.querySelector('.rp-notice');
        if (!node) {
            node = document.createElement('p');
            node.className = 'rp-notice';
            document.querySelector('main')?.prepend(node);
        }
        node.textContent = text;
        node.hidden = false;
        window.setTimeout(() => { node.hidden = true; }, 4500);
    };
    const api = async (url, options = {}) => {
        const response = await fetch(url, {
            credentials: 'same-origin',
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers }
        });
        const result = response.status === 204 ? null : await response.json();
        if (!response.ok) throw new Error(result?.error || 'No se pudo completar la operación.');
        return result;
    };
    const form = (kind, title, fields, button) => `<form class="rp-form" data-workflow-form="${kind}"><h3>${escapeHtml(title)}</h3>${fields}<button type="submit">${escapeHtml(button)}</button></form>`;
    const listRows = (items, fn) => items.map(fn).join('');
    const status = item => item?.approvalStatus || item?.status || 'Sin estado';
    const statusPill = text => `<span class="rp-status">${escapeHtml(text)}</span>`;

    function pageContent(id, description, content) {
        const section = document.getElementById(id);
        if (!section) return;
        section.classList.add('rp-page');
        section.replaceChildren();
        const heading = document.createElement('header');
        heading.className = 'rp-heading';
        const title = document.createElement('h2');
        title.textContent = description[0];
        const subtitle = document.createElement('p');
        subtitle.textContent = description[1];
        heading.append(title, subtitle);
        const body = document.createElement('div');
        body.className = 'rp-content';
        body.innerHTML = content;
        section.append(heading, body);
    }

    function overview() {
        const metrics = dashboard.metrics;
        const rows = listRows(dashboard.assignments, item => `<tr><td>${escapeHtml(assignmentName(item))}</td><td>${escapeHtml(assignmentStudent(item))}</td><td>${escapeHtml(item.institution?.name || '—')}</td><td>${statusPill(status(item))}</td></tr>`).slice(0, 12);
        const content = `
            <div class="rp-metrics">
                ${value(role === 'estudiante' ? 'Mis prácticas' : 'Prácticas relacionadas', metrics.assignments)}
                ${value('En curso', metrics.activeAssignments)}
                ${value(role === 'estudiante' ? 'Horas aprobadas' : 'Estudiantes', role === 'estudiante' ? metrics.approvedHours : metrics.students)}
                ${value('Horas cumplidas', `${metrics.hoursPercent}%`)}
                ${role === 'docente' ? value('Entregas por revisar', metrics.pendingSubmissions) : ''}
                ${role === 'asesor' ? value('Horas pendientes', metrics.pendingLogs) : ''}
                ${role === 'director' ? value('Aprobaciones pendientes', metrics.pendingApprovals) : ''}
            </div>
            ${table(['Práctica', 'Estudiante', 'Institución', 'Estado'], rows, 'No hay registros académicos asociados a tu cuenta.')}
        `;
        if (role === 'estudiante') {
            const wrapper = document.getElementById('inicio');
            let overviewPanel = wrapper.querySelector('.rp-student-overview');
            if (!overviewPanel) {
                overviewPanel = document.createElement('div');
                overviewPanel.className = 'rp-student-overview';
                wrapper.insertBefore(overviewPanel, wrapper.querySelector('#mi-practica'));
            }
            overviewPanel.innerHTML = content;
            return;
        }
        pageContent('inicio', titles.inicio, content);
    }

    function renderStudent(id) {
        if (id === 'mi-practica') {
            const rows = listRows(dashboard.assignments, item => `<tr><td>${escapeHtml(assignmentName(item))}</td><td>${escapeHtml(item.institution?.name || '—')}</td><td>${escapeHtml(dateText(item.startDate))} – ${escapeHtml(dateText(item.endDate))}</td><td>${statusPill(item.approvalStatus)}</td><td>${escapeHtml(item.approvalComment || '—')}</td></tr>`);
            pageContent(id, titles[id], table(['Práctica', 'Institución', 'Fechas', 'Aprobación', 'Observación'], rows, 'Aún no tienes prácticas asignadas.'));
        } else if (id === 'mis-actividades') {
            const options = dashboard.activities.map(item => `<option value="${item._id}" data-assignment="${item.assignment?._id || ''}">${escapeHtml(item.title)} · ${escapeHtml(assignmentName(dashboard.assignments.find(a => a._id === item.assignment?._id)))}</option>`).join('');
            const cards = listRows(dashboard.activities, item => `<article class="rp-card"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.instructions)}</p><small>Fecha límite: ${escapeHtml(dateText(item.dueDate))} · ${escapeHtml(item.status)}</small></article>`);
            const fields = `<label>Actividad<select name="activity" required><option value="">Selecciona una actividad</option>${options}</select></label><label>Respuesta / bitácora<textarea name="response" maxlength="10000" rows="4"></textarea></label><label>Nombre de evidencia<input name="evidenceName" maxlength="255" placeholder="Ej. Planeación de clase"></label><label>Enlace de evidencia (HTTP/HTTPS)<input name="evidenceUrl" type="url" placeholder="https://..." required></label>`;
            pageContent(id, titles[id], `${cards || '<p class="rp-empty">No tienes actividades publicadas todavía.</p>'}${form('submission', 'Enviar actividad o evidencia', fields, 'Enviar para revisión')}`);
        } else if (id === 'evidencias') {
            const rows = listRows(dashboard.submissions, item => `<tr><td>${escapeHtml(item.activity?.title)}</td><td>${escapeHtml(item.response || item.evidence?.map(file => file.name).join(', ') || '—')}</td><td>${statusPill(item.status)}</td><td>${escapeHtml(item.feedback || 'Sin retroalimentación')}</td><td>${escapeHtml(dateText(item.submittedAt))}</td></tr>`);
            pageContent(id, titles[id], table(['Actividad', 'Entrega', 'Estado', 'Comentario docente', 'Fecha'], rows, 'Todavía no has enviado entregas.'));
        } else if (id === 'retroalimentaciones') {
            const observations = listRows(dashboard.observations, item => `<article class="rp-card"><h3>${escapeHtml(item.category || 'Observación')}</h3><p>${escapeHtml(item.body)}</p><small>${escapeHtml(personName(item.author))} · ${escapeHtml(dateText(item.observedAt))}</small></article>`);
            const feedback = listRows(dashboard.submissions.filter(item => item.feedback), item => `<article class="rp-card"><h3>${escapeHtml(item.activity?.title)}</h3><p>${escapeHtml(item.feedback)}</p><small>${escapeHtml(dateText(item.submittedAt))}</small></article>`);
            pageContent(id, titles[id], `${observations}${feedback}${observations || feedback ? '' : '<p class="rp-empty">Aún no hay retroalimentaciones.</p>'}`);
        } else if (id === 'informacion-proceso') {
            const rows = listRows(dashboard.logs, item => `<tr><td>${escapeHtml(dateText(item.date))}</td><td>${escapeHtml(item.hours)}</td><td>${escapeHtml(item.activityDescription)}</td><td>${statusPill(item.status)}</td><td>${escapeHtml(item.reviewComment || '—')}</td></tr>`);
            const fields = `${selectAssignments()}<label>Fecha<input name="date" type="date" required></label><label>Horas<input name="hours" type="number" min="0.1" max="24" step="0.1" required></label><label>Actividad realizada<textarea name="activityDescription" maxlength="3000" required></textarea></label>`;
            pageContent(id, titles[id], `${form('log', 'Registrar horas de práctica', fields, 'Guardar en bitácora')}${table(['Fecha', 'Horas', 'Actividad', 'Estado', 'Revisión'], rows, 'Aún no hay horas registradas.')}`);
        } else if (id === 'evaluaciones') {
            const rows = listRows(dashboard.evaluations, item => `<tr><td>${escapeHtml(assignmentName(item.assignment))}</td><td>${escapeHtml(item.score)} / 5</td><td>${escapeHtml(item.feedback)}</td><td>${escapeHtml(personName(item.evaluator))}</td><td>${escapeHtml(dateText(item.evaluatedAt))}</td></tr>`);
            pageContent(id, titles[id], table(['Práctica', 'Nota', 'Retroalimentación', 'Evaluador', 'Fecha'], rows, 'Aún no tienes evaluaciones.'));
        }
    }

    function renderTeacher(id) {
        if (id === 'estudiantes') {
            const unique = new Map();
            dashboard.assignments.forEach(item => unique.set(item.student?._id, item.student));
            const rows = [...unique.values()].filter(Boolean).map(student => `<tr><td>${escapeHtml(personName(student))}</td><td>${escapeHtml(student.email || '—')}</td><td>${escapeHtml(student.studentCode || '—')}</td><td>${escapeHtml(student.programId?.name || 'Asignado')}</td></tr>`).join('');
            pageContent(id, titles[id], table(['Estudiante', 'Correo', 'Código', 'Programa'], rows, 'No hay estudiantes asignados a tus prácticas.'));
        } else if (id === 'actividades') {
            const fields = `${selectAssignments()}<label>Título<input name="title" maxlength="180" required></label><label>Instrucciones<textarea name="instructions" maxlength="5000" required></textarea></label><label>Fecha límite<input name="dueDate" type="date"></label><label>Enlace de apoyo<input name="resourceUrl" type="url"></label>`;
            const cards = listRows(dashboard.activities, item => `<article class="rp-card"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.instructions)}</p><small>${escapeHtml(dateText(item.dueDate))} · ${escapeHtml(item.status)}</small></article>`);
            pageContent(id, titles[id], `${form('activity', 'Publicar actividad', fields, 'Publicar actividad')}${cards || '<p class="rp-empty">Aún no hay actividades publicadas.</p>'}`);
        } else if (id === 'entregas' || id === 'evidencias') {
            const rows = listRows(dashboard.submissions, item => `<tr><td>${escapeHtml(personName(item.student))}</td><td>${escapeHtml(item.activity?.title || 'Actividad')}</td><td>${escapeHtml(item.response || item.evidence?.map(file => file.name).join(', ') || '—')}</td><td>${statusPill(item.status)}</td><td><form class="rp-review" data-submission="${item._id}"><select name="status"><option value="aprobada">Aprobar</option><option value="requiere_cambios">Solicitar cambios</option></select><input name="feedback" maxlength="5000" placeholder="Retroalimentación" required><button>Guardar revisión</button></form></td></tr>`);
            pageContent(id, titles[id], table(['Estudiante', 'Actividad', 'Entrega', 'Estado', 'Revisión'], rows, 'Aún no hay entregas recibidas.'));
        } else if (id === 'evaluaciones') {
            const students = dashboard.assignments.filter(item => item.student);
            const studentOptions = students.map(item => `<option value="${item.student._id}" data-assignment="${item._id}">${escapeHtml(personName(item.student))} · ${escapeHtml(assignmentName(item))}</option>`).join('');
            const fields = `${selectAssignments()}<label>Estudiante<select name="student" required><option value="">Selecciona un estudiante</option>${studentOptions}</select></label><label>Calificación<input name="score" type="number" min="0" max="5" step="0.1" required></label><label>Retroalimentación<textarea name="feedback" maxlength="5000" required></textarea></label>`;
            const rows = listRows(dashboard.evaluations, item => `<tr><td>${escapeHtml(personName(item.student))}</td><td>${escapeHtml(item.score)} / 5</td><td>${escapeHtml(item.feedback)}</td><td>${escapeHtml(dateText(item.evaluatedAt))}</td></tr>`);
            pageContent(id, titles[id], `${form('evaluation', 'Registrar evaluación', fields, 'Publicar evaluación')}${table(['Estudiante', 'Nota', 'Retroalimentación', 'Fecha'], rows, 'Aún no hay evaluaciones registradas.')}`);
        }
    }

    function renderAdvisor(id) {
        if (id === 'estudiantes' || id === 'proceso') {
            const rows = listRows(dashboard.assignments, item => {
                const hours = dashboard.logs.filter(log => log.assignment?._id === item._id && log.status === 'aprobada').reduce((sum, log) => sum + log.hours, 0);
                return `<tr><td>${escapeHtml(assignmentStudent(item))}</td><td>${escapeHtml(item.institution?.name || '—')}</td><td>${escapeHtml(assignmentName(item))}</td><td>${escapeHtml(hours)}</td><td>${statusPill(item.approvalStatus)}</td></tr>`;
            });
            pageContent(id, titles[id], table(['Estudiante', 'Institución', 'Práctica', 'Horas aprobadas', 'Aprobación'], rows, 'No hay estudiantes asignados a tu cuenta.'));
        } else if (id === 'evidencias') {
            const rows = listRows(dashboard.submissions, item => `<tr><td>${escapeHtml(personName(item.student))}</td><td>${escapeHtml(item.activity?.title || 'Actividad')}</td><td>${escapeHtml(item.evidence?.map(file => file.name).join(', ') || item.response || '—')}</td><td>${statusPill(item.status)}</td></tr>`);
            pageContent(id, titles[id], table(['Estudiante', 'Actividad', 'Evidencia / respuesta', 'Estado'], rows, 'No hay evidencias asociadas a tus prácticas.'));
        } else if (id === 'retroalimentacion') {
            const fields = `${selectAssignments()}<label>Estudiante<select name="student" required><option value="">Selecciona un estudiante</option>${[...new Map(dashboard.assignments.map(item => [item.student?._id, item])).values()].filter(item => item.student).map(item => `<option value="${item.student._id}">${escapeHtml(assignmentStudent(item))}</option>`).join('')}</select></label><label>Observación / retroalimentación<textarea name="body" maxlength="5000" required></textarea></label>`;
            const cards = listRows(dashboard.observations, item => `<article class="rp-card"><h3>${escapeHtml(personName(item.student))} · ${escapeHtml(item.category)}</h3><p>${escapeHtml(item.body)}</p><small>${escapeHtml(dateText(item.observedAt))}</small></article>`);
            pageContent(id, titles[id], `${form('observation', 'Registrar seguimiento', fields, 'Guardar observación')}${cards || '<p class="rp-empty">Aún no hay observaciones.</p>'}`);
        } else if (id === 'seguimiento') {
            const rows = listRows(dashboard.logs, item => `<tr><td>${escapeHtml(personName(item.student))}</td><td>${escapeHtml(dateText(item.date))}</td><td>${escapeHtml(item.hours)}</td><td>${escapeHtml(item.activityDescription)}</td><td>${statusPill(item.status)}</td><td>${item.status === 'pendiente' ? `<form class="rp-review-log" data-log="${item._id}"><select name="status"><option value="aprobada">Validar</option><option value="rechazada">Rechazar</option></select><input name="reviewComment" maxlength="2000" placeholder="Comentario"><button>Guardar</button></form>` : escapeHtml(item.reviewComment || '—')}</td></tr>`);
            pageContent(id, titles[id], table(['Estudiante', 'Fecha', 'Horas', 'Actividad', 'Estado', 'Validación'], rows, 'No hay registros de horas pendientes.'));
        } else if (id === 'evaluaciones') {
            const rows = listRows(dashboard.evaluations, item => `<tr><td>${escapeHtml(personName(item.student))}</td><td>${escapeHtml(item.score)} / 5</td><td>${escapeHtml(item.feedback)}</td><td>${escapeHtml(dateText(item.evaluatedAt))}</td></tr>`);
            pageContent(id, titles[id], table(['Estudiante', 'Nota', 'Retroalimentación', 'Fecha'], rows, 'No hay evaluaciones asociadas.'));
        }
    }

    function renderDirector(id) {
        if (id === 'practicas') {
            const rows = listRows(dashboard.assignments, item => `<tr><td>${escapeHtml(assignmentName(item))}</td><td>${escapeHtml(item.institution?.name || '—')}</td><td>${escapeHtml(assignmentStudent(item))}</td><td>${escapeHtml(personName(item.teacher))}</td><td>${statusPill(item.approvalStatus)}</td><td>${item.approvalStatus === 'pendiente' ? `<form class="rp-approval" data-assignment="${item._id}"><input name="approvalComment" maxlength="2000" placeholder="Comentario"><button name="approvalStatus" value="aprobada">Aprobar</button><button name="approvalStatus" value="rechazada">Rechazar</button></form>` : escapeHtml(item.approvalComment || '—')}</td></tr>`);
            pageContent(id, titles[id], table(['Práctica', 'Institución', 'Estudiante', 'Docente', 'Estado', 'Decisión'], rows, 'No hay prácticas en los programas que diriges.'));
        } else if (id === 'estudiantes') {
            const rows = listRows(dashboard.assignments, item => `<tr><td>${escapeHtml(assignmentStudent(item))}</td><td>${escapeHtml(assignmentName(item))}</td><td>${escapeHtml(item.institution?.name || '—')}</td><td>${escapeHtml(personName(item.accompanimentResponsible))}</td><td>${statusPill(item.status)}</td></tr>`);
            pageContent(id, titles[id], table(['Estudiante', 'Práctica', 'Institución', 'Asesor', 'Estado'], rows, 'No hay estudiantes en práctica para tus programas.'));
        } else if (id === 'horas') {
            const rows = listRows(dashboard.logs, item => `<tr><td>${escapeHtml(personName(item.student))}</td><td>${escapeHtml(dateText(item.date))}</td><td>${escapeHtml(item.hours)}</td><td>${escapeHtml(item.activityDescription)}</td><td>${statusPill(item.status)}</td></tr>`);
            pageContent(id, titles[id], table(['Estudiante', 'Fecha', 'Horas', 'Actividad', 'Validación'], rows, 'No hay horas registradas.'));
        } else if (id === 'evaluaciones') {
            const rows = listRows(dashboard.evaluations, item => `<tr><td>${escapeHtml(personName(item.student))}</td><td>${escapeHtml(item.score)} / 5</td><td>${escapeHtml(item.feedback)}</td><td>${escapeHtml(personName(item.evaluator))}</td><td>${escapeHtml(dateText(item.evaluatedAt))}</td></tr>`);
            pageContent(id, titles[id], table(['Estudiante', 'Nota', 'Retroalimentación', 'Evaluador', 'Fecha'], rows, 'No hay evaluaciones disponibles.'));
        } else if (id === 'informes' || id === 'comparar') {
            const metrics = dashboard.metrics;
            const byPractice = new Map();
            dashboard.assignments.forEach(item => byPractice.set(assignmentName(item), (byPractice.get(assignmentName(item)) || 0) + 1));
            const rows = [...byPractice].map(([name, count]) => `<tr><td>${escapeHtml(name)}</td><td>${count}</td><td>${escapeHtml(metrics.hoursPercent)}%</td></tr>`).join('');
            pageContent(id, titles[id], `<div class="rp-metrics">${value('Prácticas', metrics.assignments)}${value('En curso', metrics.activeAssignments)}${value('Estudiantes', metrics.students)}${value('Horas aprobadas', metrics.approvedHours)}${value('Cumplimiento', `${metrics.hoursPercent}%`)}${value('Pendientes de aprobación', metrics.pendingApprovals)}${value('Promedio de evaluación', metrics.averageScore ?? 'Sin datos')}</div>${table(['Tipo de práctica', 'Asignaciones', 'Cumplimiento de horas'], rows, 'Sin registros para elaborar el informe.')}`);
        }
    }

    function render(activeView = 'inicio') {
        for (const [id, description] of Object.entries(titles)) {
            const section = document.getElementById(id);
            if (section && id !== 'perfil' && id !== 'mi-perfil') {
                if (id === 'inicio') overview();
                else if (role === 'estudiante') renderStudent(id);
                else if (role === 'docente') renderTeacher(id);
                else if (role === 'asesor') renderAdvisor(id);
                else renderDirector(id);
            }
        }
        document.getElementById(role === 'estudiante' ? 'mi-perfil' : 'perfil')?.classList.add('rp-page');
        if (role === 'estudiante') {
            document.querySelectorAll('#inicio > section[id]').forEach(section => section.classList.add('rp-page'));
        }
        navigate(activeView);
    }

    function navigate(id) {
        if (role === 'estudiante') {
            document.querySelectorAll('#inicio > section[id]').forEach(section => section.classList.toggle('activa', section.id === id));
            document.getElementById('mi-perfil')?.classList.toggle('activa', id === 'mi-perfil');
            document.getElementById('inicio')?.classList.add('activa');
            if (id === 'inicio') document.getElementById('inicio')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            else document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            document.querySelectorAll('main section[id]').forEach(section => section.classList.toggle('activa', section.id === id));
        }
        document.querySelectorAll('[data-vista]').forEach(item => item.classList.toggle('activa', item.dataset.vista === id));
        document.querySelector('.menu-lateral-asesor, .barra-lateral')?.classList.remove('abierto', 'abierta');
    }
    const currentView = () => document.querySelector('main section.rp-page.activa')?.id || 'inicio';

    document.addEventListener('click', event => {
        const button = event.target.closest('[data-vista]');
        if (button) {
            event.preventDefault();
            navigate(button.dataset.vista);
        }
        const anchor = event.target.closest('.opciones-estudiante a[href^="#"]');
        if (anchor) {
            event.preventDefault();
            navigate(anchor.getAttribute('href').slice(1));
        }
        if (event.target.closest('.menu-movil')) {
            document.querySelector('.menu-lateral-asesor, .barra-lateral')?.classList.toggle('abierto');
            document.querySelector('.barra-lateral')?.classList.toggle('abierta');
        }
    });
    document.addEventListener('change', event => {
        const assignmentSelect = event.target.closest('.rp-form[data-workflow-form="evaluation"] select[name="assignment"]');
        if (!assignmentSelect) return;
        const studentSelect = assignmentSelect.form.elements.student;
        const matchingStudent = [...studentSelect.options].find(option => option.dataset.assignment === assignmentSelect.value);
        studentSelect.value = matchingStudent?.value || '';
    });

    document.addEventListener('submit', async event => {
        const target = event.target;
        if (!(target instanceof HTMLFormElement)) return;
        if (target.matches('.rp-form')) {
            event.preventDefault();
            const fields = Object.fromEntries(new FormData(target).entries());
            try {
                const activeView = currentView();
                if (target.dataset.workflowForm === 'submission') {
                    const evidence = fields.evidenceUrl
                        ? [{ name: fields.evidenceName || 'Evidencia', url: fields.evidenceUrl }]
                        : [];
                    const submission = { activity: fields.activity, response: fields.response || '', evidence };
                    await api(endpoints.submission, { method: 'POST', body: JSON.stringify(submission) });
                    dashboard = (await api('/api/workflow/dashboard')).data;
                    render(activeView);
                    notify('La entrega se guardó correctamente en MongoDB.');
                    return;
                }
                await api(endpoints[target.dataset.workflowForm], { method: 'POST', body: JSON.stringify(fields) });
                dashboard = (await api('/api/workflow/dashboard')).data;
                render(activeView);
                notify('El registro se guardó correctamente en MongoDB.');
            } catch (error) {
                notify(error.message);
            }
        } else if (target.matches('.rp-review')) {
            event.preventDefault();
            const fields = Object.fromEntries(new FormData(target).entries());
            try {
                const activeView = currentView();
                await api(`/api/workflow/submissions/${target.dataset.submission}/review`, { method: 'PATCH', body: JSON.stringify(fields) });
                dashboard = (await api('/api/workflow/dashboard')).data;
                render(activeView);
                notify('La revisión se guardó correctamente.');
            } catch (error) { notify(error.message); }
        } else if (target.matches('.rp-review-log')) {
            event.preventDefault();
            const fields = Object.fromEntries(new FormData(target).entries());
            try {
                const activeView = currentView();
                await api(`/api/workflow/logs/${target.dataset.log}/review`, { method: 'PATCH', body: JSON.stringify(fields) });
                dashboard = (await api('/api/workflow/dashboard')).data;
                render(activeView);
                notify('La validación de horas se guardó correctamente.');
            } catch (error) { notify(error.message); }
        } else if (target.matches('.rp-approval')) {
            event.preventDefault();
            const submitter = event.submitter;
            const fields = Object.fromEntries(new FormData(target).entries());
            fields.approvalStatus = submitter?.value;
            try {
                const activeView = currentView();
                await api(`/api/workflow/assignments/${target.dataset.assignment}/approval`, { method: 'PATCH', body: JSON.stringify(fields) });
                dashboard = (await api('/api/workflow/dashboard')).data;
                render(activeView);
                notify('La decisión sobre la práctica se guardó correctamente.');
            } catch (error) { notify(error.message); }
        }
    }, true);

    api('/api/workflow/dashboard')
        .then(result => {
            dashboard = result.data;
            render();
        })
        .catch(error => notify(`No fue posible cargar los datos desde MongoDB: ${error.message}`));
})();
