const React = require('react');
const { usePlatform } = require('stremio/common');

const PipHandler = () => {
    const { shell } = usePlatform();

    const style = {
        position: 'fixed',
        top: 0,
        left: '0%',
        width: '100%',
        height: '25px',
        cursor: 'move',
        zIndex: 9999,
        backgroundColor: 'transparent',
        display: 'none'
    };

    const handleMouseDown = (event) => {
        if (event.button === 0) {
            shell.send('start-drag', {});
        }
    };

    return <div id="pip-overlay" style={style} onMouseDown={handleMouseDown} />;
};

PipHandler.displayName = 'PipHandler';

module.exports = PipHandler;
