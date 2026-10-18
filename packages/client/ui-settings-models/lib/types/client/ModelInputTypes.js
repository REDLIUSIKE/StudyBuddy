import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Checkbox } from '@deepseek-ai/dsh-client-ui-primitives';
import styles from './ModelsSection.module.css';
/**
 * Edit a nonempty set of input types, displaying inherited types before an override exists.
 * @param props - model declaration and row replacement action.
 * @returns the labeled text and image checkboxes.
 */
export function ModelInputTypes({ model, field, position, disabled, fallback, t, onChange }) {
    const modalities = model[field];
    const selected = Array.isArray(modalities) && modalities.length > 0 ? modalities : fallback ?? ['text'];
    return (_jsxs("fieldset", { className: styles['modelInputTypes'], "aria-label": `${t('modelInputTypes')} ${String(position)}`, children: [_jsx("legend", { className: styles['modelFieldLabel'], children: t('modelInputTypes') }), _jsx("div", { className: styles['modelInputChoices'], children: ['text', 'image'].map(modality => (_jsx(Checkbox, { label: t(modality === 'text' ? 'modelInputText' : 'modelInputImage'), checked: selected.includes(modality), disabled: disabled || (selected.length === 1 && selected.includes(modality)), onChange: (checked) => {
                        const nextSelected = ['text', 'image'].filter(value => value === modality ? checked : selected.includes(value));
                        const next = { ...model, [field]: nextSelected };
                        // DeepSeek rejects image request limits on a text-only model.
                        if (field === 'inputModalities' && !nextSelected.includes('image')) {
                            Reflect.deleteProperty(next, 'imagePixelBudget');
                            Reflect.deleteProperty(next, 'imageMaxBytes');
                        }
                        onChange(next);
                    } }, modality))) })] }));
}
//# sourceMappingURL=ModelInputTypes.js.map