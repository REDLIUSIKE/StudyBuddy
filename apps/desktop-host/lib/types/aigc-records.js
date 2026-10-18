/** The original Vue cards consume text blocks, whose first line may be business JSON. */
export function aigcToolResultText(value) {
    const content = value && typeof value === 'object' && 'content' in value ? value.content : undefined;
    if (!Array.isArray(content))
        throw Error('AIGC_TOOL_RESULT_INVALID');
    return content.map(part => part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string' ? part.text : part?.type === 'image' ? '[image]' : '').filter(Boolean).join('\n');
}
export function nativeAigcRecords(agent) {
    const records = new Map();
    for (const event of agent.session.snapshotEvents().slice(-2000)) {
        if (event.type === 'tool/call') {
            let args = event.data.arguments;
            try {
                args = JSON.parse(event.data.arguments);
            }
            catch { /* Preserve malformed recorded text. */ }
            records.set(event.data.callId, { id: event.data.callId, name: event.data.name, args, status: 'running', nativeSessionId: agent.id });
        }
        if (event.type === 'tool/result') {
            const row = records.get(event.data.message.toolCallId);
            if (!row)
                continue;
            row.status = event.data.message.isError ? 'error' : 'success';
            const result = aigcToolResultText(event.data.message);
            row.result = Buffer.byteLength(result) <= 1024 * 1024 ? result : '结果较大，请在原生对话的记录中查看。';
        }
    }
    const output = [...records.values()].slice(-100);
    if (Buffer.byteLength(JSON.stringify(output)) > 8 * 1024 * 1024)
        throw Error('AIGC_PRESENTATION_TOO_LARGE');
    return output;
}
//# sourceMappingURL=aigc-records.js.map