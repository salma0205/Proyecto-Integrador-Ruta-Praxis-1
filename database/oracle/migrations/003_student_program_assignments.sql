-- Run once as the RUTA_PRAXIS schema owner after migration 001.
WHENEVER SQLERROR EXIT SQL.SQLCODE

ALTER TABLE users DROP CONSTRAINT users_program_role_ck;

ALTER TABLE users
    ADD CONSTRAINT users_program_role_ck CHECK (
        (role = 'director' AND program_id IS NOT NULL) OR
        role = 'estudiante' OR
        (role NOT IN ('director', 'estudiante') AND program_id IS NULL)
    );

COMMIT;
