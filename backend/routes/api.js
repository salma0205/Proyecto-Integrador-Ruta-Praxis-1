const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const {
    User,
    Institution,
    AcademicProgram,
    AcademicSubject,
    PracticeType,
    PracticeAssignment,
    Activity,
    Submission,
    Observation,
    Evaluation,
    PracticeLog,
    AdminAudit,
    PasswordRecoveryRequest
} = require('../models');
const { requireAuth, requireRole } = require('../middleware/auth');
const { isValidPassword } = require('../utils/password');
const syncUserProgramAssignments = require('../utils/sync-user-program-assignments');
const assertInstitutionData = require('../utils/institution-validation');

const router = express.Router();

router.get('/teacher/students', requireAuth, requireRole('docente'), async (req, res, next) => {
    try {
        const teacher = await User.findById(req.user.id).select('_id');
        if (!teacher) return res.status(404).json({ error: 'No se encontró el usuario docente.' });
        const [students, assignments] = await Promise.all([
            User.find({ role: 'estudiante', active: true, assignedTeachers: teacher._id })
                .select('firstName middleName lastName secondLastName email studentCode semester')
                .sort({ lastName: 1, firstName: 1 }),
            PracticeAssignment.find({ teachers: teacher._id })
                .populate('student', 'firstName middleName lastName secondLastName email studentCode semester active')
                .populate('practiceType', 'name semester')
        ]);
        const practiceByStudent = new Map();
        assignments.filter(assignment => assignment.student && assignment.student.active !== false)
            .forEach(assignment => {
                const studentId = String(assignment.student._id);
                if (!practiceByStudent.has(studentId)) practiceByStudent.set(studentId, []);
                practiceByStudent.get(studentId).push({
                    name: assignment.practiceType?.name || 'Práctica',
                    semester: assignment.practiceType?.semester || assignment.student.semester || null
                });
            });
        const data = students.flatMap(student => {
            const practices = practiceByStudent.get(String(student._id)) || [{ name: 'Sin práctica asignada', semester: student.semester }];
            return practices.map(practice => ({
                    _id: student._id,
                    firstName: student.firstName,
                    middleName: student.middleName || '',
                    lastName: student.lastName,
                    secondLastName: student.secondLastName || '',
                    email: student.email || '',
                    studentCode: student.studentCode || '',
                    semester: student.semester || practice.semester || null,
                    practice
                }));
        });
        res.json({ data });
    } catch (error) {
        next(error);
    }
});

router.use(requireAuth, requireRole('administrador'));

async function registrarAuditoria(req, action, entity, document, summary) {
    const actorName = [req.user.firstName, req.user.middleName, req.user.lastName, req.user.secondLastName]
        .filter(Boolean).join(' ');
    try {
        await AdminAudit.create({
            actor: req.user._id,
            actorName: actorName || 'Administrador',
            action,
            entity,
            entityId: String(document._id),
            summary
        });
    } catch (error) {
        console.error('No se pudo registrar la auditoría administrativa:', error);
        throw Object.assign(new Error('El cambio se guardó, pero no se pudo registrar en el historial de auditoría.'), { status: 503 });
    }
}

router.get('/admin/summary', async (req, res, next) => {
    try {
        const [
            totalUsers,
            activeUsers,
            activeSubjects,
            activeInstitutions,
            activeAssignments,
            assignments,
            approvedLogs,
            evaluatedAssignments,
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ active: true }),
            AcademicSubject.countDocuments({ active: true }),
            Institution.countDocuments({ active: true }),
            PracticeAssignment.countDocuments({ status: 'en_curso' }),
            PracticeAssignment.find().select('practiceType requiredHours').populate('practiceType', 'requiredHours').limit(1000),
            PracticeLog.find({ status: 'aprobada' }).select('hours'),
            Evaluation.distinct('assignment')
        ]);
        const requiredHours = assignments.reduce((sum, item) =>
            sum + (Number(item.requiredHours) || Number(item.practiceType?.requiredHours) || 0), 0);
        const approvedHours = approvedLogs.reduce((sum, item) => sum + item.hours, 0);
        res.json({
            data: {
                totalUsers,
                activeUsers,
                activeSubjects,
                activeInstitutions,
                activeAssignments,
                pendingApprovals: await PracticeAssignment.countDocuments({ approvalStatus: 'pendiente' }),
                approvedHours,
                requiredHours,
                hoursPercent: requiredHours ? Math.min(100, Math.round(approvedHours / requiredHours * 100)) : 0,
                evaluationCoverage: assignments.length
                    ? Math.round(evaluatedAssignments.length / assignments.length * 100)
                    : 0
            }
        });
    } catch (error) {
        next(error);
    }
});

