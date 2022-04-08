import { spawn as cpSpawn } from "child_process";
import * as path from "path";
import { PoolClient } from "pg";

export const dockerComposeCWD = path.join(__dirname, "../../../problem");

export function spawn(command: string, args: string[], options: Parameters<typeof cpSpawn>[2]): Promise<void> {
	return new Promise((resolve, reject) => {
        const fixedOptions = {
            ...options,
            env: {
                ...process.env,
                ...(options.env ?? {}),
            },
        }

		const proc = cpSpawn("/usr/bin/env", [command, ...args], fixedOptions);
        proc.stderr?.on("data", (d) => process.stderr.write(d))
		proc.on("exit", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(`spawn exited with non-zero exit code: ${code}`);
			}
		});
	});
}

export function sleep(time: number) {
	return new Promise((resolve) => setTimeout(resolve, time));
}

export async function countRunningJobs(client: PoolClient) {
    const result = await client.query<{ count: number }>(`
        SELECT count(*) as count FROM job
        WHERE completed_at is NULL
            AND expires_at is NOT NULL;
    `);

    const [{ count }] = result.rows;
    return count;
}

export async function countQueuedJobs(client: PoolClient) {
    const result = await client.query<{ count: number }>(`
        SELECT count(*) as count FROM job
        WHERE completed_at is NULL
            AND expires_at is NULL;
    `);

    const [{ count }] = result.rows;
    return count;
}