-- Run with SQL*Plus while connected as the application schema owner.
-- The Node.js application supplies UUID values for all ID columns.

CREATE TABLE users (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    first_name VARCHAR2(80 CHAR) NOT NULL,
    middle_name VARCHAR2(80 CHAR),
    last_name VARCHAR2(80 CHAR) NOT NULL,
    second_last_name VARCHAR2(80 CHAR),
    email VARCHAR2(254 CHAR),
    username VARCHAR2(40 CHAR),
    password_hash VARCHAR2(255 CHAR) NOT NULL,
    document_number VARCHAR2(40 CHAR),
    student_code VARCHAR2(40 CHAR),
    role VARCHAR2(20 CHAR) NOT NULL,
    phone VARCHAR2(30 CHAR),
    personal_email VARCHAR2(254 CHAR),
    profile_photo CLOB,
    program_name VARCHAR2(160 CHAR),
    program_id VARCHAR2(36 CHAR),
    semester NUMBER(2),
    active NUMBER(1) DEFAULT 1 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT users_role_ck CHECK (role IN ('administrador', 'estudiante', 'asesor', 'director', 'docente')),
    CONSTRAINT users_active_ck CHECK (active IN (0, 1)),
    CONSTRAINT users_semester_ck CHECK (semester IS NULL OR semester BETWEEN 1 AND 20),
    CONSTRAINT users_program_role_ck CHECK (
        (role = 'director' AND program_id IS NOT NULL) OR
        role = 'estudiante' OR
        (role NOT IN ('director', 'estudiante') AND program_id IS NULL)
    ),
    CONSTRAINT users_username_uq UNIQUE (username),
    CONSTRAINT users_email_uq UNIQUE (email),
    CONSTRAINT users_document_uq UNIQUE (document_number),
    CONSTRAINT users_student_code_uq UNIQUE (student_code)
);

CREATE UNIQUE INDEX users_single_admin_uq
    ON users (CASE WHEN role = 'administrador' THEN role END);

CREATE TABLE academic_programs (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    name VARCHAR2(160 CHAR) NOT NULL,
    director_id VARCHAR2(36 CHAR),
    active NUMBER(1) DEFAULT 1 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT academic_programs_name_uq UNIQUE (name),
    CONSTRAINT academic_programs_active_ck CHECK (active IN (0, 1)),
    CONSTRAINT academic_programs_director_fk FOREIGN KEY (director_id) REFERENCES users(id)
);

ALTER TABLE users ADD CONSTRAINT users_program_fk
    FOREIGN KEY (program_id) REFERENCES academic_programs(id);

CREATE TABLE program_teachers (
    program_id VARCHAR2(36 CHAR) NOT NULL,
    teacher_id VARCHAR2(36 CHAR) NOT NULL,
    CONSTRAINT program_teachers_pk PRIMARY KEY (program_id, teacher_id),
    CONSTRAINT program_teachers_program_fk FOREIGN KEY (program_id) REFERENCES academic_programs(id),
    CONSTRAINT program_teachers_teacher_fk FOREIGN KEY (teacher_id) REFERENCES users(id)
);

CREATE TABLE program_directors (
    program_id VARCHAR2(36 CHAR) NOT NULL,
    director_id VARCHAR2(36 CHAR) NOT NULL,
    CONSTRAINT program_directors_pk PRIMARY KEY (program_id, director_id),
    CONSTRAINT program_directors_director_uq UNIQUE (director_id),
    CONSTRAINT program_directors_program_fk FOREIGN KEY (program_id) REFERENCES academic_programs(id),
    CONSTRAINT program_directors_user_fk FOREIGN KEY (director_id) REFERENCES users(id)
);

CREATE TABLE academic_subjects (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    name VARCHAR2(160 CHAR) NOT NULL,
    code VARCHAR2(40 CHAR) NOT NULL,
    semester NUMBER(2),
    active NUMBER(1) DEFAULT 1 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT academic_subjects_name_uq UNIQUE (name),
    CONSTRAINT academic_subjects_code_uq UNIQUE (code),
    CONSTRAINT academic_subjects_semester_ck CHECK (semester IS NULL OR semester BETWEEN 1 AND 20),
    CONSTRAINT academic_subjects_active_ck CHECK (active IN (0, 1))
);

