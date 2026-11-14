require('dotenv').config({ path: require('node:path').resolve(__dirname, '../../.env') });

const readline = require('node:readline/promises');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { User } = require('../models');
const { isValidPassword } = require('../utils/password');

async function askLine(prompt) {
    const terminal = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    try {
        return await terminal.question(prompt);
    } finally {
        terminal.close();
    }
}

function askHidden(prompt) {
    if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') {
        throw new Error('Ejecuta este comando desde una terminal interactiva de PowerShell.');
    }

    return new Promise((resolve, reject) => {
        let value = '';
        const finish = (error) => {
            process.stdin.removeListener('data', onData);
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdout.write('\n');
            if (error) reject(error);
            else resolve(value);
        };
        const onData = chunk => {
            for (const character of chunk) {
                if (character === '\u0003' || character === '\u0004') {
                    finish(new Error('Operación cancelada.'));
                    return;
                }
                if (character === '\r' || character === '\n') {
                    finish();
                    return;
                }
                if (character === '\u0008' || character === '\u007f') {
                    value = Array.from(value).slice(0, -1).join('');
                } else if (character >= ' ' && character !== '\u001b') {
                    value += character;
                }
            }
        };

        process.stdout.write(prompt);
        process.stdin.setEncoding('utf8');
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', onData);
    });
}

async function main() {
    if (!process.env.MONGODB_URI) {
        throw new Error('No se encontró MONGODB_URI en el archivo .env de la raíz del proyecto.');
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI);
    } catch {
        throw new Error('No se pudo conectar a MongoDB. Verifica MONGODB_URI y que Atlas permita tu IP actual.');
    }

    const administrators = await User.find({ role: 'administrador' })
        .select('username active')
        .sort({ username: 1 })
        .lean();
    if (!administrators.length) {
        throw new Error('No hay cuentas administradoras para restablecer.');
    }

    console.log('Cuentas administradoras encontradas:');
    for (const administrator of administrators) {
        console.log(`- ${administrator.username}${administrator.active ? '' : ' (inactiva)'}`);
    }

    const username = (await askLine('Escribe el usuario exacto que quieres restablecer: ')).trim().toLowerCase();
    const administrator = administrators.find(account => account.username === username);
    if (!administrator) {
        throw new Error('No se encontró una cuenta administradora con ese usuario.');
    }
    if (!administrator.active) {
        throw new Error('La cuenta está inactiva. Este proceso cambia la contraseña, pero no reactiva cuentas.');
    }

    const confirmation = await askLine(`Para confirmar que es la cuenta correcta, escribe "${username}": `);
    if (confirmation.trim().toLowerCase() !== username) {
        throw new Error('La confirmación no coincide. No se hicieron cambios.');
    }

    const password = await askHidden('Nueva contraseña (1 a 10 caracteres, no se mostrará): ');
    if (!isValidPassword(password)) {
        throw new Error('La contraseña debe tener entre 1 y 10 caracteres.');
    }
    const confirmationPassword = await askHidden('Repite la nueva contraseña: ');
    if (password !== confirmationPassword) {
        throw new Error('Las contraseñas no coinciden. No se hicieron cambios.');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await User.updateOne(
        { _id: administrator._id, role: 'administrador' },
        { $set: { passwordHash } }
    );
    if (result.matchedCount !== 1) {
        throw new Error('La cuenta cambió durante el proceso; no se pudo actualizar la contraseña.');
    }

    console.log(`Contraseña actualizada para "${username}". Ya puedes iniciar sesión.`);
}

main()
    .catch(error => {
        console.error(`No se completó el restablecimiento: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    });
