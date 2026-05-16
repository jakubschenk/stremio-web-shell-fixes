// Copyright (C) 2017-2023 Smart code 203358507

require('spatial-navigation-polyfill');
const React = require('react');
const { useTranslation } = require('react-i18next');
const { useCore } = require('stremio/core');
const { Router } = require('stremio-router');
const { Chromecast, ServicesProvider, GamepadProvider } = require('stremio/services');
const { NotFound } = require('stremio/routes');
const { FullscreenProvider, ToastProvider, TooltipProvider, ShortcutsProvider, CONSTANTS, useBinaryState, useProfile, withCoreSuspender, onFileDrop, usePlatform } = require('stremio/common');
const ServicesToaster = require('./ServicesToaster');
const DeepLinkHandler = require('./DeepLinkHandler');
const SearchParamsHandler = require('./SearchParamsHandler');
const PipHandler = require('./PipHandler');
const { default: UpdaterBanner } = require('./UpdaterBanner');
const { default: ShortcutsModal } = require('./ShortcutsModal');
const { default: GamepadModal } = require('./GamepadModal');
const useToast = require('stremio/common/Toast/useToast');
const withProtectedRoutes = require('./withProtectedRoutes');
const routerViewsConfig = require('./routerViewsConfig');
const styles = require('./styles');

const RouterWithProtectedRoutes = withProtectedRoutes(Router);

const ShellEventHandler = () => {
    const core = useCore();
    const toast = useToast();
    const { shell } = usePlatform();

    const playLocalFile = React.useCallback(async (filepath) => {
        try {
            const decodedPath = decodeURIComponent(filepath);
            const filename = decodedPath.split(/[\\/]/).pop() || 'file';
            const encoded = await core.transport.encodeStream({
                url: decodedPath,
                behaviorHints: { filename },
            });
            window.location.assign(`#/player/${encodeURIComponent(encoded)}`);
        } catch (e) {
            console.error('Failed to open local file:', e);
            toast.show({
                type: 'error',
                title: 'Failed to open local file.',
                timeout: 5000,
            });
        }
    }, [core, toast]);

    React.useEffect(() => {
        const getPath = (data) => typeof data === 'string' ? data : data?.path;

        const onReplaceLocation = (data) => {
            const path = getPath(data);
            if (typeof path === 'string') {
                window.location.assign(decodeURIComponent(path.replace('stremio://', '#/')));
            }
        };
        const onOpenFile = (data) => {
            const path = getPath(data);
            if (typeof path === 'string') playLocalFile(path);
        };
        const onAddonInstall = (data) => {
            const path = getPath(data);
            if (typeof path !== 'string') return;

            if (path.startsWith('stremio:///detail/')) {
                window.location.assign(`#${path.replace('stremio://', '')}`);
                return;
            }

            const addonPath = path.replace('stremio://', 'https://');
            window.location.assign(`#/addons?addon=${encodeURIComponent(addonPath)}`);
        };
        const onOpenTorrent = (data) => {
            let argsData = null;
            if (data?.data) {
                argsData = Array.from(new Uint8Array(data.data));
            } else if (data?.magnet) {
                argsData = data.magnet;
            }
            if (argsData === null) return;

            core.transport.dispatch({
                action: 'StreamingServer',
                args: {
                    action: 'CreateTorrent',
                    args: argsData,
                },
            });
        };
        const onServerStarted = () => {
            core.transport.dispatch({
                action: 'StreamingServer',
                args: {
                    action: 'Reload',
                },
            });
        };
        const onSubtitleDropped = (data) => {
            const path = getPath(data) || 'subtitle';
            const filename = decodeURIComponent(path.split(/[\\/]/).pop() || 'subtitle');
            toast.show({
                type: 'success',
                title: 'Added subtitle file',
                message: filename,
                timeout: 4000,
            });
        };
        const onShellToast = (data) => {
            const [type = 'info', title = '', message = '', timeout = 4000] = Array.isArray(data) ? data : [];
            toast.show({ type, title, message, timeout });
        };
        const showPipOverlay = () => {
            const pipOverlay = document.getElementById('pip-overlay');
            if (pipOverlay) pipOverlay.style.display = 'block';
        };
        const hidePipOverlay = () => {
            const pipOverlay = document.getElementById('pip-overlay');
            if (pipOverlay) pipOverlay.style.display = 'none';
        };

        shell.on('ReplaceLocation', onReplaceLocation);
        shell.on('FileDropped', onOpenFile);
        shell.on('OpenFile', onOpenFile);
        shell.on('AddonInstall', onAddonInstall);
        shell.on('OpenTorrent', onOpenTorrent);
        shell.on('ServerStarted', onServerStarted);
        shell.on('SubtitleDropped', onSubtitleDropped);
        shell.on('ShellToast', onShellToast);
        shell.on('showPictureInPicture', showPipOverlay);
        shell.on('hidePictureInPicture', hidePipOverlay);

        return () => {
            shell.off('ReplaceLocation', onReplaceLocation);
            shell.off('FileDropped', onOpenFile);
            shell.off('OpenFile', onOpenFile);
            shell.off('AddonInstall', onAddonInstall);
            shell.off('OpenTorrent', onOpenTorrent);
            shell.off('ServerStarted', onServerStarted);
            shell.off('SubtitleDropped', onSubtitleDropped);
            shell.off('ShellToast', onShellToast);
            shell.off('showPictureInPicture', showPipOverlay);
            shell.off('hidePictureInPicture', hidePipOverlay);
        };
    }, [core, playLocalFile, shell, toast]);

    return null;
};

