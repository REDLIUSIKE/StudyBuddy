import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import clientLazy from "./client-lazy";

describe("client lazy surfaces", () => {
  it("keeps the loading placeholder, forwards props and preserves the loaded component state", async () => {
    function Counter({ label }: { label: string }) {
      const [value, setValue] = useState(0);
      return <button onClick={() => setValue(value + 1)}>{label}: {value}</button>;
    }
    let resolve!: (component: typeof Counter) => void;
    const pending = new Promise<typeof Counter>(ready => { resolve = ready; });
    const Surface = clientLazy(() => pending, { ssr: false, loading: () => <p role="status">Loading editor…</p> });
    const view = render(<Surface label="Draft" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading editor…");
    await act(async () => { resolve(Counter); await pending; });
    fireEvent.click(await screen.findByRole("button", { name: "Draft: 0" }));
    view.rerender(<Surface label="Saved" />);
    expect(screen.getByRole("button", { name: "Saved: 1" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not import a browser-only module during standalone server rendering", () => {
    let started = false;
    const Surface = clientLazy(async () => { started = true; return () => <p>Editor</p>; }, {
      ssr: false, loading: () => <p role="status">Loading editor…</p>,
    });
    expect(renderToString(<Surface />)).toContain("Loading editor…");
    expect(started).toBe(false);
  });
});
