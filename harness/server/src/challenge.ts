import { createHash, randomBytes } from "crypto";

import { pool, transaction } from "./db";
import { JobRequest } from "./types";
import { countQueuedJobs } from "./utils";

export interface Challenge {
	uid: string;
	prefix: string;
	difficulty: number;
}

async function getCurrentDifficulty() {
	const count = await transaction(countQueuedJobs);
	return Math.min(32, 16 + Math.floor(Math.log(count + 1)));
}

export async function generateChallenge(): Promise<Challenge> {
	let prefix = randomBytes(12).toString("hex");
	let difficulty = await getCurrentDifficulty();
	let result = await pool.query("INSERT INTO challenge (prefix, difficulty, deadline) VALUES ($1, $2, NOW() + interval '5 minutes') RETURNING *", [prefix, difficulty]);
	let { uid } = result.rows[0];
	return { uid, prefix, difficulty };
}

export async function validateChallenge(uid: string, response: string, job: JobRequest, socketId: string): Promise<[uid: string, port: number] | undefined> {
	return await transaction(async (client) => {
		let result = await client.query("SELECT * FROM challenge WHERE uid = $1 AND deadline > NOW() FOR UPDATE LIMIT 1", [uid]);

		if (result.rowCount !== 1) {
			throw new Error("Invalid challenge");
		}

		let task: { uid: string, prefix: string, difficulty: number } = result.rows[0];
		let resultBuffer = createHash("sha256").update(task.prefix).update(response).digest();
		let value = resultBuffer.readUInt32BE(0);
		value >>>= (32 - task.difficulty);

		await client.query("DELETE FROM challenge WHERE uid = $1", [uid]);

		if (value !== 0) {
			return;
		}

		const getPort = async (): Promise<number> => {
			const candidatePort = Math.floor(Math.random() * 30000 + 1024) * 2;

			const portExists = await client.query("SELECT * FROM port WHERE port = $1", [candidatePort]);
			if (portExists.rowCount !== 0) {
				return getPort();
			}

			return candidatePort;
		}

		const port = await getPort();

		let jobResult = await client.query<{ uid: string }>("INSERT INTO job (job, socket_id) VALUES ($1, $2) RETURNING uid", [job, socketId]);
		const jobUid = jobResult.rows[0].uid;
		await client.query("INSERT INTO port (job_uid, port) values ($1, $2)", [jobUid, port]);

		return [jobUid, port];
	});
}
