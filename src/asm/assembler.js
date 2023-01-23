export class AsmToken {
    constructor(type, value, lineNumber, line) {
        this.type = type;
        this.value = value;
        this.lineNumber = lineNumber;
        this.line = line;
    }
}
``
export function tokenize(source) {
    if (!source || !source.length) {
        return [];
    }
    return source
        .split(/\r?\n/)
        .flatMap((line, lineNumber) => {
            if(!line.trim()) {
                return [['empty', lineNumber]];
            }
            if(line.trim().startsWith(';')) {
                return [['comment', line.trim(), lineNumber]];
            }
            const parts = line.split(';');
            const expr_spec = ['expr', parts[0].split(/\s+/), lineNumber];
            const comment_spec = parts.length > 1 ? ['comment', parts[1], lineNumber] : undefined;
            return comment_spec ? [expr_spec, comment_spec] : [expr_spec];
        }).reduce((state, tkn) => {
            const tknType = tkn[0];
            if(tknType === 'empty') {
                return {
                    tokens: [...state.tokens, new AsmToken('empty', '', tkn[1])],
                    block: state.block,
                }
            }
            if(tknType === 'comment') {
                return {
                    tokens: [...state.tokens, new AsmToken(...tkn)],
                    block: state.block,
                }
            }
            // handle expression
            const values = tkn[1];
            const lineNumber = tkn[2];
            const expr = values[0];
            const token = new AsmToken('', values, lineNumber);
            if(expr.startsWith('.')) {
                token.type = 'directive';
                return {
                    tokens: [...state.tokens, token],
                    block: `directive:${expr}`,
                }
            } else if(expr.endsWith(':')) {
                token.type = 'label';
                return {
                    tokens: [...state.tokens, token],
                    block: `label:${expr}`,
                }
            }
        }, {
            tokens: [],
            block: '',
        });
}

export function lines(source) {
    if (!source || !source.length) {
        return [];
    }
    return source.split(/\r?\n/);
}

export function parse(tokens, instructionsTable) {

}

export class Assembler {
    constructor(instructionTable) {
        this.instructionTable = instructionTable;
    }
}