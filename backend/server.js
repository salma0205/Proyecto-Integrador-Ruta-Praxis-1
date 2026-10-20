require('dotenv').config();

const path = require('node:path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const connectDatabase = require('./config/database');
const authRouter = require('./routes/auth');
const apiRouter = require('./routes/api');
const workflowRouter = require('./routes/workflow');

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
if (process.env.CORS_ORIGIN) {
    app.use(cors({ origin: process.env.CORS_ORIGIN }));
}
app.use(express.json({ limit: '7mb' }));

app.get('/api/health', (req, res) => {
    const mongoose = require('mongoose');
    res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

app.use('/api/auth', authRouter);
app.use('/api/workflow', workflowRouter);
app.use('/api', apiRouter);
app.get('/', (req, res) => res.redirect('/html/index.html'));
app.use(express.static(path.resolve(__dirname, '..')));

app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada.' });
});

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) console.error(error);
    res.status(status).json({
        error: status >= 500 ? 'Error interno del servidor.' : error.message
    });
});

async function startServer() {
    try {
        await connectDatabase();
        app.listen(port, host, () => {
            console.log(`Ruta Praxis disponible en http://${host}:${port}`);
        });
    } catch (error) {
        console.error('No fue posible iniciar el backend o conectar MongoDB:', error.message);
        process.exitCode = 1;
    }
}

startServer();
