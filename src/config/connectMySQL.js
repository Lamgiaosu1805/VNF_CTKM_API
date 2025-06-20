const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: process.env.HOST,
  user: 'vnfite_4',
  password: process.env.PASSWORD,
  database: 'TIKLUY_V1'
});

connection.connect(err => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  console.log('Connected to MySQL database');
});

module.exports = connection;