const allowedSemesters = new Set([8, 9, 10]);

function assertInstitutionData(data, requireAll = false) {
    if (requireAll && (!Array.isArray(data.semesters) || data.semesters.length !== 1)) {
        throw badRequest('Selecciona un semestre entre 8 y 10 para la institución.');
    }
    if (data.semesters !== undefined &&
        (!Array.isArray(data.semesters) || data.semesters.length !== 1 || !allowedSemesters.has(Number(data.semesters[0])))) {
        throw badRequest('La institución debe estar asociada a un único semestre entre 8 y 10.');
    }
    if (requireAll && !data.address) {
        throw badRequest('La dirección de la institución es obligatoria.');
    }
    if (data.address !== undefined &&
        (typeof data.address !== 'string' || !/\bbucaramanga\b/i.test(data.address.trim()))) {
        throw badRequest('La dirección de la institución debe estar ubicada en Bucaramanga.');
    }
}

function badRequest(message) {
    const error = new Error(message);
    error.status = 400;
    return error;
}

module.exports = assertInstitutionData;
