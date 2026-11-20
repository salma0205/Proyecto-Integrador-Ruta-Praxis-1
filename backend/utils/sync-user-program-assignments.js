async function syncUserProgramAssignments(academicProgram, user, previous = {}) {
    const userId = String(user._id || user.id);
    const roles = new Set([previous.role, user.role]);

    if (roles.has('director')) {
        await academicProgram.updateMany({ directors: userId }, { $pull: { directors: userId } });
        await academicProgram.updateMany({ director: userId }, { $set: { director: null } });
    }
    if (roles.has('docente')) {
        await academicProgram.updateMany({ teachers: userId }, { $pull: { teachers: userId } });
    }
    if (user.role === 'director' && user.programId) {
        await academicProgram.updateOne({ _id: user.programId }, { $addToSet: { directors: userId } });
        await academicProgram.updateOne(
            { _id: user.programId, director: null },
            { $set: { director: userId } }
        );
    }
}

module.exports = syncUserProgramAssignments;
