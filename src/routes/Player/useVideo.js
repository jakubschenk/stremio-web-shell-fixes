// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const Video = require('@stremio/stremio-video');
const EventEmitter = require('eventemitter3');
const {usePlatform, useStorage} = require('stremio/common');
const isoConv = require('iso-language-converter');

const events = new EventEmitter();

const useVideo = () => {
    const video = React.useRef(null);
    const containerElement = React.useRef(null);
    const [storage,] = useStorage();
    const { shell } = usePlatform();

    const [state, setState] = React.useState({
        manifest: null,
        stream: null,
        paused: null,
        time: null,
        duration: null,
        buffering: null,
        buffered: null,
        volume: 50,
        muted: null,
        playbackSpeed: null,
        videoParams: null,
        hdrInfo: null,
        audioTracks: [],
        selectedAudioTrackId: null,
        subtitlesTracks: [],
        selectedSubtitlesTrackId: null,
        subtitlesOffset: null,
        subtitlesSize: null,
        subtitlesDelay: null,
        subtitlesTextColor: null,
        subtitlesBackgroundColor: null,
        subtitlesOutlineColor: null,
        extraSubtitlesTracks: [],
        selectedExtraSubtitlesTrackId: null,
        extraSubtitlesSize: null,
        extraSubtitlesDelay: null,
        extraSubtitlesOffset: null,
        extraSubtitlesTextColor: null,
        extraSubtitlesBackgroundColor: null,
        extraSubtitlesOutlineColor: null,
        fullscreen: null,
    });

    const dispatch = (action, options) => {
        if (video.current && containerElement.current) {
            try {
                video.current.dispatch(action, {
                    ...options,
                    containerElement: containerElement.current,
                });
            } catch (error) {
                console.error('Video:', error);
            }
        }
    };

    const load = (args, options) => {
        dispatch({
            type: 'command',
            commandName: 'load',
            commandArgs: args
        }, options);
    };

    const unload = () => {
        dispatch({
            type: 'command',
            commandName: 'unload',
        });
    };

    const addExtraSubtitlesTracks = (tracks) => {
        if (shell.active && storage.useMpvForExternalSubtitles) {
            tracks.forEach((track) => {
                shell.send('mpv-command', ['sub-add', track.url, 'auto', `${track.origin} External`, track.lang]);
            });
            return;
        }
        dispatch({
            type: 'command',
            commandName: 'addExtraSubtitlesTracks',
            commandArgs: {
                tracks,
            },
        });
    };

    const addLocalSubtitles = (filename, buffer) => {
        dispatch({
            type: 'command',
            commandName: 'addLocalSubtitles',
            commandArgs: {
                filename,
                buffer,
            },
        });
    };

    const setProp = (name, value) => {
        dispatch({ type: 'setProp', propName: name, propValue: value });
    };

    const setPaused = (state) => {
        setProp('paused', state);
    };

    const setVolume = (volume) => {
        setProp('volume', volume);
    };

    const setMuted = (state) => {
        setProp('muted', state);
    };

    const setTime = (time) => {
        setProp('time', time);
    };

    const setPlaybackSpeed = (rate) => {
        setProp('playbackSpeed', rate);
    };

    const setAudioTrack = (id) => {
        setProp('selectedAudioTrackId', id);
    };

    const setSubtitlesTrack = (id) => {
        setProp('selectedSubtitlesTrackId', id);
        setProp('selectedExtraSubtitlesTrackId', null);
    };

    const setExtraSubtitlesTrack = (id) => {
        setProp('selectedSubtitlesTrackId', null);
        setProp('selectedExtraSubtitlesTrackId', id);
    };

    const setSubtitlesDelay = (delay) => {
        setProp('extraSubtitlesDelay', delay);
    };

    const setSubtitlesSize = (size) => {
        setProp('subtitlesSize', size);
        setProp('extraSubtitlesSize', size);
    };

    const setSubtitlesOffset = (offset) => {
        setProp('subtitlesOffset', offset);
        setProp('extraSubtitlesOffset', offset);
    };

    const setVideoScale = (scale) => {
        setProp('videoScale', scale);
    };

    const setFullscreen = (state) => {
        setProp('fullscreen', state);
    };

    const setSubtitlesTextColor = (color) => {
        setProp('subtitlesTextColor', color);
        setProp('extraSubtitlesTextColor', color);
    };

    const setSubtitlesBackgroundColor = (color) => {
        setProp('subtitlesBackgroundColor', color);
        setProp('extraSubtitlesBackgroundColor', color);
    };

    const setSubtitlesOutlineColor = (color) => {
        setProp('subtitlesOutlineColor', color);
        setProp('extraSubtitlesOutlineColor', color);
    };

    const onError = (error) => {
        events.emit('error', error);
    };

    const onEnded = () => {
        events.emit('ended');
    };

    const onSubtitlesTrackLoaded = (track) => {
        events.emit('subtitlesTrackLoaded', track);
    };

    const onExtraSubtitlesTrackLoaded = (track) => {
        events.emit('extraSubtitlesTrackLoaded', track);
    };

    const onExtraSubtitlesTrackAdded = (track) => {
        events.emit('extraSubtitlesTrackAdded', track);
    };

    const onPropChanged = (name, value) => {
        const allowedLanguagesMap = {
            audioTracks: storage.allowedAudioLanguages,
            subtitlesTracks: storage.allowedSubtitleLanguages,
            extraSubtitlesTracks: storage.allowedSubtitleLanguages,
        };
        const allowedLanguages = allowedLanguagesMap[name];
        if (Array.isArray(allowedLanguages) && allowedLanguages.length > 0) {
            if (!allowedLanguages.includes('any')) {
                value = value.filter((track) => {
                    return allowedLanguages.some((allowed) => track.lang === allowed || isoConv(track.lang) === isoConv(allowed));
                });
            }
            value = value.map((track) => ({
                ...track,
                lang: isoConv(track.lang, { to: 2 }) || track.lang,
            }));
        }
        setState((state) => ({
            ...state,
            [name]: value
        }));
    };

    const onImplementationChanged = (manifest) => {
        manifest.props.forEach((propName) => dispatch(({ type: 'observeProp', propName })));
        setState((state) => ({
            ...state,
            manifest
        }));

        events.emit('implementationChanged', manifest);
    };

    React.useEffect(() => {
        video.current = new Video();
        video.current.on('error', onError);
        video.current.on('ended', onEnded);
        video.current.on('propChanged', onPropChanged);
        video.current.on('propValue', onPropChanged);
        video.current.on('implementationChanged', onImplementationChanged);
        video.current.on('subtitlesTrackLoaded', onSubtitlesTrackLoaded);
        video.current.on('extraSubtitlesTrackLoaded', onExtraSubtitlesTrackLoaded);
        video.current.on('extraSubtitlesTrackAdded', onExtraSubtitlesTrackAdded);

        return () => {
            if (video.current) {
                try {
                    video.current.destroy();
                } catch (err) {
                    console.error('Error destroying video:', err);
                }
            }
        };
    }, []);

    return {
        events,
        containerElement,
        containerRef: containerElement,
        state,
        load,
        unload,
        addExtraSubtitlesTracks,
        addLocalSubtitles,
        setPaused,
        setVolume,
        setMuted,
        setTime,
        setPlaybackSpeed,
        setAudioTrack,
        setSubtitlesTrack,
        setSubtitlesDelay,
        setSubtitlesSize,
        setSubtitlesOffset,
        setSubtitlesTextColor,
        setSubtitlesBackgroundColor,
        setSubtitlesOutlineColor,
        setExtraSubtitlesTrack,
        setVideoScale,
        setFullscreen,
    };
};

module.exports = useVideo;
