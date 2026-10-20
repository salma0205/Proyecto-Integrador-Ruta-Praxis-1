const vistasAdmin = document.querySelectorAll('.vista-asesor');
const accesosAdmin = document.querySelectorAll('[data-vista]');
const lateralAdmin = document.querySelector('.menu-lateral-asesor');
const notificacionAdmin = document.getElementById('notificacion');
let temporizadorAdmin;
let tipoRegistro = 'usuario';
let elementoEditado = null;
let asignaturasDisponibles = [];
let programasDisponibles = [];
let institucionesDisponibles = [];
let tiposPracticaDisponibles = [];
let asignacionesDisponibles = [];
let paginaUsuarios = 1;
const tamanoPaginaUsuarios = 10;
let consultaUsuariosActiva = 0;
let temporizadorBusquedaUsuarios;

const rolesUsuario = {
    administrador: 'Administrador',
    estudiante: 'Estudiante',
    asesor: 'Asesor',
    director: 'Director',
    docente: 'Docente'
};

const estadoInicial = {
    usuarios: [],
    registros: { estudiante: [], personal: [], asignatura: [], institucion: [], practica: [] }
};

const estadoAdmin = estadoInicial;

campo('form-programa').addEventListener('submit', async evento => {
    evento.preventDefault();
    const form = evento.currentTarget;
    const id = form.dataset.editar || '';
    const data = {
        name: campo('programa-nombre').value.trim(),
        director: campo('programa-director').value || null,
        teachers: valoresSeleccionados(campo('programa-docentes'))
    };
    if (!data.name) {
        avisoAdmin('Escribe el nombre del programa.', true);
        return;
    }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
        await solicitarApi(id ? `/api/programs/${id}` : '/api/programs', {
            method: id ? 'PATCH' : 'POST',
            body: JSON.stringify(data)
        });
        await cargarProgramasDesdeApi();
        avisoAdmin(id ? 'Programa actualizado correctamente.' : 'Programa registrado correctamente.');
        modalPrograma.close();
        form.reset();
        delete form.dataset.editar;
    } catch (error) {
        avisoAdmin(error.message, true);
    } finally {
        submit.disabled = false;
    }
});

function nombreCompleto(usuario) {
    return [usuario.primerNombre, usuario.segundoNombre, usuario.primerApellido, usuario.segundoApellido]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function mapearUsuarioAdmin(usuario) {
    const registro = {
        id: usuario._id,
        primerNombre: usuario.firstName,
        segundoNombre: usuario.middleName || '',
        primerApellido: usuario.lastName,
        segundoApellido: usuario.secondLastName || '',
        correo: usuario.email || usuario.username || '',
        nombreUsuario: usuario.username || '',
        codigo: usuario.studentCode || '',
        programa: usuario.programId?.name || usuario.program || '',
        asignaturas: (usuario.subjects || []).map(asignatura => ({
            id: asignatura._id,
            nombre: asignatura.name
        })),
        programId: usuario.programId?._id || usuario.programId || '',
        rol: rolesUsuario[usuario.role] || usuario.role,
        semestre: usuario.semester ? [String(usuario.semester)] : [],
        activo: usuario.active
    };
    registro.nombre = nombreCompleto(registro);
    return registro;
}

function escaparHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, caracter => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[caracter]);
}

async function solicitarApi(url, options = {}) {
    const response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
    });
    const result = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(result?.error || 'No se pudo completar la solicitud.');
    if (options.method && options.method !== 'GET') window.dispatchEvent(new Event('admin-data-change'));
    return result;
}

async function cargarUsuariosDesdeApi() {
    const result = await solicitarApi('/api/users');
    estadoAdmin.usuarios = result.data.map(mapearUsuarioAdmin);
    paginaUsuarios = 1;
    await renderUsuarios();
    actualizarResumenAdministrador();
    llenarDirectores(campo('programa-director')?.value || '');
    llenarUsuariosPorRol('programa-docentes', 'Docente', valoresSeleccionados(campo('programa-docentes')));
    llenarUsuariosPorRol('campo-docentes-asignatura', 'Docente', valoresSeleccionados(campo('campo-docentes-asignatura')));
    llenarUsuariosPorRol('campo-estudiantes-asignatura', 'Estudiante', valoresSeleccionados(campo('campo-estudiantes-asignatura')));
}

function avisoAdmin(mensaje, esError = false) {
    notificacionAdmin.querySelector('span').textContent = mensaje;
    notificacionAdmin.classList.toggle('error', esError);
    notificacionAdmin.querySelector('i').className = `fa-solid ${esError ? 'fa-circle-exclamation' : 'fa-circle-check'}`;
    notificacionAdmin.classList.add('visible');
    clearTimeout(temporizadorAdmin);
    temporizadorAdmin = setTimeout(() => notificacionAdmin.classList.remove('visible'), 3200);
}

document.querySelector('.boton-notificaciones')?.addEventListener('click', () => {
    avisoAdmin('Todavia no tienes notificaciones nuevas.');
});

