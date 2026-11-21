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
let paginaUsuarios = 1;
const tamanoPaginaUsuarios = 10;
let consultaUsuariosActiva = 0;
let temporizadorBusquedaUsuarios;
let solicitudesRecuperacion = [];
let contadorSolicitudesAnterior = null;

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
        name: campo('programa-nombre').value.trim()
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
            nombre: asignatura.name,
            semestre: asignatura.semester
        })),
        docentesAsignados: (usuario.assignedTeachers || []).map(docente => ({
            id: docente._id,
            nombre: `${docente.firstName} ${docente.lastName}`,
            activo: docente.active
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
    llenarAsignaturasUsuario(valoresSeleccionados(campo('usuario-asignaturas')));
    llenarAsignacionesEstudiante();
}

function avisoAdmin(mensaje, esError = false) {
    notificacionAdmin.querySelector('span').textContent = mensaje;
    notificacionAdmin.classList.toggle('error', esError);
    notificacionAdmin.querySelector('i').className = `fa-solid ${esError ? 'fa-circle-exclamation' : 'fa-circle-check'}`;
    notificacionAdmin.classList.add('visible');
    clearTimeout(temporizadorAdmin);
    temporizadorAdmin = setTimeout(() => notificacionAdmin.classList.remove('visible'), 3200);
}

function actualizarContadorSolicitudes(cantidad) {
    const contador = document.querySelector('.contador-notificaciones');
    if (!contador) return;
    contador.textContent = String(cantidad);
    contador.hidden = cantidad < 1;
}

function renderSolicitudesRecuperacion() {
    const lista = campo('lista-notificaciones-admin');
    if (!lista) return;
    const pendientes = solicitudesRecuperacion.filter(solicitud => solicitud.status === 'pendiente');
    if (!pendientes.length) {
        lista.innerHTML = '<p class="vacio-notificaciones-admin">No tienes notificaciones nuevas.</p>';
        return;
    }
    const tipos = { usuario: 'Olvidó usuario', contrasena: 'Olvidó contraseña', ambos: 'Olvidó usuario y contraseña' };
    lista.innerHTML = pendientes.map(solicitud => {
        const fecha = new Date(solicitud.createdAt);
        const fechaTexto = Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleString('es-CO');
        const accion = solicitud.requestType === 'usuario'
            ? `<button class="boton-principal" type="button" data-notification-action data-identificar-solicitud="${escaparHtml(solicitud._id)}">Identificar usuario</button>`
            : `<button class="boton-principal" type="button" data-notification-action data-restablecer-solicitud="${escaparHtml(solicitud._id)}">Restablecer contraseña</button>`;
        return `<article class="notificacion-solicitud-admin"><div class="notificacion-solicitud-icono"><i class="fa-solid fa-key"></i></div><div class="notificacion-solicitud-contenido"><strong>${escaparHtml(solicitud.fullName)}</strong><p>${escaparHtml(tipos[solicitud.requestType] || 'Solicitud de acceso')}</p><small>${escaparHtml(solicitud.contactEmail)} · ${escaparHtml(fechaTexto)}</small><div class="acciones-solicitud">${accion}<button class="boton-secundario-admin" type="button" data-notification-action data-descartar-solicitud="${escaparHtml(solicitud._id)}">Descartar</button></div></div></article>`;
    }).join('');
}
async function cargarSolicitudesRecuperacion() {
    const result = await solicitarApi('/api/admin/recovery-requests');
    const cantidadAnterior = contadorSolicitudesAnterior;
    solicitudesRecuperacion = result.data;
    actualizarContadorSolicitudes(result.pendingCount);
    renderSolicitudesRecuperacion();
    if (cantidadAnterior !== null && result.pendingCount > cantidadAnterior) {
        const nuevas = result.pendingCount - cantidadAnterior;
        avisoAdmin(nuevas === 1
            ? 'Llegó una nueva solicitud de acceso.'
            : `Llegaron ${nuevas} nuevas solicitudes de acceso.`);
    }
    contadorSolicitudesAnterior = result.pendingCount;
    return result.pendingCount;
}

const botonNotificacionesAdmin = document.querySelector('.boton-notificaciones');
const panelNotificacionesAdmin = campo('panel-notificaciones-admin');

function cerrarPanelNotificacionesAdmin() {
    panelNotificacionesAdmin.hidden = true;
    botonNotificacionesAdmin?.setAttribute('aria-expanded', 'false');
}

botonNotificacionesAdmin?.addEventListener('click', async () => {
    if (!panelNotificacionesAdmin.hidden) {
        cerrarPanelNotificacionesAdmin();
        return;
    }
    panelNotificacionesAdmin.hidden = false;
    botonNotificacionesAdmin.setAttribute('aria-expanded', 'true');
    try {
        await cargarSolicitudesRecuperacion();
    } catch (error) {
        avisoAdmin(error.message, true);
    }
});

panelNotificacionesAdmin?.querySelector('.cerrar-notificaciones-admin')?.addEventListener('click', cerrarPanelNotificacionesAdmin);
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
    if (!grupo) return;
    grupo.hidden = !visible;
    if (control) control.required = visible && requerido;
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
        const directors = programa.directors?.length
            ? programa.directors
            : (programa.director ? [programa.director] : []);
        const directorNames = directors.length
            ? directors.map(director => `${director.firstName} ${director.lastName}`).join(', ')
            : 'Sin director asignado';
        return `<article data-id="${escaparHtml(programa._id)}" data-director="${escaparHtml(directors[0]?._id || '')}" data-estado="${programa.active ? 'Activo' : 'Inactivo'}"><span class="icono-admin"><i class="fa-solid fa-graduation-cap"></i></span><em class="estado ${programa.active ? 'listo' : 'riesgo'}">${programa.active ? 'Activo' : 'Inactivo'}</em><h3>${escaparHtml(programa.name)}</h3><p>Directores: ${escaparHtml(directorNames)}</p><footer><button class="enlace-accion editar-tarjeta" type="button" data-tipo="programa">Editar</button><button class="boton-desactivar" type="button">${programa.active ? 'Desactivar' : 'Activar'}</button></footer></article>`;
    }).join('') || '<p class="vacio-admin">Aún no hay programas académicos registrados.</p>';
    llenarProgramas(campo('usuario-programa')?.value || '');
    llenarAsignacionesEstudiante();
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
        estado: asignatura.active ? 'Activa' : 'Inactiva'
    })).join('') || '<p class="vacio-admin">Aun no hay asignaturas registradas.</p>';
    actualizarResumenAdministrador();
    llenarAsignaturasUsuario(valoresSeleccionados(campo('usuario-asignaturas')));
    llenarAsignacionesEstudiante();
}

