const test = require('node:test');
const assert = require('node:assert/strict');
const {
    User,
    AcademicProgram,
    AcademicSubject,
    PracticeAssignment,
    Activity,
    PracticeEvidence,
    PracticeVisit,
    AttendanceValidation,
    Evaluation,
    PracticeLog,
    AdminAudit
} = require('./index');
const { compileFilter, project } = require('./oracle-model');
const database = require('../config/database');

test('las actividades distinguen evaluaciones y las evidencias requieren enlace o archivo', async () => {
    const activity = {
        author: 'teacher-id',
        title: 'Evaluación de práctica',
        instructions: 'Completa y entrega',
        kind: 'evaluacion'
    };
    await assert.doesNotReject(Activity.validateValues(activity));
    await assert.rejects(Activity.validateValues({ ...activity, kind: 'otro' }), { name: 'ValidationError' });

    await assert.rejects(PracticeEvidence.validateValues({
        assignment: 'assignment-id',
        student: 'student-id',
        name: 'Informe'
    }), { name: 'ValidationError' });
    await assert.doesNotReject(PracticeEvidence.validateValues({
        assignment: 'assignment-id',
        student: 'student-id',
        name: 'Informe',
        fileData: 'YQ=='
    }));
});

test('el modelo Oracle acepta roles académicos y rechaza roles no admitidos', async () => {
    for (const role of ['administrador', 'estudiante', 'asesor', 'director', 'docente']) {
        await assert.doesNotReject(User.validateValues({
            firstName: 'Ada',
            lastName: 'Lovelace',
            passwordHash: 'hash',
            role,
            ...(role === 'administrador' ? { username: 'admin' } : { email: `${role}@example.test` }),
            ...(role === 'director' ? { programId: 'program-id' } : {}),
            ...(role === 'docente' ? { semester: 3 } : {})
        }));
    }

    await assert.rejects(User.validateValues({
        firstName: 'Ada',
        lastName: 'Lovelace',
        passwordHash: 'hash',
        role: 'invitado',
        email: 'ada@example.test'
    }), { name: 'ValidationError' });
});

test('los docentes pueden tener asignaturas de varios semestres sin semestre propio', async () => {
    await assert.doesNotReject(User.validateValues({
        firstName: 'Ada',
        lastName: 'Lovelace',
        passwordHash: 'hash',
        role: 'docente',
        email: 'docente@example.test'
    }));

    await assert.rejects(AcademicSubject.validateValues({
        name: 'Matemáticas',
        code: 'ASG-001'
    }), { name: 'ValidationError' });

    await assert.doesNotReject(AcademicSubject.validateValues({
        name: 'Matemáticas',
        code: 'ASG-001',
        semester: 3
    }));
});

test('Directores y Estudiantes pueden tener programa académico, pero otros roles no', async () => {
    await assert.rejects(User.validateValues({
        firstName: 'Ada',
        lastName: 'Lovelace',
        passwordHash: 'hash',
        role: 'director',
        email: 'director@example.test'
    }), { name: 'ValidationError' });

    await assert.doesNotReject(User.validateValues({
        firstName: 'Ada',
        lastName: 'Lovelace',
        passwordHash: 'hash',
        role: 'estudiante',
        email: 'student@example.test',
        programId: 'program-id',
        program: 'Programa',
        semester: 8
    }));

    await assert.rejects(User.validateValues({
        firstName: 'Ada',
        lastName: 'Lovelace',
        passwordHash: 'hash',
        role: 'docente',
        email: 'docente@example.test',
        semester: 8,
        programId: 'program-id',
        program: 'Programa'
    }), { name: 'ValidationError' });

    await assert.rejects(User.validateValues({
        firstName: 'Ada',
        lastName: 'Lovelace',
        passwordHash: 'hash',
        role: 'estudiante',
        email: 'student@example.test',
        program: 'Programa heredado'
    }), { name: 'ValidationError' });
});

