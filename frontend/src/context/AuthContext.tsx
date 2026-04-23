import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const API_BASE = "http://localhost:8081";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  picture: string | null;
  provider: string;
  role: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<any>;
  signup: (name: string, email: string, password: string) => Promise<boolean>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
  resendOtp: (email: string) => Promise<void>;
  loginWithGoogle: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("jwt"));
  const [loading, setLoading] = useState(true);

  // Fetch profile on mount (or when token changes)
  const fetchProfile = useCallback(async (jwt: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        return true;
      }
      // 401 = access token expired. Let the caller (init) handle refresh.
      return false;
    } catch {
      return false;
    }
  }, []);

  // Try to refresh the access token using the stored refresh token
  const tryRefreshToken = useCallback(async (): Promise<string | null> => {
    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) return null;
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("jwt", data.token);
        localStorage.setItem("refreshToken", data.refreshToken);
        setToken(data.token);
        setUser(data.user);
        return data.token;
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  useEffect(() => {
    const init = async () => {
      // Check URL for OAuth2 redirect tokens
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get("token");
      const urlRefreshToken = params.get("refreshToken");
      
      if (urlToken) {
        localStorage.setItem("jwt", urlToken);
        setToken(urlToken);
        // refreshToken is present in OAuth2 redirects — save it if available
        if (urlRefreshToken) localStorage.setItem("refreshToken", urlRefreshToken);
        window.history.replaceState({}, "", window.location.pathname);
        await fetchProfile(urlToken);
        setLoading(false);
        return;
      }

      if (token) {
        const ok = await fetchProfile(token);
        if (!ok) {
          // Access token expired — try refresh before logging out
          const newToken = await tryRefreshToken();
          if (!newToken) {
            localStorage.removeItem("jwt");
            localStorage.removeItem("refreshToken");
            setToken(null);
          }
        }
      }
      setLoading(false);
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
        if (data.requireOtp) return data; // Return to caller to handle OTP UI
        throw new Error(data.error || "Login failed");
    }
    localStorage.setItem("jwt", data.token);
    if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const signup = async (name: string, email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Signup failed");
    return data.requireOtp || false;
  };

  const verifyOtp = async (email: string, otp: string) => {
    const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Verification failed");
    localStorage.setItem("jwt", data.token);
    if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
    setToken(data.token);
    setUser(data.user);
  };

  const resendOtp = async (email: string) => {
    const res = await fetch(`${API_BASE}/api/auth/resend-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to resend OTP");
  };

  const loginWithGoogle = () => {
    window.location.href = `${API_BASE}/oauth2/authorization/google`;
  };

  const logout = () => {
    localStorage.removeItem("jwt");
    localStorage.removeItem("refreshToken");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        loading,
        login,
        signup,
        verifyOtp,
        resendOtp,
        loginWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
