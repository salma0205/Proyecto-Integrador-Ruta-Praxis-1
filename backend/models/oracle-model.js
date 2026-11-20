const crypto = require('node:crypto');
const database = require('../config/database');

let models = {};
const linkReferences = {
    AcademicProgram: { teachers: 'User', directors: 'User' },
    AcademicSubject: { teachers: 'User', students: 'User' },
    Institution: {},
    User: { subjects: 'AcademicSubject', assignedTeachers: 'User', assignedDirectors: 'User' },
    PracticeAssignment: { teachers: 'User' },
    Submission: {}
};

function camelToSnake(value) {
    return value.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function plain(document) {
    if (!document) return document;
    return Object.fromEntries(Object.entries(document).map(([key, value]) => [
        key,
        value instanceof OracleDocument ? value.toObject() : Array.isArray(value) ? value.map(item => item instanceof OracleDocument ? item.toObject() : item) : value
    ]));
}

class OracleDocument {
    constructor(model, values) {
        Object.defineProperty(this, '__model', { value: model });
        Object.assign(this, values);
        this._id = values._id;
        this.id = values._id;
    }

    toObject() {
        return plain(this);
    }

    async save() {
        const saved = await this.__model.updateById(this._id, this);
        if (saved) Object.assign(this, saved);
        return this;
    }
}

function convertValue(field, value, meta) {
    if (value === undefined) return undefined;
    if (meta.booleans?.includes(field)) return value === true || value === 1 ? 1 : 0;
    if (meta.json?.includes(field)) return value == null ? null : JSON.stringify(value);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
        return value._id || value.id || value;
    }
    if (value instanceof Date) return value;
    return value;
}

function normalizeData(model, values) {
    const data = { ...values };
    if (model.modelName === 'User') {
        for (const field of ['email', 'username', 'personalEmail']) {
            if (typeof data[field] === 'string') data[field] = data[field].trim().toLowerCase();
        }
    }
    if (model.modelName === 'AcademicSubject' && typeof data.code === 'string') {
        data.code = data.code.trim().toUpperCase();
    }
    return data;
}

function fromRecord(row, model) {
    const values = {};
    for (const [field, column] of Object.entries(model.fields)) {
        const value = row[column.toUpperCase()];
        if (value === undefined) continue;
        if (model.booleans.includes(field)) values[field] = value === 1 || value === true;
        else if (model.json.includes(field) && typeof value === 'string') {
            try { values[field] = JSON.parse(value); } catch { values[field] = value; }
        } else values[field] = value;
    }
    values._id = values.id;
    values.id = values.id;
    for (const [field, tableInfo] of Object.entries(model.links)) {
        if (field === 'subjects') continue;
        if (field === 'evidence') continue;
        if (tableInfo.direct) values[field] = tableInfo.direct(valueForRelation(values, field));
    }
    return new OracleDocument(model, values);
}

function valueForRelation(values, field) {
    return values[field];
}

function mapName(name) {
    const known = {
        User: 'users', Institution: 'institutions', AcademicProgram: 'academic_programs',
        AcademicSubject: 'academic_subjects', PracticeType: 'practice_types',
        PracticeAssignment: 'practice_assignments', Activity: 'activities',
        Submission: 'submissions', Observation: 'observations', Evaluation: 'evaluations',
        StudentNotification: 'student_notifications', PracticeLog: 'practice_logs',
        PracticeVisit: 'practice_visits', AttendanceValidation: 'attendance_validations',
        AdminAudit: 'admin_audits', PasswordRecoveryRequest: 'password_recovery_requests'
    };
    return known[name];
}

