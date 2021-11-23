import * as express from "express";
import * as fs from "fs-extra";
import * as path from "path";
import * as bodyParser from "body-parser";
import { v4 as uuid } from "uuid";

const cacheDir = path.join(__dirname, "../cache");
const clientDir = path.join(__dirname, "../client");

const main = async () => {
    await fs.ensureDir(cacheDir);

    const app = express();
    app.use(bodyParser.json());
    app.use((req, res, next) => {
        res.setHeader("Content-Security-Policy", "script-src 'self' 'unsafe-eval' 'unsafe-inline'");
        next();
    });

    app.get("/", (req, res) => {
        res.sendFile(path.join(clientDir, "index.html"));
    });

    app.post("/upload", async (req, res) => {
        if (typeof req.body !== "object") {
            return res.status(500).send("Bad payload");
        }

        const { type, program } = req.body;
        if (
            typeof type !== "string"
            || type.match(/^[a-zA-Z\-/]{3,}$/) === null
            || typeof program.name !== "string"
            || typeof program.code !== "string"
        ) {
            return res.status(500).send("Invalid program");
        }

        const sanitizedProgram =
            JSON.stringify(program)
                .replace("<", "&lt;")
                .replace(">", "&gt;");

        const templateBuf = await fs.readFile(path.join(clientDir, "calculator.hbs"));
        const template = templateBuf.toString("utf-8");
        const formattedFile =
            template
                .replace("{{ content-type }}", type)
                .replace("{{ program }}", sanitizedProgram);

        const fileName = `program-${uuid()}`;
        await fs.writeFile(path.join(cacheDir, fileName), formattedFile);

        res.send(`/program/${fileName}`);
    });

    app.get("/program/:file", async (req, res) => {
        const fileName = req.params.file;
        const filePath = path.join(cacheDir, fileName);

        res.type("html");
        res.sendFile(filePath);
    });

    app.use("/js", express.static(path.join(clientDir, "js")));
    app.use("/css", express.static(path.join(clientDir, "css")));

    app.listen(3838, () => {
        console.log("Listening on port 3838");
    });
}

main();


