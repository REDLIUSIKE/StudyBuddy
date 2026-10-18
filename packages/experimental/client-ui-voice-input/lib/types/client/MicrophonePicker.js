import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Device selection owns microphone previews while its page is active. */
import { useEffect, useRef, useState } from 'react';
import { RecordingError } from "./audio.js";
import { failureText } from "./failure-text.js";
import css from './VoiceInput.module.css';
function InputLevel({ recording, label }) {
    const meter = useRef(null);
    useEffect(() => {
        const bars = Array.from(meter.current.children);
        let frame;
        const draw = () => {
            const decibels = 20 * Math.log10(Math.max(recording.amplitude(), 0.00001));
            const count = Math.ceil(Math.max(0, Math.min(1, (decibels + 60) / 60)) * bars.length);
            for (const [index, bar] of bars.entries())
                bar.setAttribute('data-active', String(index < count));
            frame = requestAnimationFrame(draw);
        };
        draw();
        return () => { cancelAnimationFrame(frame); };
    }, [recording]);
    return _jsx("span", { ref: meter, className: css.inputLevel, role: "img", "aria-label": label, children: Array.from({ length: 8 }, (_, index) => _jsx("span", {}, index)) });
}
/** Render the selected input and preview its measured level without recording audio. */
export function MicrophonePicker({ useMicrophoneDevice, selectMicrophone, createRecording, t }) {
    const selected = useMicrophoneDevice(value => value);
    const [devices, setDevices] = useState([
        { id: selected.id, label: selected.id === '' ? '' : selected.label },
    ]);
    const [preview, setPreview] = useState(), [error, setError] = useState();
    useEffect(() => {
        const media = navigator.mediaDevices;
        const lifetime = new AbortController();
        let capture, enumeration = 0;
        const release = () => {
            if (capture)
                void capture.dispose().catch(() => undefined);
            capture = undefined;
        };
        setPreview(undefined);
        setError(undefined);
        const fail = (failure) => {
            if (lifetime.signal.aborted)
                return;
            setError({ failure });
        };
        const acquire = async () => {
            const recording = createRecording();
            capture = recording;
            const interrupted = (failure) => {
                if (capture !== recording || lifetime.signal.aborted)
                    return;
                release();
                setPreview(undefined);
                fail(failure);
                void refresh();
            };
            try {
                await recording.preview(interrupted);
                if (capture !== recording || lifetime.signal.aborted)
                    return;
                setPreview(recording);
                setError(undefined);
                void refresh();
            }
            catch (failure) {
                if (capture !== recording || lifetime.signal.aborted)
                    return;
                release();
                setPreview(undefined);
                fail(failure);
            }
        };
        const refresh = async () => {
            const request = ++enumeration;
            try {
                if (!media)
                    throw new RecordingError('unavailable');
                const inputs = (await media.enumerateDevices()).filter(device => device.kind === 'audioinput');
                if (lifetime.signal.aborted || request !== enumeration)
                    return;
                // Before permission, browsers may hide device ids and labels; absence then does not establish disconnection.
                const known = inputs.length === 0 || inputs.some(device => device.label !== '');
                const missing = selected.id === '' ? inputs.length === 0 : known && !inputs.some(device => device.deviceId === selected.id);
                const system = inputs.find(device => device.deviceId === 'default');
                const activeDefault = selected.id === '' ? capture?.deviceInfo() : undefined;
                const groupId = activeDefault?.groupId || system?.groupId;
                const physicalDefault = groupId ? inputs.find(device => device.groupId === groupId
                    && device.deviceId !== 'default' && device.deviceId !== 'communications') : undefined;
                const defaultLabel = physicalDefault?.label || activeDefault?.label || system?.label || '';
                // Our system row replaces default; communications keeps the OS's separate default communications input.
                const choices = [{ id: '', label: defaultLabel, unavailable: inputs.length === 0 },
                    ...inputs.filter(device => device.deviceId !== '' && device.deviceId !== 'default').map(device => ({
                        id: device.deviceId, label: device.label,
                    }))];
                setDevices((previous) => {
                    const next = [...choices];
                    if (selected.id !== '' && !next.some(device => device.id === selected.id)) {
                        const knownDevice = previous.find(device => device.id === selected.id);
                        next.splice(Math.max(1, previous.findIndex(device => device.id === selected.id)), 0, { id: selected.id, label: knownDevice?.label ?? '', unavailable: missing });
                    }
                    return next;
                });
                if (missing) {
                    release();
                    setPreview(undefined);
                    setError(undefined);
                }
                else if (!document.hidden && !capture)
                    void acquire();
            }
            catch (failure) {
                if (request === enumeration)
                    fail(failure);
            }
        };
        const changed = () => { void refresh(); };
        const hidden = () => {
            if (document.hidden) {
                release();
                setPreview(undefined);
            }
            else
                changed();
        };
        media?.addEventListener('devicechange', changed, { signal: lifetime.signal });
        document.addEventListener('visibilitychange', hidden, { signal: lifetime.signal });
        changed();
        return () => {
            lifetime.abort();
            release();
        };
    }, [selected.id, createRecording]);
    const choices = devices.filter(device => !device.unavailable || device.id === selected.id || device.id === '');
    const missing = choices.find(device => device.id === selected.id)?.unavailable;
    const deviceName = (device, index) => {
        if (device.id === '')
            return device.label ? t('systemMicrophoneNamed', { name: device.label }) : t('systemMicrophone');
        return device.label || (device.id === selected.id ? selected.label : '')
            || (index > 0 ? t('unnamedMicrophone', { number: String(index) }) : t('unnamedSelectedMicrophone'));
    };
    return _jsxs("div", { className: css.deviceRow, "data-voice-input-device": true, children: [_jsx("label", { htmlFor: "voice-input-device", children: t('inputDevice') }), _jsxs("span", { className: css.deviceField, children: [_jsx("select", { id: "voice-input-device", value: selected.id, className: preview ? css.deviceSelectMeter : undefined, onChange: (event) => {
                            const device = choices.find(item => item.id === event.target.value);
                            selectMicrophone({ id: device.id, label: device.id === '' ? '' : device.label });
                        }, children: choices.map((device, index) => _jsxs("option", { value: device.id, disabled: device.unavailable, children: [deviceName(device, index), device.unavailable ? ` — ${t('deviceUnavailable')}` : ''] }, device.id)) }), preview && !missing && _jsx("span", { className: css.deviceMeter, children: _jsx(InputLevel, { recording: preview, label: t('inputLevel') }) })] }), error && _jsx("span", { className: css.deviceError, role: "alert", children: failureText(error.failure, t) })] });
}
//# sourceMappingURL=MicrophonePicker.js.map