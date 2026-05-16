import { useEffect, useRef, useState } from 'react';
import EventEmitter from 'eventemitter3';

const IPC = globalThis?.chrome?.webview;
const LEGACY_IPC = globalThis?.qt?.webChannelTransport;
const QT_OBJECT_ID = 'transport';

const events = new EventEmitter();
let messageId = 0;

enum ShellEventType {
    SIGNAL = 1,
    INIT = 3,
    INVOKE_METHOD = 6,
    CONNECT_TO_SIGNAL = 7,
}

type ShellEvent = {
    id: number;
    type: ShellEventType;
};

type ShellEventInit = ShellEvent & {
    data: {
        transport: {
            properties: string[][],
        }
    };
};

type ShellEventSignal = ShellEvent & {
    args: string[];
};

type ShellMessage = {
    data: string | object;
};

type ShellProtocol = 'qt-channel' | 'legacy-webview' | null;

type QtTransportMethod = [string, number];
type QtTransportSignal = [string, number];
type QtTransportProperty = [string, string, string, string];
type QtTransportObject = {
    methods: QtTransportMethod[];
    properties: QtTransportProperty[];
    signals: QtTransportSignal[];
};

const useShell = (): Shell => {
    const protocolRef = useRef<ShellProtocol>(null);
    const qtMethodRef = useRef<number | null>(null);
    const [state, setState] = useState<ShellState>({
        version: null,
        windowClosed: false,
        windowHidden: false,
    });

    const on = (name: string, listener: (arg: any) => void) => events.on(name, listener);
    const off = (name: string, listener: (arg: any) => void) => events.off(name, listener);

    const send = (method: string, ...args: (string | number | object)[]) => {
        const singleArg = args.length === 1 ? args[0] : args;

        try {
            if (LEGACY_IPC && qtMethodRef.current !== null) {
                LEGACY_IPC.send(JSON.stringify({
                    id: messageId++,
                    type: ShellEventType.INVOKE_METHOD,
                    object: QT_OBJECT_ID,
                    method: qtMethodRef.current,
                    args: [method, singleArg ?? {}],
                }));
                return;
            }

            if (IPC) {
                const supportsQtChannel = protocolRef.current === 'qt-channel';
                const supportsLegacyWebView = protocolRef.current === 'legacy-webview' || protocolRef.current === null;

                if (supportsQtChannel || protocolRef.current === null) {
                    IPC.postMessage(JSON.stringify({
                        id: messageId++,
                        type: ShellEventType.INVOKE_METHOD,
                        args: [method, ...args],
                    }));
                }

                if (supportsLegacyWebView) {
                    IPC.postMessage(JSON.stringify({
                        id: messageId++,
                        event: method,
                        args: singleArg ?? {},
                    }));
                }
            }
        } catch (e) {
            console.error('Shell', 'Failed to send event', e);
        }
    };

    useEffect(() => {
        const onWindowVisibilityChanged = (data: WindowVisibility) => {
            setState((state) => ({
                ...state,
                windowClosed: data.visible === false && data.visibility === 0,
            }));
        };

        const onWindowStateChanged = (data: WindowState) => {
            setState((state) => ({
                ...state,
                windowHidden: data.state === 9,
            }));
        };

        on('win-visibility-changed', onWindowVisibilityChanged);
        on('win-state-changed', onWindowStateChanged);

        return () => {
            off('win-visibility-changed', onWindowVisibilityChanged);
            off('win-state-changed', onWindowStateChanged);
        };
    }, []);

    useEffect(() => {
        if (IPC && !globalThis.qt) {
            globalThis.initShellComm = () => {
                delete globalThis.initShellComm;
                protocolRef.current = 'legacy-webview';
                send('app-ready');
            };
        }

        const onMessage = (message: ShellMessage) => {
            try {
                const event = typeof message.data === 'string'
                    ? JSON.parse(message.data) as ShellEvent
                    : message.data as Record<string, any>;

                if (event.type === ShellEventType.INIT) {
                    protocolRef.current = 'qt-channel';
                    const { data } = event as ShellEventInit;
                    const [, [,,, version]] = data.transport.properties;

                    setState((state) => ({ ...state, version }));
                    send('app-ready');
                    return;
                }

                if (event.type === ShellEventType.SIGNAL) {
                    protocolRef.current = 'qt-channel';
                    const { args } = event as ShellEventSignal;
                    const [methodName, methodArg] = args;
                    events.emit(methodName, methodArg);
                    return;
                }

                if (typeof event.type === 'string') {
                    protocolRef.current = 'legacy-webview';
                    if (event.type === 'shellVersion' && typeof event.value === 'string') {
                        setState((state) => ({ ...state, version: event.value }));
                    }
                    events.emit(event.type, event);
                }
            } catch (e) {
                console.error('Shell', 'Failed to handle event', e);
            }
        };

        const onLegacyMessage = (message: ShellMessage) => {
            try {
                const event = typeof message.data === 'string'
                    ? JSON.parse(message.data)
                    : message.data as Record<string, any>;

                if (event.id === 0 && event.data?.[QT_OBJECT_ID]) {
                    protocolRef.current = 'qt-channel';
                    const transport = event.data[QT_OBJECT_ID] as QtTransportObject;

                    transport.properties.slice(1).forEach(([, name,, value]) => {
                        if (name === 'shellVersion') {
                            setState((state) => ({ ...state, version: value }));
                        }
                    });

                    transport.signals.forEach((signal) => {
                        LEGACY_IPC?.send(JSON.stringify({
                            id: messageId++,
                            type: ShellEventType.CONNECT_TO_SIGNAL,
                            object: QT_OBJECT_ID,
                            signal: signal[1],
                        }));
                    });

                    qtMethodRef.current = transport.methods.find(([name]) => name === 'onEvent')?.[1] ?? null;
                    send('app-ready');
                    return;
                }

                if (event.object === QT_OBJECT_ID && event.type === ShellEventType.SIGNAL) {
                    protocolRef.current = 'qt-channel';
                    events.emit(event.args[0], event.args[1]);
                }
            } catch (e) {
                console.error('Shell', 'Failed to handle legacy event', e);
            }
        };

        IPC?.postMessage(JSON.stringify({
            id: messageId++,
            type: ShellEventType.INIT,
        }));
        LEGACY_IPC?.send(JSON.stringify({
            id: messageId++,
            type: ShellEventType.INIT,
        }));

        IPC?.addEventListener('message', onMessage);
        if (LEGACY_IPC) LEGACY_IPC.onmessage = onLegacyMessage;

        return () => {
            IPC?.removeEventListener('message', onMessage);
            if (LEGACY_IPC) LEGACY_IPC.onmessage = () => { /* empty */ };
        };
    }, []);

    return {
        active: !!IPC || !!LEGACY_IPC,
        send,
        on,
        off,
        state,
    };
};

export default useShell;
