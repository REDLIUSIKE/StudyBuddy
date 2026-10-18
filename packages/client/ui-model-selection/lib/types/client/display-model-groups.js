import { isPersonalModelProvider, orderModelProviders } from "./provider-order.js";
/** Build menu groups without changing the Host catalog or selection authority.
 * @param groups - Original available providers and their exact model entries.
 * @param t - Model namespace translator for fixed section headings.
 * @returns Platform groups followed by one personal section using saved source names. */
export function displayModelGroups(groups, t) {
    const result = [];
    const personal = { id: 'studybuddy-personal-models', name: t('provider.personal'), models: [] };
    for (const group of orderModelProviders(groups)) {
        const owned = isPersonalModelProvider(group.id);
        const models = group.models.map(model => ({
            provider: group.id, id: model.id, model,
            name: owned ? `${group.name} ${model.name}` : model.name,
            label: owned ? group.models.length === 1 ? group.name : `${group.name} · ${model.name}` : model.name,
        }));
        if (owned)
            personal.models.push(...models);
        else
            result.push({
                id: group.id, name: group.id === 'deepseek-account' ? t('provider.account') : group.name, models,
            });
    }
    if (personal.models.length > 0)
        result.push(personal);
    return result;
}
//# sourceMappingURL=display-model-groups.js.map