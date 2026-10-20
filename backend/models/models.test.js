const test = require('node:test');
const assert = require('node:assert/strict');
const {
    User,
    AcademicProgram,
    AcademicSubject,
    PracticeAssignment,
    Evaluation,
    PracticeLog,
    AdminAudit
} = require('./index');

test('usuarios aceptan administrador y los cuatro roles académicos', async () => {
    const valid = new User({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.test',
        role: 'estudiante',
        passwordHash: 'hashed-password'
    });
    await assert.doesNotReject(valid.validate());

    for (const role of ['asesor', 'director', 'docente']) {
        const account = new User({
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: `${role}@example.test`,
            role,
            passwordHash: 'hashed-password'
        });
        await assert.doesNotReject(account.validate());
    }

    const invalid = new User({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.test',
        role: 'invitado',
        passwordHash: 'hashed-password'
    });
    await assert.rejects(invalid.validate(), { name: 'ValidationError' });
});

test('los programas académicos requieren nombre y permiten director pendiente y docentes', async () => {
    const program = new AcademicProgram({ name: 'Licenciatura en Educación' });
    await assert.doesNotReject(program.validate());

    program.teachers = ['507f1f77bcf86cd799439013'];
    await assert.doesNotReject(program.validate());

    const missingName = new AcademicProgram({});
    await assert.rejects(missingName.validate(), { name: 'ValidationError' });
});

test('el administrador puede autenticarse con usuario y no necesita correo', async () => {
    const administrator = new User({
        firstName: 'Ada',
        lastName: 'Lovelace',
        username: 'admin',
        role: 'administrador',
        passwordHash: 'hashed-password'
    });
    await assert.doesNotReject(administrator.validate());

    const invalidUsername = new User({
        firstName: 'Ada',
        lastName: 'Lovelace',
        username: 'admin@',
        role: 'administrador',
        passwordHash: 'hashed-password'
    });
    await assert.rejects(invalidUsername.validate(), { name: 'ValidationError' });
});

test('docentes y estudiantes necesitan un correo con formato válido', async () => {
    const missingEmail = new User({
        firstName: 'Ada',
        lastName: 'Lovelace',
        role: 'docente',
        passwordHash: 'hashed-password'
    });
    await assert.rejects(missingEmail.validate(), { name: 'ValidationError' });

    const invalidEmail = new User({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'docente-sin-arroba',
        role: 'estudiante',
        passwordHash: 'hashed-password'
    });
    await assert.rejects(invalidEmail.validate(), { name: 'ValidationError' });
});

test('el correo personal del perfil es opcional pero debe tener formato válido', async () => {
    const valid = new User({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.test',
        personalEmail: 'ada.personal@example.test',
        role: 'docente',
        passwordHash: 'hashed-password'
    });
    await assert.doesNotReject(valid.validate());

    valid.personalEmail = 'correo-invalido';
    await assert.rejects(valid.validate(), { name: 'ValidationError' });
});

test('las asignaturas académicas requieren código y nombre', async () => {
    const valid = new AcademicSubject({
        name: 'Pedagogía',
        code: 'PED-001',
        semester: 1,
        teachers: ['507f1f77bcf86cd799439013'],
        students: ['507f1f77bcf86cd799439012']
    });
    await assert.doesNotReject(valid.validate());

    const invalid = new AcademicSubject({ name: 'Pedagogía' });
    await assert.rejects(invalid.validate(), { name: 'ValidationError' });
});

test('la asignacion de practica requiere sus relaciones y fechas', async () => {
    const assignment = new PracticeAssignment({
        practiceType: '507f1f77bcf86cd799439011',
        student: '507f1f77bcf86cd799439012',
        teacher: '507f1f77bcf86cd799439013',
        institution: '507f1f77bcf86cd799439014',
        startDate: '2026-06-10',
        endDate: '2026-06-01'
    });

    await assert.rejects(assignment.validate(), { name: 'ValidationError' });
});

test('las asignaciones esperan aprobación del director y guardan decisiones válidas', async () => {
    const assignment = new PracticeAssignment({
        practiceType: '507f1f77bcf86cd799439011',
        student: '507f1f77bcf86cd799439012',
        teacher: '507f1f77bcf86cd799439013',
        institution: '507f1f77bcf86cd799439014',
        startDate: '2026-06-01',
        endDate: '2026-06-10'
    });
    assert.equal(assignment.approvalStatus, 'pendiente');
    assignment.approvalStatus = 'aprobada';
    assignment.approvalComment = 'Aprobada por el programa.';
    await assert.doesNotReject(assignment.validate());
    assignment.approvalStatus = 'en_revision';
    await assert.rejects(assignment.validate(), { name: 'ValidationError' });
});

test('las evaluaciones limitan la nota entre cero y cinco', async () => {
    const evaluation = new Evaluation({
        assignment: '507f1f77bcf86cd799439011',
        student: '507f1f77bcf86cd799439012',
        evaluator: '507f1f77bcf86cd799439013',
        score: 6,
        feedback: 'Retroalimentacion'
    });

    await assert.rejects(evaluation.validate(), { name: 'ValidationError' });
});

test('el registro de seguimiento valida el rango de horas diario', async () => {
    const log = new PracticeLog({
        assignment: '507f1f77bcf86cd799439011',
        student: '507f1f77bcf86cd799439012',
        date: '2026-06-10',
        hours: 25,
        activityDescription: 'Actividad de practica'
    });

    await assert.rejects(log.validate(), { name: 'ValidationError' });
});

test('la auditoría administrativa exige actor, acción y detalle válidos', async () => {
    const entry = new AdminAudit({
        actor: '507f1f77bcf86cd799439011',
        actorName: 'Ada Lovelace',
        action: 'deactivated',
        entity: 'user',
        entityId: '507f1f77bcf86cd799439012',
        summary: 'Desactivó user: Ada Lovelace'
    });
    await assert.doesNotReject(entry.validate());

    entry.action = 'viewed';
    await assert.rejects(entry.validate(), { name: 'ValidationError' });
});
