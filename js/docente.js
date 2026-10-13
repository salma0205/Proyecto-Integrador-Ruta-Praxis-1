const vistas = document.querySelectorAll('.vista');
const enlacesVista = document.querySelectorAll('[data-vista]');
const tituloRuta = document.getElementById('titulo-ruta');
const nombresVistas = { inicio: 'Inicio', estudiantes: 'Estudiantes', actividades: 'Actividades', entregas: 'Entregas', evidencias: 'Evidencias', evaluaciones: 'Evaluaciones', perfil: 'Mi perfil' };

function abrirVista(id) {
    vistas.forEach(vista => vista.classList.toggle('activa', vista.id === id));
    document.querySelectorAll('.enlace-nav').forEach(enlace => enlace.classList.toggle('activo', enlace.dataset.vista === id));
    tituloRuta.textContent = nombresVistas[id];
    document.querySelector('.barra-lateral').classList.remove('abierta');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

enlacesVista.forEach(enlace => enlace.addEventListener('click', () => abrirVista(enlace.dataset.vista)));
document.querySelector('.menu-movil').addEventListener('click', () => document.querySelector('.barra-lateral').classList.toggle('abierta'));

const datosEntregas = {
    mariana: { estudiante: 'Mariana Vega', actividad: 'Diario reflexivo - Semana 4', fecha: 'Entregado hoy, 9:20 a. m.', archivo: 'diario_reflexivo_semana_4.pdf', texto: 'Durante esta semana pude identificar que las preguntas abiertas favorecen la participacion del grupo. Adjunto mis reflexiones sobre la actividad de lectura guiada.' },
    daniela: { estudiante: 'Daniela Lopez', actividad: 'Planeacion de clase', fecha: 'Entregado hoy, 8:40 a. m.', archivo: 'planeacion_lectura_critica.pdf', texto: 'Comparto la planeacion para la sesion de lectura critica. Incluyo una actividad de inicio para recuperar los saberes previos del grupo.' },
    jose: { estudiante: 'Jose Rojas', actividad: 'Evidencia fotografica', fecha: 'Entregado ayer, 5:16 p. m.', archivo: 'evidencia_intervencion_aula.zip', texto: 'Adjunto las fotografias y una descripcion breve de la actividad de lectura realizada con el curso 8-B.' },
    andrea: { estudiante: 'Andrea Silva', actividad: 'Diario reflexivo - Semana 4', fecha: 'Entregado ayer, 3:30 p. m.', archivo: 'diario_reflexivo_andrea.pdf', texto: 'Este registro recoge las situaciones de aula que considero importantes para ajustar mi proxima intervencion.' }
};
const almacenamientoDocente = 'rutaPraxis.docente';
const estadoDocente = JSON.parse(localStorage.getItem(almacenamientoDocente) || '{}');
let entregaActual = 'mariana';

function guardarEstadoDocente() {
    localStorage.setItem(almacenamientoDocente, JSON.stringify(estadoDocente));
}

document.querySelectorAll('.entrega-item').forEach(boton => boton.addEventListener('click', () => {
    entregaActual = boton.dataset.entrega;
    const entrega = datosEntregas[boton.dataset.entrega];
    document.querySelectorAll('.entrega-item').forEach(item => item.classList.remove('seleccionada'));
    boton.classList.add('seleccionada');
    document.getElementById('detalle-estudiante').textContent = entrega.estudiante;
    document.getElementById('detalle-actividad').textContent = entrega.actividad;
    document.getElementById('detalle-fecha').textContent = entrega.fecha;
    document.getElementById('detalle-archivo').textContent = entrega.archivo;
    document.getElementById('detalle-texto').textContent = entrega.texto;
    const calificacion = (estadoDocente.calificaciones || {})[entregaActual];
    document.getElementById('detalle-estado').textContent = calificacion ? 'Calificada' : 'Sin calificar';
    document.getElementById('detalle-estado').className = calificacion ? 'etiqueta verde-clara' : 'etiqueta naranja-clara';
    document.getElementById('nota-entrega').value = calificacion ? calificacion.nota : '';
    document.getElementById('comentario-entrega').value = calificacion ? calificacion.comentario : '';
}));

const notificacion = document.getElementById('notificacion');
let temporizadorNotificacion;
function mostrarNotificacion(mensaje) {
    notificacion.querySelector('span').textContent = mensaje;
    notificacion.classList.add('visible');
    clearTimeout(temporizadorNotificacion);
    temporizadorNotificacion = setTimeout(() => notificacion.classList.remove('visible'), 3200);
}

document.getElementById('form-calificacion').addEventListener('submit', event => {
    event.preventDefault();
    estadoDocente.calificaciones = estadoDocente.calificaciones || {};
    estadoDocente.calificaciones[entregaActual] = { nota: document.getElementById('nota-entrega').value, comentario: document.getElementById('comentario-entrega').value };
    guardarEstadoDocente();
    document.getElementById('detalle-estado').textContent = 'Calificada';
    document.getElementById('detalle-estado').className = 'etiqueta verde-clara';
    mostrarNotificacion('Calificacion y comentario publicados para el estudiante.');
});

document.querySelectorAll('[data-abrir-modal]').forEach(boton => boton.addEventListener('click', () => document.getElementById(`modal-${boton.dataset.abrirModal}`).showModal()));
document.querySelectorAll('[data-abrir-actividad]').forEach(boton => boton.addEventListener('click', () => document.getElementById('modal-actividad').showModal()));
document.querySelectorAll('.cerrar-modal').forEach(boton => boton.addEventListener('click', () => boton.closest('dialog').close()));

document.getElementById('actividad-archivo').addEventListener('change', event => {
    const archivo = event.target.files[0];
    document.getElementById('actividad-archivo-nombre').textContent = archivo ? archivo.name : 'PDF, imagen, video o documento';
});

document.getElementById('form-actividad').addEventListener('submit', event => {
    event.preventDefault();
    const titulo = document.getElementById('actividad-titulo').value.trim();
    const instrucciones = document.getElementById('actividad-instrucciones').value.trim();
    const fecha = document.getElementById('actividad-fecha').value;
    const grupo = document.getElementById('actividad-grupo').value;
    const enlace = document.getElementById('actividad-enlace').value.trim();
    const archivo = document.getElementById('actividad-archivo').files[0]?.name || '';
    const adjuntos = [
        enlace ? `<span><i class="fa-solid fa-link"></i> Enlace adjunto</span>` : '',
        archivo ? `<span><i class="fa-solid fa-paperclip"></i> ${archivo}</span>` : ''
    ].filter(Boolean).join('');
    const tarjeta = document.createElement('article');
    tarjeta.className = 'tarjeta-gestion';
    tarjeta.innerHTML = `<div class="encabezado-tarjeta"><span class="icono-documento azul"><i class="fa-solid fa-clipboard-check"></i></span><span class="etiqueta verde-clara">Activa</span></div><h2>${titulo}</h2><p>${instrucciones}</p><div class="metadatos"><span><i class="fa-regular fa-calendar"></i> Vence ${fecha || 'por definir'}</span><span><i class="fa-solid fa-users"></i> 28 estudiantes</span>${adjuntos}</div><footer><span>${grupo || 'Practica III'}</span><button class="accion-tabla" type="button" title="Mas opciones"><i class="fa-solid fa-ellipsis"></i></button></footer>`;
    document.getElementById('lista-actividades').prepend(tarjeta);
    estadoDocente.actividades = document.getElementById('lista-actividades').innerHTML;
    guardarEstadoDocente();
    event.target.closest('dialog').close();
    event.target.reset();
    document.getElementById('actividad-archivo-nombre').textContent = 'PDF, imagen, video o documento';
    abrirVista('actividades');
    mostrarNotificacion('Actividad publicada y disponible para los estudiantes.');
});

document.getElementById('form-evaluacion').addEventListener('submit', event => {
    event.preventDefault();
    const titulo = document.getElementById('evaluacion-titulo').value.trim();
    const tarjeta = document.createElement('article');
    tarjeta.className = 'panel tarjeta-evaluacion';
    tarjeta.innerHTML = `<div class="encabezado-tarjeta"><span class="icono-documento morado"><i class="fa-solid fa-star"></i></span><span class="etiqueta azul-clara">En curso</span></div><h2>${titulo}</h2><p>Evaluacion publicada para el grupo asignado.</p><div class="progreso"><div><span>Calificadas</span><strong>0 de 28</strong></div><div class="barra-progreso"><i style="width:0%"></i></div></div><footer><span>Recien publicada</span><button class="boton-texto" type="button">Calificar</button></footer>`;
    document.getElementById('lista-evaluaciones').prepend(tarjeta);
    estadoDocente.evaluaciones = document.getElementById('lista-evaluaciones').innerHTML;
    guardarEstadoDocente();
    event.target.closest('dialog').close();
    event.target.reset();
    abrirVista('evaluaciones');
    mostrarNotificacion('Evaluacion publicada para los estudiantes.');
});

document.getElementById('buscar-estudiante').addEventListener('input', event => {
    const consulta = event.target.value.toLowerCase();
    document.querySelectorAll('#tabla-estudiantes tr').forEach(fila => fila.hidden = !fila.textContent.toLowerCase().includes(consulta));
});

document.getElementById('foto-perfil').addEventListener('change', event => {
    const archivo = event.target.files[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.addEventListener('load', () => {
        const foto = document.getElementById('vista-foto');
        foto.src = lector.result;
        foto.style.display = 'block';
        document.getElementById('iniciales-foto').style.display = 'none';
        estadoDocente.foto = lector.result;
        guardarEstadoDocente();
    });
    lector.readAsDataURL(archivo);
});

document.getElementById('form-perfil').addEventListener('submit', event => {
    event.preventDefault();
    estadoDocente.perfil = { correo: document.getElementById('correo-personal').value, telefono: document.getElementById('telefono').value };
    guardarEstadoDocente();
    document.getElementById('estado-perfil').textContent = 'Cambios guardados correctamente.';
    mostrarNotificacion('Tu informacion de perfil fue actualizada.');
});

document.querySelector('.escribir-mensaje').addEventListener('submit', event => {
    event.preventDefault();
    const campo = event.currentTarget.querySelector('input');
    if (!campo.value.trim()) return;
    const mensaje = document.createElement('div');
    mensaje.className = 'mensaje enviado';
    mensaje.innerHTML = `${campo.value.trim()}<small>Ahora</small>`;
    document.querySelector('.mensajes').append(mensaje);
    estadoDocente.mensajes = document.querySelector('.mensajes').innerHTML;
    guardarEstadoDocente();
    campo.value = '';
});

if (estadoDocente.actividades) document.getElementById('lista-actividades').innerHTML = estadoDocente.actividades;
if (estadoDocente.evaluaciones) document.getElementById('lista-evaluaciones').innerHTML = estadoDocente.evaluaciones;
if (estadoDocente.mensajes) document.querySelector('.mensajes').innerHTML = estadoDocente.mensajes;
if (estadoDocente.perfil) {
    document.getElementById('correo-personal').value = estadoDocente.perfil.correo;
    document.getElementById('telefono').value = estadoDocente.perfil.telefono;
}
if (estadoDocente.foto) {
    document.getElementById('vista-foto').src = estadoDocente.foto;
    document.getElementById('vista-foto').style.display = 'block';
    document.getElementById('iniciales-foto').style.display = 'none';
}
