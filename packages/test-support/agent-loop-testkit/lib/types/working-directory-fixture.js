/**
 * Supply fixed directory values without filesystem checks or durable changes.
 * @param ctx - context owning this test collaborator.
 * @param defaultDirectory - fallback for fixtures without a Session directory.
 */
export function provideWorkingDirectoryFixture(ctx, defaultDirectory = process.cwd()) {
    const get = (session) => session.header.cwd ?? defaultDirectory;
    ctx.provide('workingDirectory', {
        defaultDirectory,
        get,
        ensure: (agent) => Promise.resolve(get(agent.session)),
    });
}
//# sourceMappingURL=working-directory-fixture.js.map