function buildModel(name, fields, options = {}) {
    const model = {
        modelName: name,
        table: mapName(name),
        fields: Object.fromEntries(Object.entries(fields).map(([field, column]) => [field, column || camelToSnake(field)])),
        booleans: options.booleans || [],
        json: options.json || [],
        links: options.links || {},
        references: options.references || {},
        defaults: options.defaults || {},
        required: options.required || [],
        enums: options.enums || {},
        maxLength: options.maxLength || {},
        customValidate: options.validate,
        async validateValues(values) {
            for (const field of this.required) {
                if (values[field] === undefined || values[field] === null || values[field] === '') {
                    throw Object.assign(new Error(`${field} es obligatorio.`), { name: 'ValidationError' });
                }
            }
            for (const [field, valid] of Object.entries(this.enums)) {
                if (values[field] != null && !valid.includes(values[field])) {
                    throw Object.assign(new Error(`${field} no es válido.`), { name: 'ValidationError' });
                }
            }
            for (const [field, limit] of Object.entries(this.maxLength)) {
                if (typeof values[field] === 'string' && values[field].length > limit) {
                    throw Object.assign(new Error(`${field} excede la longitud permitida.`), { name: 'ValidationError' });
                }
            }
            if (this.customValidate) this.customValidate(values);
        },
        async insert(values) {
            const data = normalizeData(this, { ...this.defaults, ...values });
            const now = new Date();
            data.id = data._id || data.id || crypto.randomUUID();
            data.createdAt = data.createdAt || now;
            data.updatedAt = data.updatedAt || now;
            await this.validateValues(data);
            const columns = [];
            const binds = {};
            for (const [field, column] of Object.entries(this.fields)) {
                if (data[field] === undefined || this.links[field]) continue;
                columns.push(column);
                binds[field] = convertValue(field, data[field], this);
            }
            if (!columns.includes('id')) columns.push('id');
            binds.id = data.id;
            if (this.fields.createdAt && !columns.includes('created_at')) { columns.push('created_at'); binds.createdAt = data.createdAt; }
            if (this.fields.updatedAt && !columns.includes('updated_at')) { columns.push('updated_at'); binds.updatedAt = data.updatedAt; }
            const sql = `INSERT INTO ${this.table} (${columns.join(', ')}) VALUES (${columns.map(column => `:${Object.keys(this.fields).find(key => this.fields[key] === column) || (column === 'id' ? 'id' : column === 'created_at' ? 'createdAt' : 'updatedAt')}`).join(', ')})`;
            try {
                await database.execute(sql, binds);
                await this.writeLinks(data.id, data);
            } catch (error) {
                throw normalizeError(error);
            }
            return this.findById(data.id);
        },
        async writeLinks(id, values) {
            for (const [field, info] of Object.entries(this.links)) {
                if (values[field] === undefined) continue;
                if (field === 'subjects') {
                    const role = values.role || (await this.findById(id))?.role;
                    const table = role === 'docente' ? 'subject_teachers' : 'subject_students';
                    const owner = role === 'docente' ? 'teacher_id' : 'student_id';
                    await database.execute(`DELETE FROM ${table} WHERE ${owner} = :id`, { id });
                    for (const subjectId of values[field] || []) {
                        await database.execute(`INSERT INTO ${table} (subject_id, ${owner}) VALUES (:subjectId, :id)`, { subjectId: String(subjectId), id });
                    }
                    continue;
                }
                const [table, ownerColumn, valueColumn] = info.table;
                await database.execute(`DELETE FROM ${table} WHERE ${ownerColumn} = :id`, { id });
                for (const value of values[field] || []) {
                    if (field === 'evidence') {
                        await database.execute(
                            `INSERT INTO ${table} (id, ${ownerColumn}, name, url, mime_type, size_bytes) VALUES (:evidenceId, :id, :name, :url, :mimeType, :sizeBytes)`,
                            { evidenceId: crypto.randomUUID(), id, name: value.name, url: value.url, mimeType: value.mimeType || null, sizeBytes: value.sizeBytes ?? null }
                        );
                    } else {
                        await database.execute(`INSERT INTO ${table} (${ownerColumn}, ${valueColumn}) VALUES (:id, :value)`, { id, value });
                    }
                }
            }
        },
        async loadLinks(document) {
            for (const [field, info] of Object.entries(this.links)) {
                if (field === 'subjects') {
                    const role = document.role;
                    const ownerColumn = role === 'docente' ? 'teacher_id' : 'student_id';
                    const table = role === 'docente' ? 'subject_teachers' : 'subject_students';
                    const result = await database.execute(`SELECT subject_id FROM ${table} WHERE ${ownerColumn} = :id`, { id: document._id });
                    document[field] = result.rows.map(row => row.SUBJECT_ID);
                } else if (field === 'evidence') {
                    const result = await database.execute(
                        'SELECT name, url, mime_type, size_bytes FROM submission_evidence WHERE submission_id = :id ORDER BY id',
                        { id: document._id }
                    );
                    document[field] = result.rows.map(row => ({ name: row.NAME, url: row.URL, mimeType: row.MIME_TYPE, sizeBytes: row.SIZE_BYTES }));
                } else {
                    const [table, ownerColumn, valueColumn] = info.table;
                    const result = await database.execute(`SELECT ${valueColumn} AS value FROM ${table} WHERE ${ownerColumn} = :id`, { id: document._id });
                    document[field] = result.rows.map(row => row.VALUE);
                }
            }
        },
        async populateDocuments(documents, populate) {
            for (const item of populate) {
                const { path, select, match } = typeof item === 'string' ? { path: item } : item;
                const ref = this.references[path] || linkReferences[name]?.[path];
                if (!ref) continue;
                const target = models[ref];
                for (const document of documents) {
                    const values = document[path];
                    if (this.links[path]) {
                        const related = [];
                        for (const id of values || []) {
                            const record = await target.findById(id);
                            if (record && matchesObject(record, match || {})) related.push(record);
                        }
                        document[path] = related.map(record => project(record, select));
                    } else if (values != null) {
                        const record = await target.findById(values);
                        document[path] = record && matchesObject(record, match || {}) ? project(record, select) : null;
                    }
                }
            }
        },
        async updateById(id, changes) {
            const currentQuery = this.findById(id);
            if (this.modelName === 'User') currentQuery.select('+passwordHash +profilePhoto');
            const current = await currentQuery;
            if (!current) return null;
            changes = normalizeData(this, changes);
            const values = { ...current.toObject(), ...changes };
            await this.validateValues(values);
            const sets = [];
            const binds = { id: String(id) };
            for (const [field, column] of Object.entries(this.fields)) {
                if (field === 'id' || field === 'createdAt' || field === 'updatedAt' || this.links[field] || changes[field] === undefined) continue;
                const bind = `v_${field}`;
                sets.push(`${column} = :${bind}`);
                binds[bind] = convertValue(field, changes[field], this);
            }
            if (this.fields.updatedAt) {
                sets.push(`${this.fields.updatedAt} = SYSTIMESTAMP`);
            }
            if (sets.length) {
                try { await database.execute(`UPDATE ${this.table} SET ${sets.join(', ')} WHERE id = :id`, binds); }
                catch (error) { throw normalizeError(error); }
            }
            await this.writeLinks(id, changes);
            return this.findById(id);
        },
        find(filter = {}) { return new OracleQuery(this, 'find', filter); },
        findOne(filter = {}) { return new OracleQuery(this, 'findOne', filter); },
        findById(id) { return new OracleQuery(this, 'findOne', { _id: id }); },
        findByIdAndUpdate(id, changes, options = {}) { return this.findOneAndUpdate({ _id: id }, changes, options); },
        async findOneAndUpdate(filter, changes, options = {}) {
            const current = await this.findOne(filter);
            if (!current) return options.upsert ? this.insert({ ...filter, ...(changes.$set || changes) }) : null;
            const after = await this.updateById(current._id, changes.$set || changes);
            return options.new ? after : current;
        },
        async findByIdAndDelete(id) {
            const current = await this.findById(id);
            if (!current) return null;
            await database.execute(`DELETE FROM ${this.table} WHERE id = :id`, { id: String(id) });
            return current;
        },
        create(data) { return this.insert(data); },
        async insertMany(items) { return Promise.all(items.map(item => this.insert(item))); },
        async countDocuments(filter = {}) { return new OracleQuery(this, 'count', filter).exec(); },
        async exists(filter = {}) { return Boolean(await this.findOne(filter)); },
        async distinct(field, filter = {}) {
            const records = await this.find(filter);
            return [...new Set(records.map(record => record[field]).filter(value => value != null))];
        },
        async updateMany(filter, update) {
            const records = await this.find(filter);
            for (const record of records) await this.updateById(record._id, applyUpdate(record.toObject(), update, this));
            return { matchedCount: records.length, modifiedCount: records.length };
        },
        async updateOne(filter, update) {
            const record = await this.findOne(filter);
            if (!record) return { matchedCount: 0, modifiedCount: 0 };
            await this.updateById(record._id, applyUpdate(record.toObject(), update, this));
            return { matchedCount: 1, modifiedCount: 1 };
        }
    };
    return model;
}