async function cargarInstitucionesDesdeApi() {
    const result = await solicitarApi('/api/institutions');
    institucionesDisponibles = result.data;
    campo('lista-instituciones').innerHTML = institucionesDisponibles.map(institucion => crearTarjeta('institucion', {
        id: institucion._id,
        nombre: escaparHtml(institucion.name),
        direccion: escaparHtml(institucion.address || ''),
        semestres: institucion.semesters || [],
        estado: institucion.active ? 'Activa' : 'Inactiva'
    })).join('') || '<p class="vacio-admin">Aún no hay instituciones registradas.</p>';
    actualizarResumenAdministrador();
}

function llenarProgramas(seleccionada = '', selectorId = 'usuario-programa') {
    const selector = campo(selectorId);
    if (!selector) return;
    selector.replaceChildren(new Option('Selecciona un programa registrado', ''));
    programasDisponibles.filter(programa => programa.active).forEach(programa => {
        selector.add(new Option(programa.name, programa._id, false, String(programa._id) === String(seleccionada)));
    });
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
    if (!selector) return [];
    if (selector.matches('.lista-seleccion-asignatura')) {
        return Array.from(selector.querySelectorAll('input[type="checkbox"]:checked'), checkbox => checkbox.value);
    }
    return Array.from(selector.selectedOptions, opcion => opcion.value).filter(Boolean);
}

