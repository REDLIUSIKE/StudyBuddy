import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** Click-to-record toolbar activity; transcripts remain in the original Session draft. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { audioBase64 } from "./audio.js";
import { failureText } from "./failure-text.js";
import { Waveform } from "./Waveform.js";
import { VoiceSetupDialog } from "./VoiceSetupDialog.js";
import { Button, IconCloseOutlineRegular, IconStopFillRegular, IconMicrophoneOutlineRegular, StateDot, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './VoiceInput.module.css';
async function disposeRecording(capture) {
    try {
        await capture.dispose();
    }
    catch (_error) {
        // Tracks stop before AudioContext.close(); a close failure must not hide the recording result.
    }
}
/** Render a compact microphone or an expanded capture, transcription, or retry row. */
export function VoiceInput({ sessionId, inputActions, locked, onActiveChange, createRecording, transcribe, openSettings, useSpeechReadiness, t }) {
    const readiness = useSpeechReadiness(value => value), catalog = readiness.catalog;
    const provider = catalog?.providers.find(item => item.id === catalog.selection.providerId);
    const usable = readiness.connected && (provider?.preparation.phase === 'ready' || provider?.preparation.phase === 'standby'
        || provider?.preparation.phase === 'waking');
    const [phase, setPhase] = useState('idle'), [message, setMessage] = useState(''), [pending, setPending] = useState('');
    const [setupOpen, setSetupOpen] = useState(false);
    useEffect(() => { if (usable)
        setSetupOpen(false); }, [usable]);
    const current = useRef(), generation = useRef(0);
    const expanded = phase !== 'idle';
    useLayoutEffect(() => { onActiveChange(expanded); return () => { onActiveChange(false); }; }, [expanded, onActiveChange]);
    const cancel = () => {
        generation.current++;
        const active = current.current;
        current.current = undefined;
        if (active) {
            clearTimeout(active.timer);
            active.abort.abort();
            void disposeRecording(active.capture);
        }
        setPending('');
        setMessage('');
        setPhase('idle');
        setSetupOpen(false);
    };
    useEffect(() => {
        setPending('');
        setMessage('');
        setPhase('idle');
        setSetupOpen(false);
        const blur = () => { if (current.current?.phase === 'recording')
            cancel(); };
        const visibility = () => {
            if (document.hidden && current.current && current.current.phase !== 'transcribing')
                cancel();
        };
        const escape = (event) => {
            if (event.key === 'Escape' && current.current) {
                event.preventDefault();
                cancel();
            }
        };
        window.addEventListener('blur', blur);
        document.addEventListener('visibilitychange', visibility);
        document.addEventListener('keydown', escape);
        return () => {
            window.removeEventListener('blur', blur);
            document.removeEventListener('visibilitychange', visibility);
            document.removeEventListener('keydown', escape);
            generation.current++;
            const active = current.current;
            current.current = undefined;
            if (active) {
                clearTimeout(active.timer);
                active.abort.abort();
                void disposeRecording(active.capture);
            }
        };
    }, [sessionId]);
    const feedback = (text) => { setMessage(text); setPhase('feedback'); };
    const finish = async () => {
        const active = current.current;
        if (!active || active.phase !== 'recording')
            return;
        active.phase = 'transcribing';
        const run = generation.current;
        clearTimeout(active.timer);
        setPhase('transcribing');
        try {
            const audio = await active.capture.stop(active.maxDurationSeconds);
            if (run !== generation.current)
                return;
            if (audio.byteLength > active.maxAudioBytes) {
                feedback(t('tooLarge'));
                return;
            }
            const result = await transcribe({ audioBase64: audioBase64(audio), ...active.selection }, active.abort.signal);
            if (run !== generation.current)
                return;
            if (!result.ok) {
                feedback(t('failed', { message: result.error.message }));
                return;
            }
            if (result.value.text === '') {
                feedback(t('empty'));
                return;
            }
            if (!inputActions.insertText(result.value.text, active.span)) {
                setPending(result.value.text);
                feedback(t('conflict'));
                return;
            }
            setPhase('idle');
        }
        catch (failure) {
            await disposeRecording(active.capture);
            if (run === generation.current)
                feedback(failureText(failure, t));
        }
        finally {
            if (run === generation.current)
                current.current = undefined;
        }
    };
    const start = async () => {
        if (!catalog || !usable || locked || current.current)
            return;
        const run = ++generation.current;
        const active = { capture: createRecording(), abort: new AbortController(),
            span: inputActions.captureInsertion(), selection: catalog.selection,
            maxDurationSeconds: catalog.maxDurationSeconds, maxAudioBytes: catalog.maxAudioBytes, phase: 'requesting' };
        current.current = active;
        setMessage('');
        setPending('');
        setPhase('requesting');
        try {
            await active.capture.start((failure) => {
                if (run !== generation.current || current.current !== active || active.phase === 'transcribing')
                    return;
                current.current = undefined;
                clearTimeout(active.timer);
                active.abort.abort();
                feedback(failureText(failure, t));
            });
            if (run !== generation.current || current.current !== active)
                return;
            active.phase = 'recording';
            setPhase('recording');
            active.timer = setTimeout(() => { void finish(); }, active.maxDurationSeconds * 1000);
        }
        catch (failure) {
            await disposeRecording(active.capture);
            if (run === generation.current) {
                current.current = undefined;
                feedback(failureText(failure, t));
            }
        }
    };
    if (!expanded)
        return _jsxs(_Fragment, { children: [_jsx(Tooltip, { label: t('dictate'), disabled: !usable, side: "top", portal: true, children: _jsx("span", { className: css.triggerAnchor, children: _jsx(Button, { className: css.trigger, size: "sm", disabled: locked, "aria-label": t(usable ? 'start' : 'setupPrompt.trigger'), "aria-haspopup": usable ? undefined : 'dialog', onMouseDown: (event) => { event.preventDefault(); }, onClick: () => { if (usable)
                                void start();
                            else
                                setSetupOpen(true); }, children: _jsx(IconMicrophoneOutlineRegular, { size: 18 }) }) }) }), _jsx(VoiceSetupDialog, { open: setupOpen && !usable, needsInstallation: readiness.connected && provider?.location === 'host-local' && provider.preparation.phase === 'unprepared', onDismiss: () => { setSetupOpen(false); }, onOpenDetails: () => { setSetupOpen(false); openSettings(); }, t: t })] });
    return _jsxs("div", { className: css.captureRow, "data-voice-activity": phase, children: [_jsx(Button, { type: "button", className: css.roundButton, size: "sm", "aria-label": t(pending ? 'discard' : 'cancel'), onClick: cancel, children: _jsx(IconCloseOutlineRegular, { size: 14 }) }), phase === 'recording' ? _jsx(Waveform, { recording: current.current?.capture, label: t('recording') })
                : _jsxs("span", { className: css.activityMessage, role: "status", title: pending || message, children: [(phase === 'requesting' || phase === 'transcribing') && _jsx(StateDot, { state: "ongoing" }), phase === 'feedback' ? message : t(phase === 'requesting' ? 'requesting'
                            : provider?.preparation.phase === 'waking' ? 'wakingShort' : 'transcribingShort')] }), phase === 'recording' && _jsx(Button, { type: "button", className: css.roundButton, size: "sm", "aria-label": t('stop'), onClick: () => { void finish(); }, children: _jsx(IconStopFillRegular, { size: 14 }) }), phase === 'feedback' && (pending
                ? _jsx(Button, { className: css.inlineAction, size: "sm", type: "button", onClick: () => {
                        if (inputActions.insertText(pending, inputActions.captureInsertion())) {
                            setPending('');
                            setPhase('idle');
                        }
                    }, children: t('insert') })
                : _jsx(Button, { className: css.roundButton, size: "sm", type: "button", "aria-label": t('retryRecording'), disabled: !usable || locked, onClick: () => { void start(); }, children: _jsx(IconMicrophoneOutlineRegular, { size: 18 }) }))] });
}
//# sourceMappingURL=VoiceInput.js.map