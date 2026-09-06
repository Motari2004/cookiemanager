import { IgApiClient } from 'instagram-private-api';
import fs from 'fs';
import readline from 'readline';

const ig = new IgApiClient();

// Helper to pause execution (human simulation delay)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Secure terminal input prompt for 2FA verification codes
function promptUserForCode() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question('Enter the 2FA code sent to your device: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
}

async function saveSession(username) {
  if (!fs.existsSync('./sessions')) {
    fs.mkdirSync('./sessions');
  }
  const serialized = await ig.state.serialize();
  delete serialized.constants; 
  fs.writeFileSync(`./sessions/${username}.json`, JSON.stringify(serialized));
  console.log(`[System] Session saved successfully for ${username}`);
}

async function loadSession(username) {
  const sessionPath = `./sessions/${username}.json`;
  if (fs.existsSync(sessionPath)) {
    const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    await ig.state.deserialize(sessionData);
    console.log(`[System] Existing session restored for ${username}. Bypassing fresh login.`);
    return true;
  }
  return false;
}

async function runAutomation() {
  const USERNAME = 'hopefreymosingi';
  const PASSWORD = 'YOUR_PASSWORD_HERE'; // Load this from process.env locally!

  // 1. Initialize deterministic device signature
  ig.state.generateDevice(USERNAME);

  // 2. Try restoring existing cookies first
  const isRestored = await loadSession(USERNAME);

  if (!isRestored) {
    console.log('[System] No valid session found. Authenticating with credentials...');
    try {
      await ig.account.login(USERNAME, PASSWORD);
      console.log(`[Success] Logged in as ${USERNAME}`);
      await saveSession(USERNAME);
    } catch (error) {
      // 3. Handle 2FA Challenge Checkpoint
      if (error.name === 'IgLoginTwoFactorRequiredError') {
        const info = error.response.body.two_factor_info;
        const method = info.totp_two_factor_on ? 'totp' : 'sms';
        
        console.log(`[Verification] 2FA required via ${method.toUpperCase()}.`);
        const verificationCode = await promptUserForCode();

        const twoFactorResponse = await ig.account.twoFactorLogin({
          username: info.username,
          verificationCode,
          twoFactorIdentifier: info.two_factor_identifier,
          verificationMethod: method,
        });

        console.log(`[Success] 2FA Validated. Logged in as ${twoFactorResponse.logged_in_user.username}`);
        await saveSession(USERNAME);
      } else {
        console.error('[Error] Login sequence failed:', error.message);
        return;
      }
    }
  }

  // 4. Test API call to verify working state
  await delay(2000); // Wait 2 seconds to simulate human timing
  const userFeed = ig.feed.timeline();
  const items = await userFeed.items();
  console.log(`[API Test] Successfully fetched ${items.length} items from timeline feed.`);
}

runAutomation().catch(console.error);
