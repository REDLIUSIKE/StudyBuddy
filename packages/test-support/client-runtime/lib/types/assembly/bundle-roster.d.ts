import { ClientRoster } from './roster.ts';
/** The `web` profile's bundle layers, in the order `dsh --profile web` applies them (app-boot `PROFILE_TEMPLATES.web`). */
export declare const WEB_PROFILE_BUNDLES: readonly string[];
/**
 * Compose the browser roster of `bundles`, applied in order.
 * @param bundles - bundle package names in application order.
 * @param anchor - file whose package resolution locates the bundles; default this package.
 * @param disabledContext - optional Loader evaluation scope for trusted `disabled` expressions.
 * @returns the roster in composition order, one row per package.
 * @throws {Error} when a bundle, its patch file, or an enabled row's package does not resolve, when the patch list
 * is not a list or does not apply as written, or when a browser row has an unevaluated `disabled` expression.
 */
export declare function bundleRoster(bundles: readonly string[], anchor?: string, disabledContext?: object): ClientRoster;
/** The `web` profile's browser roster, composed with its profile name and no business Host services. */
export declare const webApp: ClientRoster;
//# sourceMappingURL=bundle-roster.d.ts.map