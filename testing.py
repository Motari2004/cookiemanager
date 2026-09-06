import os
import time
from instagrapi import Client
from instagrapi.exceptions import ChallengeRequired, TwoFactorRequired, LoginRequired

def prompt_user(message):
    return input(message).strip()

def challenge_code_handler(username, choice):
    """
    Callback hook invoked by instagrapi when Instagram intercepts the connection
    with an inline Email or SMS security challenge code wall.
    """
    print(f"\n[Checkpoint] Instagram sent a verification code via choice mode: {choice}")
    code = prompt_user("Enter the security verification code received: ")
    return code

def run_automation():
    cl = Client()
    
    # 📱 Direct injection mapping fix for the device settings object configuration properties
    cl.device_settings = {
        "app_version": "340.0.0.30.93",      # Modern Instagram Android Build String
        "android_version": 29,               # Android 10
        "android_release": "10.0.0",
        "device_model": "SM-G981B",          # Samsung Galaxy S20 5G
        "manufacturer": "samsung"
    }
    
    USERNAME = "hopefreymosingi"
    PASSWORD = "therealmaster"
    SESSION_FILE = f"./sessions/{USERNAME}.json"
    
    os.makedirs("./sessions", exist_ok=True)
    
    # 1. Custom challenge handler registration
    cl.challenge_code_handler = challenge_code_handler

    # 2. Try loading a previously verified session
    session_loaded = False
    if os.path.exists(SESSION_FILE):
        try:
            print(f"[System] Attempting to restore session for {USERNAME}...")
            cl.load_settings(SESSION_FILE)
            session_loaded = True
        except Exception:
            print("[System] Corrupted session file found. Proceeding to fresh login.")

    # 3. Perform login workflow if no active session could be restored
    try:
        print("[System] Authenticating client profile handshake...")
        cl.login(USERNAME, PASSWORD)
        print(f"[Success] Successfully authenticated as {USERNAME}!")
        
        # Save session immediately upon successful connection
        cl.dump_settings(SESSION_FILE)
        print(f"[System] Operational session settings dumped cleanly to {SESSION_FILE}")
        
    except TwoFactorRequired as e:
        # Handle standard 6-digit TOTP / Authenticator App prompt
        print("\n[Verification] 2FA authentication layer required.")
        two_factor_code = prompt_user("Enter your 6-digit 2FA application code: ")
        
        # Pass the 2FA code directly back to the active login flow instance
        cl.login(USERNAME, PASSWORD, verification_code=two_factor_code)
        print(f"[Success] 2FA cleared! Authenticated as {USERNAME}")
        cl.dump_settings(SESSION_FILE)

    except ChallengeRequired as e:
        # Instagrapi automatically handles routing if the challenge handler is configured
        print(f"[System] Inline security challenge routing handled: {e}")
        cl.dump_settings(SESSION_FILE)
        
    except Exception as e:
        print(f"❌ [Critical Error] Authentication pipeline failed: {str(e)}")
        return

    # 4. Run Target API Verification Call
    try:
        time.sleep(2)
        print("\n[API Test] Fetching recent timeline feed items...")
        
        # Get target numerical user ID and pull items
        user_id = cl.user_id_from_username(USERNAME)
        medias = cl.user_medias(user_id, amount=5)
        
        print(f"[API Test] Success! Downloaded and mapped {len(medias)} feed objects natively.")
        for media in medias:
            print(f" -> Post ID: {media.pk} | Type: {media.media_type} | Likes: {media.like_count}")
            
    except Exception as e:
        print(f"[Error] Failed to execute operational tasks: {str(e)}")

if __name__ == "__main__":
    run_automation()
