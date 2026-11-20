-- Run once as the RUTA_PRAXIS schema owner after migrations 001, 002, and 003.
WHENEVER SQLERROR EXIT SQL.SQLCODE

CREATE TABLE program_directors (
    program_id VARCHAR2(36 CHAR) NOT NULL,
    director_id VARCHAR2(36 CHAR) NOT NULL,
    CONSTRAINT program_directors_pk PRIMARY KEY (program_id, director_id),
    CONSTRAINT program_directors_director_uq UNIQUE (director_id),
    CONSTRAINT program_directors_program_fk FOREIGN KEY (program_id) REFERENCES academic_programs(id),
    CONSTRAINT program_directors_user_fk FOREIGN KEY (director_id) REFERENCES users(id)
);

INSERT INTO program_directors (program_id, director_id)
SELECT director.program_id, director.id
FROM users director
WHERE director.role = 'director'
  AND director.program_id IS NOT NULL;

CREATE TABLE student_teachers (
    student_id VARCHAR2(36 CHAR) NOT NULL,
    teacher_id VARCHAR2(36 CHAR) NOT NULL,
    CONSTRAINT student_teachers_pk PRIMARY KEY (student_id, teacher_id),
    CONSTRAINT student_teachers_student_fk FOREIGN KEY (student_id) REFERENCES users(id),
    CONSTRAINT student_teachers_teacher_fk FOREIGN KEY (teacher_id) REFERENCES users(id)
);

CREATE INDEX student_teachers_teacher_ix ON student_teachers(teacher_id, student_id);

INSERT INTO student_teachers (student_id, teacher_id)
SELECT DISTINCT student_link.student_id, teacher_link.teacher_id
FROM subject_students student_link
JOIN subject_teachers teacher_link ON teacher_link.subject_id = student_link.subject_id
JOIN users student ON student.id = student_link.student_id AND student.role = 'estudiante'
JOIN users teacher ON teacher.id = teacher_link.teacher_id AND teacher.role = 'docente';

CREATE TABLE student_directors (
    student_id VARCHAR2(36 CHAR) PRIMARY KEY,
    director_id VARCHAR2(36 CHAR) NOT NULL,
    CONSTRAINT student_directors_student_fk FOREIGN KEY (student_id) REFERENCES users(id),
    CONSTRAINT student_directors_director_fk FOREIGN KEY (director_id) REFERENCES users(id)
);

CREATE INDEX student_directors_director_ix ON student_directors(director_id, student_id);

INSERT INTO student_directors (student_id, director_id)
SELECT student.id, program.director_id
FROM users student
JOIN academic_programs program ON program.id = student.program_id
JOIN users director ON director.id = program.director_id
WHERE student.role = 'estudiante'
  AND director.role = 'director'
  AND director.active = 1
  AND director.program_id = student.program_id
  AND director.semester = student.semester;

CREATE TABLE practice_assignment_teachers (
    assignment_id VARCHAR2(36 CHAR) NOT NULL,
    teacher_id VARCHAR2(36 CHAR) NOT NULL,
    CONSTRAINT practice_assignment_teachers_pk PRIMARY KEY (assignment_id, teacher_id),
    CONSTRAINT pr_assign_teachers_assignment_fk FOREIGN KEY (assignment_id) REFERENCES practice_assignments(id),
    CONSTRAINT pr_assign_teachers_teacher_fk FOREIGN KEY (teacher_id) REFERENCES users(id)
);

CREATE INDEX pr_assign_teachers_teacher_ix ON practice_assignment_teachers(teacher_id, assignment_id);

INSERT INTO practice_assignment_teachers (assignment_id, teacher_id)
SELECT assignment.id, assignment.teacher_id
FROM practice_assignments assignment
JOIN users teacher ON teacher.id = assignment.teacher_id AND teacher.role = 'docente';

COMMIT;
