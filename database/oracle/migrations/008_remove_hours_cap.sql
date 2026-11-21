-- Run once as the RUTA_PRAXIS schema owner after migration 007.
-- Hour records must be positive but are no longer capped at 24.
ALTER TABLE practice_logs DROP CONSTRAINT practice_logs_hours_ck;
ALTER TABLE practice_logs MODIFY (hours NUMBER);
ALTER TABLE practice_evidence_submissions DROP CONSTRAINT pev_sub_hours_ck;
ALTER TABLE practice_evidence_submissions MODIFY (hours NUMBER);
