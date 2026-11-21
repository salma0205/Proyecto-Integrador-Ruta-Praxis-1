ALTER TABLE activities ADD (kind VARCHAR2(20 CHAR) DEFAULT 'actividad' NOT NULL);
ALTER TABLE activities ADD CONSTRAINT activities_kind_ck
    CHECK (kind IN ('actividad', 'evaluacion'));

ALTER TABLE submission_evidence MODIFY (url NULL);
ALTER TABLE submission_evidence ADD (file_data CLOB);
ALTER TABLE submission_evidence ADD CONSTRAINT submission_evidence_content_ck
    CHECK (url IS NOT NULL OR file_data IS NOT NULL);

ALTER TABLE submissions ADD (score NUMBER(2, 1));
ALTER TABLE submissions ADD CONSTRAINT submissions_score_ck
    CHECK (score IS NULL OR score BETWEEN 0 AND 5);

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
