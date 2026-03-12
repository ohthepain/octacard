import { Client } from "pg";
import { buildPgConnectionConfig } from "../server/db-connection.js";

const client = new Client(buildPgConnectionConfig());
await client.connect();
await client.query("SELECT 1");
await client.end();