router.get('/admin/recovery-requests', async (req, res, next) => {
    try {
        const [requests, pendingCount] = await Promise.all([
            PasswordRecoveryRequest.find()
                .sort({ createdAt: -1 })
                .limit(100)
                .populate('targetUser', 'firstName lastName username email role')
                .lean(),
            PasswordRecoveryRequest.countDocuments({ status: 'pendiente' })
        ]);
        res.json({ data: requests, pendingCount });
    } catch (error) {
        next(error);
    }
});

router.post('/admin/recovery-requests/:id/reset', async (req, res, next) => {
    try {
        const { identifier, password } = req.body || {};
        const normalizedIdentifier = typeof identifier === 'string' ? identifier.trim().toLowerCase() : '';
        if (!normalizedIdentifier || normalizedIdentifier.length > 254) {
            return res.status(400).json({ error: 'Escribe el correo o nombre de usuario exacto de la cuenta verificada.' });
        }
        if (!isValidPassword(password)) {
            return res.status(400).json({ error: 'La contraseña debe tener entre 1 y 10 caracteres.' });
        }

        const recoveryRequest = await PasswordRecoveryRequest.findById(req.params.id);
        if (!recoveryRequest) return res.status(404).json({ error: 'No se encontró la solicitud de recuperación.' });
        if (recoveryRequest.status !== 'pendiente') {
            return res.status(409).json({ error: 'Esta solicitud ya fue atendida.' });
        }
        if (recoveryRequest.requestType === 'usuario') {
            return res.status(409).json({ error: 'Esta solicitud es solo para recuperar el usuario, no para cambiar la contraseña.' });
        }

        const user = await User.findOne({
            $or: [{ username: normalizedIdentifier }, { email: normalizedIdentifier }]
        });
        if (!user) return res.status(404).json({ error: 'No se encontró una cuenta con ese correo o nombre de usuario.' });
        if (!user.active) {
            return res.status(409).json({ error: 'La cuenta está inactiva. Actívala antes de restablecer el acceso.' });
        }

        user.passwordHash = await bcrypt.hash(password, 12);
        await user.save();

        recoveryRequest.status = 'resuelta';
        recoveryRequest.targetUser = user._id;
        recoveryRequest.handledBy = req.user._id;
        recoveryRequest.handledAt = new Date();
        await recoveryRequest.save();
        await registrarAuditoria(
            req,
            'updated',
            'passwordRecovery',
            recoveryRequest,
            `Restableció el acceso de ${user.username || user.email || user._id}`
        );

        res.json({
            data: {
                ...recoveryRequest.toObject(),
                targetUser: {
                    username: user.username || '',
                    email: user.email || '',
                    role: user.role
                }
            }
        });
    } catch (error) {
        sendDatabaseError(error, next);
    }
});

