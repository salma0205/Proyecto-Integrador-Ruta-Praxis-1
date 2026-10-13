const claveEstudiante = 'rutaPraxis.estudiante';
const estadoEstudiante = JSON.parse(localStorage.getItem(claveEstudiante) || '{}');
const camposEditablesEstudiante = document.querySelectorAll('.perfil-personal-estudiante input:not([readonly])');
const botonGuardarEstudiante = document.getElementById('guardar-perfil-estudiante');
const entradaFotoEstudiante = document.querySelector('.perfil-personal-estudiante input[type="file"]');
const avatarEstudiante = document.querySelector('.avatar-perfil');
const formulariosActividad = document.querySelectorAll('.entrega-actividad');

function guardarPerfilEstudiante() {
    estadoEstudiante.perfil = Array.from(camposEditablesEstudiante).map(campo => campo.value);
    localStorage.setItem(claveEstudiante, JSON.stringify(estadoEstudiante));
}

function guardarEstadoEstudiante() {
    localStorage.setItem(claveEstudiante, JSON.stringify(estadoEstudiante));
}

function mostrarAvisoEstudiante(mensaje) {
    const aviso = document.createElement('div');
    aviso.className = 'notificacion visible';
    aviso.innerHTML = `<i class="fa-solid fa-circle-check"></i><span>${mensaje}</span>`;
    document.body.append(aviso);
    setTimeout(() => aviso.remove(), 3000);
}

function resumenEntrega(formulario, entrega) {
    const partes = [];
    if (entrega.tipo === 'drive') partes.push('Entrega desde Google Drive');
    if (entrega.tipo === 'vinculo') partes.push('Entrega por vinculo');
    if (entrega.tipo === 'archivo') partes.push('Entrega por archivo');
    if (entrega.archivos?.length) partes.push(`${entrega.archivos.length} archivo(s): ${entrega.archivos.join(', ')}`);
    if (entrega.enlace) partes.push(`Enlace: ${entrega.enlace}`);
    formulario.querySelector('.resumen-entrega').textContent = partes.length ? partes.join(' | ') : 'Selecciona Google Drive, un vinculo o un archivo.';
}

function activarTipoEntrega(formulario, tipo, abrirSelector = true) {
    const campoEnlace = formulario.querySelector('.campo-enlace-actividad');
    const entradaEnlace = formulario.querySelector('input[type="url"]');
    const entradaArchivo = formulario.querySelector('.entrada-archivo-actividad');

    formulario.dataset.tipoEntrega = tipo;
    formulario.querySelectorAll('.opcion-entrega').forEach(boton => {
        boton.classList.toggle('activa', boton.dataset.tipoEntrega === tipo);
    });

    campoEnlace.classList.toggle('visible', tipo === 'drive' || tipo === 'vinculo');
    entradaEnlace.placeholder = tipo === 'drive' ? 'https://drive.google.com/...' : 'https://...';
    if (tipo === 'drive' || tipo === 'vinculo') entradaEnlace.focus();
    if (tipo === 'archivo' && abrirSelector) entradaArchivo.click();
}

function marcarActividadEnviada(detalle, enviada, texto = 'Actividad enviada') {
    const estado = detalle.querySelector('.estado-entrega') || detalle.querySelector('summary .etiqueta-estado');
    if (!estado) return;
    estado.textContent = enviada ? texto : 'Pendiente';
    estado.classList.toggle('estado-aprobada', enviada);
    estado.classList.toggle('estado-revision', !enviada);
    estado.classList.remove('estado-rechazada');
}

if (estadoEstudiante.perfil) {
    camposEditablesEstudiante.forEach((campo, indice) => campo.value = estadoEstudiante.perfil[indice] || campo.value);
}
if (estadoEstudiante.foto) {
    avatarEstudiante.innerHTML = `<img src="${estadoEstudiante.foto}" alt="Foto de perfil">`;
}

botonGuardarEstudiante.addEventListener('click', evento => {
    evento.preventDefault();
    guardarPerfilEstudiante();
    botonGuardarEstudiante.querySelector('span').textContent = 'Cambios guardados';
    setTimeout(() => botonGuardarEstudiante.querySelector('span').textContent = 'Guardar cambios', 2200);
});

entradaFotoEstudiante.addEventListener('change', evento => {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.addEventListener('load', () => {
        estadoEstudiante.foto = lector.result;
        guardarPerfilEstudiante();
        avatarEstudiante.innerHTML = `<img src="${lector.result}" alt="Foto de perfil">`;
    });
    lector.readAsDataURL(archivo);
});

