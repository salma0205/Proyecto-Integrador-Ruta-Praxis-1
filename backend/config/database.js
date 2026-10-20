const mongoose = require('mongoose');

async function connectDatabase() {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ruta_praxis';
    await mongoose.connect(uri);
    console.log(`MongoDB conectado: ${mongoose.connection.name}`);
}

module.exports = connectDatabase;
