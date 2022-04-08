import * as bl from "beautiful-log";
import { Server } from "socket.io";

import { transaction } from "./db"
import { SocketState, SocketWithState } from "./types";
import { dockerComposeCWD, sleep, spawn } from "./utils";

const log = bl.make("autovac");

export const runAutovacWorker = async (io: Server) => {
    const runOnce = () =>
        transaction(async (client) => {
            const toKill = await client.query<{ uid: string, socket_id: string }>(`
                SELECT uid, socket_id
                FROM job
                WHERE completed_at IS NULL
                    AND expires_at IS NOT NULL
                    AND expires_at < NOW()
                LIMIT 1
                FOR UPDATE SKIP LOCKED;
            `);

            if (toKill.rowCount === 0) {
                await sleep(1000);
                return;
            }

            const uid = toKill.rows[0].uid;
            const socket = io.sockets.sockets.get(toKill.rows[0].socket_id) as SocketWithState;
            await kill(uid, socket);

            await client.query(`
                UPDATE job
                SET completed_at = NOW()
                WHERE uid = $1
            `, [uid]);
        });

    while (true) {
        await runOnce();
    }
}

const kill = async (jobUid: string, socket: SocketWithState) => {
	try {
		log(`[job ${jobUid}] Killing the instance.`);
		await spawn(
			"docker-compose",
			["-p", `problem_harness_${jobUid}`, "down", "-t", "0"],
			{
				cwd: dockerComposeCWD,
				stdio: ["ignore", process.stdout, process.stderr],
				env: {},
			}
		);
		socket.state = { kind: SocketState.Kind.Waiting };
		socket.emit("done");
	} catch (err) {
		// Guess it was already dead /shrug
	}
}