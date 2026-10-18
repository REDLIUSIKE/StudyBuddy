/**
 * Process streams the runner reads and writes, kept out of the package entry so
 * substituting them in tests adds no public package API. The shape matches the
 * runner's own IO carrier structurally.
 * @module @deepseek-ai/dsh-headless/runner-internals
 */
/** The process streams the runner reads and writes; tests substitute captures. */
export const internals = {
    stdout: process.stdout,
    stderr: process.stderr,
    readStdin: async () => {
        const chunks = [];
        for await (const chunk of process.stdin)
            chunks.push(chunk);
        return Buffer.concat(chunks).toString('utf8');
    },
};
//# sourceMappingURL=runner-internals.js.map