function llenarAsignaturasUsuario(seleccionadas = []) {
    const grupo = campo('grupo-asignaturas-usuario');
    const selector = campo('usuario-asignaturas');
    if (!grupo || !selector) return;
    const rol = campo('usuario-rol').value;
    const puedeAsignarAsignaturas = ['Docente', 'Estudiante'].includes(rol);
    grupo.hidden = !puedeAsignarAsignaturas;
    if (!puedeAsignarAsignaturas) {
        selector.replaceChildren();
        return;
    }

    const semestre = rol === 'Estudiante' ? semestresSeleccionados()[0] || '' : '';
    const ids = new Set((Array.isArray(seleccionadas) ? seleccionadas : [seleccionadas]).map(String));
    if (rol === 'Estudiante' && !semestre) {
        selector.replaceChildren(new Option('Selecciona primero el semestre', '', true, true));
        selector.options[0].disabled = true;
        campo('ayuda-asignaturas-usuario').textContent = 'Selecciona el semestre para mostrar las asignaturas disponibles.';
        return;
    }

    const disponibles = asignaturasDisponibles.filter(asignatura =>
        (rol === 'Docente' || String(asignatura.semester) === String(semestre)) &&
        (asignatura.active || ids.has(String(asignatura._id)))
    );
    if (!disponibles.length) {
        selector.replaceChildren(new Option(
            rol === 'Docente' ? 'No hay asignaturas activas' : `No hay asignaturas del semestre ${semestre}`,
            '',
            true,
            true
        ));
        selector.options[0].disabled = true;
    } else {
        selector.replaceChildren(...disponibles.map(asignatura =>
            new Option(
                rol === 'Docente' ? `${asignatura.name} · Semestre ${asignatura.semester}` : asignatura.name,
                asignatura._id,
                false,
                ids.has(String(asignatura._id))
            )
        ));
    }
    campo('ayuda-asignaturas-usuario').textContent = rol === 'Docente'
        ? 'El Docente puede tener asignaturas de uno o varios semestres.'
        : `Selecciona asignaturas activas del semestre ${semestre}.`;
}

function llenarAsignacionesEstudiante(docentesSeleccionados) {
    const grupoDocentes = campo('grupo-docentes-estudiante');
    if (!grupoDocentes) return;
    const esEstudiante = campo('usuario-rol').value === 'Estudiante';
    grupoDocentes.hidden = !esEstudiante;
    campo('usuario-docentes').required = esEstudiante;
    if (!esEstudiante) {
        campo('usuario-docentes').replaceChildren();
        return;
    }

    const teacherIds = new Set((docentesSeleccionados || valoresSeleccionados(campo('usuario-docentes'))).map(String));
    const semester = semestresSeleccionados()[0] || '';
    const teachers = estadoAdmin.usuarios.filter(user =>
        user.rol === 'Docente' &&
        user.activo &&
        user.asignaturas.some(subject => String(subject.semestre) === String(semester))
    );
    campo('usuario-docentes').replaceChildren(...(
        teachers.length
            ? teachers.map(teacher => new Option(teacher.nombre, teacher.id, false, teacherIds.has(String(teacher.id))))
            : [new Option(semester ? `No hay docentes activos con asignaturas del semestre ${semester}` : 'Selecciona primero el semestre', '')]
    ));
    if (!teachers.length) campo('usuario-docentes').options[0].disabled = true;
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
    const semestre = campo('institucion-semestre').value;
    return semestre ? [semestre] : [];
}

function seleccionarSemestresInstitucion(valores) {
    const lista = Array.isArray(valores) ? valores : [valores].filter(Boolean);
    campo('institucion-semestre').value = lista.length ? String(lista[0]) : '';
}

