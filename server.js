const express = require('express');
const path = require('path');
const { chromium } = require('playwright');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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
        this.loginTimeout = parseInt(process.env.LOGIN_TIMEOUT) || 120;
    }

    async findExistingChrome() {
        // For Render, we'll use the Playwright Chromium
        // Check common paths
        const possiblePaths = [
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            process.env.CHROME_PATH,
            // Windows paths for local testing
            'C:\\Users\\PC\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        ].filter(Boolean);

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
            logMessage('🚀 Launching browser...');
            
            // For Render, we need to use the installed Chromium
            const chromePath = await this.findExistingChrome();
            
            let launchOptions = {
                headless: process.env.NODE_ENV === 'production' ? true : headless,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-gpu',
                    '--disable-software-rasterizer',
                    '--disable-extensions',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--window-size=1280,720'
                ]
            };

            if (chromePath) {
                launchOptions.executablePath = chromePath;
            }

            this.browser = await chromium.launch(launchOptions);

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
            
            return this.page;
        } catch (error) {
            logMessage(`❌ Failed to initialize: ${error.message}`, 'error');
            this.isInitialized = false;
            throw error;
        }
    }

    // ... (keep all other methods the same as your original code)
    // navigateToLogin, waitForLoginForm, findUsernameField, findPasswordField,
    // checkForWhatsAppVerification, waitForVerification, clickRecaptcha,
    // login, checkLoginSuccess, saveCookies, getStatus, close
    // (Copy these methods from your original file)

    async login(username, password) {
        if (!this.isInitialized || !this.page) {
            logMessage('❌ Browser not initialized!', 'error');
            return { 
                success: false, 
                message: 'Browser not initialized. Please click "Initialize Browser" first.' 
            };
        }

        try {
            // Navigate to login page
            const navigated = await this.navigateToLogin();
            if (!navigated) {
                await this.page.goto('https://www.instagram.com/accounts/login/', {
                    waitUntil: 'commit',
                    timeout: 20000
                });
                await this.page.waitForTimeout(3000);
            }

            // Wait for login form
            const formReady = await this.waitForLoginForm();
            if (!formReady) {
                try {
                    await this.page.waitForSelector('input', { timeout: 5000 });
                    logMessage('✅ Found inputs on page, proceeding...', 'success');
                } catch (e) {
                    throw new Error('Login form not loaded properly');
                }
            }

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

            // Check for WhatsApp verification
            if (await this.checkForWhatsAppVerification()) {
                logMessage('⚠️ WhatsApp verification required!', 'warning');
                const verified = await this.waitForVerification(this.loginTimeout);
                
                if (verified) {
                    const success = await this.checkLoginSuccess();
                    if (success) {
                        logMessage('✅ LOGIN SUCCESSFUL!', 'success');
                        await this.saveCookies();
                        this.isLoggedIn = true;
                        return { 
                            success: true, 
                            message: 'Login successful after WhatsApp verification!' 
                        };
                    }
                }
                return { 
                    success: false, 
                    message: 'Verification failed or timeout.' 
                };
            }

            const isLoggedIn = await this.checkLoginSuccess();
            
            if (isLoggedIn) {
                logMessage('✅ LOGIN SUCCESSFUL!', 'success');
                await this.saveCookies();
                this.isLoggedIn = true;
                return { success: true, message: 'Login successful!' };
            } else {
                return { success: false, message: 'Login failed. Check credentials.' };
            }

        } catch (error) {
            logMessage(`❌ Login error: ${error.message}`, 'error');
            return { success: false, message: `Error: ${error.message}` };
        }
    }
}

// Initialize service
const instagramService = new InstagramService();

// API Routes (keep your existing routes)
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
});