test('las asignaciones Oracle requieren tipo, actores, institución y fechas', async () => {
    await assert.rejects(PracticeAssignment.validateValues({
        student: 'student-id',
        teacher: 'teacher-id'
    }), { name: 'ValidationError' });

    await assert.rejects(PracticeAssignment.validateValues({
        practiceType: 'type-id',
        student: 'student-id',
        teacher: 'teacher-id',
        institution: 'institution-id',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-10')
    }), { name: 'ValidationError' });

    await assert.doesNotReject(PracticeAssignment.validateValues({
        practiceType: 'type-id',
        program: 'program-id',
        student: 'student-id',
        teacher: 'teacher-id',
        institution: 'institution-id',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-10'),
        requiredHours: 120,
        approvalStatus: 'pendiente'
    }));

    await assert.rejects(PracticeAssignment.validateValues({
        practiceType: 'type-id',
        program: 'program-id',
        student: 'student-id',
        teacher: 'teacher-id',
        institution: 'institution-id',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-10'),
        requiredHours: -1
    }), { name: 'ValidationError' });

    await assert.rejects(PracticeAssignment.validateValues({
        practiceType: 'type-id',
        student: 'student-id',
        teacher: 'teacher-id',
        institution: 'institution-id',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-10'),
        approvalStatus: 'en_revision'
    }), { name: 'ValidationError' });
});

test('visitas y validaciones de asistencia conservan los estados aceptados por el flujo', async () => {
    await assert.doesNotReject(PracticeVisit.validateValues({
        assignment: 'assignment-id',
        tutor: 'tutor-id',
        visitDate: new Date(),
        observation: 'Seguimiento realizado.',
        status: 'realizada'
    }));
    await assert.rejects(PracticeVisit.validateValues({
        assignment: 'assignment-id',
        tutor: 'tutor-id',
        visitDate: new Date(),
        observation: 'Seguimiento realizado.',
        status: 'cancelada'
    }), { name: 'ValidationError' });

    await assert.doesNotReject(AttendanceValidation.validateValues({
        assignment: 'assignment-id',
        student: 'student-id',
        advisor: 'advisor-id',
        date: new Date(),
        attendanceStatus: 'presente',
        performanceScore: 4.5,
        comments: 'Cumplió lo esperado.'
    }));
    await assert.rejects(AttendanceValidation.validateValues({
        assignment: 'assignment-id',
        student: 'student-id',
        advisor: 'advisor-id',
        date: new Date(),
        attendanceStatus: 'presente',
        performanceScore: 5.1,
        comments: 'Fuera de rango.'
    }), { name: 'ValidationError' });
});

test('las horas y evaluaciones mantienen los rangos definidos para la práctica', async () => {
    const evaluation = {
        assignment: 'assignment-id',
        student: 'student-id',
        evaluator: 'teacher-id',
        score: 6,
        feedback: 'Fuera de rango.'
    };
    await assert.rejects(Evaluation.validateValues(evaluation), { name: 'ValidationError' });

    await assert.rejects(PracticeLog.validateValues({
        assignment: 'assignment-id',
        student: 'student-id',
        date: new Date(),
        hours: 25,
        activityDescription: 'Fuera de rango.'
    }), { name: 'ValidationError' });
});

test('la auditoría acepta acciones válidas y rechaza acciones desconocidas', async () => {
    const entry = {
        actor: 'admin-id',
        actorName: 'Ada Lovelace',
        action: 'deactivated',
        entity: 'user',
        entityId: 'target-id',
        summary: 'Desactivó la cuenta.'
    };
    await assert.doesNotReject(AdminAudit.validateValues(entry));
    await assert.rejects(AdminAudit.validateValues({ ...entry, action: 'viewed' }), { name: 'ValidationError' });
});

test('los modelos relacionales Oracle no requieren conexión para validar reglas locales', async () => {
    assert.equal(PracticeVisit.table, 'practice_visits');
    assert.equal(AttendanceValidation.table, 'attendance_validations');
    assert.equal(PracticeAssignment.fields.accompanimentResponsible, 'advisor_id');
});

test('countDocuments ejecuta la consulta Oracle y devuelve el total', async () => {
    const execute = database.execute;
    database.execute = async (sql, binds) => {
        assert.match(sql, /SELECT COUNT\(\*\) AS count FROM users/);
        assert.deepEqual(binds, {});
        return { rows: [{ COUNT: 3 }] };
    };
    try {
        assert.equal(await User.countDocuments(), 3);
    } finally {
        database.execute = execute;
    }
});

