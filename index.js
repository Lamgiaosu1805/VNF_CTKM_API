require('dotenv').config();
const express = require('express')
const app = express()
const route = require('./src/routes')
const morgan = require('morgan')

//use middlewares
app.use(morgan('dev'))
app.use(express.json())
app.use(express.urlencoded({
    extended: true
}))

//jobs
require('./src/jobs')();

//routing
route(app);

const port = process.env.PORT || 3000

app.listen(port, () => {
  console.log(`App listening on port ${port} - ${process.env.ENV}`)
})