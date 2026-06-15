/**
 * Extracts user-friendly error messages from GraphQL responses
 */
export function extractErrorMessage(error: any): string {
  // If it's already a simple string, return it
  if (typeof error === 'string') {
    return error;
  }

  // Handle GraphQL errors
  if (error?.response?.errors && Array.isArray(error.response.errors)) {
    const firstError = error.response.errors[0];
    if (firstError?.message) {
      return firstError.message;
    }
  }

  // Handle errors with a message property
  if (error?.message) {
    return error.message;
  }

  // Handle errors that might be nested in extensions
  if (error?.response?.extensions?.message) {
    return error.response.extensions.message;
  }

  // Handle errors from the data field
  if (error?.response?.data?.errors && Array.isArray(error.response.data.errors)) {
    const firstError = error.response.data.errors[0];
    if (firstError?.message) {
      return firstError.message;
    }
  }

  // Handle nested error structures common in GraphQL responses
  if (error?.errors && Array.isArray(error.errors)) {
    const firstError = error.errors[0];
    if (firstError?.message) {
      return firstError.message;
    }
  }

  // Handle error objects that might have nested error information
  if (error?.error?.message) {
    return error.error.message;
  }

  // Handle cases where the error is wrapped in a response object
  if (error?.data?.error?.message) {
    return error.data.error.message;
  }

  // Try to extract from error string if it contains JSON
  if (typeof error === 'object' && error !== null) {
    try {
      const errorString = JSON.stringify(error);

      // Look for specific error messages first
      const messagePatterns = [
        /No number associated to the agent/i,
        /Authentication required/i,
        /Permission denied/i,
        /Invalid input/i,
        /Not found/i,
        /Already exists/i,
        /Failed to/i,
        /Insufficient balance/i,
        /Zero Balance/i,
        /KYC/i,
        /"message"\s*:\s*"([^"]+)"/,
        /"error"\s*:\s*"([^"]+)"/,
      ];

      for (const pattern of messagePatterns) {
        const match = errorString.match(pattern);
        if (match && match[1]) {
          return match[1];
        } else if (match && match[0]) {
          return match[0];
        }
      }

      // If no specific patterns match, try to extract any message field
      const genericMessageMatch = errorString.match(/"message"\s*:\s*"([^"]+)"/);
      if (genericMessageMatch && genericMessageMatch[1]) {
        return genericMessageMatch[1];
      }
    } catch (e) {
      // If JSON parsing fails, continue to fallback
    }
  }

  // Fallback to a generic error message
  return 'An unexpected error occurred. Please try again.';
}

/**
 * Enhanced version of handleApiError that extracts and sanitizes the message
 */
export function handleApiError(error: unknown): string {
  const message = extractErrorMessage(error);
  return sanitizeErrorMessage(message);
}

/**
 * Sanitizes error messages to remove technical details and stack traces
 */
export function sanitizeErrorMessage(message: string): string {
  // Remove stack traces and technical details
  const cleanMessage = message
    .replace(/(^|\n)\s*at\s+.*(\n|$)/g, '') // Remove stack trace lines (stricter check)
    .replace(/\s*\^\s*/g, '') // Remove caret indicators
    .replace(/\s*~+\s*/g, '') // Remove tilde indicators
    .replace(/Error:\s*/g, '') // Remove "Error:" prefix
    .replace(/GraphQLError:\s*/g, '') // Remove "GraphQLError:" prefix
    .replace(/\s*\[object Object\]/g, '') // Remove [object Object]
    // .replace(/\s*\{[^}]*\}/g, '') // REMOVED: This removes meaningful content like "{{1}}" in errors
    .replace(/\s*\[[^\]]*\]/g, '') // Remove arrays
    .trim();

  // If the message is too long or contains technical jargon, provide a user-friendly alternative
  if (cleanMessage.length > 200 ||
    cleanMessage.includes('mutation') ||
    cleanMessage.includes('query') ||
    cleanMessage.includes('variables') ||
    cleanMessage.includes('extensions')) {

    // Extract common user-friendly messages
    if (cleanMessage.toLowerCase().includes('no number associated')) {
      return 'No phone number is associated with this agent. Please assign a phone number first.';
    }
    if (cleanMessage.toLowerCase().includes('authentication')) {
      return 'Authentication required. Please log in again.';
    }
    if (cleanMessage.toLowerCase().includes('permission')) {
      return 'You do not have permission to perform this action.';
    }
    if (cleanMessage.toLowerCase().includes('balance') || cleanMessage.toLowerCase().includes('insufficient')) {
      return 'Insufficient balance. Please add credits to your account.';
    }
    if (cleanMessage.toLowerCase().includes('kyc')) {
      return 'Please complete your KYC verification to continue.';
    }

    return cleanMessage;
  }

  return cleanMessage || 'An unexpected error occurred. Please try again.';
}