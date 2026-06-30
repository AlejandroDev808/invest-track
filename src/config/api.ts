import axios from 'axios';
import { Capacitor } from '@capacitor/core';

const RENDER_BACKEND_URL = 'https://invest-track.onrender.com';

const API_BASE_URL: string =
  Capacitor.isNativePlatform()
    ? (import.meta.env.VITE_API_URL || RENDER_BACKEND_URL)
    : import.meta.env.MODE === 'production'
      ? (import.meta.env.VITE_API_URL || '')
      : '';

const api = axios.create({
  baseURL: API_BASE_URL,
});

export default api;
export { API_BASE_URL };
