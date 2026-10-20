(function () {
    const clave = 'rutaPraxis.interacciones';
    const estado = JSON.parse(localStorage.getItem(clave) || '{"acciones":[]}');

    const estilo = document.createElement('style');
    estilo.textContent = `
        .modal-flotante-ruta {
            width:min(520px,calc(100vw - 30px));
            border:1px solid rgba(144,221,255,.28);
            border-radius:8px;
            color:#eef9ff;
            background:#091a2e;
            box-shadow:0 24px 60px rgba(0,0,0,.35);
        }
        .modal-flotante-ruta::backdrop { background:rgba(3,12,24,.75); }
        .modal-flotante-ruta form { display:grid; gap:15px; padding:22px; }
        .modal-flotante-ruta header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
        .modal-flotante-ruta header p { margin-bottom:6px; color:#7ddcff; font-size:11px; font-weight:700; text-transform:uppercase; }
        .modal-flotante-ruta h3 { margin:0; color:#fff; font-family:Georgia,serif; font-size:20px; }
        .modal-flotante-ruta label { display:grid; gap:7px; color:#eef9ff; font-size:12px; font-weight:700; }
        .modal-flotante-ruta input,.modal-flotante-ruta textarea,.modal-flotante-ruta select {
            width:100%;
            min-height:40px;
            border:1px solid rgba(144,221,255,.28);
            border-radius:6px;
            outline:0;
            padding:8px 10px;
            color:#eef9ff;
            background:rgba(9,26,46,.55);
        }
        .modal-flotante-ruta textarea { resize:vertical; }
        .modal-flotante-ruta option { background:#091a2e; }
        .modal-flotante-ruta .resumen-flotante {
            display:grid;
            gap:10px;
            padding:13px;
            border:1px solid rgba(125,220,255,.22);
            border-radius:6px;
            background:rgba(125,220,255,.09);
            color:rgba(240,248,255,.78);
            font-size:13px;
            line-height:1.45;
        }
        .modal-flotante-ruta footer { display:flex; justify-content:flex-end; gap:9px; padding-top:4px; }
        body > .notificacion.visible {
            position:fixed;
            right:22px;
            bottom:22px;
            z-index:20;
            display:flex;
            align-items:center;
            gap:9px;
            max-width:340px;
            padding:12px 14px;
            border-radius:6px;
            color:#071827;
            background:#8ef0b2;
            box-shadow:0 10px 30px rgba(0,0,0,.25);
            font-size:13px;
        }
        .boton-flotante-secundario,.boton-flotante-principal,.cerrar-flotante {
            min-height:39px;
            display:inline-flex;
            align-items:center;
            justify-content:center;
            gap:8px;
            padding:0 13px;
            border-radius:6px;
            font-size:12px;
            font-weight:700;
            cursor:pointer;
        }
        .boton-flotante-secundario,.cerrar-flotante {
            border:1px solid rgba(144,221,255,.3);
            color:#eef9ff;
            background:rgba(7,18,34,.62);
        }
        .boton-flotante-principal {
            border:0;
            color:#071827;
            background:#7ddcff;
        }
        .cerrar-flotante {
            width:34px;
            height:34px;
            padding:0;
        }
        @media (max-width:520px) {
            .modal-flotante-ruta {
                width:calc(100vw - 24px);
            }
            .modal-flotante-ruta form {
                padding:18px;
            }
            .modal-flotante-ruta footer { flex-direction:column-reverse; }
            .modal-flotante-ruta footer button { width:100%; }
        }
        @media (max-width:380px) {
            .modal-flotante-ruta {
                width:calc(100vw - 16px);
            }
            .modal-flotante-ruta form {
                padding:14px;
            }
        }
    `;
    document.head.appendChild(estilo);

    const modal = document.createElement('dialog');
    modal.className = 'modal-flotante-ruta';
    modal.id = 'modal-flotante-ruta';
    document.body.appendChild(modal);

    function guardarAccion(accion) {
        estado.acciones.unshift({ ...accion, fecha: new Date().toISOString() });
        estado.acciones = estado.acciones.slice(0, 20);
        localStorage.setItem(clave, JSON.stringify(estado));
    }

    function mostrarAviso(mensaje) {
        const notificacion = document.getElementById('notificacion');
        if (notificacion && notificacion.querySelector('span')) {
            notificacion.querySelector('span').textContent = mensaje;
            notificacion.classList.add('visible');
            setTimeout(() => notificacion.classList.remove('visible'), 3000);
            return;
        }
        const aviso = document.createElement('div');
        aviso.className = 'notificacion visible';
        aviso.innerHTML = `<i class="fa-solid fa-circle-check"></i><span>${mensaje}</span>`;
        document.body.append(aviso);
        setTimeout(() => aviso.remove(), 3000);
    }

    function textoDeElemento(elemento) {
        return (elemento.getAttribute('aria-label') || elemento.getAttribute('title') || elemento.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function contextoDeElemento(elemento) {
        const fila = elemento.closest('tr');
        const tarjeta = elemento.closest('article');
        const bloque = fila || tarjeta || elemento.closest('section') || elemento;
        const titulo = bloque.querySelector('h1,h2,h3,h4,strong')?.textContent?.trim();
        const detalle = bloque.querySelector('p,small,td:nth-child(2)')?.textContent?.trim();
        return { titulo: titulo || 'Registro seleccionado', detalle: detalle || 'Ruta Praxis' };
    }

    function esClickConAccionPropia(elemento) {
        if (elemento.closest('[data-vista], [data-abrir-modal], [data-abrir-actividad], [data-abrir-usuario], [data-abrir-programa], [data-abrir-institucion], [data-abrir-practica], .cerrar-modal, .cerrar-modal-usuario, .cerrar-modal-programa, .cerrar-modal-institucion, .cerrar-modal-practica, .cerrar-flotante, summary')) return true;
        if (elemento.closest('.entrega-item, .contacto, .lista-retro button')) return true;
        if (elemento.closest('.editar-usuario, .cambiar-estado, .guardar-rol, .editar-registro, .editar-tarjeta, .boton-desactivar, .modal-admin')) return true;
        if (elemento.matches('[type="submit"], .enviar-mensaje')) return true;
        if (elemento.closest('.opciones-estudiante') || elemento.closest('.menu-perfil-estudiante')) return true;
        if (elemento.id === 'guardar-perfil-estudiante') return true;
        return false;
    }

    function esAccionVisual(elemento) {
        if (!elemento.matches('button,a')) return false;
        if (esClickConAccionPropia(elemento)) return false;
        if (elemento.matches('a[href="#"]')) return true;
        if (elemento.matches('.boton-notificaciones,.boton-cargar-evidencia,.boton-registrar-actividad,.accion-tabla,.boton-secundario,.boton-principal,.boton,.boton-texto,.boton-enlace,.enlace-accion,.filtro')) return true;
        if (elemento.closest('.acciones-actividad,.acciones-tabla,.pestanas-evidencias,.lista-informes,.evidencias-grid,.evaluaciones-grid,.lista-tarjetas,.archivo-entrega')) return true;
        return false;
    }

    function camposParaAccion(etiqueta, contexto) {
        const texto = etiqueta.toLowerCase();
        if (/subir|cargar|adjuntar|archivo|evidencia/.test(texto)) {
            return `
                <label>Actividad relacionada<input name="titulo" type="text" value="${contexto.titulo}" required></label>
                <label>Archivo<input name="archivo" type="file" required></label>
                <label>Observacion<textarea name="detalle" rows="4" placeholder="Agrega una descripcion breve"></textarea></label>
            `;
        }
        if (/filtrar/.test(texto)) {
            return `
                <label>Estado<select name="estado" required><option>Todos</option><option>Activo</option><option>En revision</option><option>Pendiente</option><option>Finalizado</option></select></label>
                <label>Busqueda<input name="titulo" type="text" placeholder="Palabra clave"></label>
            `;
        }
        if (/olvidaste|contrase|recuperar/.test(texto)) {
            return `
                <label>Correo electronico<input name="correo" type="email" placeholder="tu.correo@ejemplo.com" required></label>
                <label>Comentario<textarea name="detalle" rows="3" placeholder="Describe si necesitas recuperar o cambiar tu acceso"></textarea></label>
            `;
        }
        if (/registrar|crear|nueva|nuevo|editar|plan|actividad|conversacion/.test(texto)) {
            return `
                <label>Titulo<input name="titulo" type="text" value="${/editar/.test(texto) ? contexto.titulo : ''}" required></label>
                <label>Fecha<input name="fecha" type="date"></label>
                <label>Descripcion<textarea name="detalle" rows="4" placeholder="Escribe la informacion principal" required>${/editar/.test(texto) ? contexto.detalle : ''}</textarea></label>
            `;
        }
        if (/calificar/.test(texto)) {
            return `
                <label>Calificacion<input name="nota" type="number" min="0" max="5" step="0.1" placeholder="0.0" required></label>
                <label>Comentario<textarea name="detalle" rows="4" placeholder="Retroalimentacion para el estudiante" required></textarea></label>
            `;
        }
        return `
            <div class="resumen-flotante">
                <strong>${contexto.titulo}</strong>
                <span>${contexto.detalle}</span>
                <span>La consulta se abrira como registro de seguimiento en esta interfaz.</span>
            </div>
        `;
    }

    function tituloParaAccion(etiqueta) {
        const texto = etiqueta || 'Consultar';
        if (/descargar/i.test(texto)) return 'Descargar archivo';
        if (/exportar/i.test(texto)) return 'Exportar informacion';
        if (/notificacion/i.test(texto)) return 'Notificaciones';
        return texto.charAt(0).toUpperCase() + texto.slice(1);
    }

    function abrirFlotante(elemento) {
        const etiqueta = textoDeElemento(elemento) || 'Consultar informacion';
        const contexto = contextoDeElemento(elemento);
        const esConfirmacion = /ver|abrir|consultar|descargar|exportar|resultado|opciones|notificacion/i.test(etiqueta) && !/subir|cargar|adjuntar|registrar|crear|editar|nuevo|nueva|filtrar|calificar/i.test(etiqueta);
        modal.innerHTML = `
            <form method="dialog">
                <header>
                    <div>
                        <p>Accion del sistema</p>
                        <h3>${tituloParaAccion(etiqueta)}</h3>
                    </div>
                    <button class="cerrar-flotante" type="button" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
                </header>
                ${camposParaAccion(etiqueta, contexto)}
                <footer>
                    <button class="boton-flotante-secundario cerrar-flotante" type="button">Cancelar</button>
                    <button class="boton-flotante-principal" type="submit"><i class="fa-solid fa-check"></i> ${esConfirmacion ? 'Aceptar' : 'Guardar'}</button>
                </footer>
            </form>
        `;
        modal.querySelectorAll('.cerrar-flotante').forEach(boton => boton.addEventListener('click', () => modal.close()));
        modal.querySelector('form').addEventListener('submit', event => {
            event.preventDefault();
            const datos = Object.fromEntries(new FormData(event.currentTarget).entries());
            guardarAccion({ etiqueta, contexto, datos });
            modal.close();
            mostrarAviso(`${tituloParaAccion(etiqueta)} realizado correctamente.`);
        });
        modal.showModal();
    }

    document.addEventListener('click', event => {
        const elemento = event.target.closest('button,a');
        if (!elemento || !esAccionVisual(elemento)) return;
        event.preventDefault();
        abrirFlotante(elemento);
    });

    document.addEventListener('change', event => {
        if (event.target.type !== 'file' || !event.target.files.length) return;
        mostrarAviso(`Archivo seleccionado: ${event.target.files[0].name}`);
    });
})();
