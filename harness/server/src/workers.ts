import * as bl from "beautiful-log";
import { Server } from "socket.io";
import { randomBytes } from "crypto";

import { transaction } from "./db";
import { JobRequest, JobResponse, SocketState, SocketWithState } from "./types";
import { spawn, sleep, dockerComposeCWD, countRunningJobs } from "./utils";

const LAUNCH_DELAY = 2000;
const TIMEOUT = 15 * 60 * 1000;

const MAX_INSTANCES = 32;
const TARGET_HOST = process.env.TARGET_HOST ?? "http://localhost";

const log = bl.make("workers");

export function startWorkers(count: number, io: Server) {
	for (let i = 0; i < count; i++) {
		worker(i, io);
	}
}

async function worker(index: number, io: Server) {
	while (true) {
		try {
			let jobCompleted = await transaction(async (client) => {
				const runningJobs = await countRunningJobs(client);
				if (runningJobs >= MAX_INSTANCES) {
					return false;
				}

				let jobResult = await client.query<{ uid: string, job: JobRequest, socket_id: string }>(`
					SELECT uid, job, socket_id
					FROM job
					WHERE completed_at IS NULL
						AND expires_at IS NULL
					ORDER BY created_at
					LIMIT 1
					FOR UPDATE SKIP LOCKED
				`);

				if (jobResult.rowCount !== 1) {
					return false;
				}

				let { uid, job, socket_id: socketId } = jobResult.rows[0];

				const portResult = await client.query<{ port: number }>(`
					SELECT port
					FROM port
					WHERE job_uid = $1
				`, [uid]);

				if (portResult.rowCount !== 1) {
					log.error(`Port was not allocated for: ${uid}`);
					return false;
				}

				const { port } = portResult.rows[0];

				const socket = io.sockets.sockets.get(socketId) as SocketWithState;

				if (!socket) {
					log(`[worker ${index}] Skipping job because socket is no longer connected.`);
					await client.query(`
						UPDATE job
						SET expires_at = NOW()
						WHERE uid = $1
					`, [uid]);
					return true;

				}

				await client.query("UPDATE job SET expires_at = NOW() + interval '15 minutes' WHERE uid = $1", [uid]);
				socket.once("disconnect", () =>
					transaction((innerClient) =>
						innerClient.query(`
							UPDATE job
							SET expires_at = NOW()
							WHERE uid = $1
						`, [uid])
					)
				);

				try {
					await doJob(uid, port, job, socket);
				} catch (e) {
					log.error(e);

					await client.query(`
						UPDATE job
						SET expires_at = NOW()
						WHERE uid = $1
					`, [uid]);
				}
				return true;
			});

			if (!jobCompleted) {
				await sleep(1000);
			} else {
				log(`[worker ${index}] Job started! Looking for a new job.`);
			}
		} catch (err) {
			log.error(err);
		}
	}
}

async function doJob(jobUid: string, port: number, job: JobRequest, socket: SocketWithState) {
	log(`[job ${jobUid}] Launching instance on port <cyan>${port}</cyan>.`);

	const searchConsolePort = port;

	const env = {
		PORT: searchConsolePort.toString(),
		FLAG: process.env.FLAG
	};

	const url = new URL(TARGET_HOST);
	url.port = searchConsolePort.toString();

	const response: JobResponse = {
		url: url.toString(),
	};

	socket.state = {
		kind: SocketState.Kind.Accepted,
		request: job,
		response,
		launchingAt: Date.now() + LAUNCH_DELAY
	};
	socket.emit("accepted", { response: socket.state.response, launchingAt: socket.state.launchingAt });

	await sleep(LAUNCH_DELAY);

	await spawn(
		"docker-compose",
		["-p", `problem_harness_${jobUid}`, "up", "-d", "--no-build"], // You MUST build the containers on the host before starting
		{
			cwd: dockerComposeCWD,
			stdio: ["ignore", process.stdout, process.stderr],
			env
		}
	);

	socket.state = {
		kind: SocketState.Kind.Processing,
		request: job,
		response,
		until: Date.now() + TIMEOUT
	};
	socket.emit("processing", { response: socket.state.response, until: socket.state.until });

	log(`[job ${jobUid}] Instance is up, waiting for ${TIMEOUT}ms.`);
}
