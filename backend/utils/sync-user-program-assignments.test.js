const test = require('node:test');
const assert = require('node:assert/strict');
const syncUserProgramAssignments = require('./sync-user-program-assignments');

function fakeProgramModel() {
    const updates = [];
    return {
        updates,
        async updateMany(filter, update) {
            updates.push({ method: 'updateMany', filter, update });
        },
        async updateOne(filter, update) {
            updates.push({ method: 'updateOne', filter, update });
        }
    };
}

test('assigns a Director to the program selected in user management', async () => {
    const programs = fakeProgramModel();

    await syncUserProgramAssignments(programs, {
        _id: 'director-1',
        role: 'director',
        programId: 'program-1'
    });

    assert.deepEqual(programs.updates, [
        { method: 'updateMany', filter: { directors: 'director-1' }, update: { $pull: { directors: 'director-1' } } },
        { method: 'updateMany', filter: { director: 'director-1' }, update: { $set: { director: null } } },
        { method: 'updateOne', filter: { _id: 'program-1' }, update: { $addToSet: { directors: 'director-1' } } },
        {
            method: 'updateOne',
            filter: { _id: 'program-1', director: null },
            update: { $set: { director: 'director-1' } }
        }
    ]);
});

test('removes the program link when a user changes from Director to Teacher', async () => {
    const programs = fakeProgramModel();

    await syncUserProgramAssignments(programs, {
        _id: 'user-1',
        role: 'docente',
        programId: 'program-2'
    }, {
        role: 'director'
    });

    assert.deepEqual(programs.updates, [
        { method: 'updateMany', filter: { directors: 'user-1' }, update: { $pull: { directors: 'user-1' } } },
        { method: 'updateMany', filter: { director: 'user-1' }, update: { $set: { director: null } } },
        { method: 'updateMany', filter: { teachers: 'user-1' }, update: { $pull: { teachers: 'user-1' } } }
    ]);
});
