const jwt = require('jsonwebtoken');
const { User } = require('../models');

const sessionSecret = process.env.JWT_SECRET || require('node:crypto').randomBytes(32).toString('hex');
const cookieName = 'ruta_praxis_session';

function readToken(req) {
    const cookies = (req.headers.cookie || '').split(';');
    const sessionCookie = cookies.map(cookie => cookie.trim()).find(cookie => cookie.startsWith(`${cookieName}=`));
    return sessionCookie ? decodeURIComponent(sessionCookie.slice(cookieName.length + 1)) : '';
}

async function requireAuth(req, res, next) {
    const token = readToken(req);
    if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar.' });

    try {
        const payload = jwt.verify(token, sessionSecret);
        const user = await User.findById(payload.sub).select('firstName middleName lastName secondLastName email username documentNumber studentCode role active phone personalEmail program programId semester');
        if (!user || !user.active) {
            res.clearCookie(cookieName, { httpOnly: true, sameSite: 'strict', path: '/' });
            return res.status(401).json({ error: 'La sesión ya no es válida.' });
        }
        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            res.clearCookie(cookieName, { httpOnly: true, sameSite: 'strict', path: '/' });
            return res.status(401).json({ error: 'La sesión ha expirado. Inicia sesión de nuevo.' });
        }
        next(error);
    }
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'No tienes permisos para realizar esta acción.' });
        }
        next();
    };
}

function setSessionCookie(res, user, req) {
    const token = jwt.sign(
        { sub: user.id, role: user.role },
        sessionSecret,
        { expiresIn: '8h' }
    );
    res.cookie(cookieName, token, {
        httpOnly: true,
        secure: req.secure,
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000,
        path: '/'
    });
}

function clearSessionCookie(res) {
    res.clearCookie(cookieName, { httpOnly: true, sameSite: 'strict', path: '/' });
}

module.exports = { requireAuth, requireRole, setSessionCookie, clearSessionCookie };
