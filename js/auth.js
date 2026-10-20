(() => {
    const rolePages = {
        administrador: 'administrador.html',
        asesor: 'asesor.html',
        director: 'director.html',
        docente: 'docente.html',
        estudiante: 'estudiante.html'
    };
    const loginForm = document.getElementById('formulario-login');
    const setupForm = document.getElementById('formulario-administrador-inicial');
    const setupPanel = document.getElementById('configuracion-administrador');
    const message = document.getElementById('mensaje-autenticacion');
    const roleSelect = document.getElementById('rol-acceso');

    async function request(url, options = {}) {
        const response = await fetch(url, {
            credentials: 'same-origin',
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        if (response.status === 204) return null;
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            throw new Error('No se recibió respuesta de la API. Ejecuta "npm start" y abre http://127.0.0.1:3000 (no uses Live Server).');
        }
        const result = await response.json().catch(() => {
            throw new Error('La respuesta del servidor no es válida. Reinicia el backend con "npm start" y vuelve a cargar la página.');
        });
        if (!response.ok) throw new Error(result.error || 'No se pudo completar la solicitud.');
        return result;
    }

    function showMessage(text) {
        if (message) message.textContent = text;
    }

    function setLoginRole(role) {
        if (!roleSelect) return;
        roleSelect.value = role;
        document.querySelectorAll('[data-login-role]').forEach(button => {
            button.classList.toggle('activo', button.dataset.loginRole === role);
        });
    }

    function enterDashboard(user) {
        const page = rolePages[user.role];
        if (!page) {
            showMessage('Tu cuenta todavía no tiene un panel habilitado.');
            return;
        }
        window.location.replace(page);
    }

    async function initializeLogin() {
        try {
            const session = await request('/api/auth/me');
            enterDashboard(session.data);
            return;
        } catch (error) {
            if (!error.message.includes('sesión') && !error.message.includes('Inicia sesión')) showMessage(error.message);
        }

        try {
            const setup = await request('/api/auth/setup-status');
            if (setup.setupRequired && setupPanel) {
                setupPanel.hidden = false;
                loginForm.hidden = true;
            } else if (loginForm) {
                loginForm.hidden = false;
            }
        } catch (error) {
            if (loginForm) loginForm.hidden = false;
            showMessage(error.message);
        }
    }

    if (loginForm) {
        document.querySelectorAll('[data-login-role]').forEach(button => {
            button.addEventListener('click', () => setLoginRole(button.dataset.loginRole));
        });
        roleSelect?.addEventListener('change', () => setLoginRole(roleSelect.value));

        loginForm.addEventListener('submit', async event => {
            event.preventDefault();
            showMessage('');
            const button = loginForm.querySelector('[type="submit"]');
            button.disabled = true;
            try {
                const result = await request('/api/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({
                        identifier: document.getElementById('correo-acceso').value,
                        password: document.getElementById('contrasena-acceso').value
                    })
                });
                if (roleSelect?.value && result.data.role !== roleSelect.value) {
                    await request('/api/auth/logout', { method: 'POST' }).catch(() => {});
                    showMessage('Las credenciales no pertenecen al rol seleccionado.');
                    return;
                }
                enterDashboard(result.data);
            } catch (error) {
                showMessage(error.message);
            } finally {
                button.disabled = false;
            }
        });

        setupForm?.addEventListener('submit', async event => {
            event.preventDefault();
            showMessage('');
            const button = setupForm.querySelector('[type="submit"]');
            button.disabled = true;
            try {
                const body = Object.fromEntries(new FormData(setupForm).entries());
                const result = await request('/api/auth/setup', {
                    method: 'POST',
                    body: JSON.stringify(body)
                });
                enterDashboard(result.data);
            } catch (error) {
                showMessage(error.message);
            } finally {
                button.disabled = false;
            }
        });

        initializeLogin();
        return;
    }

    const currentPage = location.pathname.split('/').pop();
    const requiredRole = Object.entries(rolePages).find(([, page]) => page === currentPage)?.[0];
    if (requiredRole) {
        request('/api/auth/me').then(result => {
            if (result.data.role !== requiredRole) enterDashboard(result.data);
        }).catch(() => window.location.replace('index.html'));
    }

    document.addEventListener('click', async event => {
        const link = event.target.closest('[data-logout], .cerrar-sesion');
        if (!link) return;
        event.preventDefault();
        link.setAttribute('aria-disabled', 'true');
        try {
            await request('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            showMessage?.(error.message);
        } finally {
            window.location.replace(new URL('index.html', window.location.href).href);
        }
    });
})();
