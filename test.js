import { IgApiClient } from 'instagram-private-api';
import fs from 'fs';
import readline from 'readline';

const ig = new IgApiClient();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function promptUser(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(query, (ans) => { rl.close(); resolve(ans.trim()); }));
}

async function saveSession(username) {
  if (!fs.existsSync('./sessions')) fs.mkdirSync('./sessions');
  const serialized = await ig.state.serialize();
  delete serialized.constants; 
  
  const parsedCookies = JSON.parse(serialized.cookies);
  if (!parsedCookies.cookies || parsedCookies.cookies.length === 0) {
    console.log(`[Warning] Cookies are still empty. Skipping file write.`);
    return false;
  }

  fs.writeFileSync(`./sessions/${username}.json`, JSON.stringify(serialized, null, 2));
  console.log(`[System] Session saved successfully with ${parsedCookies.cookies.length} active cookies.`);
  return true;
}

async function loadSession(username) {
  const sessionPath = `./sessions/${username}.json`;
  if (fs.existsSync(sessionPath)) {
    try {
      const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      await ig.state.deserialize(sessionData);
      const parsedCookies = JSON.parse(sessionData.cookies);
      if (!parsedCookies.cookies || parsedCookies.cookies.length === 0) return false;
      
      console.log(`[System] Active session restored for ${username}.`);
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

// Fixed Mid-Stream Checkpoint Resolver
async function handleMidStreamCheckpoint(error, username) {
  console.log('\n[Checkpoint] Extracting validation state from raw response...');
  
  // Extract challenge payload from mid-stream response body
  if (error.response && error.response.body) {
    const body = error.response.body;
    
    if (body.challenge) {
      ig.state.checkpoint = body.challenge;
    } else if (body.checkpoint_url) {
      // Sometimes it returns a direct checkpoint URL string instead of an object
      ig.state.checkpoint = { url: body.checkpoint_url };
    }
  }

  if (!ig.state.checkpoint) {
    console.log('\n❌ [Critical Error] Could not extract challenge details from the timeline block.');
    console.log('👉 ACTION REQUIRED: Open your real mobile phone app right now. Tap "This Was Me" on the prompt, then rerun this script.');
    return;
  }

  try {
    // Force Instagram to send the choice select menu (Email/SMS)
    const challengeInfo = await ig.challenge.auto(true); 
    console.log(`[System] Challenge initiated: ${challengeInfo.step_name || 'Verification sent'}.`);
    
    const code = await promptUser('Enter the verification security code: ');
    console.log('[System] Submitting verification code...');
    
    await ig.challenge.sendSecurityCode(code);
    console.log('[Success] Checkpoint cleared!');
    
    await delay(3000);
    await saveSession(username);
  } catch (err) {
    console.error('[Error] Challenge handler failed:', err.message);
  }
}

async function runAutomation() {
  const USERNAME = 'hopefreymosingi';
  const PASSWORD = 'therealmaster'; // Add password back locally

  ig.state.generateDevice(USERNAME);
  const isRestored = await loadSession(USERNAME);

  if (!isRestored) {
    console.log('[System] Executing pre-login profile emulation...');
    await ig.simulate.preLoginFlow(); 
    await delay(1500);

    console.log('[System] Authenticating credentials...');
    try {
      await ig.account.login(USERNAME, PASSWORD);
      console.log(`[Success] Login sequence finished.`);
      await saveSession(USERNAME);
    } catch (error) {
      if (error.name === 'IgLoginTwoFactorRequiredError') {
        const info = error.response.body.two_factor_info;
        const method = info.totp_two_factor_on ? 'totp' : 'sms';
        console.log(`[Verification] 2FA needed via ${method.toUpperCase()}.`);
        const verificationCode = await promptUser('Enter your 6-digit 2FA App Code: ');

        await ig.account.twoFactorLogin({
          username: info.username,
          verificationCode,
          twoFactorIdentifier: info.two_factor_identifier,
          verificationMethod: method,
        });
        console.log(`[Success] 2FA Cleared.`);
        await saveSession(USERNAME);
      } else if (error.message.includes('checkpoint_required')) {
        await handleMidStreamCheckpoint(error, USERNAME);
      } else {
        throw error;
      }
    }
  }

  // Target Action Block
  try {
    await delay(2000); 
    console.log('[API Test] Fetching feed items...');
    const userFeed = ig.feed.timeline();
    const items = await userFeed.items();
    console.log(`[API Test] Success! Fetched ${items.length} items.`);
  } catch (error) {
    if (error.message.includes('checkpoint_required')) {
      await handleMidStreamCheckpoint(error, USERNAME);
      
      // Attempt retry after clearance loop completion
      try {
        console.log('[API Test] Retrying timeline fetch...');
        const userFeed = ig.feed.timeline();
        const items = await userFeed.items();
        console.log(`[API Test] Success on retry! Fetched ${items.length} items.`);
      } catch (retryError) {
        console.error('[Error] Retry failed:', retryError.message);
      }
    } else {
      console.error('[Error] Target execution failed:', error.message);
    }
  }
}

runAutomation().catch(console.error);
