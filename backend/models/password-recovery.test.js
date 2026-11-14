const test = require('node:test');
const assert = require('node:assert/strict');
const { PasswordRecoveryRequest } = require('./index');

test('las solicitudes de recuperación guardan la información necesaria sin una contraseña', async () => {
    const request = new PasswordRecoveryRequest({
        fullName: 'Ada Lovelace',
        contactEmail: 'ada@example.test',
        requestType: 'ambos'
    });

    await assert.doesNotReject(request.validate());
    assert.equal(request.status, 'pendiente');
    assert.equal(request.password, undefined);
    assert.equal(request.passwordHash, undefined);
});

test('las solicitudes solo aceptan tipos de recuperación permitidos', async () => {
    const request = new PasswordRecoveryRequest({
        fullName: 'Ada Lovelace',
        contactEmail: 'ada@example.test',
        requestType: 'restablecer-todo'
    });

    await assert.rejects(request.validate(), { name: 'ValidationError' });
});
