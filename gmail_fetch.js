
const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const mongoose = require('mongoose');
const Email = require('./models/email.js');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Lists the emails in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function listEmails(auth) {
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 10, // Adjust the number of emails to fetch
  });

  const messages = res.data.messages;
  if (!messages || messages.length === 0) {
    console.log('No emails found.');
    return;
  }
 
  console.log('Emails:');
  for (const message of messages) {
    const msg = await gmail.users.messages.get({
      userId: 'me',
      id: message.id,
    });
    await saveEmailToDatabase(msg.data);
  }
}

/**
 * Save email to MongoDB database.
 *
 * @param {Object} emailData The email data to save.
 */
async function saveEmailToDatabase(emailData) {
  try {
    const email = new Email({
      id: emailData.id,
      threadId: emailData.threadId,
      labelIds: emailData.labelIds,
      snippet: emailData.snippet,
      historyId: emailData.historyId,
      internalDate: emailData.internalDate,
      payload: emailData.payload,
      sizeEstimate: emailData.sizeEstimate,
      raw: emailData.raw,
      from: extractHeader(emailData.payload.headers, 'From'),
      receivedDate: new Date(parseInt(emailData.internalDate)),
      subject: extractHeader(emailData.payload.headers, 'Subject'),
      body: extractBody(emailData.payload),
    });
    await email.save();
    console.log(`Saved email with ID: ${emailData.id}`);
  } catch (err) {
    console.error(`Failed to save email with ID: ${emailData.id}`, err);
  }
}

/**
 * Extracts a specific header from the email headers.
 *
 * @param {Array} headers The headers array from the email payload.
 * @param {String} name The name of the header to extract.
 * @return {String} The value of the header.
 */
function extractHeader(headers, name) {
  const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return header ? header.value : '';
}

/**
 * Extracts the body of the email from the payload.
 *
 * @param {Object} payload The payload object from the email.
 * @return {String} The body of the email.
 */
function extractBody(payload) {
  let body = '';
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain') {
        body += Buffer.from(part.body.data, 'base64').toString('utf8');
      } else if (part.mimeType === 'text/html') {
        body += Buffer.from(part.body.data, 'base64').toString('utf8');
      }
    }
  } else {
    body = Buffer.from(payload.body.data, 'base64').toString('utf8');
  }
  return body;
}


  async function main() {
    await mongoose.connect('mongodb://127.0.0.1:27017/emails');
    console.log('Database connected');
}

main().catch(err => console.log(err));