function project(document, select) {
    const fields = select ? select.trim().split(/\s+/) : [];
    const excluded = fields.filter(field => field.startsWith('-')).map(field => field.slice(1));
    const included = fields.filter(field => !field.startsWith('+') && !field.startsWith('-'));
    const explicitHidden = new Set(fields.filter(field => field.startsWith('+')).map(field => field.slice(1)));
    const hidden = new Set(['passwordHash', 'profilePhoto']);
    let allowed = included.length
        ? new Set(['_id', 'id', ...included, ...explicitHidden])
        : new Set(Object.keys(document));
    for (const field of hidden) {
        if (!explicitHidden.has(field)) allowed.delete(field);
    }
    for (const field of excluded) allowed.delete(field);
    return Object.fromEntries([...allowed].filter(field => field in document).map(field => [field, document[field]]));
}

function matchesObject(document, filter) {
    for (const [field, expected] of Object.entries(filter)) {
        if (field === '$or') {
            if (!expected.some(item => matchesObject(document, item))) return false;
        } else if (expected instanceof RegExp) {
            if (!expected.test(String(document[field] || ''))) return false;
        } else if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
            if ('$in' in expected && !expected.$in.some(value => String(value) === String(document[field]))) return false;
            if ('$ne' in expected && String(expected.$ne) === String(document[field])) return false;
        } else if (Array.isArray(document[field])) {
            if (!document[field].some(value => String(value) === String(expected))) return false;
        } else if (String(document[field]) !== String(expected)) return false;
    }
    return true;
}

