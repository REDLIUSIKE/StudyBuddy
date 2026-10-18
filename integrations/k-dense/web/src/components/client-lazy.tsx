"use client";

import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";

/** The existing surface loaders, with no framework runtime in the browser. */
export default function clientLazy<Props extends object>(
  loader: () => Promise<ComponentType<Props>>,
  options: { loading?: ComponentType; ssr?: boolean } = {},
): ComponentType<Props> {
  const Surface = lazy(async () => ({ default: await loader() }));
  const Loading = options.loading;
  return function ClientLazy(props: Props) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    const fallback = Loading ? <Loading /> : null;
    if (options.ssr === false && !mounted) return fallback;
    return <Suspense fallback={fallback}><Surface {...props} /></Suspense>;
  };
}
