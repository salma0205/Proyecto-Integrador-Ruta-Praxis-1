const test = require('node:test');
const assert = require('node:assert/strict');
const { PasswordRecoveryRequest } = require('./index');

test('las solicitudes de recuperación guardan la información necesaria sin una contraseña', async () => {
    const request = {
        fullName: 'Ada Lovelace',
        contactEmail: 'ada@example.test',
        requestType: 'ambos'
    };

    await assert.doesNotReject(PasswordRecoveryRequest.validateValues(request));
    assert.equal(PasswordRecoveryRequest.defaults.status, 'pendiente');
    assert.equal('password' in request, false);
    assert.equal('passwordHash' in request, false);
});

test('las solicitudes solo aceptan tipos de recuperación permitidos', async () => {
    const request = {
        fullName: 'Ada Lovelace',
        contactEmail: 'ada@example.test',
        requestType: 'restablecer-todo'
    };

    await assert.rejects(PasswordRecoveryRequest.validateValues(request), { name: 'ValidationError' });
});
