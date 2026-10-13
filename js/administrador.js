const vistasAdmin = document.querySelectorAll('.vista-asesor');
const accesosAdmin = document.querySelectorAll('[data-vista]');
const lateralAdmin = document.querySelector('.menu-lateral-asesor');
const notificacionAdmin = document.getElementById('notificacion');
const claveAdmin = 'rutaPraxis.administrador';
let temporizadorAdmin;
let tipoRegistro = 'usuario';
let elementoEditado = null;

const estadoInicial = {
    usuarios: [
        { id: 1, nombre: 'Mariana Vega', correo: 'mariana.vega@udi.edu.co', codigo: 'UDI-001', rol: 'Estudiante', asignatura: 'Seminario de practica pedagogica', institucion: 'I.E. La Esperanza', semestre: ['7'], activo: true },
        { id: 2, nombre: 'Daniela Lopez', correo: 'daniela.lopez@udi.edu.co', codigo: 'UDI-002', rol: 'Estudiante', asignatura: 'Didactica y evaluacion', institucion: 'Col. Nuevo Horizonte', semestre: ['7'], activo: true },
        { id: 3, nombre: 'Juan Carlos Perez', correo: 'juan.perez@udi.edu.co', codigo: 'UDI-003', rol: 'Docente', asignatura: 'Seminario de practica pedagogica', institucion: 'I.E. La Esperanza', semestre: ['6', '7'], activo: true },
        { id: 4, nombre: 'Laura Martinez', correo: 'laura.martinez@udi.edu.co', codigo: 'UDI-004', rol: 'Docente asesor', asignatura: 'Didactica y evaluacion', institucion: 'Col. Nuevo Horizonte', semestre: ['6', '7'], activo: true },
        { id: 5, nombre: 'Carlos Rodriguez', correo: 'carlos.rodriguez@udi.edu.co', codigo: 'UDI-005', rol: 'Director del programa', asignatura: 'Seminario de practica pedagogica', institucion: 'I.E. La Esperanza', semestre: ['6', '7', '8'], activo: true },
        { id: 6, nombre: 'Sofia Herrera', correo: 'sofia.herrera@udi.edu.co', codigo: 'UDI-006', rol: 'Director del programa', asignatura: 'Didactica y evaluacion', institucion: 'Col. Nuevo Horizonte', semestre: ['7', '8'], activo: true }
    ],
    registros: { estudiante: [], personal: [], asignatura: [], institucion: [], practica: [] }
};

const estadoAdmin = JSON.parse(localStorage.getItem(claveAdmin) || JSON.stringify(estadoInicial));
estadoAdmin.usuarios = estadoAdmin.usuarios || estadoInicial.usuarios;
estadoInicial.usuarios.forEach(usuarioBase => {
    if (!estadoAdmin.usuarios.some(usuario => usuario.id === usuarioBase.id || usuario.nombre === usuarioBase.nombre)) {
        estadoAdmin.usuarios.push(usuarioBase);
    }
});
estadoAdmin.registros = estadoAdmin.registros || { estudiante: [], personal: [], asignatura: [], institucion: [], practica: [] };
['estudiante', 'personal', 'asignatura', 'institucion', 'practica'].forEach(tipo => {
    estadoAdmin.registros[tipo] = estadoAdmin.registros[tipo] || [];
});

