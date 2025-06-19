const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: '42.113.122.155',
  user: 'vnfite_4',
  password: 'Vnfite20240712!@#',
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