const App = () => {
    const core = useCore();
    const profile = useProfile();
    const { i18n } = useTranslation();
    const { shell } = usePlatform();
    const [gamepadSupportEnabled, setGamepadSupportEnabled] = React.useState(false);
    const onPathNotMatch = React.useCallback(() => {
        return NotFound;
    }, []);
    const services = React.useMemo(() => {
        return {
            chromecast: new Chromecast(),
        };
    }, []);
    const [shortcutModalOpen,, closeShortcutsModal, toggleShortcutModal] = useBinaryState(false);
    const [gamepadModalOpen,, closeGamepadModal, toggleGamepadModal] = useBinaryState(false);

    const onShortcut = React.useCallback((name, combo, key) => {
        switch (name) {
            case 'shortcuts':
                toggleShortcutModal();
                break;
            case 'gamepadGuide':
                toggleGamepadModal();
                break;
            case 'navigateSearch':
                window.location = '#/search';
                break;
            case 'navigateTabs': {
                const routes = ['', 'discover', 'library', 'calendar', 'addons', 'settings'];
                const index = key - 1;
                if (index in routes) window.location = `#/${routes[index]}`;
                break;
            }
            case 'navigateHistory':
                combo === 0 ? window.history.back() : window.history.forward();
                break;
        }
    }, [toggleShortcutModal, toggleGamepadModal]);

    onFileDrop(['application/x-bittorrent'], (file, buffer) => {
        core.transport.dispatch({
            action: 'StreamingServer',
            args: {
                action: 'CreateTorrent',
                args: Array.from(new Uint8Array(buffer))
            }
        });
    });

    React.useEffect(() => {
        let prevPath = window.location.hash.slice(1);
        const onLocationHashChange = () => {
            core.transport.analytics({
                event: 'LocationPathChanged',
                args: { prevPath }
            });
            prevPath = window.location.hash.slice(1);
        };
        window.addEventListener('hashchange', onLocationHashChange);
        return () => {
            window.removeEventListener('hashchange', onLocationHashChange);
        };
    }, []);

    React.useEffect(() => {
        const onChromecastStateChange = () => {
            if (services.chromecast.active) {
                services.chromecast.transport.setOptions({
                    receiverApplicationId: CONSTANTS.CHROMECAST_RECEIVER_APP_ID,
                    autoJoinPolicy: chrome.cast.AutoJoinPolicy.PAGE_SCOPED,
                    resumeSavedSession: false,
                    language: null,
                    androidReceiverCompatible: true
                });
            }
        };
        services.chromecast.on('stateChanged', onChromecastStateChange);
        services.chromecast.start();
        window.services = services;
        return () => {
            services.chromecast.stop();
            services.chromecast.off('stateChanged', onChromecastStateChange);
        };
    }, []);

    // Handle shell events
    React.useEffect(() => {
        const onOpenMedia = (data) => {
            try {
                const { protocol, hostname, pathname, searchParams } = new URL(data);
                if (protocol === CONSTANTS.PROTOCOL) {
                    if (hostname.length) {
                        const transportUrl = `https://${hostname}${pathname}`;
                        window.location.href = `#/addons?addon=${encodeURIComponent(transportUrl)}`;
                    } else {
                        window.location.href = `#${pathname}?${searchParams.toString()}`;
                    }
                }
            } catch (e) {
                console.error('Failed to open media:', e);
            }
        };

        shell.on('open-media', onOpenMedia);

        return () => {
            shell.off('open-media', onOpenMedia);
        };
    }, []);

    React.useEffect(() => {
        if (typeof profile.settings?.interfaceLanguage === 'string') {
            i18n.changeLanguage(profile.settings.interfaceLanguage);
        }

        if (typeof profile.settings?.gamepadSupport === 'boolean') {
            setGamepadSupportEnabled(profile.settings.gamepadSupport);
        }

        if (profile.settings?.quitOnClose && shell.state.windowClosed) {
            shell.send('quit');
        }
    }, [profile.settings, shell.state.windowClosed]);

    React.useEffect(() => {
        const onWindowFocus = () => {
            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'PullAddonsFromAPI'
                }
            });
            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'PullUserFromAPI',
                    args: {}
                }
            });
            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'SyncLibraryWithAPI'
                }
            });
            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'PullNotifications'
                }
            });
        };

        onWindowFocus();
        window.addEventListener('focus', onWindowFocus);

        return () => {
            window.removeEventListener('focus', onWindowFocus);
        };
    }, []);

    return (
        <ServicesProvider services={services}>
            <ToastProvider className={styles['toasts-container']}>
                <TooltipProvider className={styles['tooltip-container']}>
                    <GamepadProvider enabled={gamepadSupportEnabled} onGuide={toggleGamepadModal}>
                        <ShortcutsProvider onShortcut={onShortcut}>
                            <FullscreenProvider>
                                {
                                    shortcutModalOpen && <ShortcutsModal onClose={closeShortcutsModal}/>
                                }
                                {
                                    gamepadModalOpen && <GamepadModal onClose={closeGamepadModal}/>
                                }
                                <ServicesToaster />
                                <ShellEventHandler />
                                <DeepLinkHandler />
                                <SearchParamsHandler />
                                <PipHandler />
                                <UpdaterBanner className={styles['updater-banner-container']} />
                                <RouterWithProtectedRoutes
                                    className={styles['router']}
                                    viewsConfig={routerViewsConfig}
                                    onPathNotMatch={onPathNotMatch}
                                />
                            </FullscreenProvider>
                        </ShortcutsProvider>
                    </GamepadProvider>
                </TooltipProvider>
            </ToastProvider>
        </ServicesProvider>
    );
};

module.exports = withCoreSuspender(App);
