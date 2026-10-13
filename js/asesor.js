const vistasAsesor = document.querySelectorAll('.vista-asesor');
const opcionesAsesor = document.querySelectorAll('[data-vista]');
const lateralAsesor = document.querySelector('.menu-lateral-asesor');
const almacenamientoAsesor = 'rutaPraxis.asesor';
const estadoAsesor = JSON.parse(localStorage.getItem(almacenamientoAsesor) || '{}');

function guardarEstadoAsesor() {
    localStorage.setItem(almacenamientoAsesor, JSON.stringify(estadoAsesor));
}

function abrirVistaAsesor(id) {
    vistasAsesor.forEach(vista => vista.classList.toggle('activa', vista.id === id));
    document.querySelectorAll('.opcion-menu').forEach(opcion => opcion.classList.toggle('activa', opcion.dataset.vista === id));
    lateralAsesor.classList.remove('abierto');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

opcionesAsesor.forEach(opcion => opcion.addEventListener('click', () => abrirVistaAsesor(opcion.dataset.vista)));
document.querySelector('.menu-movil').addEventListener('click', () => lateralAsesor.classList.toggle('abierto'));

document.getElementById('buscar-asesor').addEventListener('input', event => {
    const consulta = event.target.value.toLowerCase();
    document.querySelectorAll('#filas-asesor tr').forEach(fila => fila.hidden = !fila.textContent.toLowerCase().includes(consulta));
});

document.querySelectorAll('.lista-retro button').forEach(boton => boton.addEventListener('click', () => {
    document.querySelectorAll('.lista-retro button').forEach(item => item.classList.remove('seleccionado'));
    boton.classList.add('seleccionado');
    document.getElementById('nombre-retro').textContent = boton.dataset.estudiante;
}));

const notificacionAsesor = document.getElementById('notificacion');
let tiempoNotificacion;
function mostrarNotificacionAsesor(mensaje) {
    notificacionAsesor.querySelector('span').textContent = mensaje;
    notificacionAsesor.classList.add('visible');
    clearTimeout(tiempoNotificacion);
    tiempoNotificacion = setTimeout(() => notificacionAsesor.classList.remove('visible'), 3200);
}

document.getElementById('form-retro').addEventListener('submit', event => {
    event.preventDefault();
    estadoAsesor.retroalimentaciones = estadoAsesor.retroalimentaciones || [];
    estadoAsesor.retroalimentaciones.unshift({ estudiante: document.getElementById('nombre-retro').textContent, comentario: document.getElementById('comentario-retro').value, fecha: new Date().toISOString() });
    guardarEstadoAsesor();
    event.target.reset();
    mostrarNotificacionAsesor('La retroalimentacion fue enviada al estudiante.');
});

document.getElementById('form-seguimiento').addEventListener('submit', event => {
    event.preventDefault();
    const estudiante = event.target.querySelector('select').value;
    const observacion = document.getElementById('observacion-seguimiento').value;
    const registro = document.createElement('div');
    registro.innerHTML = `<i class="fa-solid fa-clipboard-check"></i><p><strong>Seguimiento registrado</strong><span>${estudiante} · Ahora</span><small>${observacion}</small></p>`;
    document.getElementById('historial-seguimiento').prepend(registro);
    estadoAsesor.historial = document.getElementById('historial-seguimiento').innerHTML;
    guardarEstadoAsesor();
    event.target.reset();
    mostrarNotificacionAsesor('La observacion de seguimiento fue guardada.');
});

document.getElementById('form-perfil-asesor').addEventListener('submit', event => {
    event.preventDefault();
    const campos = document.querySelectorAll('#form-perfil-asesor input:not([readonly])');
    estadoAsesor.perfil = Array.from(campos).map(campo => campo.value);
    guardarEstadoAsesor();
    mostrarNotificacionAsesor('La informacion de perfil fue actualizada.');
});

if (estadoAsesor.historial) document.getElementById('historial-seguimiento').innerHTML = estadoAsesor.historial;
if (estadoAsesor.perfil) {
    document.querySelectorAll('#form-perfil-asesor input:not([readonly])').forEach((campo, indice) => campo.value = estadoAsesor.perfil[indice] || campo.value);
}
