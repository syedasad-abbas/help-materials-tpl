const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const app = express();
app.use(express.json());

// ==================== CONFIG ====================
const ACCOUNT_SID     = '82d07872-8621-4c6b-a72c-681876637789';
const APPLICATION_SID = 'f62d62be-16d8-4f85-afa1-e1689bc8c014';
const API_KEY         = '1ac540d4-7f45-4716-b4f3-0eda425b3783';

const FROM_NUMBER  = '999';
const TO_NUMBER    = '1011';     // Customer
const SALES_NUMBER = '1001';     // Sales agent
const TRUNK_NAME   = 'voip-provider';

const JAMBONZ_API_URL = `http://10.43.252.59:3000/v1/Accounts/${ACCOUNT_SID}/Calls`;
const LOCAL_IP        = '192.168.1.25';
const WEBHOOK_PORT    = 5000;
const WEBHOOK_HOST    = `http://${LOCAL_IP}:${WEBHOOK_PORT}`;

const AUDIO_DIR = '/home/asad/audio';
const LOG_FILE  = '/home/asad/webhook_play.log';

// ==================== LOGGING ====================
function logMessage(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(msg);
  fs.appendFileSync(LOG_FILE, line);
}

// ==================== SERVE AUDIO ====================
app.use('/audio', express.static(AUDIO_DIR));
logMessage(`Serving audio from: ${AUDIO_DIR}`);
logMessage(`Audio URL base: ${WEBHOOK_HOST}/audio/<file>.wav`);

// ==================== OUTBOUND ====================
app.post('/outbound', (req, res) => {
  const callId = req.body.call_id || req.body.callId;
  logMessage(`[OUTBOUND] Call ${callId}`);

  const introFile = 'relaxing-guitar-loop-v5-245859.wav';
  const introPath = path.join(AUDIO_DIR, introFile);

  if (fs.existsSync(introPath)) {
    res.json([{
      verb: 'play',
      url: `${WEBHOOK_HOST}/audio/${introFile}`,
      actionHook: `${WEBHOOK_HOST}/after-intro`
    }]);
    logMessage(`Playing intro: ${introFile}`);
  } else {
    logMessage(`Intro missing → skip`);
    res.json([{ verb: 'redirect', actionHook: `${WEBHOOK_HOST}/after-intro` }]);
  }
});

// ==================== MENU ====================
app.post('/after-intro', (req, res) => {
  const callId = req.body.call_id || req.body.callId;
  logMessage(`[MENU] Call ${callId}`);

  const menuFile = 'menu-prompt.wav';
  const menuPath = path.join(AUDIO_DIR, menuFile);

  if (!fs.existsSync(menuPath)) {
    return res.json([
      { verb: 'say', text: 'Press 1 for sales.' },
      {
        verb: 'gather',
        actionHook: `${WEBHOOK_HOST}/collect`,
        input: ['digits'],
        numDigits: 1,
        timeout: 10
      }
    ]);
  }

  res.json([{
    verb: 'gather',
    actionHook: `${WEBHOOK_HOST}/collect`,
    input: ['digits'],
    bargein: true,
    numDigits: 1,
    timeout: 10,
    play: { url: `${WEBHOOK_HOST}/audio/${menuFile}` }
  }]);
  logMessage(`Playing menu: ${menuFile}`);
});

// ==================== COLLECT → REDIRECT TO SALES ====================
app.post('/collect', (req, res) => {
  const callId = req.body.call_id || req.body.callId;
  const dtmf   = (req.body.digits || req.body.dtmf || '').trim();

  logMessage(`[DTMF] Call ${callId} | Key: "${dtmf}"`);

  if (dtmf === '1') {
    logMessage(`TRANSFER TO SALES: ${SALES_NUMBER}`);
    res.json([
      { verb: 'redirect', actionHook: `${WEBHOOK_HOST}/connectToSales` }
    ]);
  } else {
    res.json([
      { verb: 'play', url: `${WEBHOOK_HOST}/audio/invalid.wav` },
      { verb: 'hangup' }
    ]);
  }
});

// ==================== CONNECT TO SALES (NEW WEBHOOK) ====================
app.post('/connectToSales', (req, res) => {
  logMessage(`[SALES] Connecting to ${SALES_NUMBER} via ${TRUNK_NAME}`);

  res.json([
    {
      verb: 'dial',
      callerId: FROM_NUMBER,
      target: [{
        type: 'phone',
        number: SALES_NUMBER,
        trunk: TRUNK_NAME
      }]
    }
  ]);
});

// ==================== CALL STATUS ====================
app.post('/status', (req, res) => {
  logMessage(`[CALL STATUS] ${JSON.stringify(req.body, null, 2)}`);
  res.send('OK');
});

// ==================== START SERVER & CALL ====================
app.listen(WEBHOOK_PORT, async () => {
  logMessage(`Server running: ${WEBHOOK_HOST}`);

  try {
    const resp = await axios.post(
      JAMBONZ_API_URL,
      {
        from: FROM_NUMBER,
        to: { type: 'phone', number: TO_NUMBER, trunk: TRUNK_NAME },
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
    logMessage(`CALL INITIATED → SID: ${resp.data.sid}`);
  } catch (e) {
    logMessage(`CALL FAILED: ${e.message}`);
  }
});

