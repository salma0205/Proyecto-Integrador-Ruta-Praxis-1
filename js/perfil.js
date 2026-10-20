(() => {
    const profileRoot = document.querySelector('#form-perfil-admin, #form-perfil, #form-perfil-asesor, #form-perfil-director, .perfil-personal-estudiante');
    if (!profileRoot) return;

    const form = profileRoot.matches('form') ? profileRoot : null;
    const saveButton = document.getElementById('guardar-perfil-estudiante');
    const fileInput = profileRoot.querySelector('[data-profile-photo-input]');
    const status = document.getElementById('estado-perfil');
    let profilePhoto = '';

    function initials(user) {
        const names = [user.firstName, user.middleName, user.lastName, user.secondLastName]
            .filter(Boolean)
            .map(name => name.trim())
            .filter(Boolean);
        const letters = names.length > 1
            ? `${names[0].charAt(0)}${names[names.length - 1].charAt(0)}`
            : (names[0] || user.username || '').slice(0, 2);
        return letters.toLocaleUpperCase() || 'U';
    }

    function showPhoto(photo) {
        const image = profileRoot.querySelector('[data-profile-photo]');
        const fallback = profileRoot.querySelector('[data-profile-initials]');
        if (!image || !fallback) return;
        if (photo) {
            image.src = photo;
            image.hidden = false;
            fallback.hidden = true;
        } else {
            image.removeAttribute('src');
            image.hidden = true;
            fallback.hidden = false;
        }
    }

    function setStatus(text, isError = false) {
        if (status) {
            status.textContent = text;
            status.classList.toggle('error', isError);
            return;
        }
        const notification = document.getElementById('notificacion');
        if (notification?.querySelector('span')) {
            notification.querySelector('span').textContent = text;
            notification.classList.add('visible');
            window.setTimeout(() => notification.classList.remove('visible'), 3200);
            return;
        }
        const toast = document.createElement('div');
        toast.className = 'notificacion visible';
        toast.setAttribute('role', 'status');
        toast.textContent = text;
        document.body.append(toast);
        window.setTimeout(() => toast.remove(), 3200);
    }

    async function request(url, options = {}) {
        const response = await fetch(url, {
            credentials: 'same-origin',
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers }
        });
        const result = response.status === 204 ? null : await response.json();
        if (!response.ok) throw new Error(result?.error || 'No se pudo guardar la información del perfil.');
        return result;
    }

    function renderProfile(user) {
        const fullName = [user.firstName, user.middleName, user.lastName, user.secondLastName]
            .filter(Boolean).join(' ');
        const profileName = fullName || user.username || user.email || 'Usuario';
        document.querySelectorAll('[data-profile-name]').forEach(element => {
            element.textContent = profileName;
        });
        profileRoot.querySelectorAll('[data-profile-full-name]').forEach(element => {
            element.value = fullName;
        });
        profileRoot.querySelectorAll('[data-profile-email]').forEach(element => {
            element.value = user.email || user.username || '';
        });
        profileRoot.querySelectorAll('[data-profile-document]').forEach(element => {
            element.value = user.documentNumber || user.studentCode || '';
        });
        profileRoot.querySelectorAll('[data-profile-semester]').forEach(element => {
            element.value = user.semester ? `Semestre ${user.semester}` : '';
        });
        profileRoot.querySelectorAll('[data-profile-program]').forEach(element => {
            element.value = user.program || '';
            if (element.tagName !== 'INPUT') element.textContent = user.program || 'Programa no asignado';
        });
        profileRoot.querySelectorAll('[data-profile-active]').forEach(element => {
            element.value = user.active ? 'Activo' : 'Inactivo';
        });
        profileRoot.querySelectorAll('[data-profile-field="personalEmail"]').forEach(element => {
            element.value = user.personalEmail || '';
        });
        profileRoot.querySelectorAll('[data-profile-field="phone"]').forEach(element => {
            element.value = user.phone || '';
        });
        profileRoot.querySelectorAll('[data-profile-initials]').forEach(element => {
            element.textContent = initials(user);
        });
        profileRoot.querySelectorAll('[data-profile-role]').forEach(element => {
            element.textContent = ({ administrador: 'Administrador', estudiante: 'Estudiante', asesor: 'Asesor', director: 'Director', docente: 'Docente' })[user.role] || user.role;
        });
        profileRoot.querySelectorAll('[data-profile-card-name]').forEach(element => {
            element.textContent = profileName;
        });
        profilePhoto = user.profilePhoto || '';
        showPhoto(profilePhoto);
    }

    async function saveProfile(event) {
        event?.preventDefault();
        const save = form?.querySelector('[type="submit"]') || saveButton;
        if (save) save.disabled = true;
        try {
            const payload = {
                personalEmail: profileRoot.querySelector('[data-profile-field="personalEmail"]')?.value || '',
                phone: profileRoot.querySelector('[data-profile-field="phone"]')?.value || '',
                profilePhoto
            };
            const result = await request('/api/auth/profile', {
                method: 'PATCH',
                body: JSON.stringify(payload)
            });
            renderProfile(result.data);
            setStatus('Cambios guardados correctamente.');
        } catch (error) {
            setStatus(error.message, true);
        } finally {
            if (save) save.disabled = false;
        }
    }

    form?.addEventListener('submit', saveProfile);
    saveButton?.addEventListener('click', saveProfile);

    fileInput?.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
            setStatus('Elige una foto JPG, PNG o WEBP de máximo 5 MB.', true);
            fileInput.value = '';
            return;
        }
        const reader = new FileReader();
        reader.addEventListener('load', () => {
            if (typeof reader.result !== 'string') {
                setStatus('No se pudo leer la foto seleccionada.', true);
                return;
            }
            profilePhoto = reader.result;
            showPhoto(profilePhoto);
            setStatus('Foto seleccionada. Guarda los cambios para conservarla.');
        });
        reader.addEventListener('error', () => setStatus('No se pudo leer la foto seleccionada.', true));
        reader.readAsDataURL(file);
    });

    request('/api/auth/profile')
        .then(async result => {
            if (result?.data?.firstName || result?.data?.lastName) return result.data;
            const session = await request('/api/auth/me');
            return { ...session.data, ...(result?.data || {}) };
        })
        .then(renderProfile)
        .catch(async profileError => {
            try {
                const session = await request('/api/auth/me');
                renderProfile(session.data);
            } catch (sessionError) {
                setStatus(sessionError.message || profileError.message, true);
            }
        })
})();
