import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconTrashOutlineRegular, } from '@deepseek-ai/dsh-client-ui-primitives';
import { ModelInputTypes } from "./ModelInputTypes.js";
import styles from './ModelsSection.module.css';
/**
 * Render consistent model identity, capacity, and input-type controls.
 * @param props - drafted fields and their owning editor's actions.
 * @returns one expandable model entry.
 */
export function ModelRow(props) {
    const { model, position, t, disabled } = props;
    return (_jsxs("div", { className: styles['modelEntry'], children: [_jsxs("div", { className: styles['modelRow'], children: [['id', 'name'].map(field => (_jsx("input", { className: styles['input'], type: "text", value: typeof model[field] === 'string' ? model[field] : '', placeholder: t(field === 'id' ? 'modelId' : 'modelName'), "aria-label": `${t(field === 'id' ? 'modelId' : 'modelName')} ${String(position)}`, disabled: disabled, onChange: (event) => {
                            const value = event.target.value;
                            props.onFieldChange(field, field === 'name' && value === '' ? undefined : value);
                        }, onBlur: field === 'id' ? event => props.onIdBlur?.(event.target.value) : undefined }, field))), _jsx("button", { type: "button", className: styles['iconButton'], "aria-label": `${t('modelAdvanced')} ${String(position)}`, "aria-expanded": props.expanded, title: t('modelAdvanced'), onClick: props.onToggle, children: props.expanded ? _jsx(IconChevronDownOutlineRegular, {}) : _jsx(IconChevronRightOutlineRegular, {}) }), _jsx("button", { type: "button", className: `${styles['iconButton']} ${styles['iconButtonDanger']}`, "aria-label": `${t('removeModel')} ${String(position)}`, title: t('removeModel'), disabled: disabled, onClick: props.onRemove, children: _jsx(IconTrashOutlineRegular, { size: 14 }) })] }), props.expanded
                ? (_jsxs("div", { className: styles['modelAdvanced'], children: [['contextWindow', 'maxTokens'].map(field => (_jsxs("label", { className: styles['modelField'], children: [_jsx("span", { className: styles['modelFieldLabel'], children: t(field) }), _jsx("input", { className: styles['input'], type: "text", inputMode: "numeric", value: props[field].value, placeholder: props[field].placeholder, "aria-label": `${t(field)} ${String(position)}`, disabled: disabled, onChange: (event) => { props[field].onChange(event.target.value); }, onBlur: props[field].onBlur })] }, field))), _jsx(ModelInputTypes, { model: model, field: props.inputField, position: position, fallback: props.inputFallback, disabled: disabled || props.inputLoading === true, t: t, onChange: props.onChange })] }))
                : null] }));
}
//# sourceMappingURL=ModelRow.js.map