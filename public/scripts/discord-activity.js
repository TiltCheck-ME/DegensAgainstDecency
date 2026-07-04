/**
 * Discord Activity - Frontend Script
 * Handles Discord Activity SDK initialization and authentication flow.
 */

// Global access to SDK once loaded via script tag
const { DiscordSDK } = window.discord;

async function initDiscordActivity() {
  const statusElement = document.getElementById('status');
  
  statusElement.textContent = 'Connecting to Discord...';

  try {
    // 0. Fetch Client ID
    const configResponse = await fetch('/api/config/discord-client-id');
    const { clientId } = await configResponse.json();
    
    if (!clientId || clientId === 'your_discord_client_id_here') {
      throw new Error('Discord Client ID not configured on server.');
    }

    const CLIENT_ID = clientId;

    // 1. Initialize SDK
    const discordSdk = new DiscordSDK(CLIENT_ID);
    await discordSdk.ready();
    
    statusElement.textContent = 'Authenticating...';

    // 2. Authorize with Discord
    const { code } = await discordSdk.commands.authorize({
      client_id: CLIENT_ID,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: [
        'identify',
        'guilds',
        'rpc.activities.write',
        // 'rpc.voice.read' // Optional for voice channel info
      ],
    });

    statusElement.textContent = 'Completing authentication...';

    // 3. Exchange code for access token via our backend
    const response = await fetch('/api/discord-activity/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      throw new Error('Failed to exchange authorization code');
    }

    const { access_token } = await response.json();

    // 4. Authenticate the SDK with the access token
    const auth = await discordSdk.commands.authenticate({
      access_token,
    });

    if (!auth) {
      throw new Error('Failed to authenticate SDK');
    }

    // 5. Store activity context
    sessionStorage.setItem('discord_activity_enabled', 'true');
    sessionStorage.setItem('discord_user_id', auth.user.id);
    sessionStorage.setItem('discord_user_name', auth.user.username);
    sessionStorage.setItem('discord_user_avatar', auth.user.avatar);
    
    // Notify the user
    statusElement.textContent = `Welcome, ${auth.user.username}! Redirecting to Arena...`;

    // 6. Redirect to the arena
    // We add a query parameter to let the arena know it's in activity mode
    window.location.href = '/arena?mode=activity';

  } catch (error) {
    console.error('Error initializing Discord Activity:', error);
    statusElement.innerHTML = `<span style="color: #ff4747;">Error: ${error.message}</span><br><br><button onclick="window.location.reload()" style="background: #5865F2; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">Retry</button>`;
  }
}

// Global error handler
window.onerror = function(msg, url, line) {
  const statusElement = document.getElementById('status');
  if (statusElement) {
    statusElement.innerHTML = `<span style="color: #ff4747;">Critical Error: ${msg}</span>`;
  }
  return false;
};

// Start initialization once DOM is ready
if (document.readyState === 'complete') {
  initDiscordActivity();
} else {
  window.addEventListener('load', initDiscordActivity);
}
