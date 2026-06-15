export interface User {
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

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  authToken: string | null;
  refreshToken: string | null;
  tokenExpiry: number | null;
  silentUpdate?: boolean;
  id?: string | null;
}

interface LoginResponse {
  auth_token: string;
  refresh_token: string;
  id: string;
  status: string;
  deviceInfoSaved?: boolean;
}

interface UserData {
  fullname: string | null;
  phone: string;
  email: string | null;
  dp: string | null;
  username: string | null;
  email_verified: boolean;
  country: string | null;
  currency: string | null;
}

interface AuthContextInterface {
  isAuthenticated: boolean;
  user: User | null;
  authToken: string | null;
  refreshToken: string | null;
  login: (token: string, user: User, refreshToken?: string) => void;
  logout: () => void;
  updateUserData: () => Promise<void>;
}