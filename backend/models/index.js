const mongoose = require('mongoose');

const { Schema } = mongoose;
const objectId = Schema.Types.ObjectId;

const userSchema = new Schema({
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    middleName: { type: String, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    secondLastName: { type: String, trim: true, maxlength: 80 },
    email: {
        type: String,
        required: function () { return this.role !== 'administrador'; },
        unique: true,
        trim: true,
        lowercase: true,
        maxlength: 254,
        validate: {
            validator: value => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
            message: 'El correo debe tener un formato válido.'
        }
    },
    username: {
        type: String,
        required: function () { return this.role === 'administrador'; },
        unique: true,
        sparse: true,
        trim: true,
        lowercase: true,
        maxlength: 40,
        match: /^[a-z0-9._-]+$/
    },
    passwordHash: { type: String, required: true, select: false },
    documentNumber: { type: String, trim: true, sparse: true, unique: true, maxlength: 40 },
    studentCode: { type: String, trim: true, sparse: true, unique: true, maxlength: 40 },
    subjects: [{ type: objectId, ref: 'AcademicSubject' }],
    role: { type: String, required: true, enum: ['administrador', 'estudiante', 'asesor', 'director', 'docente'] },
    phone: { type: String, trim: true, maxlength: 30 },
    personalEmail: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 254,
        validate: {
            validator: value => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
            message: 'El correo personal debe tener un formato válido.'
        }
    },
    profilePhoto: { type: String, maxlength: 7000000, select: false },
    program: { type: String, trim: true, maxlength: 160 },
    programId: { type: objectId, ref: 'AcademicProgram' },
    semester: { type: Number, min: 1, max: 20 },
    active: { type: Boolean, default: true }
}, { timestamps: true });

const institutionSchema = new Schema({
    name: { type: String, required: true, trim: true, maxlength: 180 },
    address: { type: String, trim: true, maxlength: 250 },
    semesters: [{ type: Number, min: 1, max: 20 }],
    practiceName: { type: String, trim: true, maxlength: 160 },
    advisorName: { type: String, trim: true, maxlength: 160 },
    type: { type: String, trim: true, maxlength: 100 },
    agreementActive: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    contactName: { type: String, trim: true, maxlength: 160 },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 254 },
    contactPhone: { type: String, trim: true, maxlength: 30 }
}, { timestamps: true });

institutionSchema.index({ name: 1 }, { unique: true });