router.post('/admin/recovery-requests/:id/identify-username', async (req, res, next) => {
    try {
        const { identifier } = req.body || {};
        const normalizedIdentifier = typeof identifier === 'string' ? identifier.trim().toLowerCase() : '';
        if (!normalizedIdentifier || normalizedIdentifier.length > 254) {
            return res.status(400).json({ error: 'Escribe el correo o nombre de usuario exacto de la cuenta verificada.' });
        }

        const recoveryRequest = await PasswordRecoveryRequest.findById(req.params.id);
        if (!recoveryRequest) return res.status(404).json({ error: 'No se encontró la solicitud de recuperación.' });
        if (recoveryRequest.status !== 'pendiente') {
            return res.status(409).json({ error: 'Esta solicitud ya fue atendida.' });
        }
        if (recoveryRequest.requestType !== 'usuario') {
            return res.status(409).json({ error: 'Esta acción solo aplica a solicitudes de nombre de usuario.' });
        }

        const user = await User.findOne({
            $or: [{ username: normalizedIdentifier }, { email: normalizedIdentifier }]
        });
        if (!user) return res.status(404).json({ error: 'No se encontró una cuenta con ese correo o nombre de usuario.' });
        if (!user.active) {
            return res.status(409).json({ error: 'La cuenta está inactiva. Actívala antes de resolver la solicitud.' });
        }

        recoveryRequest.status = 'resuelta';
        recoveryRequest.targetUser = user._id;
        recoveryRequest.handledBy = req.user._id;
        recoveryRequest.handledAt = new Date();
        await recoveryRequest.save();
        await registrarAuditoria(
            req,
            'updated',
            'passwordRecovery',
            recoveryRequest,
            `Identificó el usuario de una solicitud de ${recoveryRequest.fullName}`
        );

        res.json({
            data: {
                status: recoveryRequest.status,
                targetUser: {
                    username: user.username || '',
                    email: user.email || '',
                    role: user.role
                }
            }
        });
    } catch (error) {
        sendDatabaseError(error, next);
    }
});

router.patch('/admin/recovery-requests/:id', async (req, res, next) => {
    try {
        if (req.body?.status !== 'descartada') {
            return res.status(400).json({ error: 'Solo se puede descartar una solicitud pendiente.' });
        }
        const recoveryRequest = await PasswordRecoveryRequest.findById(req.params.id);
        if (!recoveryRequest) return res.status(404).json({ error: 'No se encontró la solicitud de recuperación.' });
        if (recoveryRequest.status !== 'pendiente') {
            return res.status(409).json({ error: 'Esta solicitud ya fue atendida.' });
        }

        recoveryRequest.status = 'descartada';
        recoveryRequest.handledBy = req.user._id;
        recoveryRequest.handledAt = new Date();
        await recoveryRequest.save();
        await registrarAuditoria(
            req,
            'updated',
            'passwordRecovery',
            recoveryRequest,
            `Descartó solicitud de recuperación de ${recoveryRequest.fullName}`
        );
        res.json({ data: recoveryRequest });
    } catch (error) {
        sendDatabaseError(error, next);
    }
});

