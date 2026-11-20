-- Run once with SQL*Plus as the RUTA_PRAXIS schema owner after the original schema.
WHENEVER SQLERROR EXIT SQL.SQLCODE

DECLARE
    assignments_without_student_program NUMBER;
    directors_without_program NUMBER;
BEGIN
    SELECT COUNT(*)
    INTO assignments_without_student_program
    FROM practice_assignments assignment
    JOIN users student ON student.id = assignment.student_id
    WHERE student.program_id IS NULL;

    IF assignments_without_student_program > 0 THEN
        RAISE_APPLICATION_ERROR(
            -20001,
            'Hay prácticas cuyos estudiantes no tienen programa. Asigna un programa antes de ejecutar esta migración.'
        );
    END IF;

    SELECT COUNT(*)
    INTO directors_without_program
    FROM users
    WHERE role = 'director' AND program_id IS NULL;

    IF directors_without_program > 0 THEN
        RAISE_APPLICATION_ERROR(
            -20002,
            'Hay Directores sin programa asociado. Asígnales un programa desde Gestionar usuarios antes de ejecutar esta migración.'
        );
    END IF;
END;
/

ALTER TABLE practice_assignments ADD (program_id VARCHAR2(36 CHAR));

UPDATE practice_assignments assignment
SET program_id = (
    SELECT student.program_id
    FROM users student
    WHERE student.id = assignment.student_id
)
WHERE program_id IS NULL;

DECLARE
    assignments_without_program NUMBER;
BEGIN
    SELECT COUNT(*)
    INTO assignments_without_program
    FROM practice_assignments
    WHERE program_id IS NULL;

    IF assignments_without_program > 0 THEN
        RAISE_APPLICATION_ERROR(
            -20001,
            'Hay prácticas sin un programa asociado. Asigna un programa a sus estudiantes y vuelve a ejecutar esta migración.'
        );
    END IF;
END;
/

ALTER TABLE practice_assignments MODIFY (program_id NOT NULL);
ALTER TABLE practice_assignments
    ADD CONSTRAINT pr_assign_program_fk FOREIGN KEY (program_id) REFERENCES academic_programs(id);
CREATE INDEX pr_assign_program_ix ON practice_assignments(program_id);

UPDATE users
SET program_id = NULL, program_name = NULL
WHERE role <> 'director';

ALTER TABLE users
    ADD CONSTRAINT users_program_role_ck CHECK (
        (role = 'director' AND program_id IS NOT NULL) OR
        (role <> 'director' AND program_id IS NULL)
    );

DELETE FROM program_teachers;

COMMIT;
