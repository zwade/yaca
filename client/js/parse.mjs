// We could probably have lexed directly into the parse token, but
// this way we keep a bit more separation of church & state
const lexTokenToParseToken = (token) => {
    if (token === undefined) {
        return { kind: "EOF" };
    }

    switch (token.kind) {
        case "operator": {
            switch (token.value) {
                case "invert":   return { kind: "UNOP", value: token.value, precedence: 2 };
                case "subtract": return { kind: "MAYBE_UNOP", value: token.value, unopValue: "negate", precedence: 2 };
                case "exponent": return { kind: "BINOP", value: token.value, precedence: 0 };
                case "multiply": return { kind: "BINOP", value: token.value, precedence: 1 };
                case "divide":   return { kind: "BINOP", value: token.value, precedence: 1 };
                case "add":      return { kind: "BINOP", value: token.value, precedence: 2 };
                default: throw new Error(`Unknown operator ${token.value}`);
            }
        }
        case "open-paren": return { kind: "EXPR_START" };
        case "close-paren": return { kind: "EXPR_END" };
        case "number": return { kind: "VALUE", ast: { kind: "number", value: token.value } };
        case "variable": return { kind: "VALUE", ast: { kind: "variable", variable: token.value } };
        default: throw new Error(`Unknown token kind ${token.kind}`);
    }
}

const parseOne = (stack, lookahead) => {
    // If we can reduce a parenthetical expression, we want to
    if (stack[0]?.kind === "EXPR_END") {
        const [_end, value, _start, ...rest] = stack;

        if (stack[1]?.kind !== "VALUE" || stack[2]?.kind !== "EXPR_START") {
            throw new Error("Received unexpected close parenthesis");
        }

        return ["reduce", [value, ...rest]];
    }

    // Otherwise, all of our reductions occur on values
    if (stack[0]?.kind === "VALUE") {
        // If this value is a function call, we don't want to overeagerly reduce
        if (lookahead.kind === "VALUE" || lookahead.kind === "EXPR_START") {
            return ["shift"];
        }

        // Pure unops can be safely reduced now, but we have to do an additional check
        // for "maybe unops" such as "-" because it can either mean "negate" or "subtract"
        if (stack[1]?.kind === "UNOP"
            || (stack[1]?.kind === "MAYBE_UNOP" && stack[2]?.kind !== "VALUE")
        ) {
            const [value, unop, ...rest] = stack;
            const op = unop.kind === "MAYBE_UNOP" ? unop.unopValue : unop.value;
            const newValue = {
                ...value,
                ast: {
                    kind: "unop",
                    op,
                    value: value.ast
                }
            }
            return ["reduce", [newValue, ...rest]];
        }

        // We can now reduce binops, or "maybe unops", the latter of which must be binops at this point
        if (stack[1]?.kind === "BINOP" || stack[1]?.kind === "MAYBE_UNOP") {
            // We handle precedence checking when a value is surrounded by two binops
            // If the one to the right has a lower precedence (meaning it comes first), then we shift it in
            // instead of reducing the binop
            const shouldShift = lookahead.kind === "BINOP" && lookahead.precedence < stack[1].precedence;
            if (shouldShift) {
                return ["shift"];
            }

            if (stack[2]?.kind !== "VALUE") {
                throw new Error("Attempted to apply binary operation to non-value");
            }

            const [right, binop, left, ...rest] = stack;

            const newValue = {
                kind: "VALUE",
                ast: {
                    kind: "binop",
                    op: binop.value,
                    values: [
                        left.ast,
                        right.ast,
                    ]
                }
            };

            return ["reduce", [newValue, ...rest]];
        }

        // Our final reduction case is when you have two values one after another.
        // This can only occur during a function call, but since function binds right-to-left
        // we only want to start reducing once we hit the end of a parenthetical or the program
        if (stack[1]?.kind === "VALUE"
            && (lookahead.kind === "EXPR_END" || lookahead.kind === "EOF")
        ) {
            if (stack[1].ast.kind !== "variable") {
                throw new Error("Attempting to call non-function");
            }

            const [value, variable, ...rest] = stack;
            const name = variable.ast.variable;

            const newValue = {
                kind: "VALUE",
                ast: {
                    kind: "function",
                    name,
                    argument: value.ast
                }
            };

            return ["reduce", [newValue, ...rest]];
        }
    }

    // Otherwise, we have no reductions to do, so we shift in a new token
    return ["shift"];
}


export default (tokens) => {
    const queue = [...tokens];
    let stack = [];

    const maxIter = 1000;
    let iter = 0;

    while (queue.length > 0 || stack.length > 1) {
        // I haven't proven that this terminates so uh
        // Hopefully this will keep me from nuking anyone's chrome
        if (iter >= maxIter) {
            throw new Error("Timeout");
        }
        iter++;

        const lookahead = lexTokenToParseToken(queue[0]);
        const action = parseOne(stack, lookahead);

        if (action[0] === "shift") {
            if (lookahead.kind === "EOF") {
                throw new Error("Attempting to shift EOF, which indicates a malformed program");
            }

            queue.shift();
            stack.unshift(lookahead);
        } else if (action[0] === "reduce") {
            stack = action[1];
        }
    }

    // If we parsed correctly, we should be left with a single value
    // representing our final result
    if (stack[0]?.kind !== "VALUE") {
        throw new Error("Parser did not return a value");
    }

    return stack[0].ast;
}