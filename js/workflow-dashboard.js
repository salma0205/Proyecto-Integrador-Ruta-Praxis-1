(() => {
    const role = location.pathname.split('/').pop().replace('.html', '');
    const supportedRoles = ['estudiante', 'docente', 'asesor', 'director'];
    if (!supportedRoles.includes(role)) return;

    const titles = {
        inicio: ['Inicio', 'Resumen de tu proceso con información guardada en Oracle Database.'],
        'mi-practica': ['Mis prácticas', 'Consulta tus asignaciones y su estado de aprobación.'],
        'mis-actividades': ['Mis actividades', 'Actividades asignadas por tus docentes.'],
        evidencias: ['Ver evidencias', 'Envía las evidencias y horas que te solicite tu asesor.'],
        retroalimentaciones: ['Retroalimentaciones', 'Observaciones y comentarios de tus responsables.'],
        'informacion-proceso': ['Bitácora y horas', 'Registra las horas realizadas y consulta su validación.'],
        evaluaciones: ['Evaluaciones', 'Calificaciones y retroalimentación registradas.'],
        estudiantes: ['Estudiantes', 'Consulta estudiantes activos de tu programa y del mismo semestre que tienes asignado.'],
        actividades: ['Actividades', 'Publica instrucciones para los estudiantes asignados.'],
        proceso: ['Proceso de estudiantes', 'Consulta horas y seguimientos registrados.'],
        retroalimentacion: ['Retroalimentación', 'Registra observaciones visibles para el estudiante.'],
        seguimiento: ['Seguimiento', 'Revisa y valida las horas de práctica.'],
        asistencia: ['Asistencia y desempeño', 'Registra la asistencia y el desempeño del estudiante en la entidad de práctica.'],
        practicas: ['Gestionar prácticas', 'Asigna estudiantes activos de tu mismo semestre a prácticas. Las prácticas solo se asignan en los semestres 8 a 10.'],
        horas: ['Revisar horas', 'Revisa y aprueba las horas registradas por estudiantes con prácticas de tu programa.']
    };
    const endpoints = {
        assignment: '/api/workflow/assignments',
        activity: '/api/workflow/activities',
        submission: '/api/workflow/submissions',
        practiceEvidence: '/api/workflow/practice-evidences',
        log: '/api/workflow/logs',
        observation: '/api/workflow/observations',
        evaluation: '/api/workflow/evaluations',
        attendance: '/api/workflow/attendance'
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
        const headers = { ...options.headers };
        if (!(options.body instanceof FormData)) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        const response = await fetch(url, {
            credentials: 'same-origin',
            ...options,
            headers
        });
        const result = response.status === 204 ? null : await response.json();
        if (!response.ok) throw new Error(result?.error || 'No se pudo completar la operación.');
        return result;
    };
    const loadDashboard = async () => {
        dashboard = (await api('/api/workflow/dashboard')).data;
        if (role === 'director') {
            try {
                dashboard.practiceOptions = (await api('/api/workflow/practice-options')).data;
            } catch (error) {
                dashboard.practiceOptions = {
                    students: [], academicStudents: [], teachers: [], advisors: [], institutions: [], practiceTypes: []
                };
                dashboard.practiceOptionsError = error.message;
            }
        }
    };
    const form = (kind, title, fields, button, extraClass = '') => `<form class="rp-form ${extraClass}" data-workflow-form="${kind}"><h3>${escapeHtml(title)}</h3>${fields}<button type="submit">${escapeHtml(button)}</button></form>`;
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
        const directorStudents = dashboard.practiceOptions?.academicStudents || [];
        const rows = role === 'director'
            ? listRows(directorStudents, student => {
                const subjects = (student.subjects || []).map(subject => subject.name).join(', ') || 'Sin asignaturas';
                const teachers = (student.assignedTeachers || []).map(personName).join(', ') || 'Sin docente asignado';
                return `<tr><td>${escapeHtml(personName(student))}</td><td>${escapeHtml(student.semester)}</td><td>${escapeHtml(subjects)}</td><td>${escapeHtml(teachers)}</td></tr>`;
            }).slice(0, 12)
            : listRows(dashboard.assignments, item => `<tr><td>${escapeHtml(assignmentName(item))}</td><td>${escapeHtml(assignmentStudent(item))}</td><td>${escapeHtml(item.institution?.name || '—')}</td><td>${statusPill(status(item))}</td></tr>`).slice(0, 12);
        const optionsWarning = role === 'director' && dashboard.practiceOptionsError
            ? `<p class="rp-empty">No se pudieron cargar las opciones del Director: ${escapeHtml(dashboard.practiceOptionsError)} Verifica que tengas un programa activo y un semestre asignado.</p>`
            : '';
        let content = `${optionsWarning}
            <div class="rp-metrics">
                ${value(role === 'estudiante' ? 'Mis prácticas' : 'Prácticas relacionadas', metrics.assignments)}
                ${value('En curso', metrics.activeAssignments)}
                ${value(
                    role === 'estudiante' ? 'Horas aprobadas' : 'Estudiantes',
                    role === 'estudiante' ? metrics.approvedHours : role === 'director' ? directorStudents.length : metrics.students
                )}
                ${value('Horas cumplidas', `${metrics.hoursPercent}%`)}
                ${role === 'asesor' ? value('Horas pendientes', metrics.pendingLogs) : ''}
                ${role === 'director' ? value('Aprobaciones pendientes', metrics.pendingApprovals) : ''}
            </div>
            ${table(
                role === 'director' ? ['Estudiante', 'Semestre', 'Asignaturas', 'Docentes'] : ['Práctica', 'Estudiante', 'Institución', 'Estado'],
                rows,
                role === 'director'
                    ? 'No hay estudiantes activos de tu programa y semestre.'
                    : 'No hay registros académicos asociados a tu cuenta.'
            )}
        `;
        const subjectRows = listRows(dashboard.subjects || [], subject => {
            const people = role === 'docente'
                ? (subject.students || []).map(personName).join(', ') || 'Sin estudiantes asignados'
                : (subject.teachers || []).map(personName).join(', ') || 'Sin docente asignado';
            return `<tr><td>${escapeHtml(subject.name)}</td><td>${escapeHtml(subject.code || '-')}</td><td>${escapeHtml(subject.semester || '-')}</td><td>${escapeHtml(people)}</td></tr>`;
        });
        const subjectsPanel = ['docente', 'estudiante'].includes(role)
            ? `<h3 class="rp-section-title">Mis asignaturas</h3>${table(['Asignatura', 'Codigo', 'Semestre', role === 'docente' ? 'Estudiantes asignados' : 'Docente'], subjectRows, 'No tienes asignaturas asignadas.')}`
            : '';
        content += subjectsPanel;
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

    function activityResources(item) {
        const links = [];
        if (item.resourceUrl) {
            links.push(`<a href="${escapeHtml(item.resourceUrl)}" target="_blank" rel="noopener noreferrer">Abrir enlace de apoyo</a>`);
        }
        for (const resource of item.resources || []) {
            links.push(`<a href="${escapeHtml(resource.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(resource.name)}</a>`);
        }
        return links.length ? `<div class="rp-activity-resources">${links.join('')}</div>` : '';
    }

    function activityCover(item) {
        const resources = item.resources || [];
        const mimeType = resources.find(resource => resource.mimeType)?.mimeType || '';
        const kind = mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : 'document';
        const icon = kind === 'image'
            ? '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="10" width="34" height="28" rx="4" fill="currentColor"/><circle cx="18" cy="20" r="3" fill="#31566a"/><path d="m11 34 10-10 6 6 4-4 7 8" fill="none" stroke="#31566a" stroke-width="3"/></svg>'
            : kind === 'video'
                ? '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="12" width="27" height="24" rx="4" fill="currentColor"/><path d="m33 20 10-6v20l-10-6z" fill="currentColor"/></svg>'
                : '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 6h17l9 9v27H12z" fill="currentColor"/><path d="M29 6v10h9M18 25h14M18 31h14M18 37h10" fill="none" stroke="#31566a" stroke-width="2.5"/></svg>';
        const count = resources.length;
        const label = count ? `${count} ${count === 1 ? 'archivo' : 'archivos'}` : item.resourceUrl ? 'Enlace de apoyo' : 'Actividad';
        return `<div class="rp-activity-cover rp-activity-cover--${kind}"><span class="rp-activity-cover-icon">${icon}</span><small>${escapeHtml(label)}</small></div>`;
    }

    function activityStatus(submission) {
        if (!submission) return ['Pendiente', 'pending'];
        if (submission.status === 'aprobada') return ['Validada', 'approved'];
        if (submission.status === 'requiere_cambios') return ['Requiere cambios', 'changes'];
        return ['En revisi\u00f3n', 'review'];
    }

    function activityStatusPill(label, kind) {
        return `<span class="rp-activity-status rp-activity-status--${kind}">${escapeHtml(label)}</span>`;
    }

    function evidenceResources(items) {
        const links = (items || []).map(item => {
            const url = item.fileUrl || item.url;
            if (!url) return '';
            const target = item.fileUrl ? '' : ' target="_blank" rel="noopener noreferrer"';
            return `<a href="${escapeHtml(url)}"${target}>${escapeHtml(item.name || 'Evidencia')}</a>`;
        }).filter(Boolean);
        return links.length ? `<div class="rp-activity-resources">${links.join('')}</div>` : '—';
    }

    function renderStudentEvidenceTasks() {
        const cards = listRows(dashboard.evidenceTasks || [], task => {
            const submission = task.submission;
            const canSubmit = !submission || submission.status === 'requiere_cambios';
            const state = !submission ? 'Pendiente' : submission.status === 'aprobada' ? 'Aprobada' : submission.status === 'requiere_cambios' ? 'Requiere cambios' : 'En revision';
            const evidence = evidenceResources(submission?.evidence);
            const fields = `<input type="hidden" name="task" value="${escapeHtml(task._id)}"><label>Fecha de la actividad<input name="date" type="date" required></label><label>Horas realizadas<input name="hours" type="number" min="0.1" max="24" step="0.1" value="${escapeHtml(submission?.hours || '')}" required></label><label>Actividad realizada<textarea name="activityDescription" maxlength="3000" required>${escapeHtml(submission?.activityDescription || '')}</textarea></label><label>Nombre del enlace<input name="name" maxlength="255" placeholder="Ej. Informe semanal"></label><label>Enlace de Drive o sitio web<input name="url" type="url" maxlength="2048" placeholder="https://..."></label><label>Archivos de evidencia<input class="rp-resource-files" name="files" type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip"></label><small class="rp-resource-help">Puedes enviar un enlace y hasta 5 archivos, con un total de 20 MB.</small><small class="rp-selected-resources" aria-live="polite"></small>`;
            return `<article class="rp-card"><small>Solicitada por ${escapeHtml(personName(task.advisor))}  -  Fecha limite: ${escapeHtml(dateText(task.dueDate))}</small><h3>${escapeHtml(task.title)}</h3><p>${escapeHtml(task.instructions)}</p><p>${statusPill(state)}</p>${submission ? `<p><strong>Horas enviadas:</strong> ${escapeHtml(submission.hours)}  -  ${escapeHtml(dateText(submission.date))}</p><p>${escapeHtml(submission.activityDescription)}</p>${evidence}${submission.reviewComment ? `<p><strong>Comentario del asesor:</strong> ${escapeHtml(submission.reviewComment)}</p>` : ''}` : ''}${canSubmit ? form('evidenceTaskSubmission', submission ? 'Completar cambios solicitados' : 'Enviar evidencia y horas', fields, submission ? 'Enviar nuevamente' : 'Enviar al asesor') : ''}</article>`;
        });
        pageContent('evidencias', titles.evidencias, cards || '<p class="rp-empty">Tu asesor aún no te ha solicitado evidencias.</p>');
    }

    function renderStudent(id) {
        if (id === 'evidencias') {
            renderStudentEvidenceTasks();
            return;
        }
        if (id === 'mi-practica') {
            const rows = listRows(dashboard.assignments, item => `<tr><td>${escapeHtml(assignmentName(item))}</td><td>${escapeHtml(item.institution?.name || '—')}</td><td>${escapeHtml(item.requiredHours || item.practiceType?.requiredHours || 0)}</td><td>${escapeHtml(dateText(item.startDate))} – ${escapeHtml(dateText(item.endDate))}</td><td>${statusPill(item.approvalStatus)}</td><td>${escapeHtml(item.approvalComment || '—')}</td></tr>`);
            pageContent(id, titles[id], table(['Práctica', 'Institución', 'Horas requeridas', 'Fechas', 'Aprobación', 'Observación'], rows, 'Aún no tienes prácticas asignadas.'));
        } else if (id === 'mis-actividades') {
            const activities = dashboard.activities.filter(item => item.kind !== 'evaluacion');
            const cards = listRows(activities, item => {
                const submission = dashboard.submissions.find(entry => String(entry.activity?._id || entry.activity) === String(item._id));
                const [state, stateKind] = activityStatus(submission);
                const subjectName = item.subject?.name || assignmentName(dashboard.assignments.find(a => String(a._id) === String(item.assignment?._id || item.assignment)));
                const canSubmit = !submission || submission.status === 'requiere_cambios';
                const fields = `<input type="hidden" name="activity" value="${escapeHtml(item._id)}"><label>Respuesta / bit\u00e1cora<textarea name="response" maxlength="10000" rows="4">${escapeHtml(submission?.response || '')}</textarea></label><label>Archivos de la entrega<input class="rp-resource-files" name="files" type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip"></label><small class="rp-resource-help">Hasta 5 archivos y 20 MB en total.</small><small class="rp-selected-resources" aria-live="polite"></small>`;
                const feedback = submission?.feedback ? `<p class="rp-activity-feedback"><strong>Comentario del docente:</strong> ${escapeHtml(submission.feedback)}</p>` : '';
                const sentFiles = submission ? `<div class="rp-activity-submission"><strong>Tu entrega</strong><p>${escapeHtml(submission.response || 'Sin respuesta escrita.')}</p>${evidenceResources(submission.evidence)}${feedback}</div>` : '';
                const details = `<details class="rp-activity-details"><summary>Ver actividad <span aria-hidden="true">\u2192</span></summary><div class="rp-activity-detail"><p>${escapeHtml(item.instructions)}</p>${activityResources(item)}${sentFiles}${canSubmit ? form('submission', submission ? 'Completar cambios solicitados' : 'Entregar actividad', fields, submission ? 'Volver a enviar' : 'Enviar actividad') : ''}</div></details>`;
                return `<article class="rp-activity-card">${activityCover(item)}<div class="rp-activity-card-body"><div class="rp-activity-card-heading"><h3>${escapeHtml(item.title)}</h3>${activityStatusPill(state, stateKind)}</div><p class="rp-activity-card-meta">${escapeHtml(subjectName)}${item.author ? ` \u00b7 ${escapeHtml(personName(item.author))}` : ''}</p><small class="rp-activity-card-date">${item.dueDate ? `Fecha l\u00edmite: ${escapeHtml(dateText(item.dueDate))}` : 'Sin fecha l\u00edmite'}</small>${details}</div></article>`;
            });
            pageContent(id, titles[id], cards ? `<div class="rp-activity-grid">${cards}</div>` : '<p class="rp-empty">No tienes actividades asignadas.</p>');
        } else if (id === 'evidencias') {
            const approvedAssignments = dashboard.assignments.filter(item => item.approvalStatus === 'aprobada');
            const logs = listRows(dashboard.logs, item => `<tr><td>${escapeHtml(dateText(item.date))}</td><td>${escapeHtml(assignmentName(item.assignment))}</td><td>${escapeHtml(item.hours)}</td><td>${escapeHtml(item.activityDescription)}</td><td>${statusPill(item.status)}</td><td>${escapeHtml(item.reviewComment || '—')}</td></tr>`);
            const logFields = `${selectAssignments('assignment', approvedAssignments)}<label>Fecha<input name="date" type="date" required></label><label>Horas<input name="hours" type="number" min="0.1" max="24" step="0.1" required></label><label>Actividad realizada<textarea name="activityDescription" maxlength="3000" required></textarea></label>`;
            const practiceCards = listRows(approvedAssignments, assignment => {
                const programId = String(assignment.program?._id || assignment.program || '');
                const directors = dashboard.programDirectors.filter(item => String(item.programId?._id || item.programId || '') === programId).map(personName);
                const teachers = [...new Map([...(assignment.teachers || []), assignment.teacher].filter(Boolean).map(person => [String(person._id || person), person])).values()].map(personName);
                const evidence = dashboard.practiceEvidences.filter(item => String(item.assignment?._id || item.assignment) === String(assignment._id));
                const evidenceList = listRows(evidence, item => `<li>${escapeHtml(item.name)}${item.url ? ` · <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Abrir enlace</a>` : item.fileUrl ? ` · <a href="${escapeHtml(item.fileUrl)}">Descargar archivo</a>` : ''} · ${escapeHtml(dateText(item.submittedAt))}</li>`);
                const fields = `<input type="hidden" name="assignment" value="${escapeHtml(assignment._id)}"><label>Nombre del enlace<input name="name" maxlength="255" placeholder="Ej. Informe semanal"></label><label>Enlace de Drive o sitio web<input name="url" type="url" maxlength="2048" placeholder="https://..."></label><label>Archivos, im&aacute;genes o videos<input class="rp-resource-files" name="files" type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip"></label><small class="rp-resource-help">Hasta 5 archivos y 20 MB en total.</small><small class="rp-selected-resources" aria-live="polite"></small>`;
                return `<article class="rp-card"><h3>${escapeHtml(assignmentName(assignment))}</h3><div class="rp-metrics">${value('Director', directors.join(', ') || 'Sin asignar')}${value('Docente(s)', teachers.join(', ') || 'Sin asignar')}${value('Asesor', personName(assignment.accompanimentResponsible))}</div><h4>Evidencias de práctica</h4><ul>${evidenceList || '<li>Aún no has cargado evidencias directas de la práctica.</li>'}</ul>${form('practiceEvidence', 'Agregar evidencia de práctica', fields, 'Guardar evidencia')}</article>`;
            });
            const submissions = listRows(dashboard.submissions, item => `<tr><td>${escapeHtml(item.activity?.title || 'Actividad')}</td><td>${escapeHtml(item.response || '—')}${evidenceResources(item.evidence)}</td><td>${statusPill(item.status)}</td><td>${escapeHtml(item.feedback || 'Sin retroalimentación')}</td><td>${escapeHtml(dateText(item.submittedAt))}</td></tr>`);
            const evidenceContent = `${approvedAssignments.length ? practiceCards : '<p class="rp-empty">Aún no tienes prácticas aprobadas. Cuando el Director apruebe una, podrás registrar horas y cargar evidencias.</p>'}${approvedAssignments.length ? form('log', 'Registrar horas de práctica', logFields, 'Guardar horas') : ''}${table(['Fecha', 'Práctica', 'Horas', 'Actividad', 'Estado', 'Revisión'], logs, 'Aún no hay horas registradas.') }<h3 class="rp-section-title">Entregas de actividades</h3>${table(['Actividad', 'Respuesta y evidencias', 'Estado', 'Comentario docente', 'Fecha'], submissions, 'Todavía no has enviado entregas de actividades.')}`;
            pageContent(id, titles[id], evidenceContent);
        } else if (id === 'retroalimentaciones') {
            const observations = listRows(dashboard.observations, item => `<article class="rp-card"><h3>${escapeHtml(item.category || 'Observación')}</h3><p>${escapeHtml(item.body)}</p><small>${escapeHtml(personName(item.author))} · ${escapeHtml(dateText(item.observedAt))}</small></article>`);
            const feedback = listRows(dashboard.submissions.filter(item => item.feedback), item => `<article class="rp-card"><h3>${escapeHtml(item.activity?.title)}</h3><p>${escapeHtml(item.feedback)}</p><small>${escapeHtml(dateText(item.submittedAt))}</small></article>`);
            pageContent(id, titles[id], `${observations}${feedback}${observations || feedback ? '' : '<p class="rp-empty">Aún no hay retroalimentaciones.</p>'}`);
        } else if (id === 'informacion-proceso') {
            const rows = listRows(dashboard.logs, item => `<tr><td>${escapeHtml(dateText(item.date))}</td><td>${escapeHtml(item.hours)}</td><td>${escapeHtml(item.activityDescription)}</td><td>${statusPill(item.status)}</td><td>${escapeHtml(item.reviewComment || '—')}</td></tr>`);
            const fields = `${selectAssignments()}<label>Fecha<input name="date" type="date" required></label><label>Horas<input name="hours" type="number" min="0.1" max="24" step="0.1" required></label><label>Actividad realizada<textarea name="activityDescription" maxlength="3000" required></textarea></label>`;
            pageContent(id, titles[id], `${form('log', 'Registrar horas de práctica', fields, 'Guardar en bitácora')}${table(['Fecha', 'Horas', 'Actividad', 'Estado', 'Revisión'], rows, 'Aún no hay horas registradas.')}`);
        } else if (id === 'evaluaciones') {
            const tasks = dashboard.activities.filter(item => {
                if (item.kind !== 'evaluacion') return false;
                const submission = dashboard.submissions.find(entry => String(entry.activity?._id || entry.activity) === String(item._id));
                return !submission || submission.status === 'requiere_cambios';
            });
            const cards = listRows(tasks, item => {
                const submission = dashboard.submissions.find(entry => String(entry.activity?._id || entry.activity) === String(item._id));
                const canResubmit = !submission || submission.status === 'requiere_cambios';
                const fields = `<input type="hidden" name="activity" value="${escapeHtml(item._id)}"><label>Respuesta<textarea name="response" maxlength="10000" rows="4" ${canResubmit ? '' : 'disabled'}>${escapeHtml(submission?.response || '')}</textarea></label><label>Archivos de la respuesta<input class="rp-resource-files" name="files" type="file" multiple ${canResubmit ? '' : 'disabled'} accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip"></label><small class="rp-resource-help">Hasta 5 archivos y 20 MB en total.</small><small class="rp-selected-resources" aria-live="polite"></small>`;
                const state = submission ? submission.status === 'requiere_cambios' ? 'Requiere cambios' : submission.status === 'aprobada' ? 'Revisada' : 'Entregada, pendiente de revisión' : 'Pendiente';
                return `<article class="rp-card"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.instructions)}</p>${activityResources(item)}<p>${statusPill(state)} · Fecha límite: ${escapeHtml(dateText(item.dueDate))}</p>${submission?.feedback ? `<p>${escapeHtml(submission.feedback)}</p>` : ''}${evidenceResources(submission?.evidence)}${canResubmit ? form('submission', submission ? 'Volver a enviar evaluación' : 'Resolver evaluación', fields, submission ? 'Enviar nuevamente' : 'Enviar evaluación') : ''}</article>`;
            });
            const gradeRows = listRows(dashboard.evaluations, item => `<tr><td>${escapeHtml(assignmentName(item.assignment))}</td><td>${escapeHtml(item.score)} / 5</td><td>${escapeHtml(item.feedback)}</td><td>${escapeHtml(personName(item.evaluator))}</td><td>${escapeHtml(dateText(item.evaluatedAt))}</td></tr>`);
            pageContent(id, titles[id], `<h3 class="rp-section-title">Evaluaciones pendientes</h3>${cards || '<p class="rp-empty">No tienes evaluaciones pendientes.</p>'}<h3 class="rp-section-title">Calificaciones publicadas</h3>${table(['Práctica', 'Nota', 'Retroalimentación', 'Evaluador', 'Fecha'], gradeRows, 'Aún no tienes calificaciones publicadas.')}`);
        }
    }

    function renderTeacher(id) {
        if (id === 'estudiantes') {
            const rows = listRows(dashboard.assignedStudents || [], student => {
                const subjects = (student.subjects || []).map(subject =>
                    `${subject.name} · Semestre ${subject.semester || '-'}`
                ).join(', ') || 'Sin asignaturas';
                const directors = (student.assignedDirectors || []).map(personName).join(', ') || 'Sin Director asignado';
                return `<tr><td>${escapeHtml(personName(student))}</td><td>${escapeHtml(student.email || '-')}</td><td>${escapeHtml(student.studentCode || '-')}</td><td>${escapeHtml(subjects)}</td><td>${escapeHtml(student.semester || '-')}</td><td>${escapeHtml(directors)}</td></tr>`;
            });
            pageContent(id, titles[id], table(['Estudiante', 'Correo', 'Código', 'Asignaturas', 'Semestre', 'Director'], rows, 'El Administrador aún no te asignó estudiantes.'));
        } else if (id === 'actividades') {
            const subjects = dashboard.subjects || [];
            const subjectSelect = `<label>Asignatura<select name="subject" required><option value="">Selecciona una asignatura</option>${subjects.map(subject => `<option value="${subject._id}">${escapeHtml(`${subject.name} · Semestre ${subject.semester || '-'}`)}</option>`).join('')}</select></label>`;
            const fields = `${subjectSelect}<label>Tipo<select name="kind" required><option value="actividad">Actividad</option><option value="evaluacion">Evaluación pendiente para el estudiante</option></select></label><label>Título<input name="title" maxlength="180" required></label><label>Instrucciones<textarea name="instructions" maxlength="5000" required></textarea></label><label>Fecha límite<input name="dueDate" type="date"></label><label>Enlace de apoyo (Drive, YouTube o sitio web)<input name="resourceUrl" type="url" maxlength="2048" placeholder="https://..."></label><label>Archivos o videos de apoyo<input class="rp-resource-files" name="resources" type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip"></label><small class="rp-resource-help">Hasta 5 archivos y 20 MB en total. Para videos más grandes, agrega un enlace.</small><small class="rp-selected-resources" aria-live="polite"></small>`;
            const cards = listRows(dashboard.activities, item => {
                const deliveries = dashboard.submissions.filter(entry => String(entry.activity?._id || entry.activity) === String(item._id));
                const pending = deliveries.some(entry => entry.status === 'en_revision');
                const state = pending ? ['En revisi\u00f3n', 'review'] : ['Publicada', 'published'];
                const due = item.dueDate ? `Fecha l\u00edmite: ${escapeHtml(dateText(item.dueDate))}` : 'Sin fecha l\u00edmite';
                const details = `<details class="rp-activity-details"><summary>Ver actividad <span aria-hidden="true">\u2192</span></summary><div class="rp-activity-detail"><p>${escapeHtml(item.instructions)}</p>${activityResources(item)}<p class="rp-activity-submission-count">${deliveries.length} ${deliveries.length === 1 ? 'entrega recibida' : 'entregas recibidas'}</p></div></details>`;
                return `<article class="rp-activity-card">${activityCover(item)}<div class="rp-activity-card-body"><div class="rp-activity-card-heading"><h3>${escapeHtml(item.title)}</h3>${activityStatusPill(state[0], state[1])}</div><p class="rp-activity-card-meta">${escapeHtml(item.subject?.name || assignmentName(item.assignment))} \u00b7 ${item.kind === 'evaluacion' ? 'Evaluaci\u00f3n' : 'Actividad'}</p><small class="rp-activity-card-date">${due}</small>${details}</div></article>`;
            });
            const createForm = `<details class="rp-activity-create"><summary>Crear actividad o evaluaci\u00f3n <span aria-hidden="true">+</span></summary>${form('activity', 'Nueva actividad', fields, 'Publicar')}</details>`;
            pageContent(id, titles[id], `${createForm}${cards ? `<div class="rp-activity-grid">${cards}</div>` : '<p class="rp-empty">A\u00fan no hay actividades publicadas.</p>'}`);
        } else if (id === 'evidencias') {
            const rows = listRows(dashboard.submissions, item => `<tr><td>${escapeHtml(personName(item.student))}</td><td>${escapeHtml(item.activity?.title || 'Actividad')}</td><td>${escapeHtml(item.response || '—')}${evidenceResources(item.evidence)}</td><td>${statusPill(item.status)}</td><td><form class="rp-review" data-submission="${item._id}"><select name="status"><option value="aprobada">Aprobar</option><option value="requiere_cambios">Solicitar cambios</option></select><input name="feedback" maxlength="5000" placeholder="Retroalimentación" required><button>Guardar revisión</button></form></td></tr>`);
            pageContent(id, titles[id], table(['Estudiante', 'Actividad', 'Entrega', 'Estado', 'Revisión'], rows, 'Aún no hay entregas recibidas.'));
        } else if (id === 'evaluaciones') {
            const students = dashboard.assignments.filter(item => item.student);
            const studentOptions = students.map(item => `<option value="${item.student._id}" data-assignment="${item._id}">${escapeHtml(personName(item.student))} · ${escapeHtml(assignmentName(item))}</option>`).join('');
            const fields = `${selectAssignments()}<label>Estudiante<select name="student" required><option value="">Selecciona un estudiante</option>${studentOptions}</select></label><label>Calificación<input name="score" type="number" min="0" max="5" step="0.1" required></label><label>Retroalimentación<textarea name="feedback" maxlength="5000" required></textarea></label>`;
            const rows = listRows(dashboard.evaluations, item => `<tr><td>${escapeHtml(personName(item.student))}</td><td>${escapeHtml(item.score)} / 5</td><td>${escapeHtml(item.feedback)}</td><td>${escapeHtml(dateText(item.evaluatedAt))}</td></tr>`);
            pageContent(id, titles[id], `${form('evaluation', 'Registrar evaluación', fields, 'Publicar evaluación')}${table(['Estudiante', 'Nota', 'Retroalimentación', 'Fecha'], rows, 'Aún no hay evaluaciones registradas.')}`);
        }

    }

    function renderAdvisorEvidenceTasks() {
        const assignments = dashboard.assignments.filter(item => item.approvalStatus === 'aprobada');
        const fields = `${selectAssignments('assignment', assignments)}<label>Titulo de la evidencia<input name="title" maxlength="180" required></label><label>Instrucciones<textarea name="instructions" maxlength="5000" required></textarea></label><label>Fecha limite<input name="dueDate" type="date"></label>`;
        const requests = listRows(dashboard.evidenceTasks || [], task => {
            const student = task.assignment?.student;
            const submission = task.submission;
            const state = !submission ? 'Esperando entrega' : submission.status === 'aprobada' ? 'Aprobada' : submission.status === 'requiere_cambios' ? 'Cambios solicitados' : 'Pendiente de revision';
            const evidence = evidenceResources(submission?.evidence);
            const review = submission?.status === 'en_revision'
                ? `<form class="rp-evidence-review" data-evidence-submission="${escapeHtml(submission._id)}"><label>Comentario (opcional)<input name="reviewComment" maxlength="2000"></label><button type="submit" name="status" value="aprobada">Aprobar evidencia y horas</button><button type="submit" name="status" value="requiere_cambios">Solicitar cambios</button></form>`
                : submission?.reviewComment ? `<p><strong>Comentario:</strong> ${escapeHtml(submission.reviewComment)}</p>` : '';
            const delivery = submission
                ? `<p><strong>Estudiante:</strong> ${escapeHtml(personName(student))}</p><p><strong>Fecha y horas:</strong> ${escapeHtml(dateText(submission.date))}  -  ${escapeHtml(submission.hours)} h</p><p>${escapeHtml(submission.activityDescription)}</p>${evidence}${review}`
                : '<p>El estudiante aun no ha enviado esta evidencia.</p>';
            return `<article class="rp-card"><small>${escapeHtml(assignmentName(task.assignment))}  -  ${escapeHtml(personName(student))}</small><h3>${escapeHtml(task.title)}</h3><p>${escapeHtml(task.instructions)}</p><p>${statusPill(state)}  -  Fecha limite: ${escapeHtml(dateText(task.dueDate))}</p>${delivery}</article>`;
        });
        const createForm = assignments.length
            ? form('evidenceTask', 'Solicitar evidencia a un estudiante', fields, 'Crear solicitud')
            : '<p class="rp-empty">Necesitas una practica aprobada y asignada a tu cuenta para solicitar evidencias.</p>';
        pageContent('evidencias', titles.evidencias, `${createForm}<h3 class="rp-section-title">Solicitudes de evidencia</h3>${requests || '<p class="rp-empty">Aun no has solicitado evidencias.</p>'}`);
    }

    function renderAdvisor(id) {
        if (id === 'evidencias') {
            renderAdvisorEvidenceTasks();
            return;
        }
        if (id === 'estudiantes') {
            const rows = listRows(dashboard.assignments, item => {
                const hours = dashboard.logs.filter(log => log.assignment?._id === item._id && log.status === 'aprobada').reduce((sum, log) => sum + log.hours, 0);
                return `<tr><td>${escapeHtml(assignmentStudent(item))}</td><td>${escapeHtml(item.institution?.name || '—')}</td><td>${escapeHtml(assignmentName(item))}</td><td>${escapeHtml(hours)}</td><td>${statusPill(item.approvalStatus)}</td></tr>`;
            });
            pageContent(id, titles[id], table(['Estudiante', 'Institución', 'Práctica', 'Horas aprobadas', 'Aprobación'], rows, 'No hay estudiantes asignados a tu cuenta.'));
        } else if (id === 'evidencias') {
            const rows = listRows(dashboard.submissions, item => `<tr><td>${escapeHtml(personName(item.student))}</td><td>${escapeHtml(item.activity?.title || 'Actividad')}</td><td>${escapeHtml(item.response || '—')}${evidenceResources(item.evidence)}</td><td>${statusPill(item.status)}</td></tr>`);
            pageContent(id, titles[id], table(['Estudiante', 'Actividad', 'Evidencia / respuesta', 'Estado'], rows, 'No hay evidencias asociadas a tus prácticas.'));
        }
    }

    function renderDirector(id) {
        if (id === 'practicas') {
            const options = dashboard.practiceOptions;
            const students = options.students || [];
            const advisors = options.advisors || [];
            const institutions = options.institutions || [];
            const practiceTypes = options.practiceTypes || [];
            const studentPrompt = 'Selecciona un estudiante';
            const studentOptions = students.map(student =>
                `<option value="${escapeHtml(student._id)}" data-semester="${escapeHtml(student.semester)}">${escapeHtml(`${personName(student)} · Semestre ${student.semester}`)}</option>`
            ).join('');
            const institutionOptions = institutions.map(institution => {
                const semesters = (institution.semesters || []).map(item =>
                    Number(item && typeof item === 'object' ? item.semester : item)
                );
                return `<option value="${escapeHtml(institution._id)}" data-semesters="${escapeHtml(semesters.join(','))}" disabled>${escapeHtml(`${institution.name} · ${institution.address || ''}`)}</option>`;
            }).join('');
            const advisorOptions = advisors.map(advisor =>
                `<option value="${escapeHtml(advisor._id)}">${escapeHtml(personName(advisor))}</option>`
            ).join('');
            const typeOptions = practiceTypes.map(type =>
                `<option value="${escapeHtml(type.name)}"></option>`
            ).join('');
            const fields = `
                <label>Tipo de práctica<input name="practiceType" list="rp-practice-types" maxlength="160" required><datalist id="rp-practice-types">${typeOptions}</datalist></label>
                <label>Horas requeridas<input name="requiredHours" type="number" min="0.1" max="99999.9" step="0.1" required></label>
                <label>Estudiante<select name="student" required><option value="">${studentPrompt}</option>${studentOptions}</select></label>
                <label>Institución (mismo semestre)<select name="institution" required disabled><option value="">Selecciona una institución</option>${institutionOptions}</select></label>
                <p class="rp-empty">Todos los docentes asignados por el Administrador al estudiante participarán en la práctica.</p>
                <label>Asesor asignado por el Director<select name="accompanimentResponsible" required><option value="">Selecciona un asesor</option>${advisorOptions}</select></label>
                <label>Fecha de inicio<input name="startDate" type="date" required></label>
                <label>Fecha de finalización<input name="endDate" type="date" required></label>
            `;
            const assignmentForm = students.length
                ? form('assignment', 'Asignar práctica a estudiante', fields, 'Guardar práctica', 'rp-practice-form')
                : '<p class="rp-empty">No hay estudiantes activos de tu programa en tu mismo semestre elegible para prácticas. Solo los semestres 8 a 10 requieren práctica y asesor.</p>';
            const warning = dashboard.practiceOptionsError
                ? `<p class="rp-empty">No se pudieron cargar las opciones: ${escapeHtml(dashboard.practiceOptionsError)}</p>`
                : '';
            pageContent(id, titles[id], `${warning}${assignmentForm}`);
        } else if (id === 'estudiantes') {
            const academicStudents = dashboard.practiceOptions.academicStudents || [];
            const rows = listRows(academicStudents, student => {
                const subjects = student.subjects || [];
                const subjectNames = subjects.map(subject => subject.name).join(', ') || 'Sin asignaturas';
                const teachers = student.assignedTeachers || [];
                const teacherNames = teachers.map(personName).join(', ') || 'Sin docente asignado';
                const assignment = dashboard.assignments.find(item => String(item.student?._id) === String(student._id));
                const practice = assignment
                    ? `${assignmentName(assignment)} · ${assignment.institution?.name || 'Sin institución'}`
                    : [8, 9, 10].includes(Number(student.semester))
                        ? 'Sin práctica asignada'
                        : 'No tiene pr\u00e1cticas';
                return `<tr><td>${escapeHtml(personName(student))}<small>${escapeHtml(student.email || '')}</small></td><td>${escapeHtml(student.semester)}</td><td>${escapeHtml(subjectNames)}</td><td>${escapeHtml(teacherNames)}</td><td>${escapeHtml(practice)}</td></tr>`;
            });
            const content = dashboard.practiceOptionsError
                ? `<p class="rp-empty">No se pudieron cargar los estudiantes: ${escapeHtml(dashboard.practiceOptionsError)}</p>`
                : table(['Estudiante', 'Semestre', 'Asignaturas', 'Docentes', 'Práctica'], rows, 'No hay estudiantes activos que coincidan con el programa y semestre del Director.');
            pageContent(id, titles[id], content);
        } else if (id === 'horas') {
            const rows = listRows(dashboard.logs, item => {
                const review = item.status === 'pendiente'
                    ? `<form class="rp-review-log" data-log="${escapeHtml(item._id)}"><select name="status" aria-label="Decisión sobre las horas"><option value="aprobada">Aprobar</option><option value="rechazada">Rechazar</option></select><input name="reviewComment" maxlength="2000" placeholder="Comentario (opcional)"><button type="submit">Guardar revisión</button></form>`
                    : escapeHtml(item.reviewComment || '—');
                return `<tr><td>${escapeHtml(personName(item.student))}</td><td>${escapeHtml(assignmentName(item.assignment))}</td><td>${escapeHtml(dateText(item.date))}</td><td>${escapeHtml(item.hours)}</td><td>${escapeHtml(item.activityDescription)}</td><td>${statusPill(item.status)}</td><td>${review}</td></tr>`;
            });
            pageContent(id, titles[id], table(['Estudiante', 'Práctica', 'Fecha', 'Horas', 'Actividad', 'Estado', 'Revisión'], rows, 'No hay horas registradas para las prácticas de tu programa.'));
        } else if (id === 'evaluaciones') {
            const rows = listRows(dashboard.evaluations, item => `<tr><td>${escapeHtml(personName(item.student))}</td><td>${escapeHtml(item.score)} / 5</td><td>${escapeHtml(item.feedback)}</td><td>${escapeHtml(personName(item.evaluator))}</td><td>${escapeHtml(dateText(item.evaluatedAt))}</td></tr>`);
            pageContent(id, titles[id], table(['Estudiante', 'Nota', 'Retroalimentación', 'Evaluador', 'Fecha'], rows, 'No hay evaluaciones disponibles.'));
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
            document.querySelector('#inicio > .mensaje-inicio')?.setAttribute('hidden', '');
            document.querySelector('#inicio > .rp-student-overview')?.setAttribute('hidden', '');
            document.querySelectorAll('#inicio > section[id]').forEach(section => section.classList.toggle('activa', section.id === id));
            document.querySelector('#inicio > .rp-student-overview')?.toggleAttribute('hidden', id !== 'inicio');
            document.getElementById('mi-perfil')?.classList.toggle('activa', id === 'mi-perfil');
            document.getElementById('inicio')?.classList.add('activa');
            if (id === 'inicio') document.getElementById('inicio')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            else document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            document.querySelectorAll('main section[id]').forEach(section => section.classList.toggle('activa', section.id === id));
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        document.querySelectorAll('[data-vista]').forEach(item => {
            const active = item.dataset.vista === id;
            item.classList.toggle('activa', active);
            item.classList.toggle('activo', active);
        });
        const routeTitle = document.getElementById('titulo-ruta');
        if (routeTitle) {
            routeTitle.textContent = titles[id]?.[0] || (['perfil', 'mi-perfil'].includes(id) ? 'Mi perfil' : 'Inicio');
        }
        document.querySelector('.menu-lateral-asesor, .barra-lateral')?.classList.remove('abierto', 'abierta');
    }
    const currentView = () => document.querySelector('main section.rp-page.activa')?.id || 'inicio';

    let studentNotifications = [];
    let notificationPanel = null;
    function renderStudentNotifications(data) {
        studentNotifications = data.notifications || [];
        const badge = document.querySelector('.contador-notificaciones');
        if (badge) {
            badge.textContent = data.unreadCount > 99 ? '99+' : String(data.unreadCount || 0);
            badge.hidden = !data.unreadCount;
        }
        if (!notificationPanel || notificationPanel.hidden) return;
        const rows = studentNotifications.map(item => {
            const actor = item.actor ? personName(item.actor) : 'Ruta Praxis';
            const date = item.createdAt ? new Date(item.createdAt).toLocaleString('es-CO') : '';
            return `<button type="button" class="rp-notification-item${item.readAt ? ' leida' : ''}" data-student-notification="${escapeHtml(item._id)}" data-view="${escapeHtml(item.view)}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span><small>${escapeHtml(actor)} · ${escapeHtml(date)}</small></button>`;
        }).join('');
        notificationPanel.innerHTML = `<header><strong>Notificaciones</strong><button type="button" class="rp-notification-read-all" ${data.unreadCount ? '' : 'disabled'}>Marcar todas como leídas</button></header><div class="rp-notification-list">${rows || '<p class="rp-empty">No tienes notificaciones todavía.</p>'}</div>`;
    }

    async function refreshStudentNotifications() {
        if (role !== 'estudiante') return;
        try {
            const result = await api('/api/workflow/notifications');
            renderStudentNotifications(result.data);
        } catch (error) {
            console.error('No se pudieron cargar las notificaciones:', error);
        }
    }

    if (role === 'estudiante') {
        const bell = document.querySelector('.boton-notificaciones');
        const header = document.querySelector('.barra-superior-estudiante');
        if (header && bell) {
            header.classList.add('rp-notification-anchor');
            notificationPanel = document.createElement('aside');
            notificationPanel.className = 'rp-notification-panel';
            notificationPanel.hidden = true;
            notificationPanel.setAttribute('aria-label', 'Notificaciones del estudiante');
            bell.insertAdjacentElement('afterend', notificationPanel);
            bell.setAttribute('aria-expanded', 'false');
            bell.addEventListener('click', () => {
                notificationPanel.hidden = !notificationPanel.hidden;
                bell.setAttribute('aria-expanded', String(!notificationPanel.hidden));
                if (!notificationPanel.hidden) refreshStudentNotifications();
            });
            notificationPanel.addEventListener('click', async event => {
                if (event.target.closest('.rp-notification-read-all')) {
                    try {
                        await api('/api/workflow/notifications/read-all', { method: 'PATCH' });
                        await refreshStudentNotifications();
                    } catch (error) { notify(error.message); }
                    return;
                }
                const item = event.target.closest('[data-student-notification]');
                if (!item) return;
                const notification = studentNotifications.find(entry => entry._id === item.dataset.studentNotification);
                try {
                    await api(`/api/workflow/notifications/${encodeURIComponent(item.dataset.studentNotification)}/read`, { method: 'PATCH' });
                    await refreshStudentNotifications();
                    notificationPanel.hidden = true;
                    bell.setAttribute('aria-expanded', 'false');
                    const legacyEvidenceViews = ['mi-practica', 'retroalimentaciones', 'informacion-proceso'];
                    const requestedView = legacyEvidenceViews.includes(notification?.view) ? 'evidencias' : notification?.view;
                    const allowedViews = ['inicio', 'mis-actividades', 'evidencias', 'evaluaciones'];
                    const destination = allowedViews.includes(requestedView) ? requestedView : 'inicio';
                    if (document.getElementById(destination)) navigate(destination);
                } catch (error) { notify(error.message); }
            });
            document.addEventListener('click', event => {
                if (!notificationPanel.hidden && !event.target.closest('.rp-notification-panel, .boton-notificaciones')) {
                    notificationPanel.hidden = true;
                    bell.setAttribute('aria-expanded', 'false');
                }
            });
            refreshStudentNotifications();
            window.setInterval(refreshStudentNotifications, 25000);
        }
    }

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
        const resourceInput = event.target.closest('.rp-resource-files');
        if (resourceInput) {
            const summary = resourceInput.form.querySelector('.rp-selected-resources');
            const files = [...resourceInput.files];
            const totalSize = files.reduce((total, file) => total + file.size, 0);
            summary.textContent = files.length
                ? `${files.length} archivo(s) seleccionados · ${(totalSize / (1024 * 1024)).toFixed(2)} MB`
                : '';
            return;
        }
        const practiceStudentSelect = event.target.closest('.rp-practice-form select[name="student"]');
        if (practiceStudentSelect) {
            const semester = practiceStudentSelect.selectedOptions[0]?.dataset.semester || '';
            const institutionSelect = practiceStudentSelect.form.elements.institution;
            institutionSelect.disabled = !semester;
            [...institutionSelect.options].forEach(option => {
                if (!option.value) return;
                const compatible = Boolean(semester) && option.dataset.semesters.split(',').includes(semester);
                option.hidden = !compatible;
                option.disabled = !compatible;
                if (!compatible && option.selected) institutionSelect.value = '';
            });
            return;
        }
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
            const formData = new FormData(target);
            const fields = Object.fromEntries([...formData.entries()].filter(([name]) => !['resources', 'files'].includes(name)));
            try {
                const activeView = currentView();
                if (target.dataset.workflowForm === 'activity') {
                    const files = formData.getAll('resources').filter(file => file instanceof File && file.size);
                    const totalSize = files.reduce((total, file) => total + file.size, 0);
                    if (files.length > 5 || totalSize > 20 * 1024 * 1024) {
                        throw new Error('Puedes adjuntar hasta 5 archivos y 20 MB en total.');
                    }
                    const upload = new FormData();
                    Object.entries(fields).forEach(([name, value]) => upload.append(name, value));
                    files.forEach(file => upload.append('resources', file, file.name));
                    await api(endpoints.activity, { method: 'POST', body: upload });
                    await loadDashboard();
                    render(activeView);
                    notify('La actividad y sus recursos se publicaron correctamente.');
                    return;
                }
                if (target.dataset.workflowForm === 'submission') {
                    const files = formData.getAll('files').filter(file => file instanceof File && file.size);
                    const totalSize = files.reduce((total, file) => total + file.size, 0);
                    if (files.length > 5 || totalSize > 20 * 1024 * 1024) {
                        throw new Error('Puedes adjuntar hasta 5 archivos y 20 MB en total.');
                    }
                    const upload = new FormData();
                    upload.append('activity', fields.activity);
                    upload.append('response', fields.response || '');
                    files.forEach(file => upload.append('files', file, file.name));
                    await api(endpoints.submission, { method: 'POST', body: upload });
                    await loadDashboard();
                    render(activeView);
                    notify('La entrega se guardó correctamente en Oracle Database.');
                    return;
                }
                if (target.dataset.workflowForm === 'practiceEvidence') {
                    const files = formData.getAll('files').filter(file => file instanceof File && file.size);
                    const totalSize = files.reduce((total, file) => total + file.size, 0);
                    if (files.length > 5 || totalSize > 20 * 1024 * 1024) {
                        throw new Error('Puedes adjuntar hasta 5 archivos y 20 MB en total.');
                    }
                    const upload = new FormData();
                    Object.entries(fields).forEach(([name, value]) => upload.append(name, value));
                    files.forEach(file => upload.append('files', file, file.name));
                    await api(endpoints.practiceEvidence, { method: 'POST', body: upload });
                    await loadDashboard();
                    render(activeView);
                    notify('La evidencia de práctica se guardó correctamente.');
                    return;
                }
                if (target.dataset.workflowForm === 'evidenceTask') {
                    await api('/api/workflow/evidence-tasks', { method: 'POST', body: JSON.stringify(fields) });
                    await loadDashboard();
                    render(activeView);
                    notify('La solicitud se asignÃ³ al estudiante.');
                    return;
                }
                if (target.dataset.workflowForm === 'evidenceTaskSubmission') {
                    const files = formData.getAll('files').filter(file => file instanceof File && file.size);
                    const totalSize = files.reduce((total, file) => total + file.size, 0);
                    if (files.length > 5 || totalSize > 20 * 1024 * 1024) throw new Error('Puedes adjuntar hasta 5 archivos y 20 MB en total.');
                    const upload = new FormData();
                    Object.entries(fields).filter(([name]) => name !== 'task').forEach(([name, value]) => upload.append(name, value));
                    files.forEach(file => upload.append('files', file, file.name));
                    await api(`/api/workflow/evidence-tasks/${encodeURIComponent(fields.task)}/submissions`, { method: 'POST', body: upload });
                    await loadDashboard();
                    render(activeView);
                    notify('La evidencia y las horas se enviaron al asesor.');
                    return;
                }
                await api(endpoints[target.dataset.workflowForm], { method: 'POST', body: JSON.stringify(fields) });
                await loadDashboard();
                render(activeView);
                notify('El registro se guardó correctamente en Oracle Database.');
            } catch (error) {
                notify(error.message);
            }
        } else if (target.matches('.rp-review')) {
            event.preventDefault();
            const fields = Object.fromEntries(new FormData(target).entries());
            try {
                const activeView = currentView();
                await api(`/api/workflow/submissions/${target.dataset.submission}/review`, { method: 'PATCH', body: JSON.stringify(fields) });
                await loadDashboard();
                render(activeView);
                notify('La revisión se guardó correctamente.');
            } catch (error) { notify(error.message); }
        } else if (target.matches('.rp-evidence-review')) {
            event.preventDefault();
            const fields = Object.fromEntries(new FormData(target).entries());
            fields.status = event.submitter?.value;
            try {
                const activeView = currentView();
                await api(`/api/workflow/evidence-submissions/${target.dataset.evidenceSubmission}/review`, { method: 'PATCH', body: JSON.stringify(fields) });
                await loadDashboard();
                render(activeView);
                notify('La revisiÃ³n de evidencia y horas se guardÃ³.');
            } catch (error) { notify(error.message); }
        } else if (target.matches('.rp-review-log')) {
            event.preventDefault();
            const fields = Object.fromEntries(new FormData(target).entries());
            try {
                const activeView = currentView();
                await api(`/api/workflow/logs/${target.dataset.log}/review`, { method: 'PATCH', body: JSON.stringify(fields) });
                await loadDashboard();
                render(activeView);
                notify('La validación de horas se guardó correctamente.');
            } catch (error) { notify(error.message); }
        } else if (target.matches('.rp-approval')) {
            event.preventDefault();
            const submitter = event.submitter;
            const fields = Object.fromEntries(new FormData(target).entries());
            fields.approvalStatus = submitter?.value;
            if (fields.approvalStatus === 'pendiente' &&
                !window.confirm('¿Quieres quitar la aprobación y devolver esta práctica a pendiente?')) return;
            try {
                const activeView = currentView();
                await api(`/api/workflow/assignments/${target.dataset.assignment}/approval`, { method: 'PATCH', body: JSON.stringify(fields) });
                await loadDashboard();
                render(activeView);
                notify('La decisión sobre la práctica se guardó correctamente.');
            } catch (error) { notify(error.message); }
        }
    }, true);

    loadDashboard()
        .then(() => {
            render();
            if (dashboard.practiceOptionsError) {
                notify(`No fue posible cargar las opciones académicas: ${dashboard.practiceOptionsError}`);
            }
        })
        .catch(error => {
            pageContent('inicio', ['No se pudo cargar el tablero', 'La información real no está disponible.'], `<p class="rp-empty">${escapeHtml(error.message)}</p>`);
            notify(`No fue posible cargar los datos desde Oracle Database: ${error.message}`);
        });
})();
