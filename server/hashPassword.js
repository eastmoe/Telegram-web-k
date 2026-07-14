const {hashPassword} = require('./auth');

const password = process.argv[2] || process.env.HTTP_AUTH_PASSWORD;
if(!password) {
  console.error('Usage: node server/hashPassword.js <password>');
  process.exitCode = 1;
} else {
  console.log(hashPassword(password));
}
