/**
 * INBEX — Global Toast Notification System
 * Usage: Toast.success('Done!') | Toast.error('Oops') | Toast.info('FYI') | Toast.warn('Careful')
 * Auto-dismisses after 4s. No dependencies.
 */

(function () {
    'use strict';

    // Inject styles once
    if (!document.getElementById('inbex-toast-styles')) {
        const style = document.createElement('style');
        style.id = 'inbex-toast-styles';
        style.textContent = `
            #inbex-toast-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 99999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                pointer-events: none;
                max-width: 360px;
                width: calc(100vw - 40px);
            }
            .inbex-toast {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                padding: 14px 16px;
                border-radius: 12px;
                border: 1px solid transparent;
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                box-shadow: 0 8px 32px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.2);
                pointer-events: all;
                cursor: pointer;
                animation: toastSlideIn 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards;
                position: relative;
                overflow: hidden;
                min-height: 52px;
            }
            .inbex-toast.toast-hiding {
                animation: toastSlideOut 0.25s ease-in forwards;
            }
            .inbex-toast-icon {
                font-size: 18px;
                flex-shrink: 0;
                margin-top: 1px;
                line-height: 1;
            }
            .inbex-toast-content {
                flex: 1;
                min-width: 0;
            }
            .inbex-toast-title {
                font-weight: 600;
                font-size: 13.5px;
                line-height: 1.3;
                margin-bottom: 2px;
            }
            .inbex-toast-body {
                font-size: 12.5px;
                opacity: 0.8;
                line-height: 1.4;
            }
            .inbex-toast-close {
                background: none;
                border: none;
                cursor: pointer;
                opacity: 0.5;
                padding: 0;
                flex-shrink: 0;
                font-size: 16px;
                line-height: 1;
                transition: opacity 0.15s;
                color: inherit;
                margin-top: 1px;
            }
            .inbex-toast-close:hover { opacity: 1; }
            .inbex-toast-progress {
                position: absolute;
                bottom: 0;
                left: 0;
                height: 2px;
                border-radius: 0 0 12px 12px;
                animation: toastProgress var(--toast-duration, 4000ms) linear forwards;
            }
            /* Success */
            .toast-success {
                background: rgba(16, 185, 129, 0.12);
                border-color: rgba(16, 185, 129, 0.3);
                color: #ecfdf5;
            }
            .toast-success .inbex-toast-progress { background: #10b981; }
            /* Error */
            .toast-error {
                background: rgba(239, 68, 68, 0.12);
                border-color: rgba(239, 68, 68, 0.3);
                color: #fef2f2;
            }
            .toast-error .inbex-toast-progress { background: #ef4444; }
            /* Warning */
            .toast-warn {
                background: rgba(245, 158, 11, 0.12);
                border-color: rgba(245, 158, 11, 0.3);
                color: #fffbeb;
            }
            .toast-warn .inbex-toast-progress { background: #f59e0b; }
            /* Info */
            .toast-info {
                background: rgba(99, 102, 241, 0.12);
                border-color: rgba(99, 102, 241, 0.3);
                color: #eef2ff;
            }
            .toast-info .inbex-toast-progress { background: #6366f1; }

            @keyframes toastSlideIn {
                from { opacity: 0; transform: translateX(100%) scale(0.9); }
                to   { opacity: 1; transform: translateX(0) scale(1); }
            }
            @keyframes toastSlideOut {
                from { opacity: 1; transform: translateX(0) scale(1); }
                to   { opacity: 0; transform: translateX(100%) scale(0.9); }
            }
            @keyframes toastProgress {
                from { width: 100%; }
                to   { width: 0%; }
            }
        `;
        document.head.appendChild(style);
    }

    // Create or get container
    function getContainer() {
        let container = document.getElementById('inbex-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'inbex-toast-container';
            container.setAttribute('role', 'region');
            container.setAttribute('aria-label', 'Notifications');
            document.body.appendChild(container);
        }
        return container;
    }

    const ICONS = {
        success: '✅',
        error:   '❌',
        warn:    '⚠️',
        info:    'ℹ️',
    };

    const TITLES = {
        success: 'Success',
        error:   'Error',
        warn:    'Warning',
        info:    'Info',
    };

    function show(type, message, title, duration = 4000) {
        const container = getContainer();

        const toast = document.createElement('div');
        toast.className = `inbex-toast toast-${type}`;
        toast.style.setProperty('--toast-duration', `${duration}ms`);
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'polite');

        const displayTitle = title || TITLES[type] || 'Notification';
        const isString     = typeof message === 'string';

        toast.innerHTML = `
            <span class="inbex-toast-icon" aria-hidden="true">${ICONS[type] || 'ℹ️'}</span>
            <div class="inbex-toast-content">
                <div class="inbex-toast-title">${displayTitle}</div>
                ${isString && message ? `<div class="inbex-toast-body">${message}</div>` : ''}
            </div>
            <button class="inbex-toast-close" aria-label="Dismiss notification">×</button>
            <div class="inbex-toast-progress"></div>
        `;

        function dismiss() {
            toast.classList.add('toast-hiding');
            toast.addEventListener('animationend', () => toast.remove(), { once: true });
        }

        toast.querySelector('.inbex-toast-close').addEventListener('click', dismiss);
        toast.addEventListener('click', dismiss);

        container.appendChild(toast);

        const timer = setTimeout(dismiss, duration);
        toast.addEventListener('mouseenter', () => clearTimeout(timer));
        toast.addEventListener('mouseleave', () => setTimeout(dismiss, 1000));

        // Limit to 5 toasts max
        const toasts = container.querySelectorAll('.inbex-toast:not(.toast-hiding)');
        if (toasts.length > 5) toasts[0].click();
    }

    window.Toast = {
        success: (msg, title, duration) => show('success', msg, title, duration),
        error:   (msg, title, duration) => show('error',   msg, title, duration),
        warn:    (msg, title, duration) => show('warn',    msg, title, duration),
        info:    (msg, title, duration) => show('info',    msg, title, duration),
    };
})();