function applyUpdate(current, update, model) {
    const result = { ...current };
    const changes = update.$set || update;
    for (const [field, value] of Object.entries(changes)) {
        if (field === '$pull' || field === '$addToSet' || field === '$inc') continue;
        result[field] = value;
    }
    for (const [operator, values] of Object.entries(update)) {
        if (!['$pull', '$addToSet', '$inc'].includes(operator)) continue;
        for (const [field, value] of Object.entries(values)) {
            if (operator === '$inc') result[field] = (result[field] || 0) + value;
            else {
                const list = [...(result[field] || [])];
                result[field] = operator === '$pull'
                    ? list.filter(item => String(item) !== String(value))
                    : [...new Set([...list, value].map(String))];
            }
        }
    }
    return result;
}

function normalizeError(error) {
    if (/ORA-00001/.test(error.message || '')) {
        error.code = 11000;
    } else if (/ORA-02291|ORA-02292|ORA-01400|ORA-02290/.test(error.message || '')) {
        error.name = 'ValidationError';
    }
    return error;
}

class OracleQuery {
    constructor(model, operation, filter) {
        this.model = model;
        this.operation = operation;
        this.filter = filter;
        this.projection = null;
        this.populates = [];
        this.order = null;
        this.rowLimit = null;
        this.offset = 0;
        this.asLean = false;
    }
    select(value) { this.projection = value; return this; }
    populate(value, select) { this.populates.push(typeof value === 'string' ? { path: value, select } : value); return this; }
    sort(value) { this.order = value; return this; }
    limit(value) { this.rowLimit = Math.max(0, Number(value) || 0); return this; }
    skip(value) { this.offset = Math.max(0, Number(value) || 0); return this; }
    lean() { this.asLean = true; return this; }
    distinct(field) { this.distinctField = field; return this.exec(); }
    then(resolve, reject) { return this.exec().then(resolve, reject); }
    catch(reject) { return this.exec().catch(reject); }
    async exec() {
        if (this.operation === 'count') {
            const { where, binds } = compileFilter(this.model, this.filter);
            const result = await database.execute(`SELECT COUNT(*) AS count FROM ${this.model.table} t${where}`, binds);
            return Number(result.rows[0].COUNT);
        }
        if (this.distinctField) return this.model.distinct(this.distinctField, this.filter);
        const { where, binds } = compileFilter(this.model, this.filter);
        let sql = `SELECT t.* FROM ${this.model.table} t${where}`;
        if (this.order) {
            const order = Object.entries(this.order).map(([field, direction]) => {
                const column = this.model.fields[field] || (field === '_id' ? 'id' : null);
                if (!column) throw new Error(`Campo de ordenamiento desconocido: ${field}`);
                return `t.${column} ${Number(direction) < 0 ? 'DESC' : 'ASC'}`;
            });
            sql += ` ORDER BY ${order.join(', ')}`;
        }
        if (this.rowLimit !== null) {
            binds.fetchLimit = this.rowLimit;
            binds.fetchOffset = this.offset;
            sql += ' OFFSET :fetchOffset ROWS FETCH NEXT :fetchLimit ROWS ONLY';
        } else if (this.offset) {
            binds.fetchOffset = this.offset;
            sql += ' OFFSET :fetchOffset ROWS';
        }
        const result = await database.execute(sql, binds);
        const records = result.rows.map(row => fromRecord(row, this.model));
        for (const record of records) await this.model.loadLinks(record);
        if (this.populates.length) await this.model.populateDocuments(records, this.populates);
        const projection = this.projection || (this.model.modelName === 'User' ? '-passwordHash -profilePhoto' : null);
        const projected = records.map(record => project(record, projection));
        const output = this.asLean ? projected.map(plain) : projected.map(value => value instanceof OracleDocument ? value : Object.assign(new OracleDocument(this.model, value), value));
        return this.operation === 'findOne' ? output[0] || null : output;
    }
}

