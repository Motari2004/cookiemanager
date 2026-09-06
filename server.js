const express = require('express');
const path = require('path');
const { chromium } = require('playwright');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Logger function
function logMessage(message, type = 'info') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${type.toUpperCase()}] ${message}`);
}

class InstagramService {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.cookiePath = path.join(__dirname, 'cookie.json');
        this.isLoggedIn = false;
        this.isInitialized = false;
    }

    async findExistingChrome() {
        const possiblePaths = [
            'C:\\Users\\PC\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
            'C:\\Users\\PC\\AppData\\Local\\ms-playwright\\chromium-1200\\chrome-win64\\chrome.exe',
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        ];

        for (const chromePath of possiblePaths) {
            if (fs.existsSync(chromePath)) {
                logMessage(`✅ Found Chrome at: ${chromePath}`, 'success');
                return chromePath;
            }
        }
        return null;
    }

    async initialize(headless = false) {
        try {
            logMessage('🚀 Launching Chrome browser...');
            
            const chromePath = await this.findExistingChrome();
            
            let launchOptions = {
                headless: headless,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--window-size=1280,720',
                    '--start-maximized',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--disable-site-isolation-trials',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                ]
            };

            if (chromePath) {
                logMessage(`📌 Using Chrome at: ${chromePath}`, 'info');
                try {
                    this.browser = await chromium.launch({
                        ...launchOptions,
                        executablePath: chromePath
                    });
                } catch (e) {
                    logMessage(`⚠️ Failed to launch with executable path, trying default...`, 'warning');
                    this.browser = await chromium.launch(launchOptions);
                }
            } else {
                logMessage('⚠️ No Chrome found, using default Playwright Chromium...', 'warning');
                this.browser = await chromium.launch(launchOptions);
            }

            this.context = await this.browser.newContext({
                viewport: { width: 1280, height: 720 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });

            this.page = await this.context.newPage();
            
            await this.page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false,
                });
                window.chrome = { runtime: {} };
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5],
                });
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en'],
                });
            });

            this.isInitialized = true;
            logMessage('✅ Browser opened successfully!', 'success');
            logMessage('📌 Watch the browser window to see what happens');
            
            return this.page;
        } catch (error) {
            logMessage(`❌ Failed to initialize: ${error.message}`, 'error');
            this.isInitialized = false;
            
            if (error.message.includes('Executable doesn\'t exist')) {
                logMessage('\n💡 To fix this issue, run:', 'info');
                logMessage('   npx playwright install chromium', 'info');
            }
            
            throw error;
        }
    }

    async navigateToLogin() {
        try {
            logMessage('🌐 Navigating to Instagram login page...');
            
            // Use 'domcontentloaded' instead of 'networkidle' to avoid timeout
            await this.page.goto('https://www.instagram.com/accounts/login/', {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            
            logMessage('✅ Page loaded!', 'success');
            
            // Wait for the login form to appear
            logMessage('⏳ Waiting for login form...');
            
            // Try multiple selectors for the username field
            const usernameSelectors = [
                'input[name="username"]',
                'input[type="text"]',
                'input[placeholder*="username" i]',
                'input[placeholder*="phone" i]',
                'input[placeholder*="email" i]'
            ];
            
            let found = false;
            for (const selector of usernameSelectors) {
                try {
                    await this.page.waitForSelector(selector, { 
                        timeout: 5000,
                        state: 'visible'
                    });
                    logMessage(`✅ Login form found with selector: ${selector}`, 'success');
                    found = true;
                    break;
                } catch (e) {
                    continue;
                }
            }
            
            if (!found) {
                // Try to find any input on the page
                try {
                    await this.page.waitForSelector('input', { 
                        timeout: 5000,
                        state: 'visible'
                    });
                    logMessage('✅ Found input fields on page', 'success');
                    found = true;
                } catch (e) {
                    logMessage('❌ Could not find login form', 'error');
                }
            }
            
            // Additional wait for page to stabilize
            await this.page.waitForTimeout(2000);
            
            // Take screenshot
            await this.page.screenshot({ path: 'login_page_loaded.png' });
            logMessage('📸 Screenshot saved: login_page_loaded.png');
            
            const currentUrl = this.page.url();
            logMessage(`📍 Current URL: ${currentUrl}`);
            
            return found;
        } catch (error) {
            logMessage(`❌ Navigation error: ${error.message}`, 'error');
            
            // Take error screenshot
            try {
                await this.page.screenshot({ path: 'navigation_error.png' });
                logMessage('📸 Error screenshot saved: navigation_error.png');
            } catch (e) {}
            
            return false;
        }
    }

    async waitForLoginForm() {
        try {
            logMessage('⏳ Waiting for login form to be fully loaded...');
            
            // Try multiple selectors
            const selectors = [
                'input[name="username"]',
                'input[type="text"]',
                'input[placeholder*="username" i]',
                'form input'
            ];
            
            for (const selector of selectors) {
                try {
                    await this.page.waitForSelector(selector, { 
                        timeout: 5000,
                        state: 'visible'
                    });
                    logMessage(`✅ Login form ready with: ${selector}`, 'success');
                    return true;
                } catch (e) {
                    continue;
                }
            }
            
            logMessage('⚠️ Login form not found with standard selectors', 'warning');
            return false;
        } catch (error) {
            logMessage(`⚠️ Login form not found: ${error.message}`, 'warning');
            return false;
        }
    }

    async findUsernameField() {
        try {
            logMessage('🔍 Looking for username field...');
            
            // Try getByRole first
            try {
                const usernameField = await this.page.getByRole('textbox', { 
                    name: 'Mobile number, username or email' 
                });
                await usernameField.waitFor({ state: 'visible', timeout: 3000 });
                logMessage('✅ Found username field with getByRole!', 'success');
                return usernameField;
            } catch (e) {}
            
            // Try by placeholder
            try {
                const field = await this.page.locator('input[placeholder*="username" i]').first();
                if (await field.isVisible()) {
                    logMessage('✅ Found username field by placeholder', 'success');
                    return field;
                }
            } catch (e) {}
            
            // Try by name
            try {
                const field = await this.page.locator('input[name="username"]').first();
                if (await field.isVisible()) {
                    logMessage('✅ Found username field by name attribute', 'success');
                    return field;
                }
            } catch (e) {}
            
            // Try by type
            try {
                const field = await this.page.locator('input[type="text"]').first();
                if (await field.isVisible()) {
                    logMessage('✅ Found username field by type', 'success');
                    return field;
                }
            } catch (e) {}
            
            throw new Error('Could not find username field');
        } catch (error) {
            logMessage(`❌ ${error.message}`, 'error');
            throw error;
        }
    }

    async findPasswordField() {
        try {
            logMessage('🔍 Looking for password field...');
            
            // Try getByRole first
            try {
                const passwordField = await this.page.getByRole('textbox', { 
                    name: 'Password' 
                });
                await passwordField.waitFor({ state: 'visible', timeout: 3000 });
                logMessage('✅ Found password field with getByRole!', 'success');
                return passwordField;
            } catch (e) {}
            
            // Try by type
            try {
                const field = await this.page.locator('input[type="password"]').first();
                if (await field.isVisible()) {
                    logMessage('✅ Found password field by type', 'success');
                    return field;
                }
            } catch (e) {}
            
            // Try by name
            try {
                const field = await this.page.locator('input[name="password"]').first();
                if (await field.isVisible()) {
                    logMessage('✅ Found password field by name attribute', 'success');
                    return field;
                }
            } catch (e) {}
            
            throw new Error('Could not find password field');
        } catch (error) {
            logMessage(`❌ ${error.message}`, 'error');
            throw error;
        }
    }

    async checkForWhatsAppVerification() {
        try {
            logMessage('🔍 Checking for WhatsApp verification request...');
            
            const verificationIndicators = [
                'Check your WhatsApp messages',
                'Enter the code we sent to your WhatsApp',
                'WhatsApp',
                'verification code',
                'code sent to your WhatsApp'
            ];
            
            const pageContent = await this.page.content();
            
            for (const indicator of verificationIndicators) {
                if (pageContent.includes(indicator)) {
                    logMessage(`⚠️ WhatsApp verification detected!`, 'warning');
                    logMessage(`📱 Instagram sent a code to your WhatsApp`, 'info');
                    logMessage(`✍️ Please enter the verification code in the browser window`, 'info');
                    return true;
                }
            }
            
            try {
                const verificationInput = await this.page.locator('input[name="email"]').first();
                if (await verificationInput.isVisible()) {
                    const placeholder = await verificationInput.getAttribute('placeholder');
                    if (placeholder && placeholder.toLowerCase().includes('code')) {
                        logMessage('⚠️ Verification code input detected!', 'warning');
                        logMessage('✍️ Please enter the verification code from WhatsApp', 'info');
                        return true;
                    }
                }
            } catch (e) {}
            
            const currentUrl = this.page.url();
            if (currentUrl.includes('codeentry') || 
                currentUrl.includes('verify') || 
                currentUrl.includes('challenge')) {
                logMessage('⚠️ Verification page detected!', 'warning');
                return true;
            }
            
            return false;
        } catch (error) {
            logMessage(`Error checking for WhatsApp verification: ${error.message}`, 'error');
            return false;
        }
    }

    async waitForVerification(maxWaitSeconds = 120) {
        logMessage(`⏳ Waiting for verification to be completed (max ${maxWaitSeconds} seconds)...`, 'info');
        logMessage('📱 Check your WhatsApp for the verification code', 'info');
        logMessage('✍️ Enter the code in the browser window', 'info');
        
        let verified = false;
        let waited = 0;
        
        while (waited < maxWaitSeconds) {
            await this.page.waitForTimeout(3000);
            waited += 3;
            
            const currentUrl = this.page.url();
            
            const isLoggedIn = await this.checkLoginSuccess();
            if (isLoggedIn) {
                logMessage('✅ Verification successful! Logged in!', 'success');
                verified = true;
                break;
            }
            
            const stillVerifying = await this.checkForWhatsAppVerification();
            if (!stillVerifying && !currentUrl.includes('codeentry') && !currentUrl.includes('verify')) {
                const isLoggedIn2 = await this.checkLoginSuccess();
                if (isLoggedIn2) {
                    logMessage('✅ Verification successful! Logged in!', 'success');
                    verified = true;
                    break;
                }
            }
            
            if (waited % 15 === 0) {
                logMessage(`⏳ Still waiting for verification code... (${waited}/${maxWaitSeconds}s)`, 'info');
            }
        }
        
        if (!verified) {
            logMessage('⚠️ Verification not completed within time limit', 'warning');
            return false;
        }
        
        return true;
    }

    async clickRecaptcha() {
        try {
            logMessage('🔍 Looking for reCAPTCHA checkbox...');
            
            await this.page.waitForTimeout(2000);
            
            const frames = this.page.frames();
            let recaptchaClicked = false;
            
            for (const frame of frames) {
                try {
                    const checkbox = await frame.$('.recaptcha-checkbox-border');
                    if (checkbox) {
                        logMessage('✅ Found reCAPTCHA checkbox in iframe!', 'success');
                        await checkbox.click();
                        logMessage('🖱️ Clicked reCAPTCHA checkbox!', 'success');
                        recaptchaClicked = true;
                        break;
                    }
                } catch (e) {}
            }
            
            if (!recaptchaClicked) {
                try {
                    const checkbox = await this.page.$('.recaptcha-checkbox-border');
                    if (checkbox) {
                        logMessage('✅ Found reCAPTCHA checkbox on main page!', 'success');
                        await checkbox.click();
                        logMessage('🖱️ Clicked reCAPTCHA checkbox!', 'success');
                        recaptchaClicked = true;
                    }
                } catch (e) {}
            }
            
            if (!recaptchaClicked) {
                const altSelectors = [
                    '#recaptcha-anchor',
                    '.recaptcha-checkbox',
                    'iframe[src*="recaptcha"]',
                    'div.recaptcha-checkbox'
                ];
                
                for (const selector of altSelectors) {
                    try {
                        const element = await this.page.$(selector);
                        if (element) {
                            logMessage(`✅ Found reCAPTCHA with selector: ${selector}`, 'success');
                            await element.click();
                            logMessage('🖱️ Clicked reCAPTCHA!', 'success');
                            recaptchaClicked = true;
                            break;
                        }
                    } catch (e) {}
                }
            }
            
            if (recaptchaClicked) {
                logMessage('⏳ Waiting for reCAPTCHA verification...', 'info');
                await this.page.waitForTimeout(3000);
                
                const currentUrl = this.page.url();
                if (currentUrl.includes('recaptcha')) {
                    logMessage('⚠️ Image challenge detected! Please complete it manually.', 'warning');
                    
                    let challengeSolved = false;
                    for (let i = 0; i < 12; i++) {
                        await this.page.waitForTimeout(5000);
                        const newUrl = this.page.url();
                        if (!newUrl.includes('recaptcha')) {
                            challengeSolved = true;
                            logMessage('✅ Image challenge completed!', 'success');
                            break;
                        }
                        logMessage(`⏳ Waiting for image challenge... (${i+1}/12)`, 'info');
                    }
                    if (!challengeSolved) {
                        logMessage('⚠️ Image challenge not completed.', 'warning');
                    }
                }
                
                return true;
            } else {
                logMessage('⚠️ Could not find reCAPTCHA checkbox. Please click it manually.', 'warning');
                return false;
            }
            
        } catch (error) {
            logMessage(`Error clicking reCAPTCHA: ${error.message}`, 'error');
            return false;
        }
    }

    async login(username, password) {
        if (!this.isInitialized || !this.page) {
            logMessage('❌ Browser not initialized!', 'error');
            return { 
                success: false, 
                message: 'Browser not initialized. Please click "Initialize Browser" first.' 
            };
        }

        try {
            // Navigate to login page with better handling
            const navigated = await this.navigateToLogin();
            if (!navigated) {
                // Try one more time with different settings
                logMessage('🔄 Retrying navigation...', 'info');
                await this.page.goto('https://www.instagram.com/accounts/login/', {
                    waitUntil: 'commit',
                    timeout: 20000
                });
                await this.page.waitForTimeout(3000);
            }

            // Wait for login form
            const formReady = await this.waitForLoginForm();
            if (!formReady) {
                // Try to find any input as fallback
                try {
                    await this.page.waitForSelector('input', { timeout: 5000 });
                    logMessage('✅ Found inputs on page, proceeding...', 'success');
                } catch (e) {
                    throw new Error('Login form not loaded properly');
                }
            }

            await this.page.screenshot({ path: 'step2_form_ready.png' });
            logMessage('📸 Screenshot saved: step2_form_ready.png');

            const usernameField = await this.findUsernameField();
            const passwordField = await this.findPasswordField();

            logMessage('✍️ Entering username...');
            await usernameField.click({ clickCount: 3 });
            await usernameField.fill('');
            await usernameField.fill(username);
            await this.page.waitForTimeout(500);

            logMessage('✍️ Entering password...');
            await passwordField.click({ clickCount: 3 });
            await passwordField.fill('');
            await passwordField.fill(password);
            await this.page.waitForTimeout(500);

            await this.page.screenshot({ path: 'step3_filled_form.png' });
            logMessage('📸 Screenshot saved: step3_filled_form.png');

            logMessage('🖱️ Looking for login button...');
            
            let submitButton = null;
            
            try {
                submitButton = await this.page.getByRole('button', { name: 'Log in' });
                if (await submitButton.isVisible()) {
                    logMessage('✅ Found login button by role!', 'success');
                }
            } catch (e) {
                const submitSelectors = [
                    'button[type="submit"]',
                    'button:has-text("Log in")',
                    'button:has-text("Sign in")',
                    'div[role="button"]:has-text("Log in")'
                ];

                for (const selector of submitSelectors) {
                    try {
                        const button = await this.page.$(selector);
                        if (button) {
                            submitButton = button;
                            logMessage(`✅ Found submit button with: ${selector}`);
                            break;
                        }
                    } catch (err) {
                        continue;
                    }
                }
            }

            if (submitButton) {
                await submitButton.click();
                logMessage('✅ Submit button clicked');
            } else {
                logMessage('ℹ️ No submit button found, pressing Enter...');
                await this.page.keyboard.press('Enter');
            }

            logMessage('⏳ Waiting for login to complete...');
            await this.page.waitForTimeout(5000);

            await this.page.screenshot({ path: 'step4_after_submit.png' });
            logMessage('📸 Screenshot saved: step4_after_submit.png');

            const finalUrl = this.page.url();
            logMessage(`📍 Final URL: ${finalUrl}`);

            // Check for WhatsApp verification
            if (await this.checkForWhatsAppVerification()) {
                logMessage('⚠️⚠️⚠️ WHATSAPP VERIFICATION REQUIRED! ⚠️⚠️⚠️', 'error');
                logMessage('📱 Instagram sent a verification code to your WhatsApp', 'info');
                logMessage('🔐 Please enter the verification code in the browser window', 'info');
                logMessage('⏳ You have 120 seconds to complete this...', 'info');
                
                const verified = await this.waitForVerification(120);
                
                if (verified) {
                    logMessage('✅ Verification completed! Logging in...', 'success');
                    
                    const success = await this.checkLoginSuccess();
                    if (success) {
                        logMessage('✅ LOGIN SUCCESSFUL!', 'success');
                        await this.saveCookies();
                        this.isLoggedIn = true;
                        return { 
                            success: true, 
                            message: 'Login successful after WhatsApp verification!' 
                        };
                    } else {
                        await this.page.waitForTimeout(3000);
                        const success2 = await this.checkLoginSuccess();
                        if (success2) {
                            logMessage('✅ LOGIN SUCCESSFUL!', 'success');
                            await this.saveCookies();
                            this.isLoggedIn = true;
                            return { 
                                success: true, 
                                message: 'Login successful after WhatsApp verification!' 
                            };
                        }
                        return { 
                            success: false, 
                            message: 'Verification code entered but login failed. Please try again.' 
                        };
                    }
                } else {
                    return { 
                        success: false, 
                        message: 'Verification timeout. Please try again.' 
                    };
                }
            }

            // Check for reCAPTCHA
            if (finalUrl.includes('recaptcha') || finalUrl.includes('challenge')) {
                logMessage('⚠️⚠️⚠️ reCAPTCHA CHALLENGE DETECTED!', 'error');
                logMessage('🤖 Attempting to automatically click reCAPTCHA...', 'info');
                
                const clicked = await this.clickRecaptcha();
                
                if (clicked) {
                    logMessage('✅ reCAPTCHA checkbox clicked automatically!', 'success');
                    await this.page.waitForTimeout(5000);
                    
                    if (await this.checkForWhatsAppVerification()) {
                        logMessage('⚠️ WhatsApp verification requested after reCAPTCHA!', 'warning');
                        const verified = await this.waitForVerification(120);
                        if (verified) {
                            const success = await this.checkLoginSuccess();
                            if (success) {
                                logMessage('✅ LOGIN SUCCESSFUL!', 'success');
                                await this.saveCookies();
                                this.isLoggedIn = true;
                                return { 
                                    success: true, 
                                    message: 'Login successful after reCAPTCHA and verification!' 
                                };
                            }
                        }
                    }
                    
                    const success = await this.checkLoginSuccess();
                    if (success) {
                        logMessage('✅ LOGIN SUCCESSFUL after reCAPTCHA!', 'success');
                        await this.saveCookies();
                        this.isLoggedIn = true;
                        return { 
                            success: true, 
                            message: 'Login successful! reCAPTCHA was automatically handled.' 
                        };
                    }
                }
            }

            const isLoggedIn = await this.checkLoginSuccess();
            
            if (isLoggedIn) {
                logMessage('✅ LOGIN SUCCESSFUL!', 'success');
                await this.saveCookies();
                this.isLoggedIn = true;
                return { success: true, message: 'Login successful! Check the browser window.' };
            } else {
                const errorSelectors = [
                    'p:has-text("Sorry")',
                    'p:has-text("incorrect")',
                    'div[role="alert"]',
                    '[data-testid="login-error"]'
                ];

                let errorMsg = 'Login failed. Check the browser window for details.';
                for (const selector of errorSelectors) {
                    try {
                        const errorEl = await this.page.$(selector);
                        if (errorEl) {
                            errorMsg = await this.page.textContent(selector) || errorMsg;
                            break;
                        }
                    } catch (e) {}
                }

                logMessage(`❌ ${errorMsg}`, 'error');
                return { success: false, message: errorMsg };
            }

        } catch (error) {
            logMessage(`❌ Login error: ${error.message}`, 'error');
            try {
                if (this.page) {
                    await this.page.screenshot({ path: 'error_screenshot.png' });
                    logMessage('📸 Error screenshot saved: error_screenshot.png');
                }
            } catch (e) {}
            return { success: false, message: `Error: ${error.message}` };
        }
    }

    async checkLoginSuccess() {
        try {
            if (!this.page) return false;
            
            const url = this.page.url();
            if (url.includes('instagram.com/direct/') || 
                url.includes('instagram.com/accounts/edit/') ||
                url.includes('instagram.com/explore/')) {
                return true;
            }

            const indicators = [
                'a[href="/accounts/edit/"]',
                'svg[aria-label="Home"]',
                'nav[role="navigation"]',
                '[data-testid="user-avatar"]'
            ];

            for (const selector of indicators) {
                try {
                    const element = await this.page.$(selector);
                    if (element) return true;
                } catch (e) {}
            }

            return false;
        } catch (error) {
            return false;
        }
    }

    async saveCookies() {
        try {
            if (!this.context) return;
            const cookies = await this.context.cookies();
            fs.writeFileSync(this.cookiePath, JSON.stringify(cookies, null, 2));
            logMessage(`🍪 Cookies saved to ${this.cookiePath}`);
            return cookies;
        } catch (error) {
            logMessage(`Error saving cookies: ${error.message}`, 'error');
            throw error;
        }
    }

    async getStatus() {
        try {
            const url = this.page ? await this.page.url() : 'Not initialized';
            return {
                isLoggedIn: this.isLoggedIn,
                url: url,
                hasCookies: fs.existsSync(this.cookiePath),
                browserOpen: this.browser !== null,
                isInitialized: this.isInitialized
            };
        } catch (error) {
            return {
                isLoggedIn: false,
                url: 'Error',
                hasCookies: false,
                browserOpen: false,
                isInitialized: false
            };
        }
    }

    async close() {
        try {
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
                this.page = null;
                this.context = null;
                this.isLoggedIn = false;
                this.isInitialized = false;
                logMessage('Browser closed');
            }
        } catch (error) {
            logMessage(`Error closing browser: ${error.message}`, 'error');
        }
    }
}

// Initialize service
const instagramService = new InstagramService();

// API Routes
app.post('/api/initialize', async (req, res) => {
    try {
        const { headless = false } = req.body;
        await instagramService.initialize(headless);
        const status = await instagramService.getStatus();
        res.json({ 
            success: true, 
            message: 'Browser initialized successfully!',
            status: status
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password required'
            });
        }

        const result = await instagramService.login(username, password);
        const status = await instagramService.getStatus();
        
        res.json({
            success: result.success,
            message: result.message,
            status: status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

app.get('/api/status', async (req, res) => {
    try {
        const status = await instagramService.getStatus();
        res.json({
            success: true,
            status: status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

app.post('/api/close', async (req, res) => {
    try {
        await instagramService.close();
        res.json({
            success: true,
            message: 'Browser closed successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Serve main HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`📱 Open this URL in your browser`);
    console.log(`⚠️  IMPORTANT: Make sure "Headless" checkbox is UNCHECKED`);
    console.log(`👁️  Watch the Playwright browser window that opens!`);
    console.log(`\n📋 INSTRUCTIONS:`);
    console.log(`1. Click "Initialize Browser" first`);
    console.log(`2. Enter your credentials and click Login`);
    console.log(`3. Watch the browser window for results`);
    console.log(`4. If WhatsApp verification appears, enter the code in the browser`);
    console.log(`\n🔍 The script will detect WhatsApp verification requests`);
    console.log(`📌 It will wait for you to enter the verification code\n`);
});