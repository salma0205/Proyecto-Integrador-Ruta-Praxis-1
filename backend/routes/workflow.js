const express = require('express');
const multer = require('multer');
const crypto = require('node:crypto');
const database = require('../config/database');
const {
    User,
    AcademicProgram,
    AcademicSubject,
    Institution,
    PracticeType,
    PracticeAssignment,
    Activity,
    Submission,
    PracticeEvidence,
    Observation,
    Evaluation,
    PracticeLog,
    PracticeVisit,
    AttendanceValidation,
    StudentNotification
} = require('../models');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('estudiante', 'docente', 'asesor', 'director'));

const uploadActivityResources = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 5 }
});
const maxActivityResourcesSize = 20 * 1024 * 1024;
const uploadStudentFiles = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxActivityResourcesSize, files: 5 }
});

function badRequest(message) {
    const error = new Error(message);
    error.status = 400;
    return error;
}

function setStoredFileDisposition(req, res, name, mimeType) {
    const previewable = mimeType === 'application/pdf' || mimeType === 'text/plain' ||
        /^image\/(png|jpeg|gif|webp|bmp|avif)$/i.test(mimeType || '') ||
        /^video\/(mp4|webm|ogg|quicktime)$/i.test(mimeType || '') ||
        /^audio\/(mpeg|mp4|ogg|wav|webm)$/i.test(mimeType || '');
    const disposition = req.query.download === '1' || !previewable ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`);
}

function bogotaCalendarDate(value) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(value));
    const part = type => parts.find(item => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
}

function deadlineHasPassed(value) {
    return Boolean(value && bogotaCalendarDate(Date.now()) > bogotaCalendarDate(value));
}

function requiredHoursOf(assignment) {
    const assignmentHours = Number(assignment.requiredHours);
    return assignmentHours > 0 ? assignmentHours : Number(assignment.practiceType?.requiredHours) || 0;
}

function studentProgramFilter(program) {
    return {
        $or: [
            { programId: program._id },
            { programId: null, program: program.name }
        ]
    };
}

async function assignmentsFor(user) {
    let filter;
    if (user.role === 'estudiante') filter = { student: user._id };
    if (user.role === 'docente') filter = { $or: [{ teachers: user._id }, { teacher: user._id }] };
    if (user.role === 'asesor') filter = { accompanimentResponsible: user._id };
    if (user.role === 'director') {
        const programId = user.programId?._id || user.programId;
        const semester = Number(user.semester);
        if (!programId || ![8, 9, 10].includes(semester)) return [];
        const program = await AcademicProgram.findById(programId).select('_id name');
        if (!program) return [];
        const students = await User.find({
            role: 'estudiante',
            active: true,
            semester,
            ...studentProgramFilter(program)
        }).select('_id');
        if (!students.length) return [];
        filter = {
            student: { $in: students.map(student => student._id) }
        };
    }
    return PracticeAssignment.find(filter)
        .sort({ createdAt: -1 })
        .limit(250)
        .populate('practiceType', 'name semester requiredHours')
        .populate('program', 'name')
        .populate('institution', 'name')
        .populate('student', 'firstName middleName lastName secondLastName email studentCode')
        .populate('teacher', 'firstName lastName')
        .populate('teachers', 'firstName middleName lastName secondLastName email')
        .populate('accompanimentResponsible', 'firstName lastName');
}

function idsOf(assignments) {
    return assignments.map(assignment => assignment._id);
}

function assertUuid(value, label) {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
        throw badRequest(`${label} no es válido.`);
    }
}

async function notifyStudents(studentIds, actor, type, title, message, view) {
    const recipientIds = [...new Set(studentIds.filter(Boolean).map(String))];
    if (!recipientIds.length) return;
    await StudentNotification.insertMany(recipientIds.map(recipient => ({
        recipient,
        actor: actor?._id,
        type,
        title,
        message: String(message || '').slice(0, 1000),
        view
    })));
}

router.get('/notifications', requireRole('estudiante'), async (req, res, next) => {
    try {
        const filter = { recipient: req.user._id };
        const [notifications, unreadCount] = await Promise.all([
            StudentNotification.find(filter).sort({ createdAt: -1 }).limit(50).populate('actor', 'firstName lastName role'),
            StudentNotification.countDocuments({ ...filter, readAt: null })
        ]);
        res.json({ data: { notifications, unreadCount } });
    } catch (error) {
        next(error);
    }
});

router.patch('/notifications/read-all', requireRole('estudiante'), async (req, res, next) => {
    try {
        await StudentNotification.updateMany({ recipient: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
        res.json({ data: { unreadCount: 0 } });
    } catch (error) {
        next(error);
    }
});

router.patch('/notifications/:id/read', requireRole('estudiante'), async (req, res, next) => {
    try {
        assertUuid(req.params.id, 'La notificación');
        const notification = await StudentNotification.findOneAndUpdate(
            { _id: req.params.id, recipient: req.user._id, readAt: null },
            { $set: { readAt: new Date() } },
            { new: true }
        );
        res.json({ data: notification });
    } catch (error) {
        next(error);
    }
});

async function ownedAssignment(user, assignmentId, roles = [user.role]) {
    assertUuid(assignmentId, 'La asignación');
    const assignment = await PracticeAssignment.findById(assignmentId);
    if (!assignment) return null;

    if (user.role === 'director' && roles.includes('director')) {
        const programId = user.programId?._id || user.programId;
        const semester = Number(user.semester);
        if (!programId || ![8, 9, 10].includes(semester)) return null;
        const program = await AcademicProgram.findById(programId).select('_id name');
        if (!program || String(assignment.program?._id || assignment.program || '') !== String(program._id)) return null;
        const student = await User.findOne({
            _id: assignment.student?._id || assignment.student,
            role: 'estudiante',
            active: true,
            semester,
            ...studentProgramFilter(program)
        }).select('_id');
        return student ? assignment : null;
    }

    const owns = roles.some(role => {
        if (role === 'estudiante') return String(assignment.student) === String(user._id);
        if (role === 'docente') {
            return (assignment.teachers || []).some(teacher => String(teacher?._id || teacher) === String(user._id)) ||
                String(assignment.teacher?._id || assignment.teacher) === String(user._id);
        }
        if (role === 'asesor') return String(assignment.accompanimentResponsible) === String(user._id);
        return false;
    });
    return owns ? assignment : null;
}

async function canAccessActivityResources(user, activity) {
    if (user.role === 'docente' && String(activity.author) === String(user._id)) return true;
    if (activity.assignment && await ownedAssignment(user, activity.assignment, ['estudiante', 'docente'])) return true;
    if (!activity.subject || !['estudiante', 'docente'].includes(user.role)) return false;

    const filter = user.role === 'estudiante'
        ? { semester: user.semester == null ? -1 : Number(user.semester), students: user._id }
        : { teachers: user._id };
    return Boolean(await AcademicSubject.findOne({ _id: activity.subject, active: true, ...filter }));
}

router.get('/activities/:activityId/resources/:resourceId', requireRole('estudiante', 'docente'), async (req, res, next) => {
    try {
        assertUuid(req.params.activityId, 'La actividad');
        assertUuid(req.params.resourceId, 'El archivo');
        const activity = await Activity.findById(req.params.activityId);
        if (!activity) return res.status(404).json({ error: 'No se encontró la actividad.' });
        if (!await canAccessActivityResources(req.user, activity)) {
            return res.status(403).json({ error: 'No tienes permiso para consultar este archivo.' });
        }

        const result = await database.execute(
            'SELECT name, mime_type, file_data FROM activity_resources WHERE id = :resourceId AND activity_id = :activityId',
            { resourceId: req.params.resourceId, activityId: activity._id }
        );
        const resource = result.rows[0];
        if (!resource) return res.status(404).json({ error: 'No se encontró el archivo adjunto.' });

        const name = String(resource.NAME).replace(/[\r\n"]/g, '_');
        const contents = Buffer.from(resource.FILE_DATA, 'base64');
        res.setHeader('Content-Type', resource.MIME_TYPE);
        setStoredFileDisposition(req, res, name, resource.MIME_TYPE);
        res.setHeader('Content-Length', contents.length);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(contents);
    } catch (error) {
        next(error);
    }
});

router.get('/practice-evidences/:assignmentId/:evidenceId/file', requireRole('estudiante', 'docente', 'asesor', 'director'), async (req, res, next) => {
    try {
        assertUuid(req.params.assignmentId, 'La práctica');
        assertUuid(req.params.evidenceId, 'La evidencia');
        const assignment = await ownedAssignment(req.user, req.params.assignmentId, [req.user.role]);
        if (!assignment) return res.status(403).json({ error: 'No tienes permiso para consultar esta evidencia.' });
        const result = await database.execute(
            'SELECT name, mime_type, file_data FROM practice_evidences WHERE id = :evidenceId AND assignment_id = :assignmentId',
            { evidenceId: req.params.evidenceId, assignmentId: assignment._id }
        );
        const evidence = result.rows[0];
        if (!evidence) return res.status(404).json({ error: 'No se encontró el archivo de evidencia.' });
        const name = String(evidence.NAME).replace(/[\r\n"]/g, '_');
        const contents = Buffer.from(evidence.FILE_DATA, 'base64');
        res.setHeader('Content-Type', evidence.MIME_TYPE || 'application/octet-stream');
        setStoredFileDisposition(req, res, name, evidence.MIME_TYPE);
        res.setHeader('Content-Length', contents.length);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(contents);
    } catch (error) {
        next(error);
    }
});

router.get('/submissions/:submissionId/evidence/:evidenceId/file', requireRole('estudiante', 'docente', 'asesor'), async (req, res, next) => {
    try {
        assertUuid(req.params.submissionId, 'La entrega');
        assertUuid(req.params.evidenceId, 'La evidencia');
        const submission = await Submission.findById(req.params.submissionId);
        if (!submission) return res.status(404).json({ error: 'No se encontró la entrega.' });
        const activity = await Activity.findById(submission.activity).select('subject dueDate');
        let allowed = req.user.role === 'estudiante' && String(submission.student) === String(req.user._id);
        if (!allowed && submission.assignment) {
            allowed = Boolean(await ownedAssignment(req.user, submission.assignment, [req.user.role]));
        }
        if (!allowed && req.user.role === 'docente' && activity?.subject) {
            allowed = Boolean(await AcademicSubject.findOne({ _id: activity.subject, teachers: req.user._id }));
        }
        if (!allowed) return res.status(403).json({ error: 'No tienes permiso para consultar este archivo.' });

        const result = await database.execute(
            'SELECT name, mime_type, file_data FROM submission_evidence WHERE id = :evidenceId AND submission_id = :submissionId',
            { evidenceId: req.params.evidenceId, submissionId: submission._id }
        );
        const evidence = result.rows[0];
        if (!evidence || !evidence.FILE_DATA) return res.status(404).json({ error: 'No se encontró el archivo de evidencia.' });
        const name = String(evidence.NAME).replace(/[\r\n"]/g, '_');
        const contents = Buffer.from(evidence.FILE_DATA, 'base64');
        res.setHeader('Content-Type', evidence.MIME_TYPE || 'application/octet-stream');
        setStoredFileDisposition(req, res, name, evidence.MIME_TYPE);
        res.setHeader('Content-Length', contents.length);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(contents);
    } catch (error) {
        next(error);
    }
});

router.get('/evidence-submissions/:submissionId/files/:fileId', requireRole('estudiante', 'asesor'), async (req, res, next) => {
    try {
        assertUuid(req.params.submissionId, 'La entrega');
        assertUuid(req.params.fileId, 'El archivo');
        const result = await database.execute(
            'SELECT task.assignment_id, file.name, file.mime_type, file.file_data FROM practice_evidence_submissions submission JOIN practice_evidence_tasks task ON task.id = submission.task_id JOIN practice_evidence_submission_files file ON file.submission_id = submission.id WHERE submission.id = :submissionId AND file.id = :fileId',
            { submissionId: req.params.submissionId, fileId: req.params.fileId }
        );
        const evidence = result.rows[0];
        if (!evidence) return res.status(404).json({ error: 'No se encontrÃ³ el archivo.' });
        const assignment = await ownedAssignment(req.user, evidence.ASSIGNMENT_ID, [req.user.role]);
        if (!assignment) return res.status(403).json({ error: 'No tienes permiso para consultar este archivo.' });
        const name = String(evidence.NAME).replace(/[\r\n"]/g, '_');
        const contents = Buffer.from(evidence.FILE_DATA, 'base64');
        res.setHeader('Content-Type', evidence.MIME_TYPE || 'application/octet-stream');
        setStoredFileDisposition(req, res, name, evidence.MIME_TYPE);
        res.setHeader('Content-Length', contents.length);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(contents);
    } catch (error) {
        next(error);
    }
});

router.get('/practice-options', requireRole('director'), async (req, res, next) => {
    try {
        const programId = req.user.programId?._id || req.user.programId;
        const directorSemester = Number(req.user.semester);
        const program = programId
            ? await AcademicProgram.findOne({ _id: programId, active: true }).select('_id name')
            : null;
        if (!program) return res.status(409).json({ error: 'Tu cuenta no tiene un programa académico activo asignado.' });
        if (!Number.isInteger(directorSemester)) {
            return res.status(409).json({ error: 'Tu cuenta no tiene un semestre válido asignado.' });
        }
        const [students, advisors, institutions, practiceTypes] = await Promise.all([
            User.find({
                role: 'estudiante',
                active: true,
                semester: directorSemester,
                ...studentProgramFilter(program)
            })
                .select('firstName middleName lastName secondLastName email semester subjects assignedTeachers')
                .populate('subjects', 'name semester')
                .populate('assignedTeachers', 'firstName middleName lastName secondLastName email active')
                .sort({ lastName: 1, firstName: 1 }),
            User.find({ role: 'asesor', active: true })
                .select('firstName middleName lastName secondLastName')
                .sort({ lastName: 1, firstName: 1 }),
            Institution.find({ active: true }).populate('semesters'),
            PracticeType.find({ active: true }).select('name semester').sort({ name: 1 })
        ]);
        const academicStudents = students.map(student => {
            const data = student.toObject();
            data.assignedTeachers = (student.assignedTeachers || []).filter(teacher => teacher.active);
            return data;
        });
        const practiceStudents = academicStudents.filter(student => [8, 9, 10].includes(Number(student.semester)));
        const teachers = [...new Map(academicStudents.flatMap(student => student.assignedTeachers)
            .map(teacher => [String(teacher._id), teacher])).values()];
        res.json({ data: { program, students: practiceStudents, academicStudents, teachers, advisors, institutions, practiceTypes } });
    } catch (error) {
        next(error);
    }
});

router.post('/assignments', requireRole('director'), async (req, res, next) => {
    try {
        const {
            institution: institutionId,
            student: studentId,
            accompanimentResponsible: advisorId,
            startDate,
            endDate,
            requiredHours
        } = req.body || {};
        const hours = Number(requiredHours);
        if (!institutionId || !studentId || !advisorId || !startDate || !endDate ||
            !Number.isFinite(hours) || hours <= 0 || hours > 99999.9) {
            throw badRequest('Completa los datos de la práctica, selecciona el asesor responsable e indica las horas requeridas (mayor que cero).');
        }
        assertUuid(institutionId, 'La institución');
        assertUuid(studentId, 'El estudiante');
        assertUuid(advisorId, 'El asesor');
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
            throw badRequest('Ingresa fechas válidas y una fecha final igual o posterior a la inicial.');
        }

        const programId = req.user.programId?._id || req.user.programId;
        const program = programId
            ? await AcademicProgram.findOne({ _id: programId, active: true }).select('_id name')
            : null;
        if (!program) return res.status(409).json({ error: 'Tu cuenta no tiene un programa académico activo asignado.' });
        const directorSemester = Number(req.user.semester);
        if (![8, 9, 10].includes(directorSemester)) {
            throw badRequest('Solo se pueden asignar prácticas desde los semestres 8, 9 o 10.');
        }
        const [student, advisor, institution] = await Promise.all([
            User.findOne({
                _id: studentId, role: 'estudiante', active: true,
                semester: directorSemester,
                ...studentProgramFilter(program)
            }).select('semester programId assignedTeachers')
                .populate('assignedTeachers', 'role active'),
            User.findOne({ _id: advisorId, role: 'asesor', active: true }).select('_id'),
            Institution.findOne({ _id: institutionId, active: true }).populate('semesters')
        ]);
        if (!student || Number(student.semester) !== directorSemester) {
            throw badRequest('Solo puedes asignar prácticas a estudiantes activos de tu mismo semestre (8, 9 o 10).');
        }
        if (!student.programId) {
            await User.updateById(student._id, { programId: program._id, program: program.name });
        }
        const teachers = (student.assignedTeachers || []).filter(teacher => teacher.active && teacher.role === 'docente');
        if (!teachers.length || teachers.length !== (student.assignedTeachers || []).length) {
            throw badRequest('El Administrador debe asignar docentes activos al estudiante.');
        }
        const teacherIds = teachers.map(teacher => String(teacher._id));
        const teacherSubjects = await AcademicSubject.find({
            active: true,
            semester: Number(student.semester),
            teachers: { $in: teacherIds }
        }).select('teachers').populate('teachers', '_id');
        const teachersInSemester = new Set(teacherSubjects.flatMap(subject =>
            (subject.teachers || []).map(teacher => String(teacher._id))
        ));
        if (teacherIds.some(id => !teachersInSemester.has(id))) {
            throw badRequest('Cada docente asignado debe tener una asignatura activa del semestre del estudiante.');
        }
        if (!advisor) throw badRequest('Selecciona un asesor activo.');
        if (!institution) throw badRequest('Selecciona una institución activa.');
        const institutionSemesters = (institution.semesters || []).map(value =>
            Number(value && typeof value === 'object' ? value.semester : value)
        );
        if (!institutionSemesters.includes(Number(student.semester))) {
            throw badRequest('La institución debe estar asociada al mismo semestre del estudiante.');
        }

        let type = await PracticeType.findOne({ semester: Number(student.semester), active: true });
        if (!type) {
            type = await PracticeType.create({
                name: 'Pr\u00e1ctica profesional',
                semester: Number(student.semester),
                active: true
            });
        }
        const assignment = await PracticeAssignment.create({
            practiceType: type._id,
            program: program._id,
            student: studentId,
            teacher: teacherIds[0],
            teachers: teacherIds,
            accompanimentResponsible: advisorId,
            institution: institutionId,
            startDate: start,
            endDate: end,
            requiredHours: hours,
            status: 'disponible',
            approvalStatus: 'pendiente'
        });
        res.status(201).json({ data: assignment });
    } catch (error) {
        next(error);
    }
});

router.get('/dashboard', async (req, res, next) => {
    try {
        const assignments = await assignmentsFor(req.user);
        const assignmentIds = idsOf(assignments);
        const subjectFilter = req.user.role === 'docente'
            ? { active: true, teachers: req.user._id }
            : req.user.role === 'estudiante'
                ? { active: true, students: req.user._id, semester: req.user.semester == null ? -1 : Number(req.user.semester) }
                : null;
        const subjectsQuery = subjectFilter
            ? AcademicSubject.find(subjectFilter)
                .sort({ semester: 1, name: 1 })
                .populate('teachers', 'firstName middleName lastName secondLastName email')
                .populate({ path: 'students', match: { active: true }, select: 'firstName middleName lastName secondLastName email studentCode semester' })
            : Promise.resolve([]);
        const assignedStudentsQuery = req.user.role === 'docente'
            ? User.find({ role: 'estudiante', active: true, assignedTeachers: req.user._id })
                .select('firstName middleName lastName secondLastName email studentCode semester')
                .populate('subjects', 'name semester')
                .populate('assignedDirectors', 'firstName middleName lastName secondLastName')
                .sort({ lastName: 1, firstName: 1 })
            : Promise.resolve([]);
        const [subjects, directlyAssignedStudents] = await Promise.all([subjectsQuery, assignedStudentsQuery]);
        const subjectIds = subjects.map(subject => subject._id);
        const subjectStudents = req.user.role === 'docente' && subjectIds.length
            ? await User.find({ role: 'estudiante', active: true, subjects: { $in: subjectIds } })
                .select('firstName middleName lastName secondLastName email studentCode semester')
                .populate('subjects', 'name semester')
                .populate('assignedDirectors', 'firstName middleName lastName secondLastName')
                .sort({ lastName: 1, firstName: 1 })
            : [];
        const assignedStudents = req.user.role === 'docente'
            ? [...new Map([...directlyAssignedStudents, ...subjectStudents].map(student => [String(student._id), student])).values()]
                .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'es'))
            : directlyAssignedStudents;
        const assignmentProgramIds = [...new Set(assignments.map(item => String(item.program?._id || item.program || '')).filter(Boolean))];
        const programDirectors = req.user.role === 'estudiante' && assignmentProgramIds.length
            ? await User.find({
                role: 'director',
                active: true,
                semester: Number(req.user.semester),
                programId: { $in: assignmentProgramIds }
            }).select('firstName middleName lastName secondLastName programId')
            : [];
        const activities = await Activity.find({ $or: [{ assignment: { $in: assignmentIds } }, { subject: { $in: subjectIds } }] })
            .sort({ createdAt: -1 }).limit(250)
            .populate('assignment', 'student teacher practiceType')
            .populate('subject', 'name code semester')
            .populate('author', 'firstName lastName');
        const activityIds = activities.map(activity => activity._id);
        const submissionFilter = {
            activity: { $in: activityIds },
            ...(req.user.role === 'estudiante' ? { student: req.user._id } : {})
        };
        const [submissions, logs, observations, evaluations, attendanceValidations] = await Promise.all([
            Submission.find(submissionFilter).sort({ submittedAt: -1 }).limit(250).populate('activity', 'title subject assignment').populate('assignment', 'student teacher').populate('student', 'firstName lastName email'),
            PracticeLog.find({ assignment: { $in: assignmentIds } }).sort({ date: -1 }).limit(500).populate('assignment', 'student practiceType institution').populate('student', 'firstName lastName').populate('reviewedBy', 'firstName middleName lastName secondLastName role'),
            Observation.find({ assignment: { $in: assignmentIds }, ...(req.user.role === 'estudiante' ? { visibleToStudent: true } : {}) }).sort({ observedAt: -1 }).limit(250).populate('student', 'firstName lastName').populate('author', 'firstName middleName lastName secondLastName role'),
            Evaluation.find({ assignment: { $in: assignmentIds } }).sort({ evaluatedAt: -1 }).limit(250).populate('assignment', 'student practiceType').populate('student', 'firstName lastName').populate('evaluator', 'firstName lastName'),
            AttendanceValidation.find({ assignment: { $in: assignmentIds } }).sort({ date: -1 }).limit(500).populate('assignment', 'student practiceType institution').populate('student', 'firstName lastName').populate('advisor', 'firstName lastName')
        ]);
        const evidenceBinds = Object.fromEntries(assignmentIds.map((id, index) => [`evidenceAssignment${index}`, String(id)]));
        const evidenceRows = assignmentIds.length
            ? (await database.execute(
                `SELECT id, assignment_id, student_id, name, url, mime_type, size_bytes, submitted_at FROM practice_evidences WHERE assignment_id IN (${assignmentIds.map((_, index) => `:evidenceAssignment${index}`).join(', ')}) ORDER BY submitted_at DESC FETCH FIRST 500 ROWS ONLY`,
                evidenceBinds
            )).rows
            : [];
        const evidenceStudentIds = [...new Set(evidenceRows.map(row => String(row.STUDENT_ID)))];
        const evidenceStudents = evidenceStudentIds.length
            ? await User.find({ _id: { $in: evidenceStudentIds } }).select('firstName lastName')
            : [];
        const evidenceStudentById = new Map(evidenceStudents.map(student => [String(student._id), student]));
        const practiceEvidences = evidenceRows.map(row => ({
            _id: row.ID,
            assignment: row.ASSIGNMENT_ID,
            student: evidenceStudentById.get(String(row.STUDENT_ID)) || null,
            name: row.NAME,
            url: row.URL,
            mimeType: row.MIME_TYPE,
            sizeBytes: Number(row.SIZE_BYTES || 0),
            submittedAt: row.SUBMITTED_AT,
            ...(row.MIME_TYPE ? { fileUrl: `/api/workflow/practice-evidences/${row.ASSIGNMENT_ID}/${row.ID}/file` } : {})
        }));
        const evidenceTaskRows = assignmentIds.length
            ? (await database.execute(
                `SELECT task.id, task.assignment_id, task.advisor_id, task.title, task.instructions, task.due_date, task.status, task.created_at, submission.id AS submission_id, submission.practice_log_id, submission.student_id, submission.activity_date, submission.hours, submission.activity_description, submission.status AS submission_status, submission.review_comment, submission.submitted_at, practice_log.review_comment AS practice_log_comment FROM practice_evidence_tasks task LEFT JOIN practice_evidence_submissions submission ON submission.task_id = task.id LEFT JOIN practice_logs practice_log ON practice_log.id = submission.practice_log_id WHERE task.assignment_id IN (${assignmentIds.map((_, index) => `:evidenceAssignment${index}`).join(', ')}) ORDER BY task.created_at DESC`,
                evidenceBinds
            )).rows
            : [];
        const evidenceTaskSubmissionIds = [...new Set(evidenceTaskRows.map(row => row.SUBMISSION_ID).filter(Boolean).map(String))];
        const evidenceTaskFiles = evidenceTaskSubmissionIds.length
            ? (await database.execute(
                `SELECT id, submission_id, name, url, mime_type, size_bytes FROM practice_evidence_submission_files WHERE submission_id IN (${evidenceTaskSubmissionIds.map((_, index) => `taskSubmission${index}`).map((bind, index) => `:${bind}`).join(', ')}) ORDER BY created_at`,
                Object.fromEntries(evidenceTaskSubmissionIds.map((id, index) => [`taskSubmission${index}`, id]))
            )).rows
            : [];
        const filesByEvidenceTaskSubmission = new Map();
        evidenceTaskFiles.forEach(file => {
            const submissionId = String(file.SUBMISSION_ID);
            if (!filesByEvidenceTaskSubmission.has(submissionId)) filesByEvidenceTaskSubmission.set(submissionId, []);
            filesByEvidenceTaskSubmission.get(submissionId).push({
                id: file.ID,
                name: file.NAME,
                url: file.URL,
                mimeType: file.MIME_TYPE,
                sizeBytes: Number(file.SIZE_BYTES || 0),
                ...(file.MIME_TYPE ? { fileUrl: `/api/workflow/evidence-submissions/${submissionId}/files/${file.ID}` } : {})
            });
        });
        const assignmentById = new Map(assignments.map(assignment => [String(assignment._id), assignment]));
        const advisorIds = [...new Set(evidenceTaskRows.map(row => String(row.ADVISOR_ID)))];
        const evidenceAdvisors = advisorIds.length
            ? await User.find({ _id: { $in: advisorIds } }).select('firstName middleName lastName secondLastName')
            : [];
        const evidenceAdvisorById = new Map(evidenceAdvisors.map(advisor => [String(advisor._id), advisor]));
        const evidenceTasks = evidenceTaskRows.map(row => ({
            _id: row.ID,
            assignment: assignmentById.get(String(row.ASSIGNMENT_ID)) || row.ASSIGNMENT_ID,
            advisor: evidenceAdvisorById.get(String(row.ADVISOR_ID)) || null,
            title: row.TITLE,
            instructions: row.INSTRUCTIONS,
            dueDate: row.DUE_DATE,
            status: row.STATUS,
            createdAt: row.CREATED_AT,
            submission: row.SUBMISSION_ID ? {
                _id: row.SUBMISSION_ID,
                practiceLogId: row.PRACTICE_LOG_ID,
                practiceLogComment: row.PRACTICE_LOG_COMMENT,
                student: row.STUDENT_ID,
                date: row.ACTIVITY_DATE,
                hours: Number(row.HOURS),
                activityDescription: row.ACTIVITY_DESCRIPTION,
                status: row.SUBMISSION_STATUS,
                reviewComment: row.REVIEW_COMMENT,
                submittedAt: row.SUBMITTED_AT,
                evidence: filesByEvidenceTaskSubmission.get(String(row.SUBMISSION_ID)) || []
            } : null
        }));
        const resourceBinds = Object.fromEntries(activityIds.map((id, index) => [`activity${index}`, String(id)]));
        const resources = activityIds.length
            ? (await database.execute(
                `SELECT id, activity_id, name, mime_type, size_bytes FROM activity_resources WHERE activity_id IN (${activityIds.map((_, index) => `:activity${index}`).join(', ')}) ORDER BY created_at`,
                resourceBinds
            )).rows
            : [];
        const resourcesByActivity = new Map();
        resources.forEach(resource => {
            const activityId = String(resource.ACTIVITY_ID);
            if (!resourcesByActivity.has(activityId)) resourcesByActivity.set(activityId, []);
            resourcesByActivity.get(activityId).push({
                id: resource.ID,
                name: resource.NAME,
                mimeType: resource.MIME_TYPE,
                sizeBytes: Number(resource.SIZE_BYTES),
                url: `/api/workflow/activities/${activityId}/resources/${resource.ID}`
            });
        });
        const approvedHours = logs.filter(log => log.status === 'aprobada').reduce((total, log) => total + log.hours, 0);
        const requiredHours = assignments.reduce((total, assignment) => total + requiredHoursOf(assignment), 0);
        res.json({
            data: {
                assignments,
                subjects: subjects.map(subject => {
                    const data = subject.toObject();
                    if (subject.semester) {
                        data.students = data.students.filter(student => Number(student.semester) === Number(subject.semester));
                    }
                    return data;
                }),
                assignedStudents,
                programDirectors,
                activities: activities.map(activity => ({
                    ...activity.toObject(),
                    resources: resourcesByActivity.get(String(activity._id)) || []
                })),
                submissions,
                practiceEvidences,
                evidenceTasks,
                logs,
                observations,
                evaluations,
                attendanceValidations,
                metrics: {
                    assignments: assignments.length,
                    activeAssignments: assignments.filter(item => item.status === 'en_curso').length,
                    students: new Set(assignments.map(item => String(item.student?._id)).filter(Boolean)).size,
                    pendingApprovals: assignments.filter(item => item.approvalStatus === 'pendiente').length,
                    pendingLogs: logs.filter(item => item.status === 'pendiente').length,
                    approvedHours,
                    requiredHours,
                    hoursPercent: requiredHours ? Math.min(100, Math.round(approvedHours / requiredHours * 100)) : 0,
                    averageScore: evaluations.length
                        ? Number((evaluations.reduce((sum, item) => sum + item.score, 0) / evaluations.length).toFixed(2))
                        : null
                }
            }
        });
    } catch (error) {
        next(error);
    }
});

router.post('/activities', requireRole('docente'), uploadActivityResources.array('resources', 5), async (req, res, next) => {
    try {
        const { assignment: assignmentId, subject: subjectId, title, instructions, dueDate, resourceUrl } = req.body || {};
        const kind = req.body?.kind || 'actividad';
        const files = req.files || [];
        const totalFileSize = files.reduce((total, file) => total + file.size, 0);
        if (totalFileSize > maxActivityResourcesSize) {
            throw badRequest('Los archivos adjuntos no pueden superar 20 MB en total.');
        }
        if (files.some(file => {
            const mimeType = file.mimetype || 'application/octet-stream';
            return mimeType.length > 100 || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mimeType);
        })) {
            throw badRequest('Uno de los archivos tiene un tipo no válido.');
        }
        let assignment = null;
        let subject = null;
        if (subjectId) {
            assertUuid(subjectId, 'La asignatura');
            subject = await AcademicSubject.findOne({
                _id: subjectId,
                active: true,
                teachers: req.user._id
            });
            if (!subject) return res.status(404).json({ error: 'No tienes esta asignatura asignada.' });
        } else {
            assignment = await ownedAssignment(req.user, assignmentId, ['docente']);
            if (!assignment) return res.status(404).json({ error: 'No se encontro una practica asignada a tu cuenta.' });
            if (assignment.approvalStatus !== 'aprobada') {
                return res.status(409).json({ error: 'La practica debe ser aprobada antes de publicar actividades.' });
        }
        }
        if (typeof title !== 'string' || !title.trim() || typeof instructions !== 'string' || !instructions.trim()) {
            throw badRequest('El título y las instrucciones son obligatorios.');
        }
        if (!['actividad', 'evaluacion'].includes(kind)) {
            throw badRequest('Selecciona si vas a publicar una actividad o una evaluación.');
        }
        if (resourceUrl && (typeof resourceUrl !== 'string' || resourceUrl.length > 2048 || !/^https?:\/\//i.test(resourceUrl))) {
            throw badRequest('El enlace de apoyo debe ser una URL HTTP o HTTPS válida.');
        }
        const activityDueDate = dueDate ? new Date(`${dueDate}T00:00:00`) : undefined;
        if (dueDate && Number.isNaN(activityDueDate.getTime())) {
            throw badRequest('La fecha limite no es valida.');
        }
        const activity = await Activity.create({
            ...(assignment ? { assignment: assignment._id } : {}),
            ...(subject ? { subject: subject._id } : {}),
            author: req.user._id,
            kind,
            title: title.trim(),
            instructions: instructions.trim(),
            dueDate: activityDueDate,
            resourceUrl: resourceUrl || undefined
        });
        if (files.length) {
            for (const file of files) {
                const originalName = file.originalname.replace(/[\\/\0]/g, '_').slice(0, 255);
                await database.execute(
                    'INSERT INTO activity_resources (id, activity_id, name, mime_type, size_bytes, file_data) VALUES (:id, :activityId, :name, :mimeType, :sizeBytes, :fileData)',
                    {
                        id: crypto.randomUUID(),
                        activityId: activity._id,
                        name: originalName || 'archivo',
                        mimeType: file.mimetype || 'application/octet-stream',
                        sizeBytes: file.size,
                        fileData: file.buffer.toString('base64')
                    }
                );
            }
        }
        let recipientIds = assignment ? [assignment.student] : [];
        if (subject) {
            const students = await User.find({
                _id: { $in: subject.students },
                role: 'estudiante',
                active: true,
                ...(subject.semester ? { semester: Number(subject.semester) } : {})
            }).select('_id');
            recipientIds = students.map(student => student._id);
        }
        await notifyStudents(
            recipientIds,
            req.user,
            'activity',
            kind === 'evaluacion' ? 'Nueva evaluación pendiente' : 'Nueva actividad',
            `Tu docente publicó: ${activity.title}`,
            kind === 'evaluacion' ? 'evaluaciones' : 'mis-actividades'
        );
        res.status(201).json({ data: activity });
    } catch (error) {
        next(error);
    }
});

router.post('/submissions', requireRole('estudiante'), uploadStudentFiles.array('files', 5), async (req, res, next) => {
    try {
        const { activity: activityId, response = '' } = req.body || {};
        let evidence = req.body?.evidence || [];
        if (typeof evidence === 'string') {
            try {
                evidence = JSON.parse(evidence);
            } catch {
                throw badRequest('Las evidencias no tienen un formato válido.');
            }
        }
        const files = req.files || [];
        const totalFileSize = files.reduce((total, file) => total + file.size, 0);
        if (totalFileSize > maxActivityResourcesSize) {
            throw badRequest('Los archivos de la entrega no pueden superar 20 MB en total.');
        }
        if (files.some(file => {
            const mimeType = file.mimetype || 'application/octet-stream';
            return mimeType.length > 120 || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mimeType);
        })) {
            throw badRequest('Uno de los archivos de la entrega tiene un tipo no válido.');
        }
        assertUuid(activityId, 'La actividad');
        const activity = await Activity.findById(activityId).select('assignment subject status');
        if (!activity) return res.status(404).json({ error: 'No se encontró la actividad.' });
        const assignment = activity.assignment ? await ownedAssignment(req.user, activity.assignment, ['estudiante']) : null;
        const subject = activity.subject
            ? await AcademicSubject.findOne({
                _id: activity.subject,
                active: true,
                semester: req.user.semester == null ? -1 : Number(req.user.semester),
                students: req.user._id
            })
            : null;
        if (!assignment && !subject) return res.status(403).json({ error: 'No tienes esta actividad asignada.' });
        if (assignment && assignment.approvalStatus !== 'aprobada') {
            return res.status(409).json({ error: 'La práctica todavía no ha sido aprobada.' });
        }
        if (typeof response !== 'string' || response.length > 10000 || !Array.isArray(evidence)) {
            throw badRequest('La respuesta o las evidencias no tienen un formato válido.');
        }
        for (const item of evidence) {
            if (!item || typeof item.name !== 'string' || !item.name.trim() || typeof item.url !== 'string' ||
                !/^https?:\/\//i.test(item.url) || item.url.length > 2048) {
                throw badRequest('Cada evidencia debe tener un nombre y una URL HTTP o HTTPS válida.');
            }
        }
        evidence = [
            ...evidence.map(item => ({ name: item.name.trim().slice(0, 255), url: item.url })),
            ...files.map(file => ({
                name: (file.originalname.replace(/[\\/\0]/g, '_').slice(0, 255) || 'archivo'),
                mimeType: file.mimetype || 'application/octet-stream',
                sizeBytes: file.size,
                fileData: file.buffer.toString('base64')
            }))
        ];
        const evidenceUpdate = evidence.length ? { evidence } : {};
        const submission = await Submission.findOneAndUpdate(
            { activity: activity._id, student: req.user._id },
            {
                $set: {
                    ...(assignment ? { assignment: assignment._id } : {}),
                    response: response.trim(),
                    ...evidenceUpdate,
                    status: 'en_revision',
                    submittedAt: new Date(),
                    feedback: ''
                }
            },
            { new: true, upsert: true, runValidators: true }
        );
        res.status(201).json({ data: submission });
    } catch (error) {
        next(error);
    }
});

router.post('/evidence-tasks', requireRole('asesor'), async (req, res, next) => {
    try {
        const { assignment: assignmentId, title, instructions, dueDate } = req.body || {};
        assertUuid(assignmentId, 'La prÃ¡ctica');
        const assignment = await ownedAssignment(req.user, assignmentId, ['asesor']);
        if (!assignment) return res.status(404).json({ error: 'No se encontrÃ³ una prÃ¡ctica asignada a tu cuenta.' });
        if (assignment.approvalStatus !== 'aprobada') {
            return res.status(409).json({ error: 'La prÃ¡ctica debe estar aprobada antes de solicitar evidencias.' });
        }
        if (typeof title !== 'string' || !title.trim() || title.trim().length > 180 ||
            typeof instructions !== 'string' || !instructions.trim() || instructions.trim().length > 5000) {
            throw badRequest('Escribe un tÃ­tulo y las instrucciones para la evidencia.');
        }
        const deadline = dueDate ? new Date(dueDate) : null;
        if (dueDate && Number.isNaN(deadline.getTime())) throw badRequest('La fecha lÃ­mite no es vÃ¡lida.');
        const taskId = crypto.randomUUID();
        await database.execute(
            'INSERT INTO practice_evidence_tasks (id, assignment_id, advisor_id, title, instructions, due_date, status) VALUES (:id, :assignmentId, :advisorId, :title, :instructions, :dueDate, :status)',
            {
                id: taskId,
                assignmentId: String(assignment._id),
                advisorId: String(req.user._id),
                title: title.trim(),
                instructions: instructions.trim(),
                dueDate: deadline,
                status: 'activa'
            }
        );
        await notifyStudents([assignment.student], req.user, 'practice', 'Nueva evidencia solicitada', `Tu asesor te solicitÃ³: ${title.trim()}`, 'evidencias');
        res.status(201).json({ data: { _id: taskId, title: title.trim(), assignment: assignment._id } });
    } catch (error) {
        next(error);
    }
});

router.post('/evidence-tasks/:taskId/submissions', requireRole('estudiante'), uploadStudentFiles.array('files', 5), async (req, res, next) => {
    try {
        assertUuid(req.params.taskId, 'La solicitud de evidencia');
        const taskResult = await database.execute(
            'SELECT id, assignment_id, title, status FROM practice_evidence_tasks WHERE id = :id',
            { id: req.params.taskId }
        );
        const task = taskResult.rows[0];
        if (!task || task.STATUS !== 'activa') return res.status(404).json({ error: 'La solicitud de evidencia ya no estÃ¡ disponible.' });
        const assignment = await ownedAssignment(req.user, task.ASSIGNMENT_ID, ['estudiante']);
        if (!assignment) return res.status(403).json({ error: 'Esta evidencia no estÃ¡ asignada a tu cuenta.' });
        if (assignment.approvalStatus !== 'aprobada') {
            return res.status(409).json({ error: 'La prÃ¡ctica debe estar aprobada para enviar evidencias.' });
        }

        const { date, hours, activityDescription, name = '', url = '' } = req.body || {};
        const activityDate = typeof date === 'string' ? new Date(`${date}T00:00:00`) : new Date(NaN);
        const numericHours = Number(hours);
        if (Number.isNaN(activityDate.getTime()) || !Number.isFinite(numericHours) || numericHours < 0.1 ||
            typeof activityDescription !== 'string' || !activityDescription.trim() || activityDescription.trim().length > 3000) {
            throw badRequest('Indica una fecha, al menos 0.1 horas y la actividad realizada.');
        }
        if (typeof url !== 'string' || (url && (url.length > 2048 || !/^https?:\/\//i.test(url)))) {
            throw badRequest('El enlace debe ser una URL HTTP o HTTPS vÃ¡lida.');
        }
        const files = req.files || [];
        if (files.reduce((total, file) => total + file.size, 0) > maxActivityResourcesSize) {
            throw badRequest('Los archivos no pueden superar 20 MB en total.');
        }
        if (files.some(file => !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(file.mimetype || 'application/octet-stream') || (file.mimetype || '').length > 100)) {
            throw badRequest('Uno de los archivos tiene un tipo no vÃ¡lido.');
        }
        if (!url.trim() && !files.length) throw badRequest('Adjunta un archivo o agrega un enlace.');
        if (url.trim() && (typeof name !== 'string' || !name.trim())) throw badRequest('Escribe un nombre para el enlace.');

        const existingResult = await database.execute(
            'SELECT id, practice_log_id, status FROM practice_evidence_submissions WHERE task_id = :taskId AND student_id = :studentId',
            { taskId: task.ID, studentId: String(req.user._id) }
        );
        const existing = existingResult.rows[0];
        if (existing?.STATUS === 'en_revision' || existing?.STATUS === 'aprobada') {
            return res.status(409).json({ error: 'Esta evidencia ya fue entregada y estÃ¡ pendiente de revisiÃ³n o aprobada.' });
        }

        let submissionId;
        let practiceLog;
        if (existing) {
            submissionId = existing.ID;
            practiceLog = await PracticeLog.findById(existing.PRACTICE_LOG_ID);
            if (!practiceLog) return res.status(409).json({ error: 'No se encontrÃ³ la bitÃ¡cora asociada a la evidencia.' });
            practiceLog.date = activityDate;
            practiceLog.hours = numericHours;
            practiceLog.activityDescription = activityDescription.trim();
            practiceLog.status = 'pendiente';
            practiceLog.reviewedBy = null;
            practiceLog.reviewComment = '';
            await practiceLog.save();
            await database.execute(
                "UPDATE practice_evidence_submissions SET activity_date = :activityDate, hours = :hours, activity_description = :description, status = 'en_revision', review_comment = NULL, submitted_at = SYSTIMESTAMP, updated_at = SYSTIMESTAMP WHERE id = :id",
                { activityDate, hours: numericHours, description: activityDescription.trim(), id: submissionId }
            );
            await database.execute('DELETE FROM practice_evidence_submission_files WHERE submission_id = :id', { id: submissionId });
        } else {
            practiceLog = await PracticeLog.create({
                assignment: assignment._id,
                student: req.user._id,
                date: activityDate,
                hours: numericHours,
                activityDescription: activityDescription.trim()
            });
            submissionId = crypto.randomUUID();
            try {
                await database.execute(
                    "INSERT INTO practice_evidence_submissions (id, task_id, assignment_id, student_id, practice_log_id, activity_date, hours, activity_description, status) VALUES (:id, :taskId, :assignmentId, :studentId, :practiceLogId, :activityDate, :hours, :description, 'en_revision')",
                    {
                        id: submissionId,
                        taskId: task.ID,
                        assignmentId: assignment._id,
                        studentId: req.user._id,
                        practiceLogId: practiceLog._id,
                        activityDate,
                        hours: numericHours,
                        description: activityDescription.trim()
                    }
                );
            } catch (error) {
                try { await PracticeLog.findByIdAndDelete(practiceLog._id); } catch {}
                throw error;
            }
        }

        const evidenceFiles = [
            ...(url.trim() ? [{ name: name.trim().slice(0, 255), url: url.trim() }] : []),
            ...files.map(file => ({
                name: file.originalname.replace(/[\\/\0]/g, '_').slice(0, 255) || 'archivo',
                mimeType: file.mimetype || 'application/octet-stream',
                sizeBytes: file.size,
                fileData: file.buffer.toString('base64')
            }))
        ];
        for (const file of evidenceFiles) {
            await database.execute(
                'INSERT INTO practice_evidence_submission_files (id, submission_id, name, url, mime_type, size_bytes, file_data) VALUES (:id, :submissionId, :name, :url, :mimeType, :sizeBytes, :fileData)',
                {
                    id: crypto.randomUUID(),
                    submissionId,
                    name: file.name,
                    url: file.url || null,
                    mimeType: file.mimeType || null,
                    sizeBytes: file.sizeBytes ?? null,
                    fileData: file.fileData || null
                }
            );
        }
        await notifyStudents([req.user._id], req.user, 'practice', 'Evidencia enviada', `Enviaste la evidencia solicitada: ${task.TITLE}`, 'evidencias');
        res.status(201).json({ data: { _id: submissionId, status: 'en_revision' } });
    } catch (error) {
        next(error);
    }
});

router.patch('/evidence-submissions/:id/review', requireRole('asesor'), async (req, res, next) => {
    try {
        assertUuid(req.params.id, 'La entrega de evidencia');
        const result = await database.execute(
            'SELECT submission.id, submission.task_id, submission.practice_log_id, submission.status AS submission_status, task.assignment_id FROM practice_evidence_submissions submission JOIN practice_evidence_tasks task ON task.id = submission.task_id WHERE submission.id = :id',
            { id: req.params.id }
        );
        const submission = result.rows[0];
        if (!submission) return res.status(404).json({ error: 'No se encontr\u00f3 la entrega de evidencia.' });
        const assignment = await ownedAssignment(req.user, submission.ASSIGNMENT_ID, ['asesor']);
        if (!assignment) return res.status(403).json({ error: 'No tienes permiso para revisar esta evidencia.' });
        if (submission.SUBMISSION_STATUS !== 'en_revision') {
            return res.status(409).json({ error: 'Esta entrega ya no est\u00e1 pendiente de revisi\u00f3n.' });
        }
        const { action, reviewComment = '' } = req.body || {};
        if (!['comment', 'request_changes'].includes(action) || typeof reviewComment !== 'string' || reviewComment.length > 2000) {
            throw badRequest('Guarda un comentario o solicita cambios con un comentario v\u00e1lido.');
        }
        if (action === 'request_changes' && !reviewComment.trim()) {
            throw badRequest('Escribe un comentario para solicitar cambios.');
        }
        if (action === 'request_changes') {
            await database.execute(
                "UPDATE practice_evidence_submissions SET status = 'requiere_cambios', review_comment = :reviewComment, updated_at = SYSTIMESTAMP WHERE id = :id",
                { reviewComment: reviewComment.trim(), id: submission.ID }
            );
        } else {
            await database.execute(
                'UPDATE practice_evidence_submissions SET review_comment = :reviewComment, updated_at = SYSTIMESTAMP WHERE id = :id',
                { reviewComment: reviewComment.trim(), id: submission.ID }
            );
        }
        const practiceLog = await PracticeLog.findById(submission.PRACTICE_LOG_ID);
        if (practiceLog) {
            if (action === 'request_changes') practiceLog.status = 'pendiente';
            practiceLog.reviewedBy = req.user._id;
            practiceLog.reviewComment = reviewComment.trim();
            await practiceLog.save();
        }
        const studentId = assignment.student?._id || assignment.student;
        const message = action === 'request_changes'
            ? `Tu asesor solicit\u00f3 cambios en la evidencia.${reviewComment.trim() ? ` Comentario: ${reviewComment.trim()}` : ''}`
            : `Tu asesor dej\u00f3 un comentario sobre la evidencia.${reviewComment.trim() ? ` Comentario: ${reviewComment.trim()}` : ''}`;
        await notifyStudents(
            [studentId], req.user, 'practiceLog',
            action === 'request_changes' ? 'Cambios solicitados en tu evidencia' : 'Comentario del asesor sobre tu evidencia',
            message, 'evidencias'
        );
        res.json({ data: { _id: submission.ID, status: action === 'request_changes' ? 'requiere_cambios' : submission.SUBMISSION_STATUS, reviewComment: reviewComment.trim() } });
    } catch (error) {
        next(error);
    }
});

router.post('/practice-evidences', requireRole('estudiante'), uploadStudentFiles.array('files', 5), async (req, res, next) => {
    try {
        const { assignment: assignmentId, name = '', url = '' } = req.body || {};
        const assignment = await ownedAssignment(req.user, assignmentId, ['estudiante']);
        if (!assignment) return res.status(404).json({ error: 'No se encontró una práctica asignada a tu cuenta.' });
        if (assignment.approvalStatus !== 'aprobada') {
            return res.status(409).json({ error: 'La práctica debe estar aprobada antes de cargar evidencias.' });
        }
        if (typeof url !== 'string' || (url && (url.length > 2048 || !/^https?:\/\//i.test(url)))) {
            throw badRequest('El enlace debe ser una URL HTTP o HTTPS válida.');
        }
        const files = req.files || [];
        const totalFileSize = files.reduce((total, file) => total + file.size, 0);
        if (totalFileSize > maxActivityResourcesSize) {
            throw badRequest('Los archivos no pueden superar 20 MB en total.');
        }
        if (!url.trim() && !files.length) {
            throw badRequest('Agrega un enlace o selecciona al menos un archivo.');
        }
        if (files.some(file => {
            const mimeType = file.mimetype || 'application/octet-stream';
            return mimeType.length > 100 || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mimeType);
        })) {
            throw badRequest('Uno de los archivos tiene un tipo no válido.');
        }
        const evidenceRecords = [];
        if (url.trim()) {
            if (typeof name !== 'string' || !name.trim()) throw badRequest('Escribe un nombre para el enlace.');
            evidenceRecords.push({
                assignment: assignment._id,
                student: req.user._id,
                name: name.trim().slice(0, 255),
                url: url.trim()
            });
        }
        files.forEach(file => evidenceRecords.push({
            assignment: assignment._id,
            student: req.user._id,
            name: file.originalname.replace(/[\\/\0]/g, '_').slice(0, 255) || 'archivo',
            mimeType: file.mimetype || 'application/octet-stream',
            sizeBytes: file.size,
            fileData: file.buffer.toString('base64')
        }));
        const created = await Promise.all(evidenceRecords.map(item => PracticeEvidence.create(item)));
        res.status(201).json({
            data: created.map(item => ({
                _id: item._id,
                name: item.name,
                url: item.url,
                mimeType: item.mimeType,
                sizeBytes: item.sizeBytes,
                submittedAt: item.submittedAt
            }))
        });
    } catch (error) {
        next(error);
    }
});

router.patch('/submissions/:id/review', requireRole('docente', 'asesor'), async (req, res, next) => {
    try {
        assertUuid(req.params.id, 'La entrega');
        const submission = await Submission.findById(req.params.id);
        if (!submission) return res.status(404).json({ error: 'No se encontró la entrega.' });
        const assignment = submission.assignment
            ? await ownedAssignment(req.user, submission.assignment, ['docente', 'asesor'])
            : null;
        const activity = await Activity.findById(submission.activity).select('subject');
        const subject = activity?.subject && req.user.role === 'docente'
            ? await AcademicSubject.findOne({
                _id: activity.subject,
                teachers: req.user._id
            })
            : null;
        if (!assignment && !subject) return res.status(403).json({ error: 'No tienes acceso a esta entrega.' });
        if (submission.score !== undefined && submission.score !== null && deadlineHasPassed(activity?.dueDate)) {
            return res.status(409).json({ error: 'La fecha l?mite pas?; esta calificaci?n ya no se puede editar.' });
        }
        const { score, feedback = '' } = req.body || {};
        const numericScore = Number(score);
        if (score === '' || score === undefined || !Number.isFinite(numericScore) || numericScore < 0 || numericScore > 5 ||
            typeof feedback !== 'string' || feedback.length > 5000) {
            throw badRequest('Ingresa una calificaci\u00f3n entre 0 y 5 y un comentario de hasta 5000 caracteres.');
        }
        submission.status = 'aprobada';
        submission.score = numericScore;
        submission.feedback = feedback.trim();
        await submission.save();
        await notifyStudents([submission.student], req.user, 'submission', 'Actividad calificada', `Recibiste una calificaci\u00f3n de ${numericScore}/5.${feedback.trim() ? ` Comentario: ${feedback.trim()}` : ''}`, 'mis-actividades');
        res.json({ data: submission });
    } catch (error) {
        next(error);
    }
});

router.post('/logs', requireRole('estudiante'), async (req, res, next) => {
    try {
        const { assignment: assignmentId, date, hours, activityDescription } = req.body || {};
        const assignment = await ownedAssignment(req.user, assignmentId, ['estudiante']);
        if (!assignment) return res.status(404).json({ error: 'No se encontró una práctica asignada a tu cuenta.' });
        if (assignment.approvalStatus !== 'aprobada') {
            return res.status(409).json({ error: 'La práctica debe estar aprobada para registrar horas.' });
        }
        const log = await PracticeLog.create({
            assignment: assignment._id,
            student: req.user._id,
            date,
            hours,
            activityDescription
        });
        res.status(201).json({ data: log });
    } catch (error) {
        next(error);
    }
});

router.patch('/logs/:id/comment', requireRole('docente'), async (req, res, next) => {
    try {
        assertUuid(req.params.id, 'El registro de horas');
        const log = await PracticeLog.findById(req.params.id);
        if (!log) return res.status(404).json({ error: 'No se encontr\u00f3 el registro de horas.' });
        const assignment = await ownedAssignment(req.user, log.assignment, ['docente']);
        if (!assignment) return res.status(403).json({ error: 'No tienes acceso a este registro.' });
        const { reviewComment = '' } = req.body || {};
        if (typeof reviewComment !== 'string' || reviewComment.length > 2000) {
            throw badRequest('El comentario debe tener m\u00e1ximo 2000 caracteres.');
        }
        log.reviewComment = reviewComment.trim();
        log.reviewedBy = req.user._id;
        await log.save();
        await notifyStudents(
            [log.student], req.user, 'practiceLog', 'Comentario sobre tus horas',
            `Tu docente dej\u00f3 un comentario sobre tu registro de horas.${log.reviewComment ? ` Comentario: ${log.reviewComment}` : ''}`,
            'evidencias'
        );
        res.json({ data: { _id: log._id, reviewComment: log.reviewComment } });
    } catch (error) {
        next(error);
    }
});

router.patch('/logs/:id/review', requireRole('asesor', 'director'), async (req, res, next) => {
    try {
        assertUuid(req.params.id, 'El registro de horas');
        const log = await PracticeLog.findById(req.params.id);
        if (!log) return res.status(404).json({ error: 'No se encontró el registro de horas.' });
        const assignment = await ownedAssignment(req.user, log.assignment, ['docente', 'asesor', 'director']);
        if (!assignment) return res.status(403).json({ error: 'No tienes acceso a este registro.' });
        const { status, reviewComment = '' } = req.body || {};
        if (!['aprobada', 'rechazada'].includes(status) || typeof reviewComment !== 'string' || reviewComment.length > 2000) {
            throw badRequest('Selecciona un estado válido y un comentario de hasta 2000 caracteres.');
        }
        log.status = status;
        log.reviewComment = reviewComment.trim();
        log.reviewedBy = req.user._id;
        await log.save();
        await notifyStudents([log.student], req.user, 'practiceLog', 'Bitácora revisada', `Tu registro de horas fue ${status === 'aprobada' ? 'aprobado' : 'rechazado'}.${reviewComment.trim() ? ` Comentario: ${reviewComment.trim()}` : ''}`, 'informacion-proceso');
        res.json({ data: log });
    } catch (error) {
        next(error);
    }
});

router.post('/visits', requireRole('docente'), async (req, res, next) => {
    try {
        const { assignment: assignmentId, visitDate, observation, agreements = '', status = 'realizada' } = req.body || {};
        const assignment = await ownedAssignment(req.user, assignmentId, ['docente']);
        if (!assignment) return res.status(404).json({ error: 'No se encontró una práctica asignada a tu cuenta.' });
        if (!['programada', 'realizada'].includes(status) ||
            typeof observation !== 'string' || !observation.trim() || observation.length > 5000 ||
            typeof agreements !== 'string' || agreements.length > 3000 ||
            !visitDate || Number.isNaN(new Date(visitDate).getTime())) {
            throw badRequest('Ingresa una fecha válida, una observación y un estado válido para la visita.');
        }
        const visit = await PracticeVisit.create({
            assignment: assignment._id,
            tutor: req.user._id,
            visitDate,
            observation: observation.trim(),
            agreements: agreements.trim(),
            status
        });
        await notifyStudents(
            [assignment.student],
            req.user,
            'practice',
            'Visita de seguimiento',
            `Tu tutor registró una visita ${status === 'realizada' ? 'realizada' : 'programada'} para ${new Date(visitDate).toLocaleDateString('es-CO')}.`,
            'mi-practica'
        );
        res.status(201).json({ data: visit });
    } catch (error) {
        next(error);
    }
});

router.post('/attendance', requireRole('asesor'), async (req, res, next) => {
    try {
        const { assignment: assignmentId, date, attendanceStatus, performanceScore, comments } = req.body || {};
        const assignment = await ownedAssignment(req.user, assignmentId, ['asesor']);
        if (!assignment) return res.status(404).json({ error: 'No se encontró una práctica asignada a tu cuenta.' });
        if (!date || Number.isNaN(new Date(date).getTime()) ||
            !['presente', 'ausente', 'tardanza'].includes(attendanceStatus) ||
            performanceScore === undefined || performanceScore === null || String(performanceScore).trim() === '' ||
            !Number.isFinite(Number(performanceScore)) || Number(performanceScore) < 0 ||
            Number(performanceScore) > 5 ||
            typeof comments !== 'string' || !comments.trim() || comments.length > 3000) {
            throw badRequest('Ingresa una fecha válida, asistencia, desempeño entre 0 y 5 y un comentario.');
        }
        const validation = await AttendanceValidation.create({
            assignment: assignment._id,
            student: assignment.student,
            advisor: req.user._id,
            date,
            attendanceStatus,
            performanceScore: Number(performanceScore),
            comments: comments.trim()
        });
        await notifyStudents(
            [assignment.student],
            req.user,
            'observation',
            'Asistencia y desempeño registrados',
            `Tu asesor registró asistencia (${attendanceStatus}) y desempeño de ${validation.performanceScore}/5.`,
            'informacion-proceso'
        );
        res.status(201).json({ data: validation });
    } catch (error) {
        next(error);
    }
});

router.post('/observations', requireRole('docente', 'asesor'), async (req, res, next) => {
    try {
        const { assignment: assignmentId, student: studentId, category = 'Seguimiento', body } = req.body || {};
        const assignment = await ownedAssignment(req.user, assignmentId, ['docente', 'asesor']);
        if (!assignment) return res.status(404).json({ error: 'No se encontró una práctica asignada a tu cuenta.' });
        if (String(assignment.student) !== String(studentId)) throw badRequest('El estudiante no corresponde a la práctica seleccionada.');
        if (typeof body !== 'string' || !body.trim()) throw badRequest('Escribe la observación de seguimiento.');
        const observation = await Observation.create({
            assignment: assignment._id,
            student: assignment.student,
            author: req.user._id,
            category,
            body: body.trim(),
            visibleToStudent: true
        });
        await notifyStudents([assignment.student], req.user, 'observation', category || 'Nueva retroalimentación', body.trim(), 'retroalimentaciones');
        res.status(201).json({ data: observation });
    } catch (error) {
        next(error);
    }
});

router.post('/evaluations', requireRole('docente'), async (req, res, next) => {
    try {
        const { assignment: assignmentId, student: studentId, activity: activityId, score, feedback } = req.body || {};
        const assignment = await ownedAssignment(req.user, assignmentId, ['docente']);
        if (!assignment) return res.status(404).json({ error: 'No se encontró una práctica asignada a tu cuenta.' });
        if (assignment.approvalStatus !== 'aprobada') {
            return res.status(409).json({ error: 'La práctica debe estar aprobada por el director antes de evaluarla.' });
        }
        if (String(assignment.student) !== String(studentId)) throw badRequest('El estudiante no corresponde a la práctica seleccionada.');
        if (typeof feedback !== 'string' || !feedback.trim()) throw badRequest('Escribe la retroalimentación de la evaluación.');
        const evaluation = await Evaluation.create({
            assignment: assignment._id,
            student: assignment.student,
            evaluator: req.user._id,
            activity: activityId || undefined,
            score,
            feedback: feedback.trim()
        });
        await notifyStudents([assignment.student], req.user, 'evaluation', 'Nueva calificación', `Recibiste una calificación de ${evaluation.score}/5. ${feedback.trim()}`, 'evaluaciones');
        res.status(201).json({ data: evaluation });
    } catch (error) {
        next(error);
    }
});

router.patch('/assignments/:id/approval', requireRole('director'), async (req, res, next) => {
    try {
        assertUuid(req.params.id, 'La asignación');
        const assignment = await PracticeAssignment.findById(req.params.id)
            .populate('program', 'name')
            .populate('student', 'firstName lastName semester programId program');
        if (!assignment) return res.status(404).json({ error: 'No se encontró la asignación.' });
        const directorProgramId = req.user.programId?._id || req.user.programId;
        const directorProgram = directorProgramId
            ? await AcademicProgram.findOne({ _id: directorProgramId, active: true }).select('_id name')
            : null;
        const studentProgramMatches = Boolean(directorProgram) && (
            String(assignment.student?.programId || '') === String(directorProgram._id) ||
            (!assignment.student?.programId && assignment.student?.program === directorProgram.name)
        );
        if (![8, 9, 10].includes(Number(assignment.student?.semester)) ||
            Number(assignment.student?.semester) !== Number(req.user.semester) ||
            !studentProgramMatches) {
            return res.status(403).json({
                error: 'Solo puedes gestionar prácticas de estudiantes de tu mismo semestre (8, 9 o 10).'
            });
        }
        const { approvalStatus, approvalComment = '' } = req.body || {};
        if (!['aprobada', 'rechazada', 'pendiente'].includes(approvalStatus) ||
            typeof approvalComment !== 'string' || approvalComment.length > 2000) {
            throw badRequest('Selecciona una decisión válida e ingresa un comentario válido.');
        }
        if (approvalStatus === 'pendiente' && assignment.approvalStatus !== 'aprobada') {
            return res.status(409).json({ error: 'Solo puedes cancelar una aprobación vigente.' });
        }
        if (approvalStatus === 'pendiente') {
            assignment.approvalStatus = 'pendiente';
            assignment.approvalComment = '';
            assignment.approvedBy = null;
            assignment.approvedAt = null;
        } else {
            assignment.approvalStatus = approvalStatus;
            assignment.approvalComment = approvalComment.trim();
            assignment.approvedBy = req.user._id;
            assignment.approvedAt = new Date();
        }
        await assignment.save();
        const notification = approvalStatus === 'pendiente'
            ? 'La aprobación de tu práctica fue cancelada y volvió a pendiente.'
            : `Tu práctica fue ${approvalStatus === 'aprobada' ? 'aprobada' : 'rechazada'}.${approvalComment.trim() ? ` Comentario: ${approvalComment.trim()}` : ''}`;
        await notifyStudents([assignment.student._id], req.user, 'practice', 'Actualización de práctica', notification, 'mi-practica');
        res.json({ data: assignment });
    } catch (error) {
        next(error);
    }
});

router.get('/reports', requireRole('director'), async (req, res, next) => {
    try {
        const assignments = await assignmentsFor(req.user);
        const assignmentIds = idsOf(assignments);
        const logs = await PracticeLog.find({ assignment: { $in: assignmentIds } }).select('hours status');
        const evaluations = await Evaluation.find({ assignment: { $in: assignmentIds } }).select('score');
        const totalHours = logs.filter(log => log.status === 'aprobada').reduce((sum, log) => sum + log.hours, 0);
        const requiredHours = assignments.reduce((sum, item) => sum + requiredHoursOf(item), 0);
        res.json({
            data: {
                assignments,
                totalAssignments: assignments.length,
                activeAssignments: assignments.filter(item => item.status === 'en_curso').length,
                students: new Set(assignments.map(item => String(item.student?._id)).filter(Boolean)).size,
                approvedHours: totalHours,
                requiredHours,
                hoursPercent: requiredHours ? Math.min(100, Math.round(totalHours / requiredHours * 100)) : 0,
                pendingApprovals: assignments.filter(item => item.approvalStatus === 'pendiente').length,
                averageScore: evaluations.length
                    ? Number((evaluations.reduce((sum, item) => sum + item.score, 0) / evaluations.length).toFixed(2))
                    : null
            }
        });
    } catch (error) {
        next(error);
    }
});

router.get('/reports.csv', requireRole('director'), async (req, res, next) => {
    try {
        const assignments = await assignmentsFor(req.user);
        const assignmentIds = idsOf(assignments);
        const [logs, evaluations, attendance, visits] = await Promise.all([
            PracticeLog.find({ assignment: { $in: assignmentIds }, status: 'aprobada' }).select('assignment hours'),
            Evaluation.find({ assignment: { $in: assignmentIds } }).select('assignment score'),
            AttendanceValidation.find({ assignment: { $in: assignmentIds } }).select('assignment attendanceStatus performanceScore'),
            PracticeVisit.find({ assignment: { $in: assignmentIds } }).select('assignment visitDate status')
        ]);
        const quote = value => {
            const text = String(value ?? '');
            const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
            return `"${safeText.replace(/"/g, '""')}"`;
        };
        const headers = [
            'Estudiante', 'Programa', 'Tipo de práctica', 'Institución', 'Docente',
            'Asesor', 'Estado de práctica', 'Aprobación', 'Horas aprobadas',
            'Horas requeridas', 'Registros de asistencia', 'Promedio de desempeño',
            'Promedio de evaluación', 'Visitas'
        ];
        const rows = assignments.map(assignment => {
            const relatedLogs = logs.filter(log => String(log.assignment) === String(assignment._id));
            const relatedEvaluations = evaluations.filter(item => String(item.assignment) === String(assignment._id));
            const relatedAttendance = attendance.filter(item => String(item.assignment) === String(assignment._id));
            const relatedVisits = visits.filter(item => String(item.assignment) === String(assignment._id));
            const average = values => values.length
                ? (values.reduce((sum, item) => sum + item, 0) / values.length).toFixed(2)
                : '';
            return [
                personNameForReport(assignment.student),
                assignment.student?.program || '',
                assignment.practiceType?.name || '',
                assignment.institution?.name || '',
                (assignment.teachers || []).map(personNameForReport).join('; ') || personNameForReport(assignment.teacher),
                personNameForReport(assignment.accompanimentResponsible),
                assignment.status,
                assignment.approvalStatus,
                relatedLogs.reduce((sum, log) => sum + log.hours, 0),
                requiredHoursOf(assignment),
                relatedAttendance.map(item => item.attendanceStatus).join('; '),
                average(relatedAttendance.map(item => item.performanceScore)),
                average(relatedEvaluations.map(item => item.score)),
                relatedVisits.map(item => `${new Date(item.visitDate).toLocaleDateString('es-CO')} (${item.status})`).join('; ')
            ].map(quote).join(',');
        });
        const csv = `\uFEFF${[headers.map(quote).join(','), ...rows].join('\r\n')}`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="informe-practicas.csv"');
        res.send(csv);
    } catch (error) {
        next(error);
    }
});

function personNameForReport(person) {
    return person && typeof person === 'object'
        ? [person.firstName, person.middleName, person.lastName, person.secondLastName].filter(Boolean).join(' ')
        : '';
}

router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        const message = error.code === 'LIMIT_FILE_SIZE'
            ? 'Cada archivo debe pesar como máximo 20 MB.'
            : error.code === 'LIMIT_FILE_COUNT'
                ? 'Puedes adjuntar hasta 5 archivos.'
                : 'No se pudo procesar el archivo adjunto.';
        return res.status(400).json({ error: message });
    }
    if (error.code === 11000) {
        return res.status(409).json({ error: 'El registro ya existe y no se puede duplicar.' });
    }
    if (error.name === 'ValidationError' || error.name === 'CastError') {
        return res.status(400).json({ error: error.message });
    }
    next(error);
});

module.exports = router;
