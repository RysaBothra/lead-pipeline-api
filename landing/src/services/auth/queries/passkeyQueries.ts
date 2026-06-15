// passkeyQueries.ts - FIXED VERSION

// ============================================================================
// LOGIN FLOW (Unauthenticated - uses phone number)
// ============================================================================

/**
 * Generate authentication options for passkey login (V2)
 * Used to check if a user has passkeys and get challenge
 */
export const GENERATE_AUTHENTICATION_OPTIONS = `
  mutation GenerateAuthenticationOptions(
    $phone: String!
    $recaptcha_token: String!
    $device_id: String
    $device_data: JSON
    $origin: String!
  ) {
    generateAuthenticationOptions_v2(
      phone: $phone
      recaptcha_token: $recaptcha_token
      device_id: $device_id
      device_data: $device_data
      origin: $origin
    ) {
      challenge
      rpId
      allowCredentials {
        type
        id
        transports
      }
      userVerification
      timeout
    }
  }
`;

/**
 * Verify passkey authentication and complete login
 * Returns auth tokens on success
 */
export const VERIFY_AUTHENTICATION = `
  mutation VerifyAuthentication(
    $phone: String!
    $credential: AuthCredentialInput!
    $recaptcha_token: String!
    $device_id: String
    $device_data: JSON
    $lang: String
    $version: Int
    $origin: String!
  ) {
    verifyAuthentication(
      phone: $phone
      credential: $credential
      recaptcha_token: $recaptcha_token
      device_id: $device_id
      device_data: $device_data
      lang: $lang
      version: $version
      origin: $origin
    ) {
      status
      auth_token
      refresh_token
      id
      deviceInfoSaved
    }
  }
`;

// ============================================================================
// REGISTRATION FLOW (Authenticated - uses user_id)
// ============================================================================

/**
 * Generate registration options for new passkey
 * Requires authentication (JWT token in headers)
 */
export const GENERATE_REGISTRATION_OPTIONS = `
  mutation GenerateRegistrationOptions(
    $user_id: uuid!
    $device_id: String
    $device_data: JSON
    $device_name: String
    $origin: String!
  ) {
    generateRegistrationOptions(
      user_id: $user_id
      device_id: $device_id
      device_data: $device_data
      device_name: $device_name
      origin: $origin
    ) {
      challenge
      rp {
        name
        id
      }
      user {
        id
        name
        displayName
      }
      pubKeyCredParams
      authenticatorSelection
      excludeCredentials
      attestation
      timeout
    }
  }
`;

export const VERIFY_REGISTRATION = `
  mutation VerifyRegistration(
    $user_id: uuid!
    $credential: RegCredentialInput!
    $device_id: String
    $device_data: JSON
    $device_name: String
    $origin: String!
  ) {
    verifyRegistration(
      user_id: $user_id
      credential: $credential
      device_id: $device_id
      device_data: $device_data
      device_name: $device_name
      origin: $origin
    ) {
      verified
      message
    }
  }
`;

// ============================================================================
// DELETE FLOW (Authenticated - uses user_id)
// ============================================================================

/**
 * Delete all passkeys for a user FOR CURRENT DOMAIN
 * Requires authentication (JWT token in headers)
 */
export const DELETE_PASSKEY = `
  mutation DeletePasskey($user_id: uuid!, $origin: String!) {
    deletePasskey(user_id: $user_id, origin: $origin) {
      status
      deleted_count
      message
    }
  }
`;

/**
 * List all passkey devices for a user
 * Requires authentication (JWT token in headers)
 * Filters by rp_id to show only devices for current domain
 */
export const LIST_PASSKEY_DEVICES = `
  query ListPasskeyDevices($user_id: uuid!, $rp_id: String!) {
    passkey_authenticators(where: {user_id: {_eq: $user_id}, rp_id: {_eq: $rp_id}}) {
      id
      credential_id
      device_id
      device_name
      created_at
      last_used_at
      transports
      rp_id
    }
  }
`;

/**
 * Delete a specific passkey device FOR CURRENT DOMAIN
 */
export const DELETE_PASSKEY_DEVICE = `
  mutation DeletePasskeyDevice($user_id: uuid!, $device_id: String!, $origin: String!) {
    deletePasskey(user_id: $user_id, device_id: $device_id, origin: $origin) {
      status
      deleted_count
      message
    }
  }
`;

// ============================================================================
// Type Definitions for TypeScript
// ============================================================================

export interface AuthCredentialInput {
  id: string;
  rawId: string;
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle?: string;
  };
  type: string;
  clientExtensionResults?: any;
  authenticatorAttachment?: string;
}

export interface RegCredentialInput {
  id: string;
  rawId: string;
  response: {
    attestationObject: string;
    clientDataJSON: string;
    transports?: string[];
    publicKeyAlgorithm?: number;
    publicKey?: string;
    authenticatorData?: string;
  };
  type: string;
  clientExtensionResults?: any;
  authenticatorAttachment?: string;
}

export interface PasskeyDevice {
  id: string;
  credential_id: string;
  device_id: string;
  device_name?: string;
  created_at: string;
  last_used_at?: string;
  transports?: string[];
  rp_id?: string;
}