CREATE TABLE subject_teachers (
    subject_id VARCHAR2(36 CHAR) NOT NULL,
    teacher_id VARCHAR2(36 CHAR) NOT NULL,
    CONSTRAINT subject_teachers_pk PRIMARY KEY (subject_id, teacher_id),
    CONSTRAINT subject_teachers_subject_fk FOREIGN KEY (subject_id) REFERENCES academic_subjects(id),
    CONSTRAINT subject_teachers_teacher_fk FOREIGN KEY (teacher_id) REFERENCES users(id)
);

CREATE TABLE subject_students (
    subject_id VARCHAR2(36 CHAR) NOT NULL,
    student_id VARCHAR2(36 CHAR) NOT NULL,
    CONSTRAINT subject_students_pk PRIMARY KEY (subject_id, student_id),
    CONSTRAINT subject_students_subject_fk FOREIGN KEY (subject_id) REFERENCES academic_subjects(id),
    CONSTRAINT subject_students_student_fk FOREIGN KEY (student_id) REFERENCES users(id)
);

CREATE TABLE student_teachers (
    student_id VARCHAR2(36 CHAR) NOT NULL,
    teacher_id VARCHAR2(36 CHAR) NOT NULL,
    CONSTRAINT student_teachers_pk PRIMARY KEY (student_id, teacher_id),
    CONSTRAINT student_teachers_student_fk FOREIGN KEY (student_id) REFERENCES users(id),
    CONSTRAINT student_teachers_teacher_fk FOREIGN KEY (teacher_id) REFERENCES users(id)
);

CREATE TABLE student_directors (
    student_id VARCHAR2(36 CHAR) PRIMARY KEY,
    director_id VARCHAR2(36 CHAR) NOT NULL,
    CONSTRAINT student_directors_student_fk FOREIGN KEY (student_id) REFERENCES users(id),
    CONSTRAINT student_directors_director_fk FOREIGN KEY (director_id) REFERENCES users(id)
);

CREATE TABLE institutions (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    name VARCHAR2(180 CHAR) NOT NULL,
    address VARCHAR2(250 CHAR),
    practice_name VARCHAR2(160 CHAR),
    advisor_name VARCHAR2(160 CHAR),
    institution_type VARCHAR2(100 CHAR),
    agreement_active NUMBER(1) DEFAULT 0 NOT NULL,
    active NUMBER(1) DEFAULT 1 NOT NULL,
    contact_name VARCHAR2(160 CHAR),
    contact_email VARCHAR2(254 CHAR),
    contact_phone VARCHAR2(30 CHAR),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT institutions_name_uq UNIQUE (name),
    CONSTRAINT institutions_agreement_ck CHECK (agreement_active IN (0, 1)),
    CONSTRAINT institutions_active_ck CHECK (active IN (0, 1))
);

