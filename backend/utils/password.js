const MIN_PASSWORD_LENGTH = 1;
const MAX_PASSWORD_LENGTH = 10;

function isValidPassword(password) {
    return typeof password === 'string' &&
        password.length >= MIN_PASSWORD_LENGTH &&
        password.length <= MAX_PASSWORD_LENGTH;
}

module.exports = { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, isValidPassword };
