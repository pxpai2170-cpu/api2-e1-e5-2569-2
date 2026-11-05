require('dotenv').config();
const mysql = require('mysql2/promise'); 
const pool = mysql.createPool({ 
  host: process.env.DB_HOST || 'localhost', 
  port: process.env.DB_PORT || 3306, 
  user: process.env.DB_USER || 'root', 
  password: process.env.DB_PASSWORD || '', 
  database: process.env.DB_NAME || 'bpes_db', 
  waitForConnections: true, 
  connectionLimit: 10 
});
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log("Database connection successful");
    connection.release();
  } catch (error) {
    console.error("Error connecting to the database:", error);
  }
}
testConnection();
module.exports = { pool };
