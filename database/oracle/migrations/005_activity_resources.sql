-- Run once as the RUTA_PRAXIS schema owner after migration 004.
WHENEVER SQLERROR EXIT SQL.SQLCODE

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

COMMIT;
