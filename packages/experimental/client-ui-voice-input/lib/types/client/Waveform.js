import { jsx as _jsx } from "react/jsx-runtime";
/** Live microphone amplitude history; animation updates SVG geometry without React state churn. */
import { useEffect, useRef } from 'react';
import css from './VoiceInput.module.css';
/** Render recent measured microphone levels; silent audio remains a dotted baseline. */
export function Waveform({ recording, label }) {
    const svg = useRef(null);
    useEffect(() => {
        const bars = Array.from(svg.current.querySelectorAll('line')).reverse()
            .map(element => ({ element, level: 0 }));
        let frame, previous = -Infinity;
        const draw = (now) => {
            if (now - previous >= 50) {
                previous = now;
                let next = recording?.amplitude() ?? 0;
                for (const bar of bars) {
                    const previousLevel = bar.level;
                    bar.level = next;
                    next = previousLevel;
                    const height = 1 + Math.min(1, bar.level * 5) * 17;
                    bar.element.setAttribute('y1', String(20 - height));
                    bar.element.setAttribute('y2', String(20 + height));
                }
            }
            frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
        return () => { cancelAnimationFrame(frame); };
    }, [recording]);
    return _jsx("svg", { ref: svg, className: css.waveform, viewBox: "0 0 640 40", preserveAspectRatio: "none", role: "img", "aria-label": label, children: Array.from({ length: 80 }, (_, index) => _jsx("line", { x1: index * 8 + 4, x2: index * 8 + 4, y1: "19", y2: "21", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", opacity: 0.25 + index / 120 }, index)) });
}
//# sourceMappingURL=Waveform.js.map