function abrirVistaAdmin(id) {
    vistasAdmin.forEach(vista => vista.classList.toggle('activa', vista.id === id));
    document.querySelectorAll('.opcion-menu').forEach(opcion => opcion.classList.toggle('activa', opcion.dataset.vista === id));
    lateralAdmin.classList.remove('abierto');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function etiquetaEstado(activo, textoActivo = 'Activo', textoInactivo = 'Inactivo') {
    return `<em class="estado ${activo ? 'listo' : 'riesgo'}">${activo ? textoActivo : textoInactivo}</em>`;
}

function campo(id) {
    return document.getElementById(id);
}

function configurarGrupo(id, visible, requerido = false) {
    const grupo = campo(id);
    const control = grupo?.querySelector('input, select');
    if (!grupo || !control) return;
    grupo.hidden = !visible;
    control.required = visible && requerido;
}

function actualizarOpcionesEstado(opciones, seleccionado) {
    const selector = campo('campo-estado-registro');
    selector.innerHTML = opciones.map(opcion => `<option ${opcion === seleccionado ? 'selected' : ''}>${opcion}</option>`).join('');
}

function obtenerInstitucionesRegistradas() {
    return institucionesDisponibles.filter(institucion => institucion.active);
}

function obtenerAsignaturasRegistradas() {
    return asignaturasDisponibles.filter(asignatura => asignatura.active);
}

async function cargarProgramasDesdeApi() {
    const result = await solicitarApi('/api/programs');
    programasDisponibles = result.data;
    const filtroPrograma = campo('filtro-programa');
    const programaSeleccionado = filtroPrograma.value;
    filtroPrograma.innerHTML = '<option value="">Todos los programas</option>' + programasDisponibles
        .map(programa => `<option value="${escaparHtml(programa._id)}">${escaparHtml(programa.name)}</option>`)
        .join('');
    filtroPrograma.value = programasDisponibles.some(programa => programa._id === programaSeleccionado)
        ? programaSeleccionado
        : '';
    await renderUsuarios();
    const lista = campo('lista-programas');
    lista.innerHTML = programasDisponibles.map(programa => {
        const directorName = programa.director
            ? `${programa.director.firstName} ${programa.director.lastName}`
            : 'Sin director asignado';
        const teacherIds = (programa.teachers || []).map(teacher => teacher._id || teacher).join(',');
        const teacherNames = (programa.teachers || [])
            .map(teacher => `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim())
            .filter(Boolean)
            .join(', ') || 'Sin docentes asignados';
        return `<article data-id="${escaparHtml(programa._id)}" data-director="${escaparHtml(programa.director?._id || '')}" data-teachers="${escaparHtml(teacherIds)}" data-estado="${programa.active ? 'Activo' : 'Inactivo'}"><span class="icono-admin"><i class="fa-solid fa-graduation-cap"></i></span><em class="estado ${programa.active ? 'listo' : 'riesgo'}">${programa.active ? 'Activo' : 'Inactivo'}</em><h3>${escaparHtml(programa.name)}</h3><p>Director: ${escaparHtml(directorName)} · Docentes: ${escaparHtml(teacherNames)}</p><footer><button class="enlace-accion editar-tarjeta" type="button" data-tipo="programa">Editar</button><button class="boton-desactivar" type="button">${programa.active ? 'Desactivar' : 'Activar'}</button></footer></article>`;
    }).join('') || '<p class="vacio-admin">Aún no hay programas académicos registrados.</p>';
    llenarProgramas(campo('usuario-programa')?.value || '');
    llenarDirectores(campo('programa-director')?.value || '');
}

async function cargarAsignaturasDesdeApi() {
    const result = await solicitarApi('/api/subjects');
    asignaturasDisponibles = result.data;
    const lista = campo('lista-asignaturas');
    lista.innerHTML = asignaturasDisponibles.map(asignatura => crearTarjeta('asignatura', {
        id: asignatura._id,
        nombre: escaparHtml(asignatura.name),
        codigo: escaparHtml(asignatura.code),
        semestre: asignatura.semester || '',
        teachers: asignatura.teachers || [],
        students: asignatura.students || [],
        estado: asignatura.active ? 'Activa' : 'Inactiva'
    })).join('') || '<p class="vacio-admin">Aun no hay asignaturas registradas.</p>';
    llenarAsignaturas(Array.from(campo('usuario-asignaturas')?.selectedOptions || []).map(option => option.value));
    actualizarResumenAdministrador();
}

async function cargarInstitucionesDesdeApi() {
    const result = await solicitarApi('/api/institutions');
    institucionesDisponibles = result.data;
    campo('lista-instituciones').innerHTML = institucionesDisponibles.map(institucion => crearTarjeta('institucion', {
        id: institucion._id,
        nombre: escaparHtml(institucion.name),
        direccion: escaparHtml(institucion.address || ''),
        semestres: institucion.semesters || [],
        practica: escaparHtml(institucion.practiceName || ''),
        asesor: escaparHtml(institucion.advisorName || ''),
        estado: institucion.active ? 'Activa' : 'Inactiva'
    })).join('') || '<p class="vacio-admin">Aún no hay instituciones registradas.</p>';
    llenarInstituciones(campo('practica-institucion')?.value || '', 'practica-institucion');
    actualizarResumenAdministrador();
}

async function cargarTiposPracticaDesdeApi() {
    const result = await solicitarApi('/api/practiceTypes');
    tiposPracticaDisponibles = result.data.filter(tipo => tipo.active);
    llenarTiposPractica(campo('practica-tipo')?.value || '');
}

async function cargarPracticasDesdeApi() {
    const result = await solicitarApi('/api/assignments');
    asignacionesDisponibles = result.data;
    campo('tabla-practicas-admin').innerHTML = result.data.map(asignacion => crearFila('practica', {
        id: asignacion._id,
        practiceTypeId: asignacion.practiceType?._id || asignacion.practiceType,
        practiceType: asignacion.practiceType?.name || 'Práctica',
        institutionId: asignacion.institution?._id || asignacion.institution,
        institucion: asignacion.institution?.name || 'Sin institución',
        estudianteId: asignacion.student?._id || asignacion.student,
        estudiante: asignacion.student ? nombreUsuarioApi(asignacion.student) : 'Sin estudiante',
        docenteId: asignacion.teacher?._id || asignacion.teacher,
        docente: asignacion.teacher ? nombreUsuarioApi(asignacion.teacher) : 'Sin docente',
        asesorId: asignacion.accompanimentResponsible?._id || asignacion.accompanimentResponsible || '',
        asesor: asignacion.accompanimentResponsible ? nombreUsuarioApi(asignacion.accompanimentResponsible) : 'Sin asesor',
        fechaCreacion: fechaParaFormulario(asignacion.startDate),
        fechaLimite: fechaParaFormulario(asignacion.endDate),
        estado: estadoPracticaEtiqueta(asignacion.status)
    })).join('') || '<tr><td colspan="7" class="vacio-tabla">No hay prácticas registradas aún.</td></tr>';
    actualizarResumenAdministrador();
}

function nombreUsuarioApi(usuario) {
    return [usuario.firstName, usuario.middleName, usuario.lastName, usuario.secondLastName].filter(Boolean).join(' ');
}

function fechaParaFormulario(fecha) {
    return fecha ? new Date(fecha).toISOString().slice(0, 10) : '';
}

function estadoPracticaEtiqueta(estado) {
    return ({ disponible: 'Disponible', en_curso: 'En curso', finalizada: 'Finalizada', cancelada: 'Cancelada' })[estado] || estado || 'Disponible';
}

function estadoPracticaApi(estado) {
    return ({ Disponible: 'disponible', 'En curso': 'en_curso', Finalizada: 'finalizada', Cancelada: 'cancelada' })[estado] || 'disponible';
}

function llenarTiposPractica() {
    const opciones = campo('lista-tipos-practica');
    if (!opciones) return;
    opciones.replaceChildren(...tiposPracticaDisponibles.map(tipo => new Option(tipo.name, tipo.name)));
}

function llenarInstituciones(seleccionada = '', id = 'campo-institucion') {
    const selector = campo(id);
    if (!selector) return;
    selector.replaceChildren(new Option('Selecciona una institución', ''));
    obtenerInstitucionesRegistradas().forEach(institucion => {
        selector.add(new Option(institucion.name, institucion._id, false, String(institucion._id) === String(seleccionada)));
    });
}

function llenarProgramas(seleccionada = '') {
    const selector = campo('usuario-programa');
    if (!selector) return;
    selector.replaceChildren(new Option('Selecciona un programa registrado', ''));
    programasDisponibles.filter(programa => programa.active).forEach(programa => {
        selector.add(new Option(programa.name, programa._id, false, String(programa._id) === String(seleccionada)));
    });
}

function llenarDirectores(seleccionado = '') {
    const selector = campo('programa-director');
    if (!selector) return;
    selector.replaceChildren(new Option('Sin director por ahora', ''));
    estadoAdmin.usuarios.filter(usuario => usuario.rol === 'Director' && (usuario.activo || String(usuario.id) === String(seleccionado)))
        .forEach(usuario => selector.add(new Option(usuario.nombre, usuario.id, false, String(usuario.id) === String(seleccionado))));
}

function llenarUsuariosPorRol(selectorId, rol, seleccionados = []) {
    const selector = campo(selectorId);
    if (!selector) return;
    const ids = new Set((Array.isArray(seleccionados) ? seleccionados : [seleccionados]).map(String).filter(Boolean));
    const opciones = estadoAdmin.usuarios
        .filter(usuario => usuario.rol === rol && (usuario.activo !== false || ids.has(String(usuario.id))))
        .map(usuario => new Option(usuario.nombre, usuario.id, false, ids.has(String(usuario.id))));
    if (!opciones.length) {
        const empty = new Option(`Primero crea usuarios con rol ${rol}`, '');
        empty.disabled = true;
        selector.replaceChildren(empty);
        return;
    }
    selector.replaceChildren(...opciones);
}

function llenarAsignaturas(seleccionadas = []) {
    const selector = campo('usuario-asignaturas');
    const ids = new Set((Array.isArray(seleccionadas) ? seleccionadas : [seleccionadas]).map(value =>
        typeof value === 'object' ? String(value.id || value._id) : String(value)
    ));
    selector.replaceChildren(...obtenerAsignaturasRegistradas().map(asignatura =>
        new Option(asignatura.name, asignatura._id, false, ids.has(String(asignatura._id)))
    ));
}

function obtenerAsesoresRegistrados() {
    return estadoAdmin.usuarios
        .filter(usuario => usuario.rol === 'Asesor' && usuario.activo !== false)
        .map(usuario => usuario.nombre)
        .filter(Boolean);
}

function obtenerDocentesRegistrados() {
    const docentes = estadoAdmin.usuarios
        .filter(usuario => usuario.rol === 'Docente' && usuario.activo !== false)
        .map(usuario => usuario.nombre)
        .filter(Boolean);
    return docentes.length ? docentes : ['Primero crea un docente'];
}

function obtenerEstudiantesRegistrados() {
    const estudiantes = estadoAdmin.usuarios
        .filter(usuario => usuario.rol === 'Estudiante' && usuario.activo !== false)
        .map(usuario => usuario.nombre)
        .filter(Boolean);
    return estudiantes.length ? estudiantes : ['Primero crea un estudiante'];
}

function llenarOpciones(selectorId, opciones, seleccionada = '') {
    const selector = campo(selectorId);
    if (!selector) return;
    selector.replaceChildren(new Option('Sin asesor asignado', ''));
    opciones.forEach(opcion => selector.add(new Option(opcion, opcion, false, opcion === seleccionada)));
}

function generarCodigoAsignatura() {
    const codigos = new Set(
        Array.from(document.querySelectorAll('#lista-asignaturas article'))
            .map(tarjeta => tarjeta.dataset.codigo)
            .filter(Boolean)
    );
    let consecutivo = 1;
    let codigo = `ASG-${String(consecutivo).padStart(3, '0')}`;
    while (codigos.has(codigo)) {
        consecutivo += 1;
        codigo = `ASG-${String(consecutivo).padStart(3, '0')}`;
    }
    return codigo;
}

function valoresSeleccionados(selector) {
    return Array.from(selector.selectedOptions).map(opcion => opcion.value);
}

function seleccionarValores(selector, valores) {
    const lista = Array.isArray(valores) ? valores : [valores].filter(Boolean);
    Array.from(selector.options).forEach(opcion => {
        opcion.selected = lista.includes(opcion.value);
    });
}

function semestresSeleccionados() {
    return Array.from(document.querySelectorAll('#usuario-semestres input:checked')).map(campo => campo.value);
}

function seleccionarSemestres(valores) {
    const lista = Array.isArray(valores) ? valores : [valores].filter(Boolean);
    document.querySelectorAll('#usuario-semestres input').forEach(campo => {
        campo.checked = lista.includes(campo.value);
    });
}

function semestresInstitucionSeleccionados() {
    return Array.from(document.querySelectorAll('#institucion-semestres input:checked')).map(campo => campo.value);
}

function seleccionarSemestresInstitucion(valores) {
    const lista = Array.isArray(valores) ? valores : [valores].filter(Boolean);
    document.querySelectorAll('#institucion-semestres input').forEach(campo => {
        campo.checked = lista.includes(campo.value);
    });
}

function actualizarResumenAdministrador() {
    const usuariosActivos = estadoAdmin.usuarios.filter(usuario => usuario.activo).length;
    const totalUsuarios = estadoAdmin.usuarios.length;
    const asignaturasActivas = asignaturasDisponibles.filter(asignatura => asignatura.active).length;
    const institucionesActivas = institucionesDisponibles.filter(institucion => institucion.active).length;
    const practicasEnCurso = asignacionesDisponibles.filter(asignacion => asignacion.status === 'en_curso').length;
    document.getElementById('dato-usuarios').textContent = usuariosActivos;
    document.getElementById('dato-asignaturas').textContent = asignaturasActivas;
    document.getElementById('dato-instituciones').textContent = institucionesActivas;
    document.getElementById('dato-practicas').textContent = practicasEnCurso;
    document.getElementById('porcentaje-usuarios').textContent = totalUsuarios
        ? `${Math.round((usuariosActivos / totalUsuarios) * 100)}%`
        : '0%';
    document.getElementById('texto-usuarios').textContent = usuariosActivos ? 'Usuarios activos' : 'Sin usuarios activos';
    document.getElementById('texto-asignaturas').textContent = asignaturasActivas ? 'Asignaturas activas' : 'Sin asignaturas activas';
    document.getElementById('texto-instituciones').textContent = institucionesActivas ? 'Instituciones activas' : 'Sin instituciones activas';
    document.getElementById('texto-practicas').textContent = practicasEnCurso ? 'En curso' : 'Sin prácticas en curso';
}

function parametrosFiltroUsuarios() {
    const params = new URLSearchParams({
        page: String(paginaUsuarios),
        limit: String(tamanoPaginaUsuarios),
        search: campo('buscar-usuario').value.trim()
    });
    const status = campo('filtro-estado').value;
    const selectedRole = campo('filtro-rol').value;
    const role = Object.entries(rolesUsuario).find(([, label]) => label === selectedRole)?.[0] || '';
    const programId = campo('filtro-programa').value;
    if (status) params.set('status', status);
    if (role) params.set('role', role);
    if (programId) params.set('programId', programId);
    return params;
}

function actualizarUsuariosEnMemoria(usuarios) {
    usuarios.forEach(usuario => {
        const index = estadoAdmin.usuarios.findIndex(existing => existing.id === usuario.id);
        if (index === -1) estadoAdmin.usuarios.push(usuario);
        else estadoAdmin.usuarios[index] = usuario;
    });
}

async function renderUsuarios() {
    const requestId = ++consultaUsuariosActiva;
    try {
        const params = parametrosFiltroUsuarios();
        const result = await solicitarApi(`/api/admin/users?${params}`);
        if (requestId !== consultaUsuariosActiva) return;
        const usuarios = result.data.map(mapearUsuarioAdmin);
        const { page, limit, total, totalPages } = result.pagination;
        if (totalPages && page > totalPages) {
            paginaUsuarios = totalPages;
            return renderUsuarios();
        }
        actualizarUsuariosEnMemoria(usuarios);
        const inicio = total ? (page - 1) * limit : 0;
        campo('resumen-paginacion-usuarios').textContent = total
            ? `Mostrando ${inicio + 1}–${inicio + usuarios.length} de ${total} usuarios`
            : 'No hay usuarios que coincidan con los filtros.';
        campo('pagina-anterior-usuarios').disabled = page <= 1;
        campo('pagina-siguiente-usuarios').disabled = page >= totalPages;

        if (!usuarios.length) {
            document.getElementById('tabla-usuarios').innerHTML = `
                <tr>
                    <td colspan="7" class="vacio-tabla">${total ? 'No hay usuarios en esta página.' : 'No hay usuarios que coincidan con la búsqueda o los filtros.'}</td>
                </tr>
            `;
            actualizarResumenAdministrador();
            return;
        }

        document.getElementById('tabla-usuarios').innerHTML = usuarios.map(usuario => `
        <tr>
            <td><strong>${escaparHtml(usuario.nombre)}</strong><small>${escaparHtml(usuario.programa || '')}${usuario.asignaturas?.length ? ` · ${escaparHtml(usuario.asignaturas.map(asignatura => asignatura.nombre).join(', '))}` : ''}</small></td>
            <td>${escaparHtml(usuario.correo || 'Sin correo')}</td>
            <td>${escaparHtml(usuario.codigo || 'Sin codigo')}</td>
            <td>${escaparHtml(usuario.rol)}</td>
            <td>${escaparHtml((usuario.semestre || []).join(', '))}</td>
            <td>${etiquetaEstado(usuario.activo)}</td>
            <td>
                <div class="acciones-usuario">
                    <button class="accion-tabla editar-usuario" type="button" data-id="${usuario.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    <button class="accion-tabla cambiar-estado" type="button" data-id="${usuario.id}" title="Activar o desactivar"><i class="fa-solid ${usuario.activo ? 'fa-user-slash' : 'fa-user-check'}"></i></button>
                    <button class="accion-tabla eliminar-usuario" type="button" data-id="${usuario.id}" title="Eliminar usuario"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        </tr>
        `).join('');
        actualizarResumenAdministrador();
    } catch (error) {
        if (requestId !== consultaUsuariosActiva) return;
        document.getElementById('tabla-usuarios').innerHTML =
            `<tr><td colspan="7" class="vacio-tabla">No se pudieron cargar los usuarios: ${escaparHtml(error.message)}</td></tr>`;
        campo('resumen-paginacion-usuarios').textContent = 'Error al cargar la página.';
    }
}

async function exportarUsuariosCsv() {
    const boton = campo('exportar-usuarios');
    boton.disabled = true;
    try {
        const params = parametrosFiltroUsuarios();
        params.set('page', '1');
        params.set('limit', '100');
        const firstPage = await solicitarApi(`/api/admin/users?${params}`);
        const usuarios = firstPage.data.map(mapearUsuarioAdmin);
        for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
            params.set('page', String(page));
            const result = await solicitarApi(`/api/admin/users?${params}`);
            usuarios.push(...result.data.map(mapearUsuarioAdmin));
        }
        if (!usuarios.length) {
            avisoAdmin('No hay usuarios para exportar con los filtros actuales.', true);
            return;
        }
        const protegerFormula = valor => /^[\s]*[=+\-@]/.test(String(valor ?? '')) ? `'${valor}` : valor;
        const filas = [
            ['Nombre', 'Correo o usuario', 'Código', 'Rol', 'Programa', 'Asignaturas', 'Semestre', 'Estado'],
            ...usuarios.map(usuario => [
                usuario.nombre,
                usuario.correo || usuario.nombreUsuario,
                usuario.codigo,
                usuario.rol,
                usuario.programa,
                (usuario.asignaturas || []).map(asignatura => asignatura.nombre).join('; '),
                (usuario.semestre || []).join('; '),
                usuario.activo ? 'Activo' : 'Inactivo'
            ])
        ];
        const csv = '\uFEFF' + filas.map(fila => fila
            .map(valor => `"${String(protegerFormula(valor) ?? '').replace(/"/g, '""')}"`)
            .join(','))
            .join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = 'usuarios-ruta-praxis.csv';
        enlace.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        avisoAdmin(`Se exportaron ${usuarios.length} usuarios.`);
    } catch (error) {
        avisoAdmin(error.message, true);
    } finally {
        boton.disabled = false;
    }
}

function crearFila(tipo, registro) {
    const nombre = registro.nombre;
    const correo = registro.correo || 'Sin correo';
    const rol = registro.rol || 'Sin rol';
    const extra = registro.extra || 'Sin asignar';

    if (tipo === 'estudiante') {
        return `<tr><td><strong>${escaparHtml(nombre)}</strong><small>${escaparHtml(correo)}</small></td><td>${escaparHtml(extra)}</td><td>${escaparHtml(registro.semestre || 'Sin semestre')}</td><td>Sin práctica asignada</td><td>${etiquetaEstado(true)}</td><td><button class="accion-tabla editar-registro" type="button" data-tipo="estudiante" title="Editar"><i class="fa-solid fa-pen"></i></button></td></tr>`;
    }

    if (tipo === 'personal') {
        return `<tr><td><strong>${escaparHtml(nombre)}</strong></td><td>${escaparHtml(rol)}</td><td>${escaparHtml(correo)}</td><td>${escaparHtml(extra)}</td><td>${etiquetaEstado(true)}</td><td><button class="accion-tabla editar-registro" type="button" data-tipo="personal" title="Editar"><i class="fa-solid fa-pen"></i></button></td></tr>`;
    }

    if (tipo === 'practica') {
        const estado = registro.estado || 'Disponible';
        const claseEstado = estado === 'En curso' || estado === 'Finalizada' ? 'listo' : estado === 'Cancelada' ? 'riesgo' : 'alerta';
        return `<tr data-id="${escaparHtml(registro.id || '')}" data-practice-type="${escaparHtml(registro.practiceTypeId || '')}" data-practice-name="${escaparHtml(registro.practiceType || '')}" data-institution="${escaparHtml(registro.institutionId || '')}" data-student="${escaparHtml(registro.estudianteId || '')}" data-teacher="${escaparHtml(registro.docenteId || '')}" data-advisor="${escaparHtml(registro.asesorId || '')}" data-start-date="${escaparHtml(registro.fechaCreacion || '')}" data-end-date="${escaparHtml(registro.fechaLimite || '')}" data-status="${escaparHtml(estado)}"><td>${escaparHtml(registro.institucion || 'Sin institucion')}<small>${escaparHtml(registro.practiceType || '')}</small></td><td><strong>${escaparHtml(registro.estudiante || 'Sin estudiante')}</strong></td><td>${escaparHtml(registro.docente || 'Sin docente')}</td><td>${escaparHtml(registro.asesor || 'Sin asesor')}</td><td><strong>${escaparHtml(registro.fechaCreacion || 'Por definir')}</strong><small>Limite: ${escaparHtml(registro.fechaLimite || 'Por definir')}</small></td><td><em class="estado ${claseEstado}">${escaparHtml(estado)}</em></td><td><button class="accion-tabla editar-registro" type="button" data-tipo="practica" title="Editar"><i class="fa-solid fa-pen"></i></button></td></tr>`;
    }

    return `<tr><td><strong>${nombre}</strong><small>Registro academico</small></td><td>${extra}</td><td>Por asignar</td><td>0</td><td>Por definir</td><td><em class="estado alerta">Nueva</em></td></tr>`;
}

function crearTarjeta(tipo, registro) {
    const icono = tipo === 'asignatura' ? 'fa-book' : 'fa-building-columns';
    const accion = tipo === 'asignatura' ? 'Modificar' : 'Actualizar datos';
    const estado = registro.estado || 'Activa';
    const activa = estado !== 'Inactiva';
    const nombresDocentes = (registro.teachers || []).map(usuario => `${usuario.firstName || ''} ${usuario.lastName || ''}`.trim() || usuario.nombre).filter(Boolean).join(', ') || 'Sin docentes';
    const nombresEstudiantes = (registro.students || []).map(usuario => `${usuario.firstName || ''} ${usuario.lastName || ''}`.trim() || usuario.nombre).filter(Boolean).join(', ') || 'Sin estudiantes';
    const idsDocentes = (registro.teachers || []).map(usuario => usuario._id || usuario.id || usuario).join(',');
    const idsEstudiantes = (registro.students || []).map(usuario => usuario._id || usuario.id || usuario).join(',');
    const descripcion = tipo === 'asignatura'
        ? `Codigo: ${registro.codigo || 'Sin codigo'} · Semestre: ${registro.semestre || 'Sin definir'} · Docentes: ${nombresDocentes} · Estudiantes: ${nombresEstudiantes}`
        : `${registro.direccion || 'Direccion en Bucaramanga'} · Semestres: ${(registro.semestres || []).join(', ') || 'Sin definir'} · ${registro.practica || 'Sin practica'} · ${registro.asesor || 'Sin asesor'}`;
    const datosAsignatura = tipo === 'asignatura'
        ? ` data-codigo="${registro.codigo || ''}" data-semestre="${registro.semestre || ''}" data-teachers="${escaparHtml(idsDocentes)}" data-students="${escaparHtml(idsEstudiantes)}" data-estado="${estado}"`
        : ` data-direccion="${registro.direccion || ''}" data-semestres="${(registro.semestres || []).join(',')}" data-practica="${registro.practica || ''}" data-asesor="${registro.asesor || ''}" data-estado="${estado}"`;
    const idRegistro = registro.id ? ` data-id="${escaparHtml(registro.id)}"` : '';
    return `
        <article${idRegistro}${datosAsignatura}>
            <span class="icono-admin"><i class="fa-solid ${icono}"></i></span>
            <em class="estado ${activa ? 'listo' : 'riesgo'}">${estado}</em>
            <h3>${registro.nombre}</h3>
            <p>${descripcion}</p>
            <footer>
                <button class="enlace-accion editar-tarjeta" type="button" data-tipo="${tipo}">${accion}</button>
                <button class="boton-desactivar" type="button">${activa ? 'Desactivar' : 'Activar'}</button>
            </footer>
        </article>
    `;
}

function agregarRegistroVisual(tipo, registro) {
    const destinosTabla = { practica: 'tabla-practicas-admin' };
    if (destinosTabla[tipo]) {
        const tabla = document.getElementById(destinosTabla[tipo]);
        if (tabla) tabla.insertAdjacentHTML('afterbegin', crearFila(tipo, registro));
        return;
    }

    const destinosTarjeta = { asignatura: 'lista-asignaturas', institucion: 'lista-instituciones' };
    if (destinosTarjeta[tipo]) {
        document.getElementById(destinosTarjeta[tipo]).insertAdjacentHTML('afterbegin', crearTarjeta(tipo, registro));
    }
}

function inferirTipoDesdeElemento(elemento) {
    const vista = elemento.closest('.vista-asesor');
    if (!vista) return 'usuario';
    if (vista.id === 'asignaturas') return 'asignatura';
    if (vista.id === 'instituciones') return 'institucion';
    if (vista.id === 'practicas') return 'practica';
    return 'usuario';
}

function datosDesdeElemento(elemento, tipo) {
    const fila = elemento.closest('tr');
    const tarjeta = elemento.closest('article');
    if (fila) {
        const celdas = fila.querySelectorAll('td');
        if (tipo === 'practica') {
            if (fila.dataset.id) {
                return {
                    id: fila.dataset.id,
                    practiceTypeId: fila.dataset.practiceType,
                    practiceType: fila.dataset.practiceName,
                    institutionId: fila.dataset.institution,
                    estudianteId: fila.dataset.student,
                    docenteId: fila.dataset.teacher,
                    asesorId: fila.dataset.advisor,
                    fechaCreacion: fila.dataset.startDate,
                    fechaLimite: fila.dataset.endDate,
                    estado: fila.dataset.status
                };
            }
            const fechaCelda = celdas[4] || celdas[3];
            const fechaCreacion = fechaCelda?.querySelector('strong')?.textContent.trim() || fechaCelda?.textContent.trim() || '';
            const fechaLimite = (fechaCelda?.querySelector('small')?.textContent || '').replace('Limite:', '').trim() || celdas[4]?.textContent.trim() || '';
            return {
                institucion: celdas[0]?.textContent.trim() || '',
                estudiante: celdas[1]?.querySelector('strong')?.textContent.trim() || celdas[1]?.textContent.trim() || '',
                docente: celdas.length === 7 ? celdas[2]?.textContent.trim() : '',
                asesor: celdas.length === 7 ? celdas[3]?.textContent.trim() : celdas[2]?.textContent.trim() || '',
                fechaCreacion,
                fechaLimite,
                estado: (celdas.length === 7 ? celdas[5] : celdas.length === 6 ? celdas[4] : celdas[5])?.textContent.trim() || 'Disponible'
            };
        }
        return {
            nombre: celdas[0]?.querySelector('strong')?.textContent.trim() || '',
            correo: celdas[0]?.querySelector('small')?.textContent.trim() || celdas[2]?.textContent.trim() || '',
            rol: tipo === 'personal' ? celdas[1]?.textContent.trim() : 'Estudiante',
            extra: tipo === 'estudiante' ? celdas[1]?.textContent.trim() : celdas[3]?.textContent.trim()
        };
    }
    if (tarjeta) {
        const texto = tarjeta.querySelector('p')?.textContent.trim() || '';
        const codigo = tarjeta.dataset.codigo || (texto.match(/Codigo:\s*([^·]+)/)?.[1] || '').trim();
        const semestre = tarjeta.dataset.semestre || (texto.match(/Semestre:\s*(.+)$/)?.[1] || '').trim();
        if (tipo === 'programa') return datosProgramaDesdeTarjeta(tarjeta);
        if (tipo === 'institucion') {
            return {
                nombre: tarjeta.querySelector('h3')?.textContent.trim() || '',
                direccion: tarjeta.dataset.direccion || '',
                semestres: (tarjeta.dataset.semestres || '').split(',').filter(Boolean),
                practica: tarjeta.dataset.practica || '',
                asesor: tarjeta.dataset.asesor || '',
                estado: tarjeta.querySelector('.estado')?.textContent.trim() || tarjeta.dataset.estado || 'Activa'
            };
        }
        if (tipo === 'asignatura') {
            return {
                id: tarjeta.dataset.id,
                nombre: tarjeta.querySelector('h3')?.textContent.trim() || '',
                codigo,
                semestre,
                teachers: (tarjeta.dataset.teachers || '').split(',').filter(Boolean),
                students: (tarjeta.dataset.students || '').split(',').filter(Boolean),
                estado: tarjeta.querySelector('.estado')?.textContent.trim() || 'Activa'
            };
        }
        return {
            nombre: tarjeta.querySelector('h3')?.textContent.trim() || '',
            correo: '',
            rol: 'Estudiante',
            extra: texto,
            codigo,
            semestre,
            estado: tarjeta.querySelector('.estado')?.textContent.trim() || tarjeta.dataset.estado || 'Activa'
        };
    }
    return {};
}

const modalAdmin = document.getElementById('modal-admin');
const modalUsuario = document.getElementById('modal-usuario');
const modalInstitucion = document.getElementById('modal-institucion');
const modalPractica = document.getElementById('modal-practica');
const modalPrograma = document.getElementById('modal-programa');

function configurarSemestrePorRol() {
    const rol = campo('usuario-rol').value;
    const seleccionados = semestresSeleccionados();
    const permiteVarios = rol !== 'Estudiante';
    campo('grupo-semestre-usuario').title = permiteVarios ? 'Puedes seleccionar uno o varios semestres' : 'Solo puedes seleccionar un semestre';
    if (!permiteVarios) {
        seleccionarSemestres(seleccionados[0] || '');
    }
}

function configurarIdentificadorUsuario() {
    const esAdministrador = campo('usuario-rol').value === 'Administrador';
    campo('usuario-correo').required = !esAdministrador;
    campo('usuario-nombre').required = esAdministrador;
    campo('etiqueta-usuario-correo').hidden = esAdministrador;
    campo('etiqueta-usuario-nombre').hidden = !esAdministrador;
    campo('grupo-semestre-usuario').hidden = esAdministrador;
    campo('grupo-programa-usuario').hidden = esAdministrador;
    campo('grupo-asignaturas-usuario').hidden = esAdministrador;
    campo('usuario-programa').required = !esAdministrador;
    campo('usuario-programa').disabled = esAdministrador;
    campo('usuario-asignaturas').required = !esAdministrador;
    campo('usuario-asignaturas').disabled = esAdministrador;
}

function abrirModalUsuario(usuario = null) {
    const editando = Boolean(usuario);
    tipoRegistro = 'usuario';
    elementoEditado = null;
    campo('usuario-subtitulo').textContent = editando ? 'Editar usuario' : 'Nuevo usuario';
    campo('usuario-titulo').textContent = editando ? 'Editar usuario' : 'Crear usuario';
    campo('usuario-primer-nombre').value = usuario?.primerNombre || '';
    campo('usuario-segundo-nombre').value = usuario?.segundoNombre || '';
    campo('usuario-primer-apellido').value = usuario?.primerApellido || '';
    campo('usuario-segundo-apellido').value = usuario?.segundoApellido || '';
    campo('usuario-correo').value = usuario?.correo || '';
    campo('usuario-nombre').value = usuario?.nombreUsuario || '';
    campo('usuario-contrasena').value = '';
    campo('usuario-contrasena').required = !editando;
    campo('usuario-codigo').value = usuario?.codigo || '';
    campo('usuario-rol').value = usuario?.rol || '';
    llenarProgramas(usuario?.programId || '');
    llenarAsignaturas(usuario?.asignaturas || []);
    llenarInstituciones(usuario?.institucion || '', 'usuario-institucion');
    seleccionarSemestres(usuario?.semestre || []);
    campo('usuario-estado').value = usuario ? (usuario.activo ? 'Activo' : 'Inactivo') : '';
    campo('form-usuario').dataset.editar = usuario?.id || '';
    if (!editando) campo('usuario-codigo').value = 'Se asignará al guardar';
    configurarSemestrePorRol();
    configurarIdentificadorUsuario();
    modalUsuario.showModal();
}

function abrirModalPrograma(programa = null) {
    campo('programa-titulo').textContent = programa ? 'Editar programa académico' : 'Registrar programa';
    campo('programa-subtitulo').textContent = programa ? 'Actualizar programa' : 'Nuevo programa académico';
    campo('programa-nombre').value = programa?.nombre || '';
    llenarDirectores(programa?.director || '');
    llenarUsuariosPorRol('programa-docentes', 'Docente', programa?.teachers || []);
    campo('form-programa').dataset.editar = programa?.id || '';
    campo('modal-programa').showModal();
}

function datosProgramaDesdeTarjeta(tarjeta) {
    return {
        id: tarjeta.dataset.id,
        nombre: tarjeta.querySelector('h3')?.textContent.trim() || '',
        director: tarjeta.dataset.director || '',
        teachers: (tarjeta.dataset.teachers || '').split(',').filter(Boolean)
    };
}

function abrirModalInstitucion(elemento = null) {
    tipoRegistro = 'institucion';
    elementoEditado = elemento;
    const datos = elemento ? datosDesdeElemento(elemento, 'institucion') : {};
    const editando = Boolean(elemento);
    campo('institucion-subtitulo').textContent = editando ? 'Editar institucion' : 'Nueva institucion';
    campo('institucion-titulo').textContent = editando ? 'Editar institucion' : 'Registrar institucion';
    campo('institucion-nombre').value = datos.nombre || '';
    campo('institucion-direccion').value = datos.direccion || '';
    seleccionarSemestresInstitucion(datos.semestres || []);
    campo('institucion-practica').value = datos.practica || '';
    llenarOpciones('institucion-asesor', obtenerAsesoresRegistrados(), datos.asesor);
    campo('institucion-estado').value = datos.estado || 'Activa';
    modalInstitucion.showModal();
}

function abrirModalPractica(elemento = null) {
    tipoRegistro = 'practica';
    elementoEditado = elemento;
    const datos = elemento ? datosDesdeElemento(elemento, 'practica') : {};
    const editando = Boolean(elemento);
    campo('practica-subtitulo').textContent = editando ? 'Editar practica' : 'Nueva practica';
    campo('practica-titulo').textContent = editando ? 'Editar practica' : 'Registrar practica';
    llenarTiposPractica();
    llenarInstituciones(datos.institutionId || '', 'practica-institucion');
    llenarUsuariosPorRol('practica-estudiante', 'Estudiante', [datos.estudianteId || '']);
    llenarUsuariosPorRol('practica-docente', 'Docente', [datos.docenteId || '']);
    llenarUsuariosPorRol('practica-asesor', 'Asesor', [datos.asesorId || '']);
    campo('practica-tipo').value = datos.practiceType ||
        tiposPracticaDisponibles.find(tipo => String(tipo._id) === String(datos.practiceTypeId))?.name || '';
    campo('practica-fecha-creacion').value = datos.fechaCreacion || '';
    campo('practica-fecha-limite').value = datos.fechaLimite || '';
    campo('practica-estado').value = datos.estado || 'Disponible';
    modalPractica.showModal();
}

function abrirModal(tipo, usuario, elemento = null) {
    tipoRegistro = tipo;
    elementoEditado = elemento;
    const nombres = {
        usuario: 'usuario',
        estudiante: 'estudiante',
        personal: 'docente o asesor',
        asignatura: 'asignatura'
    };
    const datos = usuario || (elemento ? datosDesdeElemento(elemento, tipo) : {});
    const editando = Boolean(usuario || elemento);

    document.getElementById('modal-subtitulo').textContent = editando ? 'Editar registro' : 'Nuevo registro';
    document.getElementById('modal-titulo').textContent = `${editando ? 'Editar' : 'Crear'} ${nombres[tipo]}`;
    campo('campo-nombre').value = datos.nombre || '';
    campo('campo-codigo').value = datos.codigo || (tipo === 'asignatura' ? generarCodigoAsignatura() : '');
    campo('campo-semestre').value = datos.semestre || '';

    configurarGrupo('grupo-nombre', true, true);
    configurarGrupo('grupo-codigo', false);
    configurarGrupo('grupo-semestre', tipo === 'asignatura', true);
    configurarGrupo('grupo-docentes-asignatura', tipo === 'asignatura');
    configurarGrupo('grupo-estudiantes-asignatura', tipo === 'asignatura');
    configurarGrupo('grupo-estado-registro', tipo === 'asignatura', true);

    if (tipo === 'asignatura') {
        llenarUsuariosPorRol('campo-docentes-asignatura', 'Docente', datos.teachers || []);
        llenarUsuariosPorRol('campo-estudiantes-asignatura', 'Estudiante', datos.students || []);
        actualizarOpcionesEstado(['Activa', 'Inactiva'], datos.estado || 'Activa');
    }

    document.getElementById('form-admin').dataset.editar = usuario ? usuario.id : '';
    modalAdmin.showModal();
}

function actualizarElementoEditado(registro) {
    if (!elementoEditado) return false;
    const fila = elementoEditado.closest('tr');
    const tarjeta = elementoEditado.closest('article');
    if (fila) {
        fila.outerHTML = crearFila(tipoRegistro, registro);
        return true;
    }
    if (tarjeta) {
        tarjeta.outerHTML = crearTarjeta(tipoRegistro, registro);
        return true;
    }
    return false;
}

accesosAdmin.forEach(acceso => acceso.addEventListener('click', () => abrirVistaAdmin(acceso.dataset.vista)));
document.querySelector('.menu-movil').addEventListener('click', () => lateralAdmin.classList.toggle('abierto'));
document.getElementById('buscar-usuario').addEventListener('input', () => {
    clearTimeout(temporizadorBusquedaUsuarios);
    temporizadorBusquedaUsuarios = setTimeout(() => {
        paginaUsuarios = 1;
        renderUsuarios();
    }, 200);
});
document.getElementById('filtro-estado').addEventListener('change', () => {
    paginaUsuarios = 1;
    renderUsuarios();
});
document.getElementById('filtro-rol').addEventListener('change', () => {
    paginaUsuarios = 1;
    renderUsuarios();
});
document.getElementById('filtro-programa').addEventListener('change', () => {
    paginaUsuarios = 1;
    renderUsuarios();
});
document.getElementById('pagina-anterior-usuarios').addEventListener('click', () => {
    paginaUsuarios = Math.max(1, paginaUsuarios - 1);
    renderUsuarios();
});
document.getElementById('pagina-siguiente-usuarios').addEventListener('click', () => {
    paginaUsuarios += 1;
    renderUsuarios();
});
document.getElementById('exportar-usuarios').addEventListener('click', exportarUsuariosCsv);

document.addEventListener('click', evento => {
    const botonEstado = evento.target.closest('.cambiar-estado');
    const botonEditar = evento.target.closest('.editar-usuario');
    const botonEliminar = evento.target.closest('.eliminar-usuario');
    const botonRegistro = evento.target.closest('.editar-registro, .editar-tarjeta');
    const botonTarjeta = evento.target.closest('.tarjetas-admin .enlace-accion');
    const botonAccionTabla = evento.target.closest('.accion-tabla:not(.editar-usuario):not(.cambiar-estado):not(.cerrar-modal):not(.editar-registro)');

    if (botonEstado) {
        const usuario = estadoAdmin.usuarios.find(item => item.id === botonEstado.dataset.id);
        botonEstado.disabled = true;
        solicitarApi(`/api/users/${usuario.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ active: !usuario.activo })
        }).then(() => Promise.all([
            cargarUsuariosDesdeApi(),
            cargarAsignaturasDesdeApi(),
            cargarProgramasDesdeApi()
        ]))
            .then(() => avisoAdmin(`Usuario ${usuario.activo ? 'desactivado' : 'activado'} correctamente.`))
            .catch(error => avisoAdmin(error.message, true))
            .finally(() => { botonEstado.disabled = false; });
        return;
    }

    if (botonEditar) {
        const usuario = estadoAdmin.usuarios.find(item => item.id === botonEditar.dataset.id);
        abrirModalUsuario(usuario);
        return;
    }

    if (botonEliminar) {
        const usuario = estadoAdmin.usuarios.find(item => item.id === botonEliminar.dataset.id);
        if (!usuario || !window.confirm(`¿Eliminar definitivamente a ${usuario.nombre}?`)) return;
        botonEliminar.disabled = true;
        solicitarApi(`/api/users/${usuario.id}`, { method: 'DELETE' })
            .then(async () => {
                await Promise.all([
                    cargarUsuariosDesdeApi(),
                    cargarProgramasDesdeApi(),
                    cargarAsignaturasDesdeApi(),
                    cargarPracticasDesdeApi()
                ]);
                avisoAdmin('Usuario eliminado correctamente.');
            })
            .catch(error => avisoAdmin(error.message, true))
            .finally(() => { botonEliminar.disabled = false; });
        return;
    }

    if (botonRegistro) {
        if (botonRegistro.dataset.tipo === 'practica') {
            abrirModalPractica(botonRegistro);
        } else if (botonRegistro.dataset.tipo === 'programa') {
            abrirModalPrograma(datosProgramaDesdeTarjeta(botonRegistro.closest('article')));
        } else {
            abrirModal(botonRegistro.dataset.tipo, null, botonRegistro);
        }
    } else if (botonTarjeta) {
        const tipo = inferirTipoDesdeElemento(botonTarjeta);
        if (tipo === 'programa') {
            abrirModalPrograma(datosProgramaDesdeTarjeta(botonTarjeta.closest('article')));
        } else if (tipo === 'institucion') {
            abrirModalInstitucion(botonTarjeta);
        } else if (tipo === 'practica') {
            abrirModalPractica(botonTarjeta);
        } else {
            abrirModal(tipo, null, botonTarjeta);
        }
    } else if (botonAccionTabla && botonAccionTabla.closest('.vista-asesor')) {
        const tipo = inferirTipoDesdeElemento(botonAccionTabla);
        if (tipo === 'institucion') {
            abrirModalInstitucion(botonAccionTabla);
        } else if (tipo === 'practica') {
            abrirModalPractica(botonAccionTabla);
        } else {
            abrirModal(tipo, null, botonAccionTabla);
        }
    }

    const botonDesactivar = evento.target.closest('.boton-desactivar');
    if (botonDesactivar) {
        const tarjeta = botonDesactivar.closest('article');
        const etiqueta = tarjeta.querySelector('.estado');
        const activar = ['Inactiva', 'Inactivo'].includes(etiqueta.textContent.trim());
        if (tarjeta.dataset.id && tarjeta.querySelector('.editar-tarjeta')?.dataset.tipo === 'programa') {
            botonDesactivar.disabled = true;
            solicitarApi(`/api/programs/${tarjeta.dataset.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ active: activar })
            }).then(cargarProgramasDesdeApi)
                .then(() => avisoAdmin(`Programa ${activar ? 'activado' : 'desactivado'} correctamente.`))
                .catch(error => avisoAdmin(error.message, true))
                .finally(() => { botonDesactivar.disabled = false; });
            return;
        }
        if (tarjeta.dataset.id && tarjeta.querySelector('.editar-tarjeta')?.dataset.tipo === 'asignatura') {
            botonDesactivar.disabled = true;
            solicitarApi(`/api/subjects/${tarjeta.dataset.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ active: activar })
            }).then(cargarAsignaturasDesdeApi)
                .then(() => avisoAdmin(`Asignatura ${activar ? 'activada' : 'desactivada'} correctamente.`))
                .catch(error => avisoAdmin(error.message, true))
                .finally(() => { botonDesactivar.disabled = false; });
            return;
        }
        if (tarjeta.dataset.id && tarjeta.querySelector('.editar-tarjeta')?.dataset.tipo === 'institucion') {
            botonDesactivar.disabled = true;
            solicitarApi(`/api/institutions/${tarjeta.dataset.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ active: activar })
            }).then(cargarInstitucionesDesdeApi)
                .then(() => avisoAdmin(`Institución ${activar ? 'activada' : 'desactivada'} correctamente.`))
                .catch(error => avisoAdmin(error.message, true))
                .finally(() => { botonDesactivar.disabled = false; });
            return;
        }
        etiqueta.textContent = activar ? 'Activa' : 'Inactiva';
        etiqueta.className = `estado ${activar ? 'listo' : 'riesgo'}`;
        tarjeta.dataset.estado = etiqueta.textContent;
        botonDesactivar.textContent = activar ? 'Desactivar' : 'Activar';
        avisoAdmin(`Registro ${activar ? 'activado' : 'desactivado'} correctamente.`);
    }
});

