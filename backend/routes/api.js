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
    AdminAudit
} = require('../models');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/teacher/students', requireAuth, requireRole('docente'), async (req, res, next) => {
    try {
        const teacher = await User.findById(req.user.id).select('subjects');
        if (!teacher) return res.status(404).json({ error: 'No se encontró el usuario docente.' });
        const subjects = await AcademicSubject.find({
            active: true,
            $or: [{ teachers: teacher._id }, { _id: { $in: teacher.subjects } }]
        }).populate({
            path: 'students',
            match: { active: true },
            select: 'firstName middleName lastName secondLastName email studentCode semester'
        });
        const subjectIds = subjects.map(subject => subject._id);
        const studentsBySubject = await User.find({
            role: 'estudiante',
            active: true,
            subjects: { $in: subjectIds }
        }).select('firstName middleName lastName secondLastName email studentCode semester subjects');
        const data = subjects.flatMap(subject => {
            const students = new Map();
            (subject.students || []).forEach(student => students.set(String(student._id), student));
            studentsBySubject
                .filter(student => student.subjects.some(subjectId => String(subjectId) === String(subject._id)))
                .forEach(student => students.set(String(student._id), student));
            return [...students.values()].map(student => ({
                _id: student._id,
                firstName: student.firstName,
                middleName: student.middleName || '',
                lastName: student.lastName,
                secondLastName: student.secondLastName || '',
                email: student.email || '',
                studentCode: student.studentCode || '',
                semester: student.semester || subject.semester || null,
                subject: {
                    _id: subject._id,
                    name: subject.name,
                    code: subject.code,
                    semester: subject.semester || null
                }
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
            programsCount,
            directorsCount,
            academicUsersCount,
            typesCount,
            programsWithDirector,
            recentActivity
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ active: true }),
            AcademicSubject.countDocuments({ active: true }),
            Institution.countDocuments({ active: true }),
            PracticeAssignment.countDocuments({ status: 'en_curso' }),
            PracticeAssignment.find().select('practiceType').populate('practiceType', 'requiredHours').limit(1000),
            PracticeLog.find({ status: 'aprobada' }).select('hours'),
            Evaluation.distinct('assignment'),
            AcademicProgram.countDocuments({ active: true }),
            User.countDocuments({ role: 'director', active: true }),
            User.countDocuments({ role: { $in: ['estudiante', 'docente', 'asesor'] }, active: true }),
            PracticeType.countDocuments({ active: true }),
            AcademicProgram.countDocuments({ active: true, director: { $ne: null } }),
            AdminAudit.find().sort({ createdAt: -1 }).limit(8).select('actorName action entity entityId summary createdAt').lean()
        ]);
        const requiredHours = assignments.reduce((sum, item) => sum + (item.practiceType?.requiredHours || 0), 0);
        const approvedHours = approvedLogs.reduce((sum, item) => sum + item.hours, 0);
        res.json({
            data: {
                totalUsers,
                activeUsers,
                activeSubjects,
                activeInstitutions,
                activeAssignments,
                pendingApprovals: await PracticeAssignment.countDocuments({ approvalStatus: 'pendiente' }),
                programsCount,
                directorsCount,
                academicUsersCount,
                typesCount,
                programsWithDirector,
                approvedHours,
                requiredHours,
                hoursPercent: requiredHours ? Math.min(100, Math.round(approvedHours / requiredHours * 100)) : 0,
                evaluationCoverage: assignments.length
                    ? Math.round(evaluatedAssignments.length / assignments.length * 100)
                    : 0,
                recentActivity
            }
        });
    } catch (error) {
        next(error);
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
                .populate('subjects', 'name')
                .populate('programId', 'name')
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
    users: { model: User, fields: ['firstName', 'middleName', 'lastName', 'secondLastName', 'email', 'username', 'documentNumber', 'role', 'phone', 'program', 'programId', 'semester', 'subjects', 'active'], populate: ['subjects', 'programId'], references: { programId: AcademicProgram } },
    programs: { model: AcademicProgram, fields: ['name', 'director', 'teachers', 'active'], populate: ['director', 'teachers'], references: { director: { model: User, role: 'director' }, teachers: { model: User, role: 'docente' } } },
    subjects: { model: AcademicSubject, fields: ['name', 'code', 'semester', 'teachers', 'students', 'active'], populate: ['teachers', 'students'], references: { teachers: { model: User, role: 'docente' }, students: { model: User, role: 'estudiante' } } },
    institutions: { model: Institution, fields: ['name', 'address', 'semesters', 'practiceName', 'advisorName', 'type', 'agreementActive', 'active', 'contactName', 'contactEmail', 'contactPhone'] },
    practiceTypes: { model: PracticeType, fields: ['name', 'semester', 'description', 'requiredHours', 'active'] },
    assignments: { model: PracticeAssignment, fields: ['practiceType', 'student', 'teacher', 'accompanimentResponsible', 'institution', 'academicPeriod', 'startDate', 'endDate', 'status', 'description'], populate: ['practiceType', 'student', 'teacher', 'accompanimentResponsible', 'institution', 'approvedBy'], references: { practiceType: PracticeType, student: { model: User, role: 'estudiante' }, teacher: { model: User, role: 'docente' }, accompanimentResponsible: { model: User, role: 'asesor' }, institution: Institution } },
    activities: { model: Activity, fields: ['assignment', 'author', 'title', 'instructions', 'dueDate', 'status', 'resourceUrl'], populate: ['assignment', 'author'], references: { assignment: PracticeAssignment, author: { model: User, role: 'docente' } } },
    submissions: { model: Submission, fields: ['activity', 'assignment', 'student', 'response', 'evidence', 'submittedAt', 'status'], populate: ['activity', 'assignment', 'student'], references: { activity: Activity, assignment: PracticeAssignment, student: { model: User, role: 'estudiante' } } },
    observations: { model: Observation, fields: ['assignment', 'student', 'author', 'category', 'body', 'observedAt', 'visibleToStudent'], populate: ['assignment', 'student', 'author'], references: { assignment: PracticeAssignment, student: { model: User, role: 'estudiante' }, author: { model: User, role: 'asesor' } } },
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
    if (data.role && data.role !== 'administrador' && !data.programId) {
        const error = new Error('Selecciona un programa académico para este usuario.');
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

async function validateUserSubjects(data, requireActive = true) {
    if (data.role && data.role !== 'administrador' &&
        (!Array.isArray(data.subjects) || data.subjects.length === 0)) {
        const error = new Error('Selecciona al menos una asignatura para el usuario.');
        error.status = 400;
        throw error;
    }
    if (data.subjects !== undefined) {
        if (!Array.isArray(data.subjects) || data.subjects.length === 0) {
            const error = new Error('Selecciona al menos una asignatura para el usuario.');
            error.status = 400;
            throw error;
        }
        const uniqueIds = [...new Set(data.subjects.map(String))];
        if (uniqueIds.length !== data.subjects.length) {
            const error = new Error('No repitas asignaturas en la selección.');
            error.status = 400;
            throw error;
        }
        const validSubjects = await AcademicSubject.countDocuments({
            _id: { $in: uniqueIds },
            ...(requireActive ? { active: true } : {})
        });
        if (validSubjects !== uniqueIds.length) {
            const error = new Error('Una o más asignaturas ya no están disponibles. Actualiza la selección.');
            error.status = 400;
            throw error;
        }
        data.subjects = uniqueIds;
    }
}

async function generateUserCode() {
    let code;
    do {
        const counter = await User.db.collection('counters').findOneAndUpdate(
            { _id: 'userCode' },
            { $inc: { sequence: 1 } },
            { upsert: true, returnDocument: 'after' }
        );
        code = `USR-${String(counter.sequence).padStart(6, '0')}`;
    } while (await User.exists({ studentCode: code }));
    return code;
}

async function syncUserSubjectAssignments(userId, role, subjects, previous = {}) {
    const subjectFields = { docente: 'teachers', estudiante: 'students' };
    const previousField = subjectFields[previous.role];
    const currentField = subjectFields[role];
    const oldSubjects = (previous.subjects || []).map(String);
    const newSubjects = (subjects || []).map(String);

    if (previousField) {
        const removed = oldSubjects.filter(subjectId => previousField !== currentField || !newSubjects.includes(subjectId));
        if (removed.length) {
            await AcademicSubject.updateMany({ _id: { $in: removed } }, { $pull: { [previousField]: userId } });
        }
    }
    if (currentField && newSubjects.length) {
        await AcademicSubject.updateMany({ _id: { $in: newSubjects } }, { $addToSet: { [currentField]: userId } });
    }
}

async function syncSubjectUserAssignments(subjectId, previous, current) {
    for (const [field, role] of [['teachers', 'docente'], ['students', 'estudiante']]) {
        const oldIds = (previous[field] || []).map(String);
        const newIds = (current[field] || []).map(String);
        const removed = oldIds.filter(userId => !newIds.includes(userId));
        const added = newIds.filter(userId => !oldIds.includes(userId));
        if (removed.length) {
            await User.updateMany({ _id: { $in: removed }, role }, { $pull: { subjects: subjectId } });
        }
        if (added.length) {
            await User.updateMany({ _id: { $in: added }, role }, { $addToSet: { subjects: subjectId } });
        }
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
                if (typeof req.body.password !== 'string' || req.body.password.length < 8) {
                    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
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
                await validateUserSubjects(data);
            }
            await validateReferences(data, resource.references);
            const document = await model.create(data);
            if (path === 'users') {
                await syncUserSubjectAssignments(document._id, document.role, document.subjects);
            } else if (path === 'subjects') {
                await syncSubjectUserAssignments(document._id, {}, document);
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
            const previous = path === 'users'
                ? await model.findById(req.params.id).select('role subjects')
                : path === 'subjects'
                    ? await model.findById(req.params.id).select('teachers students')
                    : null;
            if ((path === 'users' || path === 'subjects') && !previous) {
                return res.status(404).json({ error: 'Registro no encontrado.' });
            }
            if (path === 'users') {
                await validateUserProgram(changes, false);
                await validateUserSubjects(changes, false);
            }
            if (path === 'users' && req.body.password) {
                if (typeof req.body.password !== 'string' || req.body.password.length < 8) {
                    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
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
            const beforeActive = currentDocument.active;
            await validateReferences(changes, resource.references);
            const document = await model.findByIdAndUpdate(req.params.id, changes, {
                new: true,
                runValidators: true,
                select: '-passwordHash'
            });
            if (!document) return res.status(404).json({ error: 'Registro no encontrado.' });
            if (path === 'users') {
                await syncUserSubjectAssignments(document._id, document.role, document.subjects, previous);
            } else if (path === 'subjects') {
                await syncSubjectUserAssignments(document._id, previous, document);
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
                const user = await model.findById(req.params.id).select('role subjects');
                if (!user) return res.status(404).json({ error: 'Registro no encontrado.' });
                if (user.role === 'administrador' && await model.countDocuments({ role: 'administrador' }) <= 1) {
                    return res.status(409).json({ error: 'No puedes eliminar el último administrador.' });
                }
                if (await PracticeAssignment.exists({
                    $or: [{ student: user._id }, { teacher: user._id }, { accompanimentResponsible: user._id }]
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