CREATE TABLE institution_semesters (
    institution_id VARCHAR2(36 CHAR) NOT NULL,
    semester NUMBER(2) NOT NULL,
    CONSTRAINT institution_semesters_pk PRIMARY KEY (institution_id, semester),
    CONSTRAINT institution_semesters_range_ck CHECK (semester BETWEEN 1 AND 20),
    CONSTRAINT inst_sem_institution_fk FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

CREATE TABLE practice_types (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    name VARCHAR2(160 CHAR) NOT NULL,
    semester NUMBER(2),
    description VARCHAR2(2000 CHAR),
    required_hours NUMBER(6, 1) DEFAULT 0 NOT NULL,
    active NUMBER(1) DEFAULT 1 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pr_types_name_sem_uq UNIQUE (name, semester),
    CONSTRAINT practice_types_semester_ck CHECK (semester IS NULL OR semester BETWEEN 1 AND 20),
    CONSTRAINT practice_types_hours_ck CHECK (required_hours >= 0),
    CONSTRAINT practice_types_active_ck CHECK (active IN (0, 1))
);

CREATE TABLE practice_assignments (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    practice_type_id VARCHAR2(36 CHAR) NOT NULL,
    program_id VARCHAR2(36 CHAR) NOT NULL,
    student_id VARCHAR2(36 CHAR) NOT NULL,
    teacher_id VARCHAR2(36 CHAR) NOT NULL,
    advisor_id VARCHAR2(36 CHAR),
    institution_id VARCHAR2(36 CHAR) NOT NULL,
    academic_period VARCHAR2(30 CHAR),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    required_hours NUMBER(6, 1) DEFAULT 0 NOT NULL,
    status VARCHAR2(20 CHAR) DEFAULT 'disponible' NOT NULL,
    approval_status VARCHAR2(20 CHAR) DEFAULT 'pendiente' NOT NULL,
    approval_comment VARCHAR2(2000 CHAR),
    approved_by VARCHAR2(36 CHAR),
    approved_at TIMESTAMP WITH TIME ZONE,
    description VARCHAR2(2000 CHAR),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT practice_assignments_dates_ck CHECK (end_date >= start_date),
    CONSTRAINT practice_assignments_hours_ck CHECK (required_hours >= 0),
    CONSTRAINT practice_assignments_status_ck CHECK (status IN ('disponible', 'en_curso', 'finalizada', 'cancelada')),
    CONSTRAINT pr_assign_approval_ck CHECK (approval_status IN ('pendiente', 'aprobada', 'rechazada')),
    CONSTRAINT practice_assignments_type_fk FOREIGN KEY (practice_type_id) REFERENCES practice_types(id),
    CONSTRAINT pr_assign_program_fk FOREIGN KEY (program_id) REFERENCES academic_programs(id),
    CONSTRAINT pr_assign_student_fk FOREIGN KEY (student_id) REFERENCES users(id),
    CONSTRAINT pr_assign_teacher_fk FOREIGN KEY (teacher_id) REFERENCES users(id),
    CONSTRAINT pr_assign_advisor_fk FOREIGN KEY (advisor_id) REFERENCES users(id),
    CONSTRAINT pr_assign_institution_fk FOREIGN KEY (institution_id) REFERENCES institutions(id),
    CONSTRAINT pr_assign_approver_fk FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE practice_assignment_teachers (
    assignment_id VARCHAR2(36 CHAR) NOT NULL,
    teacher_id VARCHAR2(36 CHAR) NOT NULL,
    CONSTRAINT practice_assignment_teachers_pk PRIMARY KEY (assignment_id, teacher_id),
    CONSTRAINT pr_assign_teachers_assignment_fk FOREIGN KEY (assignment_id) REFERENCES practice_assignments(id),
    CONSTRAINT pr_assign_teachers_teacher_fk FOREIGN KEY (teacher_id) REFERENCES users(id)
);

CREATE TABLE activities (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    assignment_id VARCHAR2(36 CHAR),
    subject_id VARCHAR2(36 CHAR),
    author_id VARCHAR2(36 CHAR) NOT NULL,
    kind VARCHAR2(20 CHAR) DEFAULT 'actividad' NOT NULL,
    title VARCHAR2(180 CHAR) NOT NULL,
    instructions CLOB NOT NULL,
    due_date DATE,
    status VARCHAR2(20 CHAR) DEFAULT 'activa' NOT NULL,
    resource_url VARCHAR2(2048 CHAR),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT activities_status_ck CHECK (status IN ('programada', 'activa', 'finalizada')),
    CONSTRAINT activities_kind_ck CHECK (kind IN ('actividad', 'evaluacion')),
    CONSTRAINT activities_assignment_fk FOREIGN KEY (assignment_id) REFERENCES practice_assignments(id),
    CONSTRAINT activities_subject_fk FOREIGN KEY (subject_id) REFERENCES academic_subjects(id),
    CONSTRAINT activities_author_fk FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE TABLE activity_resources (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    activity_id VARCHAR2(36 CHAR) NOT NULL,
    name VARCHAR2(255 CHAR) NOT NULL,
    mime_type VARCHAR2(100 CHAR) NOT NULL,
    size_bytes NUMBER(10) NOT NULL,
    file_data CLOB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT activity_resources_activity_fk FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
);

CREATE INDEX activity_resources_activity_ix ON activity_resources(activity_id, created_at);

CREATE TABLE submissions (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    activity_id VARCHAR2(36 CHAR) NOT NULL,
    assignment_id VARCHAR2(36 CHAR),
    student_id VARCHAR2(36 CHAR) NOT NULL,
    response CLOB,
    feedback CLOB,
    score NUMBER(2, 1),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    status VARCHAR2(24 CHAR) DEFAULT 'en_revision' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT subs_act_student_uq UNIQUE (activity_id, student_id),
    CONSTRAINT submissions_status_ck CHECK (status IN ('pendiente', 'en_revision', 'aprobada', 'requiere_cambios')),
    CONSTRAINT submissions_score_ck CHECK (score IS NULL OR score BETWEEN 0 AND 5),
    CONSTRAINT submissions_activity_fk FOREIGN KEY (activity_id) REFERENCES activities(id),
    CONSTRAINT submissions_assignment_fk FOREIGN KEY (assignment_id) REFERENCES practice_assignments(id),
    CONSTRAINT submissions_student_fk FOREIGN KEY (student_id) REFERENCES users(id)
);

CREATE TABLE submission_evidence (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    submission_id VARCHAR2(36 CHAR) NOT NULL,
    name VARCHAR2(255 CHAR) NOT NULL,
    url VARCHAR2(2048 CHAR),
    mime_type VARCHAR2(120 CHAR),
    size_bytes NUMBER(12),
    file_data CLOB,
    CONSTRAINT submission_evidence_size_ck CHECK (size_bytes IS NULL OR size_bytes >= 0),
    CONSTRAINT submission_evidence_content_ck CHECK (url IS NOT NULL OR file_data IS NOT NULL),
    CONSTRAINT sub_ev_submission_fk FOREIGN KEY (submission_id) REFERENCES submissions(id)
);

CREATE TABLE practice_evidences (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    assignment_id VARCHAR2(36 CHAR) NOT NULL,
    student_id VARCHAR2(36 CHAR) NOT NULL,
    name VARCHAR2(255 CHAR) NOT NULL,
    url VARCHAR2(2048 CHAR),
    mime_type VARCHAR2(100 CHAR),
    size_bytes NUMBER(12),
    file_data CLOB,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT practice_evidences_content_ck CHECK (url IS NOT NULL OR file_data IS NOT NULL),
    CONSTRAINT practice_evidences_size_ck CHECK (size_bytes IS NULL OR size_bytes >= 0),
    CONSTRAINT practice_evidences_assignment_fk FOREIGN KEY (assignment_id) REFERENCES practice_assignments(id),
    CONSTRAINT practice_evidences_student_fk FOREIGN KEY (student_id) REFERENCES users(id)
);

CREATE INDEX practice_evidences_assignment_ix ON practice_evidences(assignment_id, submitted_at);

CREATE TABLE observations (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    assignment_id VARCHAR2(36 CHAR) NOT NULL,
    student_id VARCHAR2(36 CHAR) NOT NULL,
    author_id VARCHAR2(36 CHAR) NOT NULL,
    category VARCHAR2(100 CHAR),
    body CLOB NOT NULL,
    observed_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    visible_to_student NUMBER(1) DEFAULT 1 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT observations_visible_ck CHECK (visible_to_student IN (0, 1)),
    CONSTRAINT observations_assignment_fk FOREIGN KEY (assignment_id) REFERENCES practice_assignments(id),
    CONSTRAINT observations_student_fk FOREIGN KEY (student_id) REFERENCES users(id),
    CONSTRAINT observations_author_fk FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE TABLE evaluations (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    assignment_id VARCHAR2(36 CHAR) NOT NULL,
    student_id VARCHAR2(36 CHAR) NOT NULL,
    evaluator_id VARCHAR2(36 CHAR) NOT NULL,
    activity_id VARCHAR2(36 CHAR),
    submission_id VARCHAR2(36 CHAR),
    score NUMBER(2, 1) NOT NULL,
    feedback CLOB NOT NULL,
    evaluated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT evaluations_score_ck CHECK (score BETWEEN 0 AND 5),
    CONSTRAINT evaluations_assignment_fk FOREIGN KEY (assignment_id) REFERENCES practice_assignments(id),
    CONSTRAINT evaluations_student_fk FOREIGN KEY (student_id) REFERENCES users(id),
    CONSTRAINT evaluations_evaluator_fk FOREIGN KEY (evaluator_id) REFERENCES users(id),
    CONSTRAINT evaluations_activity_fk FOREIGN KEY (activity_id) REFERENCES activities(id),
    CONSTRAINT evaluations_submission_fk FOREIGN KEY (submission_id) REFERENCES submissions(id)
);

CREATE TABLE practice_logs (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    assignment_id VARCHAR2(36 CHAR) NOT NULL,
    student_id VARCHAR2(36 CHAR) NOT NULL,
    log_date DATE NOT NULL,
    hours NUMBER NOT NULL,
    activity_description VARCHAR2(3000 CHAR) NOT NULL,
    status VARCHAR2(20 CHAR) DEFAULT 'pendiente' NOT NULL,
    reviewed_by VARCHAR2(36 CHAR),
    review_comment VARCHAR2(2000 CHAR),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT practice_logs_status_ck CHECK (status IN ('pendiente', 'aprobada', 'rechazada')),
    CONSTRAINT practice_logs_assignment_fk FOREIGN KEY (assignment_id) REFERENCES practice_assignments(id),
    CONSTRAINT practice_logs_student_fk FOREIGN KEY (student_id) REFERENCES users(id),
    CONSTRAINT practice_logs_reviewer_fk FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

CREATE TABLE practice_evidence_tasks (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    assignment_id VARCHAR2(36 CHAR) NOT NULL,
    advisor_id VARCHAR2(36 CHAR) NOT NULL,
    title VARCHAR2(180 CHAR) NOT NULL,
    instructions CLOB NOT NULL,
    due_date DATE,
    status VARCHAR2(20 CHAR) DEFAULT 'activa' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pev_tasks_status_ck CHECK (status IN ('activa', 'cerrada')),
    CONSTRAINT pev_tasks_assign_fk FOREIGN KEY (assignment_id) REFERENCES practice_assignments(id),
    CONSTRAINT pev_tasks_advisor_fk FOREIGN KEY (advisor_id) REFERENCES users(id)
);

CREATE TABLE practice_evidence_submissions (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    task_id VARCHAR2(36 CHAR) NOT NULL,
    assignment_id VARCHAR2(36 CHAR) NOT NULL,
    student_id VARCHAR2(36 CHAR) NOT NULL,
    practice_log_id VARCHAR2(36 CHAR) NOT NULL,
    activity_date DATE NOT NULL,
    hours NUMBER NOT NULL,
    activity_description VARCHAR2(3000 CHAR) NOT NULL,
    status VARCHAR2(24 CHAR) DEFAULT 'en_revision' NOT NULL,
    review_comment VARCHAR2(2000 CHAR),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pev_sub_task_student_uq UNIQUE (task_id, student_id),
    CONSTRAINT pev_sub_status_ck CHECK (status IN ('en_revision', 'aprobada', 'requiere_cambios')),
    CONSTRAINT pev_sub_task_fk FOREIGN KEY (task_id) REFERENCES practice_evidence_tasks(id),
    CONSTRAINT pev_sub_assign_fk FOREIGN KEY (assignment_id) REFERENCES practice_assignments(id),
    CONSTRAINT pev_sub_student_fk FOREIGN KEY (student_id) REFERENCES users(id),
    CONSTRAINT pev_sub_log_fk FOREIGN KEY (practice_log_id) REFERENCES practice_logs(id)
);

CREATE TABLE practice_evidence_submission_files (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    submission_id VARCHAR2(36 CHAR) NOT NULL,
    name VARCHAR2(255 CHAR) NOT NULL,
    url VARCHAR2(2048 CHAR),
    mime_type VARCHAR2(100 CHAR),
    size_bytes NUMBER(12),
    file_data CLOB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pev_files_content_ck CHECK (url IS NOT NULL OR file_data IS NOT NULL),
    CONSTRAINT pev_files_size_ck CHECK (size_bytes IS NULL OR size_bytes >= 0),
    CONSTRAINT pev_files_submission_fk FOREIGN KEY (submission_id) REFERENCES practice_evidence_submissions(id) ON DELETE CASCADE
);

CREATE TABLE practice_visits (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    assignment_id VARCHAR2(36 CHAR) NOT NULL,
    tutor_id VARCHAR2(36 CHAR) NOT NULL,
    visit_date DATE NOT NULL,
    observation CLOB NOT NULL,
    agreements VARCHAR2(3000 CHAR),
    status VARCHAR2(20 CHAR) DEFAULT 'programada' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT practice_visits_status_ck CHECK (status IN ('programada', 'realizada')),
    CONSTRAINT practice_visits_assignment_fk FOREIGN KEY (assignment_id) REFERENCES practice_assignments(id),
    CONSTRAINT practice_visits_tutor_fk FOREIGN KEY (tutor_id) REFERENCES users(id)
);

CREATE TABLE attendance_validations (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    assignment_id VARCHAR2(36 CHAR) NOT NULL,
    student_id VARCHAR2(36 CHAR) NOT NULL,
    advisor_id VARCHAR2(36 CHAR) NOT NULL,
    validation_date DATE NOT NULL,
    attendance_status VARCHAR2(20 CHAR) NOT NULL,
    performance_score NUMBER(2, 1) NOT NULL,
    comments VARCHAR2(3000 CHAR) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT attendance_status_ck CHECK (attendance_status IN ('presente', 'ausente', 'tardanza')),
    CONSTRAINT attendance_score_ck CHECK (performance_score BETWEEN 0 AND 5),
    CONSTRAINT attendance_assignment_fk FOREIGN KEY (assignment_id) REFERENCES practice_assignments(id),
    CONSTRAINT attendance_student_fk FOREIGN KEY (student_id) REFERENCES users(id),
    CONSTRAINT attendance_advisor_fk FOREIGN KEY (advisor_id) REFERENCES users(id)
);

CREATE TABLE student_notifications (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    recipient_id VARCHAR2(36 CHAR) NOT NULL,
    actor_id VARCHAR2(36 CHAR),
    notification_type VARCHAR2(30 CHAR) NOT NULL,
    title VARCHAR2(160 CHAR) NOT NULL,
    message VARCHAR2(1000 CHAR) NOT NULL,
    view_name VARCHAR2(60 CHAR) NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT notifications_recipient_fk FOREIGN KEY (recipient_id) REFERENCES users(id),
    CONSTRAINT notifications_actor_fk FOREIGN KEY (actor_id) REFERENCES users(id)
);

CREATE TABLE admin_audits (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    actor_id VARCHAR2(36 CHAR) NOT NULL,
    actor_name VARCHAR2(170 CHAR) NOT NULL,
    action VARCHAR2(20 CHAR) NOT NULL,
    entity VARCHAR2(32 CHAR) NOT NULL,
    entity_id VARCHAR2(80 CHAR) NOT NULL,
    summary VARCHAR2(300 CHAR) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT admin_audits_action_ck CHECK (action IN ('created', 'updated', 'deleted', 'activated', 'deactivated')),
    CONSTRAINT admin_audits_actor_fk FOREIGN KEY (actor_id) REFERENCES users(id)
);

CREATE TABLE password_recovery_requests (
    id VARCHAR2(36 CHAR) PRIMARY KEY,
    full_name VARCHAR2(160 CHAR) NOT NULL,
    contact_email VARCHAR2(254 CHAR) NOT NULL,
    account_identifier VARCHAR2(254 CHAR),
    request_type VARCHAR2(20 CHAR) NOT NULL,
    status VARCHAR2(20 CHAR) DEFAULT 'pendiente' NOT NULL,
    target_user_id VARCHAR2(36 CHAR),
    handled_by_id VARCHAR2(36 CHAR),
    handled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT recovery_type_ck CHECK (request_type IN ('usuario', 'contrasena', 'ambos')),
    CONSTRAINT recovery_status_ck CHECK (status IN ('pendiente', 'resuelta', 'descartada')),
    CONSTRAINT recovery_target_fk FOREIGN KEY (target_user_id) REFERENCES users(id),
    CONSTRAINT recovery_handler_fk FOREIGN KEY (handled_by_id) REFERENCES users(id)
);

CREATE INDEX pr_assign_student_period_ix ON practice_assignments(student_id, academic_period);
CREATE INDEX pr_assign_program_ix ON practice_assignments(program_id);
CREATE INDEX pr_assign_teacher_status_ix ON practice_assignments(teacher_id, status);
CREATE INDEX pr_assign_advisor_ix ON practice_assignments(advisor_id);
CREATE INDEX student_teachers_teacher_ix ON student_teachers(teacher_id, student_id);
CREATE INDEX student_directors_director_ix ON student_directors(director_id, student_id);
CREATE INDEX pr_assign_teachers_teacher_ix ON practice_assignment_teachers(teacher_id, assignment_id);
CREATE INDEX activities_assign_status_ix ON activities(assignment_id, status);
CREATE INDEX subs_student_date_ix ON submissions(student_id, submitted_at);
CREATE INDEX pr_logs_assign_date_ix ON practice_logs(assignment_id, log_date);
CREATE INDEX pev_tasks_assign_ix ON practice_evidence_tasks(assignment_id, created_at);
CREATE INDEX pev_sub_task_ix ON practice_evidence_submissions(task_id, submitted_at);
CREATE INDEX pev_files_sub_ix ON practice_evidence_submission_files(submission_id, created_at);
CREATE INDEX pr_visits_assign_date_ix ON practice_visits(assignment_id, visit_date);
CREATE INDEX attend_assign_date_ix ON attendance_validations(assignment_id, validation_date);
CREATE INDEX notif_recipient_read_ix ON student_notifications(recipient_id, read_at, created_at);
CREATE INDEX admin_audits_created_ix ON admin_audits(created_at);
CREATE INDEX recovery_status_created_ix ON password_recovery_requests(status, created_at);
