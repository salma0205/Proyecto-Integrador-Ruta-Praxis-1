-- Run once as the RUTA_PRAXIS schema owner after the original schema.
WHENEVER SQLERROR EXIT SQL.SQLCODE

ALTER TABLE practice_assignments
    ADD (required_hours NUMBER(6, 1) DEFAULT 0 NOT NULL);

ALTER TABLE practice_assignments
    ADD CONSTRAINT practice_assignments_hours_ck CHECK (required_hours >= 0);

COMMIT;