const academicSubjectSchema = new Schema({
    name: { type: String, required: true, trim: true, maxlength: 160 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    semester: { type: Number, min: 1, max: 20 },
    teachers: [{ type: objectId, ref: 'User' }],
    students: [{ type: objectId, ref: 'User' }],
    active: { type: Boolean, default: true }
}, { timestamps: true });

const academicProgramSchema = new Schema({
    name: { type: String, required: true, trim: true, maxlength: 160 },
    director: { type: objectId, ref: 'User', default: null },
    teachers: [{ type: objectId, ref: 'User' }],
    active: { type: Boolean, default: true }
}, { timestamps: true });

academicProgramSchema.index({ name: 1 }, { unique: true });
academicProgramSchema.index({ director: 1 });

academicSubjectSchema.index({ name: 1 }, { unique: true });
academicSubjectSchema.index({ code: 1 }, { unique: true });

const practiceTypeSchema = new Schema({
    name: { type: String, required: true, trim: true, maxlength: 160 },
    semester: { type: Number, min: 1, max: 20 },
    description: { type: String, trim: true, maxlength: 2000 },
    requiredHours: { type: Number, min: 0, default: 0 },
    active: { type: Boolean, default: true }
}, { timestamps: true });

practiceTypeSchema.index({ name: 1, semester: 1 }, { unique: true });

const practiceAssignmentSchema = new Schema({
    practiceType: { type: objectId, ref: 'PracticeType', required: true },
    student: { type: objectId, ref: 'User', required: true },
    teacher: { type: objectId, ref: 'User', required: true },
    accompanimentResponsible: { type: objectId, ref: 'User' },
    institution: { type: objectId, ref: 'Institution', required: true },
    academicPeriod: { type: String, trim: true, maxlength: 30 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['disponible', 'en_curso', 'finalizada', 'cancelada'], default: 'disponible' },
    approvalStatus: { type: String, enum: ['pendiente', 'aprobada', 'rechazada'], default: 'pendiente' },
    approvalComment: { type: String, trim: true, maxlength: 2000 },
    approvedBy: { type: objectId, ref: 'User' },
    approvedAt: { type: Date },
    description: { type: String, trim: true, maxlength: 2000 }
}, { timestamps: true });

practiceAssignmentSchema.index({ student: 1, academicPeriod: 1 });
practiceAssignmentSchema.index({ teacher: 1, status: 1 });
practiceAssignmentSchema.path('endDate').validate(function (endDate) {
    return !this.startDate || !endDate || endDate >= this.startDate;
}, 'La fecha final debe ser igual o posterior a la fecha inicial.');

const activitySchema = new Schema({
    assignment: { type: objectId, ref: 'PracticeAssignment', required: true },
    author: { type: objectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    instructions: { type: String, required: true, trim: true, maxlength: 5000 },
    dueDate: { type: Date },
    status: { type: String, enum: ['programada', 'activa', 'finalizada'], default: 'activa' },
    resourceUrl: { type: String, trim: true, maxlength: 2048 }
}, { timestamps: true });

activitySchema.index({ assignment: 1, status: 1 });

const evidenceSchema = new Schema({
    name: { type: String, required: true, trim: true, maxlength: 255 },
    url: { type: String, required: true, trim: true, maxlength: 2048 },
    mimeType: { type: String, trim: true, maxlength: 120 },
    sizeBytes: { type: Number, min: 0 }
}, { _id: false });

const submissionSchema = new Schema({
    activity: { type: objectId, ref: 'Activity', required: true },
    assignment: { type: objectId, ref: 'PracticeAssignment', required: true },
    student: { type: objectId, ref: 'User', required: true },
    response: { type: String, trim: true, maxlength: 10000 },
    evidence: { type: [evidenceSchema], default: [] },
    feedback: { type: String, trim: true, maxlength: 5000 },
    submittedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['pendiente', 'en_revision', 'aprobada', 'requiere_cambios'], default: 'en_revision' }
}, { timestamps: true });

submissionSchema.index({ activity: 1, student: 1 }, { unique: true });

const observationSchema = new Schema({
    assignment: { type: objectId, ref: 'PracticeAssignment', required: true },
    student: { type: objectId, ref: 'User', required: true },
    author: { type: objectId, ref: 'User', required: true },
    category: { type: String, trim: true, maxlength: 100 },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    observedAt: { type: Date, default: Date.now },
    visibleToStudent: { type: Boolean, default: true }
}, { timestamps: true });

const evaluationSchema = new Schema({
    assignment: { type: objectId, ref: 'PracticeAssignment', required: true },
    student: { type: objectId, ref: 'User', required: true },
    evaluator: { type: objectId, ref: 'User', required: true },
    activity: { type: objectId, ref: 'Activity' },
    submission: { type: objectId, ref: 'Submission' },
    score: { type: Number, required: true, min: 0, max: 5 },
    feedback: { type: String, required: true, trim: true, maxlength: 5000 },
    evaluatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const practiceLogSchema = new Schema({
    assignment: { type: objectId, ref: 'PracticeAssignment', required: true },
    student: { type: objectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    hours: { type: Number, required: true, min: 0.1, max: 24 },
    activityDescription: { type: String, required: true, trim: true, maxlength: 3000 },
    status: { type: String, enum: ['pendiente', 'aprobada', 'rechazada'], default: 'pendiente' },
    reviewedBy: { type: objectId, ref: 'User' },
    reviewComment: { type: String, trim: true, maxlength: 2000 }
}, { timestamps: true });

practiceLogSchema.index({ assignment: 1, date: -1 });

const adminAuditSchema = new Schema({
    actor: { type: objectId, ref: 'User', required: true },
    actorName: { type: String, required: true, trim: true, maxlength: 170 },
    action: { type: String, required: true, enum: ['created', 'updated', 'deleted', 'activated', 'deactivated'] },
    entity: { type: String, required: true, enum: ['user', 'program', 'subject', 'institution', 'practiceType', 'assignment', 'activity', 'submission', 'observation', 'evaluation', 'practiceLog'] },
    entityId: { type: String, required: true, maxlength: 80 },
    summary: { type: String, required: true, trim: true, maxlength: 300 }
}, { timestamps: { createdAt: true, updatedAt: false } });

adminAuditSchema.index({ createdAt: -1 });

module.exports = {
    User: mongoose.model('User', userSchema),
    Institution: mongoose.model('Institution', institutionSchema),
    AcademicProgram: mongoose.model('AcademicProgram', academicProgramSchema),
    AcademicSubject: mongoose.model('AcademicSubject', academicSubjectSchema),
    PracticeType: mongoose.model('PracticeType', practiceTypeSchema),
    PracticeAssignment: mongoose.model('PracticeAssignment', practiceAssignmentSchema),
    Activity: mongoose.model('Activity', activitySchema),
    Submission: mongoose.model('Submission', submissionSchema),
    Observation: mongoose.model('Observation', observationSchema),
    Evaluation: mongoose.model('Evaluation', evaluationSchema),
    PracticeLog: mongoose.model('PracticeLog', practiceLogSchema),
    AdminAudit: mongoose.model('AdminAudit', adminAuditSchema)
};
