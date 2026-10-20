const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { User } = require('../models');
const { requireAuth, setSessionCookie, clearSessionCookie } = require('../middleware/auth');

const router = express.Router();
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' }
});

function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function publicUser(user) {
    return {
        id: user.id,
        firstName: user.firstName,
        middleName: user.middleName || '',
        lastName: user.lastName,
        secondLastName: user.secondLastName || '',
        email: user.email,
        username: user.username || '',
        studentCode: user.studentCode || '',
        role: user.role,
        phone: user.phone || '',
        personalEmail: user.personalEmail || '',
        profilePhoto: user.profilePhoto || '',
        documentNumber: user.documentNumber || '',
        program: user.program || '',
        programId: user.programId || null,
        semester: user.semester || null,
        active: user.active
    };
}

router.get('/setup-status', async (req, res, next) => {
    try {
        const administratorExists = await User.exists({ role: 'administrador' });
        res.json({ setupRequired: !administratorExists });
    } catch (error) {
        next(error);
    }
});

router.post('/setup', authLimiter, async (req, res, next) => {
    let lockId;
    try {
        const { firstName, lastName, username, password } = req.body || {};
        const normalizedUsername = cleanText(username).toLowerCase();
        if (!cleanText(firstName) || !cleanText(lastName) || !/^[a-z0-9._-]{3,40}$/.test(normalizedUsername) ||
            typeof password !== 'string' || password.length < 10) {
            return res.status(400).json({ error: 'Completa nombre, apellido y un usuario de 3 a 40 caracteres (letras, números, punto, guion o guion bajo). La contraseña debe tener al menos 10 caracteres.' });
        }
        if (await User.exists({ role: 'administrador' })) {
            return res.status(409).json({ error: 'El administrador inicial ya fue configurado.' });
        }

        lockId = crypto.randomUUID();
        await User.db.collection('setupLocks').insertOne({ _id: 'initial-admin', lockId, createdAt: new Date() });
        const passwordHash = await bcrypt.hash(password, 12);
        const user = await User.create({
            firstName: cleanText(firstName),
            lastName: cleanText(lastName),
            username: normalizedUsername,
            role: 'administrador',
            passwordHash
        });
        setSessionCookie(res, user, req);
        res.status(201).json({ data: publicUser(user) });
    } catch (error) {
        if (lockId) {
            try {
                await User.db.collection('setupLocks').deleteOne({ _id: 'initial-admin', lockId });
            } catch (cleanupError) {
                console.error('No fue posible liberar el bloqueo de configuración inicial:', cleanupError.message);
            }
        }
        if (error.code === 11000) {
            return res.status(409).json({ error: 'El administrador inicial ya fue configurado o el nombre de usuario ya está registrado.' });
        }
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: error.message });
        }
        next(error);
    }
});

router.post('/login', authLimiter, async (req, res, next) => {
    try {
        const { identifier, email, password } = req.body || {};
        const loginIdentifier = typeof identifier === 'string' ? identifier : email;
        if (typeof loginIdentifier !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ error: 'Ingresa tu usuario o correo y contraseña.' });
        }
        const normalizedIdentifier = loginIdentifier.trim().toLowerCase();
        const user = await User.findOne({
            $or: [{ username: normalizedIdentifier }, { email: normalizedIdentifier }]
        })
            .select('+passwordHash');
        if (!user || !user.active || !await bcrypt.compare(password, user.passwordHash)) {
            return res.status(401).json({ error: 'Usuario, correo o contraseña incorrectos.' });
        }
        setSessionCookie(res, user, req);
        res.json({ data: publicUser(user) });
    } catch (error) {
        next(error);
    }
});

router.patch('/profile', requireAuth, async (req, res, next) => {
    try {
        const { personalEmail = '', phone = '', profilePhoto = '' } = req.body || {};
        if (typeof personalEmail !== 'string' ||
            (personalEmail && (personalEmail.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail.trim())))) {
            return res.status(400).json({ error: 'Escribe un correo personal válido.' });
        }
        if (typeof phone !== 'string' || phone.trim().length > 30) {
            return res.status(400).json({ error: 'El teléfono no puede superar 30 caracteres.' });
        }
        if (typeof profilePhoto !== 'string' || profilePhoto.length > 7000000 ||
            (profilePhoto && !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(profilePhoto))) {
            return res.status(400).json({ error: 'La foto debe ser JPG, PNG o WEBP y no superar 5 MB.' });
        }
        if (profilePhoto) {
            const imageData = profilePhoto.slice(profilePhoto.indexOf(',') + 1);
            if (Buffer.from(imageData, 'base64').length > 5 * 1024 * 1024) {
                return res.status(400).json({ error: 'La foto no puede superar 5 MB.' });
            }
        }

        const user = await User.findByIdAndUpdate(req.user.id, {
            personalEmail: personalEmail.trim(),
            phone: phone.trim(),
            profilePhoto
        }, { new: true, runValidators: true }).select('+profilePhoto');
        if (!user) return res.status(404).json({ error: 'No se encontró el perfil de usuario.' });
        res.json({ data: publicUser(user) });
    } catch (error) {
        next(error);
    }
});

router.get('/profile', requireAuth, async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select('+profilePhoto');
        if (!user) return res.status(404).json({ error: 'No se encontró el perfil de usuario.' });
        res.json({ data: publicUser(user) });
    } catch (error) {
        next(error);
    }
});

router.get('/me', requireAuth, (req, res) => {
    res.json({ data: publicUser(req.user) });
});

router.post('/logout', (req, res) => {
    clearSessionCookie(res);
    res.status(204).end();
});

module.exports = router;
