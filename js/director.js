const vistasDirector = document.querySelectorAll('.vista-asesor');
const accesosDirector = document.querySelectorAll('[data-vista]');
const menuDirector = document.querySelector('.menu-lateral-asesor');
const avisoDirector = document.getElementById('notificacion');
const almacenamientoDirector = 'rutaPraxis.director';
const estadoDirector = JSON.parse(localStorage.getItem(almacenamientoDirector) || '{}');
let temporizadorDirector;

function abrirVistaDirector(id) {
    vistasDirector.forEach(vista => vista.classList.toggle('activa', vista.id === id));
    document.querySelectorAll('.opcion-menu').forEach(opcion => opcion.classList.toggle('activa', opcion.dataset.vista === id));
    menuDirector.classList.remove('abierto');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function mostrarAvisoDirector(mensaje) {
    avisoDirector.querySelector('span').textContent = mensaje;
    avisoDirector.classList.add('visible');
    clearTimeout(temporizadorDirector);
    temporizadorDirector = setTimeout(() => avisoDirector.classList.remove('visible'), 3200);
}

accesosDirector.forEach(acceso => acceso.addEventListener('click', () => abrirVistaDirector(acceso.dataset.vista)));
document.querySelector('.menu-movil').addEventListener('click', () => menuDirector.classList.toggle('abierto'));

function activarBusqueda(idEntrada, idFilas) {
    document.getElementById(idEntrada).addEventListener('input', evento => {
        const consulta = evento.target.value.toLowerCase();
        document.querySelectorAll(`#${idFilas} tr`).forEach(fila => fila.hidden = !fila.textContent.toLowerCase().includes(consulta));
    });
}

activarBusqueda('buscar-practica', 'filas-practicas');
activarBusqueda('buscar-estudiante-director', 'filas-estudiantes-director');

document.getElementById('actualizar-comparacion').addEventListener('click', () => {
    const tipo = document.getElementById('tipo-comparacion').value;
    estadoDirector.tipoComparacion = tipo;
    localStorage.setItem(almacenamientoDirector, JSON.stringify(estadoDirector));
    document.getElementById('titulo-comparacion').textContent = `Cumplimiento de horas por ${tipo.toLowerCase()}`;
    mostrarAvisoDirector('El comparativo fue actualizado con los datos disponibles.');
});

document.getElementById('form-perfil-director').addEventListener('submit', evento => {
    evento.preventDefault();
    estadoDirector.perfil = Array.from(document.querySelectorAll('#form-perfil-director input:not([readonly])')).map(campo => campo.value);
    localStorage.setItem(almacenamientoDirector, JSON.stringify(estadoDirector));
    mostrarAvisoDirector('La informacion de perfil fue actualizada.');
});

if (estadoDirector.tipoComparacion) document.getElementById('tipo-comparacion').value = estadoDirector.tipoComparacion;
if (estadoDirector.perfil) document.querySelectorAll('#form-perfil-director input:not([readonly])').forEach((campo, indice) => campo.value = estadoDirector.perfil[indice] || campo.value);
