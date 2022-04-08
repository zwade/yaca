CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE challenge (
	uid uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
	prefix text NOT NULL,
	difficulty int NOT NULL,
	deadline timestamp NOT NULL
);

CREATE TABLE job (
	uid uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
	job json NOT NULL,
	socket_id text NOT NULL,
	created_at timestamp NOT NULL DEFAULT NOW(),
	expires_at timestamp,
	completed_at timestamp
);

CREATE TABLE port (
	job_uid uuid REFERENCES job (uid),
	port int UNIQUE NOT NULL,
	PRIMARY KEY (job_uid, port)
);