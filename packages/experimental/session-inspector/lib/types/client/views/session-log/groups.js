/** Turn and Step start/end ranges add ancestry without inventing or reordering log records. */
/** One ordered pass over the loaded log; missing starts do not create synthetic headers. */
export class SessionLogGroups {
    turn;
    step;
    /**
     * Place a record inside its open Step or Turn, retaining end records as the final children.
     * Turn and Step headers remain expanded after their end; manual folding stays table-local.
     * @param row - Ungrouped event row.
     * @param event - Original event.
     * @returns The same row identity with range ancestry and depth.
     */
    append(row, event) {
        switch (event.type) {
            case 'turn/start':
                this.step = undefined;
                this.turn = { ...row, disclosure: 'open' };
                return this.turn;
            case 'step/start':
                this.step = { ...this.child(row, this.turn), disclosure: 'open' };
                return this.step;
            case 'step/end': {
                const result = this.child(row, this.step ?? this.turn);
                this.step = undefined;
                return result;
            }
            case 'turn/end': {
                const result = this.child(row, this.turn);
                this.step = undefined;
                this.turn = undefined;
                return result;
            }
            default:
                // Other merge-extensible events inherit the open range.
                return this.child(row, this.step ?? this.turn);
        }
    }
    child(row, parent) {
        return parent === undefined ? row : { ...row, parent: parent.key, depth: parent.depth + 1 };
    }
}
//# sourceMappingURL=groups.js.map