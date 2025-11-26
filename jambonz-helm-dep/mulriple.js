// Updated webhook.js supporting two independent outbound calls

const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const app = express();
app.use(express.json());

// ====== CONFIGURATION ======
const ACCOUNT_SID = '82d07872-8621-4c6b-a72c-681876637789';
const APPLICATION_SID = 'f62d62be-16d8-4f85-afa1-e1689bc8c014';
const API_KEY = '1ac540d4-7f45-4716-b4f3-0eda425b3783';

const FROM_NUMBER = '999';
const TARGET_NUMBERS = ['1001', '1002', '1011']; // two parallel calls
const TRUNK_NAME = 'voip-provider';

const JAMBONZ_API_URL = `http://10.43.252.59:3000/v1/Accounts/${ACCOUNT_SID}/Calls`;

const LOCAL_IP = '192.168.1.25';
const WEBHOOK_PORT = 5000;
const WEBHOOK_HOST = `http://${LOCAL_IP}:${WEBHOOK_PORT}`;

const AUDIO_DIR = '/home/asad/audio';
const LOG_FILE = '/home/asad/webhook_play.log';

// ====== LOG FUNCTION ======
function logMessage(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(msg);
  fs.appendFileSync(LOG_FILE, line);
}

// ====== SERVE AUDIO FILES ======
app.use('/audio', express.static(AUDIO_DIR));
logMessage(`Serving audio from: ${AUDIO_DIR}`);

// ====== OUTBOUND WEBHOOK (COMMON FOR ALL CALLS) ======
app.post('/outbound', (req, res) => {
  const callId = req.body.call_id || req.body.callId;
  logMessage(`Outbound webhook for call ${callId}`);

  const verbs = [];
  const introFile = 'relaxing-guitar-loop-v5-245859.wav';
  const introPath = path.join(AUDIO_DIR, introFile);

  if (fs.existsSync(introPath)) {
    verbs.push({
      verb: 'play',
      url: `${WEBHOOK_HOST}/audio/${introFile}`,
      actionHook: `${WEBHOOK_HOST}/after-intro`
    });
  }

  res.json(verbs);
});

// ====== AFTER INTRO ======
app.post('/after-intro', (req, res) => {
  const callId = req.body.call_id || req.body.callId;
  logMessage(`after-intro for ${callId}`);

  const menuFile = 'menu-prompt.wav';
  if (!fs.existsSync(path.join(AUDIO_DIR, menuFile))) {
    return res.json([{ verb: 'hangup' }]);
  }

  res.json([
    {
      verb: 'gather',
      actionHook: `${WEBHOOK_HOST}/collect`,
      input: ['digits'],
      bargein: true,
      dtmfBargein: true,
      numDigits: 1,
      finishOnKey: '#',
      timeout: 8,
      play: { url: `${WEBHOOK_HOST}/audio/${menuFile}` }
    }
  ]);
});

// ====== COLLECT DTMF (INDEPENDENT PER CALL) ======
app.post('/collect', (req, res) => {
  const callId = req.body.call_id || req.body.callId;
  const digit = req.body.digits || '';
  logMessage(`collect for ${callId} digit=${digit}`);

  const verbs = [];
  if (digit === '1') verbs.push({ verb: 'play', url: `${WEBHOOK_HOST}/audio/sales.wav` });
  else if (digit === '2') verbs.push({ verb: 'play', url: `${WEBHOOK_HOST}/audio/support.wav` });
  else verbs.push({ verb: 'play', url: `${WEBHOOK_HOST}/audio/invalid.wav` });

  verbs.push({ verb: 'hangup' });
  res.json(verbs);
});

// ===== STATUS HOOK =====
app.post('/status', (req, res) => {
  logMessage(`status update: ${JSON.stringify(req.body)}`);
  res.send('ok');
});

// ===== START SERVER & TRIGGER TWO CALLS =====
app.listen(WEBHOOK_PORT, async () => {
  logMessage(`Webhook running at ${WEBHOOK_HOST}`);
  logMessage(`Audio at ${WEBHOOK_HOST}/audio/`);

  for (const number of TARGET_NUMBERS) {
    try {
      const resCall = await axios.post(
        JAMBONZ_API_URL,
        {
          from: FROM_NUMBER,
          to: { type: 'phone', number, trunk: TRUNK_NAME },
          application_sid: APPLICATION_SID,
          call_hook: { url: `${WEBHOOK_HOST}/outbound` },
          call_status_hook: { url: `${WEBHOOK_HOST}/status` }
        },
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logMessage(`Started independent call to ${number} -> ${JSON.stringify(resCall.data)}`);
    } catch (err) {
      logMessage(`Call to ${number} failed: ${err.message}`);
    }
  }
});

