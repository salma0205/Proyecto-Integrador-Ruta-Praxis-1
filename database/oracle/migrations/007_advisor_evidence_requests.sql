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

CREATE INDEX pev_tasks_assign_ix ON practice_evidence_tasks(assignment_id, created_at);
CREATE INDEX pev_sub_task_ix ON practice_evidence_submissions(task_id, submitted_at);
CREATE INDEX pev_files_sub_ix ON practice_evidence_submission_files(submission_id, created_at);

COMMIT;