router.get('/admin/users', async (req, res, next) => {
    try {
        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
        const filter = {};
        const search = String(req.query.search || '').trim().slice(0, 100);
        const role = String(req.query.role || '');
        const status = String(req.query.status || '');
        const programId = String(req.query.programId || '');
        if (role && !['administrador', 'estudiante', 'asesor', 'director', 'docente'].includes(role)) {
            return res.status(400).json({ error: 'El rol seleccionado no es válido.' });
        }
        if (status && !['activo', 'inactivo'].includes(status)) {
            return res.status(400).json({ error: 'El estado seleccionado no es válido.' });
        }
        if (search) {
            const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const expression = new RegExp(escapedSearch, 'i');
            const matchingSubjects = await AcademicSubject.find({ name: expression }).distinct('_id');
            filter.$or = [
                ...['firstName', 'middleName', 'lastName', 'secondLastName', 'email', 'username', 'studentCode', 'program']
                    .map(field => ({ [field]: expression })),
                { subjects: { $in: matchingSubjects } }
            ];
        }
        if (role) filter.role = role;
        if (status) filter.active = status === 'activo';
        if (programId) filter.programId = programId;

        const [users, total] = await Promise.all([
            User.find(filter)
                .sort({ createdAt: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .select('-passwordHash')
                .populate('subjects', 'name semester')
                .populate('programId', 'name')
                .populate('assignedTeachers', 'firstName middleName lastName secondLastName role active')
                .populate('assignedDirectors', 'firstName middleName lastName secondLastName role active')
                .lean(),
            User.countDocuments(filter)
        ]);
        res.json({
            data: users,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    } catch (error) {
        sendDatabaseError(error, next);
    }
});

const resources = {
    users: { model: User, fields: ['firstName', 'middleName', 'lastName', 'secondLastName', 'email', 'username', 'documentNumber', 'role', 'phone', 'program', 'programId', 'semester', 'subjects', 'assignedTeachers', 'assignedDirectors', 'active'], populate: ['subjects', 'programId', 'assignedTeachers', 'assignedDirectors'], references: { programId: AcademicProgram, subjects: AcademicSubject, assignedTeachers: { model: User, role: 'docente' }, assignedDirectors: { model: User, role: 'director' } } },
    programs: { model: AcademicProgram, fields: ['name', 'active'], populate: ['director', 'directors', 'teachers'], references: { director: { model: User, role: 'director' }, directors: { model: User, role: 'director' }, teachers: { model: User, role: 'docente' } } },
    subjects: { model: AcademicSubject, fields: ['name', 'code', 'semester', 'active'] },
    institutions: { model: Institution, fields: ['name', 'address', 'semesters', 'active'] },
    practiceTypes: { model: PracticeType, fields: ['name', 'semester', 'description', 'requiredHours', 'active'] },
    activities: { model: Activity, fields: ['assignment', 'author', 'title', 'instructions', 'dueDate', 'status', 'resourceUrl'], populate: ['assignment', 'author'], references: { assignment: PracticeAssignment, author: { model: User, role: 'docente' } } },
    submissions: { model: Submission, fields: ['activity', 'assignment', 'student', 'response', 'evidence', 'submittedAt', 'status'], populate: ['activity', 'assignment', 'student'], references: { activity: Activity, assignment: PracticeAssignment, student: { model: User, role: 'estudiante' } } },
    observations: { model: Observation, fields: ['assignment', 'student', 'author', 'category', 'body', 'observedAt', 'visibleToStudent'], populate: ['assignment', 'student', 'author'], references: { assignment: PracticeAssignment, student: { model: User, role: 'estudiante' }, author: { model: User, roles: ['asesor', 'docente'] } } },
    evaluations: { model: Evaluation, fields: ['assignment', 'student', 'evaluator', 'activity', 'submission', 'score', 'feedback', 'evaluatedAt'], populate: ['assignment', 'student', 'evaluator', 'activity', 'submission'], references: { assignment: PracticeAssignment, student: { model: User, role: 'estudiante' }, evaluator: { model: User, role: 'docente' }, activity: Activity, submission: Submission } },
    practiceLogs: { model: PracticeLog, fields: ['assignment', 'student', 'date', 'hours', 'activityDescription', 'status', 'reviewedBy', 'reviewComment'], populate: ['assignment', 'student', 'reviewedBy'], references: { assignment: PracticeAssignment, student: { model: User, role: 'estudiante' }, reviewedBy: { model: User, roles: ['asesor', 'docente', 'director', 'administrador'] } } }
};

function pickAllowedFields(body, allowedFields) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        const error = new Error('El cuerpo de la solicitud debe ser un objeto JSON.');
        error.status = 400;
        throw error;
    }

    return Object.fromEntries(
        Object.entries(body).filter(([key]) => allowedFields.includes(key))
    );
}

async function validateReferences(data, references) {
    for (const [field, definition] of Object.entries(references || {})) {
        if (data[field] === undefined || data[field] === null || data[field] === '') continue;
        const reference = definition.modelName ? { model: definition } : definition;
        const values = Array.isArray(data[field]) ? [...new Set(data[field].map(String).filter(Boolean))] : [data[field]];
        if (!values.length) continue;
        const documents = await reference.model.find({ _id: { $in: values } }).select(reference.model === User ? 'role' : '_id');
        if (documents.length !== values.length) {
            const error = new Error(`Uno o más registros relacionados en "${field}" no existen.`);
            error.status = 400;
            throw error;
        }
        const allowedRoles = reference.roles || (reference.role ? [reference.role] : []);
        if (allowedRoles.length && documents.some(document => !allowedRoles.includes(document.role))) {
            const error = new Error(`El usuario relacionado en "${field}" no tiene un rol permitido.`);
            error.status = 400;
            throw error;
        }
        if (Array.isArray(data[field])) data[field] = values;
    }
}

async function validateUserProgram(data, requireActive = true) {
    const rolesWithProgram = ['director', 'estudiante'];
    if (rolesWithProgram.includes(data.role) && !data.programId) {
        const error = new Error(data.role === 'director'
            ? 'Selecciona un programa académico para este Director.'
            : 'Selecciona el programa académico del Estudiante.');
        error.status = 400;
        throw error;
    }
    if (data.role && !rolesWithProgram.includes(data.role) && data.programId) {
        const error = new Error('El programa académico solo se asigna a Directores y Estudiantes.');
        error.status = 400;
        throw error;
    }
    if (data.role && !rolesWithProgram.includes(data.role) && data.program) {
        const error = new Error('El programa académico solo se asigna a Directores y Estudiantes.');
        error.status = 400;
        throw error;
    }
    if (rolesWithProgram.includes(data.role) &&
        (!Number.isInteger(Number(data.semester)) || Number(data.semester) < 1 || Number(data.semester) > 10)) {
        const error = new Error('Asigna un semestre entre 1 y 10 a este usuario.');
        error.status = 400;
        throw error;
    }
    if (data.programId) {
        const program = await AcademicProgram.findOne({
            _id: data.programId,
            ...(requireActive ? { active: true } : {})
        }).select('name');
        if (!program) {
            const error = new Error('Selecciona un programa académico registrado y activo en Gestionar programas.');
            error.status = 400;
            throw error;
        }
        data.program = program.name;
    }
}

async function validateSubjectStudentSemesters(data) {
    if (data.semester === undefined || !Array.isArray(data.students) || !data.students.length) return;
    const semester = Number(data.semester);
    const students = await User.find({ _id: { $in: data.students }, role: 'estudiante' }).select('semester');
    if (students.some(student => Number(student.semester) !== semester)) {
        const error = new Error('Solo puedes asignar estudiantes del mismo semestre que la asignatura.');
        error.status = 400;
        throw error;
    }
}

async function validateUserSubjectAssignments(data) {
    if (data.subjects === undefined) return;
    if (!Array.isArray(data.subjects)) {
        const error = new Error('Las asignaturas deben enviarse como una lista.');
        error.status = 400;
        throw error;
    }
    const subjectIds = [...new Set(data.subjects.map(String).filter(Boolean))];
    if (!['docente', 'estudiante'].includes(data.role)) {
        if (subjectIds.length) {
            const error = new Error('Solo los Docentes y Estudiantes pueden tener asignaturas asignadas.');
            error.status = 400;
            throw error;
        }
        return;
    }
    if (!subjectIds.length) {
        if (data.role === 'estudiante') {
            const error = new Error('Asigna al menos una asignatura del semestre del Estudiante.');
            error.status = 400;
            throw error;
        }
        return;
    }
    const subjects = await AcademicSubject.find({ _id: { $in: subjectIds } }).select('semester');
    if (data.role === 'estudiante' && (data.semester == null || subjects.length !== subjectIds.length ||
        subjects.some(subject => Number(subject.semester) !== Number(data.semester)))) {
        const error = new Error('Solo puedes asignar asignaturas del mismo semestre que el Estudiante.');
        error.status = 400;
        throw error;
    }
}

async function validateUserStudentAssignments(data) {
    if (data.role !== 'estudiante') return;
    const teacherIds = [...new Set((data.assignedTeachers || []).map(String).filter(Boolean))];
    const directorIds = [...new Set((data.assignedDirectors || []).map(String).filter(Boolean))];
    if (!teacherIds.length) {
        const error = new Error('Asigna al menos un Docente al Estudiante.');
        error.status = 400;
        throw error;
    }
    if (directorIds.length > 1) {
        const error = new Error('Un Estudiante puede tener como máximo un Director asignado.');
        error.status = 400;
        throw error;
    }

    const teachers = await User.find({ _id: { $in: teacherIds }, role: 'docente', active: true }).select('_id');
    if (teachers.length !== teacherIds.length) {
        const error = new Error('Todos los docentes asignados deben existir y estar activos.');
        error.status = 400;
        throw error;
    }
    const subjects = await AcademicSubject.find({ active: true, semester: Number(data.semester) })
        .populate('teachers', '_id');
    const availableTeacherIds = new Set(subjects.flatMap(subject =>
        (subject.teachers || []).map(teacher => String(teacher._id))
    ));
    if (teacherIds.some(id => !availableTeacherIds.has(id))) {
        const error = new Error('Cada Docente debe tener una asignatura activa del semestre del Estudiante.');
        error.status = 400;
        throw error;
    }

    if (directorIds.length === 1) {
        const director = await User.findOne({
            _id: directorIds[0],
            role: 'director',
            active: true,
            programId: data.programId,
            semester: Number(data.semester)
        }).select('_id');
        if (!director) {
            const error = new Error('El Director debe estar activo y corresponder al mismo programa y semestre del Estudiante.');
            error.status = 400;
            throw error;
        }
    }
}

async function generateUserCode() {
    let code;
    do {
        code = `USR-${String(crypto.randomInt(0, 1000000)).padStart(6, '0')}`;
    } while (await User.exists({ studentCode: code }));
    return code;
}

async function syncUserSubjectAssignments(userId, role, subjects, previous = {}) {
    const subjectFields = { docente: 'teachers', estudiante: 'students' };
    const previousField = subjectFields[previous.role];
    const currentField = subjectFields[role];
    const oldSubjects = (previous.subjects || []).map(String);
    if (previousField && previousField !== currentField && oldSubjects.length) {
        await AcademicSubject.updateMany({ _id: { $in: oldSubjects } }, { $pull: { [previousField]: userId } });
    }
}

function sendDatabaseError(error, next) {
    if (error.code === 11000) {
        error.status = 409;
        error.message = 'Ya existe un registro con uno de los valores únicos enviados.';
    } else if (error.name === 'ValidationError' || error.name === 'CastError') {
        error.status = 400;
    }
    next(error);
}

for (const [path, resource] of Object.entries(resources)) {
    const { model, fields, populate = [] } = resource;
    const basePath = `/${path}`;

    router.get(basePath, async (req, res, next) => {
        try {
            const query = model.find().sort({ createdAt: -1 }).limit(100);
            populate.forEach(field => query.populate(field));
            res.json({ data: await query });
        } catch (error) {
            next(error);
        }
    });

    router.post(basePath, async (req, res, next) => {
        try {
            const data = pickAllowedFields(req.body, fields);
            if (path === 'users') {
                if (!isValidPassword(req.body.password)) {
                    return res.status(400).json({ error: 'La contraseña debe tener entre 1 y 10 caracteres.' });
                }
                if (data.role === 'administrador') {
                    if (!/^[a-z0-9._-]{3,40}$/i.test(data.username || '')) {
                        return res.status(400).json({ error: 'El administrador necesita un usuario de 3 a 40 caracteres; no requiere correo electrónico.' });
                    }
                    delete data.email;
                } else if (typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
                    return res.status(400).json({ error: 'Los usuarios deben tener un correo electrónico válido.' });
                }
                data.studentCode = await generateUserCode();
                data.passwordHash = await bcrypt.hash(req.body.password, 12);
                await validateUserProgram(data);
            }
            await validateReferences(data, resource.references);
            if (path === 'users') {
                await validateUserSubjectAssignments(data);
                await validateUserStudentAssignments(data);
            }
            if (path === 'subjects') await validateSubjectStudentSemesters(data);
            if (path === 'institutions') assertInstitutionData(data, true);
            const document = await model.create(data);
            if (path === 'users') {
                await syncUserSubjectAssignments(document._id, document.role, document.subjects);
                await syncUserProgramAssignments(AcademicProgram, document);
            }
            const entityNames = {
                users: 'user', programs: 'program', subjects: 'subject', institutions: 'institution',
                practiceTypes: 'practiceType', assignments: 'assignment', activities: 'activity',
                submissions: 'submission', observations: 'observation', evaluations: 'evaluation', practiceLogs: 'practiceLog'
            };
            const label = path === 'users'
                ? `${document.firstName} ${document.lastName}`
                : document.name || document.title || document._id;
            await registrarAuditoria(req, 'created', entityNames[path], document, `Creó ${entityNames[path]}: ${label}`);
            const response = document.toObject();
            delete response.passwordHash;
            res.status(201).json({ data: response });
        } catch (error) {
            sendDatabaseError(error, next);
        }
    });

    router.get(`${basePath}/:id`, async (req, res, next) => {
        try {
            const query = model.findById(req.params.id);
            populate.forEach(field => query.populate(field));
            const document = await query;
            if (!document) return res.status(404).json({ error: 'Registro no encontrado.' });
            res.json({ data: document });
        } catch (error) {
            sendDatabaseError(error, next);
        }
    });

    router.patch(`${basePath}/:id`, async (req, res, next) => {
        try {
            const changes = pickAllowedFields(req.body, fields);
            if (path === 'institutions') assertInstitutionData(changes);
            const previous = path === 'users'
                ? await model.findById(req.params.id).select('role subjects programId semester assignedTeachers assignedDirectors')
                : path === 'subjects'
                    ? await model.findById(req.params.id).select('teachers students')
                    : null;
            if ((path === 'users' || path === 'subjects') && !previous) {
                return res.status(404).json({ error: 'Registro no encontrado.' });
            }
            if (path === 'users') {
                const role = changes.role || previous.role;
                if (!['director', 'estudiante'].includes(role)) {
                    if (changes.programId) {
                        return res.status(400).json({ error: 'El programa académico solo se asigna a Directores y Estudiantes.' });
                    }
                    if (changes.role) {
                        changes.programId = null;
                        changes.program = null;
                    }
                } else {
                    const programData = {
                        ...changes,
                        role,
                        programId: changes.programId === undefined ? previous.programId : changes.programId,
                        semester: changes.semester === undefined ? previous.semester : changes.semester
                    };
                    await validateUserProgram(programData, false);
                    changes.program = programData.program;
                }
                if (changes.role && changes.role !== previous.role && !['docente', 'estudiante'].includes(role)) {
                    changes.subjects = [];
                }
                if (changes.role && changes.role !== previous.role && role !== 'estudiante') {
                    changes.assignedTeachers = [];
                    changes.assignedDirectors = [];
                }
            }
            if (path === 'users' && req.body.password) {
                if (!isValidPassword(req.body.password)) {
                    return res.status(400).json({ error: 'La contraseña debe tener entre 1 y 10 caracteres.' });
                }
                changes.passwordHash = await bcrypt.hash(req.body.password, 12);
            }
            if (path === 'users' && (changes.active === false || changes.role)) {
                const currentUser = await model.findById(req.params.id).select('role active');
                if (!currentUser) return res.status(404).json({ error: 'Registro no encontrado.' });
                if (currentUser.role === 'administrador' && await model.countDocuments({ role: 'administrador' }) <= 1 &&
                    (changes.active === false || (changes.role && changes.role !== 'administrador'))) {
                    return res.status(409).json({ error: 'No puedes desactivar ni cambiar el rol del último administrador.' });
                }
            }
            const currentDocument = await model.findById(req.params.id);
            if (!currentDocument) return res.status(404).json({ error: 'Registro no encontrado.' });
            if (path === 'subjects' && (changes.semester !== undefined || changes.students !== undefined)) {
                await validateSubjectStudentSemesters({ ...currentDocument.toObject(), ...changes });
            }
            const beforeActive = currentDocument.active;
            await validateReferences(changes, resource.references);
            if (path === 'users' && (
                changes.subjects !== undefined || changes.assignedTeachers !== undefined ||
                changes.assignedDirectors !== undefined || changes.semester !== undefined ||
                changes.programId !== undefined || changes.role
            )) {
                const userData = {
                    ...changes,
                    role: changes.role || previous.role,
                    semester: changes.semester === undefined ? previous.semester : changes.semester,
                    programId: changes.programId === undefined ? previous.programId : changes.programId,
                    subjects: changes.subjects === undefined ? previous.subjects : changes.subjects,
                    assignedTeachers: changes.assignedTeachers === undefined ? previous.assignedTeachers : changes.assignedTeachers,
                    assignedDirectors: changes.assignedDirectors === undefined ? previous.assignedDirectors : changes.assignedDirectors
                };
                await validateUserSubjectAssignments(userData);
                await validateUserStudentAssignments(userData);
            }
            const document = await model.findByIdAndUpdate(req.params.id, changes, {
                new: true,
                runValidators: true,
                select: '-passwordHash'
            });
            if (!document) return res.status(404).json({ error: 'Registro no encontrado.' });
            if (path === 'users') {
                await syncUserSubjectAssignments(document._id, document.role, document.subjects, previous);
                await syncUserProgramAssignments(AcademicProgram, document, previous);
            }
            const entityNames = {
                users: 'user', programs: 'program', subjects: 'subject', institutions: 'institution',
                practiceTypes: 'practiceType', assignments: 'assignment', activities: 'activity',
                submissions: 'submission', observations: 'observation', evaluations: 'evaluation', practiceLogs: 'practiceLog'
            };
            const action = changes.active === true && beforeActive === false
                ? 'activated'
                : changes.active === false && beforeActive !== false
                    ? 'deactivated'
                    : 'updated';
            const label = path === 'users'
                ? `${document.firstName} ${document.lastName}`
                : document.name || document.title || document._id;
            await registrarAuditoria(req, action, entityNames[path], document, `${action === 'activated' ? 'Activó' : action === 'deactivated' ? 'Desactivó' : 'Actualizó'} ${entityNames[path]}: ${label}`);
            res.json({ data: document });
        } catch (error) {
            sendDatabaseError(error, next);
        }
    });

    router.delete(`${basePath}/:id`, async (req, res, next) => {
        try {
            if (path === 'subjects') {
                const subject = await AcademicSubject.findById(req.params.id).select('name');
                if (!subject) return res.status(404).json({ error: 'Registro no encontrado.' });
                const assignedUser = await User.exists({
                    $or: [{ subjects: subject.id }, { program: subject.name }]
                });
                if (assignedUser) {
                    return res.status(409).json({ error: 'No puedes eliminar una asignatura asignada a usuarios. Puedes desactivarla para impedir nuevas asignaciones.' });
                }
            }
            if (path === 'programs') {
                const assignedUser = await User.exists({ programId: req.params.id });
                if (assignedUser) {
                    return res.status(409).json({ error: 'No puedes eliminar un programa asignado a usuarios. Desactívalo si no debe asignarse a nuevas cuentas.' });
                }
            }
            if (path === 'users') {
                const user = await model.findById(req.params.id).select('role subjects assignedTeachers assignedDirectors');
                if (!user) return res.status(404).json({ error: 'Registro no encontrado.' });
                if (user.role === 'administrador' && await model.countDocuments({ role: 'administrador' }) <= 1) {
                    return res.status(409).json({ error: 'No puedes eliminar el último administrador.' });
                }
                if (await PracticeAssignment.exists({
                    $or: [{ student: user._id }, { teacher: user._id }, { teachers: user._id }, { accompanimentResponsible: user._id }]
                })) {
                    return res.status(409).json({ error: 'No puedes eliminar un usuario vinculado a una práctica. Reasigna o finaliza primero sus prácticas.' });
                }
                const hasAuthoredHistory = await Promise.all([
                    Activity.exists({ author: user._id }),
                    Observation.exists({ author: user._id }),
                    Evaluation.exists({ evaluator: user._id }),
                    PracticeLog.exists({ reviewedBy: user._id })
                ]);
                if (hasAuthoredHistory.some(Boolean)) {
                    return res.status(409).json({ error: 'No puedes eliminar un usuario con actividad o historial asociado. Conserva sus registros y desactiva la cuenta.' });
                }
                await syncUserSubjectAssignments(user._id, null, [], user);
                await User.updateMany({ assignedTeachers: user._id }, { $pull: { assignedTeachers: user._id } });
                await User.updateMany({ assignedDirectors: user._id }, { $pull: { assignedDirectors: user._id } });
                await User.updateById(user._id, { assignedTeachers: [], assignedDirectors: [] });
                await AcademicProgram.updateMany({ director: user._id }, { $set: { director: null } });
                await AcademicProgram.updateMany({ teachers: user._id }, { $pull: { teachers: user._id } });
            }
            const document = await model.findByIdAndDelete(req.params.id);
            if (!document) return res.status(404).json({ error: 'Registro no encontrado.' });
            const entityNames = {
                users: 'user', programs: 'program', subjects: 'subject', institutions: 'institution',
                practiceTypes: 'practiceType', assignments: 'assignment', activities: 'activity',
                submissions: 'submission', observations: 'observation', evaluations: 'evaluation', practiceLogs: 'practiceLog'
            };
            const label = path === 'users'
                ? `${document.firstName} ${document.lastName}`
                : document.name || document.title || document._id;
            await registrarAuditoria(req, 'deleted', entityNames[path], document, `Eliminó ${entityNames[path]}: ${label}`);
            res.status(204).end();
        } catch (error) {
            sendDatabaseError(error, next);
        }
    });
}

module.exports = router;
