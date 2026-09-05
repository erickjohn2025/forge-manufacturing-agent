import { Pool } from "pg";

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "manufacturing_db",
  password: "Abdully94",
  port: 5432,
});

export default pool;