function normalizarUsuariosGuardados() {
    const asignaturasBase = ['Seminario de practica pedagogica', 'Didactica y evaluacion'];
    const institucionesBase = ['I.E. La Esperanza', 'Col. Nuevo Horizonte'];
    estadoAdmin.usuarios.forEach((usuario, indice) => {
        const partesNombre = (usuario.nombre || '').split(' ').filter(Boolean);
        usuario.primerNombre = usuario.primerNombre || partesNombre[0] || '';
        usuario.segundoNombre = usuario.segundoNombre || (partesNombre.length > 3 ? partesNombre[1] : '');
        usuario.primerApellido = usuario.primerApellido || (partesNombre.length > 3 ? partesNombre[2] : partesNombre[1] || '');
        usuario.segundoApellido = usuario.segundoApellido || (partesNombre.length > 3 ? partesNombre.slice(3).join(' ') : partesNombre.slice(2).join(' '));
        usuario.nombre = nombreCompleto(usuario);
        usuario.asignatura = usuario.asignatura || usuario.extra || asignaturasBase[indice % asignaturasBase.length];
        usuario.institucion = usuario.institucion || institucionesBase[indice % institucionesBase.length];
        usuario.correo = usuario.correo && usuario.correo.endsWith('@udi.edu.co') ? usuario.correo : `usuario${usuario.id || indice + 1}@udi.edu.co`;
        usuario.codigo = usuario.codigo || `UDI-${String(usuario.id || indice + 1).padStart(3, '0')}`;
        usuario.rol = usuario.rol || 'Estudiante';
        if (usuario.rol === 'Asesor') usuario.rol = 'Docente asesor';
        if (usuario.rol === 'Director') usuario.rol = 'Director del programa';
        usuario.semestre = Array.isArray(usuario.semestre) ? usuario.semestre : [usuario.semestre || '7'];
        usuario.activo = usuario.activo !== false;
    });
}

normalizarUsuariosGuardados();

function nombreCompleto(usuario) {
    return [usuario.primerNombre, usuario.segundoNombre, usuario.primerApellido, usuario.segundoApellido]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function guardarAdmin() {
    localStorage.setItem(claveAdmin, JSON.stringify(estadoAdmin));
}

function capturarVistasAdmin() {
    estadoAdmin.vistas = {
        practicas: document.getElementById('tabla-practicas-admin').innerHTML,
        asignaturas: document.getElementById('lista-asignaturas').innerHTML,
        instituciones: document.getElementById('lista-instituciones').innerHTML
    };
    estadoAdmin.tarjetas = {
        asignaturas: estadoAdmin.vistas.asignaturas,
        instituciones: estadoAdmin.vistas.instituciones
    };
}

function avisoAdmin(mensaje) {
    notificacionAdmin.querySelector('span').textContent = mensaje;
    notificacionAdmin.classList.add('visible');
    clearTimeout(temporizadorAdmin);
    temporizadorAdmin = setTimeout(() => notificacionAdmin.classList.remove('visible'), 3200);
}

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
    const instituciones = Array.from(document.querySelectorAll('#lista-instituciones article h3'))
        .map(titulo => titulo.textContent.trim())
        .filter(Boolean);
    return instituciones.length ? instituciones : ['I.E. La Esperanza', 'Col. Nuevo Horizonte'];
}

function obtenerAsignaturasRegistradas() {
    const asignaturas = Array.from(document.querySelectorAll('#lista-asignaturas article h3'))
        .map(titulo => titulo.textContent.trim())
        .filter(Boolean);
    return asignaturas.length ? asignaturas : ['Seminario de practica pedagogica', 'Didactica y evaluacion'];
}

function llenarInstituciones(seleccionada = '', id = 'campo-institucion') {
    const selector = campo(id);
    if (!selector) return;
    selector.innerHTML = obtenerInstitucionesRegistradas()
        .map(nombre => `<option ${nombre === seleccionada ? 'selected' : ''}>${nombre}</option>`)
        .join('');
}

function llenarAsignaturas(seleccionada = '', id = 'usuario-asignatura') {
    const selector = campo(id);
    if (!selector) return;
    selector.innerHTML = obtenerAsignaturasRegistradas()
        .map(nombre => `<option ${nombre === seleccionada ? 'selected' : ''}>${nombre}</option>`)
        .join('');
}

function obtenerPracticasRegistradas() {
    const practicas = Array.from(document.querySelectorAll('#tabla-practicas-admin tr'))
        .map((fila, indice) => fila.dataset.nombre || `Practica ${indice + 1}`)
        .filter(Boolean);
    return [...new Set(practicas.length ? practicas : ['Practica I', 'Practica II', 'Practica III'])];
}