document.querySelectorAll('[data-abrir-usuario]').forEach(boton => boton.addEventListener('click', () => abrirModalUsuario()));
document.querySelectorAll('[data-abrir-programa]').forEach(boton => boton.addEventListener('click', () => abrirModalPrograma()));
document.querySelectorAll('[data-abrir-institucion]').forEach(boton => boton.addEventListener('click', () => abrirModalInstitucion()));
document.querySelectorAll('[data-abrir-practica]').forEach(boton => boton.addEventListener('click', () => abrirModalPractica()));
document.querySelectorAll('[data-abrir-modal]').forEach(boton => boton.addEventListener('click', () => abrirModal(boton.dataset.abrirModal)));
document.querySelectorAll('.cerrar-modal').forEach(boton => boton.addEventListener('click', () => modalAdmin.close()));
document.querySelectorAll('.cerrar-modal-usuario').forEach(boton => boton.addEventListener('click', () => modalUsuario.close()));
document.querySelectorAll('.cerrar-modal-institucion').forEach(boton => boton.addEventListener('click', () => modalInstitucion.close()));
document.querySelectorAll('.cerrar-modal-practica').forEach(boton => boton.addEventListener('click', () => modalPractica.close()));
document.querySelectorAll('.cerrar-modal-programa').forEach(boton => boton.addEventListener('click', () => modalPrograma.close()));
campo('usuario-rol').addEventListener('change', configurarSemestrePorRol);
campo('usuario-rol').addEventListener('change', configurarIdentificadorUsuario);
document.querySelectorAll('#usuario-semestres input').forEach(casilla => {
    casilla.addEventListener('change', evento => {
        if (campo('usuario-rol').value === 'Estudiante' && evento.target.checked) {
            seleccionarSemestres(evento.target.value);
        }
        configurarSemestrePorRol();
    });
});