function actualizarResumenAdministrador() {
    const usuariosActivos = estadoAdmin.usuarios.filter(usuario => usuario.activo).length;
    const totalUsuarios = estadoAdmin.usuarios.length;
    const asignaturasActivas = asignaturasDisponibles.filter(asignatura => asignatura.active).length;
    const institucionesActivas = institucionesDisponibles.filter(institucion => institucion.active).length;
    document.getElementById('dato-usuarios').textContent = usuariosActivos;
    document.getElementById('dato-asignaturas').textContent = asignaturasActivas;
    document.getElementById('dato-instituciones').textContent = institucionesActivas;
    document.getElementById('porcentaje-usuarios').textContent = totalUsuarios
        ? `${Math.round((usuariosActivos / totalUsuarios) * 100)}%`
        : '0%';
    document.getElementById('texto-usuarios').textContent = usuariosActivos ? 'Usuarios activos' : 'Sin usuarios activos';
    document.getElementById('texto-asignaturas').textContent = asignaturasActivas ? 'Asignaturas activas' : 'Sin asignaturas activas';
    document.getElementById('texto-instituciones').textContent = institucionesActivas ? 'Instituciones activas' : 'Sin instituciones activas';
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
            <td><strong>${escaparHtml(usuario.nombre)}</strong><small>${escaparHtml(usuario.programa || '')}${usuario.asignaturas?.length ? ` · ${escaparHtml(usuario.asignaturas.map(asignatura => `${asignatura.nombre} (${asignatura.semestre})`).join(', '))}` : ''}${usuario.docentesAsignados?.length ? ` · Docentes: ${escaparHtml(usuario.docentesAsignados.map(docente => docente.nombre).join(', '))}` : ''}</small></td>
            <td>${escaparHtml(usuario.correo || 'Sin correo')}</td>
            <td>${escaparHtml(usuario.codigo || 'Sin código')}</td>
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
            ['Nombre', 'Correo o usuario', 'Código', 'Rol', 'Programa', 'Asignaturas', 'Docentes asignados', 'Semestre', 'Estado'],
            ...usuarios.map(usuario => [
                usuario.nombre,
                usuario.correo || usuario.nombreUsuario,
                usuario.codigo,
                usuario.rol,
                usuario.programa,
                (usuario.asignaturas || []).map(asignatura => asignatura.nombre).join('; '),
                (usuario.docentesAsignados || []).map(docente => docente.nombre).join('; '),
                (usuario.semestre || []).join('; '),
                usuario.activo ? 'Activo' : 'Inactivo'
            ])
        ];
        const csv = '\uFEFFsep=;\r\n' + filas.map(fila => fila
            .map(valor => `"${String(protegerFormula(valor) ?? '').replace(/"/g, '""')}"`)
            .join(';'))
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

    return `<tr><td><strong>${nombre}</strong><small>Registro academico</small></td><td>${extra}</td><td>Por asignar</td><td>0</td><td>Por definir</td><td><em class="estado alerta">Nueva</em></td></tr>`;
}

