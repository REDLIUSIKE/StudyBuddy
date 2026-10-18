import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Paired artwork follows the page's light and dark theme selectors. */
import css from './DesktopOnboarding.module.css';
/** @param props - artwork URLs and feature-owned geometry. @returns decorative theme variants. */
export function OnboardingIllustration({ className = '', src, darkSrc }) {
    return _jsxs("div", { className: `${css.illustration} ${className}`, "aria-hidden": "true", children: [_jsx("img", { className: css.lightIllustration, src: src, alt: "" }), _jsx("img", { className: css.darkIllustration, src: darkSrc, alt: "" })] });
}
//# sourceMappingURL=OnboardingIllustration.js.map