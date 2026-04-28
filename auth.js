/**
 * INBEX — Auth Helper
 * Centralized authentication utilities for managing JWT tokens.
 */
'use strict';

const Auth = {
    getToken() {
        return localStorage.getItem('inbex-token');
    },

    getUser() {
        try {
            const userStr = localStorage.getItem('inbex-user');
            return userStr ? JSON.parse(userStr) : null;
        } catch (e) {
            return null;
        }
    },

    setSession(token, user) {
        localStorage.setItem('inbex-token', token);
        localStorage.setItem('inbex-user', JSON.stringify(user));
        localStorage.setItem('inbexAuth', 'true'); // legacy flag
    },

    clearSession() {
        localStorage.removeItem('inbex-token');
        localStorage.removeItem('inbex-user');
        localStorage.removeItem('inbexAuth');
        localStorage.removeItem('inbexEmail');
        localStorage.removeItem('inbexPassword');
        localStorage.removeItem('inbexUser');
    },

    isAuthenticated() {
        return !!this.getToken();
    },

    getHeaders() {
        const token = this.getToken();
        return {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        };
    },

    requireAuth() {
        if (!this.isAuthenticated()) {
            window.location.href = 'index.html';
        }
    }
};

window.Auth = Auth;