function crearTarjeta(tipo, registro) {
    const icono = tipo === 'asignatura' ? 'fa-book' : 'fa-building-columns';
    const accion = tipo === 'asignatura' ? 'Modificar' : 'Actualizar datos';
    const estado = registro.estado || 'Activa';
    const activa = estado !== 'Inactiva';
    const descripcion = tipo === 'asignatura'
        ? `Semestre: ${registro.semestre || 'Sin definir'}`
        : `${registro.direccion || 'Dirección pendiente'} · Semestre: ${(registro.semestres || []).join(', ') || 'Sin definir'}`;
    const datosTarjeta = tipo === 'asignatura'
        ? ` data-codigo="${registro.codigo || ''}" data-semestre="${registro.semestre || ''}" data-estado="${estado}"`
        : ` data-direccion="${registro.direccion || ''}" data-semestres="${(registro.semestres || []).join(',')}" data-estado="${estado}"`;
    const idRegistro = registro.id ? ` data-id="${escaparHtml(registro.id)}"` : '';
    return `
        <article${idRegistro}${datosTarjeta}>
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
    return 'usuario';
}

function datosDesdeElemento(elemento, tipo) {
    const fila = elemento.closest('tr');
    const tarjeta = elemento.closest('article');
    if (fila) {
        const celdas = fila.querySelectorAll('td');
        return {
            nombre: celdas[0]?.querySelector('strong')?.textContent.trim() || '',
            correo: celdas[0]?.querySelector('small')?.textContent.trim() || celdas[2]?.textContent.trim() || '',
            rol: tipo === 'personal' ? celdas[1]?.textContent.trim() : 'Estudiante',
            extra: tipo === 'estudiante' ? celdas[1]?.textContent.trim() : celdas[3]?.textContent.trim()
        };
    }
    if (tarjeta) {
        const texto = tarjeta.querySelector('p')?.textContent.trim() || '';
        const codigo = tarjeta.dataset.codigo || (texto.match(/C[oó]digo:\s*([^·]+)/i)?.[1] || '').trim();
        const semestre = tarjeta.dataset.semestre || (texto.match(/Semestre:\s*(.+)$/)?.[1] || '').trim();
        if (tipo === 'programa') return datosProgramaDesdeTarjeta(tarjeta);
        if (tipo === 'institucion') {
            return {
                nombre: tarjeta.querySelector('h3')?.textContent.trim() || '',
                direccion: tarjeta.dataset.direccion || '',
                semestres: (tarjeta.dataset.semestres || '').split(',').filter(Boolean),
                estado: tarjeta.querySelector('.estado')?.textContent.trim() || tarjeta.dataset.estado || 'Activa'
            };
        }
        if (tipo === 'asignatura') {
            return {
                id: tarjeta.dataset.id,
                nombre: tarjeta.querySelector('h3')?.textContent.trim() || '',
                codigo,
                semestre,
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
const modalPrograma = document.getElementById('modal-programa');

function configurarSemestrePorRol() {
    const rol = campo('usuario-rol').value;
    const seleccionados = semestresSeleccionados();
    const permiteVarios = !['Estudiante', 'Director'].includes(rol);
    campo('grupo-semestre-usuario').title = permiteVarios ? 'Puedes seleccionar uno o varios semestres' : 'Solo puedes seleccionar un semestre';
    if (!permiteVarios) {
        seleccionarSemestres(seleccionados[0] || '');
    }
}

function configurarIdentificadorUsuario() {
    const esAdministrador = campo('usuario-rol').value === 'Administrador';
    const rol = campo('usuario-rol').value;
    const usaPrograma = ['Estudiante', 'Director'].includes(rol);
    const usaSemestre = ['Estudiante', 'Director'].includes(rol);
    campo('usuario-correo').required = !esAdministrador;
    campo('usuario-nombre').required = esAdministrador;
    campo('etiqueta-usuario-correo').hidden = esAdministrador;
    campo('etiqueta-usuario-nombre').hidden = !esAdministrador;
    campo('grupo-semestre-usuario').hidden = !usaSemestre;
    campo('grupo-programa-usuario').hidden = !usaPrograma;
    campo('usuario-programa').required = usaPrograma;
    campo('usuario-programa').disabled = !usaPrograma;
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
    seleccionarSemestres(usuario?.semestre || []);
    campo('usuario-estado').value = usuario ? (usuario.activo ? 'Activo' : 'Inactivo') : 'Activo';
    campo('form-usuario').dataset.editar = usuario?.id || '';
    if (!editando) campo('usuario-codigo').value = 'Se asignará al guardar';
    configurarSemestrePorRol();
    configurarIdentificadorUsuario();
    llenarAsignaturasUsuario((usuario?.asignaturas || []).map(asignatura => asignatura.id));
    llenarAsignacionesEstudiante((usuario?.docentesAsignados || []).map(docente => docente.id));
    modalUsuario.showModal();
}

function abrirModalPrograma(programa = null) {
    campo('programa-titulo').textContent = programa ? 'Editar programa académico' : 'Registrar programa';
    campo('programa-nombre').value = programa?.nombre || '';
    campo('form-programa').dataset.editar = programa?.id || '';
    campo('modal-programa').showModal();
}

function datosProgramaDesdeTarjeta(tarjeta) {
    return {
        id: tarjeta.dataset.id,
        nombre: tarjeta.querySelector('h3')?.textContent.trim() || '',
        director: tarjeta.dataset.director || ''
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
    modalInstitucion.showModal();
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
    configurarGrupo('grupo-semestre', tipo === 'asignatura', true);

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
const modalRestablecerRecuperacion = campo('modal-restablecer-recuperacion');
const formularioRestablecerRecuperacion = campo('form-restablecer-recuperacion');
const modalIdentificarUsuario = campo('modal-identificar-usuario');
const formularioIdentificarUsuario = campo('form-identificar-usuario');

campo('lista-notificaciones-admin')?.addEventListener('click', async evento => {
    const botonRestablecer = evento.target.closest('[data-restablecer-solicitud]');
    const botonIdentificar = evento.target.closest('[data-identificar-solicitud]');
    const botonDescartar = evento.target.closest('[data-descartar-solicitud]');
    if (botonRestablecer) {
        const solicitud = solicitudesRecuperacion.find(item => item._id === botonRestablecer.dataset.restablecerSolicitud);
        if (!solicitud) return;
        formularioRestablecerRecuperacion.dataset.solicitudId = solicitud._id;
        campo('cuenta-restablecer-recuperacion').value = solicitud.accountIdentifier || solicitud.contactEmail || '';
        campo('nueva-contrasena-recuperacion').value = '';
        campo('confirmar-contrasena-recuperacion').value = '';
        campo('resumen-solicitud-recuperacion').textContent =
            `${solicitud.fullName} · ${solicitud.contactEmail}. Verifica su identidad antes de continuar.`;
        cerrarPanelNotificacionesAdmin();
        modalRestablecerRecuperacion.showModal();
        return;
    }

    if (botonIdentificar) {
        const solicitud = solicitudesRecuperacion.find(item => item._id === botonIdentificar.dataset.identificarSolicitud);
        if (!solicitud) return;
        formularioIdentificarUsuario.dataset.solicitudId = solicitud._id;
        campo('cuenta-identificar-usuario').value = solicitud.accountIdentifier || solicitud.contactEmail || '';
        campo('resumen-identificar-usuario').textContent =
            `${solicitud.fullName} · ${solicitud.contactEmail}. Verifica su identidad antes de continuar.`;
        cerrarPanelNotificacionesAdmin();
        modalIdentificarUsuario.showModal();
        return;
    }

    if (botonDescartar) {
        if (!window.confirm('¿Descartar esta solicitud de recuperación?')) return;
        botonDescartar.disabled = true;
        try {
            await solicitarApi(`/api/admin/recovery-requests/${botonDescartar.dataset.descartarSolicitud}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: 'descartada' })
            });
            await cargarSolicitudesRecuperacion();
            avisoAdmin('Solicitud descartada.');
        } catch (error) {
            avisoAdmin(error.message, true);
        } finally {
            botonDescartar.disabled = false;
        }
    }
});

