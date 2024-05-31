import { Boom } from '@hapi/boom';
import Baileys, {
  DisconnectReason,
  delay,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import pino from 'pino'
import PastebinAPI from 'pastebin-js';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
let pastebin = new PastebinAPI('EMWTMkQAVfJa9kM-MRUrxd5Oku1U7pgL');

const app = express();

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(cors());
let PORT = process.env.PORT || 8000;
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const sessionFolder = path.join(__dirname, 'auth');

try {
  if (!fs.existsSync(sessionFolder)) {
    fs.mkdirSync(sessionFolder);
    console.log(`Created the "${sessionFolder}" folder.`);
  } else {
    console.log(`The "${sessionFolder}" folder already exists.`);
  }
} catch (err) {
  console.error(`Error creating the "${sessionFolder}" folder:`, err);
  // Handle the error or exit the process
}

let clearState = () => {
  fs.rmdirSync(sessionFolder, { recursive: true });
};

function deleteSessionFolder() {
  if (!fs.existsSync(sessionFolder)) {
    console.log('The "SESSION" folder does not exist.');
    return;
  }

  try {
    fs.rmdirSync(sessionFolder, { recursive: true });
    console.log('Deleted the "SESSION" folder.');
  } catch (err) {
    console.error('Error deleting the "SESSION" folder:', err);
  }
}

app.get('/', async (req, res) => {
  res.sendFile(path.join(__dirname, 'pair.html'));
});

app.get('/pair', async (req, res) => {
  let phone = req.query.phone;

  if (!phone) return res.json({ error: 'Please Provide Phone Number' });

  try {
    const code = await startnigg(phone);
    res.json({ code: code });
  } catch (error) {
    console.error('Error in WhatsApp authentication:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

async function startnigg(phone) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!fs.existsSync(sessionFolder)) {
        fs.mkdirSync(sessionFolder);
      }

      const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

      const negga = Baileys.makeWASocket({
        printQRInTerminal: false,
        logger: pino({
          level: 'silent',
        }),
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        auth: state,
      });

      if (!negga.authState.creds.registered) {
        let phoneNumber = phone ? phone.replace(/[^0-9]/g, '') : '';
        if (phoneNumber.length < 11) {
          return reject(new Error('Please Enter Your Number With Country Code !!'));
        }
        setTimeout(async () => {
          try {
            let code = await negga.requestPairingCode(phoneNumber);
            console.log(`Your Pairing Code : ${code}`)
            resolve(code);
          } catch (requestPairingCodeError) {
            const errorMessage = 'Error requesting pairing code from WhatsApp';
            console.error(errorMessage, requestPairingCodeError);
            return reject(new Error(errorMessage));
          }
        }, 2000);
      }

      negga.ev.on('creds.update', saveCreds);

      negga.ev.on('connection.update', async update => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
          await delay(10000);

          const credsFile = `${sessionFolder}/creds.json`;
          const credsContent = fs.readFileSync(credsFile);
          const base64Content = Buffer.from(credsContent).toString('base64');
          const sessi = 'Testnet~' + base64Content;
          console.log(sessi);
          await delay(2000);
          let josh = await negga.sendMessage(negga.user.id, { text: sessi });
          await delay(2000);
          await negga.sendMessage(
            negga.user.id,
            {
              text: 'Hello there! 👋 \n\n Its Josh',
            },
            { quoted: josh }
          );

          console.log('Connected to WhatsApp');

          try {
            deleteSessionFolder();
          } catch (error) {
            console.error('Error deleting session folder:', error);
          }

          process.send('reset');
        }

        if (connection === 'close') {
          let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
          if (reason === DisconnectReason.connectionClosed) {
            console.log('[Connection closed, reconnecting....!]');
            process.send('reset');
          } else if (reason === DisconnectReason.connectionLost) {
            console.log('[Connection Lost from Server, reconnecting....!]');
            process.send('reset');
          } else if (reason === DisconnectReason.loggedOut) {
            clearState();
            console.log('[Device Logged Out, Please Try to Login Again....!]');
            clearState();
            process.send('reset');
          } else if (reason === DisconnectReason.restartRequired) {
            console.log('[Server Restarting....!]');
            startnigg();
          } else if (reason === DisconnectReason.timedOut) {
            console.log('[Connection Timed Out, Trying to Reconnect....!]');
            process.send('reset');
          } else if (reason === DisconnectReason.badSession) {
            console.log('[BadSession exists, Trying to Reconnect....!]');
            clearState();
            process.send('reset');
          } else if (reason === DisconnectReason.connectionReplaced) {
            console.log('[Connection Replaced, Trying to Reconnect....!]');
            process.send('reset');
          } else {
            console.log('[Server Disconnected: Maybe Your WhatsApp Account got Fucked....!]');
            process.send('reset');
          }
        }
      });

      negga.ev.on('messages.upsert', () => {});
    } catch (error) {
      console.error('An Error Occurred:', error);
      throw new Error('An Error Occurred');
    }
  });
}

app.listen(PORT, () => {
  console.log('Running on PORT:${PORT}');
});