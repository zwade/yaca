import * as bl from "beautiful-log";
import express from "express";
import { Server } from "http";
import eba from "express-basic-auth";
import nconf from "nconf";
import { M, marshal, Marshaller } from "@zensors/sheriff";
import { JobRequest, SocketState, SocketWithState } from "./types";
import { generateChallenge, validateChallenge } from "./challenge";

import { Server as SocketIoServer} from "socket.io";

import { transaction } from "./db";
import { startWorkers } from "./workers";
import { runAutovacWorker } from "./autovac";
import { countQueuedJobs } from "./utils";

nconf.argv().env();
const PORT = nconf.get("PORT") ?? 1064;
const MAX_WORKERS = parseInt(nconf.get("MAX_WORKERS") ?? "4", 10);
const TARGET_HOST = nconf.get("TARGET_IP") ?? "127.0.0.1";
const ACCESS_PASSWORD = nconf.get("ACCESS_PASSWORD");

bl.init("frontend", "console");
const log = bl.make("top");

const app = express();

if (ACCESS_PASSWORD !== undefined) {
	app.use(eba({ challenge: true, users: { "ppp": ACCESS_PASSWORD }}));
}

const httpServer = new Server(app);
const io = new SocketIoServer(httpServer);

function defineSocketHandler<K extends SocketState.Kind, T>(
	socket: SocketWithState,
	name: string,
	kind: K,
	marshaller: Marshaller<T>,
	fn: (socket: SocketWithState, state: SocketState & { kind: K }, arg: T) => Promise<void>
) {
	socket.on(name, async (arg: unknown) => {
		if (socket.state.kind !== kind) {
			socket.emit("error", "invalid socket state");
			socket.disconnect();
			return;
		}

		try {
			marshal(arg, marshaller);
			await fn(socket, socket.state as SocketState & { kind: K }, arg);
		} catch (err) {
			log.error(err);
			socket.emit("error", "something went wrong");
			socket.disconnect();
		}
	});
}

io.on("connection", (socket: SocketWithState) => {
	socket.state = { kind: SocketState.Kind.Waiting };

	defineSocketHandler(socket, "submitJob", SocketState.Kind.Waiting, JobRequest.Marshaller, async (socket, state, request) => {
		const challenge = await generateChallenge();
		socket.state = { kind: SocketState.Kind.Challenge, request, challenge };
		socket.emit("challenge", challenge);
	});

	defineSocketHandler(socket, "submitChallenge", SocketState.Kind.Challenge, M.str, async (socket, state, response) => {
		const result = await validateChallenge(state.challenge.uid, response, state.request, socket.id);

		if (result === undefined) {
			throw new Error("invalid challenge response");
		}

		const [uid, port] = result;

		socket.state = { kind: SocketState.Kind.Queued, request: state.request, jobUid: uid };
		socket.emit("queued", port);

		const updatePosition = async () => {
			if (socket.state.kind !== SocketState.Kind.Queued) {
				return;
			}

			const count = await transaction(countQueuedJobs);
			socket.emit("position", count - 1); // It will always count itself
			setTimeout(updatePosition, 5000);
		}

		updatePosition();
	});
});

app.use(express.static("public"));

httpServer.listen(PORT, () => {
	console.log(`Listening on ${PORT}`);
	startWorkers(MAX_WORKERS, io);
	runAutovacWorker(io);
});
