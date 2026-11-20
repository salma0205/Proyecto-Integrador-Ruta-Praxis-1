const test = require('node:test');
const assert = require('node:assert/strict');
const assertInstitutionData = require('./institution-validation');

test('institutions require a Bucaramanga address and one semester from 8 to 10', () => {
    for (const semester of [8, 9, 10]) {
        assert.doesNotThrow(() => assertInstitutionData({
            name: 'Institución de prueba',
            address: 'Calle 10, Bucaramanga',
            semesters: [semester]
        }, true));
    }

    assert.throws(() => assertInstitutionData({
        address: 'Calle 10, Bogotá',
        semesters: [8]
    }, true), { status: 400 });
    assert.throws(() => assertInstitutionData({
        address: 'Calle 10, Bucaramanga',
        semesters: [7]
    }, true), { status: 400 });
    assert.throws(() => assertInstitutionData({
        address: 'Calle 10, Bucaramanga',
        semesters: [8, 9]
    }, true), { status: 400 });
});

test('partial institution status changes remain valid', () => {
    assert.doesNotThrow(() => assertInstitutionData({ active: false }));
});
