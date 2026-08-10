const MIN_LENGTH = 10;

function validatePasswordStrength(password) {
    const value = String(password || '');

    if (value.length < MIN_LENGTH) {
        return `Password must be at least ${MIN_LENGTH} characters long.`;
    }
    if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
        return 'Password must contain at least one letter and one number.';
    }

    return null;
}

module.exports = { validatePasswordStrength, MIN_LENGTH};