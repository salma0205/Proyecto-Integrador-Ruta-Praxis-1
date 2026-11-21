const { buildModel, setModelRegistry } = require('./oracle-model');

function validate(condition, message) {
    if (!condition) throw Object.assign(new Error(message), { name: 'ValidationError' });
}

function validEmail(value) {
    return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const User = buildModel('User', {
    id: 'id', firstName: 'first_name', middleName: 'middle_name', lastName: 'last_name',
    secondLastName: 'second_last_name', email: 'email', username: 'username',
    passwordHash: 'password_hash', documentNumber: 'document_number', studentCode: 'student_code',
    role: 'role', phone: 'phone', personalEmail: 'personal_email', profilePhoto: 'profile_photo',
    program: 'program_name', programId: 'program_id', semester: 'semester', active: 'active',
    createdAt: 'created_at', updatedAt: 'updated_at'
}, {
    booleans: ['active'],
    required: ['firstName', 'lastName', 'passwordHash', 'role'],
    defaults: { active: true },
    enums: { role: ['administrador', 'estudiante', 'asesor', 'director', 'docente'] },
    maxLength: { firstName: 80, middleName: 80, lastName: 80, secondLastName: 80, email: 254, username: 40, passwordHash: 255, documentNumber: 40, studentCode: 40, role: 20, phone: 30, personalEmail: 254, program: 160, profilePhoto: 7000000 },
    validate(values) {
        validate(values.role === 'administrador' ? /^[a-z0-9._-]{3,40}$/i.test(values.username || '') : Boolean(values.email),
            values.role === 'administrador' ? 'El administrador necesita un nombre de usuario válido.' : 'El correo es obligatorio para roles académicos.');
            validate(values.role === 'director'
                ? Boolean(values.programId)
                : values.role === 'estudiante'
                    ? (!values.program || Boolean(values.programId))
                    : !values.programId && !values.program,
            values.role === 'director'
                ? 'El Director debe tener un programa académico.'
                : values.role === 'estudiante'
                    ? 'El programa académico del Estudiante debe estar registrado.'
                    : 'El programa académico solo se asigna a Directores y Estudiantes.');
        validate(!values.username || /^[a-z0-9._-]{1,40}$/i.test(values.username), 'El nombre de usuario no es válido.');
        validate(validEmail(values.email) && validEmail(values.personalEmail), 'El correo debe tener un formato válido.');
        validate(values.semester == null || (Number(values.semester) >= 1 && Number(values.semester) <= 20), 'El semestre no es válido.');
    },
    links: {
        subjects: { table: null },
        assignedTeachers: { table: ['student_teachers', 'student_id', 'teacher_id'] },
        assignedDirectors: { table: ['student_directors', 'student_id', 'director_id'] }
    },
    references: { programId: 'AcademicProgram' }
});

const Institution = buildModel('Institution', {
    id: 'id', name: 'name', address: 'address', practiceName: 'practice_name',
    advisorName: 'advisor_name', type: 'institution_type', agreementActive: 'agreement_active',
    active: 'active', contactName: 'contact_name', contactEmail: 'contact_email',
    contactPhone: 'contact_phone', createdAt: 'created_at', updatedAt: 'updated_at'
}, {
    booleans: ['agreementActive', 'active'], required: ['name'],
    defaults: { agreementActive: false, active: true },
    maxLength: { name: 180, address: 250, practiceName: 160, advisorName: 160, type: 100, contactName: 160, contactEmail: 254, contactPhone: 30 },
    links: { semesters: { table: ['institution_semesters', 'institution_id', 'semester'] } }
});

const AcademicProgram = buildModel('AcademicProgram', {
    id: 'id', name: 'name', director: 'director_id', active: 'active',
    createdAt: 'created_at', updatedAt: 'updated_at'
}, {
    booleans: ['active'], required: ['name'], defaults: { active: true },
    maxLength: { name: 160 }, links: {
        teachers: { table: ['program_teachers', 'program_id', 'teacher_id'] },
        directors: { table: ['program_directors', 'program_id', 'director_id'] }
    },
    references: { director: 'User' }
});

const AcademicSubject = buildModel('AcademicSubject', {
    id: 'id', name: 'name', code: 'code', semester: 'semester', active: 'active',
    createdAt: 'created_at', updatedAt: 'updated_at'
}, {
    booleans: ['active'], required: ['name', 'code', 'semester'], defaults: { active: true },
    maxLength: { name: 160, code: 40 },
    validate(values) {
        validate(values.semester == null || (Number(values.semester) >= 1 && Number(values.semester) <= 20), 'El semestre no es válido.');
    },
    links: {
        teachers: { table: ['subject_teachers', 'subject_id', 'teacher_id'] },
        students: { table: ['subject_students', 'subject_id', 'student_id'] }
    }
});

const PracticeType = buildModel('PracticeType', {
    id: 'id', name: 'name', semester: 'semester', description: 'description',
    requiredHours: 'required_hours', active: 'active', createdAt: 'created_at', updatedAt: 'updated_at'
}, {
    booleans: ['active'], required: ['name'], defaults: { requiredHours: 0, active: true },
    maxLength: { name: 160, description: 2000 },
    validate(values) {
        validate(values.requiredHours == null || Number(values.requiredHours) >= 0, 'Las horas requeridas no pueden ser negativas.');
    }
});

const PracticeAssignment = buildModel('PracticeAssignment', {
    id: 'id', practiceType: 'practice_type_id', program: 'program_id', student: 'student_id', teacher: 'teacher_id',
    accompanimentResponsible: 'advisor_id', institution: 'institution_id', academicPeriod: 'academic_period',
    startDate: 'start_date', endDate: 'end_date', requiredHours: 'required_hours', status: 'status', approvalStatus: 'approval_status',
    approvalComment: 'approval_comment', approvedBy: 'approved_by', approvedAt: 'approved_at',
    description: 'description', createdAt: 'created_at', updatedAt: 'updated_at'
}, {
    required: ['practiceType', 'program', 'student', 'teacher', 'institution', 'startDate', 'endDate'],
    defaults: { status: 'disponible', approvalStatus: 'pendiente' },
    enums: { status: ['disponible', 'en_curso', 'finalizada', 'cancelada'], approvalStatus: ['pendiente', 'aprobada', 'rechazada'] },
    maxLength: { academicPeriod: 30, approvalComment: 2000, description: 2000 },
    validate(values) {
        validate(!values.startDate || !values.endDate || new Date(values.endDate) >= new Date(values.startDate), 'La fecha final debe ser igual o posterior a la fecha inicial.');
        validate(values.requiredHours == null || (Number(values.requiredHours) >= 0 && Number(values.requiredHours) <= 99999.9), 'Las horas requeridas no son válidas.');
    },
    links: { teachers: { table: ['practice_assignment_teachers', 'assignment_id', 'teacher_id'] } },
    references: {
        practiceType: 'PracticeType', program: 'AcademicProgram', student: 'User', teacher: 'User',
        accompanimentResponsible: 'User', institution: 'Institution', approvedBy: 'User'
    }
});

const Activity = buildModel('Activity', {
    id: 'id', assignment: 'assignment_id', subject: 'subject_id', author: 'author_id',
    kind: 'kind', title: 'title', instructions: 'instructions', dueDate: 'due_date', status: 'status',
    resourceUrl: 'resource_url', createdAt: 'created_at', updatedAt: 'updated_at'
}, {
    required: ['author', 'title', 'instructions'], defaults: { status: 'activa', kind: 'actividad' },
    maxLength: { kind: 20, title: 180, instructions: 5000, resourceUrl: 2048 },
    enums: { status: ['programada', 'activa', 'finalizada'], kind: ['actividad', 'evaluacion'] },
    references: { assignment: 'PracticeAssignment', subject: 'AcademicSubject', author: 'User' }
});

const Submission = buildModel('Submission', {
    id: 'id', activity: 'activity_id', assignment: 'assignment_id', student: 'student_id',
    response: 'response', feedback: 'feedback', score: 'score', submittedAt: 'submitted_at',
    status: 'status', createdAt: 'created_at', updatedAt: 'updated_at'
}, {
    required: ['activity', 'student'], defaults: { status: 'en_revision', submittedAt: new Date() },
    enums: { status: ['pendiente', 'en_revision', 'aprobada', 'requiere_cambios'] },
    maxLength: { response: 10000, feedback: 5000 },
    validate(values) {
        if (values.score !== undefined && values.score !== null) {
            validate(Number(values.score) >= 0 && Number(values.score) <= 5, 'La calificación debe estar entre 0 y 5.');
        }
    },
    references: { activity: 'Activity', assignment: 'PracticeAssignment', student: 'User' },
    links: { evidence: { table: ['submission_evidence', 'submission_id', 'id'] } }
});

const PracticeEvidence = buildModel('PracticeEvidence', {
    id: 'id', assignment: 'assignment_id', student: 'student_id', name: 'name',
    url: 'url', mimeType: 'mime_type', sizeBytes: 'size_bytes', fileData: 'file_data',
    submittedAt: 'submitted_at', createdAt: 'created_at', updatedAt: 'updated_at'
}, {
    required: ['assignment', 'student', 'name'],
    maxLength: { name: 255, url: 2048, mimeType: 100 },
    validate(values) {
        validate(Boolean(values.url || values.fileData), 'La evidencia debe incluir un enlace o un archivo.');
    },
    references: { assignment: 'PracticeAssignment', student: 'User' }
});

const Observation = buildModel('Observation', {
    id: 'id', assignment: 'assignment_id', student: 'student_id', author: 'author_id',
    category: 'category', body: 'body', observedAt: 'observed_at',
    visibleToStudent: 'visible_to_student', createdAt: 'created_at', updatedAt: 'updated_at'
}, {
    booleans: ['visibleToStudent'], required: ['assignment', 'student', 'author', 'body'],
    defaults: { visibleToStudent: true }, maxLength: { category: 100, body: 5000 },
    references: { assignment: 'PracticeAssignment', student: 'User', author: 'User' }
});

const Evaluation = buildModel('Evaluation', {
    id: 'id', assignment: 'assignment_id', student: 'student_id', evaluator: 'evaluator_id',
    activity: 'activity_id', submission: 'submission_id', score: 'score', feedback: 'feedback',
    evaluatedAt: 'evaluated_at', createdAt: 'created_at', updatedAt: 'updated_at'
}, {
    required: ['assignment', 'student', 'evaluator', 'score', 'feedback'],
    maxLength: { feedback: 5000 },
    validate(values) {
        validate(Number(values.score) >= 0 && Number(values.score) <= 5, 'La calificación debe estar entre 0 y 5.');
    },
    references: { assignment: 'PracticeAssignment', student: 'User', evaluator: 'User', activity: 'Activity', submission: 'Submission' }
});

const StudentNotification = buildModel('StudentNotification', {
    id: 'id', recipient: 'recipient_id', actor: 'actor_id', type: 'notification_type',
    title: 'title', message: 'message', view: 'view_name', readAt: 'read_at',
    createdAt: 'created_at', updatedAt: 'updated_at'
}, {
    required: ['recipient', 'type', 'title', 'message', 'view'],
    enums: { type: ['evaluation', 'observation', 'submission', 'practiceLog', 'practice', 'activity'] },
    maxLength: { type: 30, title: 160, message: 1000, view: 60 },
    references: { recipient: 'User', actor: 'User' }
});

const PracticeLog = buildModel('PracticeLog', {
    id: 'id', assignment: 'assignment_id', student: 'student_id', date: 'log_date',
    hours: 'hours', activityDescription: 'activity_description', status: 'status',
    reviewedBy: 'reviewed_by', reviewComment: 'review_comment', createdAt: 'created_at', updatedAt: 'updated_at'
}, {
    required: ['assignment', 'student', 'date', 'hours', 'activityDescription'],
    defaults: { status: 'pendiente' }, enums: { status: ['pendiente', 'aprobada', 'rechazada'] },
    maxLength: { activityDescription: 3000, reviewComment: 2000 },
    validate(values) {
        validate(Number(values.hours) >= 0.1 && Number(values.hours) <= 24, 'Las horas deben estar entre 0.1 y 24.');
    },
    references: { assignment: 'PracticeAssignment', student: 'User', reviewedBy: 'User' }
});

const PracticeVisit = buildModel('PracticeVisit', {
    id: 'id', assignment: 'assignment_id', tutor: 'tutor_id', visitDate: 'visit_date',
    observation: 'observation', agreements: 'agreements', status: 'status',
    createdAt: 'created_at', updatedAt: 'updated_at'
}, {
    required: ['assignment', 'tutor', 'visitDate', 'observation'],
    defaults: { status: 'programada' }, enums: { status: ['programada', 'realizada'] },
    maxLength: { observation: 5000, agreements: 3000 },
    references: { assignment: 'PracticeAssignment', tutor: 'User' }
});

const AttendanceValidation = buildModel('AttendanceValidation', {
    id: 'id', assignment: 'assignment_id', student: 'student_id', advisor: 'advisor_id',
    date: 'validation_date', attendanceStatus: 'attendance_status', performanceScore: 'performance_score',
    comments: 'comments', createdAt: 'created_at', updatedAt: 'updated_at'
}, {
    required: ['assignment', 'student', 'advisor', 'date', 'attendanceStatus', 'performanceScore', 'comments'],
    enums: { attendanceStatus: ['presente', 'ausente', 'tardanza'] },
    maxLength: { comments: 3000 },
    validate(values) {
        validate(Number(values.performanceScore) >= 0 && Number(values.performanceScore) <= 5, 'El desempeño debe estar entre 0 y 5.');
    },
    references: { assignment: 'PracticeAssignment', student: 'User', advisor: 'User' }
});

const AdminAudit = buildModel('AdminAudit', {
    id: 'id', actor: 'actor_id', actorName: 'actor_name', action: 'action',
    entity: 'entity', entityId: 'entity_id', summary: 'summary', createdAt: 'created_at'
}, {
    required: ['actor', 'actorName', 'action', 'entity', 'entityId', 'summary'],
    enums: {
        action: ['created', 'updated', 'deleted', 'activated', 'deactivated'],
        entity: ['user', 'program', 'subject', 'institution', 'practiceType', 'assignment', 'activity', 'submission', 'observation', 'evaluation', 'practiceLog', 'practiceVisit', 'attendanceValidation', 'passwordRecovery']
    },
    maxLength: { actorName: 170, entityId: 80, summary: 300 },
    references: { actor: 'User' }
});

const PasswordRecoveryRequest = buildModel('PasswordRecoveryRequest', {
    id: 'id', fullName: 'full_name', contactEmail: 'contact_email',
    accountIdentifier: 'account_identifier', requestType: 'request_type', status: 'status',
    targetUser: 'target_user_id', handledBy: 'handled_by_id', handledAt: 'handled_at',
    createdAt: 'created_at', updatedAt: 'updated_at'
}, {
    required: ['fullName', 'contactEmail', 'requestType'],
    defaults: { status: 'pendiente' },
    enums: { requestType: ['usuario', 'contrasena', 'ambos'], status: ['pendiente', 'resuelta', 'descartada'] },
    maxLength: { fullName: 160, contactEmail: 254, accountIdentifier: 254 },
    references: { targetUser: 'User', handledBy: 'User' }
});

const models = {
    User, Institution, AcademicProgram, AcademicSubject, PracticeType, PracticeAssignment,
    Activity, Submission, PracticeEvidence, Observation, Evaluation, StudentNotification, PracticeLog,
    PracticeVisit, AttendanceValidation, AdminAudit, PasswordRecoveryRequest
};

setModelRegistry(models);
module.exports = models;
