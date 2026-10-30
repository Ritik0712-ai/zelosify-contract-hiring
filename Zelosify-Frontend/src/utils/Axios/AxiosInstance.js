// src/utils/axiosInstance.js
import axios from "axios";

const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL,
  withCredentials: true,
});

// Add request interceptor for logging
axiosInstance.interceptors.request.use(
  (config) => {
    // console.log(`API Request: ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error("API Request Error:", error);
    return Promise.reject(error);
  }
);

// One refresh request is shared by concurrent API requests after access-token expiry.
let refreshInFlight = null;
axiosInstance.interceptors.response.use(
  response => response,
  async error => {
    const request = error.config;
    if (error.response?.status === 401 && request && !request._sessionRetried &&
        !/^\/auth\/(verify-login|verify-totp|refresh|register)(\/|$)/.test(String(request.url))) {
      request._sessionRetried = true;
      try {
        if (!refreshInFlight) {
          refreshInFlight = axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/refresh`, {}, {withCredentials:true})
            .finally(() => { refreshInFlight = null; });
        }
        await refreshInFlight;
        return axiosInstance(request);
      } catch { /* The screen handles a session that cannot be renewed. */ }
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
