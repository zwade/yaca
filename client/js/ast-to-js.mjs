const allowedMathFunctions = new Set([
    "abs",
    "acos",
    "asin",
    "atan",
    "cos",
    "sin",
    "tan",
    "ceil",
    "floor",
    "exp",
    "log",
    "log2",
    "log10",
    "sqrt",
]);

export default function astToJs(ast) {
    switch (ast.kind) {
        case "number": {
            if (typeof ast.value !== "number") {
                throw new Error("Number is of the wrong type");
            }

            return {
                code: `${ast.value}`,
                variables: new Set(),
            };
        }
        case "variable": {
            if (!ast.variable.match(/^[a-z]+$/)) {
                throw new Error("Invalid variable name");
            }

            const name = `var_${ast.variable}`;

            return {
                code: name,
                variables: new Set([name]),
            }
        }
        case "function": {
            const { name, argument } = ast;
            const { code: argumentCode, variables } = astToJs(argument);

            if (!allowedMathFunctions.has(name)) {
                throw new Error("Invalid function name");
            }

            const code = `Math.${name}(${argumentCode})`;

            return { code, variables };
        }
        case "unop": {
            const { code: nestedCode, variables } = astToJs(ast.value);
            const op =
                ast.op === "negate" ? "-" :
                ast.op === "invert" ? "~" :
                null;

            if (op === null) {
                throw new Error("Invalid unary operator");
            }

            const code = `${op}(${nestedCode})`;
            return { code, variables };
        }
        case "binop":
        {
            const [left, right] = ast.values;
            const leftResult = astToJs(left);
            const rightResult = astToJs(right);
            const op =
                ast.op === "add" ? "+" :
                ast.op === "subtract" ? "-" :
                ast.op === "multiply" ? "*" :
                ast.op === "divide" ? "/" :
                ast.op === "exponent" ? "**" :
                null; // null: never

            if (op === null) {
                throw new Error("Invalid binary operator");
            }

            return {
                code: `(${leftResult.code} ${op} ${rightResult.code})`,
                variables: new Set([...leftResult.variables, ...rightResult.variables]),
            }
        }
        default: {
            throw new Error(`Unknown ast kind: ${ast.kind}`);
        }
    }
}