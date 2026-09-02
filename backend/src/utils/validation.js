// Input validation helper functions
// Simple sanitization and validation without external dependencies

/**
 * Sanitize string input to prevent XSS and injection
 * @param {string} str - Input string
 * @returns {string} - Sanitized string
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  
  // Remove null bytes and trim
  let sanitized = str.replace(/\0/g, '').trim();
  
  // Limit length to prevent DoS
  const MAX_LENGTH = 10000;
  if (sanitized.length > MAX_LENGTH) {
    sanitized = sanitized.substring(0, MAX_LENGTH);
  }
  
  return sanitized;
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
function isValidEmail(email) {
  if (typeof email !== 'string' || email.length === 0 || email.length > 254) return false;

  const atIndex = email.indexOf('@');
  if (atIndex <= 0 || atIndex === email.length - 1) return false;

  let dotAfterAt = -1;
  for (let i = 0; i < email.length; i += 1) {
    const char = email[i];
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f' || (i !== atIndex && char === '@')) return false;
    if (i > atIndex && char === '.' && dotAfterAt === -1) dotAfterAt = i;
  }

  return dotAfterAt > atIndex + 1 && dotAfterAt < email.length - 1;
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {{valid: boolean, error?: string}} - Validation result
 */
function validatePassword(password) {
  if (typeof password !== 'string') {
    return { valid: false, error: 'Password must be a string.' };
  }
  
  if (password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters long.' };
  }
  
  if (password.length > 128) {
    return { valid: false, error: 'Password must not exceed 128 characters.' };
  }
  
  return { valid: true };
}

/**
 * Validate room name
 * @param {string} name - Room name
 * @returns {{valid: boolean, error?: string}} - Validation result
 */
function validateRoomName(name) {
  if (typeof name !== 'string') {
    return { valid: false, error: 'Room name must be a string.' };
  }
  
  const trimmed = name.trim();
  
  if (trimmed.length < 1) {
    return { valid: false, error: 'Room name cannot be empty.' };
  }
  
  if (trimmed.length > 50) {
    return { valid: false, error: 'Room name must not exceed 50 characters.' };
  }
  
  // Allow alphanumeric, spaces, hyphens, underscores without a backtracking regex.
  for (const char of trimmed) {
    const code = char.charCodeAt(0);
    const alphanumeric = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    if (!alphanumeric && char !== ' ' && char !== '-' && char !== '_') {
      return { valid: false, error: 'Room name can only contain letters, numbers, spaces, hyphens, and underscores.' };
    }
  }
  
  return { valid: true, value: trimmed };
}

/**
 * Validate language selection
 * @param {string} language - Language name
 * @param {Array<string>} allowedLanguages - List of allowed languages
 * @returns {{valid: boolean, error?: string}} - Validation result
 */
function validateLanguage(language, allowedLanguages) {
  if (typeof language !== 'string') {
    return { valid: false, error: 'Language must be a string.' };
  }
  
  const lowerLang = language.toLowerCase().trim();
  
  if (!allowedLanguages.includes(lowerLang)) {
    return { 
      valid: false, 
      error: `Invalid language. Allowed: ${allowedLanguages.join(', ')}` 
    };
  }
  
  return { valid: true, value: lowerLang };
}

/**
 * Validate chat message
 * @param {string} content - Message content
 * @returns {{valid: boolean, error?: string}} - Validation result
 */
function validateChatMessage(content) {
  if (typeof content !== 'string') {
    return { valid: false, error: 'Message must be a string.' };
  }
  
  const trimmed = content.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, error: 'Message cannot be empty.' };
  }
  
  if (trimmed.length > 2000) {
    return { valid: false, error: 'Message must not exceed 2000 characters.' };
  }
  
  return { valid: true, value: trimmed };
}

/**
 * Validate source code for execution
 * @param {string} code - Source code
 * @returns {{valid: boolean, error?: string}} - Validation result
 */
function validateSourceCode(code) {
  if (typeof code !== 'string') {
    return { valid: false, error: 'Source code must be a string.' };
  }
  
  if (code.length === 0) {
    return { valid: false, error: 'Source code cannot be empty.' };
  }
  
  // Limit code size to prevent abuse (50KB max)
  if (code.length > 51200) {
    return { valid: false, error: 'Source code must not exceed 50KB.' };
  }
  
  return { valid: true };
}

module.exports = {
  sanitizeString,
  isValidEmail,
  validatePassword,
  validateRoomName,
  validateLanguage,
  validateChatMessage,
  validateSourceCode,
};