campo('form-usuario').addEventListener('submit', evento => {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const idEditar = formulario.dataset.editar || '';
    const correo = campo('usuario-correo').value.trim().toLowerCase();
    const nombreUsuario = campo('usuario-nombre').value.trim().toLowerCase();
    const correoRepetido = estadoAdmin.usuarios.some(usuario => usuario.id !== idEditar && usuario.correo?.toLowerCase() === correo);

    if (correoRepetido) {
        avisoAdmin('Ese correo ya esta registrado.', true);
        return;
    }

    const rol = campo('usuario-rol').value;
    if (rol === 'Administrador' && !/^[a-z0-9._-]{3,40}$/.test(nombreUsuario)) {
        avisoAdmin('El nombre de usuario debe tener de 3 a 40 caracteres, sin @.', true);
        return;
    }
    if (rol !== 'Administrador' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        avisoAdmin('Los usuarios académicos deben tener un correo válido.', true);
        return;
    }
    const asignaturas = rol === 'Administrador' ? [] : Array.from(campo('usuario-asignaturas').selectedOptions).map(opcion => opcion.value);
    if (rol !== 'Administrador' && (!campo('usuario-programa').value || !asignaturas.length)) {
        avisoAdmin('Selecciona un programa académico y al menos una asignatura registrada.', true);
        return;
    }
    const semestres = semestresSeleccionados();
    if (rol === 'Estudiante' && !semestres.length) {
        avisoAdmin('Selecciona el semestre del estudiante.', true);
        return;
    }

    const registro = {
        firstName: campo('usuario-primer-nombre').value.trim(),
        middleName: campo('usuario-segundo-nombre').value.trim(),
        lastName: campo('usuario-primer-apellido').value.trim(),
        secondLastName: campo('usuario-segundo-apellido').value.trim(),
        ...(rol === 'Administrador' ? { username: nombreUsuario } : { email: correo }),
        role: Object.entries(rolesUsuario).find(([, label]) => label === rol)?.[0],
        ...(rol !== 'Administrador' ? {
            programId: campo('usuario-programa').value,
            subjects: asignaturas
        } : {}),
        semester: rol === 'Estudiante' ? Number(semestres[0]) : null,
        active: campo('usuario-estado').value === 'Activo'
    };
    const password = campo('usuario-contrasena').value;
    if (password) registro.password = password;
    if (!idEditar && password.length < 8) {
        avisoAdmin('La contraseña debe tener al menos 8 caracteres.', true);
        return;
    }

    const botonGuardar = evento.currentTarget.querySelector('[type="submit"]');
    botonGuardar.disabled = true;
    solicitarApi(idEditar ? `/api/users/${idEditar}` : '/api/users', {
        method: idEditar ? 'PATCH' : 'POST',
        body: JSON.stringify(registro)
    }).then(() => Promise.all([
        cargarUsuariosDesdeApi(),
        cargarAsignaturasDesdeApi(),
        cargarProgramasDesdeApi()
    ]))
        .then(() => {
            avisoAdmin(idEditar ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.');
            modalUsuario.close();
            formulario.reset();
            delete formulario.dataset.editar;
        })
        .catch(error => avisoAdmin(error.message, true))
        .finally(() => { botonGuardar.disabled = false; });
});

campo('form-institucion').addEventListener('submit', async evento => {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const institutionId = elementoEditado?.closest('article')?.dataset.id || '';
    const data = {
        name: campo('institucion-nombre').value.trim(),
        address: campo('institucion-direccion').value.trim(),
        semesters: semestresInstitucionSeleccionados().map(Number),
        practiceName: campo('institucion-practica').value.trim(),
        advisorName: campo('institucion-asesor').value,
        active: campo('institucion-estado').value === 'Activa'
    };

    if (!/bucaramanga/i.test(data.address)) {
        avisoAdmin('La direccion debe pertenecer a Bucaramanga.', true);
        return;
    }

    if (!data.semesters.length) {
        avisoAdmin('Selecciona al menos un semestre para la institucion.', true);
        return;
    }

    const submit = formulario.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
        await solicitarApi(institutionId ? `/api/institutions/${institutionId}` : '/api/institutions', {
            method: institutionId ? 'PATCH' : 'POST',
            body: JSON.stringify(data)
        });
        await cargarInstitucionesDesdeApi();
        avisoAdmin(institutionId ? 'Institucion actualizada correctamente.' : 'Institucion registrada correctamente.');
        modalInstitucion.close();
        formulario.reset();
        elementoEditado = null;
    } catch (error) {
        avisoAdmin(error.message, true);
    } finally {
        submit.disabled = false;
    }
});

