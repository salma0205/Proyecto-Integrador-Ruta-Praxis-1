const express = require('express');
const mongoose = require('mongoose');
const {
    User,
    AcademicProgram,
    AcademicSubject,
    PracticeAssignment,
    Activity,
    Submission,
    Observation,
    Evaluation,
    PracticeLog,
    StudentNotification
} = require('../models');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('estudiante', 'docente', 'asesor', 'director'));

function badRequest(message) {
    const error = new Error(message);
    error.status = 400;
    return error;
}

async function assignmentsFor(user) {
    let filter;
    if (user.role === 'estudiante') filter = { student: user._id };
    if (user.role === 'docente') filter = { teacher: user._id };
    if (user.role === 'asesor') filter = { accompanimentResponsible: user._id };
    if (user.role === 'director') {
        const programs = await AcademicProgram.find({ director: user._id }).select('_id');
        const students = await User.find({
            role: 'estudiante',
            programId: { $in: programs.map(program => program._id) }
        }).select('_id');
        filter = { student: { $in: students.map(student => student._id) } };
    }
    return PracticeAssignment.find(filter)
        .sort({ createdAt: -1 })
        .limit(250)
        .populate('practiceType', 'name semester requiredHours')
        .populate('institution', 'name')
        .populate('student', 'firstName middleName lastName secondLastName email studentCode programId')
        .populate('teacher', 'firstName lastName')
        .populate('accompanimentResponsible', 'firstName lastName');
}

function idsOf(assignments) {
    return assignments.map(assignment => assignment._id);
}

function assertObjectId(value, label) {
    if (!mongoose.isValidObjectId(value)) throw badRequest(`${label} no es válido.`);
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
        assertObjectId(req.params.id, 'La notificación');
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
    assertObjectId(assignmentId, 'La asignación');
    const assignment = await PracticeAssignment.findById(assignmentId);
    if (!assignment) return null;

    const owns = roles.some(role => {
        if (role === 'estudiante') return String(assignment.student) === String(user._id);
        if (role === 'docente') return String(assignment.teacher) === String(user._id);
        if (role === 'asesor') return String(assignment.accompanimentResponsible) === String(user._id);
        return false;
    });
    return owns ? assignment : null;
}

