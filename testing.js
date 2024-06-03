// const express = require('express');
// const path = require('path');
// const { authenticate } = require('@google-cloud/local-auth');
// const { google } = require('googleapis');
// const mongoose = require('mongoose');
// const fs = require('fs').promises;
// const Email = require('./models/email');

// const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
// const TOKEN_PATH = path.join(process.cwd(), 'token.json');
// const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

// const app = express();
// const PORT = 3000;

// // Serve static HTML file
// app.get('/', (req, res) => {
//   res.sendFile(path.join(__dirname, 'index.html'));
// });

// // Google OAuth2 route
// app.get('/auth/google', async (req, res) => {
//   const authUrl = await generateAuthUrl();
//   res.redirect(authUrl);
// });

// // Google OAuth2 callback route
// app.get('/auth/google/callback', async (req, res) => {
//   const code = req.query.code;
//   const client = await getClient();
//   const { tokens } = await client.getToken(code);
//   client.setCredentials(tokens);
//   await saveCredentials(client);
//   await listEmails(client);
//   res.send('Emails fetched and saved to the database.');
// });

// // Function to generate OAuth2 URL
// async function generateAuthUrl() {
//   const content = await fs.readFile(CREDENTIALS_PATH);
//   const keys = JSON.parse(content);
//   const { client_id, client_secret, redirect_uris } = keys.installed || keys.web;
//   const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
//   return oAuth2Client.generateAuthUrl({
//     access_type: 'offline',
//     scope: SCOPES,
//   });
// }

// // Function to get authenticated client
// async function getClient() {
//   const content = await fs.readFile(CREDENTIALS_PATH);
//   const keys = JSON.parse(content);
//   const { client_id, client_secret, redirect_uris } = keys.installed || keys.web;
//   return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
// }

// // Save credentials to token file
// async function saveCredentials(client) {
//   const payload = JSON.stringify(client.credentials);
//   await fs.writeFile(TOKEN_PATH, payload);
// }

// // List emails using Gmail API
// async function listEmails(auth) {
//   const gmail = google.gmail({ version: 'v1', auth });
//   const res = await gmail.users.messages.list({
//     userId: 'me',
//     maxResults: 10,
//   });

//   const messages = res.data.messages;
//   if (!messages || messages.length === 0) {
//     console.log('No emails found.');
//     return;
//   }

//   console.log('Emails:');
//   for (const message of messages) {
//     const msg = await gmail.users.messages.get({
//       userId: 'me',
//       id: message.id,
//     });
//     await saveEmailToDatabase(msg.data);
//   }
// }

// // Save email to MongoDB
// async function saveEmailToDatabase(emailData) {
//   try {
//     const email = new Email({
//       id: emailData.id,
//       threadId: emailData.threadId,
//       labelIds: emailData.labelIds,
//       snippet: emailData.snippet,
//       historyId: emailData.historyId,
//       internalDate: emailData.internalDate,
//       payload: emailData.payload,
//       sizeEstimate: emailData.sizeEstimate,
//       raw: emailData.raw,
//       from: extractHeader(emailData.payload.headers, 'From'),
//       receivedDate: new Date(parseInt(emailData.internalDate)),
//       subject: extractHeader(emailData.payload.headers, 'Subject'),
//       body: extractBody(emailData.payload),
//     });
//     await email.save();
//     console.log(`Saved email with ID: ${emailData.id}`);
//   } catch (err) {
//     console.error(`Failed to save email with ID: ${emailData.id}`, err);
//   }
// }

// // Extract specific header
// function extractHeader(headers, name) {
//   const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
//   return header ? header.value : '';
// }

// // Extract body from payload
// function extractBody(payload) {
//   let body = '';
//   if (payload.parts) {
//     for (const part of payload.parts) {
//       if (part.mimeType === 'text/plain') {
//         body += Buffer.from(part.body.data, 'base64').toString('utf8');
//       } else if (part.mimeType === 'text/html') {
//         body += Buffer.from(part.body.data, 'base64').toString('utf8');
//       }
//     }
//   } else {
//     body = Buffer.from(payload.body.data, 'base64').toString('utf8');
//   }
//   return body;
// }

// // Connect to MongoDB
// mongoose.connect('mongodb://127.0.0.1:27017/emails').then(() => {
//   console.log('Connected to MongoDB');
//   app.listen(PORT, () => {
//     console.log(`Server running at http://localhost:${PORT}`);
//   });
// }).catch(err => {
//   console.error('Failed to connect to MongoDB', err);
// });


const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const mongoose = require('mongoose');
const fs = require('fs').promises;
const Email = require('./models/email');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

const app = express();
const PORT = 3000;

// Serve static HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Google OAuth2 route
app.get('/auth/google', async (req, res) => {
  try {
    const authUrl = await generateAuthUrl();
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).send('Error generating auth URL');
  }
});

// Google OAuth2 callback route
app.get('/auth/google/callback', async (req, res) => {
  try {
    const code = req.query.code;
    const client = await getClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    await saveCredentials(client);
    await listEmails(client);
    res.send('Emails fetched and saved to the database.');
  } catch (error) {
    console.error('Error during authentication:', error);
    res.status(500).send('Error during authentication');
  }
});

// Function to generate OAuth2 URL
async function generateAuthUrl() {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const { client_id, client_secret, redirect_uris } = keys.installed || keys.web || {};
  if (!client_id || !client_secret || !redirect_uris) {
    throw new Error('Invalid credentials.json structure');
  }
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
}

// Function to get authenticated client
async function getClient() {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const { client_id, client_secret, redirect_uris } = keys.installed || keys.web || {};
  if (!client_id || !client_secret || !redirect_uris) {
    throw new Error('Invalid credentials.json structure');
  }
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

// Save credentials to token file
async function saveCredentials(client) {
  const payload = JSON.stringify(client.credentials);
  await fs.writeFile(TOKEN_PATH, payload);
}

// List emails using Gmail API
async function listEmails(auth) {
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 10,
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


async function saveEmailToDatabase(emailData) {
  try {
    let existingEmail=null;
      //find using id
    existingEmail =await Email.findOne({id:emailData.id});


    // If no email with the same internal date exists, save the email
    if (!existingEmail) {
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
    } else {
      // If an email with the same internal date exists, log a message and skip saving
      console.log(`Email with internal date ${emailData.internalDate} already exists. Skipping...`);
    }
  } catch (err) {
    console.error(`Failed to save email with ID: ${emailData.id}`, err);
  }
}

// Extract specific header
function extractHeader(headers, name) {
  const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return header ? header.value : '';
}

// Extract body from payload
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

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/emails').then(() => {
  console.log('Connected to MongoDB');
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB', err);
});