async function obtenerTipoPractica(seleccion) {
    const nombre = seleccion.trim();
    if (!nombre) throw new Error('Escribe el tipo de práctica.');
    const existing = tiposPracticaDisponibles.find(tipo =>
        String(tipo._id) === String(seleccion) || tipo.name.toLocaleLowerCase() === nombre.toLocaleLowerCase()
    );
    if (existing) return existing._id;
    const result = await solicitarApi('/api/practiceTypes', {
        method: 'POST',
        body: JSON.stringify({ name: nombre, active: true })
    });
    tiposPracticaDisponibles.push(result.data);
    llenarTiposPractica();
    return result.data._id;
}

campo('form-practica').addEventListener('submit', async evento => {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const assignmentId = elementoEditado?.closest('tr')?.dataset.id || '';
    const practiceTypeSelection = campo('practica-tipo').value;
    const data = {
        institution: campo('practica-institucion').value,
        student: campo('practica-estudiante').value,
        teacher: campo('practica-docente').value,
        accompanimentResponsible: campo('practica-asesor').value,
        startDate: campo('practica-fecha-creacion').value,
        endDate: campo('practica-fecha-limite').value,
        status: estadoPracticaApi(campo('practica-estado').value)
    };

    if (!practiceTypeSelection.trim() || !data.institution || !data.student || !data.teacher || !data.accompanimentResponsible) {
        avisoAdmin('Escribe el tipo de práctica y selecciona institución, estudiante, docente y asesor.', true);
        return;
    }

    if (data.endDate < data.startDate) {
        avisoAdmin('La fecha limite debe ser posterior a la fecha de creacion.', true);
        return;
    }

    const submit = formulario.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
        data.practiceType = await obtenerTipoPractica(practiceTypeSelection);
        await solicitarApi(assignmentId ? `/api/assignments/${assignmentId}` : '/api/assignments', {
            method: assignmentId ? 'PATCH' : 'POST',
            body: JSON.stringify(data)
        });
        await cargarPracticasDesdeApi();
        avisoAdmin(assignmentId ? 'Practica actualizada correctamente.' : 'Practica registrada correctamente.');
        modalPractica.close();
        formulario.reset();
        elementoEditado = null;
    } catch (error) {
        avisoAdmin(error.message, true);
    } finally {
        submit.disabled = false;
    }
});

