/** Audio duration is a quantity, independent of the eight-decimal CNY contract. */
const durationScale = 1000000000n;
export function parseSpeechDurationSeconds(value) {
    if (typeof value !== 'string' || !/^(0|[1-9]\d{0,19})(\.\d{1,9})?$/.test(value)) {
        throw new TypeError('SPEECH_DURATION_INVALID');
    }
    return value;
}
export function sumSpeechDurationSeconds(values) {
    const total = values.reduce((sum, value) => {
        const [whole, fraction = ''] = parseSpeechDurationSeconds(value).split('.');
        return sum + BigInt(whole) * durationScale + BigInt(fraction.padEnd(9, '0'));
    }, 0n);
    const fraction = String(total % durationScale).padStart(9, '0').replace(/0+$/, '');
    return parseSpeechDurationSeconds(String(total / durationScale) + (fraction ? '.' + fraction : ''));
}
//# sourceMappingURL=speech-duration.js.map