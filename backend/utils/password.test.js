const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidPassword } = require('./password');

test('las contraseñas aceptan entre 1 y 10 caracteres', () => {
    assert.equal(isValidPassword(''), false);
    assert.equal(isValidPassword('a'), true);
    assert.equal(isValidPassword('1234567890'), true);
    assert.equal(isValidPassword('12345678901'), false);
    assert.equal(isValidPassword(undefined), false);
});