router.get('/dashboard', async (req, res, next) => {
    try {
        const assignments = await assignmentsFor(req.user);
        const assignmentIds = idsOf(assignments);
        const subjectRoleField = req.user.role === 'docente' ? 'teachers' : req.user.role === 'estudiante' ? 'students' : null;
        const subjectFilter = subjectRoleField ? { active: true, [subjectRoleField]: req.user._id } : null;
        if (req.user.role === 'estudiante' && req.user.semester) {
            subjectFilter.semester = Number(req.user.semester);
        }
        const subjectsQuery = subjectFilter
            ? AcademicSubject.find(subjectFilter)
                .sort({ semester: 1, name: 1 })
                .populate('teachers', 'firstName middleName lastName secondLastName email')
                .populate({ path: 'students', match: { active: true }, select: 'firstName middleName lastName secondLastName email studentCode semester' })
            : Promise.resolve([]);
        const subjects = await subjectsQuery;
        const subjectIds = subjects.map(subject => subject._id);
        const activities = await Activity.find({ $or: [{ assignment: { $in: assignmentIds } }, { subject: { $in: subjectIds } }] })
            .sort({ createdAt: -1 }).limit(250)
            .populate('assignment', 'student teacher practiceType')
            .populate('subject', 'name code semester')
            .populate('author', 'firstName lastName');
        const activityIds = activities.map(activity => activity._id);
        const [submissions, logs, observations, evaluations] = await Promise.all([
            Submission.find({ activity: { $in: activityIds } }).sort({ submittedAt: -1 }).limit(250).populate('activity', 'title subject assignment').populate('assignment', 'student teacher').populate('student', 'firstName lastName email'),
            PracticeLog.find({ assignment: { $in: assignmentIds } }).sort({ date: -1 }).limit(500).populate('assignment', 'student practiceType institution').populate('student', 'firstName lastName').populate('reviewedBy', 'firstName lastName'),
            Observation.find({ assignment: { $in: assignmentIds }, ...(req.user.role === 'estudiante' ? { visibleToStudent: true } : {}) }).sort({ observedAt: -1 }).limit(250).populate('student', 'firstName lastName').populate('author', 'firstName lastName'),
            Evaluation.find({ assignment: { $in: assignmentIds } }).sort({ evaluatedAt: -1 }).limit(250).populate('assignment', 'student practiceType').populate('student', 'firstName lastName').populate('evaluator', 'firstName lastName')
        ]);
        const approvedHours = logs.filter(log => log.status === 'aprobada').reduce((total, log) => total + log.hours, 0);
        const requiredHours = assignments.reduce((total, assignment) => total + (assignment.practiceType?.requiredHours || 0), 0);
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
                activities,
                submissions,
                logs,
                observations,
                evaluations,
                metrics: {
                    assignments: assignments.length,
                    activeAssignments: assignments.filter(item => item.status === 'en_curso').length,
                    students: new Set(assignments.map(item => String(item.student?._id)).filter(Boolean)).size,
                    pendingApprovals: assignments.filter(item => item.approvalStatus === 'pendiente').length,
                    pendingSubmissions: submissions.filter(item => item.status === 'en_revision').length,
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

router.post('/activities', requireRole('docente'), async (req, res, next) => {
    try {
        const { assignment: assignmentId, subject: subjectId, title, instructions, dueDate, resourceUrl } = req.body || {};
        let assignment = null;
        let subject = null;
        if (subjectId) {
            assertObjectId(subjectId, 'La asignatura');
            subject = await AcademicSubject.findOne({ _id: subjectId, active: true, teachers: req.user._id });
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
        const activity = await Activity.create({
            ...(assignment ? { assignment: assignment._id } : {}),
            ...(subject ? { subject: subject._id } : {}),
            author: req.user._id,
            title: title.trim(),
            instructions: instructions.trim(),
            dueDate: dueDate || undefined,
            resourceUrl: resourceUrl || undefined
        });
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
        await notifyStudents(recipientIds, req.user, 'activity', 'Nueva actividad', `Tu docente publicó: ${activity.title}`, 'mis-actividades');
        res.status(201).json({ data: activity });
    } catch (error) {
        next(error);
    }
});

router.post('/submissions', requireRole('estudiante'), async (req, res, next) => {
    try {
        const { activity: activityId, response = '', evidence = [] } = req.body || {};
        assertObjectId(activityId, 'La actividad');
        const activity = await Activity.findById(activityId).select('assignment subject status');
        if (!activity) return res.status(404).json({ error: 'No se encontró la actividad.' });
        const assignment = activity.assignment ? await ownedAssignment(req.user, activity.assignment, ['estudiante']) : null;
        const subject = activity.subject
            ? await AcademicSubject.findOne({
                _id: activity.subject,
                active: true,
                students: req.user._id,
                ...(req.user.semester ? { semester: Number(req.user.semester) } : {})
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
            if (!item || typeof item.name !== 'string' || typeof item.url !== 'string' ||
                !/^https?:\/\//i.test(item.url) || item.url.length > 2048) {
                throw badRequest('Cada evidencia debe tener un nombre y una URL HTTP o HTTPS válida.');
            }
        }
        const submission = await Submission.findOneAndUpdate(
            { activity: activity._id, student: req.user._id },
            {
                $set: {
                    ...(assignment ? { assignment: assignment._id } : {}),
                    response: response.trim(),
                    evidence,
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

router.patch('/submissions/:id/review', requireRole('docente', 'asesor'), async (req, res, next) => {
    try {
        assertObjectId(req.params.id, 'La entrega');
        const submission = await Submission.findById(req.params.id);
        if (!submission) return res.status(404).json({ error: 'No se encontró la entrega.' });
        const assignment = submission.assignment
            ? await ownedAssignment(req.user, submission.assignment, ['docente', 'asesor'])
            : null;
        const activity = await Activity.findById(submission.activity).select('subject');
        const subject = activity?.subject && req.user.role === 'docente'
            ? await AcademicSubject.findOne({ _id: activity.subject, teachers: req.user._id })
            : null;
        if (!assignment && !subject) return res.status(403).json({ error: 'No tienes acceso a esta entrega.' });
        const { status, feedback = '' } = req.body || {};
        if (!['aprobada', 'requiere_cambios'].includes(status) || typeof feedback !== 'string' || feedback.length > 5000) {
            throw badRequest('Selecciona un estado válido e ingresa una retroalimentación de hasta 5000 caracteres.');
        }
        submission.status = status;
        submission.feedback = feedback.trim();
        await submission.save();
        await notifyStudents([submission.student], req.user, 'submission', 'Entrega revisada', `${status === 'aprobada' ? 'Tu entrega fue aprobada.' : 'Tu entrega requiere cambios.'}${feedback.trim() ? ` Comentario: ${feedback.trim()}` : ''}`, 'evidencias');
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

router.patch('/logs/:id/review', requireRole('docente', 'asesor'), async (req, res, next) => {
    try {
        assertObjectId(req.params.id, 'El registro de horas');
        const log = await PracticeLog.findById(req.params.id);
        if (!log) return res.status(404).json({ error: 'No se encontró el registro de horas.' });
        const assignment = await ownedAssignment(req.user, log.assignment, ['docente', 'asesor']);
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
        assertObjectId(req.params.id, 'La asignación');
        const assignment = await PracticeAssignment.findById(req.params.id).populate('student', 'programId');
        if (!assignment) return res.status(404).json({ error: 'No se encontró la asignación.' });
        const program = assignment.student?.programId
            ? await AcademicProgram.findOne({ _id: assignment.student.programId, director: req.user._id }).select('_id')
            : null;
        if (!program) return res.status(403).json({ error: 'Solo el director del programa del estudiante puede aprobar esta práctica.' });
        const { approvalStatus, approvalComment = '' } = req.body || {};
        if (!['aprobada', 'rechazada'].includes(approvalStatus) || typeof approvalComment !== 'string' || approvalComment.length > 2000) {
            throw badRequest('Selecciona aprobar o rechazar e ingresa un comentario válido.');
        }
        assignment.approvalStatus = approvalStatus;
        assignment.approvalComment = approvalComment.trim();
        assignment.approvedBy = req.user._id;
        assignment.approvedAt = new Date();
        await assignment.save();
        await notifyStudents([assignment.student._id], req.user, 'practice', 'Actualización de práctica', `Tu práctica fue ${approvalStatus === 'aprobada' ? 'aprobada' : 'rechazada'}.${approvalComment.trim() ? ` Comentario: ${approvalComment.trim()}` : ''}`, 'mi-practica');
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
        const requiredHours = assignments.reduce((sum, item) => sum + (item.practiceType?.requiredHours || 0), 0);
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

router.use((error, req, res, next) => {
    if (error.code === 11000) {
        return res.status(409).json({ error: 'El registro ya existe y no se puede duplicar.' });
    }
    if (error.name === 'ValidationError' || error.name === 'CastError') {
        return res.status(400).json({ error: error.message });
    }
    next(error);
});

module.exports = router;