document.querySelectorAll('[data-cerrar-restablecer]').forEach(boton => {
    boton.addEventListener('click', () => modalRestablecerRecuperacion.close());
});

document.querySelectorAll('[data-cerrar-identificar]').forEach(boton => {
    boton.addEventListener('click', () => modalIdentificarUsuario.close());
});

formularioIdentificarUsuario?.addEventListener('submit', async evento => {
    evento.preventDefault();
    const submit = formularioIdentificarUsuario.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
        const result = await solicitarApi(
            `/api/admin/recovery-requests/${formularioIdentificarUsuario.dataset.solicitudId}/identify-username`,
            {
                method: 'POST',
                body: JSON.stringify({ identifier: campo('cuenta-identificar-usuario').value.trim() })
            }
        );
        const identifier = result.data.targetUser.username || result.data.targetUser.email;
        modalIdentificarUsuario.close();
        formularioIdentificarUsuario.reset();
        delete formularioIdentificarUsuario.dataset.solicitudId;
        await cargarSolicitudesRecuperacion();
        avisoAdmin(`Cuenta identificada: ${identifier}. Comunica el usuario por un canal verificado.`);
    } catch (error) {
        avisoAdmin(error.message, true);
    } finally {
        submit.disabled = false;
    }
});

formularioRestablecerRecuperacion?.addEventListener('submit', async evento => {
    evento.preventDefault();
    const identifier = campo('cuenta-restablecer-recuperacion').value.trim();
    const password = campo('nueva-contrasena-recuperacion').value;
    const confirmation = campo('confirmar-contrasena-recuperacion').value;
    if (password.length < 1 || password.length > 10) {
        avisoAdmin('La contraseña debe tener entre 1 y 10 caracteres.', true);
        return;
    }
    if (password !== confirmation) {
        avisoAdmin('Las contraseñas no coinciden.', true);
        return;
    }

    const submit = formularioRestablecerRecuperacion.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
        await solicitarApi(`/api/admin/recovery-requests/${formularioRestablecerRecuperacion.dataset.solicitudId}/reset`, {
            method: 'POST',
            body: JSON.stringify({ identifier, password })
        });
        modalRestablecerRecuperacion.close();
        formularioRestablecerRecuperacion.reset();
        delete formularioRestablecerRecuperacion.dataset.solicitudId;
        await Promise.all([cargarSolicitudesRecuperacion(), cargarUsuariosDesdeApi()]);
        avisoAdmin('Contraseña restablecida. Comunica el acceso a la persona por un canal verificado.');
    } catch (error) {
        avisoAdmin(error.message, true);
    } finally {
        submit.disabled = false;
    }
});

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
                    cargarAsignaturasDesdeApi()
                ]);
                avisoAdmin('Usuario eliminado correctamente.');
            })
            .catch(error => avisoAdmin(error.message, true))
            .finally(() => { botonEliminar.disabled = false; });
        return;
    }

    if (botonRegistro) {
        if (botonRegistro.dataset.tipo === 'programa') {
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
        } else {
            abrirModal(tipo, null, botonTarjeta);
        }
    } else if (botonAccionTabla && botonAccionTabla.closest('.vista-asesor')) {
        const tipo = inferirTipoDesdeElemento(botonAccionTabla);
        if (tipo === 'institucion') {
            abrirModalInstitucion(botonAccionTabla);
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
document.querySelectorAll('[data-abrir-modal]').forEach(boton => boton.addEventListener('click', () => abrirModal(boton.dataset.abrirModal)));
document.querySelectorAll('.cerrar-modal').forEach(boton => boton.addEventListener('click', () => modalAdmin.close()));
document.querySelectorAll('.cerrar-modal-usuario').forEach(boton => boton.addEventListener('click', () => modalUsuario.close()));
document.querySelectorAll('.cerrar-modal-institucion').forEach(boton => boton.addEventListener('click', () => modalInstitucion.close()));
document.querySelectorAll('.cerrar-modal-programa').forEach(boton => boton.addEventListener('click', () => modalPrograma.close()));
campo('usuario-rol').addEventListener('change', configurarSemestrePorRol);
campo('usuario-rol').addEventListener('change', configurarIdentificadorUsuario);
campo('usuario-rol').addEventListener('change', () => llenarAsignaturasUsuario([]));
campo('usuario-rol').addEventListener('change', () => llenarAsignacionesEstudiante([]));
campo('usuario-programa').addEventListener('change', () => llenarAsignacionesEstudiante());
document.querySelectorAll('#usuario-semestres input').forEach(casilla => {
    casilla.addEventListener('change', evento => {
        if (campo('usuario-rol').value === 'Estudiante' && evento.target.checked) {
            seleccionarSemestres(evento.target.value);
        }
        configurarSemestrePorRol();
        llenarAsignaturasUsuario(valoresSeleccionados(campo('usuario-asignaturas')));
        llenarAsignacionesEstudiante();
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
    if (['Director', 'Estudiante'].includes(rol) && !campo('usuario-programa').value) {
        avisoAdmin('Selecciona un programa académico.', true);
        return;
    }
    const semestres = semestresSeleccionados();
    if (['Estudiante', 'Director'].includes(rol) && !semestres.length) {
        avisoAdmin(`Selecciona el semestre del ${rol.toLowerCase()}.`, true);
        return;
    }
    const subjects = valoresSeleccionados(campo('usuario-asignaturas'));
    if (rol === 'Estudiante' && !subjects.length) {
        avisoAdmin('Asigna al menos una asignatura del mismo semestre al estudiante.', true);
        return;
    }
    const assignedTeachers = rol === 'Estudiante' ? valoresSeleccionados(campo('usuario-docentes')) : [];
    if (rol === 'Estudiante' && !assignedTeachers.length) {
        avisoAdmin('Asigna al menos un docente con asignaturas del mismo semestre.', true);
        return;
    }

    const registro = {
        firstName: campo('usuario-primer-nombre').value.trim(),
        middleName: campo('usuario-segundo-nombre').value.trim(),
        lastName: campo('usuario-primer-apellido').value.trim(),
        secondLastName: campo('usuario-segundo-apellido').value.trim(),
        ...(rol === 'Administrador' ? { username: nombreUsuario } : { email: correo }),
        role: Object.entries(rolesUsuario).find(([, label]) => label === rol)?.[0],
        ...(['Director', 'Estudiante'].includes(rol) ? {
            programId: campo('usuario-programa').value,
        } : {}),
        semester: ['Estudiante', 'Director'].includes(rol) ? Number(semestres[0]) : null,
        ...(['Docente', 'Estudiante'].includes(rol) ? { subjects } : {}),
        ...(rol === 'Estudiante' ? { assignedTeachers } : {}),
        active: campo('usuario-estado').value === 'Activo'
    };
    const password = campo('usuario-contrasena').value;
    if (password) registro.password = password;
    if ((!idEditar || password) && (password.length < 1 || password.length > 10)) {
        avisoAdmin('La contraseña debe tener entre 1 y 10 caracteres.', true);
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
        semesters: semestresInstitucionSeleccionados().map(Number)
    };

    if (!/bucaramanga/i.test(data.address)) {
        avisoAdmin('Escribe una dirección ubicada en Bucaramanga.', true);
        return;
    }

    if (!data.semesters.length) {
        avisoAdmin('Selecciona el semestre 8, 9 o 10 para la institución.', true);
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
        avisoAdmin(institutionId ? 'Institución actualizada correctamente.' : 'Institución registrada correctamente.');
        modalInstitucion.close();
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
            semester: Number(campo('campo-semestre').value)
        };
        const subjectId = datosActuales.id;
        try {
            const result = await solicitarApi(subjectId ? `/api/subjects/${subjectId}` : '/api/subjects', {
                method: subjectId ? 'PATCH' : 'POST',
                body: JSON.stringify(registro)
            });
            await cargarAsignaturasDesdeApi();
            llenarProgramas(campo('usuario-programa').value);
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
    } catch (error) {
        avisoAdmin(error.message, true);
        ['texto-usuarios', 'texto-asignaturas', 'texto-instituciones', 'texto-practicas'].forEach(id => {
            const etiqueta = document.getElementById(id);
            if (etiqueta?.textContent.startsWith('Cargando')) etiqueta.textContent = 'No se pudo cargar el dato';
        });
    }
    try {
        await cargarSolicitudesRecuperacion();
    } catch (error) {
        avisoAdmin(error.message, true);
    }
}

inicializarAdministrador();
window.setInterval(() => {
    if (document.visibilityState === 'visible') {
        cargarSolicitudesRecuperacion().catch(error => console.error('No se pudieron consultar solicitudes de recuperación:', error));
    }
}, 30000);
