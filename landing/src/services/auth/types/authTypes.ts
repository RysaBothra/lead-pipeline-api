export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  authToken: string | null;
  refreshToken: string | null;
  tokenExpiry: number | null;
  silentUpdate?: boolean;
}

interface User {
  id: string;
  phone: string;
  fullname?: string;
  email?: string;
  dp?: string;
  username?: string;
  email_verified?: boolean;
  country?: string;
  currency?: string;
}

export interface LoginResponse {
  auth_token: string;
  refresh_token: string;
  id: string;
  status: string;
  deviceInfoSaved?: boolean;
}

export interface OtpVerificationData {
  phone: string;
  otp: string;
}

export interface RegisterResponse {
  request_id: string;
  status: string;
}

export interface UserData {
  fullname: string | null;
  phone: string;
  email: string | null;
  dp: string | null;
  username: string | null;
  email_verified: boolean;
  country: string | null;
  currency: string | null;
}

interface CountryCode {
  country_code: string;
  phone_code: string;
  country_name?: string;
}

export interface AuthContextInterface {
  isAuthenticated: boolean;
  user: User | null;
  authToken: string | null;
  refreshToken: string | null;
  tokenExpiry: number | null;
  login: (token: string, user: User, refreshToken?: string) => void;
  logout: () => Promise<void>;
  updateUserData: () => Promise<void>;
  triggerRefreshToken: () => Promise<string | null>; // Renamed from refreshToken
  refreshingToken: boolean;
  loggingOut: boolean;
  silentUpdate?: boolean;
}