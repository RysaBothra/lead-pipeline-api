// Profile is now read from the VocalLabs-owned `client` table (goFlash auth),
// not the Subspace `auth` remote schema. phone_number/email_id are aliased to
// the field names the app already consumes.
export const GET_USER_DATA = `
  query GetUserData($id: uuid!) {
    vocallabs_client(where: {id: {_eq: $id}}) {
      id
      fullname
      phone: phone_number
      email: email_id
      dp
      username
      email_verified
    }
  }
`;

export const GET_COUNTRY_CODES = `
  query GetExchangeRate {
    vocallabs_exchange_rate {
      country_code
      phone_code
      country_name
    }
  }
`;

export const REGISTER = `
  mutation Register($phone: String!) {
    registerWithoutPasswordV2(credentials: {phone: $phone}) {
      request_id
      status
    }
  }
`;

export const VERIFY_OTP = `
  mutation VerifyOTP($phone1: String!, $otp1: String!) {
    verifyOTPV2(request: {otp: $otp1, phone: $phone1}) {
      auth_token
      refresh_token
      id
      status
      deviceInfoSaved
    }
  }
`;

// ============================================================================
// 🚀 NEW V3 QUERIES
// ============================================================================
export const REGISTER_V3 = `
  mutation RegisterV3($phone: String!, $recaptcha_token: String!) {
    registerWithoutPasswordV3(credentials: {phone: $phone, recaptcha_token: $recaptcha_token}) {
      request_id
      status
    }
  }
`;

export const VERIFY_OTP_V3 = `
  mutation VerifyOTPV3($phone1: String!, $otp1: String!) {
    verifyOTPV3(request: {otp: $otp1, phone: $phone1}) {
      auth_token
      refresh_token
      id
      status
      deviceInfoSaved
    }
  }
`;

export const REGISTER_V4 = `
  mutation RegisterV4($phone: String!, $recaptcha_token: String!) {
    registerWithoutPasswordV4(credentials: {phone: $phone, recaptcha_token: $recaptcha_token}) {
      request_id
      status
    }
  }
`;

// ============================================================================
// 🚀 V5 — VocalLabs-owned auth (goFlash). Same shapes as V4; just the new
// action field names that route to auth.vocallabs.ai instead of cubetech.
// ============================================================================
export const REGISTER_V5 = `
  mutation RegisterV5($phone: String!, $recaptcha_token: String!) {
    registerWithoutPassword_v5(credentials: {phone: $phone, recaptcha_token: $recaptcha_token}) {
      request_id
      status
    }
  }
`;

export const VERIFY_OTP_V5 = `
  mutation VerifyOTPV5($otp: String = "", $phone: String = "", $device_data: jsonb = "", $device_id: String = "", $ip_address: String = "", $version: Int = 0, $lang: String = "") {
    verifyOTP_v5(request: {otp: $otp, phone: $phone, device_data: $device_data, device_id: $device_id, ip_address: $ip_address, version: $version, lang: $lang}) {
      auth_token
      deviceInfoSaved
      id
      refresh_token
      status
    }
  }
`;

export const VERIFY_OTP_V4 = `
  mutation MyMutation($otp: String = "", $phone: String = "", $device_data: jsonb = "", $device_id: String = "", $ip_address: String = "", $version: Int = 0, $lang: String = "") {
    verifyOTPV4(request: {otp: $otp, phone: $phone, device_data: $device_data, device_id: $device_id, ip_address: $ip_address, version: $version, lang: $lang}) {
      auth_token
      deviceInfoSaved
      id
      refresh_token
      status
    }
  }
`;
// ============================================================================

// V5 — refresh via goFlash (refreshToken_v5 action, inline scalar args).
export const REFRESH_TOKEN = `
  mutation RefreshTokenV5($refresh_token: String = "", $user_id: uuid = "") {
    refreshToken_v5(refresh_token: $refresh_token, user_id: $user_id) {
      auth_token
      refresh_token
      status
      id
    }
  }
`;

export const LOGOUT = `
  mutation Logout($refreshToken: String!) {
    subspace {
      logout(request: {refresh_token: $refreshToken}) {
        success
        message
      }
    }
  }
`;

// ============================================================================
// 🚀 WHATSAPP OTP QUERIES
// ============================================================================
export const GET_WHATSAPP_LINK = `
  mutation GetWhatsAppLink {
    getWhatsAppLink(input: { request: {} }) {
      type
      link
    }
  }
`;

export const VERIFY_WHATSAPP_OTP_V3 = `
  mutation VerifyWhatsAppOTP($request: VerifyWhatsAppOTPRequest!) {
    verifyWhatsAppOTP_v3(request: $request) {
      status
      auth_token
      refresh_token
      id
      phone
      deviceInfoSaved
    }
  }
`;
export const LOGOUT_WITH_TOKEN = `
  mutation MyMutation($auth_token: String = "") {
    logout(auth_token: $auth_token) {
      message
    }
  }
`;