document.getElementById('form-admin').addEventListener('submit', async evento => {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const nombre = campo('campo-nombre').value.trim();
    const idEditar = Number(formulario.dataset.editar);
    let registro = { nombre };

    if (tipoRegistro === 'asignatura') {
        const datosActuales = elementoEditado ? datosDesdeElemento(elementoEditado, 'asignatura') : {};
        registro = {
            name: nombre,
            code: datosActuales.codigo || campo('campo-codigo').value.trim() || generarCodigoAsignatura(),
            semester: campo('campo-semestre').value.trim(),
            teachers: valoresSeleccionados(campo('campo-docentes-asignatura')),
            students: valoresSeleccionados(campo('campo-estudiantes-asignatura')),
            active: campo('campo-estado-registro').value === 'Activa'
        };
        const subjectId = datosActuales.id;
        try {
            const result = await solicitarApi(subjectId ? `/api/subjects/${subjectId}` : '/api/subjects', {
                method: subjectId ? 'PATCH' : 'POST',
                body: JSON.stringify(registro)
            });
            await cargarAsignaturasDesdeApi();
            llenarProgramas(campo('usuario-programa').value);
            llenarAsignaturas(Array.from(campo('usuario-asignaturas').selectedOptions).map(option => option.value));
            avisoAdmin(subjectId ? 'Asignatura actualizada correctamente.' : 'Asignatura creada correctamente.');
            modalAdmin.close();
            formulario.reset();
            elementoEditado = null;
            return;
        } catch (error) {
            avisoAdmin(error.message, true);
            return;
        }
    }

    if (actualizarElementoEditado(registro)) {
        avisoAdmin('Registro actualizado correctamente.');
    } else {
        estadoAdmin.registros[tipoRegistro].push(registro);
        agregarRegistroVisual(tipoRegistro, registro);
        avisoAdmin('Registro creado correctamente.');
    }

    modalAdmin.close();
    formulario.reset();
    elementoEditado = null;
});

async function inicializarAdministrador() {
    try {
        await cargarUsuariosDesdeApi();
        await cargarAsignaturasDesdeApi();
        await cargarProgramasDesdeApi();
        await cargarInstitucionesDesdeApi();
        await cargarTiposPracticaDesdeApi();
        await cargarPracticasDesdeApi();
    } catch (error) {
        avisoAdmin(error.message, true);
        ['texto-usuarios', 'texto-asignaturas', 'texto-instituciones', 'texto-practicas'].forEach(id => {
            const etiqueta = document.getElementById(id);
            if (etiqueta?.textContent.startsWith('Cargando')) etiqueta.textContent = 'No se pudo cargar el dato';
        });
    }
}

inicializarAdministrador();