function compileFilter(model, filter) {
    const binds = {};
    let counter = 0;
    const compile = (object) => {
        const clauses = [];
        for (const [field, value] of Object.entries(object || {})) {
            if (field === '$or' || field === '$and') {
                const children = value.map(compile).filter(Boolean);
                clauses.push(children.length ? `(${children.join(field === '$or' ? ' OR ' : ' AND ')})` : field === '$or' ? '1 = 0' : '1 = 1');
                continue;
            }
            const bind = `b${counter++}`;
            if (model.links[field]) {
                const link = model.links[field];
                const testValues = value && typeof value === 'object' && '$in' in value ? value.$in : [value];
                if (!testValues.length) { clauses.push('1 = 0'); continue; }
                if (field === 'subjects') {
                    const placeholders = testValues.map(item => {
                        const key = `${bind}_${counter++}`;
                        binds[key] = String(item);
                        return `:${key}`;
                    });
                    clauses.push(`EXISTS (SELECT 1 FROM (SELECT subject_id, teacher_id AS user_id FROM subject_teachers UNION ALL SELECT subject_id, student_id AS user_id FROM subject_students) l WHERE l.user_id = t.id AND l.subject_id IN (${placeholders.join(',')}))`);
                } else if (field === 'evidence') continue;
                else {
                    const [table, owner, ref] = link.table;
                    const placeholders = testValues.map(item => {
                        const key = `${bind}_${counter++}`;
                        binds[key] = item;
                        return `:${key}`;
                    });
                    clauses.push(`EXISTS (SELECT 1 FROM ${table} l WHERE l.${owner} = t.id AND l.${ref} IN (${placeholders.join(',')}))`);
                }
                continue;
            }
            const column = model.fields[field] || (field === '_id' ? 'id' : null);
            if (!column) continue;
            if (value instanceof RegExp) {
                binds[bind] = value.source;
                clauses.push(`REGEXP_LIKE(TO_CHAR(t.${column}), :${bind}, 'i')`);
            } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                if ('$in' in value) {
                    if (!value.$in.length) clauses.push('1 = 0');
                    else {
                        clauses.push(`t.${column} IN (${value.$in.map((item, index) => {
                            const key = `${bind}_${index}`;
                            binds[key] = convertValue(field, item, model);
                            return `:${key}`;
                        }).join(', ')})`);
                    }
                } else if ('$ne' in value) {
                    binds[bind] = convertValue(field, value.$ne, model);
                    clauses.push(value.$ne === null ? `t.${column} IS NOT NULL` : `t.${column} <> :${bind}`);
                }
            } else if (value === null) clauses.push(`t.${column} IS NULL`);
            else {
                binds[bind] = convertValue(field, value, model);
                clauses.push(`t.${column} = :${bind}`);
            }
        }
        return clauses.join(' AND ');
    };
    const condition = compile(filter);
    return { where: condition ? ` WHERE ${condition}` : '', binds };
}

function setModelRegistry(registry) {
    models = registry;
}

module.exports = { buildModel, OracleDocument, setModelRegistry, compileFilter, project };