formulariosActividad.forEach(formulario => {
    const detalle = formulario.closest('.detalle-actividad, .detalle-evidencia, .detalle-evaluacion');
    const esEvidencia = detalle.classList.contains('detalle-evidencia');
    const esEvaluacion = detalle.classList.contains('detalle-evaluacion');
    const idRegistro = detalle.dataset.actividad || detalle.dataset.evidencia || detalle.dataset.evaluacion;
    const grupoEntregas = esEvaluacion ? 'evaluaciones' : esEvidencia ? 'evidencias' : 'entregas';
    const entradaArchivo = formulario.querySelector('.entrada-archivo-actividad');
    const entradaEnlace = formulario.querySelector('input[type="url"]');
    const entregaGuardada = estadoEstudiante[grupoEntregas]?.[idRegistro];

    if (entregaGuardada) {
        activarTipoEntrega(formulario, entregaGuardada.tipo || (entregaGuardada.enlace ? 'vinculo' : 'archivo'), false);
        entradaEnlace.value = entregaGuardada.enlace || '';
        resumenEntrega(formulario, entregaGuardada);
        const textoEnviada = esEvaluacion ? 'Evaluacion enviada' : esEvidencia ? 'Evidencia enviada' : 'Actividad enviada';
        marcarActividadEnviada(detalle, true, textoEnviada);
        if (esEvidencia) formulario.querySelector('.boton-enviar-actividad span').textContent = 'Evidencia enviada';
        if (esEvaluacion) formulario.querySelector('.boton-enviar-actividad span').textContent = 'Evaluacion enviada';
    }

    formulario.querySelectorAll('.opcion-entrega').forEach(boton => {
        boton.addEventListener('click', () => activarTipoEntrega(formulario, boton.dataset.tipoEntrega));
    });

    entradaArchivo.addEventListener('change', () => {
        const archivos = Array.from(entradaArchivo.files).map(archivo => archivo.name);
        const entrega = { tipo: 'archivo', archivos, enlace: '' };
        activarTipoEntrega(formulario, 'archivo', false);
        resumenEntrega(formulario, entrega);
    });

    entradaEnlace.addEventListener('input', () => {
        const tipo = formulario.dataset.tipoEntrega || 'vinculo';
        resumenEntrega(formulario, { tipo, archivos: [], enlace: entradaEnlace.value.trim() });
    });

    formulario.addEventListener('submit', evento => {
        evento.preventDefault();
        const tipo = formulario.dataset.tipoEntrega || '';
        const archivos = Array.from(entradaArchivo.files).map(archivo => archivo.name);
        const enlace = entradaEnlace.value.trim();

        if (!tipo) {
            mostrarAvisoEstudiante('Selecciona Google Drive, vinculo o archivo antes de enviar.');
            return;
        }

        if ((tipo === 'drive' || tipo === 'vinculo') && !enlace) {
            mostrarAvisoEstudiante('Agrega el enlace de entrega antes de enviar.');
            return;
        }

        if (tipo === 'archivo' && !archivos.length) {
            mostrarAvisoEstudiante('Elige un archivo, imagen o video antes de enviar.');
            return;
        }

        estadoEstudiante[grupoEntregas] = estadoEstudiante[grupoEntregas] || {};
        estadoEstudiante[grupoEntregas][idRegistro] = {
            tipo,
            archivos,
            enlace,
            fecha: new Date().toISOString()
        };
        guardarEstadoEstudiante();
        resumenEntrega(formulario, estadoEstudiante[grupoEntregas][idRegistro]);
        const textoEnviada = esEvaluacion ? 'Evaluacion enviada' : esEvidencia ? 'Evidencia enviada' : 'Actividad enviada';
        marcarActividadEnviada(detalle, true, textoEnviada);
        formulario.querySelector('.boton-enviar-actividad span').textContent = 'Actividad enviada';
        if (esEvidencia) formulario.querySelector('.boton-enviar-actividad span').textContent = 'Evidencia enviada';
        if (esEvaluacion) formulario.querySelector('.boton-enviar-actividad span').textContent = 'Evaluacion enviada';
        mostrarAvisoEstudiante(`${esEvaluacion ? 'Evaluacion' : esEvidencia ? 'Evidencia' : 'Actividad'} enviada correctamente.`);
    });
});