function obtenerAsesoresRegistrados() {
    const asesores = estadoAdmin.usuarios
        .filter(usuario => usuario.rol === 'Docente asesor' && usuario.activo !== false)
        .map(usuario => usuario.nombre)
        .filter(Boolean);
    return asesores.length ? asesores : ['Sin asesor registrado'];
}

function obtenerEstudiantesRegistrados() {
    const estudiantes = estadoAdmin.usuarios
        .filter(usuario => usuario.rol === 'Estudiante' && usuario.activo !== false)
        .map(usuario => usuario.nombre)
        .filter(Boolean);
    return estudiantes.length ? estudiantes : ['Sin estudiante registrado'];
}

function llenarOpciones(selectorId, opciones, seleccionada = '') {
    const selector = campo(selectorId);
    if (!selector) return;
    selector.innerHTML = opciones
        .map(opcion => `<option ${opcion === seleccionada ? 'selected' : ''}>${opcion}</option>`)
        .join('');
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

function actualizarContadores() {
    const usuariosActivos = estadoAdmin.usuarios.filter(usuario => usuario.activo).length;
    const totalUsuarios = estadoAdmin.usuarios.length;
    document.getElementById('dato-usuarios').textContent = usuariosActivos;
    document.getElementById('porcentaje-usuarios').textContent = totalUsuarios ? `${Math.round((usuariosActivos / totalUsuarios) * 100)}%` : '0%';
}

function renderUsuarios() {
    const consulta = document.getElementById('buscar-usuario').value.toLowerCase();
    const estado = document.getElementById('filtro-estado').value;
    const usuarios = estadoAdmin.usuarios.filter(usuario => {
        const coincideTexto = `${usuario.nombre} ${usuario.correo || ''} ${usuario.codigo || ''} ${usuario.asignatura || ''} ${usuario.institucion || ''}`.toLowerCase().includes(consulta);
        const coincideEstado = !estado || (estado === 'activo' ? usuario.activo : !usuario.activo);
        return coincideTexto && coincideEstado;
    });

    document.getElementById('tabla-usuarios').innerHTML = usuarios.map(usuario => `
        <tr>
            <td><strong>${usuario.nombre}</strong></td>
            <td>${usuario.correo || 'Sin correo'}</td>
            <td>${usuario.codigo || 'Sin codigo'}</td>
            <td>${usuario.asignatura || 'Sin asignatura'}</td>
            <td>${usuario.institucion || 'Sin institucion'}</td>
            <td>${(usuario.semestre || []).join(', ')}</td>
            <td>${etiquetaEstado(usuario.activo)}</td>
            <td>
                <div class="acciones-usuario">
                    <button class="accion-tabla editar-usuario" type="button" data-id="${usuario.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    <button class="accion-tabla cambiar-estado" type="button" data-id="${usuario.id}" title="Activar o desactivar"><i class="fa-solid ${usuario.activo ? 'fa-user-slash' : 'fa-user-check'}"></i></button>
                </div>
            </td>
        </tr>
    `).join('');

    actualizarContadores();
}

function crearFila(tipo, registro) {
    const nombre = registro.nombre;
    const correo = registro.correo || 'correo@universidad.edu.co';
    const rol = registro.rol || 'Docente';
    const extra = registro.extra || 'Por definir';

    if (tipo === 'estudiante') {
        return `<tr><td><strong>${nombre}</strong><small>${correo}</small></td><td>${extra}</td><td>7</td><td>Practica por asignar</td><td>${etiquetaEstado(true)}</td><td><button class="accion-tabla editar-registro" type="button" data-tipo="estudiante" title="Editar"><i class="fa-solid fa-pen"></i></button></td></tr>`;
    }

    if (tipo === 'personal') {
        return `<tr><td><strong>${nombre}</strong></td><td>${rol}</td><td>${correo}</td><td>${extra}</td><td>${etiquetaEstado(true)}</td><td><button class="accion-tabla editar-registro" type="button" data-tipo="personal" title="Editar"><i class="fa-solid fa-pen"></i></button></td></tr>`;
    }

    if (tipo === 'practica') {
        const estado = registro.estado || 'Disponible';
        const claseEstado = estado === 'En curso' || estado === 'Finalizada' ? 'listo' : estado === 'Cancelada' ? 'riesgo' : 'alerta';
        return `<tr><td>${registro.institucion || 'Sin institucion'}</td><td><strong>${registro.estudiante || 'Sin estudiante'}</strong></td><td>${registro.asesor || 'Sin asesor'}</td><td><strong>${registro.fechaCreacion || 'Por definir'}</strong><small>Limite: ${registro.fechaLimite || 'Por definir'}</small></td><td><em class="estado ${claseEstado}">${estado}</em></td><td><button class="accion-tabla editar-registro" type="button" data-tipo="practica" title="Editar"><i class="fa-solid fa-pen"></i></button></td></tr>`;
    }

    return `<tr><td><strong>${nombre}</strong><small>Registro academico</small></td><td>${extra}</td><td>Por asignar</td><td>0</td><td>Por definir</td><td><em class="estado alerta">Nueva</em></td></tr>`;
}

function crearTarjeta(tipo, registro) {
    const icono = tipo === 'asignatura' ? 'fa-book' : 'fa-building-columns';
    const accion = tipo === 'asignatura' ? 'Modificar' : 'Actualizar datos';
    const estado = registro.estado || 'Activa';
    const activa = estado !== 'Inactiva';
    const descripcion = tipo === 'asignatura'
        ? `Codigo: ${registro.codigo || 'Sin codigo'} · Semestre: ${registro.semestre || 'Sin definir'}`
        : `${registro.direccion || 'Direccion en Bucaramanga'} · Semestres: ${(registro.semestres || []).join(', ') || 'Sin definir'} · ${registro.practica || 'Sin practica'} · ${registro.asesor || 'Sin asesor'}`;
    const datosAsignatura = tipo === 'asignatura'
        ? ` data-codigo="${registro.codigo || ''}" data-semestre="${registro.semestre || ''}" data-estado="${estado}"`
        : ` data-direccion="${registro.direccion || ''}" data-semestres="${(registro.semestres || []).join(',')}" data-practica="${registro.practica || ''}" data-asesor="${registro.asesor || ''}" data-estado="${estado}"`;
    return `
        <article${datosAsignatura}>
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
            const fechaCelda = celdas[3];
            const fechaCreacion = fechaCelda?.querySelector('strong')?.textContent.trim() || celdas[3]?.textContent.trim() || '';
            const fechaLimite = (fechaCelda?.querySelector('small')?.textContent || '').replace('Limite:', '').trim() || celdas[4]?.textContent.trim() || '';
            return {
                institucion: celdas[0]?.textContent.trim() || '',
                estudiante: celdas[1]?.querySelector('strong')?.textContent.trim() || celdas[1]?.textContent.trim() || '',
                asesor: celdas[2]?.textContent.trim() || '',
                fechaCreacion,
                fechaLimite,
                estado: (celdas.length === 6 ? celdas[4] : celdas[5])?.textContent.trim() || 'Disponible'
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
        if (tipo === 'institucion') {
            return {
                nombre: tarjeta.querySelector('h3')?.textContent.trim() || '',
                direccion: tarjeta.dataset.direccion || 'Bucaramanga',
                semestres: (tarjeta.dataset.semestres || '').split(',').filter(Boolean),
                practica: tarjeta.dataset.practica || '',
                asesor: tarjeta.dataset.asesor || '',
                estado: tarjeta.querySelector('.estado')?.textContent.trim() || tarjeta.dataset.estado || 'Activa'
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

function configurarSemestrePorRol() {
    const rol = campo('usuario-rol').value;
    const seleccionados = semestresSeleccionados();
    const permiteVarios = ['Docente', 'Docente asesor', 'Director del programa'].includes(rol);
    campo('grupo-semestre-usuario').title = permiteVarios ? 'Puedes seleccionar uno o varios semestres' : 'Solo puedes seleccionar un semestre';
    if (!permiteVarios) {
        seleccionarSemestres(seleccionados[0] || '1');
    } else if (!seleccionados.length) {
        seleccionarSemestres('1');
    }
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
    campo('usuario-codigo').value = usuario?.codigo || '';
    campo('usuario-rol').value = usuario?.rol || 'Estudiante';
    llenarAsignaturas(usuario?.asignatura || '', 'usuario-asignatura');
    llenarInstituciones(usuario?.institucion || '', 'usuario-institucion');
    seleccionarSemestres(usuario?.semestre || '7');
    campo('usuario-estado').value = usuario?.activo === false ? 'Inactivo' : 'Activo';
    campo('form-usuario').dataset.editar = usuario?.id || '';
    configurarSemestrePorRol();
    modalUsuario.showModal();
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
    seleccionarSemestresInstitucion(datos.semestres || '7');
    llenarOpciones('institucion-practica', obtenerPracticasRegistradas(), datos.practica);
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
    llenarOpciones('practica-institucion', obtenerInstitucionesRegistradas(), datos.institucion);
    llenarOpciones('practica-estudiante', obtenerEstudiantesRegistrados(), datos.estudiante);
    llenarOpciones('practica-asesor', obtenerAsesoresRegistrados(), datos.asesor);
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
    configurarGrupo('grupo-estado-registro', tipo === 'asignatura', true);

    if (tipo === 'asignatura') {
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

function normalizarVistasGuardadas() {
    document.querySelectorAll('#lista-asignaturas article').forEach(tarjeta => {
        const descripcion = tarjeta.querySelector('p');
        const texto = descripcion?.textContent.trim() || '';
        const codigo = tarjeta.dataset.codigo || (texto.match(/Codigo:\s*([^·]+)/)?.[1] || 'Sin codigo').trim();
        const semestre = tarjeta.dataset.semestre || (texto.match(/Semestre:\s*(.+)$/)?.[1] || 'Por definir').trim();
        tarjeta.dataset.codigo = codigo;
        tarjeta.dataset.semestre = semestre;
        tarjeta.dataset.estado = tarjeta.querySelector('.estado')?.textContent.trim() || 'Activa';
        if (descripcion) descripcion.textContent = `Codigo: ${codigo} · Semestre: ${semestre}`;
    });

    document.querySelectorAll('#lista-instituciones article').forEach(tarjeta => {
        const descripcion = tarjeta.querySelector('p');
        tarjeta.dataset.direccion = tarjeta.dataset.direccion || 'Direccion en Bucaramanga';
        tarjeta.dataset.semestres = tarjeta.dataset.semestres || '7';
        tarjeta.dataset.practica = tarjeta.dataset.practica || 'Practica III';
        tarjeta.dataset.asesor = tarjeta.dataset.asesor || obtenerAsesoresRegistrados()[0] || '';
        tarjeta.dataset.estado = tarjeta.querySelector('.estado')?.textContent.trim() || 'Activa';
        if (descripcion) {
            descripcion.textContent = `${tarjeta.dataset.direccion} · Semestres: ${tarjeta.dataset.semestres.replace(/,/g, ', ')} · ${tarjeta.dataset.practica} · ${tarjeta.dataset.asesor || 'Sin asesor'}`;
        }
    });

    document.querySelectorAll('#tabla-practicas-admin tr').forEach(fila => {
        const celdas = fila.querySelectorAll('td');
        const esTablaAnterior = celdas.length >= 7 || celdas[5]?.querySelector('.estado');
        const estado = (esTablaAnterior ? celdas[5] : celdas[4])?.querySelector('.estado');
        if (celdas[0]?.querySelector('small')) {
            fila.outerHTML = crearFila('practica', {
                institucion: celdas[1]?.textContent.trim() || 'Sin institucion',
                estudiante: 'Sin estudiante',
                asesor: celdas[2]?.textContent.trim() || 'Sin asesor',
                fechaCreacion: celdas[4]?.textContent.trim() || '',
                fechaLimite: celdas[4]?.textContent.trim() || '',
                estado: estado?.textContent.trim() || 'Disponible'
            });
            return;
        }
        if (estado?.textContent.trim() === 'En desarrollo') estado.textContent = 'En curso';
        if (estado?.textContent.trim() === 'En seguimiento') estado.textContent = 'Disponible';
        if (esTablaAnterior) {
            fila.outerHTML = crearFila('practica', {
                institucion: celdas[0]?.textContent.trim() || 'Sin institucion',
                estudiante: celdas[1]?.querySelector('strong')?.textContent.trim() || celdas[1]?.textContent.trim() || 'Sin estudiante',
                asesor: celdas[2]?.textContent.trim() || 'Sin asesor',
                fechaCreacion: celdas[3]?.textContent.trim() || '',
                fechaLimite: celdas[4]?.textContent.trim() || '',
                estado: estado?.textContent.trim() || 'Disponible'
            });
            return;
        }
        if (celdas.length === 6) {
            const botonEditar = celdas[5]?.querySelector('.editar-registro');
            if (!botonEditar) celdas[5].innerHTML = '<button class="accion-tabla editar-registro" type="button" data-tipo="practica" title="Editar"><i class="fa-solid fa-pen"></i></button>';
        }
    });
}

accesosAdmin.forEach(acceso => acceso.addEventListener('click', () => abrirVistaAdmin(acceso.dataset.vista)));
document.querySelector('.menu-movil').addEventListener('click', () => lateralAdmin.classList.toggle('abierto'));
document.getElementById('buscar-usuario').addEventListener('input', renderUsuarios);
document.getElementById('filtro-estado').addEventListener('change', renderUsuarios);

document.addEventListener('click', evento => {
    const botonEstado = evento.target.closest('.cambiar-estado');
    const botonEditar = evento.target.closest('.editar-usuario');
    const botonRegistro = evento.target.closest('.editar-registro, .editar-tarjeta');
    const botonTarjeta = evento.target.closest('.tarjetas-admin .enlace-accion');
    const botonAccionTabla = evento.target.closest('.accion-tabla:not(.editar-usuario):not(.cambiar-estado):not(.cerrar-modal):not(.editar-registro)');

    if (botonEstado) {
        const usuario = estadoAdmin.usuarios.find(item => item.id === Number(botonEstado.dataset.id));
        usuario.activo = !usuario.activo;
        guardarAdmin();
        renderUsuarios();
        avisoAdmin(`Usuario ${usuario.activo ? 'activado' : 'desactivado'} correctamente.`);
        return;
    }

    if (botonEditar) {
        const usuario = estadoAdmin.usuarios.find(item => item.id === Number(botonEditar.dataset.id));
        abrirModalUsuario(usuario);
        return;
    }

    if (botonRegistro) {
        if (botonRegistro.dataset.tipo === 'practica') {
            abrirModalPractica(botonRegistro);
        } else {
            abrirModal(botonRegistro.dataset.tipo, null, botonRegistro);
        }
    } else if (botonTarjeta) {
        const tipo = inferirTipoDesdeElemento(botonTarjeta);
        if (tipo === 'institucion') {
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
        const activar = etiqueta.textContent.trim() === 'Inactiva';
        etiqueta.textContent = activar ? 'Activa' : 'Inactiva';
        etiqueta.className = `estado ${activar ? 'listo' : 'riesgo'}`;
        tarjeta.dataset.estado = etiqueta.textContent;
        botonDesactivar.textContent = activar ? 'Desactivar' : 'Activar';
        capturarVistasAdmin();
        guardarAdmin();
        avisoAdmin(`Registro ${activar ? 'activado' : 'desactivado'} correctamente.`);
    }
});

document.querySelectorAll('[data-abrir-usuario]').forEach(boton => boton.addEventListener('click', () => abrirModalUsuario()));
document.querySelectorAll('[data-abrir-institucion]').forEach(boton => boton.addEventListener('click', () => abrirModalInstitucion()));
document.querySelectorAll('[data-abrir-practica]').forEach(boton => boton.addEventListener('click', () => abrirModalPractica()));
document.querySelectorAll('[data-abrir-modal]').forEach(boton => boton.addEventListener('click', () => abrirModal(boton.dataset.abrirModal)));
document.querySelectorAll('.cerrar-modal').forEach(boton => boton.addEventListener('click', () => modalAdmin.close()));
document.querySelectorAll('.cerrar-modal-usuario').forEach(boton => boton.addEventListener('click', () => modalUsuario.close()));
document.querySelectorAll('.cerrar-modal-institucion').forEach(boton => boton.addEventListener('click', () => modalInstitucion.close()));
document.querySelectorAll('.cerrar-modal-practica').forEach(boton => boton.addEventListener('click', () => modalPractica.close()));
campo('usuario-rol').addEventListener('change', configurarSemestrePorRol);
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
    const idEditar = Number(evento.currentTarget.dataset.editar);
    const correo = campo('usuario-correo').value.trim().toLowerCase();
    const codigo = campo('usuario-codigo').value.trim();
    const correoRepetido = estadoAdmin.usuarios.some(usuario => usuario.id !== idEditar && usuario.correo?.toLowerCase() === correo);
    const codigoRepetido = estadoAdmin.usuarios.some(usuario => usuario.id !== idEditar && usuario.codigo?.toLowerCase() === codigo.toLowerCase());

    if (!correo.endsWith('@udi.edu.co')) {
        avisoAdmin('El correo debe terminar en @udi.edu.co.');
        return;
    }

    if (correoRepetido) {
        avisoAdmin('Ese correo ya esta registrado.');
        return;
    }

    if (codigoRepetido) {
        avisoAdmin('Ese codigo ya esta registrado.');
        return;
    }

    const registro = {
        primerNombre: campo('usuario-primer-nombre').value.trim(),
        segundoNombre: campo('usuario-segundo-nombre').value.trim(),
        primerApellido: campo('usuario-primer-apellido').value.trim(),
        segundoApellido: campo('usuario-segundo-apellido').value.trim(),
        correo,
        codigo,
        rol: campo('usuario-rol').value,
        asignatura: campo('usuario-asignatura').value,
        institucion: campo('usuario-institucion').value,
        semestre: semestresSeleccionados(),
        activo: campo('usuario-estado').value === 'Activo'
    };
    registro.nombre = nombreCompleto(registro);

    if (!registro.semestre.length) {
        avisoAdmin('Selecciona al menos un semestre.');
        return;
    }

    if (registro.rol === 'Estudiante' && registro.semestre.length > 1) {
        registro.semestre = [registro.semestre[0]];
    }

    if (idEditar) {
        const usuario = estadoAdmin.usuarios.find(item => item.id === idEditar);
        Object.assign(usuario, registro);
        avisoAdmin('Usuario actualizado correctamente.');
    } else {
        estadoAdmin.usuarios.push({ id: Date.now(), ...registro });
        avisoAdmin('Usuario creado correctamente.');
    }

    guardarAdmin();
    renderUsuarios();
    modalUsuario.close();
    evento.currentTarget.reset();
});

campo('form-institucion').addEventListener('submit', evento => {
    evento.preventDefault();
    const registro = {
        nombre: campo('institucion-nombre').value.trim(),
        direccion: campo('institucion-direccion').value.trim(),
        semestres: semestresInstitucionSeleccionados(),
        practica: campo('institucion-practica').value,
        asesor: campo('institucion-asesor').value,
        estado: campo('institucion-estado').value
    };

    if (!/bucaramanga/i.test(registro.direccion)) {
        avisoAdmin('La direccion debe pertenecer a Bucaramanga.');
        return;
    }

    if (!registro.semestres.length) {
        avisoAdmin('Selecciona al menos un semestre para la institucion.');
        return;
    }

    if (actualizarElementoEditado(registro)) {
        capturarVistasAdmin();
        avisoAdmin('Institucion actualizada correctamente.');
    } else {
        estadoAdmin.registros.institucion.push(registro);
        agregarRegistroVisual('institucion', registro);
        capturarVistasAdmin();
        avisoAdmin('Institucion registrada correctamente.');
    }

    guardarAdmin();
    modalInstitucion.close();
    evento.currentTarget.reset();
    elementoEditado = null;
});

campo('form-practica').addEventListener('submit', evento => {
    evento.preventDefault();
    const registro = {
        institucion: campo('practica-institucion').value,
        estudiante: campo('practica-estudiante').value,
        asesor: campo('practica-asesor').value,
        fechaCreacion: campo('practica-fecha-creacion').value,
        fechaLimite: campo('practica-fecha-limite').value,
        estado: campo('practica-estado').value
    };

    if (registro.fechaLimite < registro.fechaCreacion) {
        avisoAdmin('La fecha limite debe ser posterior a la fecha de creacion.');
        return;
    }

    if (actualizarElementoEditado(registro)) {
        capturarVistasAdmin();
        avisoAdmin('Practica actualizada correctamente.');
    } else {
        estadoAdmin.registros.practica.push(registro);
        agregarRegistroVisual('practica', registro);
        capturarVistasAdmin();
        avisoAdmin('Practica registrada correctamente.');
    }

    guardarAdmin();
    modalPractica.close();
    evento.currentTarget.reset();
    elementoEditado = null;
});

document.getElementById('form-admin').addEventListener('submit', evento => {
    evento.preventDefault();
    const nombre = campo('campo-nombre').value.trim();
    const idEditar = Number(evento.currentTarget.dataset.editar);
    let registro = { nombre };

    if (tipoRegistro === 'asignatura') {
        const datosActuales = elementoEditado ? datosDesdeElemento(elementoEditado, 'asignatura') : {};
        registro = {
            nombre,
            codigo: datosActuales.codigo || campo('campo-codigo').value.trim() || generarCodigoAsignatura(),
            semestre: campo('campo-semestre').value.trim(),
            estado: campo('campo-estado-registro').value
        };
    }

    if (actualizarElementoEditado(registro)) {
        capturarVistasAdmin();
        avisoAdmin('Registro actualizado correctamente.');
    } else {
        estadoAdmin.registros[tipoRegistro].push(registro);
        agregarRegistroVisual(tipoRegistro, registro);
        capturarVistasAdmin();
        avisoAdmin('Registro creado correctamente.');
    }

    guardarAdmin();
    renderUsuarios();
    modalAdmin.close();
    evento.currentTarget.reset();
    elementoEditado = null;
});

document.getElementById('form-perfil-admin').addEventListener('submit', evento => {
    evento.preventDefault();
    estadoAdmin.perfil = Array.from(document.querySelectorAll('#form-perfil-admin input:not([readonly])')).map(campo => campo.value);
    guardarAdmin();
    avisoAdmin('La informacion de perfil fue actualizada.');
});

if (estadoAdmin.perfil) {
    document.querySelectorAll('#form-perfil-admin input:not([readonly])').forEach((campo, indice) => campo.value = estadoAdmin.perfil[indice] || campo.value);
}

if (estadoAdmin.vistas) {
    document.getElementById('tabla-practicas-admin').innerHTML = estadoAdmin.vistas.practicas || document.getElementById('tabla-practicas-admin').innerHTML;
    document.getElementById('lista-asignaturas').innerHTML = estadoAdmin.vistas.asignaturas || document.getElementById('lista-asignaturas').innerHTML;
    document.getElementById('lista-instituciones').innerHTML = estadoAdmin.vistas.instituciones || document.getElementById('lista-instituciones').innerHTML;
} else if (estadoAdmin.tarjetas) {
    document.getElementById('lista-asignaturas').innerHTML = estadoAdmin.tarjetas.asignaturas || document.getElementById('lista-asignaturas').innerHTML;
    document.getElementById('lista-instituciones').innerHTML = estadoAdmin.tarjetas.instituciones || document.getElementById('lista-instituciones').innerHTML;
}

if (!estadoAdmin.vistas) {
    Object.entries(estadoAdmin.registros).forEach(([tipo, registros]) => registros.forEach(registro => agregarRegistroVisual(tipo, registro)));
}
normalizarVistasGuardadas();
capturarVistasAdmin();
guardarAdmin();
renderUsuarios();