test('las actualizaciones de usuario incluyen campos ocultos al validar', async () => {
    const execute = database.execute;
    let phone = null;
    database.execute = async (sql, binds) => {
        if (sql.startsWith('SELECT t.* FROM users')) {
            return {
                rows: [{
                    ID: 'admin-id',
                    FIRST_NAME: 'Ada',
                    LAST_NAME: 'Lovelace',
                    USERNAME: 'admin',
                    PASSWORD_HASH: 'hashed-password',
                    ROLE: 'administrador',
                    ACTIVE: 1,
                    PHONE: phone
                }]
            };
        }
        if (sql.startsWith('SELECT subject_id FROM subject_students')) return { rows: [] };
        if (sql.startsWith('SELECT teacher_id AS value FROM student_teachers')) return { rows: [] };
        if (sql.startsWith('SELECT director_id AS value FROM student_directors')) return { rows: [] };
        if (sql.startsWith('UPDATE users SET')) {
            assert.match(sql, /phone = :v_phone/);
            assert.equal(binds.v_phone, '555-0100');
            phone = binds.v_phone;
            return { rowsAffected: 1 };
        }
        throw new Error(`Consulta inesperada: ${sql}`);
    };
    try {
        const updated = await User.updateById('admin-id', { phone: '555-0100' });
        assert.equal(updated.phone, '555-0100');
    } finally {
        database.execute = execute;
    }
});

test('el filtro Oracle compila booleanos, relaciones muchos-a-muchos y búsquedas por texto', () => {
    const query = compileFilter(User, {
        active: true,
        subjects: { $in: ['subject-a', 'subject-b'] },
        $or: [{ email: /ada/i }, { username: /ada/i }]
    });

    assert.match(query.where, /t\.active = :b0/);
    assert.match(query.where, /subject_teachers/);
    assert.match(query.where, /REGEXP_LIKE/);
    assert.deepEqual(Object.values(query.binds), [1, 'subject-a', 'subject-b', 'ada', 'ada']);
});

test('el filtro Oracle admite programas vinculados y nombres heredados sin identificador', () => {
    const query = compileFilter(User, {
        role: 'estudiante',
        active: true,
        semester: 8,
        $or: [
            { programId: 'program-id' },
            { programId: null, program: 'ACADEMICO' }
        ]
    });

    assert.match(query.where, /t\.program_id = :b\d+/);
    assert.match(query.where, /t\.program_id IS NULL/);
    assert.match(query.where, /t\.program_name = :b\d+/);
    assert.deepEqual(Object.values(query.binds), ['estudiante', 1, 8, 'program-id', 'ACADEMICO']);
});

test('los filtros Oracle reconocen las asignaciones académicas y las prácticas compartidas', () => {
    const studentFilter = compileFilter(User, { assignedTeachers: 'teacher-id' });
    assert.match(studentFilter.where, /student_teachers/);
    assert.match(studentFilter.where, /teacher_id IN/);

    const directorFilter = compileFilter(User, { assignedDirectors: 'director-id' });
    assert.match(directorFilter.where, /student_directors/);
    assert.match(directorFilter.where, /director_id IN/);

    const programDirectorFilter = compileFilter(AcademicProgram, { directors: 'director-id' });
    assert.match(programDirectorFilter.where, /program_directors/);
    assert.match(programDirectorFilter.where, /director_id IN/);

    const practiceFilter = compileFilter(PracticeAssignment, { teachers: 'teacher-id' });
    assert.match(practiceFilter.where, /practice_assignment_teachers/);
    assert.match(practiceFilter.where, /teacher_id IN/);
});

test('las consultas Oracle omiten hash y foto salvo selección explícita', () => {
    const user = {
        _id: 'uuid', id: 'uuid', firstName: 'Ada',
        passwordHash: 'secret-hash', profilePhoto: 'data:image/png;base64,abc'
    };

    assert.deepEqual(project(user), { _id: 'uuid', id: 'uuid', firstName: 'Ada' });
    assert.equal(project(user, '+profilePhoto').profilePhoto, user.profilePhoto);
    assert.equal(project(user, '+profilePhoto').passwordHash, undefined);
});
