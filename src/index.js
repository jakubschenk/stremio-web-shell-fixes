// Copyright (C) 2017-2023 Smart code 203358507

if (typeof process.env.SENTRY_DSN === 'string') {
    const Sentry = require('@sentry/browser');
    Sentry.init({ dsn: process.env.SENTRY_DSN });
}

const Bowser = require('bowser');
const browser = Bowser.parse(window.navigator?.userAgent || '');
if (browser?.platform?.type === 'desktop') {
    document.querySelector('meta[name="viewport"]')?.setAttribute('content', '');
}

const React = require('react');
const ReactDOM = require('react-dom/client');
const i18n = require('i18next');
const { initReactI18next } = require('react-i18next');
const stremioTranslations = require('stremio-translations');
const App = require('./App');
const { CoreProvider } = require('./core');
const { FileDropProvider, PlatformProvider, StorageProvider } = require('./common');

const translations = Object.fromEntries(Object.entries(stremioTranslations()).map(([key, value]) => [key, {
    translation: value
}]));

i18n
    .use(initReactI18next)
    .init({
        resources: translations,
        lng: 'en-US',
        fallbackLng: 'en-US',
        interpolation: {
            escapeValue: false
        }
    });

const appInfo = {
    appVersion: process.env.VERSION,
    shellVersion: null
};

const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(
    <PlatformProvider>
        <StorageProvider>
            <CoreProvider appInfo={appInfo}>
                <FileDropProvider>
                    <App />
                </FileDropProvider>
            </CoreProvider>
        </StorageProvider>
    </PlatformProvider>
);

if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        if (process.env.SERVICE_WORKER_DISABLED === 'true' || process.env.SERVICE_WORKER_DISABLED === true) {
            navigator.serviceWorker.getRegistrations()
                .then((registrations) => {
                    registrations.forEach((registration) => registration.unregister());
                })
                .catch((registrationError) => {
                    console.error('SW unregister failed: ', registrationError);
                });
        } else {
            navigator.serviceWorker.register('service-worker.js')
                .catch((registrationError) => {
                    console.error('SW registration failed: ', registrationError);
                });
        }
    });
}
